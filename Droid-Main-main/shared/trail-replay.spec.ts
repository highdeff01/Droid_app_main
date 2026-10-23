import { describe, expect, it } from "vitest";
import {
  MAX_TRAIL_GAP_MS,
  MAX_TRAIL_REPLAY_POINTS,
  trailToBridgeActions,
  trailToTimeline,
  type TrailPoint,
} from "./trail-replay";

describe("trailToTimeline", () => {
  it("reproduces every recorded waypoint in order with exact coordinates, no interpolated points added", () => {
    const points: TrailPoint[] = [
      { x: 1.2, y: 2.7, time: 1000 },
      { x: 30.4, y: 40.6, time: 1250 },
      { x: 60, y: 80, time: 2000 },
    ];
    const timeline = trailToTimeline(points);
    expect(timeline.length).toBe(points.length);
    expect(timeline.map((w) => [w.x, w.y])).toEqual([
      [1, 3],
      [30, 41],
      [60, 80],
    ]);
  });

  it("sets gapMs to the recorded time difference between consecutive points", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 1250 },
      { x: 2, y: 2, time: 1900 },
    ];
    const timeline = trailToTimeline(points);
    expect(timeline[0].gapMs).toBe(0);
    expect(timeline[1].gapMs).toBe(250);
    expect(timeline[2].gapMs).toBe(650);
  });

  it("accumulates atMs as the running total of gaps", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 1250 },
      { x: 2, y: 2, time: 1900 },
    ];
    const timeline = trailToTimeline(points);
    expect(timeline.map((w) => w.atMs)).toEqual([0, 250, 900]);
  });

  it("halves every gap when replayed at speed 2", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 1300 },
    ];
    const timeline = trailToTimeline(points, 2);
    expect(timeline[1].gapMs).toBe(150);
  });

  it("caps a gap at MAX_TRAIL_GAP_MS", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 0 },
      { x: 1, y: 1, time: MAX_TRAIL_GAP_MS * 10 },
    ];
    const timeline = trailToTimeline(points);
    expect(timeline[1].gapMs).toBe(MAX_TRAIL_GAP_MS);
  });

  it("gives a 0 gap when a time is negative or missing", () => {
    const negative: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 500 },
    ];
    expect(trailToTimeline(negative)[1].gapMs).toBe(0);

    const missing: TrailPoint[] = [{ x: 0, y: 0, time: 1000 }, { x: 1, y: 1 }];
    expect(trailToTimeline(missing)[1].gapMs).toBe(0);
  });

  it("marks isClick points as clicks and the rest as moves", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 0 },
      { x: 1, y: 1, time: 100, isClick: true },
    ];
    const timeline = trailToTimeline(points);
    expect(timeline[0].isClick).toBe(false);
    expect(timeline[1].isClick).toBe(true);
  });

  it("drops points beyond MAX_TRAIL_REPLAY_POINTS", () => {
    const points: TrailPoint[] = Array.from({ length: MAX_TRAIL_REPLAY_POINTS + 50 }, (_, i) => ({
      x: i,
      y: i,
      time: i * 10,
    }));
    const timeline = trailToTimeline(points);
    expect(timeline.length).toBe(MAX_TRAIL_REPLAY_POINTS);
  });

  it("treats an invalid speed (0 or NaN) as 1", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 1300 },
    ];
    expect(trailToTimeline(points, 0)[1].gapMs).toBe(300);
    expect(trailToTimeline(points, NaN)[1].gapMs).toBe(300);
  });
});

describe("trailToBridgeActions", () => {
  it("emits a click action for a click point and a move action for a plain point", () => {
    const points: TrailPoint[] = [
      { x: 1, y: 2, time: 0 },
      { x: 3, y: 4, time: 0, isClick: true },
    ];
    const actions = trailToBridgeActions(points);
    expect(actions).toEqual([
      { type: "move", x: 1, y: 2 },
      { type: "click", x: 3, y: 4 },
    ]);
  });

  it("precedes a waypoint with a wait action carrying delayMs whenever its gap is greater than 0", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 1300 },
    ];
    const actions = trailToBridgeActions(points);
    expect(actions).toEqual([
      { type: "move", x: 0, y: 0 },
      { type: "wait", delayMs: 300 },
      { type: "move", x: 1, y: 1 },
    ]);
  });

  it("emits no wait action when the gap is 0", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, time: 1000 },
      { x: 1, y: 1, time: 1000 },
    ];
    const actions = trailToBridgeActions(points);
    expect(actions.filter((a) => a.type === "wait")).toEqual([]);
  });
});
