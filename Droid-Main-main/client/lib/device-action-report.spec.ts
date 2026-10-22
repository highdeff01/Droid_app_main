import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
const postDeviceAction = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/gated-dispatch", () => ({ postDeviceAction }));

import { reportDeviceAction } from "./device-action-report";

describe("reportDeviceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns that an unavailable (simulated) action did not execute", async () => {
    postDeviceAction.mockResolvedValue({ success: false, status: "unavailable", simulated: true, executed: false, error: "python3 missing" });
    const reply = await reportDeviceAction("/api/x", {}, "Tap");
    expect(reply.success).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("Tap did not execute"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("includes the actionable setup fix when python is missing", async () => {
    postDeviceAction.mockResolvedValue({
      success: false, status: "unavailable", simulated: true, executed: false,
      error: "Python is not available", fix: "Run setup-python.bat (Windows) or ./setup-python.sh (macOS/Linux), or: pip install pyautogui mss pillow",
    });
    await reportDeviceAction("/api/x", {}, "Click");
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("pip install pyautogui mss pillow"));
  });

  it("reports success only for an executed action", async () => {
    postDeviceAction.mockResolvedValue({ success: true, status: "executed", simulated: false, executed: true });
    await reportDeviceAction("/api/x", {}, "Swipe");
    expect(toast.success).toHaveBeenCalledWith("Swipe executed");
  });

  it("reports a failed action as an error", async () => {
    postDeviceAction.mockResolvedValue({ success: false, status: "failed", simulated: false, executed: false, error: "no display" });
    await reportDeviceAction("/api/x", {}, "Type");
    expect(toast.error).toHaveBeenCalledWith("Type failed: no display");
  });

  it("turns a network error into a not-executed reply", async () => {
    postDeviceAction.mockRejectedValue(new Error("offline"));
    const reply = await reportDeviceAction("/api/x", {}, "Key");
    expect(reply).toEqual({ success: false, executed: false, error: "offline" });
    expect(toast.error).toHaveBeenCalledWith("Key failed: offline");
  });
});
