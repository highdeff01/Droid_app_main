import { describe, it, expect } from "vitest";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { toAssistFrame } from "./frames";
import { clampInterval, isLoopbackHost } from "./service";
import type { CaptureResult } from "../capture-frame";

function liveCapture(imageData: string, timestamp = 123): CaptureResult {
  return { success: true, status: "live", imageData, timestamp, source: "test", ageMs: 0 };
}

describe("frameEncoding", () => {
  it("converts a PNG data URL into a JPEG frame with the source dimensions", () => {
    const png = new PNG({ width: 4, height: 3 });
    png.data.fill(255);
    const dataUrl = `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
    const outcome = toAssistFrame(liveCapture(dataUrl, 55));
    expect(outcome.live).toBe(true);
    if (outcome.live === false) throw new Error("expected live frame");
    expect(outcome.frame.jpeg.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(outcome.frame.w).toBe(4);
    expect(outcome.frame.h).toBe(3);
    expect(outcome.frame.ts).toBe(55);
  });

  it("passes a JPEG data URL through unchanged in shape", () => {
    const encoded = jpeg.encode({ data: Buffer.alloc(5 * 7 * 4, 255), width: 5, height: 7 }, 80);
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
    const outcome = toAssistFrame(liveCapture(dataUrl, 99));
    expect(outcome.live).toBe(true);
    if (outcome.live === false) throw new Error("expected live frame");
    expect(outcome.frame.w).toBe(5);
    expect(outcome.frame.h).toBe(7);
    expect(outcome.frame.ts).toBe(99);
  });

  it("returns standby unchanged when the capture itself is standby", () => {
    const capture: CaptureResult = {
      success: false,
      status: "standby",
      imageData: null,
      timestamp: 1,
      message: "none",
      skipped: [],
    };
    const outcome = toAssistFrame(capture);
    expect(outcome).toEqual({ live: false, message: "none" });
  });
});

describe("bridgeSettings", () => {
  it.each([
    [100, 250],
    [5000, 2000],
    [500, 500],
    [NaN, 500],
  ])("clamps interval %p to %p", (input, expected) => {
    expect(clampInterval(input)).toBe(expected);
  });

  it.each([
    ["127.0.0.1", true],
    ["localhost", true],
    ["0.0.0.0", false],
    ["192.168.1.5", false],
  ])("treats %p as loopback: %p", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });
});
