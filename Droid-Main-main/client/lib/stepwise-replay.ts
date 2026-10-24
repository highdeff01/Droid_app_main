/**
 * Runs recorded steps one at a time with honest per-step progress:
 *   backend check → (drift mode) pre-check the live frame against the step's SAVED frame and
 *   locate the recorded target on the live frame (template matching) to measure and correct the
 *   pixel drift → gated dispatch of the one step at the corrected point → (drift mode) post-check:
 *   re-locate the target after acting, classify the frame change and check the next step's
 *   target element landed. The measured drift of every step is logged.
 * A backtrack or unexpected page stops the run, is surfaced, and is handed to the replanner
 * (the Qwen turn loop) to recalculate a route toward the goal. Nothing is assumed: a failed
 * dispatch, capture or check is reported as such.
 */
import {
  classifyFrameChange,
  type CursorMark,
  type FrameChange,
  type GrayFrame,
} from "@/lib/frame-diff";
import { measureDrift, unmeasuredDrift, type DriftMeasurement, type GrayImage } from "@/lib/template-match";

export interface StepwiseStep {
  id: string;
  name: string;
  action: string;
  x: number;
  y: number;
  targetOcrLabel?: string;
  referenceScreenshotUrl?: string;
}

/** A decoded frame plus the pixel size of the screenshot it came from. */
export interface LoadedFrame {
  gray: GrayFrame;
  width: number;
  height: number;
  /** Full-resolution luminance for template matching; drift is unmeasured without it. */
  pixels?: GrayImage;
}

export interface StepwiseDeps {
  /** Null when the control backend can act, else why it cannot. */
  checkBackend: (signal: AbortSignal) => Promise<string | null>;
  /** A fresh live frame as a data URL; rejects when none can be captured. */
  capture: (signal: AbortSignal) => Promise<string>;
  loadFrame: (dataUrl: string) => Promise<LoadedFrame>;
  /** Dispatches one step through the action gate and resolves once it completed on the device. */
  runStep: (step: StepwiseStep, signal: AbortSignal) => Promise<void>;
  /** Whether an element is at the step's target on the frame (the element check). */
  findElement: (frame: string, step: StepwiseStep, signal: AbortSignal) => Promise<string | null>;
  /** Hands a drift to the replanner; resolves with what the replanner reported. */
  replan: (reason: string, remaining: StepwiseStep[], signal: AbortSignal) => Promise<string>;
}

export type StepPhase = "pre_check" | "executing" | "post_check" | "executed" | "failed" | "skipped";

export interface StepOutcome {
  stepId: string;
  name: string;
  status: "executed" | "failed" | "skipped";
  detail: string;
  preCheck?: FrameChange;
  postCheck?: FrameChange;
  elementCheck?: string;
  /** Drift of the target on the live frame before acting (the correction applied). */
  drift?: DriftMeasurement;
  /** The target re-located on the frame after acting. */
  postDrift?: DriftMeasurement;
  /** Where the step was really dispatched (the drift-corrected point). */
  actedAt?: { x: number; y: number };
}

export interface StepwiseProgress {
  /** 1-based index of the step being worked on. */
  current: number;
  total: number;
  stepName: string;
  phase: StepPhase;
  message: string;
  outcomes: StepOutcome[];
}

export type StepwiseResult =
  | { status: "completed"; outcomes: StepOutcome[] }
  | { status: "unavailable"; reason: string; outcomes: StepOutcome[] }
  | { status: "failed"; reason: string; outcomes: StepOutcome[] }
  | { status: "cancelled"; reason: string; outcomes: StepOutcome[] }
  | { status: "replanned"; reason: string; drift: FrameChange; replan: string; outcomes: StepOutcome[] };

export interface StepwiseOptions {
  signal: AbortSignal;
  /** Compare frames before/after each step and replan on drift (verified drift replay). */
  verifyDrift: boolean;
  onProgress: (progress: StepwiseProgress) => void;
  /** Called once with a drift that stops the run, before the replanner runs. */
  onDrift?: (drift: FrameChange, step: StepwiseStep) => void;
  /** Called with each drift measured (before acting and after), one log line per measurement. */
  onDriftMeasured?: (step: StepwiseStep, phase: "before" | "after", drift: DriftMeasurement) => void;
}

/** Actions aimed at a screen point; only these are located and drift-corrected. */
const POINTER_ACTIONS = new Set(["click", "left_click", "double_click", "right_click", "clear_and_type"]);

const DRIFT_KINDS = new Set<FrameChange["kind"]>(["backtrack", "wrong_page"]);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface RunState {
  steps: StepwiseStep[];
  options: StepwiseOptions;
  deps: StepwiseDeps;
  outcomes: StepOutcome[];
  /** Screens already passed (saved or seen), oldest first. */
  seen: GrayFrame[];
  live?: { url: string; frame: LoadedFrame };
}

