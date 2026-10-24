import { beforeEach, describe, expect, it, vi } from "vitest";

const sendQwenChatRequest = vi.fn();
vi.mock("./ai-endpoint", () => ({
  sendQwenChatRequest: (...args: unknown[]) => sendQwenChatRequest(...args),
  buildVisionMessage: (content: string, image: string) => ({ role: "user", content, images: [image] }),
  toBase64Image: (image: string) => image,
  parseModelJson: (text: string) => JSON.parse(text),
}));
vi.mock("./log-hub", () => ({ centralLogHub: { addLog: vi.fn() } }));

import {
  compareScreensForMatch,
  detectScreenElementsAndSteps,
  detectVisualErrorsAndDifferenceMapping,
  evaluateCheckupAndCompletion,
  resolveStuckState,
  verifyStepAccuracy,
} from "./ai-gemini-service";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";
const STEP = { id: "s1", name: "Submit", action: "click", x: 10, y: 20 };

describe("ai-gemini-service honest fallbacks (GEMINI_API_KEY unset)", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    sendQwenChatRequest.mockReset();
  });

  it("default path uses the Qwen backend and labels model output as not simulated", async () => {
    sendQwenChatRequest.mockResolvedValue({
      success: true,
      content: JSON.stringify({ verified: true, accuracyScore: 0.7, status: "verified", analysis: "ok", goalFinished: false }),
    });
    const result = await verifyStepAccuracy({ imageData: IMAGE, step: STEP });
    expect(sendQwenChatRequest).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ verified: true, accuracyScore: 0.7, simulated: false });
  });

  it("step verification with the model unreachable is simulated and never verified", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, error: "ECONNREFUSED" });
    const result = await verifyStepAccuracy({ imageData: IMAGE, step: STEP });
    expect(result.simulated).toBe(true);
    expect(result.simulationReason).toContain("ECONNREFUSED");
    expect(result.verified).toBe(false);
    expect(result.accuracyScore).toBe(0);
  });

  it("step verification without a screenshot is simulated, unverified, with no score", async () => {
    const result = await verifyStepAccuracy({ imageData: "", step: STEP });
    expect(result).toMatchObject({ simulated: true, verified: false, accuracyScore: 0 });
    expect(sendQwenChatRequest).not.toHaveBeenCalled();
  });

  it("screen element detection without a screenshot rejects instead of returning placeholder elements", async () => {
    await expect(detectScreenElementsAndSteps({ imageData: "" })).rejects.toThrow(
      /No screen frame supplied/,
    );
    expect(sendQwenChatRequest).not.toHaveBeenCalled();
  });

  it("screen comparison with the model unreachable never claims a match", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, error: "timeout" });
    const result = await compareScreensForMatch({ currentScreen: IMAGE, expectedScreen: IMAGE });
    expect(result).toMatchObject({ matched: false, similarityScore: 0, simulated: true });
  });

  it("screen comparison without both images never claims a match", async () => {
    const result = await compareScreensForMatch({ currentScreen: "", expectedScreen: IMAGE });
    expect(result).toMatchObject({ matched: false, similarityScore: 0, simulated: true });
  });

  it("visual diff with the model unreachable is simulated and does not say proceed", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, error: "down" });
    const result = await detectVisualErrorsAndDifferenceMapping({ expectedImage: IMAGE, responseImage: IMAGE });
    expect(result.simulated).toBe(true);
    expect(result.similarityScore).toBe(0);
    expect(result.recommendedAction).not.toBe("proceed");
  });

  it("stuck resolution and checkup fallbacks are labelled simulated", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, error: "down" });
    expect((await resolveStuckState({ imageData: IMAGE })).simulated).toBe(true);
    expect((await resolveStuckState({ imageData: "" })).simulated).toBe(true);
    expect((await evaluateCheckupAndCompletion({ imageData: IMAGE, userObjective: "x", elapsedSeconds: 1 })).simulated).toBe(true);
    expect((await evaluateCheckupAndCompletion({ imageData: "", userObjective: "x", elapsedSeconds: 1 })).simulated).toBe(true);
  });
});
