import type { FrameSize } from "@/lib/frame-viewport";

/** Native frame used before any captured frame has reported its real size. */
export const DEFAULT_FRAME: FrameSize = { width: 1920, height: 1080 };

/** Coordinate space of 2nd HUD trajectories (remapped paths are authored in 1000x600). */
export const SECOND_HUD_SPACE: FrameSize = { width: 1000, height: 600 };

/** Percentage margin kept between an anchored overlay and the frame edge. */
export const EDGE_MARGIN_PCT = 3;

/** Height reserved under the frame for the docked step-control bar, so it never covers step nodes. */
export const HUD_CONTROL_STRIP_PX = 64;

/** Largest share of the window height each size mode lets the viewport take. */
export const HUD_SIZE_MAX_VIEWPORT = {
  default: 0.6,
  large: 0.75,
  theater: 0.9,
  fullscreen: 1,
} as const;

/** Layer order for the HUD: decoration never sits above interactive controls. */
export const HUD_LAYERS = {
  frame: "z-0",
  decoration: "z-10",
  vision: "z-20",
  steps: "z-30",
  cursor: "z-40",
  /** Non-blocking HUD modals: above the frame overlays, below every control, popover and floating chip. */
  modal: "z-[45]",
  controls: "z-50",
  drawing: "z-[55]",
  popover: "z-[60]",
  floating: "z-[70]",
  fullscreen: "z-[80]",
} as const;

/** Percentage margin for step nodes: clears the corner brackets and keeps badges fully on the frame. */
export const HUD_NODE_MARGIN_PCT = 4;

/** Which real surface the frame layer shows: the live screen-share video, the last decoded frame, or nothing. */
export type FrameSource = "video" | "image" | "none";

/** Real frames only: a playing screen share wins, then the last decoded captured frame; never a drawn placeholder. */
export function selectFrameSource(hasLiveVideo: boolean, bufferedUrl: string | null): FrameSource {
  if (hasLiveVideo) return "video";
  return bufferedUrl ? "image" : "none";
}

/** Size of the loaded image, or the default frame when it has not reported one. */
export function resolveFrameSize(natural?: Partial<FrameSize> | null): FrameSize {
  const width = natural?.width ?? 0;
  const height = natural?.height ?? 0;
  return width > 0 && height > 0 ? { width, height } : DEFAULT_FRAME;
}

/** CSS aspect-ratio value ("w / h") for the frame. */
export function frameAspectRatio(frame: FrameSize) {
  return `${frame.width} / ${frame.height}`;
}

/**
 * Rectangle with the frame's aspect ratio inside the container after reserving
 * `reservedBottom` pixels (the docked control bar), centred. "contain" fits the
 * whole frame (letterboxed); "cover" fills the area and crops the overflow.
 */
export function fitFrameRect(
  container: FrameSize,
  frame: FrameSize,
  reservedBottom = 0,
  fit: "contain" | "cover" = "contain",
) {
  const available = {
    width: Math.max(0, container.width),
    height: Math.max(0, container.height - reservedBottom),
  };
  if (!available.width || !available.height || !frame.width || !frame.height)
    return { left: 0, top: 0, width: available.width, height: available.height };
  const pick = fit === "cover" ? Math.max : Math.min;
  const scale = pick(available.width / frame.width, available.height / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  return {
    left: (available.width - width) / 2,
    top: (available.height - height) / 2,
    width,
    height,
  };
}

/** Keeps a percentage position inside [margin, 100 - margin] so anchored elements stay visible. */
export function clampPercent(pct: number, marginPct = EDGE_MARGIN_PCT) {
  return Math.min(100 - marginPct, Math.max(marginPct, pct));
}

/** CSS left/top for a frame point, clamped away from the edges. */
export function clampedPointStyle(
  x: number,
  y: number,
  frame: FrameSize,
  marginPct = EDGE_MARGIN_PCT,
) {
  return {
    left: `${clampPercent((x / frame.width) * 100, marginPct)}%`,
    top: `${clampPercent((y / frame.height) * 100, marginPct)}%`,
  };
}

/** Labels of nodes in the lower part of the frame open upward so they never run under the control bar. */
export function labelPlacement(pctY: number, flipAbovePct = 65): "above" | "below" {
  return pctY >= flipAbovePct ? "above" : "below";
}

/** Horizontal anchoring for a label so it does not overflow the left/right frame edge. */
export function labelAlignment(pctX: number, edgePct = 15): "start" | "center" | "end" {
  if (pctX <= edgePct) return "start";
  if (pctX >= 100 - edgePct) return "end";
  return "center";
}

const LABEL_VERTICAL = { above: "bottom-full mb-2", below: "top-full mt-2" } as const;
const LABEL_HORIZONTAL = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
} as const;

/** Tailwind position classes for a label anchored to a node at (pctX, pctY) of the frame. */
export function anchoredLabelClass(pctX: number, pctY: number) {
  return `${LABEL_VERTICAL[labelPlacement(pctY)]} ${LABEL_HORIZONTAL[labelAlignment(pctX)]}`;
}

/**
 * Height in px for a HUD viewport whose width is known: the frame's height at
 * that width plus the reserved control strip, never below `minHeight`.
 */
