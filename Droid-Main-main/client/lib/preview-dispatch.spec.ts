import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BACKEND_UNREACHABLE_MESSAGE, setBackendStatus } from "./backend-status";
import { gateFailure, postDeviceAction, runGatedSequence, PREVIEW_SEQUENCE_REASON } from "./gated-dispatch";
import type { GatePost } from "./action-gate";
import { dispatchInteractiveAction } from "./hud-actions";
import { reportDeviceAction } from "./device-action-report";
import { simulateReplayRun, type PreviewStepLike } from "./preview-replay";
import { PREVIEW_BADGE, resetPreviewMode, setPreviewOverride } from "./preview-mode";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// eslint-disable-next-line import/order
import { toast } from "sonner";

beforeEach(() => {
  resetPreviewMode();
  setBackendStatus({ state: "unknown", aiStudio: false });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("postDeviceAction", () => {
  it("resolves a preview reply and never calls fetch when the override is on", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setPreviewOverride(true);

    const reply = await postDeviceAction("/api/pyautogui/execute", { action: "click" });

    expect(reply).toMatchObject({ success: false, executed: false, simulated: true, preview: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls fetch when preview is off and the backend is reachable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setBackendStatus({ state: "reachable", aiStudio: false });

    await postDeviceAction("/api/pyautogui/execute", { action: "click" });

    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("runGatedSequence", () => {
  it("simulates each action and completes as 'preview', never 'completed', when preview is on", async () => {
    setPreviewOverride(true);
    const post = vi.fn();
    const dispatch1 = vi.fn();
    const dispatch2 = vi.fn();

    const result = await runGatedSequence(
      [
        { target: { x: 1, y: 1, label: "A", needsTarget: true }, dispatch: dispatch1 },
        { target: { x: 2, y: 2, label: "B", needsTarget: true }, dispatch: dispatch2 },
      ],
      { targetDevice: "desktop", signal: new AbortController().signal, post: post as any },
    );

    expect(result.status).toBe("preview");
    expect(result.status).not.toBe("completed");
    if (result.status !== "completed") expect(result.reason).toBe(PREVIEW_SEQUENCE_REASON);
    expect(result.results).toHaveLength(2);
    expect(dispatch1).not.toHaveBeenCalled();
    expect(dispatch2).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("returns a non-null gateFailure reason for a preview result", async () => {
    setPreviewOverride(true);
    const result = await runGatedSequence(
      [{ target: { x: 1, y: 1, needsTarget: true }, dispatch: vi.fn() }],
      { targetDevice: "desktop", signal: new AbortController().signal, post: vi.fn() as any },
    );

    expect(gateFailure(result)).not.toBeNull();
  });

  it("cancels immediately in preview mode when the signal is already aborted", async () => {
    setPreviewOverride(true);
    const controller = new AbortController();
    controller.abort();

    const result = await runGatedSequence(
      [{ target: { x: 1, y: 1, needsTarget: true }, dispatch: vi.fn() }],
      { targetDevice: "desktop", signal: controller.signal, post: vi.fn() as any },
    );

    expect(result.status).toBe("cancelled");
  });

  it("blocks with BACKEND_UNREACHABLE_MESSAGE when preview is off and the backend is unreachable", async () => {
    setPreviewOverride(false);
    setBackendStatus({ state: "unreachable", aiStudio: false });

    const result = await runGatedSequence(
      [{ target: { x: 1, y: 1, needsTarget: true }, dispatch: vi.fn() }],
      { targetDevice: "desktop", signal: new AbortController().signal, post: vi.fn() as any },
    );

    expect(result).toEqual({ status: "blocked", reason: BACKEND_UNREACHABLE_MESSAGE, results: [] });
  });
});

describe("dispatchInteractiveAction", () => {
  it("returns a simulated preview result without calling the bridge post when preview is on", async () => {
    setPreviewOverride(true);
    const post = vi.fn();

    const result = await dispatchInteractiveAction({ action: "click", x: 10, y: 20 }, post as any);

    expect(result.simulated).toBe(true);
    expect(result.preview).toBe(true);
    expect(result.message.startsWith(PREVIEW_BADGE)).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("reportDeviceAction", () => {
  it("toasts info with the PREVIEW badge and never success, returning success: false", async () => {
    setPreviewOverride(true);

    const reply = await reportDeviceAction("/api/pyautogui/execute", { action: "click" }, "Click button");

    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining(PREVIEW_BADGE));
    expect(toast.success).not.toHaveBeenCalled();
    expect(reply.success).toBe(false);
  });
});

describe("simulateReplayRun", () => {
  const steps: PreviewStepLike[] = [
    { id: "s1", action: "click", x: 10, y: 20 },
    { id: "s2", action: "type", x: 30, y: 40 },
  ];
  const wait = async () => {};

  it("calls onUpdate as the run advances", async () => {
    const onUpdate = vi.fn();

    await simulateReplayRun(steps, { onUpdate, stopped: () => false, wait });

    expect(onUpdate).toHaveBeenCalled();
  });

  it("ends as 'cancelled' (never 'completed') with error PREVIEW_SEQUENCE_REASON", async () => {
    const run = await simulateReplayRun(steps, { onUpdate: vi.fn(), stopped: () => false, wait });

    expect(run.status).toBe("cancelled");
    expect(run.status).not.toBe("completed");
    expect(run.error).toBe(PREVIEW_SEQUENCE_REASON);
  });

  it("badges every event detail with PREVIEW_BADGE", async () => {
    const run = await simulateReplayRun(steps, { onUpdate: vi.fn(), stopped: () => false, wait });

    expect(run.events.length).toBeGreaterThan(0);
    expect(run.events.every((e) => e.detail.startsWith(PREVIEW_BADGE))).toBe(true);
  });

  it("sets completed equal to the number of steps", async () => {
    const run = await simulateReplayRun(steps, { onUpdate: vi.fn(), stopped: () => false, wait });

    expect(run.completed).toBe(steps.length);
  });

  it("cancels with no events when stopped() is already true", async () => {
    const run = await simulateReplayRun(steps, { onUpdate: vi.fn(), stopped: () => true, wait });

    expect(run.status).toBe("cancelled");
    expect(run.events).toEqual([]);
  });
});
