import { afterEach, describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import {
  activeNativeControl,
  desktopControlStatus,
  detectDesktopControl,
  initDesktopControl,
  nativeDesktopAdapters,
  resetDesktopControl,
  runNativeDesktopAction,
  runNativeDesktopActions,
  type DesktopControlDeps,
} from "./desktop-control";
import type { NativeDesktopControl } from "./native-desktop-bridge";
import { encodePng } from "./png-encode";

function fakeNative(overrides: Partial<NativeDesktopControl> = {}): NativeDesktopControl {
  return {
    pointer: vi.fn(async () => undefined),
    typeText: vi.fn(async () => undefined),
    key: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    drag: vi.fn(async () => undefined),
    hotkey: vi.fn(async () => undefined),
    scroll: vi.fn(async () => undefined),
    captureFrame: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo="),
    ...overrides,
  };
}

function deps(overrides: Partial<DesktopControlDeps> = {}): DesktopControlDeps {
  return {
    loadNative: vi.fn(async () => fakeNative()),
    python: vi.fn(() => "python3 (3.12.1)"),
    env: { DISPLAY: ":0" },
    platform: "linux",
    ...overrides,
  };
}

describe("desktop control selection", () => {
  afterEach(() => resetDesktopControl());

  it("selects native when the native module loads, without probing Python", async () => {
    const d = deps();
    const chosen = await detectDesktopControl(d);
    expect(chosen.backend).toBe("native");
    expect(chosen.native).not.toBeNull();
    expect(d.python).not.toHaveBeenCalled();
  });

  it("falls back to Python only when the native module cannot load, keeping the real reason", async () => {
    const chosen = await detectDesktopControl(
      deps({ loadNative: vi.fn(async () => Promise.reject(new Error("libXtst.so.6: cannot open"))) }),
    );
    expect(chosen.backend).toBe("python");
    expect(chosen.native).toBeNull();
    expect(chosen.reason).toContain("libXtst.so.6");
    expect(chosen.reason).toContain("python3 (3.12.1)");
  });

  it("is unavailable with an install hint when neither native nor Python is present", async () => {
    const chosen = await detectDesktopControl(
      deps({ loadNative: vi.fn(async () => Promise.reject(new Error("Cannot find module"))), python: () => null }),
    );
    expect(chosen.backend).toBe("unavailable");
    expect(chosen.installHint).toContain("nut-js");
    expect(chosen.installHint).toContain("pyautogui");
  });

  it("does not load native on Linux without a display", async () => {
    const d = deps({ env: {} });
    const chosen = await detectDesktopControl(d);
    expect(d.loadNative).not.toHaveBeenCalled();
    expect(chosen.backend).toBe("python");
    expect(chosen.reason).toContain("DISPLAY");
  });

  it("detects once, logs the choice, and exposes it to routes and health", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const d = deps();
    const first = initDesktopControl(d);
    const second = initDesktopControl(d);
    expect(second).toBe(first);
    await first;
    expect(d.loadNative).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Control backend: native"));
    expect(await activeNativeControl()).not.toBeNull();
    expect((await desktopControlStatus()).controlBackend).toBe("native");
    log.mockRestore();
  });

  it("keeps the Python path when startup detection never ran", async () => {
    expect(await activeNativeControl()).toBeNull();
    expect((await desktopControlStatus()).controlBackend).toBe("python");
  });
});

describe("native desktop actions", () => {
  it("executes a click through the native bridge", async () => {
    const native = fakeNative();
    const outcome = await runNativeDesktopAction(native, { action: "right_click", x: 10, y: 20 });
    expect(outcome).toMatchObject({ success: true, status: "executed", executed: true, simulated: false });
    expect(native.click).toHaveBeenCalledWith(10, 20, "right", false);
  });

  it("moves, drags, presses chords and types", async () => {
    const native = fakeNative();
    await runNativeDesktopAction(native, { action: "move", x: 3, y: 4 });
    await runNativeDesktopAction(native, { action: "drag", x: 1, y: 2, toX: 30, toY: 40 });
    await runNativeDesktopAction(native, { action: "press_key", key: "ctrl+c" });
    await runNativeDesktopAction(native, { action: "type", text: "hello" });
    expect(native.move).toHaveBeenCalledWith(3, 4);
    expect(native.drag).toHaveBeenCalledWith([{ x: 1, y: 2 }, { x: 30, y: 40 }]);
    expect(native.hotkey).toHaveBeenCalledWith(["ctrl", "c"]);
    expect(native.typeText).toHaveBeenCalledWith("hello");
  });

  it("reports a native runtime error as failed with its message, never success", async () => {
    const native = fakeNative({ click: vi.fn(async () => Promise.reject(new Error("display lost"))) });
    const outcome = await runNativeDesktopAction(native, { action: "click", x: 1, y: 1 });
    expect(outcome).toMatchObject({ success: false, status: "failed", executed: false });
    expect(outcome.error).toContain("display lost");
  });

  it("reports an unsupported action as failed without touching the bridge", async () => {
    const native = fakeNative();
    const outcome = await runNativeDesktopAction(native, { action: "launch_app" });
    expect(outcome).toMatchObject({ success: false, status: "failed", executed: false });
    expect(outcome.error).toContain("does not support");
  });

  it("fails a drag without an end point instead of inventing one", async () => {
    const native = fakeNative();
    const outcome = await runNativeDesktopAction(native, { action: "drag", x: 1, y: 1 });
    expect(outcome.status).toBe("failed");
    expect(native.drag).not.toHaveBeenCalled();
  });

  it("stops a batch at the first action that does not execute", async () => {
    const native = fakeNative({ typeText: vi.fn(async () => Promise.reject(new Error("no focus"))) });
    const outcome = await runNativeDesktopActions(native, [
      { action: "type", text: "a" },
      { action: "click", x: 1, y: 1 },
    ]);
    expect(outcome.status).toBe("failed");
    expect(native.click).not.toHaveBeenCalled();
  });
});

describe("native adapters behind the existing interfaces", () => {
  it("keeps approval and allowlist checks before the native bridge", async () => {
    const native = fakeNative();
    const { automation } = nativeDesktopAdapters(native);
    const screen = { width: 800, height: 600 };
    await expect(
      automation.execute({ target: "desktop", screen, approved: false, action: { type: "click", x: 1, y: 1 } }),
    ).rejects.toThrow("Explicit approval is required");
    await expect(
      automation.execute({ target: "desktop", screen, approved: true, action: { type: "key", key: "f4" } }),
    ).rejects.toThrow("allowlist");
    expect(native.pointer).not.toHaveBeenCalled();
    expect(native.key).not.toHaveBeenCalled();
  });

  it("captures through DesktopCaptureAdapter and rejects a non-image frame", async () => {
    const ok = nativeDesktopAdapters(fakeNative());
    expect((await ok.capture.capture(true)).imageData).toMatch(/^data:image\/png;base64,/);
    const bad = nativeDesktopAdapters(fakeNative({ captureFrame: async () => "not an image" }));
    await expect(bad.capture.capture(true)).rejects.toThrow("invalid image");
  });
});

describe("encodePng", () => {
  it("encodes BGRA pixels as an RGB PNG with the right size and colours", () => {
    const data = Buffer.from([0, 0, 255, 255, 255, 0, 0, 255]); // red, blue in BGRA
    const png = encodePng({ width: 2, height: 1, data, channels: 4, byteWidth: 8, bgr: true });
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const idatLength = png.readUInt32BE(33);
    const rows = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...rows]).toEqual([0, 255, 0, 0, 0, 0, 255]);
  });
});
