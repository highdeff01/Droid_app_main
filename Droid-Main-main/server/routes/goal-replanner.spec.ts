import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendQwenChatRequest, generateContent } = vi.hoisted(() => ({
  sendQwenChatRequest: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock("../ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai-endpoint")>()),
  sendQwenChatRequest,
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));

import { handleGoalReplan } from "./goal-replanner";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const BODY = {
  currentSteps: [{ id: "s1", name: "Submit", action: "click", x: 100, y: 200 }],
  screenshotUrl: "data:image/png;base64,iVBORw0KGgo=",
};

async function replan() {
  const res = makeRes();
  await handleGoalReplan({ body: BODY } as any, res);
  return res;
}

describe("handleGoalReplan AI insights (Qwen only)", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    sendQwenChatRequest.mockReset();
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: "Gemini insight" });
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("uses Qwen and never calls Gemini even when GEMINI_API_KEY is set", async () => {
    sendQwenChatRequest.mockResolvedValue({
      success: true,
      content: JSON.stringify({ summary: "Qwen: modal shifted the submit button", confidence: 0.7 }),
    });

    const res = await replan();

    expect(res.body.success).toBe(true);
    expect(sendQwenChatRequest).toHaveBeenCalledTimes(1);
    expect(generateContent).not.toHaveBeenCalled();
    expect(res.body.aiInsights).toBe("Qwen: modal shifted the submit button");
  });

  it("reports no AI insight instead of falling back to Gemini when Qwen fails", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, content: "", error: "connect ECONNREFUSED" });

    const res = await replan();

    expect(res.body.success).toBe(true);
    expect(generateContent).not.toHaveBeenCalled();
    expect(res.body.aiInsights).toBeNull();
  });

  it("reports no AI insight when Qwen throws", async () => {
    sendQwenChatRequest.mockRejectedValue(new Error("timeout"));

    const res = await replan();

    expect(generateContent).not.toHaveBeenCalled();
    expect(res.body.aiInsights).toBeNull();
  });
});
