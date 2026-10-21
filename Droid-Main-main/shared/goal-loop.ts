/**
 * Goal-driven workflow loop: the pure logic shared by the server planner
 * routes and the client runner. Goal state tracking, per-step verification
 * against a freshly analyzed screen, target relocation, off-track detection
 * and best-flow versioning. Nothing here talks to a device or a model.
 */
import { z } from "zod";

/** Slack around an element box when matching a point (same as the action gate). */
export const TARGET_SLACK_PX = 12;
/** Consecutive failed verifications that mark a run off-track. */
export const MAX_CONSECUTIVE_FAILURES = 2;
/** Consecutive steps that expected a change but left the screen unchanged. */
export const MAX_UNCHANGED_STEPS = 3;
/** Approved re-plans one goal may go through before the run gives up. */
export const MAX_REVISIONS = 3;

export const GOAL_STEP_ACTIONS = [
  "click",
  "double_click",
  "right_click",
  "clear_and_type",
  "type_text",
  "press_key",
  "hotkey",
  "scroll",
  "wait",
] as const;
export type GoalStepAction = (typeof GOAL_STEP_ACTIONS)[number];

const POSITIONAL: ReadonlySet<GoalStepAction> = new Set([
  "click",
  "double_click",
  "right_click",
  "clear_and_type",
  "type_text",
  "scroll",
]);
const TEXT_ENTRY: ReadonlySet<GoalStepAction> = new Set([
  "clear_and_type",
  "type_text",
]);

export const stepExpectationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("element_present"), label: z.string().min(1) }),
  z.object({ kind: z.literal("screen_changed") }),
  z.object({ kind: z.literal("text_found"), text: z.string().min(1) }),
  z.object({ kind: z.literal("none") }),
]);
export type StepExpectation = z.infer<typeof stepExpectationSchema>;

export const goalStepSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(500),
  action: z.enum(GOAL_STEP_ACTIONS),
  x: z.number().finite().min(0).max(16384),
  y: z.number().finite().min(0).max(16384),
  targetLabel: z.string().max(500).optional(),
  text: z.string().max(4000).optional(),
  keyPayload: z.string().max(100).optional(),
  delayMs: z.number().int().min(0).max(5000).default(500),
  expectation: stepExpectationSchema,
});
export type GoalStep = z.infer<typeof goalStepSchema>;

export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObservedElement {
  name: string;
  textValue?: string;
  boundingBox: BoxLike;
  center: { x: number; y: number };
  confidence?: number;
}

/** One freshly captured and analyzed screen. */
export interface ScreenObservation {
  /** Frame hash when the capture gave one, else the analysis signature. */
  signature: string;
  description: string;
  elements: ObservedElement[];
  /** OCR lines read from the frame; empty when OCR produced none. */
  ocrText: string[];
  confidence?: number;
  capturedAt: number;
}

export interface ReportLike {
  screenDescription?: string;
  activeWindow?: string;
  elements?: ObservedElement[];
  confidence?: number;
}

export const isPositional = (action: GoalStepAction) => POSITIONAL.has(action);

const normalize = (value: string) => value.trim().toLowerCase();

/** Stable identity of an analyzed screen, used when the capture has no frame hash. */
export function reportSignature(report: ReportLike): string {
  const names = (report.elements ?? []).map((el) => normalize(el.name)).sort();
  return [normalize(report.activeWindow ?? ""), ...names].join("|");
}

/** Builds the observation for a fresh capture + analysis (+ OCR lines). */
export function observeScreen(
  report: ReportLike,
  ocrText: string[],
  frameHash?: string,
  capturedAt = Date.now(),
): ScreenObservation {
  return {
    signature: frameHash || reportSignature(report),
    description: report.screenDescription ?? "",
    elements: (report.elements ?? []).filter((el) => el.boundingBox),
    ocrText,
    confidence: report.confidence,
    capturedAt,
  };
}

