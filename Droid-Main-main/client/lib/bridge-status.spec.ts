import { afterEach, describe, expect, it, vi } from "vitest";
import { describeBridgeStatus, fetchBridgeStatus } from "./bridge-status";

describe("bridge status chip", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows OK for both with no fix when python and pyautogui are present", () => {
    const view = describeBridgeStatus({ pythonAvailable: true, pythonInterpreter: "py -3 (3.12.1)", pyautoguiAvailable: true });
    expect(view).toMatchObject({ label: "Python: OK · pyautogui: OK", fix: null, interpreter: "py -3 (3.12.1)" });
  });

  it("shows pyautogui missing with the exact fix when only the module is absent", () => {
    const view = describeBridgeStatus({ pythonAvailable: true, pyautoguiAvailable: false });
    expect(view.label).toBe("Python: OK · pyautogui: missing");
    expect(view.fix).toContain("setup-python.bat");
    expect(view.fix).toContain("pip install pyautogui mss pillow");
  });

  it("shows both missing when no interpreter resolved", () => {
    const view = describeBridgeStatus({ pythonAvailable: false, pythonInterpreter: "not found", pyautoguiAvailable: false });
    expect(view.label).toBe("Python: missing · pyautogui: missing");
    expect(view.interpreter).toBe("not found");
    expect(view.fix).toContain("pip install pyautogui mss pillow");
  });

  it("treats an unreachable health endpoint as missing, never OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const view = await fetchBridgeStatus();
    expect(view.label).toBe("Python: missing · pyautogui: missing");
    expect(view.fix).not.toBeNull();
  });

  it("reads the health endpoint reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pythonAvailable: true, pyautoguiAvailable: true }) }));
    expect((await fetchBridgeStatus()).label).toBe("Python: OK · pyautogui: OK");
  });
});
