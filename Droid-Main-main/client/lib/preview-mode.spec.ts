import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setBackendStatus } from "./backend-status";
import {
  CONTROL_HEALTH_URL,
  PREVIEW_BADGE,
  PREVIEW_EVENT_LIMIT,
  PREVIEW_REASON_BACKEND,
  PREVIEW_REASON_CONTROL,
  PREVIEW_REASON_MANUAL,
  applyPreviewDetection,
  detectPreviewNeed,
  fetchControlBackend,
  getPreviewEvents,
  getPreviewState,
  resetPreviewMode,
  setPreviewOverride,
  simulateDeviceAction,
  startPreviewWatcher,
} from "./preview-mode";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// eslint-disable-next-line import/order
import { toast } from "sonner";

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  resetPreviewMode();
  setBackendStatus({ state: "unknown", aiStudio: false });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("detectPreviewNeed", () => {
  it("returns the backend reason when the backend is unreachable", () => {
    expect(detectPreviewNeed({ state: "unreachable", aiStudio: false }, "native")).toBe(PREVIEW_REASON_BACKEND);
  });

  it("returns the control reason when reachable but the control backend is unavailable", () => {
    expect(detectPreviewNeed({ state: "reachable", aiStudio: false }, "unavailable")).toBe(PREVIEW_REASON_CONTROL);
  });

  it("returns null when reachable with a native control backend", () => {
    expect(detectPreviewNeed({ state: "reachable", aiStudio: false }, "native")).toBeNull();
  });

  it("returns null when reachable with a python control backend", () => {
    expect(detectPreviewNeed({ state: "reachable", aiStudio: false }, "python")).toBeNull();
  });

  it("returns null while the backend status is unknown", () => {
    expect(detectPreviewNeed({ state: "unknown", aiStudio: false }, null)).toBeNull();
  });

  it("returns null when reachable and the control backend is unknown (null)", () => {
    expect(detectPreviewNeed({ state: "reachable", aiStudio: false }, null)).toBeNull();
  });
});

describe("simulateDeviceAction", () => {
  it("returns a reply that is never a success and never executed", () => {
    const reply = simulateDeviceAction("click button");
    expect(reply).toEqual({
      success: false,
      executed: false,
      simulated: true,
      preview: true,
      status: "preview",
      message: reply.message,
    });
  });

  it("badges the message with PREVIEW_BADGE", () => {
    const reply = simulateDeviceAction("click button");
    expect(reply.message.startsWith(PREVIEW_BADGE)).toBe(true);
  });

  it("appends the same message to the event feed", () => {
    const reply = simulateDeviceAction("type hello");
    const events = getPreviewEvents();
    expect(events[events.length - 1].message).toBe(reply.message);
  });

  it("keeps the feed bounded to PREVIEW_EVENT_LIMIT entries", () => {
    for (let i = 0; i < PREVIEW_EVENT_LIMIT + 5; i += 1) {
      simulateDeviceAction(`action-${i}`);
    }
    expect(getPreviewEvents()).toHaveLength(PREVIEW_EVENT_LIMIT);
  });
});

describe("applyPreviewDetection", () => {
  it("activates Preview Mode with the detected reason and toasts a warning", () => {
    applyPreviewDetection(PREVIEW_REASON_BACKEND);
    expect(getPreviewState()).toMatchObject({ active: true, reason: PREVIEW_REASON_BACKEND });
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining(PREVIEW_BADGE), expect.anything());
  });

  it("deactivates on a null detection afterwards and toasts success mentioning Preview Mode off", () => {
    applyPreviewDetection(PREVIEW_REASON_BACKEND);
    applyPreviewDetection(null);
    expect(getPreviewState()).toMatchObject({ active: false, reason: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Preview Mode off"), expect.anything());
  });
});

describe("setPreviewOverride", () => {
  it("manual override true stays active after a null detection with reason PREVIEW_REASON_MANUAL", () => {
    setPreviewOverride(true);
    applyPreviewDetection(null);
    expect(getPreviewState()).toMatchObject({ active: true, reason: PREVIEW_REASON_MANUAL, override: true });
  });

  it("override false keeps Preview Mode inactive despite a detection", () => {
    setPreviewOverride(false);
    applyPreviewDetection(PREVIEW_REASON_BACKEND);
    expect(getPreviewState()).toMatchObject({ active: false, override: false });
  });

  it("override null returns control to auto-detection", () => {
    setPreviewOverride(true);
    setPreviewOverride(null);
    applyPreviewDetection(PREVIEW_REASON_CONTROL);
    expect(getPreviewState()).toMatchObject({ active: true, reason: PREVIEW_REASON_CONTROL, override: null });
  });
});

describe("startPreviewWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("enters Preview Mode when the backend is unreachable", async () => {
    const fetchImpl = vi.fn();
    const stop = startPreviewWatcher(fetchImpl, 1000);
    setBackendStatus({ state: "unreachable", aiStudio: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(getPreviewState()).toMatchObject({ active: true, reason: PREVIEW_REASON_BACKEND });
    stop();
  });

  it("enters Preview Mode for a missing control backend, re-polls, and exits once it becomes native", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ controlBackend: "unavailable" }))
      .mockResolvedValueOnce(jsonResponse({ controlBackend: "native" }));
    setBackendStatus({ state: "reachable", aiStudio: false });
    const stop = startPreviewWatcher(fetchImpl, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledWith(CONTROL_HEALTH_URL, expect.anything());
    expect(getPreviewState()).toMatchObject({ active: true, reason: PREVIEW_REASON_CONTROL });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getPreviewState()).toMatchObject({ active: false });
    stop();
  });

  it("exits Preview Mode automatically once the backend becomes reachable with python control, announcing it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ controlBackend: "python" }));
    setBackendStatus({ state: "unreachable", aiStudio: false });
    const stop = startPreviewWatcher(fetchImpl, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(getPreviewState().active).toBe(true);
    setBackendStatus({ state: "reachable", aiStudio: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(getPreviewState().active).toBe(false);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Preview Mode off"), expect.anything());
    stop();
  });

  it("does not enter Preview Mode for a non-JSON health reply while reachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));
    setBackendStatus({ state: "reachable", aiStudio: false });
    const stop = startPreviewWatcher(fetchImpl, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(getPreviewState().active).toBe(false);
    stop();
  });

  it("stops polling once the returned stop function is called", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ controlBackend: "unavailable" }));
    setBackendStatus({ state: "reachable", aiStudio: false });
    const stop = startPreviewWatcher(fetchImpl, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchControlBackend", () => {
  it("returns the controlBackend string from a JSON reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ controlBackend: "native" }));
    await expect(fetchControlBackend(fetchImpl)).resolves.toBe("native");
  });

  it("returns null for an HTML body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));
    await expect(fetchControlBackend(fetchImpl)).resolves.toBeNull();
  });

  it("returns null when the fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchControlBackend(fetchImpl)).resolves.toBeNull();
  });
});
