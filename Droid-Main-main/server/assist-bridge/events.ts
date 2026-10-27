import type { ErrorBus } from "../error-bus";
import type { AiActionRecord, AiMonitorStatus } from "../ai-monitor-store";
import type { AssistEventType } from "../../shared/assist-bridge";

type Emit = (type: AssistEventType, payload: unknown) => void;

export interface MonitorSource {
  getStatus(): AiMonitorStatus;
  getActionHistory(limit?: number): AiActionRecord[];
}

const MONITOR_POLL_MS = 1000;

/** Error bus → `error` plus `test_request` (the fix task the app opened for it). */
export function watchErrors(bus: ErrorBus, emit: Emit): () => void {
  return bus.onError((event, task) => {
    emit("error", { message: event.message, source: event.source, taskId: task.id, failedStep: event.failedStep });
    emit("test_request", { taskId: task.id, title: task.title, source: task.source, workflowId: task.workflowId, failedStep: task.failedStep });
  });
}

function statusKey(status: AiMonitorStatus): string {
  return `${status.status}\u0000${status.currentAction ?? ""}`;
}

/** Polls the AI monitor: status changes → `state_change`, new screen actions → `element_change`. */
export function watchMonitor(monitor: MonitorSource, emit: Emit): () => void {
  let lastKey = statusKey(monitor.getStatus());
  let lastActionAt = monitor.getActionHistory(1)[0]?.timestamp ?? 0;
  const timer = setInterval(() => {
    const status = monitor.getStatus();
    const key = statusKey(status);
    if (key !== lastKey) emit("state_change", { status: status.status, currentAction: status.currentAction ?? null });
    lastKey = key;
    const fresh = monitor.getActionHistory(50).filter((a) => a.timestamp > lastActionAt && a.inputKind);
    for (const action of fresh.reverse()) {
      emit("element_change", { action: action.action, x: action.x, y: action.y, detail: action.detail, executed: action.executed });
    }
    lastActionAt = Math.max(lastActionAt, ...fresh.map((a) => a.timestamp));
  }, MONITOR_POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
