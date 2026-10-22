import type {
  DecisionEntry,
  ExtensionEntry,
  FollowUpThread,
  LedgerDecision,
  LedgerEntry,
  LedgerOutcome,
  OutcomeEntry,
  ProposalEntry,
} from "@shared/feedback";
import type { DurableStore } from "./durable-store";
import { CompanionCollection, createCompanionId, nowIso } from "./companion-store";

export interface ProposalInput {
  proposalId?: string;
  topic: string;
  summary: string;
  source: string;
  workflowId?: string;
}

export interface DecisionInput {
  decision: LedgerDecision;
  originalText?: string;
  editedText?: string;
  comment?: string;
}

/** How many past decisions/outcomes of a topic are fed back into the next proposal. */
export const FEEDBACK_LINES = 5;

/**
 * Durable follow-up ledger: proposal → decision → extension → outcome, linked by
 * proposal id. Past decisions of a topic are fed back into later proposals.
 */
export class FeedbackLedger {
  private readonly entries: CompanionCollection<LedgerEntry>;

  constructor(store: DurableStore) {
    this.entries = new CompanionCollection<LedgerEntry>(store, "feedbackLedger", 5000);
  }

  recordProposal(input: ProposalInput): ProposalEntry {
    const proposalId = input.proposalId ?? createCompanionId("proposal");
    if (this.proposal(proposalId)) throw new Error(`Proposal ${proposalId} is already in the ledger`);
    return this.insert<ProposalEntry>({
      kind: "proposal",
      proposalId,
      topic: input.topic,
      summary: input.summary,
      source: input.source,
      workflowId: input.workflowId,
      priorFeedback: this.feedbackFor(input.topic),
    });
  }

  recordDecision(proposalId: string, input: DecisionInput): DecisionEntry {
    const proposal = this.requireProposal(proposalId);
    if (input.decision === "edited" && !input.editedText?.trim())
      throw new Error("An edited decision needs the edited text");
    return this.insert<DecisionEntry>({
      kind: "decision",
      proposalId,
      topic: proposal.topic,
      decision: input.decision,
      originalText: input.decision === "edited" ? input.originalText ?? proposal.summary : input.originalText,
      editedText: input.editedText,
      comment: input.comment,
    });
  }

  recordExtension(proposalId: string, description: string, addedSteps: number, workflowId?: string): ExtensionEntry {
    const proposal = this.requireProposal(proposalId);
    return this.insert<ExtensionEntry>({
      kind: "extension",
      proposalId,
      topic: proposal.topic,
      description,
      addedSteps,
      workflowId: workflowId ?? proposal.workflowId,
    });
  }

  recordOutcome(proposalId: string, outcome: LedgerOutcome, detail: string): OutcomeEntry {
    const proposal = this.requireProposal(proposalId);
    return this.insert<OutcomeEntry>({ kind: "outcome", proposalId, topic: proposal.topic, outcome, detail });
  }

  /** Every entry of one proposal, oldest first. */
  forProposal(proposalId: string): LedgerEntry[] {
    return this.entries.all().filter((entry) => entry.proposalId === proposalId);
  }

  /** Follow-up threads, newest proposal first, optionally for one topic. */
  threads(topic?: string): FollowUpThread[] {
    const all = this.entries.all();
    return all
      .filter((e): e is ProposalEntry => e.kind === "proposal" && (!topic || e.topic === topic))
      .reverse()
      .map((proposal) => threadOf(proposal, all.filter((e) => e.proposalId === proposal.proposalId)));
  }

  /** Recent decisions and outcomes on a topic as prompt lines for the next proposal. */
  feedbackFor(topic: string): string[] {
    return this.threads(topic)
      .filter((thread) => thread.decision || thread.outcome)
      .slice(0, FEEDBACK_LINES)
      .map(feedbackLine);
  }

  private proposal(proposalId: string): ProposalEntry | undefined {
    return this.entries
      .all()
      .find((e): e is ProposalEntry => e.kind === "proposal" && e.proposalId === proposalId);
  }

  private requireProposal(proposalId: string): ProposalEntry {
    const proposal = this.proposal(proposalId);
    if (!proposal) throw new Error("Proposal not found in the ledger");
    return proposal;
  }

  private insert<T extends LedgerEntry>(entry: Omit<T, "id" | "createdAt">): T {
    return this.entries.insert({ ...entry, id: createCompanionId("ledger"), createdAt: nowIso() } as T) as T;
  }
}

function threadOf(proposal: ProposalEntry, entries: LedgerEntry[]): FollowUpThread {
  const decisions = entries.filter((e): e is DecisionEntry => e.kind === "decision");
  const outcomes = entries.filter((e): e is OutcomeEntry => e.kind === "outcome");
  return {
    proposal,
    entries,
    decision: decisions[decisions.length - 1]?.decision,
    outcome: outcomes[outcomes.length - 1]?.outcome,
  };
}

function feedbackLine(thread: FollowUpThread): string {
  const decision = thread.entries.filter((e): e is DecisionEntry => e.kind === "decision").pop();
  const edited = decision?.decision === "edited" ? ` (user changed it to: ${decision.editedText})` : "";
  const outcome = thread.outcome ? `, outcome ${thread.outcome}` : "";
  return `Past proposal "${thread.proposal.summary}": ${thread.decision ?? "undecided"}${edited}${outcome}`;
}
