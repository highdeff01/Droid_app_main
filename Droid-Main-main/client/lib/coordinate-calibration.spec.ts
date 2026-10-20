import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CALIBRATION_PROFILE,
  calibrateCoordinates,
  dampJitter,
  saveStoredCalibration,
  screenToViewport,
} from "./coordinate-calibration";

const store = new Map<string, string>();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

describe("calibrateCoordinates", () => {
  beforeEach(() => store.clear());

  it("is the identity for the default profile", () => {
    expect(calibrateCoordinates(100, 100, DEFAULT_CALIBRATION_PROFILE)).toEqual({ x: 100, y: 100, driftPx: 0 });
  });

  it("keeps the legacy offset-object and no-profile forms", () => {
    expect(calibrateCoordinates(10, 20)).toEqual({ x: 10, y: 20, driftPx: 0 });
    expect(calibrateCoordinates({ x: 10, y: 20 }, { x: 5, y: 5 })).toMatchObject({ x: 15, y: 25 });
  });

  it("applies offsets and scale before mapping to screen space", () => {
    const profile = { ...DEFAULT_CALIBRATION_PROFILE, offsetX: 10, offsetY: -10, scaleX: 2, scaleY: 1 };
    expect(calibrateCoordinates(100, 100, profile)).toEqual({ x: 220, y: 90, driftPx: 120 });
  });

  it("applies dpiScale to reach physical screen pixels", () => {
    const profile = { ...DEFAULT_CALIBRATION_PROFILE, dpiScale: 2 };
    expect(calibrateCoordinates(100, 50, profile)).toMatchObject({ x: 200, y: 100 });
  });

  it("maps the native resolution onto a different screen size", () => {
    const profile = { ...DEFAULT_CALIBRATION_PROFILE, screenWidth: 2560, screenHeight: 1440 };
    expect(calibrateCoordinates(960, 540, profile)).toMatchObject({ x: 1280, y: 720 });
  });

  it("damps jitter against the previous point", () => {
    const profile = { ...DEFAULT_CALIBRATION_PROFILE, jitterDamping: 2 };
    expect(calibrateCoordinates(200, 200, profile, { x: 100, y: 100 })).toMatchObject({ x: 150, y: 150 });
    expect(calibrateCoordinates(200, 200, profile)).toMatchObject({ x: 200, y: 200 });
  });

  it("uses the stored profile when none is passed", () => {
    saveStoredCalibration({ ...DEFAULT_CALIBRATION_PROFILE, offsetX: 7 });
    expect(calibrateCoordinates(3, 4)).toMatchObject({ x: 10, y: 4 });
  });
});

describe("dampJitter", () => {
  it("is a no-op for damping at or below 1", () => {
    expect(dampJitter({ x: 9, y: 9 }, { x: 0, y: 0 }, 1)).toEqual({ x: 9, y: 9 });
    expect(dampJitter({ x: 9, y: 9 }, { x: 0, y: 0 }, undefined)).toEqual({ x: 9, y: 9 });
  });
});

describe("screenToViewport", () => {
  it("projects calibrated screen pixels onto the viewport", () => {
    const profile = { ...DEFAULT_CALIBRATION_PROFILE, dpiScale: 2, screenWidth: 2560, screenHeight: 1440 };
    const screen = calibrateCoordinates(960, 540, profile);
    expect(screenToViewport(screen, profile, { width: 1000, height: 500 })).toEqual({ x: 500, y: 250 });
  });

  it("treats small coordinates as native pixels, not normalized values", () => {
    const point = screenToViewport({ x: 0.5, y: 0.5 }, DEFAULT_CALIBRATION_PROFILE, { width: 1920, height: 1080 });
    expect(point).toEqual({ x: 0.5, y: 0.5 });
  });
});
