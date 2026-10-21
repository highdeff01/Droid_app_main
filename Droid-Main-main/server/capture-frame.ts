import type { RequestHandler } from "express";

/** A frame older than this is never served as "live". */
export const FRAME_STALE_MS = 10_000;

export interface SourceFrame {
  imageData: string;
  timestamp: number;
  method?: string;
  deviceName?: string;
  metadata?: unknown;
}

/** One place a frame can come from; `read` returns null when it has none and throws on failure. */
export interface CaptureSource {
  name: string;
  read: () => SourceFrame | null | Promise<SourceFrame | null>;
}

export interface LiveCapture extends SourceFrame {
  success: true;
  status: "live";
  source: string;
  ageMs: number;
}

export interface SkippedSource {
  source: string;
  reason: "stale" | "error";
  timestamp?: number;
  ageMs?: number;
  error?: string;
}

export interface StandbyCapture {
  success: false;
  status: "standby";
  imageData: null;
  timestamp: number;
  message: string;
  skipped: SkippedSource[];
}

export type CaptureResult = LiveCapture | StandbyCapture;

export function isFrameStale(
  timestamp: number,
  now: number,
  staleMs = FRAME_STALE_MS,
): boolean {
  return now - timestamp > staleMs;
}

async function readSource(
  source: CaptureSource,
): Promise<{ frame: SourceFrame | null } | { error: string }> {
  try {
    return { frame: await source.read() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Walks the sources in order and returns the first fresh frame, or an honest standby result. */
export async function resolveCaptureFrame(
  sources: CaptureSource[],
  now: () => number = Date.now,
  staleMs = FRAME_STALE_MS,
): Promise<CaptureResult> {
  const skipped: SkippedSource[] = [];
  for (const source of sources) {
    const outcome = await readSource(source);
    if ("error" in outcome) {
      skipped.push({ source: source.name, reason: "error", error: outcome.error });
      continue;
    }
    const { frame } = outcome;
    if (!frame?.imageData) continue;
    const ageMs = now() - frame.timestamp;
    if (isFrameStale(frame.timestamp, now(), staleMs)) {
      skipped.push({ source: source.name, reason: "stale", timestamp: frame.timestamp, ageMs });
      continue;
    }
    return {
      ...frame,
      success: true,
      status: "live",
      source: source.name,
      method: frame.method ?? source.name,
      ageMs,
    };
  }
  return {
    success: false,
    status: "standby",
    imageData: null,
    timestamp: now(),
    message: standbyMessage(skipped),
    skipped,
  };
}

function standbyMessage(skipped: SkippedSource[]): string {
  const stale = skipped.filter((s) => s.reason === "stale");
  if (stale.length > 0) {
    const newest = Math.min(...stale.map((s) => s.ageMs ?? Infinity));
    return `No live frame: newest frame is ${Math.round(newest / 1000)}s old (stale)`;
  }
  return "No live frame available: waiting for a screen share, desktop capture or mobile stream";
}

/** The single handler behind every screen-capture route: 200 with a live frame, 503 on standby. */
export function createCaptureHandler(sources: CaptureSource[]): RequestHandler {
  return async (_req, res) => {
    const result = await resolveCaptureFrame(sources);
    res.status(result.success ? 200 : 503).json(result);
  };
}
