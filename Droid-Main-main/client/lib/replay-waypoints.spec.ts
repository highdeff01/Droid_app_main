import { describe, expect, it } from "vitest";
import {
  NO_REPLAY_PATH_MESSAGE,
  selectReplayWaypoints,
  selectedReplaySteps,
} from "./replay-waypoints";

const steps = [
  { id: "a", x: 10, y: 20, action: "click" },
  { id: "b", x: 30, y: 40, action: "type_text", dwellDurationMs: 500 },
];
const staleTrail = [{ x: 900, y: 900, isClick: true }, { x: 910, y: 905 }];
const trajectory = [{ x: 5, y: 6 }];

describe("selectReplayWaypoints", () => {
  it("follows sequence steps even when a stale live trail exists", () => {
    const selection = selectReplayWaypoints(steps, staleTrail, trajectory);
    expect(selection?.source).toBe("sequence");
    expect(selection?.waypoints).toEqual([
      { x: 10, y: 20, dwell: 350, isClick: true },
      { x: 30, y: 40, dwell: 500, isClick: false },
    ]);
  });

  it("follows only the selected steps when a selection exists", () => {
    const chosen = selectedReplaySteps(steps, new Set(["b"]));
    const selection = selectReplayWaypoints(chosen, staleTrail, trajectory);
    expect(selection?.waypoints.map((w) => [w.x, w.y])).toEqual([[30, 40]]);
  });

  it("falls back to the live trail, then the trajectory, when there are no steps", () => {
    expect(selectReplayWaypoints([], staleTrail, trajectory)?.source).toBe("trail");
    expect(selectReplayWaypoints([], staleTrail, trajectory)?.waypoints[0]).toEqual({ x: 900, y: 900, dwell: 300, isClick: true });
    expect(selectReplayWaypoints([], [], trajectory)?.waypoints).toEqual([{ x: 5, y: 6, dwell: 40, isClick: false }]);
  });

  it("returns null when nothing is recorded, and the message names the fix", () => {
    expect(selectReplayWaypoints([], [], [])).toBeNull();
    expect(NO_REPLAY_PATH_MESSAGE).toMatch(/record steps first/);
    expect(NO_REPLAY_PATH_MESSAGE).toMatch(/select a workflow/);
  });
});

describe("selectedReplaySteps", () => {
  it("keeps sequence order for the selected steps", () => {
    expect(selectedReplaySteps(steps, new Set(["b", "a"])).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("returns every step when nothing (or only unknown ids) is selected", () => {
    expect(selectedReplaySteps(steps, new Set())).toBe(steps);
    expect(selectedReplaySteps(steps, new Set(["zzz"]))).toBe(steps);
  });
});
