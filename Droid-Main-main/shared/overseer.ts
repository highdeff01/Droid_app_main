/**
 * Overseer AI: the supervisory layer that independently verifies every AI
 * operation (replays, goal runs, assistant executions, autonomous loops,
 * trigger actions, habit routines, orchestrator operations).
 */

export const OPERATION_KINDS = [
  "replay",
  "goal_run",
  "assistant_execution",
  "autonomous_loop",
  "trigger_action",
  "habit_routine",
  "orchestrator",
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export type OperationStatus =
  | "running"
  | "paused"
  | "queued"
  | "completed"
  | "failed"
  | "cancelled";

export type FinishedStatus = Extract<OperationStatus, "completed" | "failed" | "cancelled">;

export type OverseerVerdictStatus =
  | "verified"
  | "missed"
  | "obstructed"
  | "off_track"
  | "completed_early"
  | "uncertain";

/** Screen rectangle in capture pixels. */
export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Safety caps the overseer enforces; null disables a cap. */
export interface OperationCaps {
  maxIterations: number | null;
  maxDurationMs: number | null;
  /** Non-repetition ledger: the same action signature may run at most this many times. */
  maxRepeats: number | null;
}

/** What an executor declares about one step it just completed. */
export interface OperationStepReport {
  stepId: string;
  name: string;
  action: string;
  x?: number;
  y?: number;
  text?: string;
  /** The operation's declared expectation for this step, compared against the fresh capture. */
  expectation?: string;
  /** Screen area the step acts on; used for conflict detection. */
  region?: ScreenRegion;
  /** The executor's own verification result; null when it did not verify. */
  executorVerified?: boolean | null;
  /** Frame captured before the action, used for the frame-level drift check. */
  beforeImage?: string;
}

/** Frame-level change between the step's before frame and the overseer's fresh capture. */
export interface DriftMeasure {
  /** Byte-identical frames: nothing on screen changed. */
  identical: boolean;
  /** Percent of differing pixels measured by the pixel-diff engine; null until measured. */
  diffPercent: number | null;
  method: "hash" | "pixel";
}

export interface OverseerVerdict {
  id: string;
  operationId: string;
  stepId?: string;
  status: OverseerVerdictStatus;
  /** Model-reported score; null when the model gave none or could not be reached. */
  accuracyScore: number | null;
  analysis: string;
  expectation?: string;
  executorVerified: boolean | null;
  /** The overseer's own fresh capture (data URL); absent when no frame was available. */
  evidenceImage?: string;
  beforeImage?: string;
  drift?: DriftMeasure;
  provider: "qwen" | "gemini" | "none";
  at: number;
}

export type InterventionKind =
  | "pause"
  | "retry"
  | "replan"
  | "queue"
  | "deprioritize"
  | "cap_stop";

export type InterventionStatus = "applied" | "pending_approval" | "approved" | "rejected";

export interface OverseerIntervention {
  id: string;
  operationId: string;
  kind: InterventionKind;
  reason: string;
  status: InterventionStatus;
  /** Proposed fix text for replan proposals. */
  proposal?: string;
  at: number;
  decidedAt?: number;
}

/** What an executor must do next; retry/replan are still dispatched through the action gate. */
export type OperationDirective = "continue" | "pause" | "retry" | "replan" | "stop";

export type CheckupOutcome = "complete" | "continuing" | "off_track" | "uncertain";

export interface CheckupReport {
  operationId: string;
  outcome: CheckupOutcome;
  summary: string;
  elapsedSeconds: number;
  at: number;
}

export interface SupervisedOperation {
  id: string;
  kind: OperationKind;
  /** Where the operation came from (engine, panel, device target). */
  source: string;
  goal: string;
  status: OperationStatus;
  /** Higher runs first; deprioritize lowers it. */
  priority: number;
  region?: ScreenRegion;
  caps: OperationCaps;
  startedAt: number;
  lastActivityAt: number;
  iterations: number;
  retriesUsed: number;
  /** Action signature -> times executed. */
  ledger: Record<string, number>;
  verdicts: OverseerVerdict[];
  lastCheckup?: CheckupReport;
  directive: OperationDirective;
  finishedAt?: number;
  detail?: string;
}

export interface OperationConflict {
  operationIds: [string, string];
  region: ScreenRegion;
}

export interface OverseerSnapshot {
  operations: SupervisedOperation[];
  interventions: OverseerIntervention[];
  conflicts: OperationConflict[];
}

export interface OperationRegistrationInput {
  id?: string;
  kind: OperationKind;
  source: string;
  goal: string;
  region?: ScreenRegion;
  caps?: Partial<OperationCaps>;
  priority?: number;
}
