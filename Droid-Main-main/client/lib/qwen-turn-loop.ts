/**
 * One Qwen turn pipeline for every AI-driven HUD operation (Ask Qwen, Auto
 * Actions, Create Plan, Test/Simulate, goal runs). It walks the operation
 * graph in `@shared/operation-graph`: think → plan → update plan → verify
 * (dry run, no dispatch) → start → continue → retry → error fix → check
 * completion → continue / next turn, forwarding to a fresh capture whenever
 * an operation needs the current screen. Every stage reports what really
 * happened; Stop (the abort signal) ends the run at any stage, including a
 * pending approval.
 */
import type { SequenceStep, VerificationBadgeState } from "@/components/live-screen-hud";
import {
  MAX_REINSPECTIONS,
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
import {
  FRESH_FRAME_OPS,
  STALE_FRAME_OPS,
  formatChain,
  nextOperation,
  type ChainLink,
  type Operation,
  type OperationOutcome,
} from "@shared/operation-graph";

const GATE_TIMEOUT_MS = 45000;

/** Extra attempts for a failed step before the error-fix path (docs/verified-replay.md: at most twice). */
export const MAX_STEP_RETRIES = MAX_REINSPECTIONS;

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

export interface GoalLoopDeps {
  post: GatePost;
  get: (url: string, options: { apiKey?: string; signal: AbortSignal }) => Promise<any>;
  gate: typeof runActionGate;
  sleep: (ms: number) => Promise<void>;
}

/** One dry-run verdict for a planned step against the current analyzed frame. */
export interface SimulatedGoalStep {
  stepId: string;
  name: string;
  verdict: "pass" | "moved" | "block" | "unchecked";
  reason: string;
}

export interface TurnLoopOptions {
  device: GoalDevice;
  signal: AbortSignal;
  onEvent: (event: GoalLoopEvent) => void;
  /** The forwarding chain so far, as links and as the HUD line ("verifying → retrying step 3 → proposing fix"). */
  onChain?: (links: ChainLink[], text: string) => void;
  /** Called with the plan whenever it is adopted (initial, re-plan or fix). */
  onPlan?: (state: GoalState) => void;
  onStep?: (executed: ExecutedStep, state: GoalState) => void;
  onSimulation?: (results: SimulatedGoalStep[]) => void;
  /** Resolves true only when the user approves the re-plan or fix. */
  approve: (proposal: PlanProposal) => Promise<boolean>;
  /** Off unless the user explicitly enables it: fixes and re-plans then run without asking. */
  autoApprove?: boolean;
  /** Where the chain starts: "think" (a goal), "answer" (Ask Qwen) or "apply_plan" with `initialSteps`. */
  entry?: "think" | "answer" | "apply_plan";
  /** Steps to adopt instead of asking the planner (entry "apply_plan"). */
  initialSteps?: GoalStep[];
  /** The question for entry "answer". */
  question?: string;
  /** Stop the chain when it would forward to this operation (Create Plan / Test stop before "start"). */
  stopBefore?: Operation;
  /** Persists a verified run as a new best-flow version; without it save_best only reports the run is ready. */
  saveBest?: (run: { steps: GoalStep[]; evidence: RunEvidence }) => Promise<void>;
}

export type TurnLoopResult =
  | { status: "completed"; state: GoalState; steps: GoalStep[]; evidence: RunEvidence; saved: boolean; saveError?: string }
  | { status: "planned"; state: GoalState; simulation: SimulatedGoalStep[] }
  | { status: "answered"; answer: string }
  | { status: "failed"; reason: string; state?: GoalState };

interface Observed {
  observation: ScreenObservation;
  frame: string;
}

interface TurnContext {
  goal: string;
  options: TurnLoopOptions;
  deps: GoalLoopDeps;
  chain: ChainLink[];
  state?: GoalState;
  seen?: Observed;
  /** The held frame shows the screen the next operation must check. */
  fresh: boolean;
  proposal?: PlanProposal;
  /** Why the run needs a retry, fix or re-plan. */
  problem?: string;
  retries: number;
  simulation: SimulatedGoalStep[];
  assessment?: GoalAssessment;
  answer?: string;
  saved: boolean;
  saveError?: string;
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

export const defaultTurnDeps: GoalLoopDeps = {
  post: postGateJson,
  get: getJson,
  gate: runActionGate,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function post(ctx: TurnContext, url: string, body: unknown) {
  return ctx.deps.post(url, body, { apiKey: ctx.options.device.apiKey, signal: ctx.options.signal });
}

function ensureActive(ctx: TurnContext) {
  if (ctx.options.signal.aborted) throw new Error("Stopped by user");
}

const emit = (ctx: TurnContext, event: GoalLoopEvent) => ctx.options.onEvent(event);

/** The step the cursor points at, numbered for the HUD ("step 3"). */
function stepDetail(ctx: TurnContext): string | undefined {
  return ctx.state && nextStep(ctx.state) ? `step ${ctx.state.cursor + 1}` : undefined;
}

// ---------------------------------------------------------------------------
// Observation (capture)
// ---------------------------------------------------------------------------

/** OCR lines for the frame; an OCR outage is reported and leaves the lines empty. */
async function readText(ctx: TurnContext, frame: string): Promise<string[]> {
  try {
    const data = await post(ctx, "/api/goal-workflows/ocr", { imageData: frame });
    return Array.isArray(data.lines) ? data.lines : [];
  } catch (error) {
    ensureActive(ctx);
    emit(ctx, { phase: "analyzing", message: `OCR unavailable: ${errorMessage(error)}` });
    return [];
  }
}

/** A fresh capture analyzed by perception (never a stale report) plus its OCR text. */
async function capture(ctx: TurnContext): Promise<OperationOutcome> {
  const { targetDevice, deviceId } = ctx.options.device;
  emit(ctx, { phase: "analyzing", message: "Capturing and analyzing a fresh screenshot" });
  const shot = await post(ctx, "/api/replay/capture", { targetDevice, deviceId });
  const frame: string | undefined = shot.frame?.image;
  if (!frame) throw new Error("Screen capture returned no frame");
  const analysis = await post(ctx, "/api/ai/describe-screen", { imageData: frame });
  if (!analysis.report) throw new Error("Screen analysis returned no report");
  const ocrText = await readText(ctx, frame);
  ctx.seen = { observation: observeScreen(analysis.report, ocrText, shot.frame?.hash), frame };
  ctx.fresh = true;
  return "ok";
}

function seen(ctx: TurnContext): Observed {
  if (!ctx.seen) throw new Error("No analyzed screenshot is available");
  return ctx.seen;
}

function requireState(ctx: TurnContext): GoalState {
  if (!ctx.state) throw new Error("No plan has been adopted");
  return ctx.state;
}

// ---------------------------------------------------------------------------
// Think / plan / approve
// ---------------------------------------------------------------------------

async function think(ctx: TurnContext): Promise<OperationOutcome> {
  const { observation } = seen(ctx);
  const summary = observation.description || "no description";
  const turn = ctx.state ? ` (re-plan ${ctx.state.revisions + 1}, goal unchanged: ${ctx.goal})` : "";
  emit(ctx, {
    phase: "thinking",
    message: `Screen: ${summary}; ${observation.elements.length} elements, ${observation.ocrText.length} OCR lines${turn}`,
    confidence: observation.confidence,
  });
  return "ok";
}

function historyOf(state: GoalState | undefined) {
  return (state?.executed ?? []).map((e) => ({
    name: e.step.name,
    action: e.step.action,
    passed: e.verification.passed,
    detail: e.verification.checks.find((c) => !c.passed)?.detail,
  }));
}

async function propose(ctx: TurnContext, reason?: string): Promise<PlanProposal> {
  const { observation, frame } = seen(ctx);
  emit(ctx, { phase: "thinking", message: reason ? `Re-planning: ${reason}` : `Planning steps for: ${ctx.goal}` });
  const data = await post(ctx, "/api/goal-workflows/propose", {
    goal: ctx.goal,
    observation,
    screenshot: frame,
    history: historyOf(ctx.state),
    reason,
  });
  if (!data.proposal) throw new Error("The planner returned no proposal");
  return data.proposal as PlanProposal;
}

/** Resolves false when Stop is pressed while the approval is pending. */
function untilAborted(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve(false);
    signal.addEventListener("abort", () => resolve(false), { once: true });
  });
}

async function approved(ctx: TurnContext, proposal: PlanProposal, reason: string): Promise<boolean> {
  if (ctx.options.autoApprove) {
    emit(ctx, { phase: "thinking", message: `Auto-approved (auto-approve is on): ${reason}` });
    return true;
  }
  emit(ctx, { phase: "awaiting_approval", message: `Waiting for approval: ${reason}` });
  const answer = await Promise.race([ctx.options.approve(proposal), untilAborted(ctx.options.signal)]);
  ensureActive(ctx);
  return answer;
}

/** A corrected plan for the remaining steps; it is adopted only once approved. */
async function proposeCorrection(ctx: TurnContext, reason: string): Promise<OperationOutcome> {
  const state = requireState(ctx);
  if (state.revisions >= MAX_REVISIONS) {
    throw new Error(`Still off-track after ${MAX_REVISIONS} re-plans: ${reason}`);
  }
  const proposal = await propose(ctx, reason).catch((error) => {
    ensureActive(ctx);
    throw new Error(`${reason}; no fix could be proposed: ${errorMessage(error)}`);
  });
  if (!(await approved(ctx, proposal, reason))) {
    ctx.problem = `Re-plan declined (${reason})`;
    return "declined";
  }
  ctx.proposal = proposal;
  return "ok";
}

async function plan(ctx: TurnContext): Promise<OperationOutcome> {
  if (ctx.state) return proposeCorrection(ctx, ctx.problem ?? "Goal not reached");
  ctx.proposal = await propose(ctx);
  return "ok";
}

/** Retry exhaustion, a blocked action or an off-track run: Qwen proposes a fix from the failure evidence. */
async function errorFix(ctx: TurnContext): Promise<OperationOutcome> {
  return proposeCorrection(ctx, ctx.problem ?? "The step failed");
}

function applyPlan(ctx: TurnContext): OperationOutcome {
  const proposal = ctx.proposal;
  if (ctx.state && proposal) ctx.state = applyApprovedPlan(ctx.state, proposal);
  else if (proposal) ctx.state = createGoalState(ctx.goal, proposal.steps, seen(ctx).observation.signature);
  else ctx.state = createGoalState(ctx.goal, ctx.options.initialSteps ?? [], "");
  ctx.proposal = undefined;
  ctx.problem = undefined;
  ctx.retries = 0;
  ctx.options.onPlan?.(ctx.state);
  emit(ctx, { phase: "thinking", message: `Plan updated: ${ctx.state.plan.length - ctx.state.cursor} step(s) to run` });
  return "ok";
}

// ---------------------------------------------------------------------------
// Verify (dry run)
// ---------------------------------------------------------------------------

/** Re-grounds the next step on the held frame; null with `problem` set when its target is missing. */
function groundNext(ctx: TurnContext): { step: GoalStep; relocation: ExecutedStep["relocation"] } | null {
  const state = requireState(ctx);
  const planned = nextStep(state)!;
  const relocation = relocateTarget(planned, seen(ctx).observation);
  if (relocation.status === "missing") {
    ctx.problem = relocation.reason;
    return null;
  }
  const step = applyRelocation(planned, relocation);
  if (relocation.status === "moved") {
    emit(ctx, { phase: "thinking", message: `"${planned.name}" target moved ${relocation.distancePx}px; re-grounded on the fresh screen`, x: step.x, y: step.y });
  }
  return { step, relocation: relocation.status };
}

function simulateVerdict(step: GoalStep, observation: ScreenObservation, isNext: boolean): SimulatedGoalStep {
  const base = { stepId: step.id, name: step.name };
  if (!isNext) return { ...base, verdict: "unchecked", reason: "Acts on a later screen; verified right before it runs" };
  const relocation = relocateTarget(step, observation);
  if (relocation.status === "missing") return { ...base, verdict: "block", reason: relocation.reason };
  if (relocation.status === "moved") return { ...base, verdict: "moved", reason: `Target moved ${relocation.distancePx}px; will be re-grounded` };
  if (relocation.status === "in_place") return { ...base, verdict: "pass", reason: `Target "${relocation.element.name}" found` };
  return { ...base, verdict: "pass", reason: "No screen target needed" };
}

/** Checks the remaining plan against the current analyzed frame. Dispatches nothing. */
function simulate(ctx: TurnContext): OperationOutcome {
  const state = requireState(ctx);
  const { observation } = seen(ctx);
  ctx.simulation = state.plan.slice(state.cursor).map((step, i) => simulateVerdict(step, observation, i === 0));
  ctx.options.onSimulation?.(ctx.simulation);
  const blocked = ctx.simulation.find((s) => s.verdict === "block");
  emit(ctx, { phase: "verifying", message: blocked ? `Dry run blocked "${blocked.name}": ${blocked.reason}` : "Dry run passed for the next step" });
  if (!blocked) return "ok";
  ctx.problem = blocked.reason;
  return "blocked";
}

// ---------------------------------------------------------------------------
// Start / continue / retry
// ---------------------------------------------------------------------------

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
  return steps.map((step, index) => ({ ...toReplayStep(step), stepNumber: index + 1, status: "pending" }));
}

