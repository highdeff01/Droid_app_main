import { describe, it, expect } from "vitest";
import type { SupervisedOperation } from "../../shared/overseer";
import { actionSignature, conflictLoser, detectConflicts, findCapViolation } from "./caps";

function op(overrides: Partial<SupervisedOperation> = {}): SupervisedOperation {
  return {
    id: "a",
    kind: "replay",
    source: "test",
    goal: "g",
    status: "running",
    priority: 0,
    caps: { maxIterations: 5, maxDurationMs: 1000, maxRepeats: 2 },
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

describe("findCapViolation", () => {
  it("is null within caps", () => expect(findCapViolation(op({ iterations: 5, ledger: { x: 2 } }), 1000)).toBeNull());
  it("enforces each cap", () => {
    expect(findCapViolation(op({ iterations: 6 }), 0)?.cap).toBe("maxIterations");
    expect(findCapViolation(op(), 1001)?.cap).toBe("maxDurationMs");
    expect(findCapViolation(op({ ledger: { "click@1,1:": 3 } }), 0)?.cap).toBe("maxRepeats");
  });
  it("treats null caps as disabled", () => {
    const off = { maxIterations: null, maxDurationMs: null, maxRepeats: null };
    expect(findCapViolation(op({ caps: off, iterations: 99, ledger: { x: 99 } }), 1e9)).toBeNull();
  });
});

describe("actionSignature", () => {
  it("rounds coordinates and includes text", () => {
    expect(actionSignature({ action: "click", x: 10.4, y: 19.6, text: "hi" })).toBe("click@10,20:hi");
    expect(actionSignature({ action: "key" })).toBe("key@-:");
  });
});

describe("detectConflicts", () => {
  const r = (x: number) => ({ x, y: 0, width: 100, height: 100 });
  it("reports overlapping running operations with the intersection", () => {
    const conflicts = detectConflicts([op({ id: "a", region: r(0) }), op({ id: "b", region: r(50) })]);
    expect(conflicts).toEqual([{ operationIds: ["a", "b"], region: { x: 50, y: 0, width: 50, height: 100 } }]);
  });
  it("ignores edge-touching, non-running and region-less operations", () => {
    expect(detectConflicts([op({ id: "a", region: r(0) }), op({ id: "b", region: r(100) })])).toEqual([]);
    expect(detectConflicts([op({ id: "a", region: r(0) }), op({ id: "b", region: r(50), status: "paused" })])).toEqual([]);
    expect(detectConflicts([op({ id: "a", region: r(0) }), op({ id: "b" })])).toEqual([]);
  });
  it("finds every pair", () => {
    expect(detectConflicts([op({ id: "a", region: r(0) }), op({ id: "b", region: r(10) }), op({ id: "c", region: r(20) })])).toHaveLength(3);
  });
});

describe("conflictLoser", () => {
  it("yields the lower priority, then the later starter", () => {
    expect(conflictLoser(op({ id: "a", priority: 1 }), op({ id: "b", priority: 0 })).id).toBe("b");
    expect(conflictLoser(op({ id: "a", startedAt: 5 }), op({ id: "b", startedAt: 1 })).id).toBe("a");
  });
});
