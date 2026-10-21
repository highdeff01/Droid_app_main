import { describe, expect, it } from "vitest";
import {
  buildRetryStep,
  clampRepeatCount,
  findRetryableStep,
  replayProgressLabel,
  toReplayStepPayload,
} from "./step-replay";

describe("step-replay", () => {
  describe("clampRepeatCount", () => {
    it("accepts a numeric string", () => {
      expect(clampRepeatCount("3")).toBe(3);
    });

    it("raises a value below the minimum to 1", () => {
      expect(clampRepeatCount(0)).toBe(1);
    });

    it("caps a value above the maximum at 25", () => {
      expect(clampRepeatCount(99)).toBe(25);
    });

    it("rounds a fractional value", () => {
      expect(clampRepeatCount(2.6)).toBe(3);
    });

    it("falls back to 1 for non-numeric input", () => {
      expect(clampRepeatCount(NaN)).toBe(1);
      expect(clampRepeatCount("abc")).toBe(1);
      expect(clampRepeatCount(undefined)).toBe(1);
    });
  });

  describe("toReplayStepPayload", () => {
    it("adds a default repeatCount when missing", () => {
      const payload = toReplayStepPayload({ id: "s1", x: 1, y: 2 });
      expect(payload.repeatCount).toBe(1);
    });

    it("clamps an out-of-range repeatCount", () => {
      const payload = toReplayStepPayload({ id: "s1", x: 1, y: 2, repeatCount: 40 });
      expect(payload.repeatCount).toBe(25);
    });

    it("turns an empty referenceScreenshotUrl into undefined", () => {
      const payload = toReplayStepPayload({ id: "s1", x: 1, y: 2, referenceScreenshotUrl: "" });
      expect(payload.referenceScreenshotUrl).toBeUndefined();
    });

    it("keeps other fields untouched", () => {
      const payload = toReplayStepPayload({
        id: "s1",
        x: 1,
        y: 2,
        referenceScreenshotUrl: "data:image/png;base64,abc",
      });
      expect(payload).toMatchObject({
        id: "s1",
        x: 1,
        y: 2,
        referenceScreenshotUrl: "data:image/png;base64,abc",
      });
    });
  });

  describe("buildRetryStep", () => {
    it("builds a fresh pending single-step run from the source step", () => {
      const retry = buildRetryStep({ id: "s1", x: 5, y: 9, repeatCount: 3, breakpoint: true });
      expect(retry.stepNumber).toBe(1);
      expect(retry.status).toBe("pending");
      expect(retry.breakpoint).toBe(false);
      expect(retry.id).toBe("s1");
      expect(retry.x).toBe(5);
      expect(retry.y).toBe(9);
      expect(retry.repeatCount).toBe(3);
    });
  });

  describe("findRetryableStep", () => {
    const sequence = [
      { id: "a", status: "completed" },
      { id: "b", status: "failed" },
      { id: "c", status: "pending" },
    ];

    it("prefers the failed step id from the run", () => {
      const run = { steps: [{ id: "c", status: "failed" as const }] };
      expect(findRetryableStep(sequence, run, null)?.id).toBe("c");
    });

    it("falls back to the sequence step with status failed when the run has none", () => {
      const run = { steps: [{ id: "a", status: "completed" as const }] };
      expect(findRetryableStep(sequence, run, null)?.id).toBe("b");
    });

    it("falls back to the active step id when nothing failed", () => {
      const sequenceWithoutFailures = sequence.map((s) => ({ ...s, status: "completed" }));
      const run = { steps: [{ id: "a", status: "completed" as const }] };
      expect(findRetryableStep(sequenceWithoutFailures, run, "c")?.id).toBe("c");
    });

    it("returns undefined when there is no failed or active step", () => {
      const sequenceWithoutFailures = sequence.map((s) => ({ ...s, status: "completed" }));
      expect(findRetryableStep(sequenceWithoutFailures, null, null)).toBeUndefined();
    });
  });

  it("replayProgressLabel renders the step, action and iteration counts", () => {
    const label = replayProgressLabel({
      currentStep: 1,
      steps: [{ id: "a", status: "completed" }, { id: "b", status: "running" }, { id: "c", status: "pending" }],
      completed: 4,
      total: 9,
      iteration: 2,
    });
    expect(label).toBe("Step 2/3 • 4/9 actions • iteration 2");
  });
});
