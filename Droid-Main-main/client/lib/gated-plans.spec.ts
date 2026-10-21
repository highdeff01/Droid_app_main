import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatePost } from "./action-gate";
import { runGatedSequence, type GatedAction } from "./gated-dispatch";
import {
  aiRepeatPlan,
  bridgeActionPlan,
  callbackPlan,
  habitRoutinePlan,
  mirrorAiMovePlan,
  mobileActionPlan,
  mouseRoutePlan,
  retrySegmentPlan,
  stepSequencePlan,
  synthesizedScriptPlan,
  typingPlan,
  type PlanStep,
} from "./gated-plans";

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

/** An element big enough to cover any pixel point used in these plans. */
function coveringReport() {
  return makeReport({
    elements: [makeElement({ boundingBox: { x: 0, y: 0, width: 5000, height: 5000 } })],
  });
}

/** An element far from every target used in these plans. */
function farReport() {
  return makeReport({
    elements: [makeElement({ boundingBox: { x: 9000, y: 9000, width: 10, height: 10 } })],
  });
}

function emptyReport() {
  return makeReport({ elements: [] });
}

/** Run a plan's gated actions with a fake capture/describe gate and a recording fetch stub. */
async function runPlan(actions: GatedAction[], report: unknown) {
  const fetchCalls: { url: string; body: any }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return { ok: true, json: async () => ({ success: true }) } as Response;
    }),
  );
  const post: GatePost = async (url) => {
    if (url === "/api/replay/capture") {
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
  const result = await runGatedSequence(actions, {
    targetDevice: "device-1",
    signal: new AbortController().signal,
    post,
    timeoutMs: 10000,
  });
  return { result, fetchCalls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeTaskPlans", () => {
  it("synthesizedScriptPlan dispatches a desktop click at the screen center", async () => {
    const { result, fetchCalls } = await runPlan(synthesizedScriptPlan(), coveringReport());

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].url).toBe("/api/execute-task");
    expect(fetchCalls[0].body.targetDevice).toBe("desktop");
    expect(fetchCalls[0].body.task.action).toBe("click");
    expect(fetchCalls[0].body.task.targetPosition).toEqual({ x: 960, y: 540 });
  });

  it("aiRepeatPlan renames the step's id and name for the AI mimic task", async () => {
    const step: PlanStep = { id: "step-1", name: "Click Submit", action: "click", x: 10, y: 10 };

    const { result, fetchCalls } = await runPlan(aiRepeatPlan(step), coveringReport());

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].body.task.id).toBe("ai_mimic_step-1");
    expect(fetchCalls[0].body.task.name).toBe("AI Repeat: Click Submit");
  });

  it("mouseRoutePlan dispatches the route and verifies even when the report has no elements", async () => {
    const routePoints = [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];

    const { result, fetchCalls } = await runPlan(
      mouseRoutePlan(routePoints, { speedMultiplier: 1, driftPx: 0, isDrag: false }),
      emptyReport(),
    );

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].url).toBe("/api/execute-task");
    expect(fetchCalls[0].body.task.action).toBe("stream_mouse_route");
    expect(fetchCalls[0].body.task.routePoints).toEqual(routePoints);
  });

  it("typingPlan clears and types when clearFirst is true", async () => {
    const { result, fetchCalls } = await runPlan(
      typingPlan("desktop", { x: 50, y: 50 }, "hello", true),
      coveringReport(),
    );

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].body.task.action).toBe("clear_and_type");
    expect(fetchCalls[0].body.task.textPayload).toBe("hello");
    expect(fetchCalls[0].body.targetDevice).toBe("desktop");
  });

  it("typingPlan just types when clearFirst is false", async () => {
    const { result, fetchCalls } = await runPlan(
      typingPlan("desktop", { x: 50, y: 50 }, "hello", false),
      coveringReport(),
    );

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].body.task.action).toBe("type");
  });

  it("typingPlan blocks and dispatches nothing when no element covers the coordinates", async () => {
    const { result, fetchCalls } = await runPlan(
      typingPlan("desktop", { x: 50, y: 50 }, "hello", false),
      farReport(),
    );

    expect(result.status).toBe("blocked");
    expect(fetchCalls).toHaveLength(0);
  });

  it("habitRoutinePlan dispatches the repeat count and target position", async () => {
    const { result, fetchCalls } = await runPlan(habitRoutinePlan(30, 40, 5), coveringReport());

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].body.repeatCount).toBe(5);
    expect(fetchCalls[0].body.task.targetPosition).toEqual({ x: 30, y: 40 });
  });

  it("stepSequencePlan dispatches one execute-task call per step with the shared device context", async () => {
    const steps: PlanStep[] = [
      { id: "s1", name: "Step 1", action: "click", x: 10, y: 10 },
      { id: "s2", name: "Step 2", action: "click", x: 20, y: 20 },
    ];

    const { result, fetchCalls } = await runPlan(
      stepSequencePlan(steps, { targetDevice: "android", deviceId: "abc" }),
      coveringReport(),
    );

    expect(result.status).toBe("completed");
    expect(fetchCalls).toHaveLength(2);
    for (const call of fetchCalls) {
      expect(call.url).toBe("/api/execute-task");
      expect(call.body.targetDevice).toBe("android");
      expect(call.body.deviceId).toBe("abc");
    }
  });
});

