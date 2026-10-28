import type { RunScriptResult, ScriptStep, ScriptStepOutcome } from "../../shared/assist-bridge";

/** One device input; resolves with whether it really executed. */
export type DeviceExecutor = (task: {
  action: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  origin: string;
}) => Promise<{ success: boolean; executed?: boolean; error?: string; explanation?: string }>;

export interface ScriptRunnerDeps {
  execute: DeviceExecutor;
  isKilled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const ORIGIN = "assist_bridge";
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Device task for each input step; `wait` is handled by the runner itself. */
const STEP_TASKS: Record<Exclude<ScriptStep["op"], "wait">, (step: any) => Parameters<DeviceExecutor>[0]> = {
  click: (s) => ({ action: "click", x: s.x, y: s.y, origin: ORIGIN }),
  type: (s) => ({ action: "type", x: s.x, y: s.y, text: s.text, origin: ORIGIN }),
  key: (s) => ({ action: "press_key", x: s.x, y: s.y, key: s.key, origin: ORIGIN }),
};

export class ScriptRunner {
  private running = false;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: ScriptRunnerDeps) {
    this.sleep = deps.sleep ?? defaultSleep;
  }

  get busy(): boolean {
    return this.running;
  }

  /** Refuses when killed or busy (throws); otherwise runs steps until one fails or the kill switch trips. */
  async run(steps: ScriptStep[]): Promise<RunScriptResult> {
    if (this.deps.isKilled()) throw new Error("Kill switch is tripped; run_script refused");
    if (this.running) throw new Error("busy: another script is running");
    this.running = true;
    try {
      return await this.runSteps(steps);
    } finally {
      this.running = false;
    }
  }

  private async runSteps(steps: ScriptStep[]): Promise<RunScriptResult> {
    const outcomes: ScriptStepOutcome[] = [];
    for (const [index, step] of steps.entries()) {
      if (this.deps.isKilled()) return { completed: false, steps: outcomes, stoppedReason: "Kill switch tripped" };
      const outcome = await this.runStep(index, step);
      outcomes.push(outcome);
      if (!outcome.executed) return { completed: false, steps: outcomes, stoppedReason: outcome.error };
    }
    return { completed: true, steps: outcomes };
  }

  private async runStep(index: number, step: ScriptStep): Promise<ScriptStepOutcome> {
    if (step.op === "wait") {
      await this.sleep(step.ms);
      return { index, op: step.op, executed: true };
    }
    try {
      const result = await this.deps.execute(STEP_TASKS[step.op](step));
      const executed = result.executed ?? result.success;
      return executed
        ? { index, op: step.op, executed }
        : { index, op: step.op, executed, error: result.error || result.explanation || "Step did not execute" };
    } catch (err) {
      return { index, op: step.op, executed: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
