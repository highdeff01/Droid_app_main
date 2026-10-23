import { describe, expect, it } from "vitest";
import { CAPTURE_BACKOFF_MAX_MS, CAPTURE_POLL_MS, captureDelayMs, nextFailureStreak, type CaptureOutcome } from "./capture-backoff";

describe("captureDelayMs", () => {
  it("polls at 600 ms with no failures and doubles per consecutive failure up to the cap", () => {
    expect(CAPTURE_POLL_MS).toBe(600);
    expect([0, 1, 2, 3, 4].map((n) => captureDelayMs(n, false))).toEqual([600, 1200, 2400, 4800, 9600]);
    expect(captureDelayMs(5, false)).toBe(10_000);
  });

  it("never exceeds the cap and never stops polling", () => {
    for (let n = 0; n <= 50; n++) {
      const delay = captureDelayMs(n, false);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(CAPTURE_BACKOFF_MAX_MS);
    }
    expect(captureDelayMs(1000, false)).toBe(CAPTURE_BACKOFF_MAX_MS);
  });

  it("uses the slow capped retry while the backend-unreachable banner is shown, even with no failures", () => {
    expect(captureDelayMs(0, true)).toBe(CAPTURE_BACKOFF_MAX_MS);
    expect(captureDelayMs(3, true)).toBe(CAPTURE_BACKOFF_MAX_MS);
  });
});

describe("nextFailureStreak", () => {
  const run = (outcomes: CaptureOutcome[]) => outcomes.reduce(nextFailureStreak, 0);

  it("grows on consecutive failures", () => {
    expect(run(["failure", "failure", "failure"])).toBe(3);
  });

  it("keeps backing off through a standby reply; only a real frame resets to normal polling", () => {
    const streak = run(["failure", "failure", "failure", "standby", "failure"]);
    expect(streak).toBe(4);
    expect(captureDelayMs(streak, false)).toBe(9600);
    const recovered = nextFailureStreak(streak, "frame");
    expect(recovered).toBe(0);
    expect(captureDelayMs(recovered, false)).toBe(600);
  });

  it("stays at normal cadence while frames keep arriving", () => {
    expect(run(["frame", "frame", "standby", "frame"])).toBe(0);
  });
});
