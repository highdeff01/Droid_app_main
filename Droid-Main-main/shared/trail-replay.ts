/**
 * Recorded mouse trails replayed as recorded: every waypoint in order, separated by the
 * time that actually passed between the recorded samples (divided by the replay speed).
 * Shared by the HUD overlay playback and the /api/pyautogui/replay-trail bridge route.
 */

export interface TrailPoint {
  x: number;
  y: number;
  /** Epoch ms when the point was sampled. */
  time?: number;
  isClick?: boolean;
}

export interface TimedWaypoint {
  x: number;
  y: number;
  isClick: boolean;
  /** Wait before this waypoint, in ms. */
  gapMs: number;
  /** Offset from the start of the replay, in ms. */
  atMs: number;
}

/** Longest single pause replayed between two waypoints (matches the replay step delay cap). */
export const MAX_TRAIL_GAP_MS = 5000;
/** Most waypoints one trail replay carries. */
export const MAX_TRAIL_REPLAY_POINTS = 2000;

function clampSpeed(speed: number): number {
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

/** The recorded trail as a timeline: same points, same order, recorded gaps scaled by 1/speed. */
export function trailToTimeline(points: TrailPoint[], speed = 1): TimedWaypoint[] {
  const factor = clampSpeed(speed);
  let atMs = 0;
  return points.slice(0, MAX_TRAIL_REPLAY_POINTS).map((point, index) => {
    const prev = points[index - 1];
    const raw = prev && point.time !== undefined && prev.time !== undefined ? point.time - prev.time : 0;
    const gapMs = Math.round(Math.min(MAX_TRAIL_GAP_MS, Math.max(0, raw)) / factor);
    atMs += gapMs;
    return { x: Math.round(point.x), y: Math.round(point.y), isClick: point.isClick === true, gapMs, atMs };
  });
}

export interface TrailBridgeAction {
  type: "move" | "click" | "wait";
  x?: number;
  y?: number;
  delayMs?: number;
}

/** Bridge actions that reproduce the timeline: a wait for each recorded gap, then a move or click. */
export function trailToBridgeActions(points: TrailPoint[], speed = 1): TrailBridgeAction[] {
  return trailToTimeline(points, speed).flatMap((waypoint): TrailBridgeAction[] => {
    const act: TrailBridgeAction = { type: waypoint.isClick ? "click" : "move", x: waypoint.x, y: waypoint.y };
    return waypoint.gapMs > 0 ? [{ type: "wait", delayMs: waypoint.gapMs }, act] : [act];
  });
}
