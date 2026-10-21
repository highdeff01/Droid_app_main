import { beforeEach, describe, expect, it, vi } from "vitest";
import { DurableStore } from "./durable-store";
import { NotesStore } from "./notes-store";
import { ErrorBus } from "./error-bus";

describe("ErrorBus", () => {
  let store: DurableStore;
  let notes: NotesStore;
  let proposer: ReturnType<typeof vi.fn>;
  let bus: ErrorBus;

  const lookupWorkflow = (id: string) =>
    id === "wf1"
      ? { name: "Login", steps: [{ id: "s1", name: "Tap login", action: "click", x: 10, y: 20 }] }
      : undefined;

  beforeEach(() => {
    store = new DurableStore({ inMemory: true });
    notes = new NotesStore(store);
    proposer = vi.fn(async () => ({
      summary: "Retry with wait",
      steps: [{ id: "proposed_1", name: "Wait", action: "wait", x: 0, y: 0, delayMs: 500 }],
    }));
    bus = new ErrorBus(store, notes, proposer, lookupWorkflow);
  });

  const reportFailure = () =>
    bus.report({
      source: "replay",
      message: "Target not found",
      failedStep: { name: "Tap login", action: "click", x: 10, y: 20 },
      screenshot: "data:image/png;base64,AAAA",
      workflowId: "wf1",
    });

  it("report() creates an open fix task carrying the error, failed step, screenshot and workflowId", () => {
    const task = reportFailure();
    expect(task.status).toBe("open");
    expect(task.error).toBe("Target not found");
    expect(task.failedStep).toEqual({ name: "Tap login", action: "click", x: 10, y: 20 });
    expect(task.screenshot).toBe("data:image/png;base64,AAAA");
    expect(task.workflowId).toBe("wf1");
    expect(task.title).toContain("Tap login");
    expect(bus.listTasks()).toContainEqual(task);
  });

  it("report() records a matching error note linked to the task", () => {
    const task = reportFailure();
    const note = notes.list().find((n) => n.event === "error");
    expect(note?.tags).toContain("replay");
    expect(note?.screenshot).toBe(task.screenshot);
    expect(note?.id).toBe(task.noteId);
  });

  it("notifies onError listeners with the event and task, and unsubscribe stops further calls", () => {
    const listener = vi.fn();
    const unsubscribe = bus.onError(listener);
    const task = reportFailure();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ message: "Target not found" }), task);
    unsubscribe();
    reportFailure();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("report() does not call the proposer", () => {
    reportFailure();
    expect(proposer).not.toHaveBeenCalled();
  });

  it("proposeFix() calls the proposer with the workflow's current steps and the task screenshot", async () => {
    const task = reportFailure();
    const proposal = await bus.proposeFix(task.id);
    expect(proposer).toHaveBeenCalledTimes(1);
    expect(proposer).toHaveBeenCalledWith(
      expect.objectContaining({
        currentSteps: [{ id: "s1", name: "Tap login", action: "click", x: 10, y: 20 }],
        screenshot: task.screenshot,
      }),
    );
    expect(proposal.origin).toBe("fix");
    expect(proposal.status).toBe("proposed");
    expect(proposal.taskId).toBe(task.id);
    const updated = bus.listTasks().find((t) => t.id === task.id)!;
    expect(updated.status).toBe("proposed");
    expect(updated.proposalId).toBe(proposal.id);
  });

  it("decideProposal(id, true) approves the proposal and the task; deciding again throws", async () => {
    const task = reportFailure();
    const proposal = await bus.proposeFix(task.id);
    const decided = bus.decideProposal(proposal.id, true);
    expect(decided.status).toBe("approved");
    expect(bus.listTasks().find((t) => t.id === task.id)!.status).toBe("approved");
    expect(() => bus.decideProposal(proposal.id, true)).toThrow();
  });

  it("decideProposal(id, false) rejects the proposal and returns its task to open", async () => {
    const task = reportFailure();
    const proposal = await bus.proposeFix(task.id);
    const decided = bus.decideProposal(proposal.id, false);
    expect(decided.status).toBe("rejected");
    expect(bus.listTasks().find((t) => t.id === task.id)!.status).toBe("open");
  });

  it("proposeFix() on an unknown task id rejects", async () => {
    await expect(bus.proposeFix("nope")).rejects.toThrow();
  });

  it("proposeFix() leaves the task open with no stored proposal when the proposer rejects", async () => {
    const task = reportFailure();
    const failingBus = new ErrorBus(
      store,
      notes,
      vi.fn(async () => {
        throw new Error("model down");
      }),
      lookupWorkflow,
    );
    await expect(failingBus.proposeFix(task.id)).rejects.toThrow();
    const updated = bus.listTasks().find((t) => t.id === task.id)!;
    expect(updated.status).toBe("open");
    expect(updated.proposalId).toBeUndefined();
  });

  it("proposeImprovement() asks the proposer with context from recent failures for that workflow", async () => {
    reportFailure();
    const proposal = await bus.proposeImprovement("wf1");
    expect(proposal.origin).toBe("improvement");
    expect(proposal.workflowId).toBe("wf1");
    const call = proposer.mock.calls[0][0];
    expect(call.context).toContain("Target not found");
  });

  it("proposeImprovement() on an unknown workflow rejects", async () => {
    await expect(bus.proposeImprovement("nope")).rejects.toThrow();
  });

  it("dismissTask() marks a task dismissed", () => {
    const task = reportFailure();
    const dismissed = bus.dismissTask(task.id);
    expect(dismissed?.status).toBe("dismissed");
  });
});
