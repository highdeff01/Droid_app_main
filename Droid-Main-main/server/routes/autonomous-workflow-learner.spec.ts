import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendQwenChatRequest } = vi.hoisted(() => {
  // The route reads GEMINI_API_KEY at import time; force the Qwen path.
  delete process.env.GEMINI_API_KEY;
  return { sendQwenChatRequest: vi.fn() };
});

vi.mock("../ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai-endpoint")>()),
  sendQwenChatRequest,
}));

import { handleLearnWorkflows } from "./autonomous-workflow-learner";

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

async function learnWith(modelJson: Record<string, unknown>) {
  sendQwenChatRequest.mockResolvedValue({ success: true, content: JSON.stringify(modelJson) });
  const res = makeRes();
  await handleLearnWorkflows(
    { body: { historySteps: [{ action: "click", x: 1, y: 2 }, { action: "type", text: "a" }] } } as any,
    res,
    vi.fn(),
  );
  return res.body.newlyLearnedWorkflow;
}

const BASE = { name: "Login flow", steps: [{ action: "click", x: 10, y: 20 }] };

describe("handleLearnWorkflows confidence", () => {
  beforeEach(() => sendQwenChatRequest.mockReset());

  it("preserves a model confidence of 0", async () => {
    const wf = await learnWith({ ...BASE, confidenceScore: 0 });
    expect(wf.name).toBe("Login flow");
    expect(wf.confidenceScore).toBe(0);
  });

  it("keeps a reported non-zero confidence", async () => {
    const wf = await learnWith({ ...BASE, confidenceScore: 0.42 });
    expect(wf.confidenceScore).toBe(0.42);
  });

  it("defaults only when the model omits confidence", async () => {
    const wf = await learnWith({ ...BASE });
    expect(wf.confidenceScore).toBe(0.91);
  });
});
