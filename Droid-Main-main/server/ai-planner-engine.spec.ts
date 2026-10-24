import { beforeEach, describe, expect, it, vi } from "vitest";

const sendQwenChatRequest = vi.fn();
vi.mock("./ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-endpoint")>()),
  sendQwenChatRequest: (...args: unknown[]) => sendQwenChatRequest(...args),
}));

import { AiUnavailableError } from "./ai-endpoint";
import { AIPlannerActorEngine, readPlannerConfidence } from "./ai-planner-engine";
import type { ScreenPerceptionReport } from "./ai-perception-engine";

const perception = {
  screenDescription: "Login form",
  activeWindow: "Browser",
  visualStateChange: "none",
  feedbackPosition: { x: 300, y: 200 },
  elements: [{ name: "Sign in", center: { x: 410, y: 320 } }],
} as unknown as ScreenPerceptionReport;

function modelReply(content: string) {
  sendQwenChatRequest.mockResolvedValueOnce({ success: true, content });
}

describe("AIPlannerActorEngine", () => {
  beforeEach(() => {
    sendQwenChatRequest.mockReset();
  });

  it("rejects with AiUnavailableError whose message starts 'AI endpoint unreachable' when the model is unavailable", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({ success: false, error: "ECONNREFUSED" });
    const promise = new AIPlannerActorEngine().planAndFormulateAction(perception);
    await expect(promise).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(promise).rejects.toThrow(/^AI endpoint unreachable/);
  });

  it("rejects with AiUnavailableError when the model reply is not JSON", async () => {
    modelReply("I think you should click somewhere");
    const promise = new AIPlannerActorEngine().planAndFormulateAction(perception);
    await expect(promise).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("marks the decision source as 'model' on a successful reply", async () => {
    modelReply(JSON.stringify({ nextAction: { title: "Click", x: 5, y: 6 } }));
    const decision = await new AIPlannerActorEngine().planAndFormulateAction(perception);
    expect(decision).toMatchObject({ source: "model", verified: true });
  });

  it("uses null, not a constant, when the model omits confidence", async () => {
    modelReply(JSON.stringify({ nextAction: { title: "Click", x: 5, y: 6 } }));
    const decision = await new AIPlannerActorEngine().planAndFormulateAction(perception);
    expect(decision.thinking.confidence).toBeNull();
  });

  it("keeps the model's own confidence, including 0", async () => {
    modelReply(JSON.stringify({ thinking: { confidence: 0.37 } }));
    expect((await new AIPlannerActorEngine().planAndFormulateAction(perception)).thinking.confidence).toBe(0.37);
    modelReply(JSON.stringify({ thinking: { confidence: 0 } }));
    expect((await new AIPlannerActorEngine().planAndFormulateAction(perception)).thinking.confidence).toBe(0);
  });

  it("sends the live frame as images on the user message when imageData is given", async () => {
    modelReply(JSON.stringify({ nextAction: { title: "Click", x: 5, y: 6 } }));

    await new AIPlannerActorEngine().planAndFormulateAction(
      perception,
      undefined,
      undefined,
      undefined,
      { imageData: "data:image/png;base64,iVBOR" },
    );

    const [messages] = sendQwenChatRequest.mock.calls[0];
    const userMessage = messages[messages.length - 1];
    expect(userMessage.images).toEqual(["iVBOR"]);
  });

  it("reads and clamps planner confidence, null for non-numbers", () => {
    expect(readPlannerConfidence(1.4)).toBe(1);
    expect(readPlannerConfidence(-2)).toBe(0);
    for (const bogus of [undefined, null, "0.8", NaN, true]) expect(readPlannerConfidence(bogus)).toBeNull();
  });

  it("does not verify an action when no screen change was detected", async () => {
    const engine = new AIPlannerActorEngine();
    const result = await engine.verifyActionOutcome(perception, perception, {
      expectedChange: "Button pressed",
      targetRegion: { x: 0, y: 0, width: 1, height: 1 },
      successCondition: "x",
      retryStrategy: "y",
    });
    expect(result.verified).toBe(false);
  });
});
