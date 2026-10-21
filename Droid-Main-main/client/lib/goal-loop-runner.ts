/**
 * Drives a goal end-to-end on the real device: observe the screen (capture →
 * describe-screen → OCR), ask the planner for steps, then run each step through
 * the action gate and the replay engine, re-observing before and after every
 * step. Moved targets are re-grounded on the fresh screen; a missing target,
 * repeated failures, a stall, a dead route or an unreached goal produce a
 * re-plan that runs only when the user approves it. Every failure stops the
 * loop with its reason; nothing is simulated.
 */
import type { SequenceStep, VerificationBadgeState } from "@/components/live-screen-hud";
import {
  gateTargetForAction,
  postGateJson,
  runActionGate,
  type GatePost,
} from "@/lib/action-gate";
import { startReplay, type ReplayRunSnapshot } from "@/lib/automation-runner";
import { waitForReplayRun } from "@/lib/verified-replay";
import {
  MAX_REVISIONS,
  applyApprovedPlan,
  applyRelocation,
  assessProgress,
  createGoalState,
  nextStep,
  observeScreen,
  recordStepResult,
  relocateTarget,
  verifiedSteps,
  verifyStep,
  type ExecutedStep,
  type GoalAssessment,
  type GoalState,
  type GoalStep,
  type PlanProposal,
  type RunEvidence,
  type ScreenObservation,
} from "@shared/goal-loop";

const GATE_TIMEOUT_MS = 45000;

export type GoalLoopPhase =
  | "thinking"
  | "analyzing"
  | "verifying"
  | "acting"
  | "awaiting_approval"
  | "completed"
  | "failed";

/** The HUD verification badge status that truthfully reflects each loop phase. */
export const GOAL_PHASE_BADGE: Record<GoalLoopPhase, VerificationBadgeState["status"]> = {
  thinking: "verifying",
  analyzing: "verifying",
  verifying: "verifying",
  acting: "verified",
  awaiting_approval: "retrying",
  completed: "verified",
  failed: "failed",
};

export interface GoalLoopEvent {
  phase: GoalLoopPhase;
  message: string;
  x?: number;
  y?: number;
  label?: string;
  confidence?: number;
}

export interface GoalDevice {
  targetDevice: "desktop" | "android";
  deviceId?: string;
  apiKey?: string;
}

export interface GoalLoopOptions {
  device: GoalDevice;
  signal: AbortSignal;
  onEvent: (event: GoalLoopEvent) => void;
  /** Called with the plan whenever it is adopted (initial or approved re-plan). */
  onPlan?: (state: GoalState) => void;
  onStep?: (executed: ExecutedStep, state: GoalState) => void;
  /** Resolves true only when the user approves the corrected proposal. */
  approve: (proposal: PlanProposal) => Promise<boolean>;
}

export interface GoalLoopDeps {
  post: GatePost;
  get: (url: string, options: { apiKey?: string; signal: AbortSignal }) => Promise<any>;
  gate: typeof runActionGate;
  sleep: (ms: number) => Promise<void>;
}

export type GoalLoopResult =
  | { status: "completed"; state: GoalState; steps: GoalStep[]; evidence: RunEvidence }
  | { status: "failed"; reason: string; state?: GoalState };

interface Observed {
  observation: ScreenObservation;
  frame: string;
}

interface LoopContext {
  goal: string;
  options: GoalLoopOptions;
  deps: GoalLoopDeps;
}

const getJson: GoalLoopDeps["get"] = async (url, { apiKey, signal }) => {
  const response = await fetch(url, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok || data.success !== true) throw new Error(data.error || `${url} failed`);
  return data;
};

