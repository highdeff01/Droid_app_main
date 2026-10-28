import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-endpoint")>()),
  sendQwenChatRequest: vi.fn(),
}));
vi.mock("./ai-gemini-service", () => ({
  detectScreenElementsAndSteps: vi.fn(),
}));

import { sendQwenChatRequest } from "./ai-endpoint";
import { detectScreenElementsAndSteps } from "./ai-gemini-service";
import { QwenVisionPerceptionEngine } from "./ai-perception-engine";
import type { AiMonitorBrowserContext } from "./ai-monitor-store";
import { findTargetElement } from "../client/lib/action-gate";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";
const qwen = vi.mocked(sendQwenChatRequest);
const gemini = vi.mocked(detectScreenElementsAndSteps);

function browserContext(elements: any[]): AiMonitorBrowserContext {
  return {
    updatedAt: Date.now(),
    source: "cdp",
    tabs: [],
    elements,
  } as unknown as AiMonitorBrowserContext;
}

describe("QwenVisionPerceptionEngine", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    qwen.mockReset();
    gemini.mockReset();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  describe("when every provider fails", () => {
    beforeEach(() => {
      qwen.mockResolvedValue({ success: false, error: "connect ECONNREFUSED" } as any);
    });

    it("returns an honest simulated report with null confidence and no elements when no Gemini key is set", async () => {
      delete process.env.GEMINI_API_KEY;
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(report.simulated).toBe(true);
      expect(report.source).toBe("heuristic");
      expect(report.confidence).toBeNull();
      expect(report.elements).toEqual([]);
      expect(report.screenDescription).toContain("Perception unavailable");
      expect(report.screenDescription).toContain("connect ECONNREFUSED");
      expect(report.screenDescription).not.toContain("Perception online");
      expect(report.activeWindow).not.toBe("Active Target App");
      expect(report.visualStateChange).not.toBe("Ready for user commands");
    });

    it("never falls back to another provider when GEMINI_API_KEY is set", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(gemini).not.toHaveBeenCalled();
      expect(report.simulated).toBe(true);
      expect(report.confidence).toBeNull();
      expect(report.elements).toEqual([]);
      expect(report.screenDescription).toContain("connect ECONNREFUSED");
      expect(report.screenDescription.toLowerCase()).not.toContain("gemini");
    });

    it("gives the action gate no element to verify a center-screen click against", async () => {
      delete process.env.GEMINI_API_KEY;
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);
      expect(findTargetElement(report as any, 960, 540)).toBeUndefined();
    });
  });

  it("marks a successful Qwen report as model output", async () => {
    qwen.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        screenDescription: "Editor",
        confidence: 0.6,
        elements: [{ name: "Run", type: "button", boundingBox: { x: 1, y: 1, width: 10, height: 10 }, confidence: 0.55 }],
      }),
    } as any);
    const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

    expect(report.simulated).toBe(false);
    expect(report.source).toBe("model");
    expect(report.confidence).toBe(0.6);
  });

  it("puts live DOM elements ahead of Qwen elements without inventing confidence", async () => {
    qwen.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        screenDescription: "Login page",
        elements: [{ name: "Help", type: "link", boundingBox: { x: 5, y: 5, width: 10, height: 10 } }],
      }),
    } as any);
    const context = browserContext([
      { id: "d1", name: "Login", type: "button", x: 10, y: 10, width: 50, height: 20 },
      { id: "d2", name: "Email", type: "input", x: 10, y: 50, width: 80, height: 20, confidence: 0.7 },
    ]);
    const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE, undefined, undefined, context);

    expect(report.elements.map((el) => el.name).slice(0, 2)).toEqual(["Login", "Email"]);
    expect(report.elements[0].confidence).toBeNull();
    expect(report.elements[1].confidence).toBe(0.7);
    expect(gemini).not.toHaveBeenCalled();
  });
});
