/**
 * Frame-to-frame screen change detection for verified replay. Frames are compared as small
 * grayscale grids; cells around the mouse cursor (where the pointer itself is drawn) are
 * masked out so a cursor that moved never counts as a screen change.
 */

export interface GrayFrame {
  width: number;
  height: number;
  /** Row-major luminance, 0–255, length width*height. */
  data: ArrayLike<number>;
}

/** A cursor position in frame fractions (0–1). */
export interface CursorMark {
  x: number;
  y: number;
}

export interface DiffOptions {
  /** Cursor positions whose neighbourhood is ignored (both frames' cursors). */
  cursors?: CursorMark[];
  /** Masked radius around each cursor, as a fraction of the frame width. */
  cursorRadius?: number;
  /** Luminance delta a cell needs to count as changed. */
  pixelThreshold?: number;
}

export const DIFF_GRID_WIDTH = 64;
export const DIFF_GRID_HEIGHT = 36;
export const DEFAULT_CURSOR_RADIUS = 0.04;
export const DEFAULT_PIXEL_THRESHOLD = 24;
/** Changed-cell fraction under which two frames show the same screen. */
export const SAME_SCREEN_MAX_DIFF = 0.02;
/** Changed-cell fraction under which a frame matches a saved frame. */
export const MATCH_MAX_DIFF = 0.08;

/** RGBA pixels downsampled (box average) to a gray grid. */
export function toGrayFrame(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  gridWidth = DIFF_GRID_WIDTH,
  gridHeight = DIFF_GRID_HEIGHT,
): GrayFrame {
  const sums = new Array(gridWidth * gridHeight).fill(0);
  const counts = new Array(gridWidth * gridHeight).fill(0);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(gridHeight - 1, Math.floor((y * gridHeight) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gridWidth - 1, Math.floor((x * gridWidth) / width));
      const i = (y * width + x) * 4;
      sums[gy * gridWidth + gx] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      counts[gy * gridWidth + gx] += 1;
    }
  }
  return { width: gridWidth, height: gridHeight, data: sums.map((s, i) => (counts[i] ? s / counts[i] : 0)) };
}

function isMasked(cx: number, cy: number, frame: GrayFrame, cursors: CursorMark[], radius: number): boolean {
  const fx = (cx + 0.5) / frame.width;
  const fy = (cy + 0.5) / frame.height;
  const aspect = frame.height / frame.width;
  return cursors.some((c) => Math.hypot(fx - c.x, (fy - c.y) * aspect) <= radius);
}

/** Fraction (0–1) of unmasked cells whose luminance changed by more than the threshold. */
export function frameDiff(a: GrayFrame, b: GrayFrame, options: DiffOptions = {}): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  const cursors = options.cursors ?? [];
  const radius = options.cursorRadius ?? DEFAULT_CURSOR_RADIUS;
  const threshold = options.pixelThreshold ?? DEFAULT_PIXEL_THRESHOLD;
  let compared = 0;
  let changed = 0;
  for (let cy = 0; cy < a.height; cy++) {
    for (let cx = 0; cx < a.width; cx++) {
      if (isMasked(cx, cy, a, cursors, radius)) continue;
      const i = cy * a.width + cx;
      compared += 1;
      if (Math.abs(a.data[i] - b.data[i]) > threshold) changed += 1;
    }
  }
  return compared ? changed / compared : 0;
}

export type FrameChangeKind = "progress" | "no_change" | "backtrack" | "wrong_page";

export interface FrameChange {
  kind: FrameChangeKind;
  /** Diff against the previous live frame. */
  diff: number;
  /** Diff against the expected saved frame, when there is one. */
  expectedDiff: number | null;
  reason: string;
}

export interface ClassifyInput {
  previous: GrayFrame;
  current: GrayFrame;
  /** The saved frame the replay expects to see now (the next step's recorded frame). */
  expected?: GrayFrame | null;
  /** Earlier screens of this run (saved or seen), oldest first, excluding `previous`. */
  earlier?: GrayFrame[];
  options?: DiffOptions;
}

/**
 * How the screen moved between two frames:
 * - no_change: same screen as before (cursor movement ignored);
 * - progress: matches the expected saved frame, or a new screen when none is expected;
 * - backtrack: returned to an earlier screen of the run;
 * - wrong_page: changed into a screen that is neither expected nor seen before.
 */
export function classifyFrameChange(input: ClassifyInput): FrameChange {
  const opts = input.options;
  const diff = frameDiff(input.previous, input.current, opts);
  const expectedDiff = input.expected ? frameDiff(input.expected, input.current, opts) : null;
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  if (expectedDiff !== null && expectedDiff <= MATCH_MAX_DIFF) {
    return { kind: "progress", diff, expectedDiff, reason: `Screen matches the saved frame (${pct(expectedDiff)} differs)` };
  }
  if (diff <= SAME_SCREEN_MAX_DIFF) {
    return { kind: "no_change", diff, expectedDiff, reason: `Screen did not change (${pct(diff)} differs, cursor ignored)` };
  }
  const revisited = (input.earlier ?? []).findIndex((frame) => frameDiff(frame, input.current, opts) <= MATCH_MAX_DIFF);
  if (revisited !== -1) {
    return { kind: "backtrack", diff, expectedDiff, reason: `Screen went back to earlier screen #${revisited + 1}` };
  }
  if (expectedDiff === null) {
    return { kind: "progress", diff, expectedDiff, reason: `New screen (${pct(diff)} changed); no saved frame to compare` };
  }
  return {
    kind: "wrong_page",
    diff,
    expectedDiff,
    reason: `Screen changed (${pct(diff)}) but differs ${pct(expectedDiff)} from the saved frame`,
  };
}

/** Browser-only: decodes a data URL into a gray grid; rejects when the image cannot be read. */
export function loadGrayFrame(dataUrl: string): Promise<GrayFrame> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = DIFF_GRID_WIDTH * 4;
      canvas.height = DIFF_GRID_HEIGHT * 4;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2D is unavailable for frame comparison"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(toGrayFrame(data, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error("Frame image could not be decoded"));
    img.src = dataUrl;
  });
}
