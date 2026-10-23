import { DESKTOP_CONTROL_INSTALL_HINT, PYTHON_SETUP_FIX, type DesktopControlBackend } from "@shared/device-execution";

/** Fields of GET /api/pyautogui/health that the status chip reads. */
export interface BridgeHealthReply {
  pythonAvailable?: boolean;
  pythonInterpreter?: string;
  pyautoguiAvailable?: boolean;
  fix?: string;
  controlBackend?: DesktopControlBackend;
  controlInstallHint?: string | null;
}

export interface BridgeStatusView {
  pythonOk: boolean;
  pyautoguiOk: boolean;
  /** "Control: native" / "Control: python fallback" / "Control: unavailable (install X)". */
  control: string;
  label: string;
  /** Exact fix text when something is missing, else null. */
  fix: string | null;
  interpreter: string;
}

/** Chip text for the active desktop control backend. */
export function describeControlBackend(reply: BridgeHealthReply | null): string {
  const backend = reply?.controlBackend ?? (reply ? "python" : "unavailable");
  if (backend === "native") return "Control: native";
  if (backend === "python") return "Control: python fallback";
  return `Control: unavailable (install ${reply?.controlInstallHint ?? DESKTOP_CONTROL_INSTALL_HINT})`;
}

/** Status chip view of a bridge health reply: the control backend, then Python / pyautogui state. */
export function describeBridgeStatus(reply: BridgeHealthReply | null): BridgeStatusView {
  const pythonOk = reply?.pythonAvailable === true;
  const pyautoguiOk = pythonOk && reply?.pyautoguiAvailable === true;
  const native = reply?.controlBackend === "native";
  const label = `Python: ${pythonOk ? "OK" : "missing"} · pyautogui: ${pyautoguiOk ? "OK" : "missing"}`;
  return {
    pythonOk,
    pyautoguiOk,
    control: describeControlBackend(reply),
    label,
    fix: native || (pythonOk && pyautoguiOk) ? null : reply?.fix ?? PYTHON_SETUP_FIX,
    interpreter: reply?.pythonInterpreter ?? "not found",
  };
}

/** Fetches the bridge health; an unreachable endpoint reads as both missing. */
export async function fetchBridgeStatus(signal?: AbortSignal): Promise<BridgeStatusView> {
  try {
    const res = await fetch("/api/pyautogui/health", { headers: { "Cache-Control": "no-cache" }, signal });
    return describeBridgeStatus(res.ok ? ((await res.json()) as BridgeHealthReply) : null);
  } catch {
    return describeBridgeStatus(null);
  }
}
