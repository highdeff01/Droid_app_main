/**
 * Honest outcome of a device (pyautogui) action. A reply only claims success
 * when the action really ran; when python3/pyautogui is missing the action is
 * reported as `unavailable` and `simulated`, never as a success.
 */
export type DeviceExecutionStatus = "executed" | "failed" | "unavailable";

export interface DeviceExecutionOutcome {
  success: boolean;
  status: DeviceExecutionStatus;
  executed: boolean;
  simulated: boolean;
  error?: string;
  /** Actionable setup instruction when Python or pyautogui is missing. */
  fix?: string;
}

/** User-facing fix shown wherever Python or its desktop packages are missing. */
export const PYTHON_SETUP_FIX =
  "Run setup-python.bat (Windows) or ./setup-python.sh (macOS/Linux), or: pip install pyautogui mss pillow";

/** Exit code the generated pyautogui scripts use when `import pyautogui` fails. */
export const PYAUTOGUI_MISSING_EXIT_CODE = 3;

export function executedOutcome(): DeviceExecutionOutcome {
  return { success: true, status: "executed", executed: true, simulated: false };
}

export function failedOutcome(error: string): DeviceExecutionOutcome {
  return { success: false, status: "failed", executed: false, simulated: false, error };
}

export function unavailableOutcome(error: string): DeviceExecutionOutcome {
  return { success: false, status: "unavailable", executed: false, simulated: true, error };
}

/** Unavailable because the Python interpreter or its packages are missing; carries the fix. */
export function pythonMissingOutcome(error: string): DeviceExecutionOutcome {
  return { ...unavailableOutcome(error), fix: PYTHON_SETUP_FIX };
}

/** Maps a python child process exit to an outcome. */
export function outcomeFromExit(code: number | null, stderr: string): DeviceExecutionOutcome {
  if (code === 0) return executedOutcome();
  if (code === PYAUTOGUI_MISSING_EXIT_CODE) {
    return pythonMissingOutcome("pyautogui is not installed or no display is available; the action did not execute.");
  }
  return failedOutcome(stderr.trim() || `Automation process exited with code ${code ?? "unknown"}.`);
}

/** Outcome when the python interpreter itself could not be started (e.g. ENOENT). */
export function outcomeFromSpawnError(err: Error): DeviceExecutionOutcome {
  return pythonMissingOutcome(`Python is not available (${err.message}); the action did not execute.`);
}

/** One-line, user-facing description of a device action reply. */
export function describeDeviceOutcome(
  reply: Partial<DeviceExecutionOutcome> & { message?: string },
  actionLabel: string,
): { level: "success" | "warning" | "error"; text: string } {
  if (reply.status === "unavailable" || (reply.simulated && !reply.executed)) {
    const fix = reply.fix ? ` Fix: ${reply.fix}` : "";
    return { level: "warning", text: `${actionLabel} did not execute: device automation unavailable. ${reply.error ?? ""}`.trim() + fix };
  }
  if (reply.success && reply.executed !== false) {
    return { level: "success", text: `${actionLabel} executed` };
  }
  return { level: "error", text: `${actionLabel} failed: ${reply.error ?? reply.message ?? "unknown error"}` };
}
