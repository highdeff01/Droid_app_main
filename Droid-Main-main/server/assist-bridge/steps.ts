import { createHash, randomUUID } from "crypto";
import {
  STEP_STALL_MS,
  type AssistEventType,
  type AssistRequestKind,
  type HandoffOrigin,
  type HandoffRecord,
  type RunScriptResult,
  type ScriptStep,
  type StepRecord,
  type StepUpdatePayload,
  type StepVerdict,
  type TakeoverStepPayload,
} from "../../shared/assist-bridge";
import type { FrameOutcome } from "./frames";

const HISTORY_LIMIT = 100;
const STALL_CHECK_MS = 1000;

/** Asks the main app's own AI for a bounded script from the full takeover context. */
export type TakeoverPlanner = (context: TakeoverStepPayload & { frame: string | null }) => Promise<ScriptStep[]>;

export interface StepCoordinatorDeps {
  readFrame: () => Promise<FrameOutcome>;
  /** Error-bus messages recorded at or after `since` (epoch ms). */
  errorsSince: (since: number) => string[];
  runScript: (steps: ScriptStep[]) => Promise<RunScriptResult>;
  planTakeover: TakeoverPlanner;
  emit: (type: AssistEventType, payload: unknown) => void;
  request: (kind: AssistRequestKind, params: unknown) => Promise<unknown>;
  log: (level: "INFO" | "WARN" | "ERROR", message: string) => void;
  autoTakeover: () => boolean;
  now?: () => number;
  stallMs?: number;
}

interface StepEntry {
  record: StepRecord;
  script?: ScriptStep[];
  startFingerprint: string | null;
}

/** Hash of the live frame, or null in standby. */
async function fingerprint(readFrame: () => Promise<FrameOutcome>): Promise<string | null> {
  const outcome = await readFrame().catch(() => null);
  return outcome?.live ? createHash("sha1").update(outcome.frame.jpeg).digest("hex") : null;
}

/** The main watcher's verdict: a live frame, a screen that changed since the step began, and no errors during it. */
export function judgeStep(start: string | null, end: string | null, errors: string[]): StepVerdict {
  if (end === null) return { passed: false, evidence: "No live frame to verify the step" };
  if (errors.length) return { passed: false, evidence: `Errors during the step: ${errors.join("; ")}` };
  if (start !== null && start === end) return { passed: false, evidence: "Screen did not change during the step" };
  return { passed: true, evidence: start === null ? "Live frame present; no errors" : "Screen changed; no errors" };
}

function consensus(assistVerified: boolean, mainPassed: boolean): StepRecord["state"] {
  if (assistVerified && mainPassed) return "complete";
  if (!assistVerified && !mainPassed) return "failed";
  return "disputed";
}

