import { describe, it, expect, vi, beforeEach } from "vitest";

import { generateStory, parseStory, type StoryDeps } from "./story-generator";
import type { ReplayRun } from "@shared/replay";
import type { StoryGenerateRequest } from "@shared/story";

const SCREENSHOT = "data:image/png;base64,AAAA";
const PREMISE_REQUEST: StoryGenerateRequest = { source: "premise", text: "A hero rises" };
const TOPIC_REQUEST: StoryGenerateRequest = { source: "topic", text: "Dragons and deadlines" };
const SCREEN_REQUEST: StoryGenerateRequest = { source: "screen", imageData: SCREENSHOT };

function storyContent(scenes: any[], title = "Untitled"): string {
  return JSON.stringify({ title, scenes });
}

function makeDeps(): StoryDeps {
  return {
    chat: vi.fn(),
    getRun: vi.fn(),
    runImages: vi.fn().mockReturnValue([]),
  };
}

function makeRun(overrides: Partial<ReplayRun> = {}): ReplayRun {
  return {
    id: "run1",
    target: "app",
    status: "completed",
    currentStep: 1,
    iteration: 1,
    completed: 1,
    total: 1,
    steps: [{ id: "s1", status: "completed" }],
    events: [{ id: "e1", at: 1000, phase: "execution", detail: "did a thing" }],
    startedAt: 0,
    ...overrides,
  };
}

describe("generateStory", () => {
  let deps: StoryDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("calls chat once and returns scenes without inAppAction for a premise request", async () => {
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: storyContent([
        {
          title: "Scene 1",
          narrativeDescription: "desc",
          decisionTurn: "turn",
          predictedNextTurn: "next",
          inAppAction: { actionType: "click", x: 1, y: 2, description: "d" },
        },
      ]),
      endpoint: "e",
    });

    const result = await generateStory(PREMISE_REQUEST, deps);

    expect(deps.chat).toHaveBeenCalledTimes(1);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]).toMatchObject({
      title: "Scene 1",
      narrativeDescription: "desc",
      decisionTurn: "turn",
      predictedNextTurn: "next",
      backgroundImage: null,
    });
    expect(result.scenes[0].inAppAction).toBeUndefined();
  });

  it("calls chat once and returns scenes without inAppAction for a topic request", async () => {
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: storyContent([
        {
          title: "Scene 1",
          narrativeDescription: "desc",
          decisionTurn: "turn",
          predictedNextTurn: "next",
          inAppAction: { actionType: "click", x: 1, y: 2, description: "d" },
        },
      ]),
      endpoint: "e",
    });

    const result = await generateStory(TOPIC_REQUEST, deps);

    expect(deps.chat).toHaveBeenCalledTimes(1);
    expect(result.scenes[0]).toMatchObject({ backgroundImage: null });
    expect(result.scenes[0].inAppAction).toBeUndefined();
  });

  it("uses the screenshot as every scene background and keeps a valid inAppAction", async () => {
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: storyContent([
        { title: "S1", narrativeDescription: "a", decisionTurn: "d", predictedNextTurn: "n" },
        {
          title: "S2",
          narrativeDescription: "b",
          decisionTurn: "d",
          predictedNextTurn: "n",
          inAppAction: { actionType: "click", x: 10, y: 20, description: "tap it" },
        },
      ]),
      endpoint: "e",
    });

    const result = await generateStory(SCREEN_REQUEST, deps);

    for (const scene of result.scenes) {
      expect(scene.backgroundImage).toBe(SCREENSHOT);
    }
    expect(result.scenes[1].inAppAction).toMatchObject({ actionType: "click", x: 10, y: 20, description: "tap it" });
  });

  it("uses runImages as scene backgrounds when the run has frames", async () => {
    (deps.getRun as any).mockReturnValue(makeRun());
    (deps.runImages as any).mockReturnValue(["data:image/png;base64,FRAME"]);
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: storyContent([
        { title: "S1", narrativeDescription: "a", decisionTurn: "d", predictedNextTurn: "n" },
        { title: "S2", narrativeDescription: "b", decisionTurn: "d", predictedNextTurn: "n" },
      ]),
      endpoint: "e",
    });

    const result = await generateStory({ source: "run", runId: "run1" }, deps);

    for (const scene of result.scenes) {
      expect(scene.backgroundImage).toBe("data:image/png;base64,FRAME");
    }
  });

  it("leaves scene backgrounds null when the run has no frames", async () => {
    (deps.getRun as any).mockReturnValue(makeRun());
    (deps.runImages as any).mockReturnValue([]);
    (deps.chat as any).mockResolvedValueOnce({
      success: true,
      content: storyContent([{ title: "S1", narrativeDescription: "a", decisionTurn: "d", predictedNextTurn: "n" }]),
      endpoint: "e",
    });

    const result = await generateStory({ source: "run", runId: "run1" }, deps);

    expect(result.scenes[0].backgroundImage).toBeNull();
  });

  it("rejects with 404 for an unknown run", async () => {
    (deps.getRun as any).mockReturnValue(undefined);

    await expect(generateStory({ source: "run", runId: "missing" }, deps)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 409 for a run still in progress", async () => {
    (deps.getRun as any).mockReturnValue(makeRun({ status: "running" }));

    await expect(generateStory({ source: "run", runId: "run1" }, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 400 when a premise request has no text", async () => {
    await expect(generateStory({ source: "premise" }, deps)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 when a screen request has no screenshot", async () => {
    await expect(generateStory({ source: "screen" }, deps)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 502 when chat reports failure", async () => {
    (deps.chat as any).mockResolvedValueOnce({ success: false, error: "down" });

    await expect(generateStory(PREMISE_REQUEST, deps)).rejects.toMatchObject({ status: 502 });
  });

  it("rejects with 502 when the model reply is not JSON", async () => {
    (deps.chat as any).mockResolvedValueOnce({ success: true, content: "not json at all", endpoint: "e" });

    await expect(generateStory(PREMISE_REQUEST, deps)).rejects.toMatchObject({ status: 502 });
  });

  it("rejects with 502 when the model returns no usable scenes", async () => {
    (deps.chat as any).mockResolvedValueOnce({ success: true, content: storyContent([]), endpoint: "e" });

    await expect(generateStory(PREMISE_REQUEST, deps)).rejects.toMatchObject({ status: 502 });
  });
});

describe("parseStory", () => {
  it("normalizes an out-of-range scene perspective to one of the three valid values", () => {
    const result = parseStory(
      storyContent([{ narrativeDescription: "x", perspective: "bogus" }]),
      { source: "premise", text: "t" },
      { backgrounds: [], allowActions: false },
    );

    expect(["user_viewpoint", "ai_agent_viewpoint", "environment_viewpoint"]).toContain(result.scenes[0].perspective);
  });
});
