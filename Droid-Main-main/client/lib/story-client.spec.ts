import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRecentRuns,
  fetchStruggles,
  generatePresentation,
  generateStory,
  sceneActionPlan,
} from "./story-client";

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("story-client requests", () => {
  it("posts the story request and returns the story", async () => {
    const story = { title: "T", source: "premise", scenes: [], createdAt: "now" };
    const fetchMock = mockFetch({ success: true, story });
    await expect(generateStory({ source: "premise", text: "a dragon" })).resolves.toEqual(story);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/story/generate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ source: "premise", text: "a dragon" });
  });

  it("throws the server error on success:false", async () => {
    mockFetch({ success: false, error: "Qwen unavailable" }, 502);
    await expect(generatePresentation({ kind: "user", text: "x" })).rejects.toThrow("Qwen unavailable");
  });

  it("throws when the reply is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => { throw new Error("bad"); } }));
    await expect(fetchStruggles()).rejects.toThrow("HTTP 500");
  });

  it("GETs struggles and runs", async () => {
    const fetchMock = mockFetch({ success: true, topics: [{ id: "a" }], runs: [{ id: "r1" }] });
    await expect(fetchStruggles()).resolves.toEqual([{ id: "a" }]);
    await expect(fetchRecentRuns()).resolves.toEqual([{ id: "r1" }]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/ai/presentations/struggles", "/api/ai/story/runs"]);
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });
});

describe("sceneActionPlan", () => {
  it("gates the scene point and posts a type action to /api/execute-task", async () => {
    const fetchMock = mockFetch({ success: true, executed: true });
    const [action] = sceneActionPlan({ actionType: "type", x: 40, y: 50, payload: "hello", description: "Type greeting" });
    expect(action.target).toMatchObject({ x: 40, y: 50 });
    await action.dispatch();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/execute-task");
    const body = JSON.parse(init.body);
    expect(body.targetDevice).toBe("desktop");
    expect(body.task).toMatchObject({ action: "type_text", targetPosition: { x: 40, y: 50 }, textPayload: "hello" });
  });

  it.each([
    ["click", "click"],
    ["hotkey", "press_key"],
    ["scroll", "scroll"],
  ] as const)("maps %s to %s", async (actionType, expected) => {
    const fetchMock = mockFetch({ success: true });
    await sceneActionPlan({ actionType, x: 1, y: 2, payload: "Enter", description: "d" })[0].dispatch();
    const task = JSON.parse(fetchMock.mock.calls[0][1].body).task;
    expect(task.action).toBe(expected);
    if (actionType === "hotkey") expect(task.keyPayload).toBe("Enter");
  });
});