export function viewportHeightForWidth(
  width: number,
  frame: FrameSize,
  reservedBottom: number,
  minHeight = 320,
) {
  if (width <= 0) return minHeight;
  return Math.max(minHeight, Math.round((width * frame.height) / frame.width + reservedBottom));
}

/** A 2nd HUD trajectory point as percentages of the overlay, clamped to the frame. */
export function trajectoryPointToPercent(
  point: { x: number; y: number },
  space: FrameSize = SECOND_HUD_SPACE,
) {
  return {
    pctX: Math.min(100, Math.max(0, (point.x / space.width) * 100)),
    pctY: Math.min(100, Math.max(0, (point.y / space.height) * 100)),
  };
}

/**
 * SVG polyline `points` in rendered pixels for frame-pixel points, given the
 * measured size of the frame layer. Points outside the frame are clamped to it.
 */
export function polylinePointsPx(
  points: ReadonlyArray<{ x: number; y: number }>,
  frame: FrameSize,
  rendered: FrameSize,
) {
  return points
    .map(({ x, y }) => {
      const px = (Math.min(frame.width, Math.max(0, x)) / frame.width) * rendered.width;
      const py = (Math.min(frame.height, Math.max(0, y)) / frame.height) * rendered.height;
      return `${px},${py}`;
    })
    .join(" ");
}

/**
 * Top-left (px) for a box of `box` size centred on `point`, shifted so the box
 * stays inside `area` with `margin` px to spare (pinned to the top-left when it cannot fit).
 */
export function clampBoxToArea(
  point: { x: number; y: number },
  box: FrameSize,
  area: FrameSize,
  margin = 8,
) {
  const clampAxis = (centre: number, size: number, limit: number) =>
    Math.max(margin, Math.min(limit - size - margin, centre - size / 2));
  return {
    left: clampAxis(point.x, box.width, area.width),
    top: clampAxis(point.y, box.height, area.height),
  };
}

/** True when the stream is capturing but the frame has not changed for `thresholdMs`. */
export function isFrameStalled(
  isCapturing: boolean,
  lastFrameAt: number | null,
  now: number,
  thresholdMs = 5000,
) {
  return isCapturing && lastFrameAt !== null && now - lastFrameAt > thresholdMs;
}

// ---------- Panel dock and modals ----------

/** Panels docked under the viewport; each is a collapsible section of the dock. */
export const HUD_DOCK_PANELS = ["master", "intentions", "progress"] as const;
export type HudDockPanel = (typeof HUD_DOCK_PANELS)[number];
export type HudDockState = Record<HudDockPanel, boolean>;

export const HUD_DOCK_STORAGE_KEY = "sightline_hud_dock_state";

/** Panels start collapsed so opening the HUD never pushes its controls away. */
export const DEFAULT_DOCK_STATE: HudDockState = { master: false, intentions: false, progress: false };

/** Saved open/collapsed state; unknown keys and malformed values fall back to the default. */
export function parseDockState(raw: string | null): HudDockState {
  try {
    const saved = raw ? JSON.parse(raw) : null;
    return Object.fromEntries(
      HUD_DOCK_PANELS.map((panel) => [panel, typeof saved?.[panel] === "boolean" ? saved[panel] : DEFAULT_DOCK_STATE[panel]]),
    ) as HudDockState;
  } catch {
    return { ...DEFAULT_DOCK_STATE };
  }
}

/**
 * Largest height (px) the dock may take: a share of the window so the viewport
 * and bottom bar always keep the rest, never below a usable minimum.
 */
export function hudDockMaxHeight(windowHeight: number, share = 0.3, minPx = 120, maxPx = 360) {
  return Math.min(maxPx, Math.max(minPx, Math.round(windowHeight * share)));
}

/** Window bands a HUD modal keeps clear: the floating controls at the top and the control bar at the bottom. */
export const HUD_MODAL_RESERVED = { top: 64, bottom: HUD_CONTROL_STRIP_PX } as const;

/**
 * Wrapper for an existing modal box: centres it between the reserved bands with no
 * backdrop; the wrapper ignores the pointer so everything around the box stays clickable.
 * The box itself takes HUD_MODAL_BOX_CLASS.
 */
export const HUD_MODAL_FRAME_CLASS = `fixed inset-x-0 top-16 bottom-16 flex items-center justify-center p-2 pointer-events-none ${HUD_LAYERS.modal}`;
export const HUD_MODAL_BOX_CLASS = "pointer-events-auto max-h-full";

/**
 * Fixed-position rect for a centred, non-fullscreen modal of at most `desired`
 * size inside the window, kept out of the reserved top and bottom bands.
 */
export function hudModalRect(
  windowSize: FrameSize,
  desired: FrameSize,
  reserved: { top: number; bottom: number } = HUD_MODAL_RESERVED,
  margin = 8,
) {
  const area = {
    width: Math.max(0, windowSize.width),
    height: Math.max(0, windowSize.height - reserved.top - reserved.bottom),
  };
  const box = {
    width: Math.min(desired.width, Math.max(0, area.width - 2 * margin)),
    height: Math.min(desired.height, Math.max(0, area.height - 2 * margin)),
  };
  const { left, top } = clampBoxToArea({ x: area.width / 2, y: area.height / 2 }, box, area, margin);
  return { left, top: top + reserved.top, width: box.width, maxHeight: box.height };
}
