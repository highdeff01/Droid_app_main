import { describe, expect, it } from "vitest";
import { HabitTracker } from "./habit-tracker";
import { applyDelayMultiplier } from "../shared/learning";

describe("HabitTracker profile", () => {
  it("starts with an empty, honest profile", () => {
    const tracker = new HabitTracker();
    const profile = tracker.profile(0);

    expect(profile.totalActionsRecorded).toBe(0);
    expect(profile.topClickZones).toEqual([]);
    expect(profile.repetitiveActionDetected).toBe(false);
    expect(profile.repetitiveActionCount).toBe(0);
    expect(profile.habitDetectionRate).toBeNull();
    expect(profile.appUsageFrequencies).toEqual({});
    expect(profile.gateStats).toEqual({
      attempts: 0,
      verified: 0,
      blocked: 0,
      targetNotFound: 0,
      overrides: 0,
      successRate: null,
    });
    expect(profile.corrections).toEqual({ count: 0, meanDx: null, meanDy: null });
    expect(profile.movement).toEqual({
      delayMultiplier: 1,
      userAdjusted: false,
      preferredZones: [],
    });
  });

  it("passes learnedWorkflowsCount straight through", () => {
    const tracker = new HabitTracker();
    expect(tracker.profile(7).learnedWorkflowsCount).toBe(7);
  });

  it("clusters nearby clicks into one zone, ranked by count", () => {
    const tracker = new HabitTracker();
    tracker.recordAction({ type: "click", x: 200, y: 300 });
    tracker.recordAction({ type: "click", x: 210, y: 305 });
    tracker.recordAction({ type: "click", x: 205, y: 298 });
    tracker.recordAction({ type: "type", x: 900, y: 100, text: "hello" });

    const { topClickZones } = tracker.profile(0);

    expect(topClickZones[0].count).toBe(3);
    expect(topClickZones[0].label).toBe("click");
    expect(topClickZones[0].x).toBeCloseTo(205);
    expect(topClickZones[0].y).toBeCloseTo(301);
    expect(topClickZones[1].count).toBe(1);
  });

  it("detects a repeated action type in the recent window", () => {
    const tracker = new HabitTracker();
    tracker.recordAction({ type: "type", x: 900, y: 100 });
    tracker.recordAction({ type: "click", x: 200, y: 300 });
    tracker.recordAction({ type: "click", x: 210, y: 305 });
    tracker.recordAction({ type: "click", x: 205, y: 298 });

    const profile = tracker.profile(0);

    expect(profile.repetitiveActionDetected).toBe(true);
    expect(profile.repetitiveActionCount).toBe(3);
    expect(profile.habitDetectionRate).toBeCloseTo(0.75);
  });
});

describe("HabitTracker outcomes", () => {
  it("computes gate stats and success rate from recorded outcomes", () => {
    const tracker = new HabitTracker();
    tracker.recordOutcome({ kind: "gate_verified" });
    tracker.recordOutcome({ kind: "gate_verified" });
    tracker.recordOutcome({ kind: "gate_verified" });
    tracker.recordOutcome({ kind: "target_not_found" });

    expect(tracker.profile(0).gateStats).toEqual({
      attempts: 4,
      verified: 3,
      blocked: 0,
      targetNotFound: 1,
      overrides: 0,
      successRate: 0.75,
    });
  });

  it("raises the delay multiplier on failure and target-not-found, clamped at the max", () => {
    const tracker = new HabitTracker();
    tracker.recordOutcome({ kind: "step_failed" });
    expect(tracker.profile(0).movement.delayMultiplier).toBeCloseTo(1.1);

    for (let i = 0; i < 20; i++) tracker.recordOutcome({ kind: "target_not_found" });
    expect(tracker.profile(0).movement.delayMultiplier).toBe(2);
  });

  it("lowers the delay multiplier after five consecutive successes, never below the min", () => {
    const tracker = new HabitTracker();
    tracker.recordOutcome({ kind: "step_failed" });
    tracker.recordOutcome({ kind: "step_failed" });
    expect(tracker.profile(0).movement.delayMultiplier).toBeCloseTo(1.2);

    for (let i = 0; i < 5; i++) tracker.recordOutcome({ kind: "step_completed" });
    expect(tracker.profile(0).movement.delayMultiplier).toBeCloseTo(1.1);

    for (let i = 0; i < 5; i++) tracker.recordOutcome({ kind: "step_completed" });
    expect(tracker.profile(0).movement.delayMultiplier).toBeCloseTo(1);

    for (let i = 0; i < 5; i++) tracker.recordOutcome({ kind: "step_completed" });
    expect(tracker.profile(0).movement.delayMultiplier).toBe(1);
  });

  it("feeds completed steps with coordinates into movement.preferredZones", () => {
    const tracker = new HabitTracker();
    tracker.recordOutcome({ kind: "step_completed", x: 150, y: 250, label: "click" });
    tracker.recordOutcome({ kind: "step_completed", x: 155, y: 252, label: "click" });

    const { preferredZones } = tracker.profile(0).movement;

    expect(preferredZones).toHaveLength(1);
    expect(preferredZones[0].count).toBe(2);
    expect(preferredZones[0].label).toBe("click");
  });

  it("computes mean dx/dy from coordinate corrections", () => {
    const tracker = new HabitTracker();
    tracker.recordOutcome({ kind: "coordinate_correction", dx: 4, dy: -2 });
    tracker.recordOutcome({ kind: "coordinate_correction", dx: 2, dy: 0 });

    const { corrections } = tracker.profile(0);

    expect(corrections.count).toBe(2);
    expect(corrections.meanDx).toBeCloseTo(3);
    expect(corrections.meanDy).toBeCloseTo(-1);
  });

  it("lets the user pin a delay multiplier, clamps it, and resumes learning on null", () => {
    const tracker = new HabitTracker();

    tracker.setDelayMultiplier(1.5);
    let movement = tracker.profile(0).movement;
    expect(movement.delayMultiplier).toBeCloseTo(1.5);
    expect(movement.userAdjusted).toBe(true);

    tracker.recordOutcome({ kind: "step_failed" });
    movement = tracker.profile(0).movement;
    expect(movement.delayMultiplier).toBeCloseTo(1.5);
    expect(movement.userAdjusted).toBe(true);

    tracker.setDelayMultiplier(5);
    expect(tracker.profile(0).movement.delayMultiplier).toBe(2);

    tracker.setDelayMultiplier(null);
    expect(tracker.profile(0).movement.userAdjusted).toBe(false);

    for (let i = 0; i < 5; i++) tracker.recordOutcome({ kind: "step_completed" });
    expect(tracker.profile(0).movement.delayMultiplier).toBeCloseTo(1.9);
  });
});

describe("applyDelayMultiplier", () => {
  it("scales a delay by the multiplier and rounds to an integer", () => {
    const result = applyDelayMultiplier(400, 1.5);
    expect(result).toBe(600);
    expect(Number.isInteger(result)).toBe(true);
  });
});