export function boxContains(box: BoxLike, x: number, y: number): boolean {
  return (
    x >= box.x - TARGET_SLACK_PX &&
    x <= box.x + box.width + TARGET_SLACK_PX &&
    y >= box.y - TARGET_SLACK_PX &&
    y <= box.y + box.height + TARGET_SLACK_PX
  );
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The element's name or text equals the label or contains it as whole words. */
function labelMatches(el: ObservedElement, label: string): boolean {
  const wanted = normalize(label);
  if (!wanted) return false;
  const wholeWords = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(wanted)}($|[^\\p{L}\\p{N}])`, "u");
  return [el.name, el.textValue ?? ""].some((v) => wholeWords.test(normalize(v)));
}

const area = (el: ObservedElement) =>
  el.boundingBox.width * el.boundingBox.height;

/** Smallest element whose padded box contains the point. */
export function elementAt(
  elements: ObservedElement[],
  x: number,
  y: number,
): ObservedElement | undefined {
  return elements
    .filter((el) => boxContains(el.boundingBox, x, y))
    .sort((a, b) => area(a) - area(b))[0];
}

/** Elements whose name or text matches the label, nearest to (x, y) first. */
export function elementsLabelled(
  elements: ObservedElement[],
  label: string,
  x: number,
  y: number,
): ObservedElement[] {
  const dist = (el: ObservedElement) =>
    Math.hypot(el.center.x - x, el.center.y - y);
  return elements
    .filter((el) => labelMatches(el, label))
    .sort((a, b) => dist(a) - dist(b));
}

/** True when any OCR line or element text on the screen contains the text. */
export function textOnScreen(observation: ScreenObservation, text: string) {
  const wanted = normalize(text);
  const sources = [
    ...observation.ocrText,
    ...observation.elements.flatMap((el) => [el.name, el.textValue ?? ""]),
  ];
  return sources.some((s) => normalize(s).includes(wanted));
}

export type Relocation =
  | { status: "not_positional" }
  | { status: "in_place"; element: ObservedElement }
  | { status: "moved"; element: ObservedElement; x: number; y: number; distancePx: number }
  | { status: "missing"; reason: string };

/**
 * Re-checks a step's target against a freshly analyzed screen. A labelled
 * target is looked up by label first: under the planned point it is in place,
 * elsewhere it moved (to its new center). An unlabelled target must have an
 * element under the planned point.
 */
export function relocateTarget(
  step: GoalStep,
  observation: ScreenObservation,
): Relocation {
  if (!isPositional(step.action)) return { status: "not_positional" };
  const { elements } = observation;
  if (!step.targetLabel) {
    const element = elementAt(elements, step.x, step.y);
    return element
      ? { status: "in_place", element }
      : { status: "missing", reason: `No element at (${step.x}, ${step.y}) on the fresh screen` };
  }
  const matches = elementsLabelled(elements, step.targetLabel, step.x, step.y);
  const inPlace = matches.find((el) => boxContains(el.boundingBox, step.x, step.y));
  if (inPlace) return { status: "in_place", element: inPlace };
  const nearest = matches[0];
  if (!nearest) {
    return { status: "missing", reason: `"${step.targetLabel}" is not on the fresh screen` };
  }
  const x = Math.round(nearest.center.x);
  const y = Math.round(nearest.center.y);
  return {
    status: "moved",
    element: nearest,
    x,
    y,
    distancePx: Math.round(Math.hypot(x - step.x, y - step.y)),
  };
}

/** The step re-grounded on its moved target; any other relocation leaves it as is. */
export function applyRelocation(step: GoalStep, relocation: Relocation): GoalStep {
  return relocation.status === "moved"
    ? { ...step, x: relocation.x, y: relocation.y }
    : step;
}

export interface StepVerification {
  passed: boolean;
  screenChanged: boolean;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
}

type ExpectationCheck = (
  expectation: any,
  before: ScreenObservation,
  after: ScreenObservation,
) => { passed: boolean; detail: string } | null;

const EXPECTATION_CHECKS: Record<StepExpectation["kind"], ExpectationCheck> = {
  element_present: (e: { label: string }, _b, after) => {
    const found = elementsLabelled(after.elements, e.label, 0, 0)[0];
    return {
      passed: Boolean(found) || textOnScreen(after, e.label),
      detail: found ? `"${e.label}" present as ${found.name}` : `"${e.label}" not found after the step`,
    };
  },
  screen_changed: (_e, before, after) => {
    const changed = before.signature !== after.signature;
    return { passed: changed, detail: changed ? "Screen changed" : "Screen did not change" };
  },
  text_found: (e: { text: string }, _b, after) => {
    const found = textOnScreen(after, e.text);
    return { passed: found, detail: found ? `Text "${e.text}" found` : `Text "${e.text}" not found` };
  },
  none: () => null,
};

/**
 * For typing steps: the typed text must be readable afterwards and must be new —
 * text that was already on an unchanged screen proves nothing landed.
 */
function textLandedCheck(step: GoalStep, before: ScreenObservation, after: ScreenObservation) {
  if (!TEXT_ENTRY.has(step.action) || !step.text) return null;
  const visible = textOnScreen(after, step.text);
  const preExisting = textOnScreen(before, step.text) && before.signature === after.signature;
  const landed = visible && !preExisting;
  const detail = landed
    ? "Typed text visible in the field"
    : visible
      ? `"${step.text}" was already on screen and nothing changed`
      : `Typed text "${step.text}" not visible after typing`;
  return { check: "text_landed", passed: landed, detail };
}

/**
 * A step the planner gave no expectation still needs evidence: a wait only has
 * to elapse, anything else that is not a text entry (checked by text_landed)
 * must change the screen.
 */
function defaultCheck(step: GoalStep, before: ScreenObservation, after: ScreenObservation) {
  if (step.action === "wait") return { check: "waited", passed: true, detail: `Waited ${step.delayMs}ms` };
  if (TEXT_ENTRY.has(step.action) && step.text) return null;
  return { check: "screen_changed", ...EXPECTATION_CHECKS.screen_changed(step.expectation, before, after)! };
}

/** Verifies a step's expected outcome on the screen captured after it ran; no evidence is a failure. */
export function verifyStep(
  step: GoalStep,
  before: ScreenObservation,
  after: ScreenObservation,
): StepVerification {
  const checks: StepVerification["checks"] = [];
  const expected = EXPECTATION_CHECKS[step.expectation.kind](step.expectation, before, after);
  const fallback = expected ? null : defaultCheck(step, before, after);
  if (expected) checks.push({ check: step.expectation.kind, ...expected });
  if (fallback) checks.push(fallback);
  const landed = textLandedCheck(step, before, after);
  if (landed) checks.push(landed);
  return {
    passed: checks.length > 0 && checks.every((c) => c.passed),
    screenChanged: before.signature !== after.signature,
    checks,
  };
}

export interface ExecutedStep {
  step: GoalStep;
  verification: StepVerification;
  relocation: Relocation["status"];
  signatureAfter: string;
  /** Screenshot captured after the step (data URL). */
  screenshot?: string;
  confidence?: number;
  at: number;
}

export type GoalStatus =
  | "planning"
  | "testing"
  | "awaiting_approval"
  | "completed"
  | "failed";

export interface GoalState {
  /** The user's goal; carried through every re-plan unchanged. */
  readonly goal: string;
  status: GoalStatus;
  plan: GoalStep[];
  cursor: number;
  executed: ExecutedStep[];
  visited: string[];
  revisions: number;
}

export function createGoalState(goal: string, plan: GoalStep[], startSignature: string): GoalState {
  if (!goal.trim()) throw new Error("A goal is required");
  if (plan.length === 0) throw new Error("The plan has no steps");
  return { goal, status: "testing", plan, cursor: 0, executed: [], visited: [startSignature], revisions: 0 };
}

export const nextStep = (state: GoalState): GoalStep | undefined => state.plan[state.cursor];

/** Records an executed step; the cursor advances only past a verified step. */
export function recordStepResult(state: GoalState, executed: ExecutedStep): GoalState {
  return {
    ...state,
    executed: [...state.executed, executed],
    visited: [...state.visited, executed.signatureAfter],
    cursor: executed.verification.passed ? state.cursor + 1 : state.cursor,
  };
}

export type ProgressAssessment =
  | { kind: "on_track" }
  | { kind: "off_track" | "stalled" | "backtrack"; reason: string };

function trailing<T>(items: T[], test: (item: T) => boolean): number {
  let count = 0;
  for (let i = items.length - 1; i >= 0 && test(items[i]); i--) count++;
  return count;
}

const expectsChange = (e: ExecutedStep) =>
  e.step.action !== "wait" && e.step.expectation.kind !== "none";

/**
 * Cross-checks the executed steps and the screens they produced:
 * repeated failed verifications are off-track, steps that keep leaving the
 * screen unchanged are a stall, and coming back to an earlier screen after a
 * step that should have moved forward is a backtrack (a dead route).
 */
export function assessProgress(state: GoalState): ProgressAssessment {
  const { executed, visited } = state;
  const failures = trailing(executed, (e) => !e.verification.passed);
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    const last = executed[executed.length - 1];
    const detail = last.verification.checks.find((c) => !c.passed)?.detail ?? "verification failed";
    return { kind: "off_track", reason: `${failures} steps in a row failed verification (last: ${detail})` };
  }
  const unchanged = trailing(executed, (e) => expectsChange(e) && !e.verification.screenChanged);
  if (unchanged >= MAX_UNCHANGED_STEPS) {
    return { kind: "stalled", reason: `${unchanged} steps left the screen unchanged` };
  }
  const last = executed[executed.length - 1];
  if (last && last.verification.screenChanged && expectsChange(last)) {
    const earlier = visited.slice(0, -2);
    if (earlier.includes(last.signatureAfter)) {
      return { kind: "backtrack", reason: `"${last.step.name}" returned to an earlier screen (dead route)` };
    }
  }
  return { kind: "on_track" };
}

export interface PlanProposal {
  goal: string;
  reason: string;
  steps: GoalStep[];
}

/**
 * Verified steps that still lead forward: when the current screen was already
 * visited earlier, the verified steps taken since that first visit were a dead
 * route (a loop back) and are dropped, so the rerouted flow skips them.
 */
function stepsOffDeadRoute(state: GoalState): GoalStep[] {
  const current = state.visited[state.visited.length - 1];
  const firstVisit = state.visited.indexOf(current);
  const loopedBack = state.visited.slice(firstVisit).some((s) => s !== current);
  return state.executed
    .slice(0, loopedBack ? firstVisit : state.executed.length)
    .filter((e) => e.verification.passed)
    .map((e) => e.step);
}

/**
 * Adopts an approved re-plan for the remaining steps. The goal is kept, as are
 * the verified steps that lead to the current screen (a dead route is cut);
 * a proposal for a different goal is refused.
 */
export function applyApprovedPlan(state: GoalState, proposal: PlanProposal): GoalState {
  if (proposal.goal !== state.goal) {
    throw new Error("The proposal targets a different goal; the goal is never changed by re-planning");
  }
  if (state.revisions >= MAX_REVISIONS) {
    throw new Error(`The goal was already re-planned ${MAX_REVISIONS} times`);
  }
  if (proposal.steps.length === 0) throw new Error("The proposal has no steps");
  const done = stepsOffDeadRoute(state);
  return {
    ...state,
    status: "testing",
    plan: [...done, ...proposal.steps],
    cursor: done.length,
    revisions: state.revisions + 1,
  };
}

/** The verified workflow (as executed, re-grounded coordinates included) that leads to the current screen, dead routes excluded. */
export const verifiedSteps = (state: GoalState): GoalStep[] => stepsOffDeadRoute(state);

/** Raw planner output → validated goal steps; drops anything that is not a well-formed step. */
export function parseProposedSteps(raw: unknown, idPrefix = "goal_step"): GoalStep[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.flatMap((item, index) => {
    const candidate = { id: `${idPrefix}_${index + 1}`, delayMs: 500, x: 0, y: 0, expectation: { kind: "none" }, ...item };
    const parsed = goalStepSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Grounds proposed steps on the analyzed screen: a positional step must sit
 * on (or name) an element that the perception actually reported, else it is
 * rejected. Only the first step can be grounded against the current screen;
 * later steps act on screens that do not exist yet, so they are kept and
 * re-checked against the fresh screen right before they run.
 */
export function groundFirstStep(
  steps: GoalStep[],
  observation: ScreenObservation,
): { steps: GoalStep[]; rejected?: string } {
  const [first, ...rest] = steps;
  if (!first) return { steps, rejected: "The planner proposed no valid steps" };
  const relocation = relocateTarget(first, observation);
  if (relocation.status === "missing") {
    return { steps: [], rejected: `First step "${first.name}" rejected: ${relocation.reason}` };
  }
  return { steps: [applyRelocation(first, relocation), ...rest] };
}

// ---------------------------------------------------------------------------
// Best-flow versioning
// ---------------------------------------------------------------------------

export interface GoalAssessment {
  complete: boolean;
  onTrack: boolean;
  reason: string;
  confidence?: number;
}

export const runEvidenceSchema = z.object({
  steps: z
    .array(
      z.object({
        stepId: z.string(),
        passed: z.boolean(),
        checks: z.array(z.object({ check: z.string(), passed: z.boolean(), detail: z.string() })),
        screenshot: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .min(1),
  goalAssessment: z.object({
    complete: z.boolean(),
    onTrack: z.boolean(),
    reason: z.string(),
    confidence: z.number().optional(),
  }),
  finalScreenshot: z.string().optional(),
});
export type RunEvidence = z.infer<typeof runEvidenceSchema>;

export interface FlowVersion {
  version: number;
  steps: GoalStep[];
  evidence: RunEvidence;
  confirmed: boolean;
  createdAt: number;
}

export interface BestFlow {
  id: string;
  name: string;
  goal: string;
  versions: FlowVersion[];
  /** The confirmed version replays follow; undefined until the user confirms one. */
  bestVersion?: number;
  updatedAt: number;
}

/** Evidence from a run in which every step verified and the goal was reached. */
export function evidenceProvesRun(evidence: RunEvidence): string | null {
  const failed = evidence.steps.find((s) => !s.passed);
  if (failed) return `Step ${failed.stepId} did not verify`;
  if (!evidence.goalAssessment.complete) return `Goal not reached: ${evidence.goalAssessment.reason}`;
  return null;
}

/** Appends a verified run as a new version; it never replaces the confirmed best. */
export function addFlowVersion(
  flow: BestFlow,
  steps: GoalStep[],
  evidence: RunEvidence,
  now = Date.now(),
): BestFlow {
  const problem = evidenceProvesRun(evidence);
  if (problem) throw new Error(`Only a fully verified run can be saved: ${problem}`);
  if (steps.length === 0) throw new Error("A saved flow needs at least one step");
  const version = Math.max(0, ...flow.versions.map((v) => v.version)) + 1;
  return {
    ...flow,
    versions: [...flow.versions, { version, steps, evidence, confirmed: false, createdAt: now }],
    updatedAt: now,
  };
}

/**
 * Confirms a version as the best flow. Replacing a different confirmed best
 * needs explicit approval so an improved variant never silently overwrites it.
 */
export function confirmBestVersion(
  flow: BestFlow,
  version: number,
  approvedReplace: boolean,
  now = Date.now(),
): BestFlow {
  if (!flow.versions.some((v) => v.version === version)) {
    throw new Error(`Version ${version} does not exist`);
  }
  if (flow.bestVersion !== undefined && flow.bestVersion !== version && !approvedReplace) {
    throw new Error(`Version ${flow.bestVersion} is the confirmed best; approve replacing it first`);
  }
  return {
    ...flow,
    bestVersion: version,
    versions: flow.versions.map((v) => (v.version === version ? { ...v, confirmed: true } : v)),
    updatedAt: now,
  };
}

export const bestVersionOf = (flow: BestFlow): FlowVersion | undefined =>
  flow.versions.find((v) => v.version === flow.bestVersion);
