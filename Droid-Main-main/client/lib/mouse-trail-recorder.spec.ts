import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAIL_SETTINGS,
  appendTrailPoint,
  normalizeTrailSettings,
  type TrailRecorderSettings,
} from "./mouse-trail-recorder";

describe("normalizeTrailSettings", () => {
  it("clamps sampleRateHz, maxPoints and smoothing into their allowed ranges", () => {
    expect(normalizeTrailSettings({ sampleRateHz: 500, maxPoints: 5000, smoothing: 5 })).toEqual({
      sampleRateHz: 120,
      maxPoints: 2000,
      smoothing: 0.9,
    });
    expect(normalizeTrailSettings({ sampleRateHz: -10, maxPoints: 1, smoothing: -1 })).toEqual({
      sampleRateHz: 1,
      maxPoints: 10,
      smoothing: 0,
    });
  });

  it("falls back to the defaults when a value is NaN or missing", () => {
    expect(normalizeTrailSettings({})).toEqual(DEFAULT_TRAIL_SETTINGS);
    expect(normalizeTrailSettings({ sampleRateHz: NaN, maxPoints: NaN, smoothing: NaN })).toEqual(
      DEFAULT_TRAIL_SETTINGS,
    );
  });
});

describe("appendTrailPoint", () => {
  const settingsFor = (overrides: Partial<TrailRecorderSettings>): TrailRecorderSettings => ({
    ...DEFAULT_TRAIL_SETTINGS,
    ...overrides,
  });

  it("drops a move sampled faster than the configured sampleRateHz", () => {
    const settings = settingsFor({ sampleRateHz: 10 }); // 100ms min spacing
    const trail = appendTrailPoint([], { x: 0, y: 0, time: 0 }, settings);
    const after = appendTrailPoint(trail, { x: 5, y: 5, time: 50 }, settings);
    expect(after.length).toBe(1);
  });

  it("keeps a move sampled at or beyond the sample interval", () => {
    const settings = settingsFor({ sampleRateHz: 10 });
    const trail = appendTrailPoint([], { x: 0, y: 0, time: 0 }, settings);
    const after = appendTrailPoint(trail, { x: 5, y: 5, time: 100 }, settings);
    expect(after.length).toBe(2);
  });

  it("never drops a click, even when sampled faster than sampleRateHz", () => {
    const settings = settingsFor({ sampleRateHz: 10 });
    const trail = appendTrailPoint([], { x: 0, y: 0, time: 0 }, settings);
    const after = appendTrailPoint(trail, { x: 5, y: 5, time: 10, isClick: true }, settings);
    expect(after.length).toBe(2);
    expect(after[1]).toMatchObject({ x: 5, y: 5, isClick: true });
  });

  it("never smooths a click, keeping its exact recorded position", () => {
    const settings = settingsFor({ smoothing: 0.9 });
    const trail = appendTrailPoint([], { x: 0, y: 0, time: 0 }, settings);
    const after = appendTrailPoint(trail, { x: 100, y: 100, time: 1000, isClick: true }, settings);
    expect(after[1]).toMatchObject({ x: 100, y: 100, isClick: true });
  });

  it("blends a move toward the previous point when smoothing is 0.5", () => {
    const settings = settingsFor({ smoothing: 0.5 });
    const trail = appendTrailPoint([], { x: 0, y: 0, time: 0 }, settings);
    const after = appendTrailPoint(trail, { x: 100, y: 100, time: 1000 }, settings);
    expect(after[1]).toMatchObject({ x: 50, y: 50 });
  });

  it("keeps only the newest maxPoints points", () => {
    const settings = settingsFor({ maxPoints: 2, sampleRateHz: 1 });
    let trail = appendTrailPoint([], { x: 0, y: 0, time: 0 }, settings);
    trail = appendTrailPoint(trail, { x: 1, y: 1, time: 1000 }, settings);
    trail = appendTrailPoint(trail, { x: 2, y: 2, time: 2000 }, settings);
    expect(trail.length).toBe(2);
    expect(trail.map((p) => p.x)).toEqual([1, 2]);
  });
});