/** Gate, then replay. Returns the gate's block reason, or null once the replay finished. */
async function dispatchStep(ctx: TurnContext, step: GoalStep): Promise<string | null> {
  const { device, signal } = ctx.options;
  const label = step.targetLabel ?? step.name;
  emit(ctx, { phase: "verifying", message: `Verifying target for "${step.name}"`, x: step.x, y: step.y, label });
  const gate = await ctx.deps.gate({
    targetDevice: device.targetDevice,
    deviceId: device.deviceId,
    apiKey: device.apiKey,
    target: gateTargetForAction(step.action, step.x, step.y, label),
    signal: AbortSignal.any([signal, AbortSignal.timeout(GATE_TIMEOUT_MS)]),
  });
  ensureActive(ctx);
  if (gate.status !== "verified") return `Action blocked: ${gate.reason}`;
  emit(ctx, { phase: "acting", message: `Acting: ${step.name}`, x: step.x, y: step.y, label: gate.element?.name ?? label, confidence: gate.confidence });
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
  return null;
}

/** Verifies the executed step on a fresh capture and records it; the outcome names the next stage. */
async function verifyExecuted(ctx: TurnContext, step: GoalStep, before: Observed, relocation: ExecutedStep["relocation"]): Promise<OperationOutcome> {
  await capture(ctx);
  const after = seen(ctx);
  const executed: ExecutedStep = {
    step,
    verification: verifyStep(step, before.observation, after.observation),
    relocation,
    signatureAfter: after.observation.signature,
    screenshot: after.frame,
    confidence: after.observation.confidence,
    at: Date.now(),
  };
  const state = recordStepResult(requireState(ctx), executed);
  ctx.state = state;
  ctx.options.onStep?.(executed, state);
  const progress = assessProgress(state);
  if (progress.kind !== "on_track") {
    ctx.problem = progress.reason;
    return "off_track";
  }
  if (!executed.verification.passed) {
    ctx.problem = executed.verification.checks.find((c) => !c.passed)?.detail ?? `"${step.name}" did not verify`;
    return "failed";
  }
  ctx.retries = 0;
  return nextStep(state) ? "verified" : "plan_done";
}

