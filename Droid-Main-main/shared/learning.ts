/** Habit/learning profile shared by /api/learning (server) and the HUD learning strip (client). */

export interface ClickZone {
  x: number;
  y: number;
  count: number;
  label: string;
}

/** A verified-run outcome fed back into the learning profile. */
export type LearningOutcomeKind =
  | "gate_verified"
  | "gate_blocked"
  | "target_not_found"
  | "user_override"
  | "step_completed"
  | "step_failed"
  | "coordinate_correction";

export const LEARNING_OUTCOME_KINDS: readonly LearningOutcomeKind[] = [
  "gate_verified",
  "gate_blocked",
  "target_not_found",
  "user_override",
  "step_completed",
  "step_failed",
  "coordinate_correction",
];

export interface LearningOutcome {
  kind: LearningOutcomeKind;
  x?: number;
  y?: number;
  /** Coordinate correction applied by calibration (new − old), for coordinate_correction. */
  dx?: number;
  dy?: number;
  label?: string;
}

export interface GateStats {
  /** Gate outcomes in the window (verified + blocked + not found + overrides). */
  attempts: number;
  verified: number;
  blocked: number;
  targetNotFound: number;
  overrides: number;
  /** verified / attempts; null when there were no gate outcomes. */
  successRate: number | null;
}

export interface MovementPreferences {
  /** Scales every replay step delay; learned from outcomes unless the user set it. */
  delayMultiplier: number;
  /** True when the user set delayMultiplier from the HUD; learning then leaves it alone. */
  userAdjusted: boolean;
  /** Zones where steps verified and completed; the replay prefers these. */
  preferredZones: ClickZone[];
}

export interface CorrectionStats {
  count: number;
  meanDx: number | null;
  meanDy: number | null;
}

export interface UserHabitProfile {
  totalActionsRecorded: number;
  appUsageFrequencies: Record<string, number>;
  topClickZones: ClickZone[];
  repetitiveActionDetected: boolean;
  /** Actions in the recent window matching the repeated action type (0 when none). */
  repetitiveActionCount: number;
  /** Share of the recent window that is the repeated action; null with fewer than 3 actions. */
  habitDetectionRate: number | null;
  repeatedPattern?: {
    actionType: string;
    count: number;
    coordinates?: { x: number; y: number };
    suggestedAutomation: string;
  };
  preferredDevice: "desktop" | "android";
  learnedWorkflowsCount: number;
  gateStats: GateStats;
  corrections: CorrectionStats;
  movement: MovementPreferences;
}

export const DELAY_MULTIPLIER_MIN = 1;
export const DELAY_MULTIPLIER_MAX = 2;

/** A step delay scaled by the learned/user multiplier. */
export function applyDelayMultiplier(delayMs: number, multiplier: number): number {
  return Math.round(delayMs * multiplier);
}
