import { beforeEach, describe, expect, it, vi } from "vitest";

const sendQwenChatRequest = vi.fn();
vi.mock("./ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-endpoint")>()),
  sendQwenChatRequest: (...args: unknown[]) => sendQwenChatRequest(...args),
}));

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

const FALLBACK = { confidence: null, source: "heuristic", verified: false };

describe("AIPlannerActorEngine confidence honesty", () => {
  beforeEach(() => {
    sendQwenChatRequest.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("marks the fallback plan unverified with no confidence when the model is unavailable", async () => {
    sendQwenChatRequest.mockResolvedValueOnce({ success: false, error: "ECONNREFUSED" });
    const decision = await new AIPlannerActorEngine().planAndFormulateAction(perception);
    expect(decision.thinking.confidence).toBeNull();
    expect(decision).toMatchObject({ source: "heuristic", verified: false });
    expect(decision.nextAction).toMatchObject({ x: 410, y: 320 });
  });

  it("marks the fallback plan unverified when the model reply is not JSON", async () => {
    modelReply("I think you should click somewhere");
    const decision = await new AIPlannerActorEngine().planAndFormulateAction(perception);
    expect({ confidence: decision.thinking.confidence, source: decision.source, verified: decision.verified }).toEqual(FALLBACK);
  });

  it("uses null, not a constant, when the model omits confidence", async () => {
    modelReply(JSON.stringify({ nextAction: { title: "Click", x: 5, y: 6 } }));
    const decision = await new AIPlannerActorEngine().planAndFormulateAction(perception);
    expect(decision.thinking.confidence).toBeNull();
    expect(decision).toMatchObject({ source: "model", verified: true });
  });

  it("keeps the model's own confidence, including 0", async () => {
    modelReply(JSON.stringify({ thinking: { confidence: 0.37 } }));
    expect((await new AIPlannerActorEngine().planAndFormulateAction(perception)).thinking.confidence).toBe(0.37);
    modelReply(JSON.stringify({ thinking: { confidence: 0 } }));
    expect((await new AIPlannerActorEngine().planAndFormulateAction(perception)).thinking.confidence).toBe(0);
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
