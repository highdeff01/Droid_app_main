export interface CalibrationCoordinates {
  x: number;
  y: number;
  driftPx?: number;
}

export interface CoordinateCalibrationProfile {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  dpiScale: number;
  resolutionWidth?: number;
  resolutionHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  jitterDamping?: number;
  aspectRatioMode?: string;
  lastCalibratedAt?: number;
}

export const DEFAULT_CALIBRATION_PROFILE: CoordinateCalibrationProfile = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1.0,
  scaleY: 1.0,
  dpiScale: 1.0,
  resolutionWidth: 1920,
  resolutionHeight: 1080,
  screenWidth: 1920,
  screenHeight: 1080,
  jitterDamping: 1.0,
  aspectRatioMode: "16:9",
  lastCalibratedAt: Date.now(),
};

const STORAGE_KEY = "sightline_coordinate_calibration_profile";

export function getStoredCalibration(): CoordinateCalibrationProfile {
  if (typeof window === "undefined") return DEFAULT_CALIBRATION_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CALIBRATION_PROFILE, ...JSON.parse(raw) } : DEFAULT_CALIBRATION_PROFILE;
  } catch {
    return DEFAULT_CALIBRATION_PROFILE;
  }
}

export function saveStoredCalibration(profile: CoordinateCalibrationProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

export interface Point {
  x: number;
  y: number;
}

/** Positive number or the fallback. */
const positiveOr = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Factors that map the native resolution space (resolutionWidth × resolutionHeight)
 * onto physical screen pixels (screen size × dpiScale).
 */
export function resolutionToScreenFactors(profile: CoordinateCalibrationProfile): Point {
  const dpi = positiveOr(profile.dpiScale, 1);
  const resW = positiveOr(profile.resolutionWidth, DEFAULT_CALIBRATION_PROFILE.resolutionWidth!);
  const resH = positiveOr(profile.resolutionHeight, DEFAULT_CALIBRATION_PROFILE.resolutionHeight!);
  const screenW = positiveOr(profile.screenWidth, resW);
  const screenH = positiveOr(profile.screenHeight, resH);
  return { x: (screenW * dpi) / resW, y: (screenH * dpi) / resH };
}

/**
 * Moves `current` toward `previous` by the profile's jitterDamping: the point
 * advances 1/damping of the way from the previous point. Damping ≤ 1 is a no-op.
 */
export function dampJitter(current: Point, previous: Point | undefined, damping: number | undefined): Point {
  const factor = positiveOr(damping, 1);
  if (!previous || factor <= 1) return current;
  return {
    x: previous.x + (current.x - previous.x) / factor,
    y: previous.y + (current.y - previous.y) / factor,
  };
}

/** Normalizes the legacy argument forms into a point and a full profile. */
function resolveCalibrationArgs(
  xOrCoords: number | Point,
  yOrOffset: number | { x?: number; y?: number } | CoordinateCalibrationProfile | undefined,
  profileArg: CoordinateCalibrationProfile | undefined,
): { point: Point; profile: CoordinateCalibrationProfile } {
  const point =
    typeof xOrCoords === "number"
      ? { x: xOrCoords, y: typeof yOrOffset === "number" ? yOrOffset : 0 }
      : { x: xOrCoords.x, y: xOrCoords.y };
  if (profileArg) return { point, profile: { ...DEFAULT_CALIBRATION_PROFILE, ...profileArg } };
  if (typeof yOrOffset === "object" && yOrOffset !== null) {
    if ("offsetX" in yOrOffset) return { point, profile: { ...DEFAULT_CALIBRATION_PROFILE, ...yOrOffset } };
    const legacy = yOrOffset as { x?: number; y?: number };
    return {
      point,
      profile: { ...DEFAULT_CALIBRATION_PROFILE, offsetX: legacy.x || 0, offsetY: legacy.y || 0 },
    };
  }
  return { point, profile: getStoredCalibration() };
}

/**
 * Maps a point in the native resolution space into calibrated physical screen
 * pixels: offset and scale correction, jitter damping against `previous`
 * (an earlier calibrated point), then resolution → screen × dpiScale.
 * Without a profile the stored calibration profile is used.
 */
export function calibrateCoordinates(
  xOrCoords: number | Point,
  yOrOffset?: number | { x?: number; y?: number } | CoordinateCalibrationProfile,
  profileArg?: CoordinateCalibrationProfile,
  previous?: Point,
): CalibrationCoordinates {
  const { point, profile } = resolveCalibrationArgs(xOrCoords, yOrOffset, profileArg);
  const correctedX = (point.x + profile.offsetX) * profile.scaleX;
  const correctedY = (point.y + profile.offsetY) * profile.scaleY;
  const driftPx = Math.round(Math.hypot(correctedX - point.x, correctedY - point.y));

  const factors = resolutionToScreenFactors(profile);
  const screenPoint = { x: correctedX * factors.x, y: correctedY * factors.y };
  const damped = dampJitter(screenPoint, previous, profile.jitterDamping);

  return { x: Math.round(damped.x), y: Math.round(damped.y), driftPx };
}

/**
 * Projects a calibrated physical screen point onto a viewport of the given CSS
 * size, so the AI cursor lands where the calibrated user cursor would.
 */
export function screenToViewport(
  point: Point,
  profile: CoordinateCalibrationProfile,
  viewport: { width: number; height: number },
): Point {
  const factors = resolutionToScreenFactors(profile);
  const resW = positiveOr(profile.resolutionWidth, DEFAULT_CALIBRATION_PROFILE.resolutionWidth!);
  const resH = positiveOr(profile.resolutionHeight, DEFAULT_CALIBRATION_PROFILE.resolutionHeight!);
  return {
    x: (point.x / (resW * factors.x)) * viewport.width,
    y: (point.y / (resH * factors.y)) * viewport.height,
  };
}
