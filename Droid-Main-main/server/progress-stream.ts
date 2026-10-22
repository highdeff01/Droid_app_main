import type { Response } from "express";
import {
  SCREENSHOT_DATA_URL,
  type ProgressEvent,
  type ProgressEventInput,
  type ProgressPage,
} from "../shared/progress";

export const PROGRESS_LIMIT = 500;
const MAX_LOG_LINES = 20;
const MAX_LOG_LENGTH = 500;

type ProgressListener = (event: ProgressEvent) => void;

/** Keeps only PNG/JPEG data URLs, the same rule the notes store applies. */
export function safeScreenshot(value: unknown): string | undefined {
  return typeof value === "string" && SCREENSHOT_DATA_URL.test(value) ? value : undefined;
}

function boundedLogs(logs: unknown): string[] {
  if (!Array.isArray(logs)) return [];
  return logs
    .filter((line): line is string => typeof line === "string")
    .slice(-MAX_LOG_LINES)
    .map((line) => line.slice(0, MAX_LOG_LENGTH));
}

/**
 * The single app-wide progress stream: bounded in-memory, cursor-polled
 * (`since`) or pushed over SSE. Resets on restart, like centralLogHub.
 */
export class ProgressStream {
  private events: ProgressEvent[] = [];
  private seq = 0;
  private listeners = new Set<ProgressListener>();

  constructor(
    private readonly limit = PROGRESS_LIMIT,
    private readonly now: () => number = Date.now,
  ) {}

  publish(input: ProgressEventInput): ProgressEvent {
    const event: ProgressEvent = {
      seq: ++this.seq,
      kind: input.kind,
      level: input.level ?? "info",
      title: input.title,
      detail: input.detail,
      operationId: input.operationId,
      status: input.status,
      logs: boundedLogs(input.logs),
      screenshot: safeScreenshot(input.screenshot),
      at: this.now(),
    };
    this.events.push(event);
    if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Progress listener failed:", error);
      }
    }
    return event;
  }

  /** Events after the cursor (all retained when omitted), capped to `limit` newest. */
  since(cursor = 0, limit = 100): ProgressPage {
    const events = this.events.filter((event) => event.seq > cursor).slice(-limit);
    return { events, cursor: this.seq };
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Streams every new event to one SSE client until it disconnects. */
  attachSse(res: Response, cursor = 0): () => void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const write = (event: ProgressEvent) =>
      res.write(`id: ${event.seq}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`);
    this.since(cursor, this.limit).events.forEach(write);
    return this.subscribe(write);
  }
}

export const progressStream = new ProgressStream();
