import { describe, expect, it } from "vitest";
import {
  FORWARD,
  FRESH_FRAME_OPS,
  OPERATION_LABEL,
  OPERATIONS,
  STALE_FRAME_OPS,
  formatChain,
  nextOperation,
} from "./operation-graph";

describe("nextOperation", () => {
  it("forwards a failed start or continue to retry", () => {
    expect(nextOperation("start", "failed")).toBe("retry");
    expect(nextOperation("continue", "failed")).toBe("retry");
  });

  it("forwards an exhausted retry to error_fix", () => {
    expect(nextOperation("retry", "exhausted")).toBe("error_fix");
  });

  it("forwards a successful retry to continue", () => {
    expect(nextOperation("retry", "ok")).toBe("continue");
  });

  it("forwards a blocked start to error_fix", () => {
    expect(nextOperation("start", "blocked")).toBe("error_fix");
  });

  it("forwards a successful plan to apply_plan", () => {
    expect(nextOperation("plan", "ok")).toBe("apply_plan");
  });

  it("forwards a successful apply_plan to simulate", () => {
    expect(nextOperation("apply_plan", "ok")).toBe("simulate");
  });

  it("forwards a successful simulate to start", () => {
    expect(nextOperation("simulate", "ok")).toBe("start");
  });

  it("forwards a blocked simulate to error_fix", () => {
    expect(nextOperation("simulate", "blocked")).toBe("error_fix");
  });

  it("forwards error_fix to apply_plan on ok and to failed on declined", () => {
    expect(nextOperation("error_fix", "ok")).toBe("apply_plan");
    expect(nextOperation("error_fix", "declined")).toBe("failed");
  });

  it("forwards check_completion per outcome", () => {
    expect(nextOperation("check_completion", "complete")).toBe("save_best");
    expect(nextOperation("check_completion", "incomplete")).toBe("continue");
    expect(nextOperation("check_completion", "needs_replan")).toBe("think");
    expect(nextOperation("check_completion", "off_track")).toBe("error_fix");
  });

  it("forwards a successful save_best to done", () => {
    expect(nextOperation("save_best", "ok")).toBe("done");
  });

  it("forwards a successful answer to done", () => {
    expect(nextOperation("answer", "ok")).toBe("done");
  });

  it("throws for an outcome with no forwarding rule", () => {
    expect(() => nextOperation("capture", "ok")).toThrow();
    expect(() => nextOperation("save_best", "failed")).toThrow();
  });
});

describe("FRESH_FRAME_OPS", () => {
  it("contains the operations that act on the current screen", () => {
    for (const op of ["think", "answer", "simulate", "start", "continue", "retry", "error_fix", "check_completion"]) {
      expect(FRESH_FRAME_OPS.has(op as never)).toBe(true);
    }
  });

  it("excludes operations that do not need a fresh frame", () => {
    for (const op of ["plan", "apply_plan", "save_best", "capture"]) {
      expect(FRESH_FRAME_OPS.has(op as never)).toBe(false);
    }
  });

  it("marks apply_plan and retry as invalidating the held frame", () => {
    expect(STALE_FRAME_OPS.has("apply_plan")).toBe(true);
    expect(STALE_FRAME_OPS.has("retry")).toBe(true);
  });
});

describe("formatChain", () => {
  it("joins labels with arrows, including a detail", () => {
    expect(
      formatChain([{ op: "simulate" }, { op: "retry", detail: "step 3" }, { op: "error_fix" }]),
    ).toBe("verifying (dry run) → retrying step 3 → proposing fix");
  });

  it("truncates to the last max links with a leading ellipsis", () => {
    const result = formatChain([{ op: "simulate" }, { op: "retry", detail: "step 3" }, { op: "error_fix" }], 2);
    expect(result.startsWith("… → ")).toBe(true);
    expect(result).toBe("… → retrying step 3 → proposing fix");
  });

  it("returns an empty string for no links", () => {
    expect(formatChain([])).toBe("");
  });
});

describe("FORWARD", () => {
  it("only forwards to a known operation or a chain end", () => {
    const validTargets = new Set<string>([...OPERATIONS, "done", "failed"]);
    for (const rules of Object.values(FORWARD)) {
      for (const target of Object.values(rules)) {
        expect(validTargets.has(target as string)).toBe(true);
      }
    }
  });

  it("gives every operation a label", () => {
    for (const op of OPERATIONS) {
      expect(typeof OPERATION_LABEL[op]).toBe("string");
      expect(OPERATION_LABEL[op].length).toBeGreaterThan(0);
    }
  });
});
