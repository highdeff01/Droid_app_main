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

describe("handleGoalReplan AI insight fallback", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    sendQwenChatRequest.mockReset();
    generateContent.mockReset();
    sendQwenChatRequest.mockResolvedValue({
      success: true,
      content: JSON.stringify({ summary: "Qwen: modal shifted the submit button" }),
    });
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("falls back to Qwen when the configured Gemini request throws", async () => {
    generateContent.mockRejectedValue(new Error("Gemini 503"));

    const res = await replan();

    expect(res.body.success).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sendQwenChatRequest).toHaveBeenCalledTimes(1);
    expect(res.body.aiInsights).toBe("Qwen: modal shifted the submit button");
  });

  it("falls back to Qwen when Gemini returns no text", async () => {
    generateContent.mockResolvedValue({ text: "" });

    const res = await replan();

    expect(sendQwenChatRequest).toHaveBeenCalledTimes(1);
    expect(res.body.aiInsights).toBe("Qwen: modal shifted the submit button");
  });

  it("uses Gemini and skips Qwen when Gemini succeeds", async () => {
    generateContent.mockResolvedValue({ text: "Gemini insight" });

    const res = await replan();

    expect(res.body.aiInsights).toBe("Gemini insight");
    expect(sendQwenChatRequest).not.toHaveBeenCalled();
  });

  it("uses Qwen directly when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await replan();

    expect(generateContent).not.toHaveBeenCalled();
    expect(res.body.aiInsights).toBe("Qwen: modal shifted the submit button");
  });
});
