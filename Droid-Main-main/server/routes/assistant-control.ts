import { Router } from "express";
import { z } from "zod";
import { matchTargetElement } from "../../shared/assistant-control";
import type { DetectedUIElement, ScreenPerceptionReport } from "../ai-perception-engine";
import type { CaptureResult } from "../capture-frame";
import type { ScreenMonitor } from "../screen-monitor";

export interface UseCommandDeps {
  readFrame: () => Promise<CaptureResult>;
  perceive: (imageData: string) => Promise<ScreenPerceptionReport>;
  execute: (body: Record<string, unknown>) => Promise<{ success: boolean; executed?: boolean; error?: string; [key: string]: unknown }>;
}

export interface UseCommandResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

const useBody = z.object({ target: z.string().trim().min(1).max(200) });
const monitorBody = z.object({ mode: z.enum(["background", "advanced", "off"]) });

const elementSummary = (el: DetectedUIElement) => ({
  name: el.name,
  type: el.type,
  center: el.center,
  confidence: el.confidence,
});

/** /use: capture the live screen, locate the named target, then click it through the input bridge. */
export async function runUseCommand(target: string, deps: UseCommandDeps): Promise<UseCommandResult> {
  const frame = await deps.readFrame();
  if (frame.status === "standby")
    return { httpStatus: 503, body: { success: false, stage: "capture", target, error: frame.message } };
  const report = await deps.perceive(frame.imageData);
  if (report.simulated)
    return {
      httpStatus: 502,
      body: { success: false, stage: "perception", target, error: report.simulationReason || report.screenDescription },
    };
  const element = matchTargetElement(target, report.elements);
  if (!element)
    return {
      httpStatus: 404,
      body: {
        success: false,
        stage: "resolve",
        target,
        error: `"${target}" was not found on the live screen`,
        candidates: report.elements.map((el) => el.name),
      },
    };
  const outcome = await deps.execute({
    action: "click",
    x: element.center.x,
    y: element.center.y,
    origin: "use_command",
  });
  return {
    httpStatus: outcome.success ? 200 : 502,
    body: {
      ...outcome,
      stage: "execute",
      target,
      element: elementSummary(element),
      frameSource: frame.source,
    },
  };
}

/** Assistant control routes: /use and the background/advanced screen monitor. */
export function createAssistantControlRouter(deps: UseCommandDeps, monitor: ScreenMonitor) {
  const router = Router();

  router.post("/use", async (req, res) => {
    const parsed = useBody.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, error: "Usage: /use <target>", issues: parsed.error.issues });
    try {
      const result = await runUseCommand(parsed.data.target, deps);
      res.status(result.httpStatus).json(result.body);
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/monitor", (_req, res) => res.json({ success: true, monitor: monitor.status() }));

  router.post("/monitor", (req, res) => {
    const parsed = monitorBody.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, error: "mode must be background, advanced or off" });
    const status = parsed.data.mode === "off" ? monitor.stop() : monitor.start(parsed.data.mode);
    res.json({ success: true, monitor: status });
  });

  router.get("/monitor/frames", (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 40);
    res.json({ success: true, monitor: monitor.status(), frames: monitor.recentFrames(limit) });
  });

  return router;
}
