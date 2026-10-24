/**
 * Single gateway to the Ollama-compatible Qwen 3.5:2b model used for both text
 * chat and screenshot (vision) analysis by the perception, planner, copilot,
 * OCR and review engines.
 *
 * Endpoint chain: the primary endpoint (runtime setting > OLLAMA_ENDPOINT >
 * quantumclaw at DEFAULT_OLLAMA_ENDPOINT) is tried first; when a custom
 * endpoint fails to connect or times out the request is retried once against
 * quantumclaw. A failure is reported as a failure, never a template answer.
 */

import { centralLogHub } from "./log-hub";

/** Optional LAN Ollama preset; never used unless the user selects it. */
export const DEFAULT_LOCAL_OLLAMA_ENDPOINT = "http://192.168.1.100:11434/api/chat";
export const DEFAULT_OLLAMA_ENDPOINT = "https://quantumclaw.net/ollama/api/chat";
export const DEFAULT_QWEN_MODEL = "qwen3.5:2b";
export const DEFAULT_CHAT_TIMEOUT_MS = 25_000;
export const PING_TIMEOUT_MS = 8_000;

let runtimeConfiguredEndpoint: string | null = null;
let runtimeConfiguredModel: string | null = null;

export function setConfiguredAiEndpoint(url: string) {
  if (url && typeof url === "string" && url.trim().length > 0) {
    runtimeConfiguredEndpoint = url.trim();
    centralLogHub.addLog(
      "System",
      "INFO",
      `Active AI model URL updated to: ${runtimeConfiguredEndpoint}`,
    );
  }
}

export function getConfiguredAiEndpoint(): string {
  return resolveAiEndpoint();
}

export function setConfiguredAiModel(model: string) {
  if (model && typeof model === "string" && model.trim().length > 0) {
    runtimeConfiguredModel = model.trim();
  }
}

export function getConfiguredAiModel(): string {
  return resolveAiModel();
}

/** Clears runtime overrides so env/defaults apply again. */
export function resetAiConfiguration() {
  runtimeConfiguredEndpoint = null;
  runtimeConfiguredModel = null;
}

function normalizeChatUrl(endpoint: string): string {
  if (endpoint.endsWith("/api/chat") || endpoint.endsWith("/api/generate")) {
    return endpoint;
  }
  return endpoint.endsWith("/") ? `${endpoint}api/chat` : `${endpoint}/api/chat`;
}

/** Primary endpoint: request value > runtime setting > env > quantumclaw. */
export function resolveAiEndpoint(provided?: string | null): string {
  const candidates = [
    provided,
    runtimeConfiguredEndpoint,
    process.env.OLLAMA_ENDPOINT,
    DEFAULT_OLLAMA_ENDPOINT,
  ];
  const endpoint = candidates.find((c) => c && c.trim().length > 0)!.trim();
  return normalizeChatUrl(endpoint);
}

/** Ordered endpoints to try: the primary, then quantumclaw when different. */
export function resolveAiEndpointChain(provided?: string | null): string[] {
  const primary = resolveAiEndpoint(provided);
  return primary === DEFAULT_OLLAMA_ENDPOINT
    ? [primary]
    : [primary, DEFAULT_OLLAMA_ENDPOINT];
}

export function resolveAiModel(providedModel?: string | null): string {
  const candidates = [
    providedModel,
    runtimeConfiguredModel,
    process.env.OLLAMA_MODEL,
    DEFAULT_QWEN_MODEL,
  ];
  return candidates.find((c) => c && c.trim().length > 0)!.trim();
}

/** Strips a data URL prefix so Ollama receives raw base64 in `images`. */
export function toBase64Image(imageData: string): string {
  const comma = imageData.indexOf(",");
  return imageData.startsWith("data:") && comma >= 0
    ? imageData.slice(comma + 1)
    : imageData;
}

/** Builds the user message carrying a screenshot for Qwen vision. */
export function buildVisionMessage(
  prompt: string,
  imageData: string,
): QwenChatMessage {
  return { role: "user", content: prompt, images: [toBase64Image(imageData)] };
}

