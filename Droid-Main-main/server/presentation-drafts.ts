import type { PresentationDraft, PresentationSlide } from "@shared/presentation";
import type { OperationStepReport, OverseerVerdict, SupervisedOperation } from "@shared/overseer";
import type { SupervisorEvent } from "./overseer/supervisor";

export const MAX_DRAFTS = 20;

interface DraftState {
  op: SupervisedOperation;
  reported: Set<string>;
  slides: Map<string, PresentationSlide>;
  updatedAt: number;
  /** Monotonic refresh order; timestamps can tie within one millisecond. */
  revision: number;
}

/** A verdict counts as verified evidence only when the overseer verified it. */
const isVerified = (verdict: OverseerVerdict) => verdict.status === "verified";

function slideFor(report: OperationStepReport, verdict: OverseerVerdict, previous?: PresentationSlide): PresentationSlide {
  const event = { at: verdict.at, phase: "verification", detail: verdict.analysis };
  return {
    stepId: report.stepId,
    name: report.name,
    status: "verified",
    events: [...(previous?.events ?? []), event],
    screenshotUrl: verdict.evidenceImage ?? verdict.beforeImage,
    confidence: verdict.accuracyScore ?? undefined,
  };
}

/**
 * The background presentation pipeline: follows every supervised operation and
 * keeps a draft presentation of its overseer-verified steps (screenshots,
 * timings, outcome) current on each verdict and on finish.
 */
export class PresentationDrafts {
  private readonly drafts = new Map<string, DraftState>();
  private readonly listeners = new Set<(draft: PresentationDraft) => void>();
  private revision = 0;

  constructor(private readonly now: () => number = Date.now) {}

  handle(event: SupervisorEvent) {
    const state = this.state(event.op);
    if (event.type === "step") state.reported.add(event.report.stepId);
    if (event.type === "verdict" && isVerified(event.verdict))
      state.slides.set(event.report.stepId, slideFor(event.report, event.verdict, state.slides.get(event.report.stepId)));
    if (event.type === "verdict" || event.type === "finished" || event.type === "started") this.refresh(state);
  }

  /** Notified with the refreshed draft on each major event. */
  onRefresh(listener: (draft: PresentationDraft) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(operationId: string): PresentationDraft | undefined {
    const state = this.drafts.get(operationId);
    return state && this.render(state);
  }

  /** The most recently refreshed draft — what the HUD Presentation button opens. */
  current(): PresentationDraft | undefined {
    return this.list()[0];
  }

  list(): PresentationDraft[] {
    return [...this.drafts.values()].sort((a, b) => b.revision - a.revision).map((state) => this.render(state));
  }

  private state(op: SupervisedOperation): DraftState {
    let state = this.drafts.get(op.id);
    if (!state) {
      state = { op, reported: new Set(), slides: new Map(), updatedAt: this.now(), revision: ++this.revision };
      this.drafts.set(op.id, state);
      this.prune();
    }
    state.op = op;
    return state;
  }

  private refresh(state: DraftState) {
    state.updatedAt = this.now();
    state.revision = ++this.revision;
    const draft = this.render(state);
    for (const listener of this.listeners) listener(draft);
  }

  private render({ op, reported, slides, updatedAt }: DraftState): PresentationDraft {
    const verified = [...slides.values()];
    return {
      runId: op.id,
      kind: op.kind,
      goal: op.goal,
      status: op.status,
      draft: !op.finishedAt,
      startedAt: op.startedAt,
      updatedAt,
      durationMs: (op.finishedAt ?? updatedAt) - op.startedAt,
      completed: verified.length,
      total: Math.max(reported.size, verified.length),
      unverifiedSteps: [...reported].filter((id) => !slides.has(id)).length,
      error: op.status === "failed" ? op.detail : undefined,
      slides: verified,
    };
  }

  private prune() {
    const finished = [...this.drafts.values()].filter((s) => s.op.finishedAt).sort((a, b) => a.revision - b.revision);
    while (this.drafts.size > MAX_DRAFTS && finished.length) this.drafts.delete(finished.shift()!.op.id);
  }
}
