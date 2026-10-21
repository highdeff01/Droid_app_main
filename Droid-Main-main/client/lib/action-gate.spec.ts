import { describe, expect, it } from "vitest";
import {
  MAX_REINSPECTIONS,
  TARGET_PADDING_PX,
  USER_VERIFIED_OVERRIDE,
  analysisConfidence,
  applyUserOverride,
  canUserOverride,
  findTargetElement,
  formatBlockedReason,
  gateTargetForSteps,
  runActionGate,
  type GateBlockDetail,
  type GatePost,
  type GateResult,
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
      {
        action: "click",
        x: 42,
        y: 84,
        name: "Submit",
        targetOcrLabel: "Submit button",
      },
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

    expect(findTargetElement(report, 100 - TARGET_PADDING_PX, 125)).toBe(
      element,
    );
  });

  it("returns undefined for a point beyond the padding slack", () => {
    const element = makeElement({
      boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const report = makeReport({ elements: [element] });

    expect(
      findTargetElement(report, 100 - TARGET_PADDING_PX - 1, 125),
    ).toBeUndefined();
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
      {
        targetDevice: "device-1",
        target: baseTarget,
        signal: controller.signal,
      },
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
      {
        targetDevice: "device-1",
        target: baseTarget,
        signal: controller.signal,
      },
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
      {
        targetDevice: "device-1",
        target: baseTarget,
        signal: controller.signal,
      },
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

  describe("runActionGate reinspection", () => {
    it("verifies on the second inspection when the element is missing on the first", async () => {
      const far = makeElement({ boundingBox: { x: 900, y: 900, width: 20, height: 20 } });
      const near = makeElement({ boundingBox: { x: 90, y: 90, width: 20, height: 20 } });
      let captureCalls = 0;
      let describeCalls = 0;
      const post: GatePost = async (url) => {
        if (url === "/api/replay/capture") {
          captureCalls++;
          return { success: true, frame: { image: "data:img" } };
        }
        describeCalls++;
        const report = makeReport({ elements: describeCalls === 1 ? [far] : [near] });
        return { success: true, report };
      };
      const controller = new AbortController();

      const result = await runActionGate(
        { targetDevice: "device-1", target: baseTarget, signal: controller.signal },
        post,
      );

      expect(result.status).toBe("verified");
      if (result.status === "verified") expect(result.attempts).toBe(2);
      expect(captureCalls).toBe(2);
      expect(describeCalls).toBe(2);
    });

    it("blocks with target_not_found detail after MAX_REINSPECTIONS retries", async () => {
      const elements = [
        makeElement({ id: "a", boundingBox: { x: 900, y: 900, width: 20, height: 20 } }),
        makeElement({ id: "b", boundingBox: { x: 950, y: 950, width: 20, height: 20 } }),
      ];
      let captureCalls = 0;
      let describeCalls = 0;
      const post: GatePost = async (url) => {
        if (url === "/api/replay/capture") {
          captureCalls++;
          return { success: true, frame: { image: "data:img" } };
        }
        describeCalls++;
        return { success: true, report: makeReport({ elements }) };
      };
      const controller = new AbortController();

      const result = await runActionGate(
        {
          targetDevice: "device-1",
          target: baseTarget,
          signal: controller.signal,
          stepLabel: "Click Submit",
        },
        post,
      );

      expect(captureCalls).toBe(1 + MAX_REINSPECTIONS);
      expect(describeCalls).toBe(1 + MAX_REINSPECTIONS);
      expect(result.status).toBe("blocked");
      if (result.status !== "blocked" || !result.detail) throw new Error("expected blocked detail");
      const { detail } = result;
      expect(detail.stage).toBe("target_not_found");
      expect(detail.attempts).toBe(1 + MAX_REINSPECTIONS);
      expect(detail.elementsDetected).toBe(2);
      expect(detail.x).toBe(100);
      expect(detail.y).toBe(100);
      expect(detail.frame).toBe("data:img");
      expect(detail.report).toBeTruthy();
      expect(result.reason).toContain("Click Submit");
      expect(result.reason).toContain("Submit");
      expect(result.reason).toContain("(100, 100)");
      expect(result.reason).toContain("2 elements detected");
      expect(result.reason).toContain("target not found");
    });

    it("blocks at the capture stage without ever calling describe-screen", async () => {
      let captureCalls = 0;
      let describeCalled = false;
      const post: GatePost = async (url) => {
        if (url === "/api/replay/capture") {
          captureCalls++;
          throw new Error("boom");
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
      if (result.status !== "blocked" || !result.detail) throw new Error("expected blocked detail");
      expect(result.detail.stage).toBe("capture");
      expect(result.detail.attempts).toBe(1);
      expect(result.detail.elementsDetected).toBeNull();
      expect(describeCalled).toBe(false);
      expect(captureCalls).toBe(1);
      expect(result.reason).toContain("screen capture failed");
    });

    it("blocks at the analysis stage when describe-screen rejects", async () => {
      let captureCalls = 0;
      const post: GatePost = async (url) => {
        if (url === "/api/replay/capture") {
          captureCalls++;
          return { success: true, frame: { image: "data:img" } };
        }
        throw new Error("boom");
      };
      const controller = new AbortController();

      const result = await runActionGate(
        { targetDevice: "device-1", target: baseTarget, signal: controller.signal },
        post,
      );

      expect(result.status).toBe("blocked");
      if (result.status !== "blocked" || !result.detail) throw new Error("expected blocked detail");
      expect(result.detail.stage).toBe("analysis");
      expect(captureCalls).toBe(1);
      expect(result.reason).toContain("screen analysis failed");
    });

    it("verifies on the first attempt when the target needs no element", async () => {
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
      if (result.status === "verified") expect(result.attempts).toBe(1);
    });
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
      {
        targetDevice: "device-1",
        target: baseTarget,
        signal: controller.signal,
      },
      post,
    );
    await describeCalledPromise;
    controller.abort();
    resolveDescribe({ success: true, report: makeReport({ elements: [] }) });

    const result = await resultPromise;

    expect(result.status).toBe("cancelled");
  });
});

describe("formatBlockedReason", () => {
  function makeDetail(overrides: Partial<GateBlockDetail> = {}): GateBlockDetail {
    return {
      stage: "target_not_found",
      stepLabel: "Click Submit",
      targetLabel: "Submit",
      x: 100,
      y: 100,
      elementsDetected: 2,
      attempts: 1,
      error: "Target not found",
      ...overrides,
    };
  }

  it("pluralizes a single detected element as '1 element detected'", () => {
    const reason = formatBlockedReason(makeDetail({ elementsDetected: 1 }));
    expect(reason).toContain("1 element detected");
  });

  it("pluralizes a single attempt as '1 inspection'", () => {
    const reason = formatBlockedReason(makeDetail({ attempts: 1 }));
    expect(reason).toContain("1 inspection");
  });

  it("reports 'no elements analyzed' when elementsDetected is null", () => {
    const reason = formatBlockedReason(makeDetail({ elementsDetected: null }));
    expect(reason).toContain("no elements analyzed");
  });

  it("starts with 'Action:' when there is no stepLabel", () => {
    const reason = formatBlockedReason(makeDetail({ stepLabel: undefined }));
    expect(reason.startsWith("Action:")).toBe(true);
  });
});

describe("user override", () => {
  function makeBlocked(
    stage: GateBlockDetail["stage"],
    extra: Partial<GateBlockDetail> = {},
  ): GateResult {
    const detail: GateBlockDetail = {
      stage,
      stepLabel: "Click Submit",
      targetLabel: "Submit",
      x: 100,
      y: 100,
      elementsDetected: stage === "target_not_found" ? 2 : null,
      attempts: 1,
      error: "boom",
      ...(stage === "target_not_found"
        ? { frame: "data:img", report: makeReport() }
        : {}),
      ...extra,
    };
    return { status: "blocked", reason: formatBlockedReason(detail), detail };
  }

  const notFound = makeBlocked("target_not_found");
  const captureBlocked = makeBlocked("capture");
  const analysisBlocked = makeBlocked("analysis");
  const verified: GateResult = {
    status: "verified",
    frame: "data:img",
    report: makeReport(),
  };
  const cancelled: GateResult = {
    status: "cancelled",
    reason: "Action cancelled before dispatch",
  };

  it("is true only for a blocked target_not_found result with a frame and report", () => {
    expect(canUserOverride(notFound)).toBe(true);
  });

  it("is false for a capture-stage block", () => {
    expect(canUserOverride(captureBlocked)).toBe(false);
  });

  it("is false for an analysis-stage block", () => {
    expect(canUserOverride(analysisBlocked)).toBe(false);
  });

  it("is false for a verified result", () => {
    expect(canUserOverride(verified)).toBe(false);
  });

  it("is false for a cancelled result", () => {
    expect(canUserOverride(cancelled)).toBe(false);
  });

  it("returns undefined when the user did not confirm", () => {
    expect(applyUserOverride(notFound, false)).toBeUndefined();
  });

  it("returns undefined when the block cannot be overridden even if confirmed", () => {
    expect(applyUserOverride(captureBlocked, true)).toBeUndefined();
  });

  it("turns a confirmed target-not-found block into a verified override", () => {
    const overridden = applyUserOverride(notFound, true);
    if (!overridden) throw new Error("expected an override result");
    expect(overridden.status).toBe("verified");
    expect(overridden.override).toBe(true);
    if (notFound.status === "blocked" && notFound.detail) {
      expect(overridden.frame).toBe(notFound.detail.frame);
      expect(overridden.report).toBe(notFound.detail.report);
    }
    expect(overridden.confidence).toBeUndefined();
  });

  it("labels the override with the USER_VERIFIED_OVERRIDE constant", () => {
    expect(USER_VERIFIED_OVERRIDE).toBe("user-verified override");
  });
});