/**
 * Parses a JSON reply from the model, tolerating <think> blocks and markdown
 * fences. Throws when no JSON object can be read.
 */
export function parseModelJson<T = any>(content: string): T {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const unfenced = withoutThinking.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Model reply contained no JSON object");
    }
    return JSON.parse(unfenced.slice(start, end + 1)) as T;
  }
}

/** A connection failure or timeout, as opposed to an HTTP-level error. */
function isConnectionFailure(err: unknown): boolean {
  return !(err instanceof HttpStatusError);
}

class HttpStatusError extends Error {}

/** Thrown when the AI endpoint cannot produce a usable answer; routes map it to HTTP 502. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** 502 for an unreachable/unreadable AI endpoint, 500 for anything else. */
export function aiErrorStatus(err: unknown): number {
  return err instanceof AiUnavailableError ? 502 : 500;
}

export async function testAiEndpoint(
  endpoint?: string,
  model?: string,
): Promise<{
  success: boolean;
  status?: number;
  latencyMs: number;
  endpoint: string;
  model: string;
  message: string;
  data?: any;
  error?: string;
}> {
  const targetUrl = resolveAiEndpoint(endpoint);
  const targetModel = resolveAiModel(model);
  const startTime = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: "user", content: "ping" }],
        stream: false,
      }),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - startTime;
    const data: any = await response.json().catch(() => null);
    return {
      success: response.ok,
      status: response.status,
      latencyMs,
      endpoint: targetUrl,
      model: targetModel,
      message: response.ok
        ? `Endpoint verified successfully (${latencyMs}ms)`
        : `HTTP ${response.status}: ${response.statusText}`,
      data,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      endpoint: targetUrl,
      model: targetModel,
      message: `Connection error: ${errorMsg}`,
      error: errorMsg,
    };
  }
}

export interface QwenChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
}

export interface QwenChatOptions {
  endpoint?: string;
  model?: string;
  format?: "json";
  timeoutMs?: number;
}

export interface QwenChatResult {
  success: boolean;
  content: string;
  endpoint?: string;
  raw?: any;
  error?: string;
}

async function postChat(
  url: string,
  payload: Record<string, any>,
  timeoutMs: number,
): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new HttpStatusError(
      `Qwen HTTP ${response.status}: ${response.statusText}`,
    );
  }
  return response.json();
}

/**
 * Sends a chat (optionally with base64 screenshots in `images`) to Qwen,
 * local endpoint first and quantumclaw on connection failure/timeout.
 */
export async function sendQwenChatRequest(
  messages: QwenChatMessage[],
  options?: QwenChatOptions,
): Promise<QwenChatResult> {
  const chain = resolveAiEndpointChain(options?.endpoint);
  const model = resolveAiModel(options?.model);
  const timeoutMs = options?.timeoutMs || DEFAULT_CHAT_TIMEOUT_MS;
  const payload: Record<string, any> = { model, messages, stream: false };
  if (options?.format === "json") payload.format = "json";

  let lastError = "No AI endpoint configured";
  for (const [index, url] of chain.entries()) {
    try {
      const data = await postChat(url, payload, timeoutMs);
      const content = data?.message?.content || data?.response || "";
      centralLogHub.addLog(
        "Qwen Vision",
        "SUCCESS",
        `Qwen response received (${model} @ ${url})`,
        { model, promptLength: messages.length, contentLength: content.length },
      );
      return { success: true, content, endpoint: url, raw: data };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const next = chain[index + 1];
      if (!next || !isConnectionFailure(err)) break;
      centralLogHub.addLog(
        "Qwen Vision",
        "WARN",
        `Qwen endpoint ${url} unreachable (${lastError}); falling back to ${next}`,
        { model, error: lastError, from: url, to: next },
      );
    }
  }

  centralLogHub.addLog("Qwen Vision", "WARN", `Qwen request failed: ${lastError}`, {
    model,
    error: lastError,
  });
  return { success: false, content: "", error: lastError };
}
