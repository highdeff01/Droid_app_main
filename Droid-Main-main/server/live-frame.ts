import type { CaptureResult } from "./capture-frame";

export type LiveFrameReader = () => Promise<CaptureResult>;

let reader: LiveFrameReader | null = null;

/** createServer registers the shared capture fallback order (HUD share -> desktop -> mobile) here. */
export function setLiveFrameReader(next: LiveFrameReader) {
  reader = next;
}

/** The current live frame through the registered capture sources; standby when none is registered. */
export async function readLiveFrame(): Promise<CaptureResult> {
  if (!reader)
    return {
      success: false,
      status: "standby",
      imageData: null,
      timestamp: Date.now(),
      message: "No screen capture source is registered",
      skipped: [],
    };
  return reader();
}
