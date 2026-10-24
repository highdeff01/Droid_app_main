/**
 * Live AI endpoint status: the latest ping result, set by the startup ping
 * and refreshed by "Ping Endpoint" (/api/ai/test-endpoint) and
 * GET /api/ai/status?refresh=1.
 */

import { centralLogHub } from "./log-hub";
import {
  getConfiguredAiEndpoint,
  getConfiguredAiModel,
  testAiEndpoint,
} from "./ai-endpoint";

export type AiStatusState = "unknown" | "online" | "offline";

export interface AiEndpointStatus {
  state: AiStatusState;
  endpoint: string;
  model: string;
  latencyMs: number | null;
  message: string;
  checkedAt: number | null;
}

type PingResult = Awaited<ReturnType<typeof testAiEndpoint>>;

let lastStatus: AiEndpointStatus | null = null;

export function getAiStatus(): AiEndpointStatus {
  return (
    lastStatus ?? {
      state: "unknown",
      endpoint: getConfiguredAiEndpoint(),
      model: getConfiguredAiModel(),
      latencyMs: null,
      message: "AI endpoint has not been pinged yet",
      checkedAt: null,
    }
  );
}

/** Stores a ping result as the live status. */
export function recordAiPing(result: PingResult): AiEndpointStatus {
  lastStatus = {
    state: result.success ? "online" : "offline",
    endpoint: result.endpoint,
    model: result.model,
    latencyMs: result.success ? result.latencyMs : null,
    message: result.message,
    checkedAt: Date.now(),
  };
  return lastStatus;
}

/** Pings the endpoint and records the outcome. */
export async function pingAiEndpoint(
  endpoint?: string,
  model?: string,
): Promise<AiEndpointStatus> {
  const status = recordAiPing(await testAiEndpoint(endpoint, model));
  centralLogHub.addLog(
    "System",
    status.state === "online" ? "SUCCESS" : "WARN",
    `AI endpoint ${status.endpoint} (${status.model}) ${status.state}: ${status.message}`,
  );
  return status;
}
