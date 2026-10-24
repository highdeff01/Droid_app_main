import {
  MONITOR_INTERVAL_MS,
  type MonitorMode,
} from "../shared/assistant-control";
import type { CaptureResult } from "./capture-frame";
import { readLiveFrame } from "./live-frame";

export interface MonitorFrame {
  imageData: string;
  capturedAt: number;
  source: string;
}

export interface MonitorStatus {
  mode: MonitorMode | "off";
  intervalMs: number | null;
  startedAt: number | null;
  captures: number;
  failures: number;
  lastError: string | null;
  lastCaptureAt: number | null;
  frameCount: number;
}

type Timer = ReturnType<typeof setTimeout>;
interface Clock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => Timer;
  clearTimeout: (t: Timer) => void;
}
const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
};

const MAX_FRAMES = 40;

/**
 * Server-side screen monitor: one mode at a time, capturing a screenshot on a fixed
 * cadence (background 1 s, advanced 0.25 s). Ticks are scheduled against the start time
 * so a slow capture does not drift the cadence, and never overlap.
 */
export class ScreenMonitor {
  private mode: MonitorMode | "off" = "off";
  private startedAt: number | null = null;
  private tick = 0;
  private timer: Timer | null = null;
  private generation = 0;
  private frames: MonitorFrame[] = [];
  private captures = 0;
  private failures = 0;
  private lastError: string | null = null;

  constructor(
    private capture: () => Promise<CaptureResult> = readLiveFrame,
    private clock: Clock = systemClock,
  ) {}

  start(mode: MonitorMode): MonitorStatus {
    this.stop();
    this.mode = mode;
    this.startedAt = this.clock.now();
    this.tick = 0;
    this.captures = 0;
    this.failures = 0;
    this.lastError = null;
    this.frames = [];
    void this.run(this.generation);
    return this.status();
  }

  stop(): MonitorStatus {
    this.generation++;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.mode = "off";
    this.startedAt = null;
    return this.status();
  }

  status(): MonitorStatus {
    return {
      mode: this.mode,
      intervalMs: this.mode === "off" ? null : MONITOR_INTERVAL_MS[this.mode],
      startedAt: this.startedAt,
      captures: this.captures,
      failures: this.failures,
      lastError: this.lastError,
      lastCaptureAt: this.frames[0]?.capturedAt ?? null,
      frameCount: this.frames.length,
    };
  }

  /** Newest first. */
  recentFrames(limit = MAX_FRAMES): MonitorFrame[] {
    return this.frames.slice(0, limit);
  }

  private async run(generation: number) {
    await this.captureOnce();
    if (generation !== this.generation || this.mode === "off") return;
    this.tick++;
    const due = this.startedAt! + this.tick * MONITOR_INTERVAL_MS[this.mode];
    this.timer = this.clock.setTimeout(
      () => void this.run(generation),
      Math.max(0, due - this.clock.now()),
    );
  }

  private async captureOnce() {
    try {
      const frame = await this.capture();
      if (frame.status === "standby") return this.fail(frame.message);
      this.captures++;
      this.frames.unshift({
        imageData: frame.imageData,
        capturedAt: frame.timestamp,
        source: frame.source,
      });
      if (this.frames.length > MAX_FRAMES) this.frames.length = MAX_FRAMES;
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
    }
  }

  private fail(message: string) {
    this.failures++;
    this.lastError = message;
  }
}

export const screenMonitor = new ScreenMonitor();
