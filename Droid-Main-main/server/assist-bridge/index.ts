import path from "path";
import { centralLogHub } from "../log-hub";
import { aiMonitorStore } from "../ai-monitor-store";
import { readLiveFrame } from "../live-frame";
import { executeDeviceTask } from "../routes/execute-task";
import { companionService } from "../routes/companion";
import { toAssistFrame } from "./frames";
import { watchErrors, watchMonitor } from "./events";
import { FileCreator } from "./files";
import { automationFromEnv } from "./monitor";
import { AssistBridgeService, settingsFromEnv } from "./service";
import { qwenTakeoverPlanner } from "./takeover-planner";

const RECENT_ERROR_LIMIT = 200;
const recentErrors: { at: number; message: string }[] = [];

async function appState() {
  const capture = await readLiveFrame();
  const ai = aiMonitorStore.getStatus();
  return {
    ai: { status: ai.status, currentAction: ai.currentAction ?? null },
    recentActions: aiMonitorStore.getActionHistory(10).map(({ timestamp, phase, title, status, action, x, y }) => ({
      timestamp, phase, title, status, action, x, y,
    })),
    frame: capture.success === false ? { live: false, message: capture.message } : { live: true, ageMs: capture.ageMs, source: capture.source },
  };
}

function log(level: "INFO" | "WARN" | "ERROR", message: string) {
  centralLogHub.addLog("System", level, `Assist bridge: ${message}`, { source: "assist-bridge" });
}

export const assistFiles = new FileCreator({
  filesDir: process.env.ASSIST_BRIDGE_FILES_DIR?.trim() || path.resolve(process.cwd(), "assist-files"),
  appRoot: process.cwd(),
  queue: companionService.errors,
  log,
});

export const assistBridge = new AssistBridgeService(settingsFromEnv(), {
  readFrame: async () => toAssistFrame(await readLiveFrame()),
  execute: executeDeviceTask,
  appState,
  logNotice: (notice) =>
    centralLogHub.addLog("System", notice.level === "error" ? "ERROR" : notice.level === "warn" ? "WARN" : "INFO", `Assist intercept notice: ${notice.message}`, {
      source: notice.source ?? "assist",
    }),
  errorsSince: (since) => recentErrors.filter((e) => e.at >= since).map((e) => e.message),
  planTakeover: qwenTakeoverPlanner,
  files: assistFiles,
  log,
  automation: automationFromEnv(),
});

let started: Promise<void> | null = null;

/** Starts the bridge listener, monitoring and event watchers once per process (app startup hook). */
export function startAssistBridge(): Promise<void> {
  started ??= (async () => {
    const emit = assistBridge.emit.bind(assistBridge);
    watchErrors(companionService.errors, emit);
    watchMonitor(aiMonitorStore, emit);
    companionService.errors.onError((event) => {
      recentErrors.push({ at: Date.now(), message: event.message });
      if (recentErrors.length > RECENT_ERROR_LIMIT) recentErrors.shift();
      void assistBridge.monitor.problem(event.message, event.source);
    });
    companionService.errors.onDecision((proposal) => void assistFiles.applyDecision(proposal));
    await assistBridge.start();
    const status = assistBridge.status();
    if (status.lastError) console.warn(`[assist-bridge] ${status.lastError}`);
    else console.log(`[assist-bridge] waiting for assist app on ${status.url}${status.insecure ? " (plain HTTP on LAN)" : ""}`);
  })();
  return started;
}
