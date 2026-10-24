import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, clear } = vi.hoisted(() => ({
  send: vi.fn(),
  clear: vi.fn(),
}));
const { getAiStatus, pingAiEndpoint } = vi.hoisted(() => ({
  getAiStatus: vi.fn(),
  pingAiEndpoint: vi.fn(),
}));

vi.mock("../ai-conversation", () => ({
  aiConversations: { send, clear },
}));
vi.mock("../ai-status", () => ({
  getAiStatus,
  pingAiEndpoint,
}));

import {
  handleAiHelp,
  handleClearAiSession,
  handleGetAiStatus,
} from "./ai-help";

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

beforeEach(() => {
  send.mockReset();
  clear.mockReset();
  getAiStatus.mockReset();
  pingAiEndpoint.mockReset();
});

describe("handleAiHelp", () => {
  it("rejects a request without a question with 400", async () => {
    const res = makeRes();

    await handleAiHelp({ body: {} } as any, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 502 with 'AI endpoint unreachable' when send fails, never a canned answer", async () => {
    send.mockResolvedValue({ success: false, content: "", error: "Connection error: fetch failed" });
    const res = makeRes();

    await handleAiHelp({ body: { question: "what is on screen?" } } as any, res, () => {});

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("AI endpoint unreachable");
    expect(res.body.error).toContain("Connection error: fetch failed");
  });

  it("returns a 200 answer with <think> stripped, usedFrame true and the frame attached as images when given", async () => {
    send.mockResolvedValue({
      success: true,
      content: "<think>reasoning</think>Click the submit button",
      endpoint: "https://quantumclaw.net/ollama/api/chat",
    });
    const res = makeRes();

    await handleAiHelp(
      {
        body: {
          question: "what should I click?",
          imageData: "data:image/png;base64,iVBORw0KGgo=",
        },
      } as any,
      res,
      () => {},
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.answer).toBe("Click the submit button");
    expect(res.body.usedFrame).toBe(true);
    const [, message] = send.mock.calls[0];
    expect(message.images).toEqual(["iVBORw0KGgo="]);
  });

  it("defaults sessionId to 'ai-help' when none is given", async () => {
    send.mockResolvedValue({ success: true, content: "ok" });
    const res = makeRes();

    await handleAiHelp({ body: { question: "hi" } } as any, res, () => {});

    expect(send.mock.calls[0][0]).toBe("ai-help");
    expect(res.body.sessionId).toBe("ai-help");
  });
});

describe("handleGetAiStatus", () => {
  it("returns the stored status without pinging", async () => {
    getAiStatus.mockReturnValue({ state: "online" });
    const res = makeRes();

    await handleGetAiStatus({ query: {} } as any, res, () => {});

    expect(getAiStatus).toHaveBeenCalledTimes(1);
    expect(pingAiEndpoint).not.toHaveBeenCalled();
    expect(res.body).toEqual({ success: true, status: { state: "online" } });
  });

  it("pings the endpoint when ?refresh=1 is given", async () => {
    pingAiEndpoint.mockResolvedValue({ state: "offline" });
    const res = makeRes();

    await handleGetAiStatus({ query: { refresh: "1" } } as any, res, () => {});

    expect(pingAiEndpoint).toHaveBeenCalledTimes(1);
    expect(getAiStatus).not.toHaveBeenCalled();
    expect(res.body).toEqual({ success: true, status: { state: "offline" } });
  });
});

describe("handleClearAiSession", () => {
  it("clears the session named in the route param", () => {
    const res = makeRes();

    handleClearAiSession({ params: { sessionId: "ai-help" } } as any, res, () => {});

    expect(clear).toHaveBeenCalledWith("ai-help");
    expect(res.body).toEqual({ success: true });
  });
});
