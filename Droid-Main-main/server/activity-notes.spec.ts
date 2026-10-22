import { beforeEach, describe, expect, it } from "vitest";
import type { SupervisedOperation } from "@shared/overseer";
import type { SupervisorEvent } from "./overseer/supervisor";
import { DurableStore } from "./durable-store";
import { NotesStore } from "./notes-store";
import { ActivityNotes } from "./activity-notes";

function makeOp(overrides: Partial<SupervisedOperation> = {}): SupervisedOperation {
  return {
    id: "op1",
    kind: "replay",
    source: "hud",
    goal: "Log in",
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

function stepEvent(op: SupervisedOperation, stepId: string, beforeImage?: string): SupervisorEvent {
  return { type: "step", op, report: { stepId, name: `Step ${stepId}`, action: "click", x: 0, y: 0, beforeImage } };
}

describe("ActivityNotes", () => {
  let notes: NotesStore;
  let clock: number;
  let activity: ActivityNotes;

  beforeEach(() => {
    notes = new NotesStore(new DurableStore({ inMemory: true }));
    clock = 0;
    activity = new ActivityNotes(notes, () => clock);
  });

  it("records control times with per-step durations, total and retries on finish", () => {
    const op = makeOp({ startedAt: 0 });
    activity.handle({ type: "started", op });

    clock = 100;
    activity.handle(stepEvent(op, "s1"));
    clock = 250;
    activity.handle(stepEvent(op, "s2"));
    clock = 400;
    activity.handle(stepEvent(op, "s2"));

    clock = 500;
    const finished = { ...op, status: "completed" as const, finishedAt: 500 };
    activity.handle({ type: "finished", op: finished });

    const [note] = notes.list({ tag: "control_time" });
    expect(note.content).toContain("Total 500 ms");
    expect(note.content).toContain("retries=1");
    expect(note.content).toContain("100 ms");
    expect(note.content).toContain("150 ms");

    expect(notes.list({ tag: "workflow_started" })).toHaveLength(1);
  });

  it("notes exactly one screen change when the frame differs, none when it repeats", () => {
    const op = makeOp();
    activity.handle({ type: "started", op });

    activity.handle(stepEvent(op, "s1", "data:image/png;base64,AAA"));
    activity.handle(stepEvent(op, "s2", "data:image/png;base64,AAA"));
    expect(notes.list({ tag: "screen_change" })).toHaveLength(0);

    activity.handle(stepEvent(op, "s3", "data:image/png;base64,BBB"));
    expect(notes.list({ tag: "screen_change" })).toHaveLength(1);
  });

  it("marks a failed finish as workflow_failed with the operation's detail", () => {
    const op = makeOp();
    activity.handle({ type: "started", op });
    const failed = { ...op, status: "failed" as const, finishedAt: 10, detail: "Target not found" };
    const note = activity.handle({ type: "finished", op: failed });
    expect(note?.event).toBe("workflow_failed");
    expect(note?.content).toContain("Target not found");
  });

  it("marks a completed goal run as goal_state / goal_reached", () => {
    const op = makeOp({ kind: "goal_run" });
    activity.handle({ type: "started", op });
    const completed = { ...op, status: "completed" as const, finishedAt: 10 };
    const note = activity.handle({ type: "finished", op: completed });
    expect(note?.category).toBe("goal_state");
    expect(note?.event).toBe("goal_reached");
  });
});
