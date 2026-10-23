/**
 * Client-side replay of recorded steps against the simulated device surface
 * (Preview Mode). It advances the same ReplayRun the HUD timeline renders,
 * with every event badged PREVIEW (simulated); the run never ends as
 * "completed", so nothing reads it as a device success.
 */
import type { ReplayRun } from "@shared/replay";
import { PREVIEW_SEQUENCE_REASON } from "@/lib/gated-dispatch";
import { simulateDeviceAction } from "@/lib/preview-mode";

export interface PreviewStepLike {
  id: string;
  name?: string;
  action: string;
  x: number;
  y: number;
  delayMs?: number;
}

export interface PreviewReplayOptions {
  /** Called with each new snapshot of the simulated run. */
  onUpdate: (run: ReplayRun, step: PreviewStepLike | null) => void;
  /** True once the user pressed Stop. */
  stopped: () => boolean;
  /** Pause per step (defaults to the step's delayMs). */
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function stepLabel(step: PreviewStepLike, index: number): string {
  return `step ${index + 1} ${step.name ?? step.action} @ (${Math.round(step.x)}, ${Math.round(step.y)})`;
}

/** Runs the steps on the simulated surface and returns the final (never "completed") run. */
export async function simulateReplayRun(steps: PreviewStepLike[], options: PreviewReplayOptions): Promise<ReplayRun> {
  const { onUpdate, stopped, wait = sleep } = options;
  let run: ReplayRun = {
    id: `preview_${Date.now()}`,
    target: "preview",
    status: "running",
    currentStep: 0,
    iteration: 1,
    completed: 0,
    total: steps.length,
    steps: steps.map((s) => ({ id: s.id, status: "pending" })),
    events: [],
    startedAt: Date.now(),
  };
  const update = (patch: Partial<ReplayRun>, step: PreviewStepLike | null) => {
    run = { ...run, ...patch };
    onUpdate(run, step);
  };
  for (const [index, step] of steps.entries()) {
    if (stopped()) {
      update({ status: "cancelled", error: "Preview run stopped" }, null);
      return run;
    }
    const reply = simulateDeviceAction(stepLabel(step, index));
    update({
      currentStep: index,
      steps: run.steps.map((s, i) => (i === index ? { ...s, status: "running" } : s)),
      events: [...run.events, { id: `${run.id}_${index}`, at: Date.now(), stepId: step.id, phase: "execution", detail: reply.message }],
    }, step);
    await wait(step.delayMs ?? 400);
    update({
      completed: index + 1,
      steps: run.steps.map((s, i) => (i === index ? { ...s, status: "completed" } : s)),
    }, step);
  }
  update({ status: "cancelled", error: PREVIEW_SEQUENCE_REASON }, null);
  return run;
}
