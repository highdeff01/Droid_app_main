/** Result of a Connect attempt: live status of the configured AI endpoint + model. */
export interface AiConnectResult {
  connected: boolean;
  latencyMs: number;
  message: string;
  endpoint: string;
  model: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Status line shown beside the Connect button. */
export function connectStatusText(result: AiConnectResult): string {
  return result.connected ? `Connected (${result.latencyMs}ms)` : `Offline: ${result.message}`;
}

/**
 * Connect = ping the endpoint+model via /api/ai/test-endpoint, and only when it answers
 * persist the URL/model (localStorage + POST /api/ai/settings). A failed ping saves nothing.
 */
export async function connectAiEndpoint(
  endpoint: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): Promise<AiConnectResult> {
  try {
    const res = await fetchImpl("/api/ai/test-endpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, model }),
    });
    const data = await res.json();
    if (data?.success !== true) {
      return { connected: false, latencyMs: 0, message: data?.message || "Endpoint unreachable", endpoint, model };
    }
    localStorage.setItem("ai_model_url", endpoint);
    localStorage.setItem("ai_model_name", model);
    await fetchImpl("/api/ai/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelUrl: endpoint, model }),
    });
    return { connected: true, latencyMs: Number(data.latencyMs) || 0, message: data.message || "Connected", endpoint, model };
  } catch (err) {
    return { connected: false, latencyMs: 0, message: err instanceof Error ? err.message : String(err), endpoint, model };
  }
}
