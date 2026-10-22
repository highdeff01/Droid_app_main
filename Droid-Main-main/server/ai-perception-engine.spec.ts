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

function geminiElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    name: "Save",
    type: "button",
    x: 300,
    y: 200,
    width: 60,
    height: 30,
    suggestedAction: "click",
    description: "Save button",
    ...overrides,
  } as any;
}

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

    it("returns the simulated report naming both errors when Gemini also fails", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      gemini.mockRejectedValue(new Error("quota exceeded"));
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(report.simulated).toBe(true);
      expect(report.confidence).toBeNull();
      expect(report.elements).toEqual([]);
      expect(report.screenDescription).toContain("quota exceeded");
    });

    it("gives the action gate no element to verify a center-screen click against", async () => {
      delete process.env.GEMINI_API_KEY;
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);
      expect(findTargetElement(report as any, 960, 540)).toBeUndefined();
    });
  });

  describe("Gemini fallback analysis", () => {
    beforeEach(() => {
      process.env.GEMINI_API_KEY = "test-key";
      qwen.mockResolvedValue({ success: false, error: "timeout" } as any);
    });

    it("returns an empty element list when the analysis detects nothing", async () => {
      gemini.mockResolvedValue({ elements: [], suggestedSteps: [], summary: "Blank", simulated: false });
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(report.elements).toEqual([]);
      expect(report.confidence).toBeNull();
      expect(report.elements.some((el) => el.name === "Primary Screen Center")).toBe(false);
      expect(findTargetElement(report as any, 960, 540)).toBeUndefined();
    });

    it("derives report confidence from the analysis instead of stamping 0.85", async () => {
      gemini.mockResolvedValue({
        elements: [geminiElement({ confidence: 0.42 })],
        suggestedSteps: [],
        summary: "One button",
        simulated: false,
      });
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(report.confidence).toBe(0.42);
      expect(report.elements[0].confidence).toBe(0.42);
      expect(report.simulated).toBe(false);
      expect(report.source).toBe("model");
    });

    it("leaves element confidence null when the analysis supplies none", async () => {
      gemini.mockResolvedValue({
        elements: [geminiElement({ confidence: undefined })],
        suggestedSteps: [],
        summary: "One button",
        simulated: false,
      });
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(report.elements[0].confidence).toBeNull();
      expect(report.confidence).toBeNull();
    });

    it("carries a simulated analysis through as simulated with null confidence", async () => {
      gemini.mockResolvedValue({
        elements: [],
        suggestedSteps: [],
        summary: "placeholder",
        simulated: true,
        simulationReason: "no model",
      });
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE);

      expect(report.simulated).toBe(true);
      expect(report.source).toBe("heuristic");
      expect(report.confidence).toBeNull();
    });

    it("keeps only DOM elements on an empty detection and never invents a 0.95 confidence", async () => {
      gemini.mockResolvedValue({ elements: [], suggestedSteps: [], summary: "", simulated: false });
      const context = browserContext([
        { id: "d1", name: "Login", type: "button", x: 10, y: 10, width: 50, height: 20 },
        { id: "d2", name: "Email", type: "input", x: 10, y: 50, width: 80, height: 20, confidence: 0.7 },
      ]);
      const report = await new QwenVisionPerceptionEngine().analyzeScreen(IMAGE, undefined, undefined, context);

      expect(report.elements.map((el) => el.name)).toEqual(["Login", "Email"]);
      expect(report.elements[0].confidence).toBeNull();
      expect(report.elements[1].confidence).toBe(0.7);
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
});
