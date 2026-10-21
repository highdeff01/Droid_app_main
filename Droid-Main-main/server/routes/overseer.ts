import { Router, type Response } from "express";
import { z } from "zod";
import {
  OPERATION_KINDS,
  type DriftMeasure,
  type OperationRegistrationInput,
  type OperationStepReport,
} from "../../shared/overseer";
import { centralLogHub } from "../log-hub";
import type { OverseerSupervisor } from "../overseer/supervisor";

const region = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const registerSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  kind: z.enum(OPERATION_KINDS),
  source: z.string().min(1).max(200),
  goal: z.string().min(1).max(2000),
  region: region.optional(),
  priority: z.number().int().min(-10).max(10).optional(),
  caps: z
    .object({
      maxIterations: z.number().int().positive().nullable(),
      maxDurationMs: z.number().int().positive().nullable(),
      maxRepeats: z.number().int().positive().nullable(),
    })
    .partial()
    .optional(),
});

const stepSchema = z.object({
  report: z.object({
    stepId: z.string().min(1).max(200),
    name: z.string().min(1).max(500),
    action: z.string().min(1).max(60),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    text: z.string().max(4000).optional(),
    expectation: z.string().max(2000).optional(),
    region: region.optional(),
    executorVerified: z.boolean().nullable().optional(),
    beforeImage: z.string().max(8_000_000).optional(),
  }),
  /** Measured by the client pixel-diff engine; omitted when not measured. */
  drift: z
    .object({ identical: z.boolean(), diffPercent: z.number().min(0).max(100).nullable(), method: z.literal("pixel") })
    .optional(),
});

const finishSchema = z.object({
  status: z.enum(["completed", "failed", "cancelled"]),
  detail: z.string().max(2000).optional(),
});

const proposeSchema = z.object({
  kind: z.enum(["queue", "deprioritize", "replan"]),
  reason: z.string().min(1).max(1000),
  proposal: z.string().max(4000).optional(),
});

const decideSchema = z.object({ approved: z.boolean() });

function fail(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof z.ZodError ? 400 : message.includes("not found") ? 404 : 409;
  res.status(status).json({ success: false, error: message });
}

/** /api/overseer: the overseer console's view of every supervised operation, and its controls. */
export function createOverseerRouter(supervisor: OverseerSupervisor): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/", (_req, res) => res.json({ success: true, ...supervisor.snapshot() }));

  router.get("/summary", (_req, res) => res.json({ success: true, summary: supervisor.summary() }));

  router.get("/audit", (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const level = typeof req.query.level === "string" ? req.query.level : undefined;
    res.json({ success: true, entries: centralLogHub.getLogs(limit, "Overseer", level) });
  });

  router.post("/operations", (req, res) => {
    try {
      const input = registerSchema.parse(req.body) as OperationRegistrationInput;
      res.status(201).json({ success: true, operation: supervisor.register(input) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/operations/:id/steps", async (req, res) => {
    try {
      const { report, drift } = stepSchema.parse(req.body);
      const verdict = await supervisor.reportStep(req.params.id, report as OperationStepReport, drift as DriftMeasure | undefined);
      res.json({ success: true, verdict, directive: supervisor.get(req.params.id)?.directive });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/operations/:id/finish", (req, res) => {
    try {
      const { status, detail } = finishSchema.parse(req.body);
      supervisor.finish(req.params.id, status, detail);
      res.json({ success: true, operation: supervisor.get(req.params.id) ?? null });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/operations/:id/pause", (req, res) => {
    try {
      res.json({ success: true, intervention: supervisor.pauseOperation(req.params.id, "Paused by the user from the overseer console.") });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/operations/:id/resume", (req, res) => {
    try {
      res.json({ success: true, operation: supervisor.resumeOperation(req.params.id) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/operations/:id/checkup", async (req, res) => {
    try {
      res.json({ success: true, checkup: await supervisor.runCheckup(req.params.id) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/operations/:id/propose", (req, res) => {
    try {
      const { kind, reason, proposal } = proposeSchema.parse(req.body);
      res.json({ success: true, intervention: supervisor.propose(req.params.id, kind, reason, proposal) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/interventions/:id/decide", (req, res) => {
    try {
      const { approved } = decideSchema.parse(req.body);
      res.json({ success: true, intervention: supervisor.decide(req.params.id, approved) });
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
