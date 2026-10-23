import { describe, expect, it } from "vitest";
import { replayCursorState } from "./replay-cursor";

const sequence = [
  { id: "s1", name: "Open menu", action: "click", x: 120, y: 340 },
  { id: "s2", name: "Type name", action: "type_text", x: 400, y: 80, targetOcrLabel: "Name field" },
];
const run = (status: "running" | "paused" | "completed" | "failed" | "cancelled", currentStep: number) => ({
  status,
  currentStep,
  steps: sequence.map((s) => ({ id: s.id, status: "pending" as const })),
});

describe("replayCursorState", () => {
  it("moves the cursor to each dispatched step in turn", () => {
    expect(replayCursorState(run("running", 0), sequence)).toEqual({
      x: 120, y: 340, action: "clicking", targetLabel: "Open menu", isActing: true,
    });
    expect(replayCursorState(run("running", 1), sequence)).toEqual({
      x: 400, y: 80, action: "typing", targetLabel: "Name field", isActing: true,
    });
  });

  it("keeps the cursor on the step while paused, not acting", () => {
    expect(replayCursorState(run("paused", 1), sequence)?.isActing).toBe(false);
  });

  it.each(["completed", "failed", "cancelled"] as const)("clears the cursor once the run is %s", (status) => {
    expect(replayCursorState(run(status, 1), sequence)).toBeNull();
  });

  it("returns null for a step the sequence does not contain", () => {
    expect(replayCursorState({ status: "running", currentStep: 0, steps: [{ id: "x", status: "running" }] }, sequence)).toBeNull();
  });
});
