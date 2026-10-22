/**
 * The unified progress stream every tab subscribes to: run progress, goal status,
 * trigger events, errors and notes, with logs and a key screenshot attached.
 */

export const PROGRESS_KINDS = ["run", "goal", "trigger", "error", "note", "presentation"] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];

export const PROGRESS_LEVELS = ["info", "success", "warning", "error"] as const;
export type ProgressLevel = (typeof PROGRESS_LEVELS)[number];

export interface ProgressEvent {
  /** Monotonic cursor; poll with ?since=<seq> for everything after it. */
  seq: number;
  kind: ProgressKind;
  level: ProgressLevel;
  title: string;
  detail: string;
  /** Operation / run the event belongs to. */
  operationId?: string;
  /** Status of that operation when known (running, completed, failed...). */
  status?: string;
  logs: string[];
  /** PNG/JPEG data URL captured with the event. */
  screenshot?: string;
  at: number;
}

export type ProgressEventInput = Omit<ProgressEvent, "seq" | "at" | "logs" | "level"> & {
  level?: ProgressLevel;
  logs?: string[];
};

export interface ProgressPage {
  events: ProgressEvent[];
  /** Pass back as ?since= to get only newer events. */
  cursor: number;
}

/** Screenshots attached to progress events and notes must be PNG/JPEG data URLs. */
export const SCREENSHOT_DATA_URL = /^data:image\/(png|jpeg);base64,/;
