import { describe, it, expect, vi } from "vitest";
import { ScreenMonitor, automationFromEnv } from "./monitor";
import type { FrameOutcome } from "./frames";

const LIVE: FrameOutcome = { live: true, frame: { jpeg: "AAA", w: 1, h: 1, ts: 1 } };
const STANDBY: FrameOutcome = { live: false, message: "no frame" };

function makeMonitor(overrides: Partial<Parameters<typeof baseDeps>[0]> = {}) {
  const deps = baseDeps(overrides);
  return { monitor: new ScreenMonitor({ monitoring: true, autoAssist: true, autoTakeover: false }, deps), ...deps };
}

function baseDeps(overrides: any = {}) {
  return {
    readFrame: vi.fn(async () => LIVE),
    isConnected: vi.fn(() => true),
    request: vi.fn(async () => ({ status: "ok" })),
    emit: vi.fn(),
    now: () => 0,
    ...overrides,
  };
}

describe("screenMonitor", () => {
  it("tick() with a live frame increments framesCaptured and sets live true", async () => {
    const { monitor } = makeMonitor();
    await monitor.tick();
    const status = monitor.status();
    expect(status.framesCaptured).toBe(1);
    expect(status.live).toBe(true);
  });

  it("tick() in standby sets live false and records lastMessage", async () => {
    const { monitor } = makeMonitor({ readFrame: vi.fn(async () => STANDBY) });
    await monitor.tick();
    const status = monitor.status();
    expect(status.live).toBe(false);
    expect(status.lastMessage).toBe("no frame");
  });

  it("problem() with autoAssist on and connected calls request('assist_error', ...) and records 'droid-new assisted' on ok", async () => {
    const { monitor, request } = makeMonitor({ request: vi.fn(async () => ({ status: "ok" })) });
    const entry = await monitor.problem("button missing", "watcher");
    expect(request).toHaveBeenCalledWith("assist_error", { message: "button missing", source: "watcher" });
    expect(entry.assist).toBe("droid-new assisted");
  });

  it("problem() records a failed record when droid-new reports failure", async () => {
    const { monitor } = makeMonitor({ request: vi.fn(async () => ({ status: "failed", error: "could not fix" })) });
    const entry = await monitor.problem("button missing", "watcher");
    expect(entry.assist).toBe("droid-new failed: could not fix");
  });

  it("problem() when not connected sets assist 'droid-new not connected' and never calls request", async () => {
    const { monitor, request } = makeMonitor({ isConnected: vi.fn(() => false) });
    const entry = await monitor.problem("button missing", "watcher");
    expect(entry.assist).toBe("droid-new not connected");
    expect(request).not.toHaveBeenCalled();
  });

  it("problem() with autoAssist off never calls request", async () => {
    const deps = baseDeps();
    const monitor = new ScreenMonitor({ monitoring: true, autoAssist: false, autoTakeover: false }, deps);
    const entry = await monitor.problem("button missing", "watcher");
    expect(deps.request).not.toHaveBeenCalled();
    expect(entry.assist).toBe("auto-assist off");
  });

  it("configure({monitoring:false}) is reflected in status()", () => {
    const { monitor } = makeMonitor();
    const status = monitor.configure({ monitoring: false });
    expect(status.monitoring).toBe(false);
  });

  it("automationFromEnv({}) defaults monitoring true, autoAssist true, autoTakeover false", () => {
    expect(automationFromEnv({})).toEqual({ monitoring: true, autoAssist: true, autoTakeover: false });
  });

  it("automationFromEnv turns flags off for '0' and 'false'", () => {
    expect(automationFromEnv({ ASSIST_BRIDGE_MONITOR: "0", ASSIST_BRIDGE_AUTO_ASSIST: "false" })).toMatchObject({
      monitoring: false,
      autoAssist: false,
    });
  });
});
