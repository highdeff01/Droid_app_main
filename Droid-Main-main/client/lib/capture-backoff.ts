/**
 * Live-capture poll pacing: normal cadence while frames arrive, exponential
 * backoff (capped) on consecutive failures, and the slow cap while the
 * backend-unreachable banner is shown. Only a real frame resets the streak.
 */

export const CAPTURE_POLL_MS = 600;
export const CAPTURE_BACKOFF_MAX_MS = 10_000;

/** One capture attempt: a real frame, a standby reply (no live source yet), or a failure. */
export type CaptureOutcome = "frame" | "standby" | "failure";

/** Next consecutive-failure count: a frame resets it, standby leaves it, a failure adds one. */
export function nextFailureStreak(streak: number, outcome: CaptureOutcome): number {
  if (outcome === "frame") return 0;
  if (outcome === "standby") return streak;
  return streak + 1;
}

/** Delay before the next capture: 600 ms × 2^streak, capped; the cap while the backend is unreachable. */
export function captureDelayMs(streak: number, backendUnreachable: boolean): number {
  if (backendUnreachable) return CAPTURE_BACKOFF_MAX_MS;
  return Math.min(CAPTURE_POLL_MS * 2 ** streak, CAPTURE_BACKOFF_MAX_MS);
}
