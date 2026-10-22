/**
 * Follow-up / feedback ledger: every AI proposal, the user's decision on it,
 * workflow extensions derived from that feedback, and the observed outcome.
 */

export const LEDGER_KINDS = ["proposal", "decision", "extension", "outcome"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_DECISIONS = ["approved", "rejected", "edited"] as const;
export type LedgerDecision = (typeof LEDGER_DECISIONS)[number];

export const LEDGER_OUTCOMES = ["succeeded", "failed", "abandoned"] as const;
export type LedgerOutcome = (typeof LEDGER_OUTCOMES)[number];

interface LedgerEntryBase {
  id: string;
  kind: LedgerKind;
  /** The proposal every entry of one follow-up chain links to. */
  proposalId: string;
  /** What the proposal was about (fix, improvement, goal_plan, ...); used to feed past feedback back. */
  topic: string;
  createdAt: string;
}

export interface ProposalEntry extends LedgerEntryBase {
  kind: "proposal";
  summary: string;
  source: string;
  workflowId?: string;
  /** The past feedback lines this proposal was made with. */
  priorFeedback: string[];
}

export interface DecisionEntry extends LedgerEntryBase {
  kind: "decision";
  decision: LedgerDecision;
  originalText?: string;
  editedText?: string;
  comment?: string;
}

export interface ExtensionEntry extends LedgerEntryBase {
  kind: "extension";
  workflowId?: string;
  description: string;
  addedSteps: number;
}

export interface OutcomeEntry extends LedgerEntryBase {
  kind: "outcome";
  outcome: LedgerOutcome;
  detail: string;
}

export type LedgerEntry = ProposalEntry | DecisionEntry | ExtensionEntry | OutcomeEntry;

/** One proposal with everything recorded after it, in order. */
export interface FollowUpThread {
  proposal: ProposalEntry;
  entries: LedgerEntry[];
  /** Latest decision, if any. */
  decision?: LedgerDecision;
  /** Latest outcome, if any. */
  outcome?: LedgerOutcome;
}
