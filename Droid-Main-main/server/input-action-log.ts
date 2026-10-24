import { classifyInputAction } from "../shared/assistant-control";
import { aiMonitorStore, type AiActionRecord } from "./ai-monitor-store";
import { readLiveFrame } from "./live-frame";

/** One real mouse/keyboard action as performed (or attempted) by the app or recorded from the user. */
export interface InputActionEntry {
  action: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  /** When the action happened (epoch ms); defaults to now. */
  at?: number;
}

export interface InputActionContext {
  /** Where the action came from: "bridge", "execute_task", "use_command", "replay", "user_recording", ... */
  origin: string;
  executed: boolean;
  error?: string;
  /** A screenshot already stored for this moment (e.g. a replay step's after-frame); skips a new capture. */
  screenshotId?: string;
  /** Skip the capture (user-recorded actions happened earlier; the live screen is not their moment). */
  skipScreenshot?: boolean;
}

/** The screenshot for this moment: the supplied one, else a fresh live capture. */
async function captureEvidence(ctx: InputActionContext) {
  if (ctx.skipScreenshot) return {};
  if (ctx.screenshotId) return { screenshotId: ctx.screenshotId };
  try {
    const frame = await readLiveFrame();
    if (frame.status === "standby") return { screenshotError: frame.message };
    return { screenshotId: aiMonitorStore.storeScreenshot(frame.imageData, frame.timestamp).id };
  } catch (err) {
    return { screenshotError: err instanceof Error ? err.message : String(err) };
  }
}

function describe(entry: InputActionEntry): string {
  const at = entry.x !== undefined && entry.y !== undefined ? ` at (${Math.round(entry.x)}, ${Math.round(entry.y)})` : "";
  const input = entry.text ? ` "${entry.text}"` : entry.key ? ` [${entry.key}]` : "";
  return `${entry.action.toUpperCase()}${at}${input}`;
}

/**
 * Logs each mouse/keyboard action into the action history with a timestamp and one
 * screenshot of the screen at that moment shared by the batch. Non-input actions (wait) are skipped.
 */
export async function recordInputActions(
  entries: InputActionEntry[],
  ctx: InputActionContext,
): Promise<AiActionRecord[]> {
  const inputs = entries.filter((e) => classifyInputAction(e.action));
  if (inputs.length === 0) return [];
  const evidence = await captureEvidence(ctx);
  return inputs.map((entry) => {
    const inputKind = classifyInputAction(entry.action)!;
    return aiMonitorStore.record({
      timestamp: entry.at,
      timeStr: entry.at ? new Date(entry.at).toLocaleTimeString() : undefined,
      phase: "execution",
      title: `${inputKind === "mouse" ? "Mouse" : "Keyboard"} ${entry.action}`,
      detail: ctx.executed ? describe(entry) : `${describe(entry)} not executed: ${ctx.error ?? "unknown error"}`,
      status: ctx.executed ? "completed" : "failed",
      source: ctx.origin,
      inputKind,
      action: entry.action,
      x: entry.x !== undefined ? Math.round(entry.x) : undefined,
      y: entry.y !== undefined ? Math.round(entry.y) : undefined,
      input: entry.text ?? entry.key,
      executed: ctx.executed,
      origin: ctx.origin,
      ...evidence,
    });
  });
}

/** Fire-and-forget form for request handlers: logging never fails or delays the action reply. */
export function logInputActions(entries: InputActionEntry[], ctx: InputActionContext): void {
  void recordInputActions(entries, ctx).catch(() => undefined);
}
