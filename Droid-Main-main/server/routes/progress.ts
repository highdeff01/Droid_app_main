import { Router } from "express";
import { z } from "zod";
import { PROGRESS_KINDS, PROGRESS_LEVELS, type ProgressEventInput } from "../../shared/progress";
import type { PresentationDrafts } from "../presentation-drafts";
import type { ProgressStream } from "../progress-stream";

const cursorSchema = z.coerce.number().int().min(0).default(0);

const publishSchema = z.object({
  kind: z.enum(PROGRESS_KINDS),
  level: z.enum(PROGRESS_LEVELS).optional(),
  title: z.string().min(1).max(300),
  detail: z.string().max(4000).default(""),
  operationId: z.string().max(200).optional(),
  status: z.string().max(60).optional(),
  logs: z.array(z.string()).max(50).optional(),
  // Non-PNG/JPEG values are stripped by the stream itself (same rule as notes).
  screenshot: z.string().max(8_000_000).optional(),
});

/** The unified progress stream (poll with ?since= or SSE) every tab subscribes to. */
export function createProgressRouter(stream: ProgressStream) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", (req, res) => {
    const since = cursorSchema.safeParse(req.query.since);
    if (!since.success) return res.status(400).json({ success: false, error: "since must be a non-negative integer" });
    res.json({ success: true, ...stream.since(since.data) });
  });
  router.get("/stream", (req, res) => {
    const detach = stream.attachSse(res, cursorSchema.catch(0).parse(req.query.since));
    req.on("close", detach);
  });
  // Client-side flows (gate, turn loop, HUD) report their progress here.
  router.post("/", (req, res) => {
    const body = publishSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.message });
    res.status(201).json({ success: true, event: stream.publish(body.data as ProgressEventInput) });
  });
  return router;
}

/** Background presentation drafts; /current is what the HUD Presentation button opens. */
export function createPresentationsRouter(drafts: PresentationDrafts) {
  const router = Router();
  router.get("/", (_req, res) => res.json({ success: true, presentations: drafts.list() }));
  router.get("/current", (_req, res) => {
    const presentation = drafts.current();
    res
      .status(presentation ? 200 : 404)
      .json(presentation ? { success: true, presentation } : { success: false, error: "No operation has run yet" });
  });
  router.get("/:id", (req, res) => {
    const presentation = drafts.get(req.params.id);
    res
      .status(presentation ? 200 : 404)
      .json(presentation ? { success: true, presentation } : { success: false, error: "No presentation for that operation" });
  });
  return router;
}