function report(run: RunState, index: number, phase: StepPhase, message: string) {
  run.options.onProgress({
    current: index + 1,
    total: run.steps.length,
    stepName: run.steps[index]?.name ?? "",
    phase,
    message,
    outcomes: [...run.outcomes],
  });
}

/** The cursor positions near which a frame change is ignored: the step targets around this move. */
function cursorsFor(frame: LoadedFrame, ...steps: (StepwiseStep | undefined)[]): CursorMark[] {
  return steps
    .filter((s): s is StepwiseStep => !!s)
    .map((s) => ({ x: s.x / Math.max(1, frame.width), y: s.y / Math.max(1, frame.height) }));
}

async function captureLive(run: RunState): Promise<{ url: string; frame: LoadedFrame }> {
  const url = await run.deps.capture(run.options.signal);
  return { url, frame: await run.deps.loadFrame(url) };
}

async function referenceFrame(run: RunState, step: StepwiseStep | undefined): Promise<LoadedFrame | null> {
  if (!step?.referenceScreenshotUrl) return null;
  return run.deps.loadFrame(step.referenceScreenshotUrl);
}

async function savedFrame(run: RunState, step: StepwiseStep | undefined): Promise<GrayFrame | null> {
  return (await referenceFrame(run, step))?.gray ?? null;
}

/**
 * Template-matches the step's recorded target (cut from its saved frame) on the current live frame.
 * `from` is the point the drift is measured from: the recorded point before acting, the acted point after.
 */
async function locateTarget(run: RunState, step: StepwiseStep, from: { x: number; y: number }): Promise<DriftMeasurement> {
  if (!POINTER_ACTIONS.has(step.action)) return unmeasuredDrift(from.x, from.y, `${step.action} has no screen target; drift not measured`);
  const reference = await referenceFrame(run, step);
  if (!reference) return unmeasuredDrift(from.x, from.y, "No saved frame for this step; drift not measured");
  const live = run.live?.frame.pixels;
  if (!reference.pixels || !live) return unmeasuredDrift(from.x, from.y, "Frame pixels unavailable for template matching; drift not measured");
  return measureDrift(reference.pixels, live, step.x, step.y, { from });
}

function logDrift(run: RunState, step: StepwiseStep, phase: "before" | "after", drift: DriftMeasurement) {
  run.options.onDriftMeasured?.(step, phase, drift);
}

/** Pre-check: the live frame against this step's saved frame and the screen before it. */
async function preCheck(run: RunState, index: number): Promise<FrameChange | undefined> {
  const step = run.steps[index];
  report(run, index, "pre_check", `Comparing the live frame with the saved frame for "${step.name}"`);
  const previous = run.live;
  run.live = await captureLive(run);
  const expected = await savedFrame(run, step);
  if (!expected) return undefined;
  return classifyFrameChange({
    previous: (previous ?? run.live).frame.gray,
    current: run.live.frame.gray,
    expected,
    earlier: run.seen,
    options: { cursors: cursorsFor(run.live.frame, run.steps[index - 1], step) },
  });
}

/** Post-check: re-locate the target after acting, what the action changed, and whether the next target landed. */
async function postCheck(
  run: RunState,
  index: number,
  actedAt: { x: number; y: number },
): Promise<Pick<StepOutcome, "postCheck" | "elementCheck" | "postDrift">> {
  const step = run.steps[index];
  const next = run.steps[index + 1];
  report(run, index, "post_check", `Verifying the outcome of "${step.name}"`);
  const before = run.live!;
  run.seen.push(before.frame.gray);
  run.live = await captureLive(run);
  const postDrift = await locateTarget(run, step, actedAt);
  logDrift(run, step, "after", postDrift);
  const postCheck = classifyFrameChange({
    previous: before.frame.gray,
    current: run.live.frame.gray,
    expected: await savedFrame(run, next),
    earlier: run.seen.slice(0, -1),
    options: { cursors: cursorsFor(run.live.frame, step, next) },
  });
  if (!next) return { postCheck, postDrift, elementCheck: "skipped: last step has no next target" };
  const element = await run.deps.findElement(run.live.url, next, run.options.signal);
  return {
    postCheck,
    postDrift,
    elementCheck: element ? `next target found: ${element}` : `next target "${next.targetOcrLabel || next.name}" not found`,
  };
}

async function replanFrom(run: RunState, index: number, drift: FrameChange): Promise<StepwiseResult> {
  const step = run.steps[index];
  run.options.onDrift?.(drift, step);
  const reason = `${drift.kind === "backtrack" ? "Backtrack" : "Unexpected page"} at step ${index + 1} ("${step.name}"): ${drift.reason}`;
  const replan = await run.deps.replan(reason, run.steps.slice(index), run.options.signal);
  return { status: "replanned", reason, drift, replan, outcomes: run.outcomes };
}

