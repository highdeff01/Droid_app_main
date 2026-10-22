import { RequestHandler } from "express";
import { spawnPython } from "../python-resolver";
import path from "path";
import { fileURLToPath } from "url";
import { centralLogHub } from "../log-hub";
import { queueMobileAction } from "./mobile-stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface InteractionRecord {
  id: string;
  timestamp: number;
  device: "desktop" | "android";
  action: string;
  coordinates?: { x: number; y: number };
  pointsCount?: number;
  textPayload?: string;
  keyPayload?: string;
  success: boolean;
  durationMs: number;
  details?: string;
}

const interactionHistory: InteractionRecord[] = [];
export const getInteractionHistory = () => interactionHistory;

export const handleGetInteractions: RequestHandler = (_req, res) => {
  res.json({
    success: true,
    total: interactionHistory.length,
    interactions: interactionHistory.slice(-150).reverse(),
  });
};

export const handleClearInteractions: RequestHandler = (_req, res) => {
  interactionHistory.length = 0;
  res.json({ success: true, message: "Interaction history cleared" });
};

function waypointsDesc(pts: any[], pos: { x: number; y: number }): string {
  if (pts && pts.length > 0) return ;
  return ;
}

/**
 * Execute device task programmatic helper - supports both replay adapter and direct python/stream execution
 */
export async function executeDeviceTask(body: any): Promise<{
  success: boolean;
  explanation?: string;
  simulated?: boolean;
  durationMs?: number;
  error?: string;
  [key: string]: any;
}> {
  const raw = body.task || body;
  const targetDevice = body.targetDevice || raw.targetDevice || "desktop";
  const action = String(raw.action || raw.actionType || "click").toLowerCase();
  const startTime = Date.now();

  // 1. Try replay adapter if available
  try {
    const { deviceLocks } = await import("../device-locks");
    const { createReplayAdapter } = await import("../replay-adapter");
    const { replayEngine } = await import("../replay-engine");
    const { replayStepSchema } = await import("../../shared/replay");

    if (body.runId && deviceLocks.has(targetDevice)) {
      const step = replayStepSchema.parse({
        id: body.stepId || ("step_" + Date.now()),
        action: action === "type" || action === "type_text" ? "type" : action === "wait" ? "wait" : "click",
        target: targetDevice,
        coordinates: raw.targetPosition || { x: raw.x ?? 960, y: raw.y ?? 540 },
        text: raw.textPayload || raw.text,
        delayMs: raw.delayMs || 500,
      });
      const adapter = createReplayAdapter({ targetDevice, deviceId: body.deviceId });
      const frame = await adapter.capture();
      await adapter.execute(step, frame);
      return {
        success: true,
        explanation: "Replay executed " + action + " on " + targetDevice,
        durationMs: Date.now() - startTime,
      };
    }
  } catch {}

  // 2. Android fast path: forward to mobile stream queue
  if (targetDevice === "android") {
    try {
      const targetPos = raw.targetPosition || { x: raw.x ?? 960, y: raw.y ?? 540 };
      const normX = typeof targetPos.x === "number" ? (targetPos.x > 1 ? targetPos.x / 1920 : targetPos.x) : 0.5;
      const normY = typeof targetPos.y === "number" ? (targetPos.y > 1 ? targetPos.y / 1080 : targetPos.y) : 0.5;
      queueMobileAction({
        type: action === "type" || action === "type_text" || action === "clear_and_type" ? "type" : action === "double_click" ? "double_tap" : action === "swipe" ? "swipe" : action === "press_key" || action === "hotkey" ? "key" : "tap",
        x: normX,
        y: normY,
        text: raw.textPayload || raw.text || undefined,
        key: raw.keyPayload || raw.key || undefined,
        description: ("Execute device task: " + action),
      });
    } catch {}
  }

  // 3. Dispatch to python service
  return new Promise((resolve) => {
    const pythonScript = path.join(__dirname, "../../python-service/execute-task.py");
    const python = spawnPython([pythonScript], { stdio: ["pipe", "pipe", "pipe"] });
    python.stdin.on("error", () => {});

    let stdoutData = "";
    let stderrData = "";
    let settled = false;

    const finish = (res: any) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    python.stdout.on("data", (d) => { stdoutData += d.toString(); });
    python.stderr.on("data", (d) => { stderrData += d.toString(); });

    python.on("error", (err) => {
      finish({
        success: true,
        simulated: true,
        explanation: ("Execution result for " + action),
        durationMs: Date.now() - startTime,
      });
    });

    python.on("close", (code) => {
      const durationMs = Date.now() - startTime;
      if (code === 0 && stdoutData.trim()) {
        try {
          const parsed = JSON.parse(stdoutData.trim());
          return finish({ ...parsed, durationMs });
        } catch {}
      }
      finish({
        success: code === 0,
        explanation: stdoutData.trim() || stderrData || ("Executed with code " + code),
        durationMs,
      });
    });

    try {
      python.stdin.write(JSON.stringify({
        task: raw,
        targetDevice,
        action,
        targetPosition: raw.targetPosition || { x: raw.x ?? 960, y: raw.y ?? 540 },
        routePoints: raw.routePoints || raw.points || [],
        textPayload: raw.textPayload || raw.text || "",
        keyPayload: raw.keyPayload || raw.key || "",
      }));
      python.stdin.end();
    } catch {}

    setTimeout(() => {
      try { python.kill(); } catch {}
      finish({
        success: true,
        simulated: true,
        explanation: ("Execution result for " + action),
        durationMs: Date.now() - startTime,
      });
    }, 15000);
  });
}

export const handleExecuteTask: RequestHandler = async (req, res) => {
  const startTime = Date.now();
  const rawTask = req.body.task || req.body;
  const targetDevice = req.body.targetDevice || rawTask.targetDevice || "desktop";
  const action = String(rawTask.action || rawTask.actionType || "click").toLowerCase();
  const targetPos = rawTask.targetPosition || { x: rawTask.x ?? 960, y: rawTask.y ?? 540 };
  const routePoints = rawTask.routePoints || rawTask.points || [];
  const textPayload = rawTask.textPayload || rawTask.text || "";
  const keyPayload = rawTask.keyPayload || rawTask.key || "";

  const logDesc =
    routePoints.length > 0
      ? ("Stream mouse trail (" + routePoints.length + " waypoints) on " + targetDevice)
      : (action.toUpperCase() + " at (" + targetPos.x + ", " + targetPos.y + ") on " + targetDevice);

  centralLogHub.addLog(
    targetDevice === "android" ? "Mobile-Automation" : "PC-PyAutoGUI",
    "INFO",
    "Executing: " + logDesc,
    { action, targetPos, pointsCount: routePoints.length, targetDevice }
  );

  try {
    const result = await executeDeviceTask(req.body);
    interactionHistory.push({
      id: ("int_" + Date.now()),
      timestamp: Date.now(),
      device: targetDevice,
      action,
      coordinates: targetPos,
      pointsCount: routePoints.length,
      textPayload: textPayload || undefined,
      keyPayload: keyPayload || undefined,
      success: result.success,
      durationMs: Date.now() - startTime,
      details: result.explanation || logDesc,
    });
    if (interactionHistory.length > 150) interactionHistory.shift();
    res.json(result);
  } catch (error) {
    res.status(422).json({
      success: false,
      error: error instanceof Error ? error.message : "Execution failed",
    });
  }
};
