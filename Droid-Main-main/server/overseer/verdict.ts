import type { DriftMeasure, OverseerVerdictStatus } from "../../shared/overseer";

/** What the overseer's own vision check reported; every field is optional because models omit them. */
export interface StepAssessment {
  status?: string;
  verified?: boolean;
  /** 0..1 when the model gave one, otherwise null. */
  accuracyScore: number | null;
  /** Whether the declared expectation is visible; null when the model did not say. */
  expectationMet?: boolean | null;
  /** Whether the screen still serves the operation goal; null when the model did not say. */
  onTrack?: boolean | null;
  goalFinished?: boolean;
  analysis?: string;
  suggestedCorrection?: string;
}

export interface VerdictDecision {
  status: OverseerVerdictStatus;
  accuracyScore: number | null;
  analysis: string;
}

/** A model "verified" below this score is not trusted as verified. */
export const MIN_VERIFIED_SCORE = 0.5;
/** Below this percent of changed pixels the screen counts as unchanged. */
export const UNCHANGED_DIFF_PERCENT = 0.5;

const NO_CHANGE_ACTIONS = new Set(["wait", "screenshot", "hover", "observe"]);

/** Whether an action is expected to change what is on screen. */
export function expectsScreenChange(action: string): boolean {
  return !NO_CHANGE_ACTIONS.has(action);
}

function classifyAssessment(a: StepAssessment): OverseerVerdictStatus {
  if (a.status === "obstructed") return "obstructed";
  if (a.status === "completed_early" || a.goalFinished) return "completed_early";
  if (a.onTrack === false || a.status === "off_track") return "off_track";
  if (a.status === "missed" || a.expectationMet === false || a.verified === false) return "missed";
  const trusted = a.accuracyScore !== null && a.accuracyScore >= MIN_VERIFIED_SCORE;
  if (a.status === "verified" && trusted) return "verified";
  return "uncertain";
}

function screenUnchanged(drift: DriftMeasure | undefined): boolean {
  if (!drift) return false;
  if (drift.identical) return true;
  return drift.diffPercent !== null && drift.diffPercent < UNCHANGED_DIFF_PERCENT;
}

/**
 * Applies frame-level drift evidence. Drift never upgrades a verdict: an unchanged screen
 * after an action that should change it turns "verified" into "uncertain" (conflicting
 * evidence) and "uncertain" into "missed".
 */
export function applyDrift(
  decision: VerdictDecision,
  drift: DriftMeasure | undefined,
  action: string,
): VerdictDecision {
  if (!expectsScreenChange(action) || !screenUnchanged(drift)) return decision;
  const note = "Screen did not change after the action.";
  if (decision.status === "verified")
    return { ...decision, status: "uncertain", analysis: `${decision.analysis} ${note} Model and frame evidence disagree.` };
  if (decision.status === "uncertain")
    return { ...decision, status: "missed", analysis: `${decision.analysis} ${note}` };
  return decision;
}

/** Turns the overseer's assessment (null when no frame or no model answer) into a verdict. */
export function decideVerdict(
  assessment: StepAssessment | null,
  unavailableReason: string,
  drift: DriftMeasure | undefined,
  action: string,
): VerdictDecision {
  const base: VerdictDecision = assessment
    ? {
        status: classifyAssessment(assessment),
        accuracyScore: assessment.accuracyScore,
        analysis: assessment.analysis?.trim() || "The model returned no analysis.",
      }
    : { status: "uncertain", accuracyScore: null, analysis: unavailableReason };
  return applyDrift(base, drift, action);
}

/** Normalizes a raw model score into 0..1 or null; never invents one. */
export function normalizeScore(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return scaled >= 0 && scaled <= 1 ? scaled : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Maps a parsed model JSON reply onto a StepAssessment without filling gaps. */
export function assessmentFromModel(parsed: any): StepAssessment {
  const correction = parsed?.suggestedCorrection;
  return {
    status: typeof parsed?.status === "string" ? parsed.status : undefined,
    verified: typeof parsed?.verified === "boolean" ? parsed.verified : undefined,
    accuracyScore: normalizeScore(parsed?.accuracyScore),
    expectationMet: optionalBoolean(parsed?.expectationMet),
    onTrack: optionalBoolean(parsed?.onTrack),
    goalFinished: parsed?.goalFinished === true,
    analysis: typeof parsed?.analysis === "string" ? parsed.analysis : undefined,
    suggestedCorrection:
      typeof correction === "string" ? correction : correction?.reason ?? undefined,
  };
}
