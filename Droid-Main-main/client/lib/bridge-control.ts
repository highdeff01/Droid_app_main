/**
 * PyAutoGUI bridge calls used by the health footer. Every reply is parsed from
 * its body: an HTML page (static host warmup) or any non-JSON reply is a
 * failure, and success is only reported when the JSON says so.
 */
import { toast } from "sonner";
import { BACKEND_UNREACHABLE_MESSAGE, isBackendUnreachable, readJsonReply } from "@/lib/backend-status";

export const BRIDGE_NON_JSON_MESSAGE = "Bridge unreachable: API returned non-JSON (backend not running)";

export interface BridgeHealthReading {
  online: boolean;
  paused: boolean;
  latencyMs?: number;
  pythonVersion?: string;
  pyautoguiAvailable: boolean;
  screenResolution?: { width: number; height: number };
  activeProcesses: Array<{ name: string; pid: number; status: string; latencyMs?: number }>;
  error?: string;
}

export interface CoordSyncReading {
  latencyMs: number;
  driftPx: number;
  bridgeX: number;
  bridgeY: number;
  canvasX: number;
  canvasY: number;
  lastSynced: number;
}

export const BRIDGE_BAD_BODY_MESSAGE = "Bridge health reply was not a status object";

/** `value` when `ok`, otherwise a concise `error`; `unreachable` when no JSON API answered at all. */
export interface BridgeResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  unreachable?: boolean;
}

interface BridgeReply {
  ok: boolean;
  httpOk?: boolean;
  status?: number;
  body?: any;
  error?: string;
  unreachable?: boolean;
}

