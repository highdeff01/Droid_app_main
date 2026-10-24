import { beforeEach, describe, expect, it, vi } from "vitest";

const sendQwenChatRequest = vi.fn();
vi.mock("../ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai-endpoint")>()),
  sendQwenChatRequest: (...args: unknown[]) => sendQwenChatRequest(...args),
}));

import { aiConversations } from "../ai-conversation";
import { handleAnalyzeAndAct } from "./analyze-and-act";

const FRAME = "data:image/png;base64,iVBORw0KGgo=";
let sessionCounter = 0;

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

function makeReq(body: Record<string, unknown>) {
  sessionCounter += 1;
  return { body: { sessionId: `test-${sessionCounter}`, liveScreenUrl: FRAME, ...body } } as any;
}

describe("handleAnalyzeAndAct", () => {
  beforeEach(() => {
    sendQwenChatRequest.mockReset();
  });

  it("returns 400 when no live screen frame is present", async () => {
    sessionCounter += 1;
    const req = { body: { sessionId: `test-${sessionCounter}` } } as any;
    const res = makeRes();

    await handleAnalyzeAndAct(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(sendQwenChatRequest).not.toHaveBeenCalled();
  });

  it("returns 502 with 'AI endpoint unreachable' when the chat call fails", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({ success: false, error: "ECONNREFUSED" });
    const res = makeRes();

    await handleAnalyzeAndAct(makeReq({}), res, vi.fn());

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("AI endpoint unreachable");
  });

  it("returns 502 when the model reply is not JSON", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({ success: true, content: "not json" });
    const res = makeRes();

    await handleAnalyzeAndAct(makeReq({}), res, vi.fn());

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it("maps model JSON into the response and drops tasks without numeric x/y", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        visualSummary: "A login form is visible.",
        crossReferenceAnalysis: {
          previousActionSummary: "Opened the page",
          currentScreenState: "Form is ready",
          identifiedChanges: ["form loaded"],
          recommendedAdjustments: ["click sign in"],
        },
        autoAssembledTasks: [
          { name: "Click Sign In", action: "click", x: 412, y: 318, confidence: 0.8 },
          { name: "No coords", action: "click" },
        ],
      }),
      endpoint: "https://quantumclaw.net/ollama/api/chat",
    });
    const res = makeRes();

    await handleAnalyzeAndAct(makeReq({}), res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.visualSummary).toBe("A login form is visible.");
    expect(res.body.crossReferenceAnalysis.currentScreenState).toBe("Form is ready");
    expect(res.body.autoAssembledTasks).toHaveLength(1);
    expect(res.body.autoAssembledTasks[0].targetPosition).toEqual({ x: 412, y: 318 });
  });

  it("sends the live frame as images on the user message", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({ autoAssembledTasks: [] }),
    });

    await handleAnalyzeAndAct(makeReq({}), makeRes(), vi.fn());

    const [messages] = sendQwenChatRequest.mock.calls[0];
    const userMessage = messages[messages.length - 1];
    expect(userMessage.images).toEqual(["iVBORw0KGgo="]);
  });
});
