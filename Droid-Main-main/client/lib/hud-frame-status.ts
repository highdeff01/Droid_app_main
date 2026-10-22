/** Honest empty-state content for the HUD when no real captured frame is available. */

export interface CaptureStandby {
  /** Server's standby message from /api/capture-screen (503), when it answered. */
  message?: string | null;
  /** Network or non-JSON failure reaching the capture endpoint. */
  error?: string | null;
}

export interface BridgeStatus {
  online: boolean;
  error?: string | null;
}

export interface HudEmptyState {
  title: string;
  detail: string;
  bridgeLabel: string;
  steps: string[];
}

/** Reads the capture endpoint's reply into a standby reason; a live frame (200) yields null. */
export async function readCaptureStandby(response: Response): Promise<CaptureStandby | null> {
  if (response.ok) return null;
  const body = await response.json().catch(() => null);
  if (!body) return { error: `Capture endpoint returned non-JSON (HTTP ${response.status})` };
  return { message: typeof body.message === "string" ? body.message : `HTTP ${response.status}` };
}

/** Title, cause, bridge label and setup steps for the empty frame; never claims a live screen. */
export function describeEmptyState(
  standby: CaptureStandby | null,
  bridge: BridgeStatus | null,
  inIframe: boolean,
): HudEmptyState {
  const steps = [
    "Click Start Real Desktop Stream and pick a screen or window to share.",
    "Or run the desktop bridge (python3 + pyautogui) so /api/capture-screen returns desktop frames.",
    "Or pair a phone (Phone Mirror) to stream its real screen.",
  ];
  if (inIframe) steps.unshift("This preview is embedded: open the app in its own tab — browsers block screen share inside iframes.");
  return {
    title: "No live screen",
    detail: standby?.error ?? standby?.message ?? "No real frame has been captured yet.",
    bridgeLabel: bridge
      ? bridge.online
        ? "Desktop bridge online"
        : `Desktop bridge offline${bridge.error ? `: ${bridge.error}` : ""}`
      : "Desktop bridge status unknown",
    steps,
  };
}
