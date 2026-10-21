import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_DRIFT_LABEL,
  buildSyntheticDriftEntry,
  describeSyntheticDriftToast,
  isSyntheticDriftEntry,
} from "./synthetic-drift";

const constant = (v: number) => () => v;
const INVENTED_BRANCHES = ["ocr_landmark_anchor", "visual_template_offset", "cubic_bezier_morph"];

describe("buildSyntheticDriftEntry", () => {
  it.each([0.5, 0.99, 0.01])("marks the entry synthetic and carries no confidence (random=%s)", (r) => {
    const entry = buildSyntheticDriftEntry(4, constant(r));
    expect(entry.source).toBe("synthetic_test");
    expect(entry.status).toBe("synthetic_test");
    expect(entry.recoveryBranch).toBe("synthetic_test");
    expect(INVENTED_BRANCHES).not.toContain(entry.recoveryBranch);
    expect(entry.confidenceScore).toBeUndefined();
    expect(entry.diffScore).toBeUndefined();
    expect(isSyntheticDriftEntry(entry)).toBe(true);
  });

  it("labels every human-readable field as synthetic test data", () => {
    const entry = buildSyntheticDriftEntry(3, constant(0.9));
    for (const text of [entry.stepName, entry.targetElement ?? "", entry.reasoning]) {
      expect(text).toContain(SYNTHETIC_DRIFT_LABEL);
    }
    expect(entry.reasoning).not.toMatch(/Dynamic frame diff detected/);
    expect(entry.reasoning).not.toMatch(/\d+%/);
  });

  it("keeps the drift geometry internally consistent", () => {
    const entry = buildSyntheticDriftEntry(10, constant(0.9));
    const { dx, dy } = entry.driftDelta;
    expect(entry.recalibratedCoords).toEqual({ x: entry.originalCoords.x + dx, y: entry.originalCoords.y + dy });
    expect(entry.driftDistancePx).toBeCloseTo(Math.hypot(dx, dy), 1);
    expect(entry.stepIndex).toBeGreaterThanOrEqual(1);
    expect(entry.stepIndex).toBeLessThanOrEqual(10);
  });

  it("uses step 1 when no sequence is recorded", () => {
    expect(buildSyntheticDriftEntry(0, constant(0.7)).stepIndex).toBe(1);
  });
});

describe("isSyntheticDriftEntry", () => {
  it("does not flag real auto-correction entries, which leave source unset", () => {
    expect(isSyntheticDriftEntry({})).toBe(false);
    expect(isSyntheticDriftEntry({ source: undefined })).toBe(false);
  });
});

describe("describeSyntheticDriftToast", () => {
  it.each([0.5, 0.99])("labels the toast synthetic with no confidence percentage (random=%s)", (r) => {
    const { title, description } = describeSyntheticDriftToast(buildSyntheticDriftEntry(5, constant(r)));
    expect(title).toContain(SYNTHETIC_DRIFT_LABEL);
    expect(description.toLowerCase()).toContain("synthetic");
    expect(`${title} ${description}`).not.toMatch(/\d+%/);
    expect(`${title} ${description}`.toLowerCase()).not.toMatch(/\bwith .*confidence\b/);
  });
});
