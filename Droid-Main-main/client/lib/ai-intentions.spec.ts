import { describe, expect, it } from "vitest";
import type { ReplayRun } from "@shared/replay";
import type { ClickZone, UserHabitProfile } from "@shared/learning";
import type { GateResult, GateTarget } from "@/lib/action-gate";
import type { ComplexGoal } from "@/components/goals-manager-panel";
import type { SequenceStep } from "@/components/live-screen-hud";
import {
  applyRunToGoal,
  correctionOutcomes,
  deriveIntention,
  formatPercent,
  gateOutcome,
  gateReportFromResult,
  goalExecutionSteps,
  goalFromSequence,
  goalStatusFromRun,
  learningMetrics,
  newStepOutcomes,
  syncGoalsWithRun,
  type GateReport,
} from "./ai-intentions";

/** A ReplayRun fixture; override any field. */
export function makeRun(overrides: Partial<ReplayRun> = {}): ReplayRun {
  return {
    id: "run-1",
    target: "desktop",
    status: "running",
    currentStep: 0,
    iteration: 1,
    completed: 0,
    total: 1,
    steps: [{ id: "s1", status: "pending" }],
    events: [],
    startedAt: 0,
    ...overrides,
  };
}

/** A UserHabitProfile fixture; override any field. */
export function makeProfile(overrides: Partial<UserHabitProfile> = {}): UserHabitProfile {
  return {
    totalActionsRecorded: 0,
    appUsageFrequencies: {},
    topClickZones: [],
    repetitiveActionDetected: false,
    repetitiveActionCount: 0,
    habitDetectionRate: null,
    preferredDevice: "desktop",
    learnedWorkflowsCount: 0,
    gateStats: {
      attempts: 0,
      verified: 0,
      blocked: 0,
      targetNotFound: 0,
      overrides: 0,
      successRate: null,
    },
    corrections: { count: 0, meanDx: null, meanDy: null },
    movement: { delayMultiplier: 1, userAdjusted: false, preferredZones: [] },
    ...overrides,
  };
}

function makeTarget(overrides: Partial<GateTarget> = {}): GateTarget {
  return { x: 10, y: 20, label: "Submit", needsTarget: true, ...overrides };
}

function makeGoal(overrides: Partial<ComplexGoal> = {}): ComplexGoal {
  return {
    id: "goal-1",
    title: "Goal",
    description: "desc",
    priority: 3,
    status: "pending",
    category: "navigation",
    targetRegion: { x: 0, y: 0, width: 0, height: 0 },
    targetCenter: { x: 0, y: 0 },
    targetLabel: "",
    policy: {
      mode: "strict_verification",
      maxRetries: 0,
      timeoutSeconds: 30,
      requireVisualConfirmation: true,
      autoTriggerOnCaptcha: false,
    },
    dependencies: [],
    subtasks: [],
    progressPercent: 0,
    ...overrides,
  };
}

function makeStep(overrides: Partial<SequenceStep> = {}): SequenceStep {
  return {
    id: "step-1",
    stepNumber: 1,
    name: "Click Submit",
    action: "click",
    x: 100,
    y: 200,
    delayMs: 500,
    status: "pending",
    ...overrides,
  };
}

function makeZone(overrides: Partial<ClickZone> = {}): ClickZone {
  return { x: 1, y: 2, count: 3, label: "zone", ...overrides };
}

describe("deriveIntention", () => {
  it("returns null with no gate report and no live run", () => {
    expect(deriveIntention(null, null, [])).toBeNull();
  });

  it("names the current sequence step and progress for a running run, with why from its latest event", () => {
    const sequence = [
      { id: "s1", name: "Click Submit" },
      { id: "s2", name: "Type email" },
    ];
    const run = makeRun({
      status: "running",
      currentStep: 1,
      steps: [
        { id: "s1", status: "completed" },
        { id: "s2", status: "running" },
      ],
      events: [
        { id: "e1", at: 1, stepId: "s1", phase: "perception", detail: "first" },
        { id: "e2", at: 2, stepId: "s2", phase: "planning", detail: "deciding next click" },
      ],
    });

    const intention = deriveIntention(null, run, sequence);

    expect(intention?.what).toContain("Type email");
    expect(intention?.what).toContain("(2/2)");
    expect(intention?.why).toBe("planning: deciding next click");
    expect(intention?.source).toBe("replay");
  });

  it("falls back to a verified gate report mentioning the element name when there is no live run", () => {
    const gate: GateReport = {
      status: "verified",
      stepLabel: "#1 Click Submit",
      targetLabel: "Submit",
      x: 10,
      y: 20,
      elementName: "Submit Button",
      elementsDetected: 5,
    };

    const intention = deriveIntention(gate, null, []);

    expect(intention?.what).toContain("Submit Button");
    expect(intention?.source).toBe("gate");
  });

  it("falls back to a blocked gate report whose why equals the block reason", () => {
    const gate: GateReport = {
      status: "blocked",
      stepLabel: "#2 Submit",
      targetLabel: "Submit",
      x: 1,
      y: 2,
      elementsDetected: 0,
      reason: "Target not found at (1, 2)",
    };

    const intention = deriveIntention(gate, null, []);

    expect(intention?.why).toBe("Target not found at (1, 2)");
  });
});

