/**
 * Detects whether the Express automation API is actually reachable. Static
 * hosts (e.g. Google AI Studio) answer every /api/* request with an HTML page
 * and HTTP 200, so reachability is decided by parsing the body, never by
 * `res.ok` or the content-type header.
 */

export const BACKEND_UNREACHABLE_MESSAGE =
  "Backend API not reachable — this environment cannot run the automation server (no Python, no display, no device control). Run the app locally with npm run dev on port 3000.";

export const AI_STUDIO_WARMUP_NOTE =
  "Detected the Google AI Studio static-hosting warmup page (\"Starting Server\"): /api/* requests never reach the Express server here.";

export const BACKEND_PROBE_URL = "/api/health";
export const BACKEND_REPROBE_MS = 15_000;

/** A parsed reply: `body` when the text was JSON, otherwise the truncated `text` and a concise `reason`. */
export interface JsonReply {
  json: boolean;
  status: number;
  httpOk: boolean;
  body?: any;
  text?: string;
  reason?: string;
}

export type BackendState = "unknown" | "reachable" | "unreachable";

export interface BackendStatus {
  state: BackendState;
  /** The unreachable reply was the AI Studio warmup page. */
  aiStudio: boolean;
  /** Concise cause (never a raw body). */
  detail?: string;
}

/** True for the AI Studio warmup page served in place of every /api/* reply. */
export function isAiStudioWarmup(text: string): boolean {
  return /Starting Server|__aistudio_warmup_failed/.test(text);
}

/** One-line description of a non-JSON body: HTML is never included, short plain text is kept. */
export function summarizeNonJson(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `Empty response (HTTP ${status})`;
  if (/<!doctype|<html|<head|<body/i.test(trimmed) || trimmed.length > 120) {
    return `Non-JSON response (HTTP ${status})`;
  }
  return trimmed;
}

/** Reads a response body and parses it as JSON; an empty or unparsable body is non-JSON (a failure). */
export async function readJsonReply(response: Response): Promise<JsonReply> {
  const text = await response.text();
  const base = { status: response.status, httpOk: response.ok };
  try {
    return { json: true, ...base, body: JSON.parse(text) };
  } catch {
    return { json: false, ...base, text: text.slice(0, 300), reason: summarizeNonJson(text, response.status) };
  }
}

/** Actionable message for an /api call answered by something other than the Express API. */
export const BACKEND_NOT_RUNNING_MESSAGE = "Backend API not running — start the app locally (npm run dev, port 3000)";

/** An /api reply that was not JSON (static-host warmup HTML): the backend is not running here. Never retried. */
export class BackendNotRunningError extends Error {
  constructor(url: string, status: number) {
    super(`${BACKEND_NOT_RUNNING_MESSAGE}. ${url} returned a non-JSON page (HTTP ${status}).`);
    this.name = "BackendNotRunningError";
  }
}

/** The JSON body of an /api reply; a non-JSON body throws BackendNotRunningError (raw HTML is never surfaced). */
export async function readApiJson(response: Response, url: string): Promise<any> {
  const reply = await readJsonReply(response);
  if (!reply.json) throw new BackendNotRunningError(url, reply.status);
  return reply.body;
}

/** Probe verdict for a reply: any JSON body means the API answered. */
export function classifyProbeReply(reply: JsonReply): BackendStatus {
  if (reply.json) return { state: "reachable", aiStudio: false };
  return {
    state: "unreachable",
    aiStudio: isAiStudioWarmup(reply.text),
    detail: `${BACKEND_PROBE_URL} returned non-JSON (HTTP ${reply.status})`,
  };
}

/** GET the health endpoint once and classify it; a network failure is unreachable. */
export async function probeBackend(fetchImpl: typeof fetch = fetch): Promise<BackendStatus> {
  try {
    const response = await fetchImpl(BACKEND_PROBE_URL, { cache: "no-store" });
    return classifyProbeReply(await readJsonReply(response));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { state: "unreachable", aiStudio: false, detail: `${BACKEND_PROBE_URL} request failed: ${message}` };
  }
}

/** Banner text for a status; null unless the backend is known to be unreachable. */
export function bannerText(status: BackendStatus): string | null {
  if (status.state !== "unreachable") return null;
  return status.aiStudio ? `${BACKEND_UNREACHABLE_MESSAGE} ${AI_STUDIO_WARMUP_NOTE}` : BACKEND_UNREACHABLE_MESSAGE;
}

let current: BackendStatus = { state: "unknown", aiStudio: false };
const listeners = new Set<() => void>();

export function getBackendStatus(): BackendStatus {
  return current;
}

export function setBackendStatus(status: BackendStatus): void {
  current = status;
  listeners.forEach((listener) => listener());
}

export function subscribeBackendStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isBackendUnreachable(): boolean {
  return current.state === "unreachable";
}

/** Device control fails fast with the banner reason while the backend is unreachable. */
export function assertBackendReachable(): void {
  if (isBackendUnreachable()) throw new Error(BACKEND_UNREACHABLE_MESSAGE);
}

/**
 * Probes at startup; while the backend is unreachable it re-probes every
 * `reprobeMs` so polling resumes as soon as the API answers. Returns a stop function.
 */
export function startBackendProbe(fetchImpl: typeof fetch = fetch, reprobeMs = BACKEND_REPROBE_MS): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    const status = await probeBackend(fetchImpl);
    if (stopped) return;
    setBackendStatus(status);
    if (status.state === "unreachable") timer = setTimeout(run, reprobeMs);
  };
  void run();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
