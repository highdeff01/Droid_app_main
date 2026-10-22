import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DurableStore } from "./durable-store";
import { NotesStore } from "./notes-store";
import { ErrorBus } from "./error-bus";
import { FeedbackLedger } from "./feedback-ledger";

describe("FeedbackLedger", () => {
  let store: DurableStore;
  let ledger: FeedbackLedger;

  beforeEach(() => {
    store = new DurableStore({ inMemory: true });
    ledger = new FeedbackLedger(store);
  });

  it("survives a new ledger on the same store", () => {
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
    const diskStore = new DurableStore({ storageDir });
    const diskLedger = new FeedbackLedger(diskStore);
    const proposal = diskLedger.recordProposal({ topic: "fix", summary: "Retry with wait", source: "companion" });

    const reopened = new FeedbackLedger(new DurableStore({ storageDir }));
    expect(reopened.forProposal(proposal.proposalId)).toEqual([proposal]);
  });

  it("returns proposal, decision, extension, outcome in order", () => {
    const proposal = ledger.recordProposal({ topic: "fix", summary: "Retry with wait", source: "companion" });
    ledger.recordDecision(proposal.proposalId, { decision: "approved" });
    ledger.recordExtension(proposal.proposalId, "Added a wait step", 1);
    ledger.recordOutcome(proposal.proposalId, "succeeded", "Ran clean on next attempt");

    const entries = ledger.forProposal(proposal.proposalId);
    expect(entries.map((e) => e.kind)).toEqual(["proposal", "decision", "extension", "outcome"]);

    const [thread] = ledger.threads();
    expect(thread.decision).toBe("approved");
    expect(thread.outcome).toBe("succeeded");
  });

  it("keeps original and edited text", () => {
    const proposal = ledger.recordProposal({ topic: "fix", summary: "Retry with wait", source: "companion" });
    const decision = ledger.recordDecision(proposal.proposalId, { decision: "edited", editedText: "Retry twice" });
    expect(decision.originalText).toBe("Retry with wait");
    expect(decision.editedText).toBe("Retry twice");

    expect(() => ledger.recordDecision(proposal.proposalId, { decision: "edited" })).toThrow();
    expect(() => ledger.recordDecision("missing", { decision: "approved" })).toThrow(/not found/);
  });

  it("feeds past decisions back into the next proposal", () => {
    const proposal = ledger.recordProposal({ topic: "fix", summary: "Retry with wait", source: "companion" });
    ledger.recordDecision(proposal.proposalId, { decision: "rejected" });

    const feedback = ledger.feedbackFor("fix");
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toContain("Retry with wait");
    expect(feedback[0]).toContain("rejected");

    const next = ledger.recordProposal({ topic: "fix", summary: "Retry with longer wait", source: "companion" });
    expect(next.priorFeedback).toEqual(feedback);
    expect(ledger.feedbackFor("improvement")).toEqual([]);
  });

  it("records ErrorBus proposals and decisions", async () => {
    const notes = new NotesStore(store);
    const proposer = vi.fn(async (request: { context: string }) => ({
      summary: "Retry with wait",
      steps: [{ id: "s1", name: "Wait", action: "wait", x: 0, y: 0 }],
    }));
    const bus = new ErrorBus(store, notes, proposer);
    const task = bus.report({ source: "replay", message: "Target not found" });

    const proposal = await bus.proposeFix(task.id);
    bus.decideProposal(proposal.id, false);
    const afterReject = bus.ledger.forProposal(proposal.id);
    expect(afterReject.map((e) => e.kind)).toEqual(["proposal", "decision"]);
    expect(afterReject[1]).toMatchObject({ kind: "decision", decision: "rejected" });

    const task2 = bus.report({ source: "replay", message: "Target not found again" });
    const proposal2 = await bus.proposeFix(task2.id);
    expect(proposer.mock.calls[1][0].context).toContain("rejected");

    bus.decideProposal(proposal2.id, true, { editedText: "x" });
    const afterEdit = bus.ledger.forProposal(proposal2.id);
    expect(afterEdit[1]).toMatchObject({ kind: "decision", decision: "edited", editedText: "x" });
  });
});
