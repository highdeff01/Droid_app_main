import { describe, expect, it } from "vitest";
import {
  FRAME_STALE_MS,
  isFrameStale,
  resolveCaptureFrame,
  type CaptureSource,
} from "./capture-frame";

const NOW = 1_000_000;
const now = () => NOW;

function source(name: string, ageMs: number | null): CaptureSource {
  return {
    name,
    read: () =>
      ageMs === null ? null : { imageData: `data:${name}`, timestamp: NOW - ageMs },
  };
}

describe("capture frame staleness", () => {
  it("treats frames older than the threshold as stale", () => {
    expect(isFrameStale(NOW - FRAME_STALE_MS - 1, NOW)).toBe(true);
    expect(isFrameStale(NOW - FRAME_STALE_MS, NOW)).toBe(false);
    expect(isFrameStale(NOW - 500, NOW)).toBe(false);
  });

  it("serves a fresh frame as live with its age and source", async () => {
    const result = await resolveCaptureFrame([source("live_hud_sync", 2_000)], now);
    expect(result).toMatchObject({
      success: true,
      status: "live",
      source: "live_hud_sync",
      imageData: "data:live_hud_sync",
      ageMs: 2_000,
    });
  });

  it("never serves an hours-old frame as live: it is skipped and reported", async () => {
    const result = await resolveCaptureFrame([source("live_hud_sync", 3 * 3_600_000)], now);
    expect(result.success).toBe(false);
    expect(result.status).toBe("standby");
    expect(result.imageData).toBeNull();
    if (result.status !== "standby") throw new Error("expected standby");
    expect(result.skipped).toEqual([
      { source: "live_hud_sync", reason: "stale", timestamp: NOW - 3 * 3_600_000, ageMs: 3 * 3_600_000 },
    ]);
    expect(result.message).toMatch(/stale/);
  });

  it("returns an honest standby failure when no source has a frame", async () => {
    const result = await resolveCaptureFrame([source("a", null), source("b", null)], now);
    expect(result).toMatchObject({ success: false, status: "standby", imageData: null, skipped: [] });
  });

  it("records a failing source and continues to the next one", async () => {
    const failing: CaptureSource = {
      name: "desktop_capture",
      read: async () => {
        throw new Error("python3 not found");
      },
    };
    const result = await resolveCaptureFrame([failing, source("mobile_stream_mirror", 100)], now);
    expect(result).toMatchObject({ success: true, source: "mobile_stream_mirror" });
  });
});

describe("capture fallback order", () => {
  it("prefers the first source with a fresh frame", async () => {
    const result = await resolveCaptureFrame(
      [source("live_hud_sync", 100), source("desktop_capture", 50), source("mobile_stream_mirror", 10)],
      now,
    );
    expect(result).toMatchObject({ source: "live_hud_sync" });
  });

  it("falls through stale and empty sources in order", async () => {
    const result = await resolveCaptureFrame(
      [
        source("live_hud_sync", FRAME_STALE_MS + 1),
        source("desktop_capture", null),
        source("mobile_stream_mirror", 10),
      ],
      now,
    );
    expect(result).toMatchObject({ success: true, source: "mobile_stream_mirror" });
  });

  it("uses desktop before mobile when both are fresh", async () => {
    const result = await resolveCaptureFrame(
      [source("live_hud_sync", null), source("desktop_capture", 100), source("mobile_stream_mirror", 10)],
      now,
    );
    expect(result).toMatchObject({ source: "desktop_capture" });
  });
});
