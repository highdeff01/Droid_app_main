import { describe, it, expect, vi, beforeEach } from "vitest";

import { createStoryPresentationHandlers, type StoryPresentationDeps } from "./story-presentations";
import type { ReplayRun } from "@shared/replay";
import type { FixTask, CompanionNote } from "@shared/companion";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
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
    events: [{ id: "e1", at: 1000, phase: "execution", detail: "did a thing" }],
    startedAt: 0,
    ...overrides,
  };
}

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

function makeDeps(overrides: Partial<StoryPresentationDeps> = {}): StoryPresentationDeps {
  return {
    chat: vi.fn(),
    fetchPage: vi.fn(),
    listRuns: vi.fn().mockReturnValue([]),
    runImages: vi.fn().mockReturnValue([]),
    ledger: vi.fn().mockReturnValue({ tasks: [], notes: [] as CompanionNote[] }),
    ...overrides,
  };
}

describe("createStoryPresentationHandlers", () => {
  let deps: StoryPresentationDeps;
  let handlers: ReturnType<typeof createStoryPresentationHandlers>;

  beforeEach(() => {
    deps = makeDeps();
    handlers = createStoryPresentationHandlers(deps);
  });

  describe("story handler", () => {
    it("returns 200 with the generated story on a mocked chat success", async () => {
      (deps.chat as any).mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          title: "A tale",
          scenes: [{ title: "S1", narrativeDescription: "d", decisionTurn: "t", predictedNextTurn: "n" }],
        }),
        endpoint: "e",
      });
      const res = makeRes();

      await handlers.story({ body: { source: "premise", text: "a hero" } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.story.scenes).toHaveLength(1);
    });

    it("returns 400 for an invalid body", async () => {
      const res = makeRes();

      await handlers.story({ body: { source: "premise" } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 502 when chat fails", async () => {
      (deps.chat as any).mockResolvedValueOnce({ success: false, error: "down" });
      const res = makeRes();

      await handlers.story({ body: { source: "premise", text: "a hero" } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(502);
      expect(res.body.success).toBe(false);
    });
  });

  describe("presentation handler", () => {
    it("returns 200 with the generated presentation on success", async () => {
      (deps.chat as any).mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({ title: "P", slides: [{ title: "S1", bullets: ["a"] }] }),
        endpoint: "e",
      });
      const res = makeRes();

      await handlers.presentation({ body: { kind: "user", text: "content" } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.presentation.slides).toHaveLength(1);
    });

    it("returns 404 for an unknown teach topic", async () => {
      const res = makeRes();

      await handlers.presentation({ body: { kind: "teach", topicId: "missing" } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("listStruggles", () => {
    it("returns success:true with topics computed from ledger data", () => {
      (deps.ledger as any).mockReturnValue({
        tasks: [
          fixTask({ id: "t1", failedStep: { name: "Repeat step" } }),
          fixTask({ id: "t2", failedStep: { name: "Repeat step" } }),
        ],
        notes: [],
      });
      const res = makeRes();

      handlers.listStruggles({} as any, res as any, vi.fn());

      expect(res.body.success).toBe(true);
      expect(res.body.topics).toHaveLength(1);
      expect(res.body.topics[0].occurrences).toBe(2);
    });
  });

  describe("listRuns", () => {
    it("returns success:true with the runs from listRuns", () => {
      (deps.listRuns as any).mockReturnValue([run()]);
      const res = makeRes();

      handlers.listRuns({} as any, res as any, vi.fn());

      expect(res.body.success).toBe(true);
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.runs[0].id).toBe("run1");
    });
  });
});
