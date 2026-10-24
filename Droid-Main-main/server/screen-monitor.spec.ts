import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenMonitor } from "./screen-monitor";
import type { CaptureResult } from "./capture-frame";

function liveCapture(): () => Promise<CaptureResult> {
  return async () => ({
    success: true,
    status: "live",
    source: "spec",
    ageMs: 0,
    imageData: "data:image/png;base64,AA==",
    timestamp: Date.now(),
  });
}

const flush = () => new Promise<void>((r) => queueMicrotask(r));

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

describe("ScreenMonitor", () => {
  afterEach(() => vi.useRealTimers());

  it("captures once per second in background mode", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(liveCapture());
    const monitor = new ScreenMonitor(capture);
    expect(monitor.start("background")).toMatchObject({
      mode: "background",
      intervalMs: 1000,
    });
    await advance(0);
    expect(capture).toHaveBeenCalledTimes(1);
    await advance(2999);
    expect(capture).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(capture).toHaveBeenCalledTimes(4);
    monitor.stop();
  });

  it("captures every 0.25 s in advanced mode and keeps frames newest first", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(liveCapture());
    const monitor = new ScreenMonitor(capture);
    monitor.start("advanced");
    await advance(1000);
    expect(capture).toHaveBeenCalledTimes(5);
    expect(monitor.status()).toMatchObject({
      mode: "advanced",
      intervalMs: 250,
      captures: 5,
      failures: 0,
    });
    const frames = monitor.recentFrames(2);
    expect(frames[0].capturedAt).toBeGreaterThanOrEqual(frames[1].capturedAt);
    monitor.stop();
  });

  it("stops capturing on stop and when switching modes restarts the cadence", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(liveCapture());
    const monitor = new ScreenMonitor(capture);
    monitor.start("advanced");
    await advance(0);
    monitor.start("background");
    await advance(999);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(monitor.stop()).toMatchObject({ mode: "off", intervalMs: null });
    await advance(5000);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("counts a standby frame as a failure with its message", async () => {
    vi.useFakeTimers();
    const monitor = new ScreenMonitor(async () => ({
      success: false,
      status: "standby",
      imageData: null,
      timestamp: Date.now(),
      message: "No live frame",
      skipped: [],
    }));
    monitor.start("background");
    await advance(0);
    expect(monitor.status()).toMatchObject({
      captures: 0,
      failures: 1,
      lastError: "No live frame",
      frameCount: 0,
    });
    monitor.stop();
  });
});