const defaultDeps: GoalLoopDeps = {
  post: postGateJson,
  get: getJson,
  gate: runActionGate,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function post(ctx: LoopContext, url: string, body: unknown) {
  const { apiKey } = ctx.options.device;
  return ctx.deps.post(url, body, { apiKey, signal: ctx.options.signal });
}

function ensureActive(ctx: LoopContext) {
  if (ctx.options.signal.aborted) throw new Error("Goal run stopped");
}

/** OCR lines for the frame; an OCR outage is reported and leaves the lines empty. */
async function readText(ctx: LoopContext, frame: string): Promise<string[]> {
  try {
    const data = await post(ctx, "/api/goal-workflows/ocr", { imageData: frame });
    return Array.isArray(data.lines) ? data.lines : [];
  } catch (error) {
    ctx.options.onEvent({ phase: "analyzing", message: `OCR unavailable: ${errorMessage(error)}` });
    return [];
  }
}

/** A fresh capture analyzed by perception (never a stale report) plus its OCR text. */
async function observe(ctx: LoopContext, purpose: string): Promise<Observed> {
  ensureActive(ctx);
  const { targetDevice, deviceId } = ctx.options.device;
  ctx.options.onEvent({ phase: "analyzing", message: `Analyzing screenshot ${purpose}` });
  const capture = await post(ctx, "/api/replay/capture", { targetDevice, deviceId });
  const frame: string | undefined = capture.frame?.image;
  if (!frame) throw new Error("Screen capture returned no frame");
  const analysis = await post(ctx, "/api/ai/describe-screen", { imageData: frame });
  if (!analysis.report) throw new Error("Screen analysis returned no report");
  const ocrText = await readText(ctx, frame);
  return { observation: observeScreen(analysis.report, ocrText, capture.frame?.hash), frame };
}

function historyOf(state: GoalState | undefined) {
  return (state?.executed ?? []).map((e) => ({
    name: e.step.name,
    action: e.step.action,
    passed: e.verification.passed,
    detail: e.verification.checks.find((c) => !c.passed)?.detail,
  }));
}

async function propose(
  ctx: LoopContext,
  seen: Observed,
  state?: GoalState,
  reason?: string,
): Promise<PlanProposal> {
  ctx.options.onEvent({ phase: "thinking", message: reason ? `Re-planning: ${reason}` : `Planning steps for: ${ctx.goal}` });
  const data = await post(ctx, "/api/goal-workflows/propose", {
    goal: ctx.goal,
    observation: seen.observation,
    screenshot: seen.frame,
    history: historyOf(state),
    reason,
  });
  return data.proposal as PlanProposal;
}

/** Presents a corrected proposal; the plan changes only if the user approves it. */
async function replan(ctx: LoopContext, state: GoalState, seen: Observed, reason: string): Promise<GoalState> {
  if (state.revisions >= MAX_REVISIONS) {
    throw new Error(`Still off-track after ${MAX_REVISIONS} re-plans: ${reason}`);
  }
  const proposal = await propose(ctx, seen, state, reason);
  ctx.options.onEvent({ phase: "awaiting_approval", message: `Waiting for approval: ${reason}` });
  if (!(await ctx.options.approve(proposal))) throw new Error(`Re-plan declined (${reason})`);
  const next = applyApprovedPlan(state, proposal);
  ctx.options.onPlan?.(next);
  return next;
}

/** One goal step as a replay-engine step. */
export function toReplayStep(step: GoalStep) {
  return {
    id: step.id,
    name: step.name,
    action: step.action,
    x: Math.round(step.x),
    y: Math.round(step.y),
    delayMs: step.delayMs,
    text: step.text,
    keyPayload: step.keyPayload,
    targetOcrLabel: step.targetLabel,
  };
}

/** Saved goal steps as a HUD sequence for the existing replay path (desktop or paired phone). */
export function toSequenceSteps(steps: GoalStep[]): SequenceStep[] {
  return steps.map((step, index) => ({
    ...toReplayStep(step),
    stepNumber: index + 1,
    status: "pending",
  }));
}

async function dispatchStep(ctx: LoopContext, step: GoalStep): Promise<void> {
  const { device, signal, onEvent } = ctx.options;
  const label = step.targetLabel ?? step.name;
  onEvent({ phase: "verifying", message: `Verifying target for "${step.name}"`, x: step.x, y: step.y, label });
  const gate = await ctx.deps.gate({
    targetDevice: device.targetDevice,
    deviceId: device.deviceId,
    apiKey: device.apiKey,
    target: gateTargetForAction(step.action, step.x, step.y, label),
    signal: AbortSignal.any([signal, AbortSignal.timeout(GATE_TIMEOUT_MS)]),
  });
  if (gate.status !== "verified") throw new Error(`Action blocked: ${gate.reason}`);
  ensureActive(ctx);
  onEvent({ phase: "acting", message: `Acting: ${step.name}`, x: step.x, y: step.y, label: gate.element?.name ?? label, confidence: gate.confidence });
  const started = await post(ctx, "/api/replay", {
    targetDevice: device.targetDevice,
    deviceId: device.deviceId,
    steps: [toReplayStep(step)],
    iterations: 1,
    confirmation: true,
  });
  const fetchRun = async (id: string) =>
    (await ctx.deps.get(`/api/replay/${encodeURIComponent(id)}`, { apiKey: device.apiKey, signal })).run as ReplayRunSnapshot;
  await waitForReplayRun(started.run, { signal }, { gate: ctx.deps.gate, start: startReplay, fetch: fetchRun, sleep: ctx.deps.sleep });
}

/** Re-checks, gates, executes and verifies the next step; returns the state and the latest screen. */
async function runNextStep(ctx: LoopContext, state: GoalState): Promise<{ state: GoalState; seen: Observed }> {
  const planned = nextStep(state)!;
  const before = await observe(ctx, `before "${planned.name}"`);
  const relocation = relocateTarget(planned, before.observation);
  if (relocation.status === "missing") return { state: await replan(ctx, state, before, relocation.reason), seen: before };
  const step = applyRelocation(planned, relocation);
  if (relocation.status === "moved") {
    ctx.options.onEvent({ phase: "thinking", message: `"${planned.name}" target moved ${relocation.distancePx}px; re-grounded on the fresh screen`, x: step.x, y: step.y });
  }
  await dispatchStep(ctx, step);
  const after = await observe(ctx, `after "${step.name}"`);
  const executed: ExecutedStep = {
    step,
    verification: verifyStep(step, before.observation, after.observation),
    relocation: relocation.status,
    signatureAfter: after.observation.signature,
    screenshot: after.frame,
    confidence: after.observation.confidence,
    at: Date.now(),
  };
  const recorded = recordStepResult(state, executed);
  ctx.options.onStep?.(executed, recorded);
  const progress = assessProgress(recorded);
  if (progress.kind === "on_track") return { state: recorded, seen: after };
  return { state: await replan(ctx, recorded, after, progress.reason), seen: after };
}

async function assessGoal(ctx: LoopContext, state: GoalState, seen: Observed): Promise<GoalAssessment> {
  ctx.options.onEvent({ phase: "thinking", message: "Checking whether the goal is reached" });
  const data = await post(ctx, "/api/goal-workflows/assess", {
    goal: ctx.goal,
    observation: seen.observation,
    screenshot: seen.frame,
    history: historyOf(state),
  });
  return data.assessment as GoalAssessment;
}

function buildEvidence(state: GoalState, assessment: GoalAssessment, finalFrame: string): RunEvidence {
  return {
    steps: state.executed
      .filter((e) => e.verification.passed)
      .map((e) => ({
        stepId: e.step.id,
        passed: true,
        checks: e.verification.checks,
        screenshot: e.screenshot,
        confidence: e.confidence,
      })),
    goalAssessment: assessment,
    finalScreenshot: finalFrame,
  };
}

async function driveGoal(ctx: LoopContext, onState: (state: GoalState) => void): Promise<GoalLoopResult> {
  let seen = await observe(ctx, "for planning");
  const initial = await propose(ctx, seen);
  let state = createGoalState(ctx.goal, initial.steps, seen.observation.signature);
  ctx.options.onPlan?.(state);
  for (;;) {
    onState(state);
    while (nextStep(state)) {
      ({ state, seen } = await runNextStep(ctx, state));
      onState(state);
    }
    const assessment = await assessGoal(ctx, state, seen);
    if (assessment.complete) {
      return { status: "completed", state, steps: verifiedSteps(state), evidence: buildEvidence(state, assessment, seen.frame) };
    }
    state = await replan(ctx, state, seen, `Goal not reached: ${assessment.reason}`);
  }
}

/** Plans, tests and self-corrects a goal; resolves with the verified flow or the failure reason. */
export async function runGoalLoop(
  goal: string,
  options: GoalLoopOptions,
  deps: GoalLoopDeps = defaultDeps,
): Promise<GoalLoopResult> {
  const ctx: LoopContext = { goal: goal.trim(), options, deps };
  let latest: GoalState | undefined;
  try {
    const result = await driveGoal(ctx, (state) => (latest = state));
    options.onEvent({ phase: "completed", message: "Goal reached; every step verified" });
    return result;
  } catch (error) {
    const reason = errorMessage(error);
    options.onEvent({ phase: "failed", message: reason });
    return { status: "failed", reason, state: latest };
  }
}
