import { describe, expect, it } from "vitest";
import { cropPatch, matchTemplate, measureDrift, patchStdDev, rgbaToGray, type GrayImage } from "./template-match";

/** A 200x120 dark screen with a textured 20x20 "button" whose top-left is (bx, by). */
function screen(bx: number, by: number): GrayImage {
  const width = 200;
  const height = 120;
  const data = new Float32Array(width * height).fill(30);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) data[(by + y) * width + bx + x] = 100 + ((x * 7 + y * 13) % 120);
  }
  return { width, height, data };
}

describe("measureDrift", () => {
  it("locates a target that moved and reports the pixel drift", () => {
    const reference = screen(60, 40);
    const live = screen(73, 31);
    const drift = measureDrift(reference, live, 70, 50);
    expect(drift.status).toBe("located");
    expect(drift.located).toEqual({ x: 83, y: 41 });
    expect([drift.dx, drift.dy]).toEqual([13, -9]);
    expect(drift.distance).toBeCloseTo(Math.hypot(13, 9), 5);
    expect(drift.score).toBeGreaterThan(0.99);
  });

  it("reports zero drift when the target has not moved", () => {
    const drift = measureDrift(screen(60, 40), screen(60, 40), 70, 50);
    expect(drift).toMatchObject({ status: "located", dx: 0, dy: 0, distance: 0 });
  });

  it("measures residual drift from a given point (re-verify after acting)", () => {
    const drift = measureDrift(screen(60, 40), screen(73, 31), 70, 50, { from: { x: 83, y: 41 } });
    expect(drift).toMatchObject({ status: "located", dx: 0, dy: 0, expected: { x: 83, y: 41 } });
  });

  it("is not_found when the target is gone from the live frame", () => {
    const blank: GrayImage = { width: 200, height: 120, data: new Float32Array(200 * 120).fill(30) };
    expect(measureDrift(screen(60, 40), blank, 70, 50).status).toBe("not_found");
  });

  it("is unmeasured on a flat target area, at the frame edge, or across frame sizes", () => {
    expect(measureDrift(screen(60, 40), screen(60, 40), 150, 90).status).toBe("unmeasured");
    expect(measureDrift(screen(60, 40), screen(60, 40), 3, 3).status).toBe("unmeasured");
    const small: GrayImage = { width: 100, height: 60, data: new Float32Array(6000) };
    expect(measureDrift(screen(60, 40), small, 70, 50).status).toBe("unmeasured");
  });
});

describe("template primitives", () => {
  it("crops a centred patch and rejects one outside the image", () => {
    const patch = cropPatch(screen(60, 40), 70, 50, 4)!;
    expect([patch.width, patch.height]).toEqual([9, 9]);
    expect(patchStdDev(patch)).toBeGreaterThan(6);
    expect(cropPatch(screen(60, 40), 1, 1, 4)).toBeNull();
  });

  it("matchTemplate finds the patch centre within the radius", () => {
    const patch = cropPatch(screen(60, 40), 70, 50, 8)!;
    expect(matchTemplate(screen(65, 45), patch, 70, 50, 10)).toMatchObject({ x: 75, y: 55 });
  });

  it("converts RGBA to luminance", () => {
    const gray = rgbaToGray([255, 255, 255, 255, 0, 0, 0, 255], 2, 1);
    expect(gray.data[0]).toBeCloseTo(255, 3);
    expect(gray.data[1]).toBe(0);
  });
});
