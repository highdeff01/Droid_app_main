import type { ReplayRun } from "@shared/replay";

export const MIN_REPEAT_COUNT = 1;
export const MAX_REPEAT_COUNT = 25;

interface RepeatableStep {
  id: string;
  repeatCount?: number;
  referenceScreenshotUrl?: string;
}

/** Normalises user input into a whole repeat count within the replay engine's bounds. */
export function clampRepeatCount(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return MIN_REPEAT_COUNT;
  return Math.min(MAX_REPEAT_COUNT, Math.max(MIN_REPEAT_COUNT, Math.round(n)));
}

/** The step as sent to POST /api/replay: repeatCount always present and in range. */
export function toReplayStepPayload<T extends RepeatableStep>(step: T) {
  return {
    ...step,
    repeatCount: clampRepeatCount(step.repeatCount ?? MIN_REPEAT_COUNT),
    referenceScreenshotUrl: step.referenceScreenshotUrl || undefined,
  };
}

/** A fresh single-step run of `step`: same target and repeats, no breakpoint, pending. */
export function buildRetryStep<T extends RepeatableStep & { breakpoint?: boolean }>(step: T) {
  return {
    ...step,
    stepNumber: 1,
    status: "pending" as const,
    breakpoint: false,
    repeatCount: clampRepeatCount(step.repeatCount ?? MIN_REPEAT_COUNT),
  };
}

/** The step a HUD retry targets: the latest run's failed step, else the active step. */
export function findRetryableStep<T extends { id: string; status?: string }>(
  sequence: T[],
  run: Pick<ReplayRun, "steps"> | null,
  activeStepId: string | null,
) {
  const failedId =
    run?.steps.find((s) => s.status === "failed")?.id ??
    sequence.find((s) => s.status === "failed")?.id;
  const id = failedId ?? activeStepId;
  return id ? sequence.find((s) => s.id === id) : undefined;
}

/** Human-readable replay progress, e.g. "Step 2/5 • 3/10 actions • iteration 1". */
export function replayProgressLabel(
  run: Pick<ReplayRun, "currentStep" | "steps" | "completed" | "total" | "iteration">,
) {
  return `Step ${Math.min(run.currentStep + 1, run.steps.length)}/${run.steps.length} • ${run.completed}/${run.total} actions • iteration ${run.iteration}`;
}
