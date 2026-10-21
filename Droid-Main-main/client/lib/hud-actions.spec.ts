import { describe, expect, it, vi } from "vitest";

import {
  askQwen,
  buildPresentation,
  completionStep,
  createPack,
  dispatchInteractiveAction,
  fetchQwenGuide,
  inspectOcrAtPoint,
  stopBridge,
  tagEntityAtPoint,
  verifyIntegrityAtPoint,
  type HudPost,
  type HudStepLike,
} from "./hud-actions";

const SCREENSHOT = "data:image/png;base64,AAAA";

/** A post fn that resolves per-URL fixtures from a map and rejects for unknown URLs. */
function routedPost(fixtures: Record<string, unknown | ((body: unknown) => unknown)>): HudPost {
  return vi.fn(async (url: string, body?: unknown) => {
    if (!(url in fixtures)) {
      throw new Error(`No fixture for ${url}`);
    }
    const entry = fixtures[url];
    return typeof entry === "function" ? (entry as (body: unknown) => unknown)(body) : entry;
  }) as unknown as HudPost;
}

function rejecting(message: string) {
  return () => {
    throw new Error(message);
  };
}

describe("hud-actions", () => {
  describe("dispatchInteractiveAction", () => {
    it("posts action/x/y and returns simulated true from the response", async () => {
      const post = routedPost({
        "/api/pyautogui/interactive-action": { success: true, simulated: true, message: "Simulated click" },
      });

      const result = await dispatchInteractiveAction({ action: "click", x: 10, y: 20 }, post);

      expect(post).toHaveBeenCalledWith(
        "/api/pyautogui/interactive-action",
        expect.objectContaining({ action: "click", x: 10, y: 20 }),
      );
      expect(result).toEqual({ simulated: true, message: "Simulated click" });
    });

    it("posts action/x/y and returns simulated false from the response", async () => {
      const post = routedPost({
        "/api/pyautogui/interactive-action": { success: true, simulated: false, message: "Clicked on device" },
      });

      const result = await dispatchInteractiveAction({ action: "click", x: 1, y: 2 }, post);

      expect(result).toEqual({ simulated: false, message: "Clicked on device" });
    });

    it("rejects when post rejects", async () => {
      const post = routedPost({ "/api/pyautogui/interactive-action": rejecting("bridge unreachable") });

      await expect(dispatchInteractiveAction({ action: "click", x: 1, y: 2 }, post)).rejects.toThrow(
        "bridge unreachable",
      );
    });
  });

  describe("stopBridge", () => {
    it("rejects when post rejects", async () => {
      const post = routedPost({ "/api/pyautogui/stop": rejecting("stop failed") });

      await expect(stopBridge(post)).rejects.toThrow("stop failed");
    });

    it("resolves the server message otherwise", async () => {
      const post = routedPost({ "/api/pyautogui/stop": { success: true, message: "Execution bridge stopped." } });

      await expect(stopBridge(post)).resolves.toBe("Execution bridge stopped.");
    });
  });

  describe("inspectOcrAtPoint", () => {
    it("posts imageData/x/y/frameWidth/frameHeight and returns the recognized text", async () => {
      const post = routedPost({
        "/api/hud/ocr-inspect": { success: true, provider: "tesseract", text: "Submit", confidence: 0.91, blockCount: 3 },
      });

      const result = await inspectOcrAtPoint(SCREENSHOT, { x: 10, y: 20 }, { width: 100, height: 200 }, post);

      expect(post).toHaveBeenCalledWith("/api/hud/ocr-inspect", {
        imageData: SCREENSHOT,
        x: 10,
        y: 20,
        frameWidth: 100,
        frameHeight: 200,
      });
      expect(result.text).toBe("Submit");
    });

    it("rejects with no-frame message for a null frame without calling post", async () => {
      const post = vi.fn();

      await expect(
        inspectOcrAtPoint(null as unknown as string, { x: 1, y: 1 }, { width: 10, height: 10 }, post as unknown as HudPost),
      ).rejects.toThrow(/No captured screen frame/);
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe("tagEntityAtPoint", () => {
    it("posts to /api/hud/entities and returns data.entity", async () => {
      const entity = { id: "entity_1", type: "goal" as const, x: 5, y: 6, label: "Login", createdAt: 1 };
      const post = routedPost({ "/api/hud/entities": { success: true, entity } });

      const result = await tagEntityAtPoint({ type: "goal", x: 5, y: 6, label: "Login" }, post);

      expect(result).toEqual(entity);
    });
  });

  describe("verifyIntegrityAtPoint", () => {
    const report = {
      elements: [
        {
          id: "el1",
          name: "OK",
          type: "button",
          boundingBox: { x: 40, y: 40, width: 20, height: 20 },
          center: { x: 50, y: 50 },
          confidence: 0.77,
          interactive: true,
        },
      ],
      confidence: 0.6,
    };

    it("drift-checks the nearby step through auto-calibrate and reports its drift", async () => {
      const step: HudStepLike = { id: "s1", name: "Click OK", action: "click", x: 100, y: 100 };
      const post = routedPost({
        "/api/ai/describe-screen": { success: true, report },
        "/api/ai/auto-calibrate-workflow": (body: any) => {
          expect(body.steps).toEqual([step]);
          expect(body.elements).toEqual(report.elements);
          return { success: true, driftPoints: [{ driftPx: 5, isProblematic: false }], thresholdPx: 20, summary: "Within tolerance" };
        },
      });

      const result = await verifyIntegrityAtPoint(SCREENSHOT, { x: 110, y: 110 }, [step], 20, post);

      expect(result).toEqual({
        kind: "step",
        stepName: "Click OK",
        driftPx: 5,
        thresholdPx: 20,
        withinThreshold: true,
        summary: "Within tolerance",
      });
    });

    it("reports the covering element without calling auto-calibrate when no step is nearby", async () => {
      const post = routedPost({ "/api/ai/describe-screen": { success: true, report } });

      const result = await verifyIntegrityAtPoint(SCREENSHOT, { x: 50, y: 50 }, [], 20, post);

      expect(result).toEqual({ kind: "element", element: report.elements[0], confidence: 0.77 });
      expect(post).not.toHaveBeenCalledWith("/api/ai/auto-calibrate-workflow", expect.anything());
    });
  });

  describe("fetchQwenGuide", () => {
    it("posts to /api/hud/qwen/guide and returns the guide", async () => {
      const guide = { thought: "Looking at a login form", intention: "Sign in", incompleteTyping: null, suggestedActions: [] };
      const post = routedPost({ "/api/hud/qwen/guide": { success: true, guide } });

      const result = await fetchQwenGuide(SCREENSHOT, [], post);

      expect(result).toEqual(guide);
    });
  });

  describe("completionStep", () => {
    const steps: HudStepLike[] = [{ id: "s1", name: "Login", action: "type_text", x: 1, y: 1, text: "jo" }];

    it("returns a type_text step with text set to the remaining text for the matching step", () => {
      const guide = {
        thought: "",
        intention: "",
        incompleteTyping: { stepId: "s1", remainingText: "lo" },
        suggestedActions: [],
      };

      const result = completionStep(guide, steps);

      expect(result).toMatchObject({ id: "s1_completion", action: "type_text", text: "lo" });
    });

    it("returns null when there is no incomplete typing", () => {
      const guide = { thought: "", intention: "", incompleteTyping: null, suggestedActions: [] };

      expect(completionStep(guide, steps)).toBeNull();
    });
  });

  describe("askQwen", () => {
    it("returns the answer from the response", async () => {
      const post = routedPost({ "/api/hud/qwen/ask": { success: true, answer: "It's a blue button" } });

      const result = await askQwen(SCREENSHOT, "What color is it?", post);

      expect(result).toBe("It's a blue button");
    });
  });

  describe("createPack", () => {
    const steps: HudStepLike[] = [
      { id: "s1", name: "Click OK", action: "click", x: 1, y: 1, referenceScreenshotUrl: SCREENSHOT },
      { id: "s2", name: "Click elsewhere", action: "click", x: 2, y: 2, referenceScreenshotUrl: "http://example.com/img.png" },
      { id: "s3", name: "Press enter", action: "press_key", x: 0, y: 0 },
    ];

    it("posts only data:image reference screenshots, then saves a pack workflow", async () => {
      const pack = { id: "pack_1", name: "Login flow", sequence: steps, plan: null, screenshots: [SCREENSHOT], createdAt: 1 };
      const post = routedPost({
        "/api/hud/packs": (body: any) => {
          expect(body.screenshots).toEqual([SCREENSHOT]);
          return { success: true, pack };
        },
        "/api/workflows/save": (body: any) => {
          expect(body.metadata.kind).toBe("pack");
          expect(body.metadata.packId).toBe("pack_1");
          return { success: true };
        },
      });

      const result = await createPack("Login flow", steps, null, post);

      expect(result).toEqual(pack);
    });
  });

  describe("buildPresentation", () => {
    const steps: HudStepLike[] = [
      { id: "s1", name: "Click OK", action: "click", x: 1, y: 1, referenceScreenshotUrl: SCREENSHOT, confidence: 0.9 },
      { id: "s2", name: "Press enter", action: "press_key", x: 0, y: 0 },
    ];

    function makeRun(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "run1",
        target: "device-1",
        status: "completed",
        currentStep: 2,
        iteration: 1,
        completed: 2,
        total: 2,
        steps: [
          { id: "s1", status: "completed" },
          { id: "s2", status: "completed" },
        ],
        events: [
          { id: "e1", at: 1, stepId: "s1", phase: "execution", detail: "clicked" },
          { id: "e2", at: 2, stepId: "s2", phase: "execution", detail: "pressed" },
        ],
        startedAt: 0,
        ...overrides,
      } as any;
    }

    it("throws for a run that is still running", () => {
      const run = makeRun({ status: "running" });

      expect(() => buildPresentation(run, steps)).toThrow();
    });

    it("groups events by stepId per slide and takes names/screenshots from steps", () => {
      const run = makeRun();

      const presentation = buildPresentation(run, steps);

      expect(presentation.slides[0]).toMatchObject({
        stepId: "s1",
        name: "Click OK",
        screenshotUrl: SCREENSHOT,
        confidence: 0.9,
      });
      expect(presentation.slides[0].events).toEqual([{ at: 1, phase: "execution", detail: "clicked" }]);
    });

    it("leaves confidence undefined when the step carries none", () => {
      const run = makeRun();

      const presentation = buildPresentation(run, steps);

      expect(presentation.slides[1]).toMatchObject({ stepId: "s2", name: "Press enter", confidence: undefined });
    });
  });
});
