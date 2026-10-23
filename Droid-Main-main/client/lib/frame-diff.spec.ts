import { describe, expect, it } from "vitest";
import {
  DIFF_GRID_HEIGHT,
  DIFF_GRID_WIDTH,
  classifyFrameChange,
  frameDiff,
  toGrayFrame,
  type GrayFrame,
} from "./frame-diff";

/** A uniform gray grid of the default diff size. */
function solidFrame(value: number, width = DIFF_GRID_WIDTH, height = DIFF_GRID_HEIGHT): GrayFrame {
  return { width, height, data: new Array(width * height).fill(value) };
}

/** `frame` with a `w`x`h` rectangle at (`x`,`y`) repainted to `value`. */
function withRect(frame: GrayFrame, x: number, y: number, w: number, h: number, value: number): GrayFrame {
  const data = Array.from(frame.data);
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) {
      data[cy * frame.width + cx] = value;
    }
  }
  return { width: frame.width, height: frame.height, data };
}

/** Fractional cell-centre position of a `w`x`h` rectangle placed at (`x`,`y`) in a frame. */
function rectCenterFraction(frame: GrayFrame, x: number, y: number, w: number, h: number) {
  return { x: (x + w / 2) / frame.width, y: (y + h / 2) / frame.height };
}

describe("frameDiff", () => {
  it("is 0 for identical frames", () => {
    const frame = withRect(solidFrame(100), 10, 10, 5, 5, 200);
    expect(frameDiff(frame, frame)).toBe(0);
  });

  it("is 0 when the only change sits inside the cursor mask", () => {
    const base = solidFrame(100);
    const current = withRect(base, 31, 17, 2, 2, 200);
    const cursor = rectCenterFraction(base, 31, 17, 2, 2);

    const diff = frameDiff(base, current, { cursors: [cursor], cursorRadius: 0.15 });

    expect(diff).toBe(0);
  });

  it("is greater than 0 for the same change without the cursor option", () => {
    const base = solidFrame(100);
    const current = withRect(base, 31, 17, 2, 2, 200);

    expect(frameDiff(base, current)).toBeGreaterThan(0);
  });

  it("is 1 for frames of mismatched size", () => {
    const a = solidFrame(100, 64, 36);
    const b = solidFrame(100, 32, 18);

    expect(frameDiff(a, b)).toBe(1);
  });
});

describe("toGrayFrame", () => {
  it("box-averages an RGBA buffer into the gray grid", () => {
    // 2x2 image: one white pixel (luminance 255) and three black pixels (luminance 0),
    // downsampled into a single 1x1 cell so the result is their plain average.
    const rgba = [
      255, 255, 255, 255, // white
      0, 0, 0, 255, // black
      0, 0, 0, 255, // black
      0, 0, 0, 255, // black
    ];

    const gray = toGrayFrame(rgba, 2, 2, 1, 1);

    expect(gray.width).toBe(1);
    expect(gray.height).toBe(1);
    expect(gray.data[0]).toBeCloseTo(63.75, 5);
  });
});

describe("classifyFrameChange", () => {
  it("classifies as progress when the current frame matches the expected frame", () => {
    const previous = solidFrame(100);
    const current = solidFrame(150);
    const expected = solidFrame(150);

    const result = classifyFrameChange({ previous, current, expected });

    expect(result.kind).toBe("progress");
    expect(result.expectedDiff).toBe(0);
  });

  it("classifies as no_change when the current frame matches the previous one, even with a differing expected frame", () => {
    const previous = solidFrame(100);
    const current = solidFrame(100);
    const expected = solidFrame(200);

    const result = classifyFrameChange({ previous, current, expected });

    expect(result.kind).toBe("no_change");
    expect(result.diff).toBe(0);
  });

  it("classifies cursor-only movement as no_change", () => {
    const base = solidFrame(100);
    const previous = withRect(base, 5, 5, 2, 2, 200);
    const current = withRect(base, 50, 30, 2, 2, 200);
    const cursors = [
      rectCenterFraction(base, 5, 5, 2, 2),
      rectCenterFraction(base, 50, 30, 2, 2),
    ];

    const result = classifyFrameChange({
      previous,
      current,
      options: { cursors, cursorRadius: 0.05 },
    });

    expect(result.kind).toBe("no_change");
  });

  it("classifies as backtrack when the current frame matches an earlier frame but not the expected one", () => {
    const previous = solidFrame(100);
    const current = solidFrame(200);
    const expected = solidFrame(250);
    const earlier = [solidFrame(200)];

    const result = classifyFrameChange({ previous, current, expected, earlier });

    expect(result.kind).toBe("backtrack");
  });

  it("classifies as wrong_page when the changed screen matches neither the expected nor an earlier frame", () => {
    const previous = solidFrame(100);
    const current = solidFrame(200);
    const expected = solidFrame(250);
    const earlier = [solidFrame(50)];

    const result = classifyFrameChange({ previous, current, expected, earlier });

    expect(result.kind).toBe("wrong_page");
  });

  it("classifies a changed, never-before-seen screen as progress when there is no expected frame", () => {
    const previous = solidFrame(100);
    const current = solidFrame(200);
    const earlier = [solidFrame(50)];

    const result = classifyFrameChange({ previous, current, earlier });

    expect(result.kind).toBe("progress");
    expect(result.expectedDiff).toBeNull();
  });

  it("leaves expectedDiff null when no expected frame is given", () => {
    const previous = solidFrame(100);
    const current = solidFrame(100);

    const result = classifyFrameChange({ previous, current });

    expect(result.expectedDiff).toBeNull();
  });
});
