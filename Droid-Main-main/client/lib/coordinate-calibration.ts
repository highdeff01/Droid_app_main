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

export function calibrateCoordinates(
  xOrCoords: number | { x: number; y: number },
  yOrOffset?: number | { x?: number; y?: number } | CoordinateCalibrationProfile,
  profileArg?: CoordinateCalibrationProfile
): CalibrationCoordinates {
  const x = typeof xOrCoords === "number" ? xOrCoords : xOrCoords.x;
  const y = typeof xOrCoords === "number" ? (typeof yOrOffset === "number" ? yOrOffset : 0) : xOrCoords.y;
  let offX = 0;
  let offY = 0;
  let scaleX = 1.0;
  let scaleY = 1.0;

  const prof = profileArg || (typeof yOrOffset === "object" && yOrOffset !== null ? yOrOffset : undefined);
  if (prof) {
    offX = "offsetX" in prof ? prof.offsetX : ((prof as any).x || 0);
    offY = "offsetY" in prof ? prof.offsetY : ((prof as any).y || 0);
    scaleX = "scaleX" in prof ? prof.scaleX : 1.0;
    scaleY = "scaleY" in prof ? prof.scaleY : 1.0;
  }

  const finalX = Math.round((x + offX) * scaleX);
  const finalY = Math.round((y + offY) * scaleY);
  const driftPx = Math.round(Math.sqrt(Math.pow(finalX - x, 2) + Math.pow(finalY - y, 2)));

  return { x: finalX, y: finalY, driftPx };
}