/** Executes the next planned step through the action gate and the replay engine, then verifies it. */
async function executeNext(ctx: TurnContext): Promise<OperationOutcome> {
  const state = requireState(ctx);
  if (!nextStep(state)) return "plan_done";
  const before = seen(ctx);
  const grounded = groundNext(ctx);
  if (!grounded) return "blocked";
  const { step, relocation } = grounded;
  try {
    const blocked = await dispatchStep(ctx, step);
    if (blocked) {
      ctx.problem = blocked;
      ctx.fresh = false; // the fix is proposed from new evidence, not the frame the gate rejected
      return "blocked";
    }
  } catch (error) {
    ensureActive(ctx);
    ctx.problem = `"${step.name}" replay failed: ${errorMessage(error)}`;
    ctx.fresh = false;
    return "failed";
  }
  return verifyExecuted(ctx, step, before, relocation);
}

/** A bounded re-inspection: the next stage re-captures (with OCR) and runs the step again. */
function retry(ctx: TurnContext): OperationOutcome {
  if (ctx.retries >= MAX_STEP_RETRIES) {
    ctx.problem = `Step failed after ${MAX_STEP_RETRIES} retries: ${ctx.problem ?? "unknown failure"}`;
    return "exhausted";
  }
  ctx.retries += 1;
  emit(ctx, { phase: "verifying", message: `Retry ${ctx.retries}/${MAX_STEP_RETRIES}: re-inspecting the screen (${ctx.problem ?? "step failed"})` });
  return "ok";
}

