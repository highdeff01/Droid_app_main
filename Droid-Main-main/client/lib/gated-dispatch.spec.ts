import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_REINSPECTIONS, gateTargetForAction, type GatePost } from "./action-gate";
import { gateFailure, postDeviceAction, runGatedSequence } from "./gated-dispatch";
import { BACKEND_UNREACHABLE_MESSAGE, setBackendStatus } from "./backend-status";

function makeElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-1",
    name: "Button",
    type: "button",
    boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    center: { x: 125, y: 125 },
    confidence: 0.85,
    interactive: true,
    ...overrides,
  } as any;
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: 0,
    screenDescription: "desc",
    activeWindow: "win",
    visualStateChange: "none",
    elements: [],
    feedbackPosition: { x: 0, y: 0 },
    primarySuggestion: "",
    confidence: 0.8,
    ...overrides,
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setBackendStatus({ state: "unknown", aiStudio: false });
});

describe("backend unreachable fail-fast", () => {
  it("blocks a gated run with the banner reason before any request", async () => {
    setBackendStatus({ state: "unreachable", aiStudio: false });
    const post = vi.fn();
    const dispatch = vi.fn();
    const result = await runGatedSequence([{ target: { x: 1, y: 1, label: "Button", needsTarget: true }, dispatch }], {
      targetDevice: "desktop",
      signal: new AbortController().signal,
      post: post as any,
    });
    expect(result).toEqual({ status: "blocked", reason: BACKEND_UNREACHABLE_MESSAGE, results: [] });
    expect(post).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects a device POST without fetching while unreachable", async () => {
    setBackendStatus({ state: "unreachable", aiStudio: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postDeviceAction("/api/pyautogui/bridge", {})).rejects.toThrow(BACKEND_UNREACHABLE_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an HTML device reply as a failure, never success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<!doctype html><html></html>", { status: 200 })));
    expect(await postDeviceAction("/api/pyautogui/bridge", {})).toEqual({
      success: false,
      executed: false,
      error: "Non-JSON response (HTTP 200)",
    });
  });
});

describe("runGatedSequence", () => {
  it("runs capture, then describe-screen, then dispatch, completing with the dispatch result", async () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });
    const order: string[] = [];
    let captureBody: unknown;
    const post: GatePost = async (url, body) => {
      order.push(url);
      if (url === "/api/replay/capture") {
        captureBody = body;
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      if (url === "/api/ai/describe-screen") {
        return { success: true, report };
      }
      throw new Error(`unexpected url ${url}`);
    };
    const dispatch = vi.fn(() => {
      order.push("dispatch");
      return "dispatch-result";
    });

    const result = await runGatedSequence(
      [{ target: { x: 125, y: 125, label: "Button", needsTarget: true }, dispatch, delayMs: 0 }],
      {
        targetDevice: "device-1",
        deviceId: "device-id-1",
        signal: new AbortController().signal,
        post,
        timeoutMs: 10000,
      },
    );

    expect(order).toEqual([
      "/api/replay/capture",
      "/api/ai/describe-screen",
      "dispatch",
    ]);
    expect(captureBody).toEqual({ targetDevice: "device-1", deviceId: "device-id-1" });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.results).toEqual(["dispatch-result"]);
    }
  });

  it("blocks with a 'not found' reason and never dispatches when no element covers the point", async () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      return { success: true, report };
    };
    const dispatch = vi.fn();

    const result = await runGatedSequence(
      [{ target: { x: 500, y: 500, label: "Button", needsTarget: true }, dispatch, delayMs: 0 }],
      { targetDevice: "device-1", signal: new AbortController().signal, post, timeoutMs: 10000 },
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.reason).toMatch(/not found/);
  });

  it("verifies a point 12px past the box edge (padding slack)", async () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      return { success: true, report };
    };
    const dispatch = vi.fn();

    const result = await runGatedSequence(
      [{ target: { x: 162, y: 125, label: "Button", needsTarget: true }, dispatch, delayMs: 0 }],
      { targetDevice: "device-1", signal: new AbortController().signal, post, timeoutMs: 10000 },
    );

    expect(result.status).toBe("completed");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("blocks a point 13px past the box edge, beyond the padding slack", async () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      return { success: true, report };
    };
    const dispatch = vi.fn();

    const result = await runGatedSequence(
      [{ target: { x: 163, y: 125, label: "Button", needsTarget: true }, dispatch, delayMs: 0 }],
      { targetDevice: "device-1", signal: new AbortController().signal, post, timeoutMs: 10000 },
    );

    expect(result.status).toBe("blocked");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("stops at the first blocked action, leaving later actions ungated and undispatched", async () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });
    let captureCalls = 0;
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        captureCalls += 1;
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      return { success: true, report };
    };
    const dispatch1 = vi.fn();
    const dispatch2 = vi.fn();
    const dispatch3 = vi.fn();

    const result = await runGatedSequence(
      [
        { target: { x: 125, y: 125, needsTarget: true }, dispatch: dispatch1, delayMs: 0 },
        { target: { x: 500, y: 500, needsTarget: true }, dispatch: dispatch2, delayMs: 0 },
        { target: { x: 125, y: 125, needsTarget: true }, dispatch: dispatch3, delayMs: 0 },
      ],
      { targetDevice: "device-1", signal: new AbortController().signal, post, timeoutMs: 10000 },
    );

    expect(result.status).toBe("blocked");
    // Action 1 verifies on one capture; action 2 is re-inspected MAX_REINSPECTIONS times before blocking.
    expect(captureCalls).toBe(1 + 1 + MAX_REINSPECTIONS);
    expect(dispatch1).toHaveBeenCalledTimes(1);
    expect(dispatch2).not.toHaveBeenCalled();
    expect(dispatch3).not.toHaveBeenCalled();
  });

  it("blocks and never calls describe-screen when capture rejects", async () => {
    let describeCalled = false;
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") throw new Error("capture failed");
      describeCalled = true;
      return { success: true, report: makeReport() };
    };
    const dispatch = vi.fn();

    const result = await runGatedSequence(
      [{ target: { x: 125, y: 125, needsTarget: true }, dispatch, delayMs: 0 }],
      { targetDevice: "device-1", signal: new AbortController().signal, post, timeoutMs: 10000 },
    );

    expect(result.status).toBe("blocked");
    expect(describeCalled).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("cancels when aborted after describe-screen starts, dispatching nothing and gating no later steps", async () => {
    const order: string[] = [];
    let resolveDescribe: (value: unknown) => void = () => {};
    let describeCalledResolve: () => void = () => {};
    const describeCalledPromise = new Promise<void>((resolve) => {
      describeCalledResolve = resolve;
    });
    const post: GatePost = async (url) => {
      order.push(url);
      if (url === "/api/replay/capture") {
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      describeCalledResolve();
      return new Promise((resolve) => {
        resolveDescribe = resolve;
      });
    };
    const dispatch1 = vi.fn(() => {
      order.push("dispatch-1");
    });
    const dispatch2 = vi.fn(() => {
      order.push("dispatch-2");
    });
    const controller = new AbortController();

    const resultPromise = runGatedSequence(
      [
        { target: { x: 125, y: 125, needsTarget: true }, dispatch: dispatch1, delayMs: 0 },
        { target: { x: 125, y: 125, needsTarget: true }, dispatch: dispatch2, delayMs: 0 },
      ],
      { targetDevice: "device-1", signal: controller.signal, post, timeoutMs: 10000 },
    );
    await describeCalledPromise;
    controller.abort();
    resolveDescribe({
      success: true,
      report: makeReport({
        elements: [makeElement({ boundingBox: { x: 100, y: 100, width: 50, height: 50 } })],
      }),
    });

    const result = await resultPromise;

    expect(result.status).toBe("cancelled");
    expect(dispatch1).not.toHaveBeenCalled();
    expect(dispatch2).not.toHaveBeenCalled();
    expect(order.filter((url) => url === "/api/replay/capture")).toHaveLength(1);
  });

  it("dispatches a non-positional action even when the report has no elements", async () => {
    const order: string[] = [];
    const report = makeReport({ elements: [] });
    const post: GatePost = async (url) => {
      order.push(url);
      if (url === "/api/replay/capture") {
        return {
          success: true,
          frame: { image: "data:img", width: 1000, height: 2000 },
        };
      }
      return { success: true, report };
    };
    const dispatch = vi.fn(() => {
      order.push("dispatch");
      return "ok";
    });

    const result = await runGatedSequence(
      [{ target: gateTargetForAction("press_key", 0, 0), dispatch, delayMs: 0 }],
      { targetDevice: "device-1", signal: new AbortController().signal, post, timeoutMs: 10000 },
    );

    expect(result.status).toBe("completed");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["/api/replay/capture", "/api/ai/describe-screen", "dispatch"]);
  });
});

describe("gateFailure", () => {
  it("returns a non-empty busy reason when no result is given", () => {
    const reason = gateFailure(undefined);

    expect(typeof reason).toBe("string");
    expect((reason ?? "").length).toBeGreaterThan(0);
  });

  it("returns null when the run completed", () => {
    expect(gateFailure({ status: "completed", results: [] })).toBeNull();
  });

  it("returns the reason when the run was blocked", () => {
    expect(
      gateFailure({ status: "blocked", reason: "nope", results: [] }),
    ).toBe("nope");
  });
});
