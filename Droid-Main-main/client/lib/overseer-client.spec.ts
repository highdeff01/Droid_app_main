import { describe, expect, it } from "vitest";
import type { ExecutedStep } from "@shared/goal-loop";
import type { OverseerIntervention, SupervisedOperation } from "@shared/overseer";
import { formatAccuracy, formatDrift, latestCheckups, pendingApprovals } from "./overseer-client";
import { goalStepReport } from "./overseer-goal-run";

function operation(id: string, overrides: Partial<SupervisedOperation> = {}): SupervisedOperation {
  return {
    id,
    kind: "goal_run",
    source: "test",
    goal: `goal ${id}`,
    status: "running",
    priority: 0,
    caps: { maxIterations: null, maxDurationMs: null, maxRepeats: null },
    startedAt: 0,
    lastActivityAt: 0,
    iterations: 0,
    retriesUsed: 0,
    ledger: {},
    verdicts: [],
    directive: "continue",
    ...overrides,
  };
}

describe("overseer console formatting", () => {
  it("shows a missing accuracy score as a dash, never a number", () => {
    expect(formatAccuracy(null)).toBe("—");
    expect(formatAccuracy(undefined)).toBe("—");
    expect(formatAccuracy(0.734)).toBe("73%");
  });

  it("reports drift only as measured", () => {
    expect(formatDrift(undefined)).toBe("not measured");
    expect(formatDrift({ identical: true, diffPercent: 0, method: "hash" })).toBe("no change (identical frames)");
    expect(formatDrift({ identical: false, diffPercent: null, method: "hash" })).toBe("changed (pixel diff not measured)");
    expect(formatDrift({ identical: false, diffPercent: 3.456, method: "pixel" })).toBe("3.46% pixels changed");
  });
});

describe("pendingApprovals", () => {
  it("keeps only interventions waiting on the user, newest first", () => {
    const items: OverseerIntervention[] = [
      { id: "a", operationId: "o", kind: "replan", reason: "r", status: "pending_approval", at: 1 },
      { id: "b", operationId: "o", kind: "pause", reason: "r", status: "applied", at: 2 },
      { id: "c", operationId: "o", kind: "queue", reason: "r", status: "pending_approval", at: 3 },
      { id: "d", operationId: "o", kind: "deprioritize", reason: "r", status: "rejected", at: 4 },
    ];
    expect(pendingApprovals(items).map((i) => i.id)).toEqual(["c", "a"]);
  });
});

describe("latestCheckups", () => {
  it("lists operations with a checkup, newest first, carrying the goal", () => {
    const ops = [
      operation("1", { lastCheckup: { operationId: "1", outcome: "continuing", summary: "s", elapsedSeconds: 60, at: 10 } }),
      operation("2"),
      operation("3", { lastCheckup: { operationId: "3", outcome: "off_track", summary: "s", elapsedSeconds: 90, at: 20 } }),
    ];
    expect(latestCheckups(ops).map((c) => [c.operationId, c.goal])).toEqual([["3", "goal 3"], ["1", "goal 1"]]);
  });
});

describe("goalStepReport", () => {
  it("carries the step, its expectation and the executor's own verification", () => {
    const executed = {
      step: { id: "s1", name: "Open settings", action: "click", x: 10, y: 20, targetLabel: "Settings" },
      verification: { passed: false, screenChanged: true, checks: [] },
      relocation: "same",
      signatureAfter: "sig",
      at: 0,
    } as unknown as ExecutedStep;
    expect(goalStepReport(executed)).toEqual({
      stepId: "s1",
      name: "Open settings",
      action: "click",
      x: 10,
      y: 20,
      text: undefined,
      expectation: 'click on "Settings"',
      executorVerified: false,
    });
  });
});
