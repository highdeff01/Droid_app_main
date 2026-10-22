import { describe, it, expect } from "vitest";

import { detectStruggles, STRUGGLE_THRESHOLD } from "./struggle-detector";
import type { CompanionNote, FixTask } from "@shared/companion";
import type { ReplayRun } from "@shared/replay";

function fixTask(overrides: Partial<FixTask> = {}): FixTask {
  return {
    id: "task1",
    title: "fix it",
    source: "replay",
    error: "step blew up",
    status: "open",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function note(overrides: Partial<CompanionNote> = {}): CompanionNote {
  return {
    id: "note1",
    category: "event",
    title: "Something failed",
    content: "it failed",
    tags: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<ReplayRun> = {}): ReplayRun {
  return {
    id: "run1",
    target: "app",
    status: "completed",
    currentStep: 1,
    iteration: 1,
    completed: 1,
    total: 1,
    steps: [{ id: "s1", status: "completed" }],
    events: [],
    startedAt: 0,
    ...overrides,
  };
}

describe("detectStruggles", () => {
  it("groups the same failed step across two fix tasks into one topic with occurrences 2", () => {
    const tasks = [
      fixTask({ id: "t1", failedStep: { name: "Submit CAPTCHA" } }),
      fixTask({ id: "t2", failedStep: { name: "Submit CAPTCHA" } }),
    ];

    const topics = detectStruggles({ tasks, notes: [], runs: [] });

    expect(topics).toHaveLength(1);
    expect(topics[0].occurrences).toBe(2);
  });

  it("does not return a topic with a single occurrence below STRUGGLE_THRESHOLD", () => {
    expect(STRUGGLE_THRESHOLD).toBeGreaterThan(1);
    const tasks = [fixTask({ failedStep: { name: "Rare step" } })];

    const topics = detectStruggles({ tasks, notes: [], runs: [] });

    expect(topics).toHaveLength(0);
  });

  it("does not double count error notes already linked to a task by noteId", () => {
    const tasks = [
      fixTask({ id: "t1", noteId: "note1", failedStep: { name: "Login step" } }),
      fixTask({ id: "t2", failedStep: { name: "Login step" } }),
    ];
    const notes = [note({ id: "note1", title: "Login step", event: "error" })];

    const topics = detectStruggles({ tasks, notes, runs: [] });

    expect(topics).toHaveLength(1);
    expect(topics[0].occurrences).toBe(2);
  });

  it("counts unlinked error/workflow_failed notes", () => {
    const notes = [
      note({ id: "n1", title: "Timeout issue", event: "error" }),
      note({ id: "n2", title: "Timeout issue", event: "workflow_failed" }),
    ];

    const topics = detectStruggles({ tasks: [], notes, runs: [] });

    expect(topics).toHaveLength(1);
    expect(topics[0].occurrences).toBe(2);
  });

  it("counts replay events with attempt greater than 1 for the same stepId as retries", () => {
    const runs = [
      run({
        events: [
          { id: "e1", at: 1, stepId: "s1", attempt: 2, phase: "execution", detail: "retry 1" },
          { id: "e2", at: 2, stepId: "s1", attempt: 3, phase: "execution", detail: "retry 2" },
        ],
      }),
    ];

    const topics = detectStruggles({ tasks: [], notes: [], runs });

    expect(topics).toHaveLength(1);
    expect(topics[0].occurrences).toBe(2);
  });

  it("ranks topics by occurrences descending", () => {
    const tasks = [
      fixTask({ id: "a1", failedStep: { name: "Minor step" } }),
      fixTask({ id: "a2", failedStep: { name: "Minor step" } }),
      fixTask({ id: "b1", failedStep: { name: "Major step" } }),
      fixTask({ id: "b2", failedStep: { name: "Major step" } }),
      fixTask({ id: "b3", failedStep: { name: "Major step" } }),
    ];

    const topics = detectStruggles({ tasks, notes: [], runs: [] });

    expect(topics[0].label).toBe("Major step");
    expect(topics[0].occurrences).toBe(3);
    expect(topics[1].label).toBe("Minor step");
    expect(topics[1].occurrences).toBe(2);
  });
});
