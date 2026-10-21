import { describe, expect, it } from "vitest";
import type { ReplayEvent, ReplayRun } from "@shared/replay";
import { currentTimelineStage, timelineLog, timelineStageStatuses } from "./replay-timeline";

const event = (id: string, phase: ReplayEvent["phase"], at = 1000): ReplayEvent => ({ id, at, phase, detail: `${phase} ${id}` });

const makeRun = (status: ReplayRun["status"], events: ReplayEvent[]): ReplayRun => ({
  id: "run-1",
  target: "desktop",
  status,
  currentStep: 0,
  iteration: 1,
  completed: 2,
  total: 3,
  steps: [],
  events,
  startedAt: 0,
});

describe("replay timeline", () => {
  it("is idle at stage 1 without a run", () => {
    expect(currentTimelineStage(null)).toBe(1);
    expect(timelineStageStatuses(null).every((s) => s === "idle")).toBe(true);
    expect(timelineLog(null)).toEqual([]);
  });

  it("follows the latest real event phase while running", () => {
    const run = makeRun("running", [event("a", "system"), event("b", "execution")]);
    expect(currentTimelineStage(run)).toBe(3);
    expect(timelineStageStatuses(run).slice(0, 4)).toEqual(["done", "done", "running", "idle"]);
  });

  it("marks the current stage failed when the run fails", () => {
    const run = makeRun("failed", [event("a", "verification")]);
    expect(timelineStageStatuses(run)[4]).toBe("failed");
  });

  it("marks every stage done once completed and logs the summary newest first", () => {
    const run = makeRun("completed", [event("a", "system"), event("b", "execution", 2000)]);
    expect(timelineStageStatuses(run).every((s) => s === "done")).toBe(true);
    const log = timelineLog(run);
    expect(log[0]).toMatchObject({ stageNumber: 6, detail: "Run completed: 2/3 actions" });
    expect(log.map((e) => e.id)).toEqual(["run-1-completed", "b", "a"]);
  });
});
