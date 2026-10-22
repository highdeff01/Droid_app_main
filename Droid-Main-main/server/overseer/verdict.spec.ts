import { describe, it, expect } from "vitest";
import { applyDrift, assessmentFromModel, decideVerdict, normalizeScore, type StepAssessment } from "./verdict";

const assess = (a: Partial<StepAssessment>): StepAssessment => ({ accuracyScore: null, analysis: "seen", ...a });

describe("decideVerdict", () => {
  it("is uncertain with no score when there is no assessment", () => {
    expect(decideVerdict(null, "no frame", undefined, "click")).toEqual({
      status: "uncertain",
      accuracyScore: null,
      analysis: "no frame",
    });
  });

  it("verifies only with a trusted score", () => {
    expect(decideVerdict(assess({ status: "verified", accuracyScore: 0.9 }), "", undefined, "click").status).toBe("verified");
    expect(decideVerdict(assess({ status: "verified" }), "", undefined, "click").status).toBe("uncertain");
    expect(decideVerdict(assess({ status: "verified", accuracyScore: 0.3 }), "", undefined, "click").status).toBe("uncertain");
  });

  it("applies precedence obstructed > completed_early > off_track > missed", () => {
    expect(decideVerdict(assess({ status: "obstructed", goalFinished: true }), "", undefined, "click").status).toBe("obstructed");
    expect(decideVerdict(assess({ goalFinished: true, onTrack: false }), "", undefined, "click").status).toBe("completed_early");
    expect(decideVerdict(assess({ status: "missed", onTrack: false }), "", undefined, "click").status).toBe("off_track");
    expect(decideVerdict(assess({ status: "verified", accuracyScore: 0.9, expectationMet: false }), "", undefined, "click").status).toBe("missed");
    expect(decideVerdict(assess({ verified: false }), "", undefined, "click").status).toBe("missed");
  });
});

describe("applyDrift", () => {
  const verified = { status: "verified" as const, accuracyScore: 0.9, analysis: "ok" };
  const uncertain = { status: "uncertain" as const, accuracyScore: null, analysis: "?" };
  const same = { identical: true, diffPercent: 0, method: "hash" as const };

  it("never lets an unchanged screen stay verified, and never upgrades", () => {
    expect(applyDrift(verified, same, "click").status).toBe("uncertain");
    expect(applyDrift(uncertain, same, "click").status).toBe("missed");
    expect(applyDrift({ ...uncertain, status: "missed" }, same, "click").status).toBe("missed");
  });

  it("uses the pixel threshold and ignores actions that change nothing", () => {
    expect(applyDrift(verified, { identical: false, diffPercent: 0.2, method: "pixel" }, "click").status).toBe("uncertain");
    expect(applyDrift(verified, { identical: false, diffPercent: 5, method: "pixel" }, "click").status).toBe("verified");
    expect(applyDrift(verified, same, "wait").status).toBe("verified");
  });
});

describe("normalizeScore / assessmentFromModel", () => {
  it("never invents a score", () => {
    expect(normalizeScore(0.8)).toBe(0.8);
    expect(normalizeScore("0.7")).toBe(0.7);
    expect(normalizeScore(85)).toBe(0.85);
    for (const bad of [undefined, Number.NaN, -1, 500]) expect(normalizeScore(bad)).toBeNull();
  });

  it("keeps gaps as null", () => {
    const a = assessmentFromModel({ status: "verified", expectationMet: "yes", suggestedCorrection: { reason: "move left" } });
    expect(a.accuracyScore).toBeNull();
    expect(a.expectationMet).toBeNull();
    expect(a.onTrack).toBeNull();
    expect(a.suggestedCorrection).toBe("move left");
  });
});
