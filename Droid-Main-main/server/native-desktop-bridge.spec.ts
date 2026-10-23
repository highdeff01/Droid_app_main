import { describe, expect, it, vi } from "vitest";
import { createNativeDesktopControl, loadNativeDesktopControl, nutKeyCode, type NutModule } from "./native-desktop-bridge";

function fakeNut(width = 1920): NutModule {
  return {
    mouse: {
      config: { autoDelayMs: 100, mouseSpeed: 1000 },
      setPosition: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      doubleClick: vi.fn(async () => undefined),
      drag: vi.fn(async () => undefined),
      scrollUp: vi.fn(async () => undefined),
      scrollDown: vi.fn(async () => undefined),
    },
    keyboard: {
      config: { autoDelayMs: 300 },
      type: vi.fn(async () => undefined),
      pressKey: vi.fn(async () => undefined),
      releaseKey: vi.fn(async () => undefined),
    },
    screen: {
      width: async () => width,
      height: async () => 1080,
      grab: async () => ({ width: 1, height: 1, data: Buffer.from([1, 2, 3, 255]), channels: 4, byteWidth: 4, colorMode: 0 }),
    },
    Button: { LEFT: 0, RIGHT: 2 },
    Key: { Enter: 100, LeftControl: 101, C: 102, F5: 103, Num7: 104 },
    ColorMode: { BGR: 0 },
  };
}

describe("native desktop bridge (nut-js)", () => {
  it("rejects with the real reason when the module cannot load", async () => {
    await expect(loadNativeDesktopControl(async () => Promise.reject(new Error("Cannot find module")))).rejects.toThrow(
      "Cannot find module",
    );
  });

  it("rejects when the display reports no size", async () => {
    await expect(loadNativeDesktopControl(async () => fakeNut(0))).rejects.toThrow("0x1080");
  });

  it("clicks at the requested point with the requested button", async () => {
    const nut = fakeNut();
    await createNativeDesktopControl(nut).pointer({ type: "click", x: 10.4, y: 20.6, button: "right" });
    expect(nut.mouse.setPosition).toHaveBeenCalledWith({ x: 10, y: 21 });
    expect(nut.mouse.click).toHaveBeenCalledWith(2);
  });

  it("drags from the start point along the path", async () => {
    const nut = fakeNut();
    await createNativeDesktopControl(nut).drag([{ x: 1, y: 2 }, { x: 30, y: 40 }]);
    expect(nut.mouse.setPosition).toHaveBeenCalledWith({ x: 1, y: 2 });
    expect(nut.mouse.drag).toHaveBeenCalledWith([{ x: 30, y: 40 }]);
  });

  it("presses and releases a chord", async () => {
    const nut = fakeNut();
    await createNativeDesktopControl(nut).hotkey(["ctrl", "c"]);
    expect(nut.keyboard.pressKey).toHaveBeenCalledWith(101, 102);
    expect(nut.keyboard.releaseKey).toHaveBeenCalledWith(102, 101);
  });

  it("maps key names and rejects unknown keys", () => {
    const nut = fakeNut();
    expect(nutKeyCode(nut, "ENTER")).toBe(100);
    expect(nutKeyCode(nut, "f5")).toBe(103);
    expect(nutKeyCode(nut, "7")).toBe(104);
    expect(() => nutKeyCode(nut, "launchpad")).toThrow("not supported");
  });

  it("captures the screen as a PNG data URL", async () => {
    const frame = await createNativeDesktopControl(fakeNut()).captureFrame();
    expect(frame).toMatch(/^data:image\/png;base64,/);
    const bytes = Buffer.from(frame.split(",")[1], "base64");
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});
