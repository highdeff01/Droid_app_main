/**
 * Presentations of AI operations: built on demand from a finished replay run
 * (client buildPresentation) or kept as a background draft the server refreshes
 * from overseer-verified steps while the operation runs.
 */

export interface PresentationSlide {
  stepId: string;
  name: string;
  status: string;
  events: Array<{ at: number; phase: string; detail: string }>;
  screenshotUrl?: string;
  confidence?: number;
}

export interface Presentation {
  runId: string;
  status: "running" | "paused" | "queued" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completed: number;
  total: number;
  error?: string;
  slides: PresentationSlide[];
}

/** A presentation the background pipeline keeps current; draft until the operation finishes. */
export interface PresentationDraft extends Presentation {
  draft: boolean;
  kind: string;
  goal: string;
  updatedAt: number;
  durationMs: number;
  /** Steps the executor reported but the overseer has not (or not yet) verified. */
  unverifiedSteps: number;
}
