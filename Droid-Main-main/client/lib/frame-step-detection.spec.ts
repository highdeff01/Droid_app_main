import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  detectStepsFromFrames,
  sampleTimesFor,
  type RecordedClick,
  type RecordedFrame,
} from "./frame-step-detection";
import type { GatePost } from "./action-gate";

/** A frame-space element box, as the vision model would return it (960x540). */
function frameElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-1",
    name: "Submit button",
    type: "button",
    boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    center: { x: 125, y: 125 },
    confidence: 0.9,
    interactive: true,
    ...overrides,
  };
}

/**
 * A fake GatePost that answers /api/ai/describe-screen with one report per call,
 * in the order frames are posted, and records every (url, body) call it saw.
 */
function fakePost(
  reportsByCallIndex: Array<{ elements: unknown[] } | Error>,
): { post: GatePost; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  let callIndex = 0;
  const post: GatePost = async (url, body) => {
    calls.push({ url, body });
    const outcome = reportsByCallIndex[callIndex++];
    if (outcome instanceof Error) throw outcome;
    return { success: true, report: outcome };
  };
  return { post, calls };
}

function frame(image: string, time: number): RecordedFrame {
  return { image, time };
}

function click(x: number, y: number, timestamp: number): RecordedClick {
  return { x, y, timestamp, type: "click" };
}

function move(x: number, y: number, timestamp: number): RecordedClick {
  return { x, y, timestamp, type: "move" };
}

describe("detectStepsFromFrames", () => {
  it("posts each frame image to /api/ai/describe-screen exactly once, in order", async () => {
    const frames = [frame("frame-a", 0.2), frame("frame-b", 0.8)];
    const { post, calls } = fakePost([{ elements: [] }, { elements: [] }]);

    await detectStepsFromFrames(frames, [], { post });

    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual({ url: "/api/ai/describe-screen", body: { imageData: "frame-a" } });
    expect(calls[1]).toEqual({ url: "/api/ai/describe-screen", body: { imageData: "frame-b" } });
  });

  it("anchors a recorded click to the detected element's name, nearest-time frame, and recording-space coordinates", async () => {
    const frames = [frame("frame-a", 0.2), frame("frame-b", 0.8)];
    const element = frameElement({ name: "Save button" });
    // Nearest frame to a click at 0.75s is frame-b (time 0.8).
    const { post } = fakePost([{ elements: [] }, { elements: [element] }]);
    const clicks = [click(250, 250, 0.75)];

    const result = await detectStepsFromFrames(frames, clicks, { post });

    expect(result.status).toBe("detected");
    if (result.status !== "detected") throw new Error("expected detected");
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].x).toBe(250);
    expect(result.steps[0].y).toBe(250);
    expect(result.steps[0].name).toContain("Save button");
    expect(result.steps[0].screenshotUrl).toBe("frame-b");
  });

  it("never turns a move event into a step", async () => {
    const frames = [frame("frame-a", 0.2)];
    const element = frameElement();
    const { post } = fakePost([{ elements: [element] }]);
    const events = [move(250, 250, 0.2)];

    const result = await detectStepsFromFrames(frames, events, { post });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failed");
    expect(result.reason).toMatch(/no recorded clicks/i);
  });

  it("does not fabricate a step for a click that lands on no detected element", async () => {
    const frames = [frame("frame-a", 0.2)];
    const element = frameElement({ boundingBox: { x: 700, y: 700, width: 50, height: 50 } });
    const { post } = fakePost([{ elements: [element] }]);
    const clicks = [click(10, 10, 0.2)];

    const result = await detectStepsFromFrames(frames, clicks, { post });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failed");
    expect("steps" in result).toBe(false);
    expect(result.reason).toMatch(/recorded clicks|detected element/i);
  });

  it("fails with elementsDetected matching the model's element count when there are no recorded clicks", async () => {
    const frames = [frame("frame-a", 0.2), frame("frame-b", 0.8)];
    const elementsA = [frameElement({ id: "a1" })];
    const elementsB = [frameElement({ id: "b1" }), frameElement({ id: "b2" })];
    const { post } = fakePost([{ elements: elementsA }, { elements: elementsB }]);

    const result = await detectStepsFromFrames(frames, [], { post });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failed");
    expect(result.reason).toMatch(/no recorded clicks/i);
    expect(result.elementsDetected).toBe(3);
  });

  it("fails with a reason naming the error when post rejects for every frame", async () => {
    const frames = [frame("frame-a", 0.2), frame("frame-b", 0.8)];
    const { post } = fakePost([new Error("model offline"), new Error("model offline")]);
    const clicks = [click(10, 10, 0.2)];

    const result = await detectStepsFromFrames(frames, clicks, { post });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failed");
    expect(result.reason.startsWith("Vision analysis failed on every frame")).toBe(true);
    expect(result.reason).toContain("model offline");
  });

  it("fails with 'No recorded frames to analyze' when there are no frames", async () => {
    const { post } = fakePost([]);

    const result = await detectStepsFromFrames([], [click(10, 10, 0.2)], { post });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failed");
    expect(result.reason).toBe("No recorded frames to analyze");
  });
});

describe("sampleTimesFor", () => {
  it("returns [0.2, 0.8] for a 1.0s recording", () => {
    expect(sampleTimesFor(1.0)).toEqual([0.2, 0.8]);
  });

  it("returns [0.1] for a 0.1s recording that fits no sample time", () => {
    expect(sampleTimesFor(0.1)).toEqual([0.1]);
  });
});

describe("video-recording-breakdown-modal source", () => {
  it("no longer contains the hardcoded fallback synthesis", () => {
    const filePath = path.join(
      __dirname,
      "..",
      "components",
      "video-recording-breakdown-modal.tsx",
    );
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).not.toContain("synthesizeStepsFromMouseData");
    expect(source).not.toContain("x: 500, y: 32");
  });
});