describe("bridgePlans", () => {
  it("retrySegmentPlan posts the steps and segmentStartIndex to the retry-segment endpoint", async () => {
    const steps: PlanStep[] = [{ id: "s1", name: "Step 1", action: "click", x: 10, y: 10 }];

    const { result, fetchCalls } = await runPlan(
      retrySegmentPlan(steps, { segmentStartIndex: 0 }),
      coveringReport(),
    );

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].url).toBe("/api/pyautogui/retry-segment");
    expect(fetchCalls[0].body.steps).toEqual(steps);
    expect(fetchCalls[0].body.segmentStartIndex).toBe(0);
  });

  it("mirrorAiMovePlan posts a desktop-mirror click to the interactive-action endpoint", async () => {
    const { result, fetchCalls } = await runPlan(mirrorAiMovePlan(70, 80), coveringReport());

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].url).toBe("/api/pyautogui/interactive-action");
    expect(fetchCalls[0].body).toEqual({ action: "click", x: 70, y: 80, deviceMode: "desktop_mirror" });
  });

  it("bridgeActionPlan posts to the bridge endpoint when no dispatcher is given", async () => {
    const payload = { action: "click", targetPosition: { x: 15, y: 25 } };

    const { result, fetchCalls } = await runPlan(
      bridgeActionPlan("click", payload),
      coveringReport(),
    );

    expect(result.status).toBe("completed");
    expect(fetchCalls[0].url).toBe("/api/pyautogui/bridge");
    expect(fetchCalls[0].body).toEqual(payload);
  });

  it("bridgeActionPlan calls the dispatcher instead of fetch when one is given", async () => {
    const payload = { action: "click", targetPosition: { x: 15, y: 25 } };
    const dispatcher = vi.fn();

    const { result, fetchCalls } = await runPlan(
      bridgeActionPlan("click", payload, dispatcher),
      coveringReport(),
    );

    expect(result.status).toBe("completed");
    expect(dispatcher).toHaveBeenCalledWith("click", payload);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("blockedPlans", () => {
  it("blocks synthesizedScriptPlan without dispatching when the target is uncovered", async () => {
    const { result, fetchCalls } = await runPlan(synthesizedScriptPlan(), farReport());

    expect(result.status).toBe("blocked");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks aiRepeatPlan without dispatching when the target is uncovered", async () => {
    const step: PlanStep = { id: "step-1", name: "Click Submit", action: "click", x: 10, y: 10 };

    const { result, fetchCalls } = await runPlan(aiRepeatPlan(step), farReport());

    expect(result.status).toBe("blocked");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks habitRoutinePlan without dispatching when the target is uncovered", async () => {
    const { result, fetchCalls } = await runPlan(habitRoutinePlan(30, 40, 5), farReport());

    expect(result.status).toBe("blocked");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks mirrorAiMovePlan without dispatching when the target is uncovered", async () => {
    const { result, fetchCalls } = await runPlan(mirrorAiMovePlan(70, 80), farReport());

    expect(result.status).toBe("blocked");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks bridgeActionPlan without dispatching when the target is uncovered", async () => {
    const payload = { action: "click", targetPosition: { x: 15, y: 25 } };

    const { result, fetchCalls } = await runPlan(bridgeActionPlan("click", payload), farReport());

    expect(result.status).toBe("blocked");
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("mobileActionPlan", () => {
  it("verifies a tap at the frame center against a covering element and dispatches the original action", async () => {
    const action = { type: "tap", x: 0.5, y: 0.5 };
    const dispatch = vi.fn();
    const report = makeReport({
      elements: [makeElement({ boundingBox: { x: 480, y: 980, width: 40, height: 40 } })],
    });

    const { result } = await runPlan(mobileActionPlan([action], dispatch), report);

    expect(result.status).toBe("completed");
    expect(dispatch).toHaveBeenCalledWith(action);
  });

  it("blocks a tap at the frame center when the only element is far from it", async () => {
    const action = { type: "tap", x: 0.5, y: 0.5 };
    const dispatch = vi.fn();
    const report = makeReport({
      elements: [makeElement({ boundingBox: { x: 0, y: 0, width: 40, height: 40 } })],
    });

    const { result } = await runPlan(mobileActionPlan([action], dispatch), report);

    expect(result.status).toBe("blocked");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("defaults a missing x/y to the frame center", async () => {
    const action = { type: "tap" };
    const dispatch = vi.fn();
    const report = makeReport({
      elements: [makeElement({ boundingBox: { x: 480, y: 980, width: 40, height: 40 } })],
    });

    const { result } = await runPlan(mobileActionPlan([action], dispatch), report);

    expect(result.status).toBe("completed");
    expect(dispatch).toHaveBeenCalledWith(action);
  });
});

describe("callbackPlan", () => {
  it("gates each step's point then calls the dispatcher with each step in order", async () => {
    const steps: PlanStep[] = [
      { name: "Step 1", action: "click", x: 10, y: 10 },
      { name: "Step 2", action: "click", x: 20, y: 20 },
    ];
    const calls: PlanStep[] = [];
    const dispatch = vi.fn((step: PlanStep) => {
      calls.push(step);
    });

    const { result } = await runPlan(callbackPlan(steps, dispatch), coveringReport());

    expect(result.status).toBe("completed");
    expect(calls).toEqual(steps);
  });
});
