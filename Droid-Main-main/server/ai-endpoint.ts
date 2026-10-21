/**
 * Resolves the Ollama-compatible vision and chat endpoint used by the AI
 * perception, planner, and copilot engines.
 *
 * Configured Default:
 * URL: https://quantumclaw.net/ollama/api/chat
 * Model: qwen3.5:2b
 */

import { centralLogHub } from "./log-hub";

export const DEFAULT_OLLAMA_ENDPOINT = "https://quantumclaw.net/ollama/api/chat";
export const DEFAULT_QWEN_MODEL = "qwen3.5:2b";

let runtimeConfiguredEndpoint: string =
  process.env.OLLAMA_ENDPOINT || DEFAULT_OLLAMA_ENDPOINT;
let runtimeConfiguredModel: string =
  process.env.OLLAMA_MODEL || DEFAULT_QWEN_MODEL;

export function setConfiguredAiEndpoint(url: string) {
  if (url && typeof url === "string" && url.trim().length > 0) {
    runtimeConfiguredEndpoint = url.trim();
    centralLogHub.addLog(
      "System",
      "INFO",
      `Active AI model URL updated to: ${runtimeConfiguredEndpoint}`
    );
  }
}

export function getConfiguredAiEndpoint(): string {
  return runtimeConfiguredEndpoint || DEFAULT_OLLAMA_ENDPOINT;
}

export function setConfiguredAiModel(model: string) {
  if (model && typeof model === "string" && model.trim().length > 0) {
    runtimeConfiguredModel = model.trim();
  }
}

export function getConfiguredAiModel(): string {
  return runtimeConfiguredModel || DEFAULT_QWEN_MODEL;
}

export function resolveAiEndpoint(provided?: string | null): string {
  const endpoint = (
    provided ??
    runtimeConfiguredEndpoint ??
    process.env.OLLAMA_ENDPOINT ??
    ""
  ).trim();
  if (endpoint.length > 0) {
    if (endpoint.endsWith("/api/chat") || endpoint.endsWith("/api/generate")) {
      return endpoint;
    }
    return endpoint.endsWith("/") ? `${endpoint}api/chat` : `${endpoint}/api/chat`;
  }
  // If no endpoint configured, check if Gemini API key is available
  // If yes, return Gemini endpoint; otherwise use Qwen default as fallback
  return DEFAULT_OLLAMA_ENDPOINT;
}

export function resolveAiModel(providedModel?: string | null): string {
  const model = (
    providedModel ??
    runtimeConfiguredModel ??
    process.env.OLLAMA_MODEL ??
    ""
  ).trim();
  return model.length > 0 ? model : DEFAULT_QWEN_MODEL;
}

export async function testAiEndpoint(
  endpoint?: string,
  model?: string
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
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - startTime;
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON response
    }

    if (response.ok) {
      return {
        success: true,
        status: response.status,
        latencyMs,
        endpoint: targetUrl,
        model: targetModel,
        message: `Endpoint verified successfully (${latencyMs}ms)`,
        data,
      };
    } else {
      return {
        success: false,
        status: response.status,
        latencyMs,
        endpoint: targetUrl,
        model: targetModel,
        message: `HTTP ${response.status}: ${response.statusText}`,
        data,
      };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      latencyMs,
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

/**
 * Dispatches chat request to Qwen Ollama instance (http://192.168.1.100:11434/api/chat)
 */
export async function sendQwenChatRequest(
  messages: QwenChatMessage[],
  options?: {
    endpoint?: string;
    model?: string;
    format?: "json";
    timeoutMs?: number;
  }
): Promise<{ success: boolean; content: string; raw?: any; error?: string }> {
  const targetUrl = resolveAiEndpoint(options?.endpoint);
  const targetModel = resolveAiModel(options?.model);
  const timeoutMs = options?.timeoutMs || 25000;

  const payload: Record<string, any> = {
    model: targetModel,
    messages,
    stream: false,
  };

  if (options?.format === "json") {
    payload.format = "json";
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Qwen HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data?.message?.content || data?.response || "";

    centralLogHub.addLog(
      "Qwen Vision",
      "SUCCESS",
      `Qwen response received (${targetModel} @ ${targetUrl})`,
      { model: targetModel, promptLength: messages.length, contentLength: content.length }
    );

    return {
      success: true,
      content,
      raw: data,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    centralLogHub.addLog(
      "Qwen Vision",
      "WARN",
      `Qwen endpoint connection warning (${targetUrl}): ${errorMsg}`,
      { model: targetModel, error: errorMsg }
    );

    return {
      success: false,
      content: "",
      error: errorMsg,
    };
  }
}