/** Per-step agent-to-agent verification, the 10-second stall rule and takeovers in both directions. */
export class StepCoordinator {
  private readonly steps = new Map<string, StepEntry>();
  private readonly handoffList: HandoffRecord[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: StepCoordinatorDeps) {
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.checkStalls(), STALL_CHECK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(): StepRecord[] {
    return [...this.steps.values()].map((e) => e.record).sort((a, b) => b.startedAt - a.startedAt);
  }

  handoffs(): HandoffRecord[] {
    return [...this.handoffList];
  }

  /** droid-new's `step_update`: started opens the step; done/failed runs the main watcher and decides by consensus. */
  async update(payload: StepUpdatePayload): Promise<StepRecord> {
    if (payload.status === "started") return this.begin(payload);
    const entry = this.steps.get(payload.stepId) ?? (await this.beginEntry(payload));
    const assistVerified = payload.verified ?? payload.status === "done";
    const verdict = judgeStep(entry.startFingerprint, await fingerprint(this.deps.readFrame), this.deps.errorsSince(entry.record.startedAt));
    Object.assign(entry.record, {
      assistVerified,
      main: verdict,
      state: consensus(assistVerified, verdict.passed),
      updatedAt: this.now(),
      tried: payload.tried ?? entry.record.tried,
    });
    this.deps.emit("step_observation", { stepId: payload.stepId, passed: verdict.passed, evidence: verdict.evidence, state: entry.record.state });
    if (entry.record.state === "disputed") this.routeDisagreement(entry.record, verdict);
    return entry.record;
  }

  private async begin(payload: StepUpdatePayload): Promise<StepRecord> {
    return (await this.beginEntry(payload)).record;
  }

  private async beginEntry(payload: StepUpdatePayload): Promise<StepEntry> {
    const at = this.now();
    const entry: StepEntry = {
      record: {
        stepId: payload.stepId,
        goal: payload.goal,
        step: payload.step,
        state: "running",
        startedAt: at,
        updatedAt: at,
        tried: payload.tried ?? [],
        hasScript: Boolean(payload.script),
      },
      script: payload.script,
      startFingerprint: await fingerprint(this.deps.readFrame),
    };
    this.steps.set(payload.stepId, entry);
    this.trim();
    return entry;
  }

  private trim(): void {
    while (this.steps.size > HISTORY_LIMIT) this.steps.delete(this.steps.keys().next().value as string);
  }

  /** Disagreements go to droid-new's resolution center; droid-new is the boss. */
  private routeDisagreement(record: StepRecord, verdict: StepVerdict): void {
    const params = { stepId: record.stepId, assistVerified: Boolean(record.assistVerified), mainVerified: verdict.passed, evidence: verdict.evidence };
    this.deps
      .request("resolve_disagreement", params)
      .then((result) => {
        record.resolution = JSON.stringify(result);
      })
      .catch((err) => {
        record.resolution = `Not routed: ${err instanceof Error ? err.message : String(err)}`;
        this.deps.log("WARN", `Step ${record.stepId} disagreement not routed: ${record.resolution}`);
      });
  }

  /** Marks running steps older than the stall limit incomplete; auto-takes over the ones that carry a script. */
  async checkStalls(): Promise<void> {
    const limit = this.deps.stallMs ?? STEP_STALL_MS;
    for (const entry of this.steps.values()) {
      if (entry.record.state !== "running" || this.now() - entry.record.startedAt < limit) continue;
      entry.record.state = "incomplete";
      entry.record.updatedAt = this.now();
      this.deps.emit("step_incomplete", { stepId: entry.record.stepId, goal: entry.record.goal, step: entry.record.step });
      this.deps.log("WARN", `Step ${entry.record.stepId} incomplete after ${limit}ms`);
      if (entry.script && this.deps.autoTakeover()) await this.takeoverIncomplete(entry.record.stepId);
    }
  }

  /** The main app takes over an incomplete step it detected itself. */
  takeoverIncomplete(stepId: string): Promise<HandoffRecord> {
    const entry = this.steps.get(stepId);
    if (!entry) throw new Error(`Unknown step "${stepId}"`);
    const { goal, step, tried } = entry.record;
    return this.takeover({ stepId, goal, step, tried, screenshots: [], script: entry.script, reason: "Incomplete after the stall limit" }, "main");
  }

  /** Executes a handed-off step with its full context and reports the outcome back to droid-new. */
  async takeover(payload: TakeoverStepPayload, origin: HandoffOrigin): Promise<HandoffRecord> {
    const handoff: HandoffRecord = {
      id: randomUUID(),
      stepId: payload.stepId,
      origin,
      goal: payload.goal,
      step: payload.step,
      tried: payload.tried,
      reason: payload.reason,
      screenshots: payload.screenshots.length,
      startedAt: this.now(),
      outcome: "running",
    };
    this.handoffList.unshift(handoff);
    if (this.handoffList.length > HISTORY_LIMIT) this.handoffList.pop();
    this.deps.log("INFO", `Takeover of step ${payload.stepId} (${origin}): ${payload.step}`);
    try {
      const script = payload.script ?? (await this.planScript(payload));
      handoff.result = await this.deps.runScript(script);
      handoff.outcome = handoff.result.completed ? "completed" : "failed";
      handoff.detail = handoff.result.stoppedReason;
    } catch (err) {
      handoff.outcome = "failed";
      handoff.detail = err instanceof Error ? err.message : String(err);
    }
    handoff.finishedAt = this.now();
    this.markStep(payload, handoff);
    this.deps.log(handoff.outcome === "completed" ? "INFO" : "ERROR", `Takeover of step ${payload.stepId} ${handoff.outcome}${handoff.detail ? `: ${handoff.detail}` : ""}`);
    this.deps.emit("handoff", handoff);
    return handoff;
  }

  private async planScript(payload: TakeoverStepPayload): Promise<ScriptStep[]> {
    const live = await this.deps.readFrame().catch(() => null);
    return this.deps.planTakeover({ ...payload, frame: live?.live ? live.frame.jpeg : null });
  }

  private markStep(payload: TakeoverStepPayload, handoff: HandoffRecord): void {
    const record = this.steps.get(payload.stepId)?.record;
    if (!record) return;
    record.state = handoff.outcome === "completed" ? "taken_over" : "failed";
    record.updatedAt = this.now();
  }
}
