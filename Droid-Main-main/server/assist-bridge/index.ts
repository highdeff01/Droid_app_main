import { centralLogHub } from "../log-hub";
import { aiMonitorStore } from "../ai-monitor-store";
import { readLiveFrame } from "../live-frame";
import { executeDeviceTask } from "../routes/execute-task";
import { companionService } from "../routes/companion";
import { toAssistFrame } from "./frames";
import { watchErrors, watchMonitor } from "./events";
import { AssistBridgeService, settingsFromEnv } from "./service";

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

export const assistBridge = new AssistBridgeService(settingsFromEnv(), {
  readFrame: async () => toAssistFrame(await readLiveFrame()),
  execute: executeDeviceTask,
  appState,
  logNotice: (notice) =>
    centralLogHub.addLog("System", notice.level === "error" ? "ERROR" : notice.level === "warn" ? "WARN" : "INFO", `Assist intercept notice: ${notice.message}`, {
      source: notice.source ?? "assist",
    }),
});

let started: Promise<void> | null = null;

/** Starts the bridge listener and event watchers once per process (app startup hook). */
export function startAssistBridge(): Promise<void> {
  started ??= (async () => {
    const emit = assistBridge.emit.bind(assistBridge);
    watchErrors(companionService.errors, emit);
    watchMonitor(aiMonitorStore, emit);
    await assistBridge.start();
    const status = assistBridge.status();
    if (status.lastError) console.warn(`[assist-bridge] ${status.lastError}`);
    else console.log(`[assist-bridge] waiting for assist app on ${status.url}${status.insecure ? " (plain HTTP on LAN)" : ""}`);
  })();
  return started;
}