function fail(run: RunState, index: number, detail: string, extra: Partial<StepOutcome> = {}): StepwiseResult {
  const step = run.steps[index];
  run.outcomes.push({ stepId: step.id, name: step.name, status: "failed", detail, ...extra });
  report(run, index, "failed", detail);
  return { status: "failed", reason: `Step ${index + 1} ("${step.name}") failed: ${detail}`, outcomes: run.outcomes };
}

/** Drift mode before acting: frame pre-check, then locate the target and correct the step's point. */
async function verifyBefore(
  run: RunState,
  index: number,
): Promise<{ stop: StepwiseResult } | { pre?: FrameChange; drift: DriftMeasurement; target: StepwiseStep }> {
  const step = run.steps[index];
  const pre = await preCheck(run, index);
  if (pre && DRIFT_KINDS.has(pre.kind)) {
    run.outcomes.push({ stepId: step.id, name: step.name, status: "skipped", detail: `Not executed: ${pre.reason}`, preCheck: pre });
    report(run, index, "skipped", pre.reason);
    return { stop: await replanFrom(run, index, pre) };
  }
  const drift = await locateTarget(run, step, { x: step.x, y: step.y });
  logDrift(run, step, "before", drift);
  if (drift.status === "not_found") return { stop: fail(run, index, `Not executed: ${drift.detail}`, { preCheck: pre, drift }) };
  const moved = drift.located && (drift.dx !== 0 || drift.dy !== 0);
  return { pre, drift, target: moved ? { ...step, x: drift.located!.x, y: drift.located!.y } : step };
}

/** One step: pre-check and drift correction, dispatch, post-check. Returns a terminal result to stop the run, else null. */
async function runOne(run: RunState, index: number): Promise<StepwiseResult | null> {
  const step = run.steps[index];
  const { verifyDrift, signal } = run.options;
  let pre: FrameChange | undefined;
  let drift: DriftMeasurement | undefined;
  let target = step;
  if (verifyDrift) {
    const checked = await verifyBefore(run, index);
    if ("stop" in checked) return checked.stop;
    ({ pre, drift, target } = checked);
  }
  const actedAt = { x: target.x, y: target.y };
  report(run, index, "executing", `Executing "${step.name}" (${step.action} at ${target.x}, ${target.y})`);
  try {
    await run.deps.runStep(target, signal);
  } catch (error) {
    return fail(run, index, errorText(error), { preCheck: pre, drift });
  }
  const post = verifyDrift ? await postCheck(run, index, actedAt) : {};
  const checks = [pre ? `Saved-frame check: ${pre.reason}` : "No saved frame for this step; pixel pre-check skipped", drift?.detail];
  const outcome: StepOutcome = {
    stepId: step.id,
    name: step.name,
    status: "executed",
    detail: verifyDrift ? checks.filter(Boolean).join("; ") : "Executed",
    preCheck: pre,
    drift,
    actedAt,
    ...post,
  };
  run.outcomes.push(outcome);
  report(run, index, "executed", post.postCheck ? `${post.postCheck.reason}; ${post.elementCheck}` : `Executed "${step.name}"`);
  if (post.postCheck && DRIFT_KINDS.has(post.postCheck.kind)) return replanFrom(run, index, post.postCheck);
  return null;
}

export async function runStepwiseReplay(
  steps: StepwiseStep[],
  options: StepwiseOptions,
  deps: StepwiseDeps,
): Promise<StepwiseResult> {
  const run: RunState = { steps, options, deps, outcomes: [], seen: [] };
  if (steps.length === 0) return { status: "failed", reason: "No recorded steps to execute.", outcomes: [] };
  const unavailable = await deps.checkBackend(options.signal);
  if (unavailable) return { status: "unavailable", reason: unavailable, outcomes: [] };
  try {
    for (let index = 0; index < steps.length; index++) {
      if (options.signal.aborted) return { status: "cancelled", reason: `Stopped before step ${index + 1}`, outcomes: run.outcomes };
      const stop = await runOne(run, index);
      if (stop) return stop;
    }
  } catch (error) {
    if (options.signal.aborted) return { status: "cancelled", reason: "Stopped by user", outcomes: run.outcomes };
    return { status: "failed", reason: errorText(error), outcomes: run.outcomes };
  }
  return { status: "completed", outcomes: run.outcomes };
}

/** One line for the HUD: "3/5 executed, 1 failed" style from the real outcomes. */
export function summarizeOutcomes(outcomes: StepOutcome[], total: number): string {
  const count = (status: StepOutcome["status"]) => outcomes.filter((o) => o.status === status).length;
  return `${count("executed")}/${total} executed, ${count("failed")} failed, ${count("skipped")} skipped`;
}
