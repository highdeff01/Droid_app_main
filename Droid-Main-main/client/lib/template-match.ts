/**
 * Template matching for verified replay: a patch cut around the recorded target is located on the
 * live frame by zero-mean normalized cross-correlation (NCC) inside a search window, which gives
 * the target's real position and so the pixel drift from the recorded coordinates.
 */

/** A full-resolution grayscale image (row-major luminance, 0–255). */
export interface GrayImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface TemplateMatch {
  /** Centre of the best match, in image pixels. */
  x: number;
  y: number;
  /** NCC score, -1..1 (1 = identical up to brightness/contrast). */
  score: number;
}

export type DriftStatus = "located" | "not_found" | "unmeasured";

export interface DriftMeasurement {
  status: DriftStatus;
  expected: { x: number; y: number };
  /** Where the target was found; null unless located. */
  located: { x: number; y: number } | null;
  dx: number;
  dy: number;
  /** Euclidean drift in pixels. */
  distance: number;
  score: number | null;
  detail: string;
}

export interface MatchOptions {
  /** Half the patch side in pixels (patch is 2*half+1 square). */
  half?: number;
  /** Search radius around the expected point, in pixels. */
  radius?: number;
  /** Lowest NCC score accepted as the same target. */
  minScore?: number;
  /** Where to search and measure drift from on the live frame (default: the recorded point). */
  from?: { x: number; y: number };
}

export const PATCH_HALF = 16;
export const SEARCH_RADIUS = 96;
export const MIN_MATCH_SCORE = 0.7;
/** A patch flatter than this (luminance std dev) has nothing to match on. */
export const MIN_PATCH_STDDEV = 6;

/** RGBA pixels as full-resolution luminance. */
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return { width, height, data };
}

/** The (2*half+1)² square centred on (cx, cy); null when it does not fit in the image. */
export function cropPatch(image: GrayImage, cx: number, cy: number, half = PATCH_HALF): GrayImage | null {
  const size = half * 2 + 1;
  const x0 = Math.round(cx) - half;
  const y0 = Math.round(cy) - half;
  if (x0 < 0 || y0 < 0 || x0 + size > image.width || y0 + size > image.height) return null;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data[y * size + x] = image.data[(y0 + y) * image.width + x0 + x];
  }
  return { width: size, height: size, data };
}

function meanOf(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length ? sum / values.length : 0;
}

/** Luminance standard deviation of a patch. */
export function patchStdDev(patch: GrayImage): number {
  const mean = meanOf(patch.data);
  let sq = 0;
  for (let i = 0; i < patch.data.length; i++) sq += (patch.data[i] - mean) ** 2;
  return patch.data.length ? Math.sqrt(sq / patch.data.length) : 0;
}

/** NCC of the patch placed with its top-left at (ox, oy); 0 when the window is flat. */
function nccAt(image: GrayImage, patch: GrayImage, centred: Float32Array, patchNorm: number, ox: number, oy: number): number {
  const n = patch.width * patch.height;
  let sum = 0;
  let sumSq = 0;
  let cross = 0;
  for (let y = 0; y < patch.height; y++) {
    const row = (oy + y) * image.width + ox;
    for (let x = 0; x < patch.width; x++) {
      const v = image.data[row + x];
      sum += v;
      sumSq += v * v;
      cross += v * centred[y * patch.width + x];
    }
  }
  const windowNorm = sumSq - (sum * sum) / n;
  return windowNorm <= 1e-6 ? 0 : cross / Math.sqrt(windowNorm * patchNorm);
}

/** Best NCC match of the patch within `radius` of (cx, cy); ties go to the smaller displacement. */
export function matchTemplate(image: GrayImage, patch: GrayImage, cx: number, cy: number, radius = SEARCH_RADIUS): TemplateMatch | null {
  const mean = meanOf(patch.data);
  const centred = new Float32Array(patch.data.length);
  let patchNorm = 0;
  for (let i = 0; i < centred.length; i++) {
    centred[i] = patch.data[i] - mean;
    patchNorm += centred[i] ** 2;
  }
  if (patchNorm <= 1e-6) return null;
  const hw = Math.floor(patch.width / 2);
  const hh = Math.floor(patch.height / 2);
  let best: (TemplateMatch & { d: number }) | null = null;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ox = Math.round(cx) + dx - hw;
      const oy = Math.round(cy) + dy - hh;
      if (ox < 0 || oy < 0 || ox + patch.width > image.width || oy + patch.height > image.height) continue;
      const score = nccAt(image, patch, centred, patchNorm, ox, oy);
      const d = dx * dx + dy * dy;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && d < best.d)) {
        best = { x: ox + hw, y: oy + hh, score, d };
      }
    }
  }
  return best && { x: best.x, y: best.y, score: best.score };
}

/** A drift that could not be measured; the step keeps its recorded coordinates. */
export function unmeasuredDrift(x: number, y: number, detail: string): DriftMeasurement {
  return { status: "unmeasured", expected: { x, y }, located: null, dx: 0, dy: 0, distance: 0, score: null, detail };
}

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/**
 * Locates the target recorded at (x, y) on `reference` in `live` and measures the drift from
 * `options.from` (default the recorded point). Both images must be the same size (same screen);
 * otherwise the drift is unmeasured.
 */
export function measureDrift(reference: GrayImage, live: GrayImage, x: number, y: number, options: MatchOptions = {}): DriftMeasurement {
  const ex = Math.round(options.from?.x ?? x);
  const ey = Math.round(options.from?.y ?? y);
  if (reference.width !== live.width || reference.height !== live.height) {
    return unmeasuredDrift(ex, ey, `Saved frame is ${reference.width}x${reference.height}, live frame ${live.width}x${live.height}; drift not measured`);
  }
  const patch = cropPatch(reference, x, y, options.half ?? PATCH_HALF);
  if (!patch) return unmeasuredDrift(ex, ey, `Target (${Math.round(x)}, ${Math.round(y)}) is too close to the frame edge; drift not measured`);
  if (patchStdDev(patch) < MIN_PATCH_STDDEV) {
    return unmeasuredDrift(ex, ey, `Target area around (${Math.round(x)}, ${Math.round(y)}) has no texture to match; drift not measured`);
  }
  const match = matchTemplate(live, patch, ex, ey, options.radius ?? SEARCH_RADIUS);
  const minScore = options.minScore ?? MIN_MATCH_SCORE;
  if (!match || match.score < minScore) {
    const score = match ? match.score : null;
    return {
      status: "not_found",
      expected: { x: ex, y: ey },
      located: null,
      dx: 0,
      dy: 0,
      distance: 0,
      score,
      detail: `Target from (${ex}, ${ey}) not found on the live frame (best match ${score === null ? "none" : score.toFixed(2)} < ${minScore})`,
    };
  }
  const dx = match.x - ex;
  const dy = match.y - ey;
  const distance = Math.hypot(dx, dy);
  return {
    status: "located",
    expected: { x: ex, y: ey },
    located: { x: match.x, y: match.y },
    dx,
    dy,
    distance,
    score: match.score,
    detail: `Target located at (${match.x}, ${match.y}): drift (${signed(dx)}, ${signed(dy)}) px = ${distance.toFixed(1)} px, match ${match.score.toFixed(2)}`,
  };
}