describe("gateReportFromResult", () => {
  it("reports verified with elementsDetected from the report's elements", () => {
    const target = makeTarget();
    const result: GateResult = {
      status: "verified",
      frame: "f",
      report: { elements: [{}, {}] } as any,
      element: { name: "Submit Button" } as any,
    };

    const report = gateReportFromResult(result, target, "#1");

    expect(report.status).toBe("verified");
    expect(report.elementsDetected).toBe(2);
  });

  it("reports override when a verified result is flagged as a user override", () => {
    const target = makeTarget();
    const result: GateResult = { status: "verified", frame: "f", report: { elements: [] } as any };

    const report = gateReportFromResult(result, target, "#1", true);

    expect(report.status).toBe("override");
  });

  it("reports blocked with elementsDetected and reason taken from the detail", () => {
    const target = makeTarget();
    const result: GateResult = {
      status: "blocked",
      reason: "Target not found",
      detail: {
        stage: "target_not_found",
        x: 10,
        y: 20,
        elementsDetected: 4,
        attempts: 2,
        error: "boom",
      },
    };

    const report = gateReportFromResult(result, target, "#1");

    expect(report.status).toBe("blocked");
    expect(report.elementsDetected).toBe(4);
    expect(report.reason).toBe("Target not found");
  });
});

describe("gateOutcome", () => {
  const target = makeTarget();

  it("maps a verified result to gate_verified", () => {
    const result: GateResult = { status: "verified", frame: "f", report: {} as any };
    expect(gateOutcome(result, target)?.kind).toBe("gate_verified");
  });

  it("maps a blocked target_not_found result to target_not_found", () => {
    const result: GateResult = {
      status: "blocked",
      reason: "not found",
      detail: { stage: "target_not_found", x: 1, y: 2, elementsDetected: 0, attempts: 3, error: "x" },
    };
    expect(gateOutcome(result, target)?.kind).toBe("target_not_found");
  });

  it("maps a blocked capture-stage result to gate_blocked", () => {
    const result: GateResult = {
      status: "blocked",
      reason: "capture failed",
      detail: { stage: "capture", x: 1, y: 2, elementsDetected: null, attempts: 1, error: "x" },
    };
    expect(gateOutcome(result, target)?.kind).toBe("gate_blocked");
  });

  it("returns null for a cancelled result", () => {
    const result: GateResult = { status: "cancelled", reason: "cancelled" };
    expect(gateOutcome(result, target)).toBeNull();
  });
});

describe("goalStatusFromRun", () => {
  it.each([
    ["completed", "completed"],
    ["failed", "failed"],
    ["cancelled", "blocked"],
    ["running", "in_progress"],
    ["paused", "in_progress"],
  ] as const)("maps run status %s to goal status %s", (runStatus, goalStatus) => {
    expect(goalStatusFromRun(makeRun({ status: runStatus }))).toBe(goalStatus);
  });
});

describe("applyRunToGoal", () => {
  it("sets progressPercent to 100 when the run completed", () => {
    const goal = makeGoal({ progressPercent: 10 });
    const run = makeRun({ status: "completed", completed: 1, total: 1 });

    expect(applyRunToGoal(goal, run).progressPercent).toBe(100);
  });

  it("sets progressPercent to completed/total rounded otherwise", () => {
    const goal = makeGoal();
    const run = makeRun({ status: "running", completed: 1, total: 4 });

    expect(applyRunToGoal(goal, run).progressPercent).toBe(25);
  });

  it("checks off subtasks whose id matches a run step id", () => {
    const goal = makeGoal({
      subtasks: [
        { id: "s1", title: "Click", action: "click", status: "pending" },
        { id: "s2", title: "Type", action: "type_text", status: "pending" },
      ],
    });
    const run = makeRun({
      steps: [
        { id: "s1", status: "completed" },
        { id: "s2", status: "pending" },
      ],
    });

    const updated = applyRunToGoal(goal, run);

    expect(updated.subtasks.find((s) => s.id === "s1")?.status).toBe("completed");
    expect(updated.subtasks.find((s) => s.id === "s2")?.status).toBe("pending");
  });
});

