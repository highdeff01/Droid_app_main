import { describe, expect, it } from "vitest";
import { controlUnavailableReason, overlayCursorEvent, playTrailTimeline, sessionToTrail, trailToSessionPoints } from "./hud-replay";
import { describeBridgeStatus } from "./bridge-status";

describe("playTrailTimeline", () => {
  it("fires every recorded waypoint in order at its recorded offset scaled by speed", async () => {
    const delays: number[] = [];
    const seen: Array<[number, number, boolean]> = [];
    const played = await playTrailTimeline(
      [
        { x: 5, y: 7, time: 1000 },
        { x: 40, y: 9, time: 1300 },
        { x: 41, y: 90, time: 1900, isClick: true },
      ],
      2,
      {
        onWaypoint: (w) => seen.push([w.x, w.y, w.isClick]),
        schedule: (fn, ms) => {
          delays.push(ms);
          fn();
        },
      },
    );
    expect(played).toBe(3);
    expect(seen).toEqual([[5, 7, false], [40, 9, false], [41, 90, true]]);
    // Offsets 150 ms and 450 ms after the start (300 ms and 900 ms recorded, at 2x).
    expect(delays[0]).toBeGreaterThan(140);
    expect(delays[0]).toBeLessThanOrEqual(150);
    expect(delays[1]).toBeGreaterThan(440);
    expect(delays[1]).toBeLessThanOrEqual(450);
  });

  it("stops at the waypoint where the signal aborts", async () => {
    const controller = new AbortController();
    const played = await playTrailTimeline(
      [{ x: 1, y: 1, time: 0 }, { x: 2, y: 2, time: 10 }, { x: 3, y: 3, time: 20 }],
      1,
      {
        signal: controller.signal,
        onWaypoint: (_w, index) => { if (index === 1) controller.abort(); },
        schedule: (fn) => fn(),
      },
    );
    expect(played).toBe(2);
  });
});

describe("session ↔ trail conversion", () => {
  it("keeps recorded positions, timestamps and clicks both ways", () => {
    const trail = [{ x: 3, y: 4, time: 100 }, { x: 8, y: 9, time: 250, isClick: true }];
    const points = trailToSessionPoints(trail);
    expect(points).toEqual([
      { x: 3, y: 4, timestamp: 100, type: "move" },
      { x: 8, y: 9, timestamp: 250, type: "click" },
    ]);
    expect(sessionToTrail({ points: [...points, { x: 1, y: 2, timestamp: 300, type: "right_click" }] })).toEqual([
      { x: 3, y: 4, time: 100, isClick: false },
      { x: 8, y: 9, time: 250, isClick: true },
      { x: 1, y: 2, time: 300, isClick: true },
    ]);
  });
});

describe("controlUnavailableReason", () => {
  it("names the reason when no desktop control backend is available", () => {
    const reason = controlUnavailableReason(describeBridgeStatus({ controlBackend: "unavailable", pythonAvailable: false }));
    expect(reason).toMatch(/^Control: unavailable/);
  });

  it("is null when a control backend can act", () => {
    expect(controlUnavailableReason(describeBridgeStatus({ controlBackend: "native" }))).toBeNull();
  });
});

describe("overlayCursorEvent", () => {
  it("marks clicks as clicking and the last waypoint as no longer acting", () => {
    expect(overlayCursorEvent({ x: 1, y: 2, isClick: true, gapMs: 0, atMs: 0 }, 1, 2)).toMatchObject({ action: "clicking", isActing: false });
    expect(overlayCursorEvent({ x: 1, y: 2, isClick: false, gapMs: 0, atMs: 0 }, 0, 2)).toMatchObject({ action: "moving", isActing: true });
  });
});
