import path from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import { isFrameStale } from "../capture-frame";
import { PYTHON_SETUP_FIX, resolvePython, spawnPython } from "../python-resolver";
import { activeNativeControl, nativeDesktopAdapters } from "../desktop-control";
import type { NativeDesktopControl } from "../native-desktop-bridge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface FrameMetadata {
  width: number;
  height: number;
  format?: string;
  source?: string;
  deviceName?: string;
}

export interface DesktopFrameHistoryItem {
  id: string;
  imageData: string;
  timestamp: number;
  note?: string;
  metadata?: FrameMetadata;
}

const recentDesktopFrames: DesktopFrameHistoryItem[] = [];
const MAX_DESKTOP_FRAMES = 30;

let latestSyncedRealFrame: {
  imageData: string;
  metadata?: FrameMetadata;
  timestamp: number;
} | null = null;

export const setLatestSyncedRealFrame = (
  imageData: string,
  metadata?: FrameMetadata,
  note?: string,
) => {
  const timestamp = Date.now();
  latestSyncedRealFrame = { imageData, metadata, timestamp };
  const item: DesktopFrameHistoryItem = {
    id: `desktop_snap_${timestamp}_${Math.random().toString(36).slice(2, 6)}`,
    imageData,
    timestamp,
    note,
    metadata,
  };
  recentDesktopFrames.unshift(item);
  if (recentDesktopFrames.length > MAX_DESKTOP_FRAMES) {
    recentDesktopFrames.pop();
  }
};

export const getLatestSyncedRealFrame = () => latestSyncedRealFrame;
export const getRecentDesktopFrames = () => recentDesktopFrames;

/** capture.py writes `{success:false,error}` to stderr on failure; extract its reason. */
function captureFailureReason(stderr: string): string {
  const lastLine = stderr.trim().split("\n").pop() ?? "";
  try {
    const parsed = JSON.parse(lastLine);
    if (typeof parsed?.error === "string") return `Desktop capture failed: ${parsed.error}.`;
  } catch {}
  return `Desktop capture failed: ${stderr.trim() || "Python screen capture service exited with error"}.`;
}

/** Full-screen capture through the native control, behind the existing DesktopCaptureAdapter. */
async function captureNativeFrame(native: NativeDesktopControl) {
  try {
    const { imageData } = await nativeDesktopAdapters(native).capture.capture(true);
    return { success: true, imageData, method: "native_desktop_capture", timestamp: Date.now() };
  } catch (err) {
    return {
      success: false,
      error: `Desktop capture failed: ${err instanceof Error ? err.message : String(err)}.`,
    };
  }
}

export const captureDesktopFrame = async (): Promise<{
  success: boolean;
  imageData?: string;
  method?: string;
  metadata?: FrameMetadata;
  timestamp?: number;
  error?: string;
}> => {
  if (
    latestSyncedRealFrame &&
    !isFrameStale(latestSyncedRealFrame.timestamp, Date.now())
  ) {
    return {
      success: true,
      imageData: latestSyncedRealFrame.imageData,
      method: "real_desktop_stream",
      metadata: latestSyncedRealFrame.metadata,
      timestamp: latestSyncedRealFrame.timestamp,
    };
  }

  const native = await activeNativeControl();
  if (native) return captureNativeFrame(native);

  const pythonScript = path.join(__dirname, "../../python-service/capture.py");
  const resolution = resolvePython();
  if (!resolution.found) {
    return {
      success: false,
      error: `Desktop capture unavailable: no Python interpreter found (tried ${resolution.tried.join(", ")}). ${PYTHON_SETUP_FIX}`,
    };
  }
  const pythonCmd = resolution.command;

  return new Promise((resolve) => {
    const python = spawnPython([pythonScript], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";
    let settled = false;

    const finish = (result: {
      success: boolean;
      imageData?: string;
      method?: string;
      error?: string;
    }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    python.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    python.on("error", (error) =>
      finish({
        success: false,
        error: `Failed to spawn python (${pythonCmd}): ${error.message}`,
      }),
    );

    python.on("close", (code) => {
      if (settled) return;
      if (code === 0 && stdoutData) {
        try {
          finish(JSON.parse(stdoutData.trim()));
          return;
        } catch {
          finish({
            success: false,
            error: "Failed to parse screen capture response",
          });
          return;
        }
      }
      finish({
        success: false,
        error: `${captureFailureReason(stderrData)} ${PYTHON_SETUP_FIX}`,
      });
    });

    setTimeout(() => {
      if (!settled) {
        if (!python.killed) python.kill();
        finish({ success: false, error: "Screen capture timeout (5s)" });
      }
    }, 5000);
  });
};

export const handleGetScreenCapture = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await captureDesktopFrame();
    if (result.success && result.imageData) {
      res.json(result);
    } else {
      res.status(503).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown capture error",
    });
  }
};

export const handleCaptureScreen = handleGetScreenCapture;

export const handleSyncScreenFrame = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { imageData, metadata, note } = req.body;
    if (!imageData || typeof imageData !== "string") {
      res.status(400).json({ success: false, error: "Invalid frame data" });
      return;
    }
    setLatestSyncedRealFrame(imageData, metadata, note);
    res.json({ success: true, message: "Frame synchronized successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to sync frame",
    });
  }
};

export const handleSyncRealFrame = handleSyncScreenFrame;

export const handleGetScreenCaptureHistory = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json({
    success: true,
    count: recentDesktopFrames.length,
    frames: recentDesktopFrames,
  });
};
