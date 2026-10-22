import { createHash } from "node:crypto";
import type { CompanionNote } from "@shared/companion";
import type { SupervisedOperation } from "@shared/overseer";
import type { NotesStore } from "./notes-store";
import type { SupervisorEvent } from "./overseer/supervisor";

interface StepTiming {
  stepId: string;
  name: string;
  ms: number;
}

interface OperationClock {
  lastAt: number;
  steps: StepTiming[];
  lastFrameHash?: string;
}

/** Control times of one finished operation. */
export interface ControlTimes {
  totalMs: number;
  retries: number;
  steps: StepTiming[];
}

const frameHash = (image: string) => createHash("sha256").update(image.replace(/^data:[^,]*,/, "")).digest("hex");

export function formatControlTimes(times: ControlTimes): string {
  const perStep = times.steps.map((s) => `${s.name}: ${s.ms} ms`).join("; ") || "no steps reported";
  return `Total ${times.totalMs} ms, ${times.steps.length} step(s), retries=${times.retries}. Per step — ${perStep}`;
}

/**
 * The AI's own notes on screen activity: operation starts, major screen changes
 * between steps, and on finish the control times (per step, total, retries).
 * Everything is stored through the companion NotesStore so chat recalls it.
 */
export class ActivityNotes {
  private readonly clocks = new Map<string, OperationClock>();

  constructor(
    private readonly notes: NotesStore,
    private readonly now: () => number = Date.now,
  ) {}

  handle(event: SupervisorEvent): CompanionNote | undefined {
    if (event.type === "started") return this.started(event.op);
    if (event.type === "step") return this.step(event.op, event.report.stepId, event.report.name, event.report.beforeImage);
    if (event.type === "finished") return this.finished(event.op);
    return undefined;
  }

  private started(op: SupervisedOperation) {
    this.clocks.set(op.id, { lastAt: op.startedAt, steps: [] });
    return this.notes.add({
      category: "observation",
      title: `Started ${label(op)}`,
      content: `${op.kind} from ${op.source} started at ${new Date(op.startedAt).toISOString()}`,
      tags: ["activity", "workflow_started", op.kind],
    });
  }

  private step(op: SupervisedOperation, stepId: string, name: string, frame?: string) {
    const clock = this.clock(op);
    const at = this.now();
    clock.steps.push({ stepId, name, ms: Math.max(0, at - clock.lastAt) });
    clock.lastAt = at;
    return frame ? this.screenChange(op, clock, name, frame) : undefined;
  }

  /** Notes a frame that differs from the previous step's frame; the first frame is the baseline. */
  private screenChange(op: SupervisedOperation, clock: OperationClock, name: string, frame: string) {
    const hash = frameHash(frame);
    const previous = clock.lastFrameHash;
    clock.lastFrameHash = hash;
    if (!previous || previous === hash) return undefined;
    return this.notes.add({
      category: "observation",
      title: `Screen changed before "${name}"`,
      content: `${label(op)}: the screen changed between steps at ${new Date(this.now()).toISOString()}`,
      tags: ["activity", "screen_change", op.kind],
      screenshot: /^data:image\/(png|jpeg);base64,/.test(frame) ? frame : undefined,
    });
  }

  private finished(op: SupervisedOperation) {
    const clock = this.clock(op);
    this.clocks.delete(op.id);
    const times: ControlTimes = {
      totalMs: Math.max(0, (op.finishedAt ?? this.now()) - op.startedAt),
      retries: op.retriesUsed,
      steps: clock.steps,
    };
    const goalReached = op.kind === "goal_run" && op.status === "completed";
    return this.notes.add({
      category: goalReached ? "goal_state" : "observation",
      title: `${label(op)} ${op.status}`,
      content: [formatControlTimes(times), op.detail].filter(Boolean).join("\n"),
      tags: ["activity", "control_time", `workflow_${op.status}`, op.kind],
      event: goalReached ? "goal_reached" : op.status === "completed" ? "workflow_completed" : op.status === "failed" ? "workflow_failed" : undefined,
    });
  }

  private clock(op: SupervisedOperation): OperationClock {
    let clock = this.clocks.get(op.id);
    if (!clock) {
      clock = { lastAt: op.startedAt, steps: [] };
      this.clocks.set(op.id, clock);
    }
    return clock;
  }
}

function label(op: SupervisedOperation) {
  return `${op.kind.replace("_", " ")} "${op.goal.slice(0, 80)}"`;
}