/** Fetch one bridge endpoint and parse it; transport and non-JSON failures become an unreachable error. */
async function callBridge(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<BridgeReply> {
  if (isBackendUnreachable()) return { ok: false, unreachable: true, error: BACKEND_UNREACHABLE_MESSAGE };
  try {
    const reply = await readJsonReply(await fetchImpl(url, init));
    if (!reply.json) return { ok: false, unreachable: true, error: BRIDGE_NON_JSON_MESSAGE };
    return { ok: true, httpOk: reply.httpOk, status: reply.status, body: reply.body };
  } catch (err) {
    return { ok: false, unreachable: true, error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readResolution(value: unknown): { width: number; height: number } | undefined {
  if (!isPlainObject(value) || typeof value.width !== "number" || typeof value.height !== "number") return undefined;
  return { width: value.width, height: value.height };
}

function readProcesses(value: unknown): BridgeHealthReading["activeProcesses"] {
  if (!Array.isArray(value)) return [];
  return value.filter((p) => isPlainObject(p) && typeof p.name === "string" && typeof p.pid === "number");
}

/** Validates a parsed health body field by field; online only for a literal `online: true`, never a crash. */
export function parseBridgeHealthBody(data: unknown): BridgeResult<BridgeHealthReading> {
  if (!isPlainObject(data)) return { ok: false, error: BRIDGE_BAD_BODY_MESSAGE };
  return {
    ok: true,
    value: {
      online: data.online === true,
      paused: data.paused === true,
      latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : undefined,
      pythonVersion: typeof data.pythonVersion === "string" ? data.pythonVersion : undefined,
      pyautoguiAvailable: data.pyautoguiAvailable === true,
      screenResolution: readResolution(data.screenResolution),
      activeProcesses: readProcesses(data.activeProcesses),
      error: typeof data.error === "string" ? data.error : undefined,
    },
  };
}

function replyError(body: any, fallback: string): string {
  if (typeof body?.error === "string" && body.error) return body.error;
  if (typeof body?.message === "string" && body.message) return body.message;
  return fallback;
}

/** GET /api/pyautogui/health; online only when the JSON says `online: true`. */
export async function fetchBridgeHealth(fetchImpl: typeof fetch = fetch): Promise<BridgeResult<BridgeHealthReading>> {
  const reply = await callBridge("/api/pyautogui/health", { headers: { "Cache-Control": "no-cache" } }, fetchImpl);
  if (!reply.ok) return reply;
  const data = reply.body;
  if (!reply.httpOk) return { ok: false, error: replyError(data, `HTTP ${reply.status}`) };
  return parseBridgeHealthBody(data);
}

/** POST a coordinate-sync pulse; null unless the bridge answered with JSON. */
export async function syncBridgeCoordinates(fetchImpl: typeof fetch = fetch): Promise<CoordSyncReading | null> {
  const start = performance.now();
  const reply = await callBridge(
    "/api/pyautogui/coordinate-sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasX: 960, canvasY: 540, clientTimestamp: Date.now() }),
    },
    fetchImpl,
  );
  if (!reply.ok || !reply.httpOk) return null;
  const data = reply.body;
  if (!isPlainObject(data) || typeof data.bridgeReportedX !== "number" || typeof data.bridgeReportedY !== "number") return null;
  const num = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
  return {
    latencyMs: Math.round(performance.now() - start),
    driftPx: num(data.spatialDriftPx, 0),
    bridgeX: data.bridgeReportedX,
    bridgeY: data.bridgeReportedY,
    canvasX: num(data.browserCanvasX, 960),
    canvasY: num(data.browserCanvasY, 540),
    lastSynced: Date.now(),
  };
}

/** Reconnect, then confirm with a health check; success requires both JSON replies to report online. */
export async function reconnectBridge(fetchImpl: typeof fetch = fetch): Promise<BridgeResult<{ message: string }>> {
  const reply = await callBridge("/api/pyautogui/reconnect", { method: "POST" }, fetchImpl);
  if (!reply.ok) return reply;
  if (!reply.httpOk || reply.body?.success !== true || reply.body?.online !== true) {
    return { ok: false, error: replyError(reply.body, `Reconnect did not report the bridge online (HTTP ${reply.status})`) };
  }
  const health = await fetchBridgeHealth(fetchImpl);
  if (!health.ok) return { ok: false, error: health.error };
  if (!health.value.online) {
    return { ok: false, error: `Health check reports the bridge offline${health.value.error ? `: ${health.value.error}` : ""}` };
  }
  return { ok: true, value: { message: replyError(reply.body, "Bridge reconnected.") } };
}

/** Pause or resume; the new state is taken only from a JSON reply carrying a boolean `paused`. */
export async function toggleBridgePause(
  currentlyPaused: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeResult<{ paused: boolean; message?: string }>> {
  const endpoint = currentlyPaused ? "/api/pyautogui/resume" : "/api/pyautogui/pause";
  const reply = await callBridge(endpoint, { method: "POST" }, fetchImpl);
  if (!reply.ok) return reply;
  const data = reply.body;
  if (!reply.httpOk || data?.success === false || typeof data?.paused !== "boolean") {
    return { ok: false, error: replyError(data, `Pause toggle failed (HTTP ${reply.status})`) };
  }
  return { ok: true, value: { paused: data.paused, message: typeof data.message === "string" ? data.message : undefined } };
}

/** Quick Reconnect button: toasts success only when the bridge is verified online. */
export async function runQuickReconnect(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const result = await reconnectBridge(fetchImpl);
  if (!result.ok) {
    toast.error("Bridge Reconnect Failed", { description: result.error });
    return false;
  }
  toast.success("Python execution bridge reconnected successfully", {
    description: "Subprocess link is active and synchronized with browser host.",
  });
  return true;
}

/** Pause/Resume button: returns the confirmed state, or null after an error toast. */
export async function runTogglePause(currentlyPaused: boolean, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  const result = await toggleBridgePause(currentlyPaused, fetchImpl);
  if (!result.ok) {
    toast.error(`Failed to toggle pause: ${result.error}`);
    return null;
  }
  const { paused, message } = result.value;
  toast(paused ? "Execution Bridge Paused" : "Execution Bridge Resumed", { description: message, icon: paused ? "⏸️" : "▶️" });
  return paused;
}
