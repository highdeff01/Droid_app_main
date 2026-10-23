/**
 * Pointer helpers for the Live Screen HUD viewport, whose own click handler
 * dispatches REAL device clicks. Kept pure so they are testable without a DOM.
 */

/** Elements whose clicks are UI interactions, never a click on the mirrored screen. */
export const HUD_CONTROL_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="slider"], [role="switch"], [role="checkbox"], [data-hud-control]';

/** Points kept in the mouse trail while nothing is being recorded (preview only). */
export const PREVIEW_TRAIL_CAP = 40;
/** Points kept while recording, so long trajectories are not truncated. */
export const RECORDING_TRAIL_CAP = 2000;

interface ClosestCapable {
  closest(selector: string): unknown;
}

interface ContainsCapable {
  contains(other: unknown): boolean;
}

function canClosest(target: unknown): target is ClosestCapable {
  return !!target && typeof (target as ClosestCapable).closest === "function";
}

/**
 * True when the event started on an overlay control (STOP, toolbar buttons,
 * inputs, ...) rendered inside the viewport. Such a click must never be
 * forwarded to the device, whichever ancestor handlers did or did not stop it.
 */
export function isFromHudControl(target: unknown, viewport: ContainsCapable): boolean {
  if (!canClosest(target)) return false;
  const control = target.closest(HUD_CONTROL_SELECTOR);
  return !!control && control !== viewport && viewport.contains(control);
}

/** How many trail points to keep: the recording cap while recording, else the preview cap. */
export function trailCap(isRecording: boolean): number {
  return isRecording ? RECORDING_TRAIL_CAP : PREVIEW_TRAIL_CAP;
}

/** Appends a point and keeps only the newest `cap` entries. */
export function appendBounded<T>(prev: readonly T[], point: T, cap: number): T[] {
  const next = [...prev, point];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
