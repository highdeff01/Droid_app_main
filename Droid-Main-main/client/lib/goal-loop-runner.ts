/**
 * Goal runs (the "goal-agent" tab) on the shared Qwen turn pipeline: one goal,
 * planned from a fresh screenshot, verified by a dry run, executed step by
 * step through the action gate and the replay engine, retried within bounds,
 * fixed or re-planned only with the user's approval, and checked for
 * completion on a fresh screenshot. Nothing is simulated.
 */
import { defaultTurnDeps, runTurnLoop, type GoalLoopDeps, type TurnLoopOptions } from "@/lib/qwen-turn-loop";
import type { GoalState, GoalStep, PlanProposal, RunEvidence, ExecutedStep } from "@shared/goal-loop";

export {
  GOAL_PHASE_BADGE,
  toReplayStep,
  toSequenceSteps,
  type GoalDevice,
  type GoalLoopDeps,
  type GoalLoopEvent,
  type GoalLoopPhase,
} from "@/lib/qwen-turn-loop";

export interface GoalLoopOptions {
  device: TurnLoopOptions["device"];
  signal: AbortSignal;
  onEvent: TurnLoopOptions["onEvent"];
  onChain?: TurnLoopOptions["onChain"];
  /** Called with the plan whenever it is adopted (initial or approved re-plan). */
  onPlan?: (state: GoalState) => void;
  onStep?: (executed: ExecutedStep, state: GoalState) => void;
  /** Resolves true only when the user approves the corrected proposal. */
  approve: (proposal: PlanProposal) => Promise<boolean>;
}

export type GoalLoopResult =
  | { status: "completed"; state: GoalState; steps: GoalStep[]; evidence: RunEvidence }
  | { status: "failed"; reason: string; state?: GoalState };

/** Plans, tests and self-corrects a goal; resolves with the verified flow or the failure reason. */
export async function runGoalLoop(
  goal: string,
  options: GoalLoopOptions,
  deps: GoalLoopDeps = defaultTurnDeps,
): Promise<GoalLoopResult> {
  const result = await runTurnLoop(goal, { ...options, entry: "think" }, deps);
  if (result.status === "completed") {
    return { status: "completed", state: result.state, steps: result.steps, evidence: result.evidence };
  }
  if (result.status === "failed") return result;
  return { status: "failed", reason: `Unexpected turn result: ${result.status}` };
}
