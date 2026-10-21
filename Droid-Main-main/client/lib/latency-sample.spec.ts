import { describe, expect, it, vi } from "vitest";
import {
  LATENCY_HISTORY_LIMIT,
  appendLatencySample,
  createLatencySample,
  latencyStats,
  latencyStatus,
  measureRoundTrip,
} from "./latency-sample";

describe("latency samples", () => {
  it("classifies measured latency", () => {
    expect(latencyStatus(20)).toBe("optimal");
    expect(latencyStatus(60)).toBe("normal");
    expect(latencyStatus(90)).toBe("degraded");
  });

  it("reports no stats before anything is measured", () => {
    expect(latencyStats([])).toBeNull();
  });

  it("computes stats from measured samples only", () => {
    const history = [10, 30, 20].map((ms, i) => createLatencySample(ms, i, "PING"));
    expect(latencyStats(history)).toEqual({ avg: 20, min: 10, max: 30, p95: 30, jitter: 15 });
  });

  it("keeps a bounded history", () => {
    let history = [] as ReturnType<typeof createLatencySample>[];
    for (let i = 0; i < LATENCY_HISTORY_LIMIT + 5; i++) history = appendLatencySample(history, createLatencySample(i, i, "PING"));
    expect(history).toHaveLength(LATENCY_HISTORY_LIMIT);
    expect(history[history.length - 1].roundTripMs).toBe(LATENCY_HISTORY_LIMIT + 4);
  });
});

describe("measureRoundTrip", () => {
  it("returns the elapsed time of a successful request", async () => {
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(142.4);
    await expect(measureRoundTrip("/api/x", async () => ({ ok: true, status: 200 }), now)).resolves.toBe(42);
  });

  it("rejects a failed request instead of recording it", async () => {
    await expect(measureRoundTrip("/api/x", async () => ({ ok: false, status: 503 }), () => 0)).rejects.toThrow(
      "HTTP 503",
    );
  });
});
