export interface FrameSize {
  width: number;
  height: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FrameViewport extends ViewportRect {
  scale: number;
}

/** Clamps a value to be non-negative. */
const positive = (value: number) => Math.max(0, value);

/**
 * Returns the displayed frame rectangle for an object-contain media element.
 * Coordinates inside this rectangle are in CSS pixels, independent of DPR.
 */
export function getContainedFrameViewport(
  viewport: ViewportRect,
  frame: FrameSize,
): FrameViewport {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    return { ...viewport, scale: 0 };
  }

  const scale = Math.min(
    viewport.width / frame.width,
    viewport.height / frame.height,
  );
  const width = frame.width * scale;
  const height = frame.height * scale;

  return {
    left: viewport.left + (viewport.width - width) / 2,
    top: viewport.top + (viewport.height - height) / 2,
    width,
    height,
    scale,
  };
}

/**
 * Converts client (viewport) pixel coordinates into frame pixel coordinates,
 * clamped to the frame bounds. Returns `{x: 0, y: 0}` when the viewport has
 * no valid scale.
 */
export function framePointFromClient(
  clientX: number,
  clientY: number,
  viewport: FrameViewport,
  frame: FrameSize,
) {
  if (viewport.scale <= 0) return { x: 0, y: 0 };

  return {
    x: Math.round(
      Math.min(
        frame.width,
        Math.max(0, (clientX - viewport.left) / viewport.scale),
      ),
    ),
    y: Math.round(
      Math.min(
        frame.height,
        Math.max(0, (clientY - viewport.top) / viewport.scale),
      ),
    ),
  };
}

/**
 * Converts frame pixel coordinates into client (viewport) pixel coordinates
 * for the given displayed viewport rectangle.
 */
export function clientPointFromFrame(
  x: number,
  y: number,
  viewport: FrameViewport,
  frame: FrameSize,
) {
  return {
    x:
      viewport.left +
      (positive(Math.min(frame.width, x)) / frame.width) * viewport.width,
    y:
      viewport.top +
      (positive(Math.min(frame.height, y)) / frame.height) * viewport.height,
  };
}

/**
 * Expresses a frame coordinate as CSS percentage offsets (`left`/`top`)
 * relative to the frame size, clamped within the frame bounds.
 */
export function framePointAsPercent(x: number, y: number, frame: FrameSize) {
  const pct = framePointToPercent(x, y, frame);
  return { left: `${pct.pctX}%`, top: `${pct.pctY}%` };
}

/**
 * Expresses a frame coordinate as numeric percentages (0–100) of the frame,
 * clamped within the frame bounds.
 */
export function framePointToPercent(x: number, y: number, frame: FrameSize) {
  return {
    pctX: (positive(Math.min(frame.width, x)) / frame.width) * 100,
    pctY: (positive(Math.min(frame.height, y)) / frame.height) * 100,
  };
}

export interface FrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a box given in percentages (0–100) of the frame into frame pixels.
 */
export function percentBoxToFrame(box: FrameBox, frame: FrameSize): FrameBox {
  return {
    x: (box.x / 100) * frame.width,
    y: (box.y / 100) * frame.height,
    width: (box.width / 100) * frame.width,
    height: (box.height / 100) * frame.height,
  };
}

/**
 * Expresses a frame-pixel box as CSS percentage `left`/`top`/`width`/`height`.
 */
export function frameBoxAsPercent(box: FrameBox, frame: FrameSize) {
  const origin = framePointToPercent(box.x, box.y, frame);
  const end = framePointToPercent(box.x + box.width, box.y + box.height, frame);
  return {
    left: `${origin.pctX}%`,
    top: `${origin.pctY}%`,
    width: `${end.pctX - origin.pctX}%`,
    height: `${end.pctY - origin.pctY}%`,
  };
}

/** True when the frame point lies inside the frame-pixel box (edges included). */
export function frameBoxContains(box: FrameBox, x: number, y: number) {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}
