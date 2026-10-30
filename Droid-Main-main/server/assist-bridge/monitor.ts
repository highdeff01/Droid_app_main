import {
  type AssistAutomation,
  type AssistEventType,
  type AssistMonitorStatus,
  type AssistRequestKind,
  type MonitorProblem,
} from "../../shared/assist-bridge";
import type { FrameOutcome } from "./frames";

export const MONITOR_INTERVAL_MS = 1000;
const PROBLEM_LIMIT = 50;

export interface ScreenMonitorDeps {
  readFrame: () => Promise<FrameOutcome>;
  isConnected: () => boolean;
  request: (kind: AssistRequestKind, params: unknown) => Promise<unknown>;
  emit: (type: AssistEventType, payload: unknown) => void;
  intervalMs?: number;
  now?: () => number;
}

export function automationFromEnv(env: NodeJS.ProcessEnv = process.env): AssistAutomation {
  const flag = (value: string | undefined, fallback: boolean) => (value === undefined ? fallback : value !== "0" && value !== "false");
  return {
    monitoring: flag(env.ASSIST_BRIDGE_MONITOR, true),
    autoAssist: flag(env.ASSIST_BRIDGE_AUTO_ASSIST, true),
    autoTakeover: flag(env.ASSIST_BRIDGE_AUTO_TAKEOVER, false),
  };
}

/** Background screenshot capture while the main app runs, plus auto-assist for detected problems. */
export class ScreenMonitor {
  private timer: NodeJS.Timeout | null = null;
  private framesCaptured = 0;
  private live = false;
  private lastFrameAt: number | null = null;
  private lastMessage: string | null = null;
  private readonly problems: MonitorProblem[] = [];
  private readonly now: () => number;

  constructor(private automation: AssistAutomation, private readonly deps: ScreenMonitorDeps) {
    this.now = deps.now ?? Date.now;
  }

  get settings(): AssistAutomation {
    return { ...this.automation };
  }

  /** Applies toggles; monitoring starts or stops the capture loop at once. */
  configure(update: Partial<AssistAutomation>): AssistMonitorStatus {
    this.automation = { ...this.automation, ...update };
    if (this.automation.monitoring) this.start();
    else this.stop();
    return this.status();
  }

  start(): void {
    if (this.timer || !this.automation.monitoring) return;
    this.timer = setInterval(() => void this.tick(), this.deps.intervalMs ?? MONITOR_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Captures one frame; standby is recorded as standby, never faked. */
  async tick(): Promise<void> {
    try {
      const outcome = await this.deps.readFrame();
      this.live = outcome.live;
      if (outcome.live === false) {
        this.lastMessage = outcome.message;
        return;
      }
      this.framesCaptured += 1;
      this.lastFrameAt = this.now();
      this.lastMessage = null;
    } catch (err) {
      this.live = false;
      this.lastMessage = err instanceof Error ? err.message : String(err);
    }
  }

  /** A detected problem: logged, broadcast, and sent to droid-new for help when auto-assist is on. */
  async problem(message: string, source: string): Promise<MonitorProblem> {
    const entry: MonitorProblem = { at: this.now(), message, source, assist: "auto-assist off" };
    this.problems.unshift(entry);
    if (this.problems.length > PROBLEM_LIMIT) this.problems.pop();
    this.deps.emit("monitor_problem", { message, source });
    if (!this.automation.autoAssist) return entry;
    if (!this.deps.isConnected()) {
      entry.assist = "droid-new not connected";
      return entry;
    }
    entry.assist = "sent to droid-new";
    try {
      const record = (await this.deps.request("assist_error", { message, source })) as { status?: string; error?: string };
      entry.assist = record.status === "ok" ? "droid-new assisted" : `droid-new failed: ${record.error ?? "unknown"}`;
    } catch (err) {
      entry.assist = `Not sent: ${err instanceof Error ? err.message : String(err)}`;
    }
    return entry;
  }

  status(): AssistMonitorStatus {
    return {
      ...this.automation,
      intervalMs: this.deps.intervalMs ?? MONITOR_INTERVAL_MS,
      framesCaptured: this.framesCaptured,
      live: this.live,
      lastFrameAt: this.lastFrameAt,
      lastMessage: this.lastMessage,
      problems: [...this.problems],
    };
  }
}