describe("syncGoalsWithRun", () => {
  it("only updates goals linked to the run's id", () => {
    const linked = makeGoal({ id: "g1", status: "in_progress" });
    const unlinked = makeGoal({ id: "g2", status: "in_progress", progressPercent: 42 });
    const goals = [linked, unlinked];
    const run = makeRun({ id: "run-1", status: "completed", completed: 1, total: 1 });

    const result = syncGoalsWithRun(goals, { g1: "run-1" }, run);

    expect(result.find((g) => g.id === "g1")?.status).toBe("completed");
    expect(result.find((g) => g.id === "g2")).toBe(unlinked);
  });

  it("returns the same array reference when no goal is linked to the run", () => {
    const goals = [makeGoal({ id: "g1" })];
    const run = makeRun({ id: "run-1" });

    expect(syncGoalsWithRun(goals, {}, run)).toBe(goals);
  });
});

describe("goalFromSequence", () => {
  it("snapshots steps as pending subtasks with zero progress", () => {
    const steps = [makeStep({ id: "s1", name: "Click" }), makeStep({ id: "s2", name: "Type" })];

    const goal = goalFromSequence("goal-1", "My Goal", steps);

    expect(goal.progressPercent).toBe(0);
    expect(goal.status).toBe("pending");
    expect(goal.subtasks).toEqual([
      { id: "s1", title: "Click", action: "click", status: "pending" },
      { id: "s2", title: "Type", action: "click", status: "pending" },
    ]);
  });
});

describe("goalExecutionSteps", () => {
  it("returns the goal's snapshot steps when present", () => {
    const steps = [makeStep({ id: "s1" })];
    const goal = { ...makeGoal(), steps };

    expect(goalExecutionSteps(goal)).toBe(steps);
  });

  it("returns a single click at targetCenter when there is no snapshot", () => {
    const goal = { ...makeGoal({ targetCenter: { x: 150, y: 250 }, targetLabel: "Submit" }) };

    const result = goalExecutionSteps(goal);

    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({ action: "click", x: 150, y: 250, name: "Submit" });
  });

  it("returns null when targetCenter is the (0, 0) default", () => {
    const goal = { ...makeGoal({ targetCenter: { x: 0, y: 0 } }) };

    expect(goalExecutionSteps(goal)).toBeNull();
  });
});

describe("learningMetrics", () => {
  it("returns all-null numbers and empty topZones for no profile", () => {
    const metrics = learningMetrics(null);

    expect(metrics.habitDetectionRate).toBeNull();
    expect(metrics.learnedWorkflows).toBeNull();
    expect(metrics.gateSuccessRate).toBeNull();
    expect(metrics.delayMultiplier).toBeNull();
    expect(metrics.topZones).toEqual([]);
  });

  it("passes through the profile's rates, counts and delay multiplier", () => {
    const profile = makeProfile({
      habitDetectionRate: 0.5,
      learnedWorkflowsCount: 7,
      gateStats: { attempts: 10, verified: 8, blocked: 2, targetNotFound: 1, overrides: 0, successRate: 0.8 },
      movement: { delayMultiplier: 1.4, userAdjusted: true, preferredZones: [] },
    });

    const metrics = learningMetrics(profile);

    expect(metrics.habitDetectionRate).toBe(0.5);
    expect(metrics.learnedWorkflows).toBe(7);
    expect(metrics.gateSuccessRate).toBe(0.8);
    expect(metrics.delayMultiplier).toBe(1.4);
  });
});

describe("formatPercent", () => {
  it("returns an em dash for a null value", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("rounds a fraction to a whole percent", () => {
    expect(formatPercent(0.456)).toBe("46%");
  });
});

describe("newStepOutcomes", () => {
  it("reports each completed or failed step once, and pending steps never", () => {
    const sequence = [makeStep({ id: "s1", name: "Click" }), makeStep({ id: "s2", name: "Type" })];
    const run = makeRun({
      steps: [
        { id: "s1", status: "completed" },
        { id: "s2", status: "failed" },
        { id: "s3", status: "pending" },
      ],
    });
    const seen = new Set<string>();

    const first = newStepOutcomes(run, sequence, seen);
    const second = newStepOutcomes(run, sequence, seen);

    expect(first.map((o) => o.kind)).toEqual(["step_completed", "step_failed"]);
    expect(second).toEqual([]);
  });
});

describe("correctionOutcomes", () => {
  it("keeps only steps with a nonzero coordinate offset", () => {
    const steps = [
      { x: 1, y: 2, name: "A", offsetX: 5, offsetY: 0 },
      { x: 3, y: 4, name: "B", offsetX: 0, offsetY: 0 },
      { x: 5, y: 6, name: "C", offsetY: -2 },
    ];

    const outcomes = correctionOutcomes(steps);

    expect(outcomes).toEqual([
      { kind: "coordinate_correction", x: 1, y: 2, dx: 5, dy: 0, label: "A" },
      { kind: "coordinate_correction", x: 5, y: 6, dx: 0, dy: -2, label: "C" },
    ]);
  });
});
