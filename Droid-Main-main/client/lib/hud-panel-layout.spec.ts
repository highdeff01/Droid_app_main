import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_STATE,
  HUD_CONTROL_STRIP_PX,
  HUD_DOCK_PANELS,
  HUD_LAYERS,
  HUD_MODAL_FRAME_CLASS,
  HUD_MODAL_RESERVED,
  hudDockMaxHeight,
  hudModalRect,
  parseDockState,
} from "./hud-layout";

const rank = (cls: string) => Number(cls.replace(/\D/g, ""));

describe("HUD panel dock", () => {
  it("lists the three docked panels and starts with all collapsed", () => {
    expect(HUD_DOCK_PANELS).toEqual(["master", "intentions", "progress"]);
    expect(Object.values(DEFAULT_DOCK_STATE).every((open) => !open)).toBe(true);
  });

  it("restores a remembered state and fills missing panels with the default", () => {
    expect(parseDockState(JSON.stringify({ intentions: true }))).toEqual({ master: false, intentions: true, progress: false });
  });

  it("ignores malformed or non-boolean saved state", () => {
    expect(parseDockState("{not json")).toEqual(DEFAULT_DOCK_STATE);
    expect(parseDockState(JSON.stringify({ master: "yes", progress: 1 }))).toEqual(DEFAULT_DOCK_STATE);
    expect(parseDockState(null)).toEqual(DEFAULT_DOCK_STATE);
  });

  it("caps the dock so the viewport keeps most of the window, at every window height", () => {
    expect(hudDockMaxHeight(1000)).toBe(300);
    expect(hudDockMaxHeight(300)).toBe(120);
    expect(hudDockMaxHeight(2160)).toBe(360);
  });
});

describe("HUD modal placement", () => {
  it("centres a modal that fits and keeps clear of the floating controls and bottom bar", () => {
    const rect = hudModalRect({ width: 1920, height: 1080 }, { width: 960, height: 600 });
    expect(rect.width).toBe(960);
    expect(rect.maxHeight).toBe(600);
    expect(rect.left).toBe(480);
    expect(rect.top).toBeGreaterThanOrEqual(HUD_MODAL_RESERVED.top);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(1080 - HUD_MODAL_RESERVED.bottom);
  });

  it("shrinks to a narrow, short viewport and never covers the reserved bands", () => {
    const rect = hudModalRect({ width: 360, height: 640 }, { width: 960, height: 720 });
    expect(rect.width).toBe(360 - 16);
    expect(rect.left).toBe(8);
    expect(rect.top).toBe(HUD_MODAL_RESERVED.top + 8);
    expect(rect.top + rect.maxHeight).toBe(640 - HUD_MODAL_RESERVED.bottom - 8);
  });

  it("reserves at least the control strip at the bottom", () => {
    expect(HUD_MODAL_RESERVED.bottom).toBeGreaterThanOrEqual(HUD_CONTROL_STRIP_PX);
  });

  it("modals have no backdrop and let clicks through around the box", () => {
    expect(HUD_MODAL_FRAME_CLASS).toContain("pointer-events-none");
    expect(HUD_MODAL_FRAME_CLASS).not.toMatch(/inset-0|bg-black|backdrop-blur/);
  });

  it("layers modals above frame overlays but below controls, popovers, floating chips and fullscreen", () => {
    expect(rank(HUD_LAYERS.cursor)).toBeLessThan(rank(HUD_LAYERS.modal));
    expect(rank(HUD_LAYERS.modal)).toBeLessThan(rank(HUD_LAYERS.controls));
    expect(rank(HUD_LAYERS.modal)).toBeLessThan(rank(HUD_LAYERS.popover));
    expect(rank(HUD_LAYERS.modal)).toBeLessThan(rank(HUD_LAYERS.floating));
  });
});
