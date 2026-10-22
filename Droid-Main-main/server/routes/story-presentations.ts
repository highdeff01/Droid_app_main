import { Router, type RequestHandler } from "express";
import type { ReplayRun } from "@shared/replay";
import type { StruggleInputs } from "../struggle-detector";
import { detectStruggles } from "../struggle-detector";
import { generateStory, GenerationError, type ChatFn } from "../story-generator";
import { generatePresentation, type PageFetcher } from "../presentation-generator";

/** Story mode and presentations: Qwen-generated content, real records only, honest errors. */

export interface StoryPresentationDeps {
  chat: ChatFn;
  fetchPage: PageFetcher;
  listRuns: () => ReplayRun[];
  runImages: (id: string) => string[];
  /** Fix tasks and notes from the companion error ledger. */
  ledger: () => Pick<StruggleInputs, "tasks" | "notes">;
}

function sendError(res: Parameters<RequestHandler>[1], err: unknown) {
  const status = err instanceof GenerationError ? err.status : 500;
  res.status(status).json({ success: false, error: err instanceof Error ? err.message : String(err) });
}

export function createStoryPresentationHandlers(deps: StoryPresentationDeps) {
  const getRun = (id: string) => deps.listRuns().find((r) => r.id === id);
  const struggles = () => detectStruggles({ ...deps.ledger(), runs: deps.listRuns() });

  const story: RequestHandler = async (req, res) => {
    try {
      const result = await generateStory(req.body ?? {}, { chat: deps.chat, getRun, runImages: deps.runImages });
      res.json({ success: true, story: result });
    } catch (err) {
      sendError(res, err);
    }
  };

  const presentation: RequestHandler = async (req, res) => {
    try {
      const result = await generatePresentation(req.body ?? {}, {
        chat: deps.chat,
        fetchPage: deps.fetchPage,
        getRun,
        struggles,
      });
      res.json({ success: true, presentation: result });
    } catch (err) {
      sendError(res, err);
    }
  };

  const listStruggles: RequestHandler = (_req, res) => {
    try {
      res.json({ success: true, topics: struggles() });
    } catch (err) {
      sendError(res, err);
    }
  };

  const listRuns: RequestHandler = (_req, res) => {
    const runs = deps.listRuns()
      .filter((r) => r.status !== "running" && r.status !== "paused")
      .map(({ id, target, status, completed, total, startedAt, error }) => ({
        id, target, status, completed, total, startedAt, error,
      }));
    res.json({ success: true, runs });
  };

  return { story, presentation, listStruggles, listRuns };
}

/** Express router mounted at /api/ai. */
export function createStoryPresentationRouter(deps: StoryPresentationDeps): Router {
  const h = createStoryPresentationHandlers(deps);
  const router = Router();
  router.post("/story/generate", h.story);
  router.post("/presentations/generate", h.presentation);
  router.get("/presentations/struggles", h.listStruggles);
  router.get("/story/runs", h.listRuns);
  return router;
}
