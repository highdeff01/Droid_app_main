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
}

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

/** Maps a python child process exit to an outcome. */
export function outcomeFromExit(code: number | null, stderr: string): DeviceExecutionOutcome {
  if (code === 0) return executedOutcome();
  if (code === PYAUTOGUI_MISSING_EXIT_CODE) {
    return unavailableOutcome("pyautogui is not installed or no display is available; the action did not execute.");
  }
  return failedOutcome(stderr.trim() || `Automation process exited with code ${code ?? "unknown"}.`);
}

/** Outcome when the python interpreter itself could not be started (e.g. ENOENT). */
export function outcomeFromSpawnError(err: Error): DeviceExecutionOutcome {
  return unavailableOutcome(`python3 is not available (${err.message}); the action did not execute.`);
}

/** One-line, user-facing description of a device action reply. */
export function describeDeviceOutcome(
  reply: Partial<DeviceExecutionOutcome> & { message?: string },
  actionLabel: string,
): { level: "success" | "warning" | "error"; text: string } {
  if (reply.status === "unavailable" || (reply.simulated && !reply.executed)) {
    return { level: "warning", text: `${actionLabel} did not execute: device automation unavailable. ${reply.error ?? ""}`.trim() };
  }
  if (reply.success && reply.executed !== false) {
    return { level: "success", text: `${actionLabel} executed` };
  }
  return { level: "error", text: `${actionLabel} failed: ${reply.error ?? reply.message ?? "unknown error"}` };
}
