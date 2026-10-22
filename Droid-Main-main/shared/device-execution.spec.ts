import { describe, expect, it } from "vitest";
import {
  PYAUTOGUI_MISSING_EXIT_CODE,
  PYTHON_SETUP_FIX,
  describeDeviceOutcome,
  outcomeFromExit,
  outcomeFromSpawnError,
  unavailableOutcome,
} from "./device-execution";

describe("device execution outcomes", () => {
  it("reports success only when the process exited 0", () => {
    expect(outcomeFromExit(0, "")).toEqual({ success: true, status: "executed", executed: true, simulated: false });
  });

  it("reports a missing python3 as unavailable and simulated, never success", () => {
    const outcome = outcomeFromSpawnError(Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" }));
    expect(outcome.success).toBe(false);
    expect(outcome.status).toBe("unavailable");
    expect(outcome.simulated).toBe(true);
    expect(outcome.executed).toBe(false);
    expect(outcome.error).toContain("ENOENT");
  });

  it("reports a missing pyautogui module as unavailable", () => {
    const outcome = outcomeFromExit(PYAUTOGUI_MISSING_EXIT_CODE, "No module named pyautogui");
    expect(outcome).toMatchObject({ success: false, status: "unavailable", executed: false, simulated: true });
  });

  it("reports other non-zero exits as failed with the stderr text", () => {
    const outcome = outcomeFromExit(1, "Xlib.error.DisplayConnectionError\n");
    expect(outcome).toMatchObject({ success: false, status: "failed", executed: false, simulated: false });
    expect(outcome.error).toBe("Xlib.error.DisplayConnectionError");
  });

  it("describes an unavailable reply as a warning that the action did not execute", () => {
    const view = describeDeviceOutcome(outcomeFromSpawnError(new Error("ENOENT")), "Click");
    expect(view.level).toBe("warning");
    expect(view.text).toMatch(/did not execute/);
  });

  it("describes a legacy simulated reply that claims success as not executed", () => {
    expect(describeDeviceOutcome({ success: true, simulated: true }, "Type").level).toBe("warning");
  });

  it("describes executed and failed replies", () => {
    expect(describeDeviceOutcome(outcomeFromExit(0, ""), "Drag").level).toBe("success");
    expect(describeDeviceOutcome(outcomeFromExit(2, "boom"), "Drag")).toEqual({ level: "error", text: "Drag failed: boom" });
  });

  it("carries the setup fix when python or pyautogui is missing, and shows it in the toast text", () => {
    const noPython = outcomeFromSpawnError(new Error("spawn py ENOENT"));
    const noModule = outcomeFromExit(PYAUTOGUI_MISSING_EXIT_CODE, "");
    expect(noPython.fix).toBe(PYTHON_SETUP_FIX);
    expect(noModule.fix).toBe(PYTHON_SETUP_FIX);
    const text = describeDeviceOutcome(noPython, "Click").text;
    expect(text).toContain("setup-python.bat");
    expect(text).toContain("pip install pyautogui mss pillow");
  });

  it("does not attach the python fix to failures unrelated to python", () => {
    expect(outcomeFromExit(1, "no display").fix).toBeUndefined();
    expect(unavailableOutcome("adb not found").fix).toBeUndefined();
    expect(describeDeviceOutcome(unavailableOutcome("adb not found"), "Tap").text).not.toContain("pip install");
  });
});