// ---------------------------------------------------------------------------
// Completion / save / answer
// ---------------------------------------------------------------------------

async function checkCompletion(ctx: TurnContext): Promise<OperationOutcome> {
  const state = requireState(ctx);
  const { observation, frame } = seen(ctx);
  emit(ctx, { phase: "thinking", message: "Checking whether the goal is reached on the fresh screenshot" });
  const data = await post(ctx, "/api/goal-workflows/assess", { goal: ctx.goal, observation, screenshot: frame, history: historyOf(state) });
  const assessment = data.assessment as GoalAssessment;
  if (!assessment) throw new Error("Goal assessment returned no verdict");
  ctx.assessment = assessment;
  if (assessment.complete) return "complete";
  if (!nextStep(state)) {
    ctx.problem = `Goal not reached: ${assessment.reason}`;
    return "needs_replan";
  }
  if (!assessment.onTrack) {
    ctx.problem = `Off-track: ${assessment.reason}`;
    return "off_track";
  }
  return "incomplete";
}

function buildEvidence(state: GoalState, assessment: GoalAssessment, finalFrame: string): RunEvidence {
  const kept = new Set(verifiedSteps(state));
  return {
    steps: state.executed
      .filter((e) => e.verification.passed && kept.has(e.step))
      .map((e) => ({ stepId: e.step.id, passed: true, checks: e.verification.checks, screenshot: e.screenshot, confidence: e.confidence })),
    goalAssessment: assessment,
    finalScreenshot: finalFrame,
  };
}

