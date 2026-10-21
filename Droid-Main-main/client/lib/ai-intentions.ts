import type { ReplayRun } from "@shared/replay";
import type { ClickZone, LearningOutcome, UserHabitProfile } from "@shared/learning";
import type { ComplexGoal } from "@/components/goals-manager-panel";
import type { SequenceStep } from "@/components/live-screen-hud";
import type { GateResult, GateTarget } from "@/lib/action-gate";

/**
 * Pure derivations behind the HUD "AI Intentions, Goals & Learning" panel.
 * Every value comes from the gate result, the replay run, the goals state or the
 * /api/learning profile; a missing source yields null, never a placeholder number.
 */

/** The latest action-gate check, as the HUD reports it. */
export interface GateReport {
  status: "verifying" | "verified" | "blocked" | "override";
  stepLabel?: string;
  targetLabel?: string;
  x: number;
  y: number;
  elementName?: string;
  /** Elements in the analysis behind this check; null while verifying or when none completed. */
  elementsDetected: number | null;
  reason?: string;
}

export interface Intention {
  what: string;
  why: string;
  source: "replay" | "gate";
}

/** A goal that may carry the HUD sequence snapshot it executes. */
export interface RunnableGoal extends ComplexGoal {
  steps?: SequenceStep[];
}

type StepNameSource = Pick<SequenceStep, "id" | "name">;

const LIVE_RUN = new Set<ReplayRun["status"]>(["running", "paused"]);

export function isLiveRun(run: ReplayRun | null | undefined): run is ReplayRun {
  return !!run && LIVE_RUN.has(run.status);
}

/** The step the gate verifies, named for the blocked reason: "#2 Click Submit". */
export function gateStepLabel(steps: SequenceStep[], target: GateTarget): string {
  const step =
    steps.find((s) => s.x === target.x && s.y === target.y) ?? steps[0];
  return `#${step.stepNumber} ${step.name}`;
}

/** The HUD report for a gate request still in flight. */
export function verifyingGateReport(target: GateTarget, stepLabel: string): GateReport {
  return {
    status: "verifying",
    stepLabel,
    targetLabel: target.label,
    x: target.x,
    y: target.y,
    elementsDetected: null,
  };
}

/** The HUD report for a finished gate check; `override` marks a user-verified dispatch. */
export function gateReportFromResult(
  result: GateResult,
  target: GateTarget,
  stepLabel: string,
  override = false,
): GateReport {
  const base = { stepLabel, targetLabel: target.label, x: target.x, y: target.y };
  if (result.status === "verified") {
    return {
      ...base,
      status: override ? "override" : "verified",
      elementName: result.element?.name,
      elementsDetected: (result.report.elements ?? []).length,
    };
  }
  const detail = result.status === "blocked" ? result.detail : undefined;
  return {
    ...base,
    status: "blocked",
    x: detail?.x ?? target.x,
    y: detail?.y ?? target.y,
    elementsDetected: detail?.elementsDetected ?? null,
    reason: result.reason,
  };
}

/** The learning outcome a finished gate check feeds back; null for a cancelled check. */
export function gateOutcome(result: GateResult, target: GateTarget): LearningOutcome | null {
  const point = { x: target.x, y: target.y, label: target.label };
  if (result.status === "verified") return { kind: "gate_verified", ...point };
  if (result.status === "cancelled") return null;
  const kind = result.detail?.stage === "target_not_found" ? "target_not_found" : "gate_blocked";
  return { kind, ...point };
}

function stepName(sequence: StepNameSource[], id: string | undefined, index: number): string {
  return sequence.find((s) => s.id === id)?.name ?? `step ${index + 1}`;
}

function replayIntention(run: ReplayRun, sequence: StepNameSource[]): Intention {
  const step = run.steps[run.currentStep];
  const name = stepName(sequence, step?.id, run.currentStep);
  const decision = [...run.events].reverse().find((e) => !step || e.stepId === step.id);
  const verb = run.status === "paused" ? "Paused at" : "Running";
  return {
    what: `${verb} ${name} (${run.currentStep + 1}/${run.steps.length})`,
    why: decision ? `${decision.phase}: ${decision.detail}` : "Waiting for the replay runner's first decision",
    source: "replay",
  };
}

