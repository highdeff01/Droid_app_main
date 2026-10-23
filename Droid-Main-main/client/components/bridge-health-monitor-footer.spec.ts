import { describe, expect, it } from "vitest";
import { bridgeStatusLabel } from "./bridge-health-monitor-footer";

describe("bridgeStatusLabel", () => {
  const base = { online: false, paused: false, latencyMs: 12, unreachable: false };

  it("says UNREACHABLE when no JSON API answered, never ONLINE", () => {
    expect(bridgeStatusLabel({ ...base, unreachable: true })).toBe("UNREACHABLE");
  });

  it("says offline when the bridge itself reported down", () => {
    expect(bridgeStatusLabel(base)).toBe("DISCONNECTED / OFFLINE");
  });

  it("says ONLINE only when online is true", () => {
    expect(bridgeStatusLabel({ ...base, online: true })).toBe("ONLINE (12ms latency)");
  });

  it("shows paused ahead of other states", () => {
    expect(bridgeStatusLabel({ ...base, online: true, paused: true })).toBe("PAUSED (MANUAL INTERVENTION)");
  });
});
