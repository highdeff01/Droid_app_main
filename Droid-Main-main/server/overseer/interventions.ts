import type {
  CheckupOutcome,
  InterventionKind,
  OperationDirective,
  OverseerIntervention,
  OverseerVerdictStatus,
} from "../../shared/overseer";

/** Bounded retry: the overseer requests at most this many retries per operation. */
export const MAX_OVERSEER_RETRIES = 2;

/** Pause, bounded retry and cap stops apply at once; everything else is a proposal the user decides. */
const IMMEDIATE: ReadonlySet<InterventionKind> = new Set(["pause", "retry", "cap_stop"]);

export function requiresApproval(kind: InterventionKind): boolean {
  return !IMMEDIATE.has(kind);
}

export interface InterventionPlan {
  kind: InterventionKind;
  reason: string;
}

type VerdictPolicy = (retriesUsed: number) => InterventionPlan | null;

const NO_INTERVENTION: VerdictPolicy = () => null;

/** One policy per verdict; uncertain verdicts are surfaced, never acted on. */
const VERDICT_POLICY: Record<OverseerVerdictStatus, VerdictPolicy> = {
  verified: NO_INTERVENTION,
  uncertain: NO_INTERVENTION,
  completed_early: NO_INTERVENTION,
  obstructed: () => ({ kind: "pause", reason: "Screen is obstructed; paused until the blocker is cleared." }),
  missed: (retriesUsed) =>
    retriesUsed < MAX_OVERSEER_RETRIES
      ? { kind: "retry", reason: `Step missed; retry ${retriesUsed + 1}/${MAX_OVERSEER_RETRIES} requested.` }
      : { kind: "replan", reason: `Step still missed after ${MAX_OVERSEER_RETRIES} retries; replan proposed.` },
  off_track: () => ({ kind: "replan", reason: "Operation drifted off its goal; replan proposed." }),
};

export function interventionForVerdict(
  status: OverseerVerdictStatus,
  retriesUsed: number,
): InterventionPlan | null {
  return VERDICT_POLICY[status](retriesUsed);
}

export function interventionForCheckup(outcome: CheckupOutcome): InterventionPlan | null {
  return outcome === "off_track"
    ? { kind: "replan", reason: "Checkup found the operation off-track; replan proposed." }
    : null;
}

/** The directive an executor receives once an intervention takes effect. */
export const DIRECTIVE_FOR: Record<InterventionKind, OperationDirective> = {
  pause: "pause",
  retry: "retry",
  replan: "replan",
  queue: "pause",
  deprioritize: "continue",
  cap_stop: "stop",
};

export function createIntervention(
  id: string,
  operationId: string,
  plan: InterventionPlan,
  at: number,
  proposal?: string,
): OverseerIntervention {
  return {
    id,
    operationId,
    kind: plan.kind,
    reason: plan.reason,
    status: requiresApproval(plan.kind) ? "pending_approval" : "applied",
    proposal,
    at,
  };
}

/** Records the user's decision; only a pending proposal can be decided, and only once. */
export function decideIntervention(
  intervention: OverseerIntervention,
  approved: boolean,
  at: number,
): OverseerIntervention {
  if (intervention.status !== "pending_approval")
    throw new Error(`Intervention is ${intervention.status}; only pending proposals can be decided`);
  return { ...intervention, status: approved ? "approved" : "rejected", decidedAt: at };
}