const GATE_WHAT: Record<GateReport["status"], (r: GateReport) => string> = {
  verifying: (r) => `Verifying ${r.stepLabel ?? "action"} before acting`,
  verified: (r) => `Acting on "${r.elementName ?? r.targetLabel ?? "screen"}" (${r.stepLabel ?? "action"})`,
  blocked: (r) => `Blocked ${r.stepLabel ?? "action"}`,
  override: (r) => `Acting on user-verified override (${r.stepLabel ?? "action"})`,
};

function gateWhy(report: GateReport): string {
  if (report.status === "verifying") return "Capturing and analyzing the screen to confirm the target";
  if (report.status === "blocked") return report.reason ?? "The action gate blocked this action";
  const elements = report.elementsDetected ?? 0;
  if (report.status === "override") {
    return `Target not detected at (${report.x}, ${report.y}); the user confirmed it (${elements} elements analyzed)`;
  }
  return `Target verified at (${report.x}, ${report.y}) among ${elements} detected elements`;
}

/** What the AI is doing now and why: the live replay step first, else the latest gate check. */
export function deriveIntention(
  gate: GateReport | null,
  run: ReplayRun | null,
  sequence: StepNameSource[],
): Intention | null {
  if (isLiveRun(run)) return replayIntention(run, sequence);
  if (!gate) return null;
  return { what: GATE_WHAT[gate.status](gate), why: gateWhy(gate), source: "gate" };
}

/** One line on a replay run: progress, iteration, status and its error. */
export function runSummary(run: ReplayRun | null): string | null {
  if (!run) return null;
  const error = run.error ? ` — ${run.error}` : "";
  return `${run.completed}/${run.total} actions · iteration ${run.iteration} · ${run.status}${error}`;
}

const RUN_TO_GOAL: Record<ReplayRun["status"], ComplexGoal["status"]> = {
  running: "in_progress",
  paused: "in_progress",
  completed: "completed",
  failed: "failed",
  cancelled: "blocked",
};

export function goalStatusFromRun(run: ReplayRun): ComplexGoal["status"] {
  return RUN_TO_GOAL[run.status];
}

/** A goal updated from its run: status, progress and subtasks checked off by replay step id. */
export function applyRunToGoal<G extends ComplexGoal>(goal: G, run: ReplayRun): G {
  const status = goalStatusFromRun(run);
  const progressPercent =
    status === "completed" ? 100 : run.total > 0 ? Math.round((run.completed / run.total) * 100) : goal.progressPercent;
  const subtasks = goal.subtasks.map((sub) => {
    const step = run.steps.find((s) => s.id === sub.id);
    return step ? { ...sub, status: step.status } : sub;
  });
  return { ...goal, status, progressPercent, subtasks };
}

/** Goals whose run is `run` follow it; returns `goals` itself when none is linked. */
export function syncGoalsWithRun<G extends ComplexGoal>(
  goals: G[],
  goalRuns: Record<string, string>,
  run: ReplayRun | null,
): G[] {
  if (!run || !goals.some((g) => goalRuns[g.id] === run.id)) return goals;
  return goals.map((g) => (goalRuns[g.id] === run.id ? applyRunToGoal(g, run) : g));
}

export function activeGoal<G extends ComplexGoal>(goals: G[]): G | null {
  return goals.find((g) => g.status === "in_progress") ?? null;
}

export function completedGoals<G extends ComplexGoal>(goals: G[]): G[] {
  return goals.filter((g) => g.status === "completed");
}

/** A HUD-created goal that snapshots the current sequence as its steps and subtasks. */
export function goalFromSequence(id: string, title: string, steps: SequenceStep[]): RunnableGoal {
  const first = steps[0];
  const center = first ? { x: first.x, y: first.y } : { x: 0, y: 0 };
  return {
    id,
    title,
    description: `${steps.length} step${steps.length === 1 ? "" : "s"} captured from the HUD sequence`,
    priority: 3,
    status: "pending",
    category: "navigation",
    targetRegion: { ...center, width: 0, height: 0 },
    targetCenter: center,
    targetLabel: first ? first.targetOcrLabel || first.name : "",
    policy: {
      mode: "strict_verification",
      maxRetries: 0,
      timeoutSeconds: 45,
      requireVisualConfirmation: true,
      autoTriggerOnCaptcha: false,
    },
    dependencies: [],
    subtasks: steps.map((s) => ({ id: s.id, title: s.name, action: s.action, status: "pending" as const })),
    progressPercent: 0,
    steps: steps.map((s) => ({ ...s, status: "pending" as const })),
  };
}

