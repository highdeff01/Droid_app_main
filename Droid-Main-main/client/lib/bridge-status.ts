import { PYTHON_SETUP_FIX } from "@shared/device-execution";

/** Fields of GET /api/pyautogui/health that the status chip reads. */
export interface BridgeHealthReply {
  pythonAvailable?: boolean;
  pythonInterpreter?: string;
  pyautoguiAvailable?: boolean;
  fix?: string;
}

export interface BridgeStatusView {
  pythonOk: boolean;
  pyautoguiOk: boolean;
  label: string;
  /** Exact fix text when something is missing, else null. */
  fix: string | null;
  interpreter: string;
}

/** Status chip view of a bridge health reply: "Python: OK/missing · pyautogui: OK/missing". */
export function describeBridgeStatus(reply: BridgeHealthReply | null): BridgeStatusView {
  const pythonOk = reply?.pythonAvailable === true;
  const pyautoguiOk = pythonOk && reply?.pyautoguiAvailable === true;
  const label = `Python: ${pythonOk ? "OK" : "missing"} · pyautogui: ${pyautoguiOk ? "OK" : "missing"}`;
  return {
    pythonOk,
    pyautoguiOk,
    label,
    fix: pythonOk && pyautoguiOk ? null : reply?.fix ?? PYTHON_SETUP_FIX,
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
