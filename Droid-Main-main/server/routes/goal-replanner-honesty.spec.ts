import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendQwenChatRequest = vi.fn();
vi.mock("../ai-endpoint", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai-endpoint")>();
  return { ...actual, sendQwenChatRequest: (...args: unknown[]) => sendQwenChatRequest(...args) };
});

import { handleGoalReplan, measuredOffset, readModelConfidence } from "./goal-replanner";

const SCREENSHOT = "data:image/jpeg;base64,AAAA";
const FABRICATED = [0.91, 0.94, 0.95, 0.96, 0.98];

async function replan(body: Record<string, unknown>) {
  let payload: any;
  const res = {
    status() {
      return res;
    },
    json(value: unknown) {
      payload = value;
      return res;
    },
  };
  await handleGoalReplan({ body } as never, res as never);
  return payload;
}

const clickStep = (extra: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "Submit",
  action: "click",
  x: 500,
  y: 400,
  ...extra,
});

describe("goal re-planner honesty", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    sendQwenChatRequest.mockReset();
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("leaves coordinates unchanged and deterministic when no measured offset exists", async () => {
    const body = { currentSteps: [clickStep()], failedStepId: "s1", consecutiveDriftCount: 0 };
    const first = await replan(body);
    const second = await replan(body);
    const healed = first.replan.suggestedSteps[0];
    expect(healed).toMatchObject({ x: 500, y: 400, status: "modified" });
    expect(second.replan.suggestedSteps[0]).toMatchObject({ x: healed.x, y: healed.y });
    expect(healed.replanReason).toMatch(/unverified/i);
  });

  it("applies the measured verification offset, including a zero offset", async () => {
    const moved = await replan({
      currentSteps: [clickStep({ offsetX: 5, offsetY: -3 })],
      failedStepId: "s1",
      consecutiveDriftCount: 0,
    });
    expect(moved.replan.suggestedSteps[0]).toMatchObject({ x: 505, y: 397 });

    const zero = await replan({
      currentSteps: [clickStep({ offsetX: 0, offsetY: 0 })],
      failedStepId: "s1",
      consecutiveDriftCount: 0,
    });
    expect(zero.replan.suggestedSteps[0]).toMatchObject({ x: 500, y: 400 });
  });

  it("marks a re-plan without model analysis as unverified heuristic with no confidence", async () => {
    const { replan: result } = await replan({
      currentSteps: [clickStep(), { id: "s2", action: "type_text", x: 10, y: 10, text: "hi" }, { id: "s3", action: "scroll" }],
      failedStepId: "s1",
      consecutiveDriftCount: 3,
    });
    expect(sendQwenChatRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({ confidence: null, source: "heuristic", verified: false });
    expect(result.summary).not.toMatch(/successfully/i);
    for (const step of result.suggestedSteps) {
      expect(step.confidence ?? null).toBeNull();
    }
  });

  it("stays heuristic when the Qwen call fails", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, content: "", error: "down" });
    const { replan: result } = await replan({
      currentSteps: [clickStep()],
      failedStepId: "s1",
      screenshotUrl: SCREENSHOT,
    });
    expect(sendQwenChatRequest).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ confidence: null, source: "heuristic", verified: false });
  });

  it("uses the confidence the Qwen analysis reports, never a constant", async () => {
    sendQwenChatRequest.mockResolvedValue({
      success: true,
      content: JSON.stringify({ summary: "Button moved right", confidence: 0.7 }),
    });
    const { replan: result, aiInsights } = await replan({
      currentSteps: [clickStep(), { id: "s2", action: "scroll", x: 1, y: 1 }],
      failedStepId: "s1",
      screenshotUrl: SCREENSHOT,
      consecutiveDriftCount: 3,
    });
    expect(sendQwenChatRequest).toHaveBeenCalledTimes(1);
    expect(aiInsights).toBe("Button moved right");
    expect(result).toMatchObject({ confidence: 0.7, source: "model", verified: true });
    for (const step of result.suggestedSteps) {
      expect(step.confidence).toBe(0.7);
      expect(FABRICATED).not.toContain(step.confidence);
    }
  });
});

describe("re-planner helpers", () => {
  it("reads and clamps the model confidence, null when absent", () => {
    expect(readModelConfidence('<think>x</think>{"confidence": 0.42}')).toBe(0.42);
    expect(readModelConfidence('{"confidence": 3}')).toBe(1);
    expect(readModelConfidence('{"summary": "no score"}')).toBeNull();
    expect(readModelConfidence("not json")).toBeNull();
    expect(readModelConfidence(null)).toBeNull();
  });

  it("treats only finite offsets as measured", () => {
    expect(measuredOffset({})).toBeNull();
    expect(measuredOffset({ offsetX: 0 })).toEqual({ dx: 0, dy: 0 });
    expect(measuredOffset({ offsetX: "abc", offsetY: null })).toBeNull();
  });
});
