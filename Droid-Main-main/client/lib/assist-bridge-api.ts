/**
 * Typed client for the assist bridge v2 routes (/api/assist-bridge) and the main app's own
 * Qwen help endpoint (/api/ai/help). Every call throws on failure so the UI never shows a fake success.
 */
import type {
  AssistMonitorStatus,
  AssistRemoteSettings,
  AssistRequestKind,
  AssistRequestRecord,
  CreateFilePayload,
  CreatedFile,
  HandoffRecord,
  InboxRequest,
  RunScriptResult,
  ScriptStep,
  StepRecord,
  TakeoverStepPayload,
  AssistAutomation,
} from "@shared/assist-bridge";
import { safeFetchJson, safePostJson, type SafeApiResponse } from "@/lib/api-helper";

const BASE = "/api/assist-bridge";

/** Returns the field of a successful reply; throws with the server's error otherwise. */
function unwrap<T, K extends keyof T>(reply: SafeApiResponse<T>, key: K, what: string): T[K] {
  if (reply.success && reply[key] !== undefined) return reply[key];
  const status = reply.httpStatus ? ` (HTTP ${reply.httpStatus})` : "";
  throw new Error(reply.error || reply.message || `${what} failed${status}`);
}

const get = async <T, K extends keyof T>(path: string, key: K, what: string) =>
  unwrap(await safeFetchJson<T>(`${BASE}${path}`), key, what);

const post = async <T, K extends keyof T>(path: string, body: unknown, key: K, what: string) =>
  unwrap(await safePostJson<T>(`${BASE}${path}`, body), key, what);

export interface AiHelpAnswer {
  answer: string;
  usedFrame: boolean;
}

/** Asks the main app's own Qwen endpoint; `imageData` is an uploaded screenshot data URL. */
export async function askAi(question: string, options: { sessionId?: string; imageData?: string } = {}): Promise<AiHelpAnswer> {
  const reply = await safePostJson<{ answer: string; usedFrame: boolean }>("/api/ai/help", { question, ...options });
  const answer = unwrap(reply, "answer", "AI request");
  return { answer, usedFrame: Boolean(reply.usedFrame) };
}

/** Grabs the current live frame (a data URL) from the main app's screen capture; throws on standby. */
export async function captureFrame(): Promise<string> {
  const reply = await safeFetchJson<{ imageData: string }>("/api/screen-capture");
  return unwrap(reply, "imageData", "Screen capture");
}

export const assistBridgeApi = {
  request: (kind: AssistRequestKind, params: unknown) =>
    post<{ request: AssistRequestRecord }, "request">("/requests", { kind, params }, "request", `Request ${kind}`),
  requests: () => get<{ requests: AssistRequestRecord[] }, "requests">("/requests", "requests", "Loading requests"),
  inbox: () => get<{ inbox: InboxRequest[] }, "inbox">("/inbox", "inbox", "Loading inbox"),
  steps: () => get<{ steps: StepRecord[] }, "steps">("/steps", "steps", "Loading steps"),
  handoffs: () => get<{ handoffs: HandoffRecord[] }, "handoffs">("/handoffs", "handoffs", "Loading handoffs"),
  takeoverStep: (stepId: string) =>
    post<{ handoff: HandoffRecord }, "handoff">(`/steps/${encodeURIComponent(stepId)}/takeover`, {}, "handoff", "Takeover"),
  takeover: (payload: TakeoverStepPayload) => post<{ handoff: HandoffRecord }, "handoff">("/takeover", payload, "handoff", "Takeover"),
  runScript: (steps: ScriptStep[]) => post<{ result: RunScriptResult }, "result">("/run-script", { steps }, "result", "Script"),
  createFile: (payload: CreateFilePayload) => post<{ file: CreatedFile }, "file">("/files", payload, "file", "File creation"),
  monitor: () => get<{ monitor: AssistMonitorStatus }, "monitor">("/monitor", "monitor", "Loading monitor"),
  configureMonitor: (changes: Partial<AssistAutomation>) =>
    post<{ monitor: AssistMonitorStatus }, "monitor">("/monitor", changes, "monitor", "Monitor update"),
  reportProblem: (message: string, source?: string) =>
    post<{ problem: unknown }, "problem">("/monitor/problem", { message, source }, "problem", "Problem report"),
};

/** droid-new's current settings, fetched over the bridge. */
export async function getRemoteSettings(): Promise<AssistRemoteSettings> {
  const record = await assistBridgeApi.request("get_settings", {});
  return (record.result ?? {}) as AssistRemoteSettings;
}

/** Sends changed settings to droid-new; resolves with what droid-new reported back. */
export async function setRemoteSettings(settings: AssistRemoteSettings): Promise<unknown> {
  const record = await assistBridgeApi.request("set_settings", { settings });
  return record.result;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
