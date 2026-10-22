import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAME,
  HUD_LAYERS,
  HUD_NODE_MARGIN_PCT,
  selectFrameSource,
  anchoredLabelClass,
  clampBoxToArea,
  polylinePointsPx,
  viewportHeightForWidth,
  clampPercent,
  clampedPointStyle,
  fitFrameRect,
  frameAspectRatio,
  isFrameStalled,
  labelAlignment,
  labelPlacement,
  resolveFrameSize,
  trajectoryPointToPercent,
} from "./hud-layout";

describe("hud-layout", () => {
  describe("fitFrameRect", () => {
    it("fits a landscape frame into a wider container, reserving the control bar", () => {
      const rect = fitFrameRect({ width: 1000, height: 700 }, { width: 1920, height: 1080 }, 44);
      expect(rect.width).toBeCloseTo(1000);
      expect(rect.height).toBe(562.5);
      expect(rect.left).toBeCloseTo(0);
      expect(rect.top).toBe((656 - 562.5) / 2);
    });

    it("centres a portrait frame inside a landscape container", () => {
      const rect = fitFrameRect({ width: 1000, height: 700 }, { width: 1080, height: 1920 }, 0);
      expect(rect.height).toBe(700);
      expect(rect.width).toBe(393.75);
      expect(rect.left).toBe((1000 - 393.75) / 2);
      expect(rect.top).toBe(0);
    });

    it("returns a zero-size rect for a zero-size container", () => {
      const rect = fitFrameRect({ width: 0, height: 0 }, DEFAULT_FRAME);
      expect(rect).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    });
  });

  describe("resolveFrameSize", () => {
    it("falls back to the default frame for null input", () => {
      expect(resolveFrameSize(null)).toEqual(DEFAULT_FRAME);
    });

    it("falls back to the default frame when a dimension is zero", () => {
      expect(resolveFrameSize({ width: 0, height: 5 })).toEqual(DEFAULT_FRAME);
    });

    it("keeps a fully-reported frame size", () => {
      expect(resolveFrameSize({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
    });
  });

  it("frameAspectRatio renders a CSS aspect-ratio string", () => {
    expect(frameAspectRatio(DEFAULT_FRAME)).toBe("1920 / 1080");
  });

  describe("clampPercent", () => {
    it("clamps 0 to the default margin", () => {
      expect(clampPercent(0)).toBe(3);
    });

    it("clamps 100 to the default margin", () => {
      expect(clampPercent(100)).toBe(97);
    });

    it("leaves a mid-range value untouched", () => {
      expect(clampPercent(50)).toBe(50);
    });

    it("honours a custom margin", () => {
      expect(clampPercent(0, 10)).toBe(10);
      expect(clampPercent(100, 10)).toBe(90);
    });
  });

  it("clampedPointStyle clamps a bottom-left frame point into view", () => {
    expect(clampedPointStyle(0, 1080, { width: 1920, height: 1080 })).toEqual({
      left: "3%",
      top: "97%",
    });
  });

  describe("labelPlacement", () => {
    it("opens above for a point low in the frame", () => {
      expect(labelPlacement(80)).toBe("above");
    });

    it("opens below for a point high in the frame", () => {
      expect(labelPlacement(20)).toBe("below");
    });
  });

  describe("labelAlignment", () => {
    it("anchors to the start near the left edge", () => {
      expect(labelAlignment(5)).toBe("start");
    });

    it("anchors to the end near the right edge", () => {
      expect(labelAlignment(95)).toBe("end");
    });

    it("centres away from the edges", () => {
      expect(labelAlignment(50)).toBe("center");
    });
  });

  describe("trajectoryPointToPercent", () => {
    it("maps a mid-space point to 50/50", () => {
      expect(trajectoryPointToPercent({ x: 500, y: 300 })).toEqual({ pctX: 50, pctY: 50 });
    });

    it("clamps out-of-range points to 0/100", () => {
      expect(trajectoryPointToPercent({ x: -100, y: 1200 })).toEqual({ pctX: 0, pctY: 100 });
    });
  });

  describe("isFrameStalled", () => {
    it("is false when not capturing", () => {
      expect(isFrameStalled(false, 1000, 10000)).toBe(false);
    });

    it("is false when no frame has arrived yet", () => {
      expect(isFrameStalled(true, null, 10000)).toBe(false);
    });

    it("is true once the threshold is exceeded", () => {
      expect(isFrameStalled(true, 1000, 6001)).toBe(true);
    });

    it("is false exactly at the threshold", () => {
      expect(isFrameStalled(true, 1000, 6000)).toBe(false);
    });
  });

  it("fitFrameRect in cover mode fills the area and overflows the long side", () => {
    const rect = fitFrameRect({ width: 1000, height: 700 }, { width: 1920, height: 1080 }, 0, "cover");
    expect(rect.height).toBe(700);
    expect(rect.width).toBeCloseTo(1244.44, 1);
    expect(rect.left).toBeCloseTo(-122.22, 1);
    expect(rect.top).toBe(0);
  });

  describe("anchoredLabelClass", () => {
    it("opens a label above and right-aligned for a bottom-right node", () => {
      expect(anchoredLabelClass(95, 90)).toBe("bottom-full mb-2 right-0");
    });
    it("opens a label below and centred for a top-middle node", () => {
      expect(anchoredLabelClass(50, 10)).toBe("top-full mt-2 left-1/2 -translate-x-1/2");
    });
  });

  describe("polylinePointsPx", () => {
    it("scales frame pixels to the rendered frame layer as plain numbers", () => {
      expect(
        polylinePointsPx([{ x: 0, y: 0 }, { x: 960, y: 540 }, { x: 1920, y: 1080 }], DEFAULT_FRAME, {
          width: 800,
          height: 450,
        }),
      ).toBe("0,0 400,225 800,450");
    });
    it("clamps points outside the frame to its edge", () => {
      expect(polylinePointsPx([{ x: -50, y: 2000 }], DEFAULT_FRAME, { width: 100, height: 50 })).toBe("0,50");
    });
  });

  describe("clampBoxToArea", () => {
    it("centres the box on the point when it fits", () => {
      expect(clampBoxToArea({ x: 500, y: 400 }, { width: 200, height: 100 }, { width: 1000, height: 800 })).toEqual({
        left: 400,
        top: 350,
      });
    });
    it("shifts a box near the bottom-right edge back inside the area", () => {
      expect(clampBoxToArea({ x: 990, y: 790 }, { width: 200, height: 100 }, { width: 1000, height: 800 }, 10)).toEqual({
        left: 790,
        top: 690,
      });
    });
    it("pins a box near the top-left edge to the margin", () => {
      expect(clampBoxToArea({ x: 5, y: 5 }, { width: 200, height: 100 }, { width: 1000, height: 800 })).toEqual({
        left: 8,
        top: 8,
      });
    });
  });

  describe("selectFrameSource", () => {
    it("prefers a playing screen-share video", () => {
      expect(selectFrameSource(true, "data:image/png;base64,x")).toBe("video");
    });
    it("uses the last decoded captured frame without a video", () => {
      expect(selectFrameSource(false, "data:image/jpeg;base64,x")).toBe("image");
    });
    it("shows nothing (empty state) without any real frame", () => {
      expect(selectFrameSource(false, null)).toBe("none");
    });
  });

  it("node margin keeps a corner step badge clear of the frame edge", () => {
    expect(clampedPointStyle(1920, 0, DEFAULT_FRAME, HUD_NODE_MARGIN_PCT)).toEqual({ left: "96%", top: "4%" });
  });

  it("orders layers so decoration < steps < controls < fullscreen", () => {
    const rank = (cls: string) => Number(cls.replace(/\D/g, ""));
    expect(rank(HUD_LAYERS.decoration)).toBeLessThan(rank(HUD_LAYERS.steps));
    expect(rank(HUD_LAYERS.steps)).toBeLessThan(rank(HUD_LAYERS.controls));
    expect(rank(HUD_LAYERS.controls)).toBeLessThan(rank(HUD_LAYERS.drawing));
    expect(rank(HUD_LAYERS.floating)).toBeLessThan(rank(HUD_LAYERS.fullscreen));
  });

  describe("viewportHeightForWidth", () => {
    it("matches the frame aspect ratio plus the control strip", () => {
      expect(viewportHeightForWidth(1600, { width: 1920, height: 1080 }, 56)).toBe(956);
    });
    it("never goes below the minimum height", () => {
      expect(viewportHeightForWidth(200, { width: 1920, height: 1080 }, 0, 320)).toBe(320);
      expect(viewportHeightForWidth(0, { width: 1920, height: 1080 }, 56, 320)).toBe(320);
    });
  });
});
