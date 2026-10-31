import { describe, it, expect } from "vitest";
import { BOSS, DrivingState, agreesOnDriving, claimLine, drivingFlag, yieldedLine } from "./driving";

describe("drivingFlag", () => {
  it("names the current driver", () => {
    expect(drivingFlag({ driver: "droid-new", since: 1, reason: "boss" })).toBe("Driving: droid-new");
    expect(drivingFlag({ driver: "droid-main", since: 1, reason: "takeover" })).toBe("Driving: droid-main");
  });
});

describe("agreesOnDriving", () => {
  it("agrees when there is no local claim yet", () => {
    expect(agreesOnDriving(null, { driver: "droid-new", since: 1, reason: "boss" })).toBe(true);
  });

  it("agrees only when the driver matches", () => {
    const local = { driver: "droid-new" as const, since: 1, reason: "boss" };
    expect(agreesOnDriving(local, { driver: "droid-new", since: 2, reason: "still boss" })).toBe(true);
    expect(agreesOnDriving(local, { driver: "droid-main", since: 2, reason: "grabbed" })).toBe(false);
  });
});

describe("DrivingState", () => {
  it("defaults to droid-new as the boss before any claim", () => {
    expect(new DrivingState().orDefault(1000)).toEqual({ driver: BOSS, since: 1000, reason: expect.any(String) });
  });

  it("takes droid-new's claim as the flag", () => {
    const state = new DrivingState();
    expect(state.claim({ driver: "droid-main", since: 5, reason: "handoff" })).toEqual({ driver: "droid-main", since: 5, reason: "handoff" });
    expect(state.get()?.driver).toBe("droid-main");
  });

  it("lets a local takeover hold the wheel until droid-new reports", () => {
    const state = new DrivingState();
    expect(state.takeWheel("main took over a stalled step", 7)).toEqual({ driver: "droid-main", since: 7, reason: "main took over a stalled step" });
  });

  it("copies the claim so a later mutation cannot change the flag", () => {
    const state = new DrivingState();
    const claim = { driver: "droid-new" as const, since: 1, reason: "boss" };
    state.claim(claim);
    claim.reason = "changed";
    expect(state.get()?.reason).toBe("boss");
  });
});

describe("log lines", () => {
  it("names the driver and reason on a claim", () => {
    expect(claimLine({ driver: "droid-new", since: 1, reason: "boss" })).toContain("droid-new is driving");
    expect(claimLine({ driver: "droid-new", since: 1, reason: "boss" })).toContain("boss");
  });

  it("shows both drivers when the wheel moves", () => {
    const line = yieldedLine({ driver: "droid-main", since: 1, reason: "takeover" }, { driver: "droid-new", since: 2, reason: "resumed" });
    expect(line).toContain("droid-main → droid-new");
    expect(line).toContain("resumed");
  });
});
