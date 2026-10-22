import { describe, it, expect } from "vitest";
import {
  MAX_OVERSEER_RETRIES,
  createIntervention,
  decideIntervention,
  interventionForVerdict,
  requiresApproval,
} from "./interventions";
import { classifyCheckup } from "./checkup";

describe("requiresApproval", () => {
  it("lets only pause, retry and cap stops apply without the user", () => {
    for (const kind of ["pause", "retry", "cap_stop"] as const) expect(requiresApproval(kind)).toBe(false);
    for (const kind of ["replan", "queue", "deprioritize"] as const) expect(requiresApproval(kind)).toBe(true);
  });
});

describe("interventionForVerdict", () => {
  it("does nothing for verified, uncertain and completed_early", () => {
    for (const status of ["verified", "uncertain", "completed_early"] as const) expect(interventionForVerdict(status, 0)).toBeNull();
  });
  it("pauses obstructed, retries missed a bounded number of times, then proposes replan", () => {
    expect(interventionForVerdict("obstructed", 0)?.kind).toBe("pause");
    expect(interventionForVerdict("missed", 0)?.kind).toBe("retry");
    expect(interventionForVerdict("missed", 1)?.kind).toBe("retry");
    expect(interventionForVerdict("missed", MAX_OVERSEER_RETRIES)?.kind).toBe("replan");
    expect(interventionForVerdict("off_track", 0)?.kind).toBe("replan");
  });
});

describe("createIntervention / decideIntervention", () => {
  it("applies pause at once and holds replan for approval", () => {
    expect(createIntervention("i1", "op", { kind: "pause", reason: "r" }, 1).status).toBe("applied");
    expect(createIntervention("i2", "op", { kind: "replan", reason: "r" }, 1).status).toBe("pending_approval");
  });
  it("decides a pending proposal once", () => {
    const pending = createIntervention("i", "op", { kind: "replan", reason: "r" }, 1);
    const approved = decideIntervention(pending, true, 7);
    expect(approved).toMatchObject({ status: "approved", decidedAt: 7 });
    expect(decideIntervention(pending, false, 8).status).toBe("rejected");
    expect(() => decideIntervention(approved, false, 9)).toThrow();
    expect(() => decideIntervention(createIntervention("p", "op", { kind: "pause", reason: "r" }, 1), true, 2)).toThrow();
  });
});

describe("classifyCheckup", () => {
  it("reports complete / continuing / off_track honestly and uncertain without an answer", () => {
    expect(classifyCheckup(null)).toBe("uncertain");
    expect(classifyCheckup({ isFinished: true, onTrack: null, summary: "" })).toBe("complete");
    expect(classifyCheckup({ isFinished: false, onTrack: false, summary: "" })).toBe("off_track");
    expect(classifyCheckup({ isFinished: false, onTrack: true, summary: "" })).toBe("continuing");
    expect(classifyCheckup({ isFinished: null, onTrack: null, summary: "" })).toBe("uncertain");
  });
});
