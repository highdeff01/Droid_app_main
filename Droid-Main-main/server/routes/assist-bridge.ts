import { Router, type Response } from "express";
import { z } from "zod";
import {
  ASSIST_REQUEST_KINDS,
  createFilePayloadSchema,
  runScriptPayloadSchema,
  takeoverStepPayloadSchema,
  type AssistRequestKind,
} from "../../shared/assist-bridge";
import type { AssistBridgeService } from "../assist-bridge/service";
import { settingsUpdateSchema } from "../assist-bridge/service";

const killSwitchSchema = z.object({ tripped: z.boolean() });
const requestSchema = z.object({
  kind: z.enum(ASSIST_REQUEST_KINDS as [AssistRequestKind, ...AssistRequestKind[]]),
  params: z.unknown().optional(),
});
const automationSchema = z
  .object({ monitoring: z.boolean(), autoAssist: z.boolean(), autoTakeover: z.boolean() })
  .partial()
  .strict();
const problemSchema = z.object({ message: z.string().trim().min(1).max(4000), source: z.string().max(200).default("main-ui") });

function issues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

function fail(res: Response, status: number, err: unknown) {
  res.status(status).json({ success: false, error: err instanceof Error ? err.message : String(err) });
}

/** Parses the body with the schema; answers 400 and returns null when it does not fit. */
function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown, res: Response): z.infer<S> | null {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  res.status(400).json({ success: false, error: issues(parsed.error) });
  return null;
}

/** /api/assist-bridge: status, settings and kill switch, plus the v2 requests, steps, handoffs and monitor. */
export function createAssistBridgeRouter(bridge: AssistBridgeService): Router {
  const router = Router();
  router.get("/status", (_req, res) => {
    res.json({ success: true, status: bridge.status() });
  });
  router.post("/settings", async (req, res) => {
    const parsed = settingsUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    res.json({ success: true, status: await bridge.updateSettings(parsed.data) });
  });
  router.post("/kill-switch", (req, res) => {
    const parsed = killSwitchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Body must be { tripped: boolean }" });
      return;
    }
    res.json({ success: true, status: bridge.setKillSwitch(parsed.data.tripped) });
  });
  registerV2Routes(router, bridge);
  return router;
}

function registerV2Routes(router: Router, bridge: AssistBridgeService) {
  router.post("/requests", async (req, res) => {
    const body = parseBody(requestSchema, req.body, res);
    if (!body) return;
    try {
      const record = await bridge.request(body.kind, body.params);
      res.status(record.status === "ok" ? 200 : 502).json({ success: record.status === "ok", request: record, error: record.error });
    } catch (err) {
      fail(res, 400, err);
    }
  });
  router.get("/requests", (_req, res) => res.json({ success: true, requests: bridge.requests.list() }));
  router.get("/inbox", (_req, res) => res.json({ success: true, inbox: bridge.requests.inbox() }));
  router.get("/steps", (_req, res) => res.json({ success: true, steps: bridge.steps.list() }));
  router.get("/handoffs", (_req, res) => res.json({ success: true, handoffs: bridge.steps.handoffs() }));
  router.post("/steps/:stepId/takeover", async (req, res) => {
    try {
      res.json({ success: true, handoff: await bridge.steps.takeoverIncomplete(req.params.stepId) });
    } catch (err) {
      fail(res, 404, err);
    }
  });
  router.post("/takeover", async (req, res) => {
    const body = parseBody(takeoverStepPayloadSchema, req.body, res);
    if (!body) return;
    const handoff = await bridge.steps.takeover(body, "main");
    res.status(handoff.outcome === "completed" ? 200 : 502).json({ success: handoff.outcome === "completed", handoff, error: handoff.detail });
  });
  router.post("/run-script", async (req, res) => {
    const body = parseBody(runScriptPayloadSchema, req.body, res);
    if (!body) return;
    try {
      const result = await bridge.runner.run(body.steps);
      res.status(result.completed ? 200 : 502).json({ success: result.completed, result, error: result.stoppedReason });
    } catch (err) {
      fail(res, 409, err);
    }
  });
  router.post("/files", async (req, res) => {
    const body = parseBody(createFilePayloadSchema, req.body, res);
    if (!body) return;
    try {
      res.json({ success: true, file: await bridge.createFile(body) });
    } catch (err) {
      fail(res, 400, err);
    }
  });
  router.get("/monitor", (_req, res) => res.json({ success: true, monitor: bridge.monitor.status() }));
  router.post("/monitor", (req, res) => {
    const body = parseBody(automationSchema, req.body, res);
    if (body) res.json({ success: true, monitor: bridge.monitor.configure(body) });
  });
  router.post("/monitor/problem", async (req, res) => {
    const body = parseBody(problemSchema, req.body, res);
    if (body) res.json({ success: true, problem: await bridge.monitor.problem(body.message, body.source) });
  });
}
