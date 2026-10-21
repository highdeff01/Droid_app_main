import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pyautogui-bridge", () => ({
  addBridgeLog: vi.fn(),
}));

const { sendQwenChatRequest } = vi.hoisted(() => ({
  sendQwenChatRequest: vi.fn(),
}));
vi.mock("../ai-endpoint", () => ({
  sendQwenChatRequest,
  buildVisionMessage: vi.fn(() => ({ role: "user", content: "x" })),
  parseModelJson: (content: string) => JSON.parse(content),
}));

import { handleBreakdownVideoSteps } from "./video-breakdown-and-integrity";

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

const FRAME = "data:image/jpeg;base64,AAAA";

beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
  sendQwenChatRequest.mockReset();
});

describe("handleBreakdownVideoSteps honest failures", () => {
  it("returns 422 with an explicit reason and no steps when no frames are provided", async () => {
    const req: any = { body: { videoFrames: [] } };
    const res = makeRes();

    await handleBreakdownVideoSteps(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.steps).toEqual([]);
    expect(res.body.error).toBe("No recorded frames were provided");
    expect(sendQwenChatRequest).not.toHaveBeenCalled();
  });

  it("surfaces the vision model's connection error instead of fabricating steps", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({
      success: false,
      error: "connect ECONNREFUSED",
    });
    const req: any = { body: { videoFrames: [FRAME] } };
    const res = makeRes();

    await handleBreakdownVideoSteps(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(422);
    expect(res.body.steps).toEqual([]);
    expect(res.body.error).toContain("ECONNREFUSED");
  });

  it("returns 422 with a no-actionable-steps reason when the model reports no steps", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({ success: true, content: "[]" });
    const req: any = { body: { videoFrames: [FRAME] } };
    const res = makeRes();

    await handleBreakdownVideoSteps(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe(
      "Vision model returned no actionable steps for the recorded frames",
    );
  });

  it("surfaces the rejection message when the vision request throws", async () => {
    sendQwenChatRequest.mockRejectedValueOnce(new Error("socket hang up"));
    const req: any = { body: { videoFrames: [FRAME] } };
    const res = makeRes();

    await handleBreakdownVideoSteps(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toContain("socket hang up");
  });

  it("drops steps without coordinates and keeps the ones the model placed", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify([
        { name: "No coordinates", action: "click" },
        { name: "Click OK", action: "click", x: 640, y: 200 },
      ]),
    });
    const req: any = { body: { videoFrames: [FRAME] } };
    const res = makeRes();

    await handleBreakdownVideoSteps(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.steps).toHaveLength(1);
    expect(res.body.steps[0].x).toBe(640);
    expect(res.body.steps[0].y).toBe(200);
    expect(res.body.steps[0].confidence).toBeUndefined();
  });
});
