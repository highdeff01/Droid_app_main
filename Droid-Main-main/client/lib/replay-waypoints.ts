/**
 * Which recording the HUD's movement replay follows. The user's sequence steps
 * (the selected ones when any are selected) always win over a live mouse trail,
 * which can be stale; the trail and then the recorded trajectory are used only
 * when no sequence steps exist.
 */

export interface WaypointStepLike {
  id: string;
  x: number;
  y: number;
  action?: string;
  dwellDurationMs?: number;
}

export interface TrailPointLike {
  x: number;
  y: number;
  isClick?: boolean;
}

export interface ReplayWaypoint {
  x: number;
  y: number;
  dwell: number;
  isClick: boolean;
}

export type WaypointSource = "sequence" | "trail" | "trajectory";

export interface WaypointSelection {
  source: WaypointSource;
  waypoints: ReplayWaypoint[];
}

export const NO_RECORDED_STEPS_MESSAGE =
  "No recorded steps to replay: record steps first, or select a workflow with recorded steps.";

export const NO_REPLAY_PATH_MESSAGE =
  "Nothing to replay: record steps first (or select a workflow with recorded steps), or record a mouse trail.";

export const NO_HARDWARE_CLICKS_MESSAGE =
  "Nothing to execute on hardware: record steps first (or select a workflow with recorded steps); a mouse trail needs at least one recorded click.";

/** The steps a replay runs: the selected steps in sequence order, or every step when none are selected. */
export function selectedReplaySteps<T extends { id: string }>(
  sequence: T[],
  selectedIds: ReadonlySet<string>,
): T[] {
  const selected = sequence.filter((step) => selectedIds.has(step.id));
  return selected.length > 0 ? selected : sequence;
}

function stepWaypoint(step: WaypointStepLike): ReplayWaypoint {
  return {
    x: step.x,
    y: step.y,
    dwell: step.dwellDurationMs || 350,
    isClick: step.action?.includes("click") ?? true,
  };
}

function trailWaypoint(point: TrailPointLike): ReplayWaypoint {
  return { x: point.x, y: point.y, dwell: point.isClick ? 300 : 20, isClick: !!point.isClick };
}

/** Waypoints for the visual replay; null when there is nothing recorded to follow. */
export function selectReplayWaypoints(
  steps: WaypointStepLike[],
  trail: TrailPointLike[],
  trajectory: Array<{ x: number; y: number }>,
): WaypointSelection | null {
  if (steps.length > 0) return { source: "sequence", waypoints: steps.map(stepWaypoint) };
  if (trail.length > 0) return { source: "trail", waypoints: trail.map(trailWaypoint) };
  if (trajectory.length > 0) {
    return {
      source: "trajectory",
      waypoints: trajectory.map((t) => ({ x: t.x, y: t.y, dwell: 40, isClick: false })),
    };
  }
  return null;
}
