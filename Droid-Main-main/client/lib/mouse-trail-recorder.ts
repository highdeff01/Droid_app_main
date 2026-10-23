/**
 * Live mouse-trail recording with user settings: how often a move is sampled, how many
 * points the trail keeps, and how much each new point is smoothed toward the previous one.
 * Clicks are always kept and never smoothed (they are where the user really clicked).
 */
import type { TrailPoint } from "@shared/trail-replay";

export interface TrailRecorderSettings {
  /** Move samples per second (1–120). */
  sampleRateHz: number;
  /** Most points kept; the oldest are dropped first (10–2000). */
  maxPoints: number;
  /** 0 = raw positions, up to 0.9 = heavy exponential smoothing of moves. */
  smoothing: number;
}

export const DEFAULT_TRAIL_SETTINGS: TrailRecorderSettings = { sampleRateHz: 30, maxPoints: 2000, smoothing: 0 };

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Settings coerced into their allowed ranges. */
export function normalizeTrailSettings(settings: Partial<TrailRecorderSettings>): TrailRecorderSettings {
  return {
    sampleRateHz: Math.round(clamp(Number(settings.sampleRateHz), 1, 120, DEFAULT_TRAIL_SETTINGS.sampleRateHz)),
    maxPoints: Math.round(clamp(Number(settings.maxPoints), 10, 2000, DEFAULT_TRAIL_SETTINGS.maxPoints)),
    smoothing: clamp(Number(settings.smoothing), 0, 0.9, DEFAULT_TRAIL_SETTINGS.smoothing),
  };
}

/**
 * The trail after one sampled position: a move closer in time than 1/sampleRate to the last
 * kept point is dropped; a kept move is blended toward the last point by `smoothing`.
 */
export function appendTrailPoint(
  trail: TrailPoint[],
  point: Required<Pick<TrailPoint, "x" | "y" | "time">> & { isClick?: boolean },
  settings: TrailRecorderSettings,
): TrailPoint[] {
  const last = trail[trail.length - 1];
  const isClick = point.isClick === true;
  if (!isClick && last?.time !== undefined && point.time - last.time < 1000 / settings.sampleRateHz) return trail;
  const blend = !isClick && last ? settings.smoothing : 0;
  const next: TrailPoint = {
    x: Math.round(point.x * (1 - blend) + (last?.x ?? point.x) * blend),
    y: Math.round(point.y * (1 - blend) + (last?.y ?? point.y) * blend),
    time: point.time,
    isClick,
  };
  return [...trail, next].slice(-settings.maxPoints);
}
