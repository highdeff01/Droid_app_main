import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationStepReport, OverseerVerdict, SupervisedOperation } from "@shared/overseer";
import type { SupervisorEvent } from "./overseer/supervisor";
import { PresentationDrafts } from "./presentation-drafts";
import { buildPresentation } from "../client/lib/hud-actions";

function makeOp(overrides: Partial<SupervisedOperation> = {}): SupervisedOperation {
  return {
    id: "op1",
    kind: "replay",
    source: "hud",
    goal: "Log in",
    status: "running",
    priority: 0,
    caps: { maxIterations: null, maxDurationMs: null, maxRepeats: null },
    startedAt: 0,
    lastActivityAt: 0,
    iterations: 0,
    retriesUsed: 0,
    ledger: {},
    verdicts: [],
    directive: "continue",
    ...overrides,
  };
}

function report(stepId: string): OperationStepReport {
  return { stepId, name: `Step ${stepId}`, action: "click", x: 0, y: 0 };
}

function verdict(stepId: string, status: OverseerVerdict["status"], extra: Partial<OverseerVerdict> = {}): OverseerVerdict {
  return {
    id: `v_${stepId}`,
    operationId: "op1",
    stepId,
    status,
    accuracyScore: null,
    analysis: "looks right",
    executorVerified: null,
    provider: "none",
    at: 0,
    ...extra,
  };
}

describe("PresentationDrafts", () => {
  let drafts: PresentationDrafts;

  beforeEach(() => {
    drafts = new PresentationDrafts();
  });

  it("builds a draft from verified steps while the operation runs", () => {
    const op = makeOp();
    drafts.handle({ type: "started", op });
    drafts.handle({ type: "step", op, report: report("s1") });
    drafts.handle({
      type: "verdict",
      op,
      report: report("s1"),
      verdict: verdict("s1", "verified", { evidenceImage: "data:image/png;base64,E", accuracyScore: 0.8 }),
    });
    drafts.handle({ type: "step", op, report: report("s2") });
    drafts.handle({ type: "verdict", op, report: report("s2"), verdict: verdict("s2", "missed") });

    const draft = drafts.get(op.id)!;
    expect(draft.draft).toBe(true);
    expect(draft.status).toBe("running");
    expect(draft.slides).toHaveLength(1);
    expect(draft.slides[0]).toMatchObject({ stepId: "s1", screenshotUrl: "data:image/png;base64,E", confidence: 0.8 });
    expect(draft.unverifiedSteps).toBe(1);
    expect(draft.total).toBe(2);
  });

  it("marks the draft finished with the operation's duration once it ends", () => {
    const op = makeOp();
    drafts.handle({ type: "started", op });
    const finished = { ...op, status: "completed" as const, finishedAt: 1000 };
    drafts.handle({ type: "finished", op: finished });

    const draft = drafts.get(op.id)!;
    expect(draft.draft).toBe(false);
    expect(draft.durationMs).toBe(1000);
  });

  it("current() returns the most recently refreshed draft across operations", () => {
    const opA = makeOp({ id: "opA" });
    const opB = makeOp({ id: "opB" });
    drafts.handle({ type: "started", op: opA });
    drafts.handle({ type: "started", op: opB });
    expect(drafts.current()?.runId).toBe("opB");

    drafts.handle({ type: "verdict", op: opA, report: report("s1"), verdict: verdict("s1", "verified") });
    expect(drafts.current()?.runId).toBe("opA");
  });

  it("notifies onRefresh listeners on verdict and finished events", () => {
    const op = makeOp();
    const listener = vi.fn();
    drafts.onRefresh(listener);
    drafts.handle({ type: "started", op });
    drafts.handle({ type: "verdict", op, report: report("s1"), verdict: verdict("s1", "verified") });
    const finished = { ...op, status: "completed" as const, finishedAt: 10 };
    drafts.handle({ type: "finished", op: finished });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("buildPresentation still throws for a run that is still in progress", () => {
    expect(() =>
      buildPresentation({ id: "r1", status: "running", startedAt: 0, completed: 0, total: 1, steps: [], events: [] } as any, []),
    ).toThrow();
  });
});