function completedRun(ctx: TurnContext) {
  const state = requireState(ctx);
  return { state, steps: verifiedSteps(state), evidence: buildEvidence(state, ctx.assessment!, seen(ctx).frame) };
}

/** A verified run forwards here: it is saved as a new (unconfirmed) best-flow version when a saver is wired. */
async function saveBest(ctx: TurnContext): Promise<OperationOutcome> {
  const saver = ctx.options.saveBest;
  if (!saver) {
    emit(ctx, { phase: "thinking", message: "Verified run ready to save as the best flow" });
    return "ok";
  }
  const { steps, evidence } = completedRun(ctx);
  try {
    await saver({ steps, evidence });
    ctx.saved = true;
    emit(ctx, { phase: "thinking", message: "Verified run saved as a new flow version; confirm it to make it the best" });
  } catch (error) {
    ensureActive(ctx);
    ctx.saveError = errorMessage(error);
    emit(ctx, { phase: "thinking", message: `Saving the verified run failed: ${ctx.saveError}` });
  }
  return "ok";
}

async function answer(ctx: TurnContext): Promise<OperationOutcome> {
  const question = ctx.options.question?.trim();
  if (!question) throw new Error("A question is required");
  emit(ctx, { phase: "thinking", message: `Asking Qwen: ${question}` });
  const data = await post(ctx, "/api/hud/qwen/ask", { imageData: seen(ctx).frame, question });
  if (typeof data.answer !== "string") throw new Error("Qwen returned no answer");
  ctx.answer = data.answer;
  return "ok";
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const HANDLERS: Record<Operation, (ctx: TurnContext) => OperationOutcome | Promise<OperationOutcome>> = {
  capture,
  think,
  plan,
  apply_plan: applyPlan,
  simulate,
  start: executeNext,
  continue: executeNext,
  retry,
  error_fix: errorFix,
  check_completion: checkCompletion,
  save_best: saveBest,
  answer,
};

function link(ctx: TurnContext, op: Operation, detail?: string) {
  ctx.chain.push({ op, detail });
  ctx.options.onChain?.([...ctx.chain], formatChain(ctx.chain));
}

function linkDetail(ctx: TurnContext, op: Operation): string | undefined {
  if (op === "retry") return `${stepDetail(ctx) ?? "step"} (${ctx.retries + 1}/${MAX_STEP_RETRIES})`;
  if (op === "start" || op === "continue" || op === "error_fix") return stepDetail(ctx);
  return undefined;
}

/** Runs one operation, forwarding to a fresh capture first when it needs the current screen. */
async function runOperation(ctx: TurnContext, op: Operation): Promise<OperationOutcome> {
  ensureActive(ctx);
  if (FRESH_FRAME_OPS.has(op) && !ctx.fresh) {
    link(ctx, "capture");
    await capture(ctx);
  }
  link(ctx, op, linkDetail(ctx, op));
  const outcome = await HANDLERS[op](ctx);
  ensureActive(ctx);
  if (STALE_FRAME_OPS.has(op)) ctx.fresh = false;
  return outcome;
}

function finish(ctx: TurnContext, end: "done" | "stopped"): TurnLoopResult {
  if (ctx.answer !== undefined) return { status: "answered", answer: ctx.answer };
  if (end === "stopped") return { status: "planned", state: requireState(ctx), simulation: ctx.simulation };
  return { status: "completed", ...completedRun(ctx), saved: ctx.saved, saveError: ctx.saveError };
}

async function drive(ctx: TurnContext): Promise<TurnLoopResult> {
  let op: Operation = ctx.options.entry ?? "think";
  for (;;) {
    const next = nextOperation(op, await runOperation(ctx, op));
    if (next === "failed") throw new Error(ctx.problem ?? `${op} failed`);
    if (next === "done") return finish(ctx, "done");
    if (next === ctx.options.stopBefore) return finish(ctx, "stopped");
    op = next;
  }
}

const COMPLETION_MESSAGE: Record<Exclude<TurnLoopResult["status"], "failed">, string> = {
  completed: "Goal reached; every step verified",
  planned: "Plan verified against the current screen (dry run, nothing dispatched)",
  answered: "Qwen answered from a fresh screenshot",
};

/** Runs the Qwen turn chain; resolves with its real result or the reason it stopped. */
export async function runTurnLoop(goal: string, options: TurnLoopOptions, deps: GoalLoopDeps = defaultTurnDeps): Promise<TurnLoopResult> {
  const ctx: TurnContext = { goal: goal.trim(), options, deps, chain: [], fresh: false, retries: 0, simulation: [], saved: false };
  try {
    const result = await drive(ctx);
    emit(ctx, { phase: "completed", message: COMPLETION_MESSAGE[result.status as keyof typeof COMPLETION_MESSAGE] });
    return result;
  } catch (error) {
    const reason = options.signal.aborted ? "Stopped by user" : errorMessage(error);
    emit(ctx, { phase: "failed", message: reason });
    return { status: "failed", reason, state: ctx.state };
  }
}
