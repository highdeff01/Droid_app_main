/**
 * Latency telemetry built only from measured HTTP round trips; there is no
 * synthetic data. When nothing has been measured yet, stats are null.
 */

export type LatencyStatus = "optimal" | "normal" | "degraded";

export interface LatencySample {
  timestamp: number;
  timeLabel: string;
  roundTripMs: number;
  commandType: string;
  status: LatencyStatus;
}

export interface LatencyStats {
  avg: number;
  min: number;
  max: number;
  p95: number;
  jitter: number;
}

export const LATENCY_HISTORY_LIMIT = 20;

export function latencyStatus(ms: number): LatencyStatus {
  if (ms > 70) return "degraded";
  return ms > 45 ? "normal" : "optimal";
}

export function createLatencySample(roundTripMs: number, timestamp: number, commandType: string): LatencySample {
  return {
    timestamp,
    timeLabel: new Date(timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
    roundTripMs,
    commandType,
    status: latencyStatus(roundTripMs),
  };
}

export function appendLatencySample(history: LatencySample[], sample: LatencySample): LatencySample[] {
  return [...history, sample].slice(-LATENCY_HISTORY_LIMIT);
}

export function latencyStats(history: LatencySample[]): LatencyStats | null {
  if (history.length === 0) return null;
  const times = history.map((s) => s.roundTripMs);
  const sorted = [...times].sort((a, b) => a - b);
  let jitterSum = 0;
  for (let i = 1; i < times.length; i++) jitterSum += Math.abs(times[i] - times[i - 1]);
  return {
    avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    jitter: parseFloat((jitterSum / Math.max(1, times.length - 1)).toFixed(1)),
  };
}

/** Times one request; rejects when the endpoint does not answer successfully. */
export async function measureRoundTrip(
  url: string,
  request: (url: string) => Promise<{ ok: boolean; status: number }> = (u) => fetch(u, { cache: "no-store" }),
  now: () => number = () => performance.now(),
): Promise<number> {
  const start = now();
  const response = await request(url);
  const elapsed = Math.round(now() - start);
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return elapsed;
}
