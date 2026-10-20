import { describe, expect, it } from "vitest";
import {
  TARGET_PADDING_PX,
  analysisConfidence,
  findTargetElement,
  gateTargetForSteps,
  runActionGate,
  type GatePost,
  type GateStepLike,
} from "./action-gate";

function makeElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-1",
    name: "Button",
    type: "button",
    boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    center: { x: 125, y: 125 },
    confidence: 0.85,
    interactive: true,
    ...overrides,
  } as any;
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: 0,
    screenDescription: "desc",
    activeWindow: "win",
    visualStateChange: "none",
    elements: [],
    feedbackPosition: { x: 0, y: 0 },
    primarySuggestion: "",
    confidence: 0.8,
    ...overrides,
  } as any;
}

describe("gateTargetForSteps", () => {
  it("picks the first positional step over a preceding non-positional step", () => {
    const steps: GateStepLike[] = [
      { action: "press_key", x: 0, y: 0, name: "Enter" },
      { action: "click", x: 42, y: 84, name: "Submit", targetOcrLabel: "Submit button" },
    ];

    expect(gateTargetForSteps(steps)).toEqual({
      x: 42,
      y: 84,
      label: "Submit button",
      needsTarget: true,
    });
  });

  it("falls back to the first step with needsTarget false when none are positional", () => {
    const steps: GateStepLike[] = [
      { action: "wait", x: 1, y: 2, name: "Wait" },
      { action: "press_key", x: 3, y: 4, name: "Enter" },
    ];

    expect(gateTargetForSteps(steps)).toEqual({
      x: 1,
      y: 2,
      label: "Wait",
      needsTarget: false,
    });
  });
});

describe("findTargetElement", () => {
  it("returns the smallest element whose padded bounding box contains the point", () => {
    const big = makeElement({
      id: "big",
      boundingBox: { x: 0, y: 0, width: 400, height: 400 },
    });
    const small = makeElement({
      id: "small",
      boundingBox: { x: 90, y: 90, width: 20, height: 20 },
    });
    const report = makeReport({ elements: [big, small] });

    expect(findTargetElement(report, 100, 100)?.id).toBe("small");
  });

  it("matches a point just inside the padding slack", () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });

    expect(findTargetElement(report, 100 - TARGET_PADDING_PX, 125)).toBe(element);
  });

  it("returns undefined for a point beyond the padding slack", () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });

    expect(findTargetElement(report, 100 - TARGET_PADDING_PX - 1, 125)).toBeUndefined();
  });
});

describe("analysisConfidence", () => {
  it("returns the element's confidence when an element is given", () => {
    const element = makeElement({ confidence: 0.77 });
    const report = makeReport({ confidence: 0.5 });

    expect(analysisConfidence(report, element)).toBe(0.77);
  });

  it("returns the report's confidence when no element is given", () => {
    const report = makeReport({ confidence: 0.6 });

    expect(analysisConfidence(report)).toBe(0.6);
  });

  it("returns undefined when the value is missing", () => {
    const report = makeReport({ confidence: undefined });

    expect(analysisConfidence(report)).toBeUndefined();
  });

  it("returns undefined when the value is NaN", () => {
    const element = makeElement({ confidence: NaN });
    const report = makeReport({ confidence: 0.6 });

    expect(analysisConfidence(report, element)).toBeUndefined();
  });
});

describe("runActionGate", () => {
  const baseTarget = { x: 100, y: 100, label: "Submit", needsTarget: true };

  it("resolves verified with the matched element's confidence when the element contains the target", async () => {
    const element = makeElement({
      boundingBox: { x: 90, y: 90, width: 20, height: 20 },
      confidence: 0.81,
    });
    const report = makeReport({ elements: [element] });
    const calls: { url: string; body: unknown }[] = [];
    const post: GatePost = async (url, body) => {
      calls.push({ url, body });
      if (url === "/api/replay/capture") {
        return { success: true, frame: { image: "data:img" } };
      }
      if (url === "/api/ai/describe-screen") {
        return { success: true, report };
      }
      throw new Error(`unexpected url ${url}`);
    };
    const controller = new AbortController();

    const result = await runActionGate(
      { targetDevice: "device-1", target: baseTarget, signal: controller.signal },
      post,
    );

    expect(result.status).toBe("verified");
    if (result.status === "verified") {
      expect(result.confidence).toBe(0.81);
      expect(result.frame).toBe("data:img");
    }
    expect(calls[0].url).toBe("/api/replay/capture");
    expect(calls[1]).toEqual({
      url: "/api/ai/describe-screen",
      body: { imageData: "data:img" },
    });
  });

  it("resolves blocked with a 'not found' reason when no element is near the target", async () => {
    const report = makeReport({ elements: [] });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return { success: true, frame: { image: "data:img" } };
      }
      if (url === "/api/ai/describe-screen") {
        return { success: true, report };
      }
      throw new Error(`unexpected url ${url}`);
    };
    const controller = new AbortController();

    const result = await runActionGate(
      { targetDevice: "device-1", target: baseTarget, signal: controller.signal },
      post,
    );

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.reason).toMatch(/not found/);
  });

  it("resolves blocked and never calls describe-screen when capture rejects", async () => {
    let describeCalled = false;
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        throw new Error("capture failed");
      }
      describeCalled = true;
      return { success: true, report: makeReport() };
    };
    const controller = new AbortController();

    const result = await runActionGate(
      { targetDevice: "device-1", target: baseTarget, signal: controller.signal },
      post,
    );

    expect(result.status).toBe("blocked");
    expect(describeCalled).toBe(false);
  });

  it("resolves verified with the report confidence when the target needs no element", async () => {
    const report = makeReport({ confidence: 0.55 });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return { success: true, frame: { image: "data:img" } };
      }
      return { success: true, report };
    };
    const controller = new AbortController();
    const target = { x: 0, y: 0, needsTarget: false };

    const result = await runActionGate(
      { targetDevice: "device-1", target, signal: controller.signal },
      post,
    );

    expect(result.status).toBe("verified");
    if (result.status === "verified") expect(result.confidence).toBe(0.55);
  });

  it("resolves verified with undefined confidence when the target needs no element and the report has none", async () => {
    const report = makeReport({ confidence: undefined });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return { success: true, frame: { image: "data:img" } };
      }
      return { success: true, report };
    };
    const controller = new AbortController();
    const target = { x: 0, y: 0, needsTarget: false };

    const result = await runActionGate(
      { targetDevice: "device-1", target, signal: controller.signal },
      post,
    );

    expect(result.status).toBe("verified");
    if (result.status === "verified") expect(result.confidence).toBeUndefined();
  });

  it("resolves cancelled when aborted while describe-screen is pending", async () => {
    let resolveDescribe: (value: unknown) => void = () => {};
    let resolveDescribeCalled: () => void = () => {};
    const describeCalledPromise = new Promise<void>((resolve) => {
      resolveDescribeCalled = resolve;
    });
    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return { success: true, frame: { image: "data:img" } };
      }
      resolveDescribeCalled();
      return new Promise((resolve) => {
        resolveDescribe = resolve;
      });
    };
    const controller = new AbortController();

    const resultPromise = runActionGate(
      { targetDevice: "device-1", target: baseTarget, signal: controller.signal },
      post,
    );
    await describeCalledPromise;
    controller.abort();
    resolveDescribe({ success: true, report: makeReport({ elements: [] }) });

    const result = await resultPromise;

    expect(result.status).toBe("cancelled");
  });
});