/** The steps a goal executes: its snapshot, else one click on its target; null when it has neither. */
export function goalExecutionSteps(goal: RunnableGoal): SequenceStep[] | null {
  if (goal.steps?.length) return goal.steps;
  const center = goal.targetCenter;
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y) || (center.x === 0 && center.y === 0)) {
    return null;
  }
  return [
    {
      id: goal.subtasks[0]?.id ?? goal.id,
      stepNumber: 1,
      name: goal.targetLabel || goal.title,
      action: "click",
      x: center.x,
      y: center.y,
      delayMs: 500,
      status: "pending",
      targetOcrLabel: goal.targetLabel || undefined,
    },
  ];
}

export interface LearningMetrics {
  habitDetectionRate: number | null;
  repetitiveActionCount: number | null;
  topZones: ClickZone[];
  learnedWorkflows: number | null;
  gateSuccessRate: number | null;
  gateAttempts: number | null;
  delayMultiplier: number | null;
  userAdjusted: boolean;
}

/** The metrics strip, straight from the profile; all null without one. */
export function learningMetrics(profile: UserHabitProfile | null): LearningMetrics {
  return {
    habitDetectionRate: profile?.habitDetectionRate ?? null,
    repetitiveActionCount: profile ? profile.repetitiveActionCount : null,
    topZones: profile?.topClickZones.slice(0, 3) ?? [],
    learnedWorkflows: profile ? profile.learnedWorkflowsCount : null,
    gateSuccessRate: profile?.gateStats.successRate ?? null,
    gateAttempts: profile ? profile.gateStats.attempts : null,
    delayMultiplier: profile ? profile.movement.delayMultiplier : null,
    userAdjusted: profile?.movement.userAdjusted ?? false,
  };
}

/** "—" for a missing value, else a whole percent. */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function formatCount(value: number | null): string {
  return value === null ? "—" : String(value);
}

/** Step outcomes of `run` not yet reported; `seen` collects the keys reported. */
export function newStepOutcomes(
  run: ReplayRun,
  sequence: SequenceStep[],
  seen: Set<string>,
): LearningOutcome[] {
  const outcomes: LearningOutcome[] = [];
  for (const step of run.steps) {
    if (step.status !== "completed" && step.status !== "failed") continue;
    const key = `${run.id}:${run.iteration}:${step.id}:${step.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const source = sequence.find((s) => s.id === step.id);
    outcomes.push({
      kind: step.status === "completed" ? "step_completed" : "step_failed",
      x: source?.x,
      y: source?.y,
      label: source?.name,
    });
  }
  return outcomes;
}

interface CalibratedStepLike {
  x: number;
  y: number;
  name?: string;
  offsetX?: number;
  offsetY?: number;
}

/** Coordinate corrections the calibration system applied, as learning outcomes. */
export function correctionOutcomes(steps: CalibratedStepLike[]): LearningOutcome[] {
  return steps
    .filter((s) => (s.offsetX ?? 0) !== 0 || (s.offsetY ?? 0) !== 0)
    .map((s) => ({
      kind: "coordinate_correction" as const,
      x: s.x,
      y: s.y,
      dx: s.offsetX ?? 0,
      dy: s.offsetY ?? 0,
      label: s.name,
    }));
}

async function learningRequest(url: string, body?: unknown): Promise<UserHabitProfile> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true || !data.profile) {
    throw new Error(data.error || `${url} returned HTTP ${response.status}`);
  }
  return data.profile as UserHabitProfile;
}

export const fetchLearningProfile = () => learningRequest("/api/learning/habits");

export const postLearningOutcomes = (outcomes: LearningOutcome[]) =>
  learningRequest("/api/learning/record-outcome", { outcomes });

/** Set the user's delay multiplier; null hands it back to learning. */
export const postDelayMultiplier = (delayMultiplier: number | null) =>
  learningRequest("/api/learning/movement", { delayMultiplier });
