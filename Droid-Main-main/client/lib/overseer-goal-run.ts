import type { ExecutedStep } from "@shared/goal-loop";
import type { OperationDirective, OperationStepReport } from "@shared/overseer";
import { safePostJson } from "@/lib/api-helper";
import { OVERSEER_API, type OverseerResult } from "@/lib/overseer-client";

/** What the overseer is told about one goal-loop step the client executed through the action gate. */
export function goalStepReport(executed: ExecutedStep): OperationStepReport {
  const { step } = executed;
  return {
    stepId: step.id,
    name: step.name,
    action: step.action,
    x: step.x,
    y: step.y,
    text: step.text,
    expectation: step.targetLabel ? `${step.action} on "${step.targetLabel}"` : step.name,
    executorVerified: executed.verification.passed,
  };
}

/** Registers a goal run with the overseer; resolves with the operation id. */
export async function registerGoalRun(goal: string, source: string): Promise<OverseerResult<string>> {
  const data = await safePostJson<{ operation: { id: string } }>(`${OVERSEER_API}/operations`, { kind: "goal_run", source, goal });
  return data.success && data.operation ? { ok: true, value: data.operation.id } : { ok: false, error: data.error || "Overseer registration failed" };
}

/** Sends a step for independent verification; resolves with the overseer's directive for the run. */
export async function reportGoalStep(operationId: string, executed: ExecutedStep): Promise<OverseerResult<OperationDirective>> {
  const data = await safePostJson<{ directive?: OperationDirective }>(
    `${OVERSEER_API}/operations/${encodeURIComponent(operationId)}/steps`,
    { report: goalStepReport(executed) },
  );
  return data.success ? { ok: true, value: data.directive ?? "continue" } : { ok: false, error: data.error || "Overseer step report failed" };
}

export async function finishGoalRun(operationId: string, status: "completed" | "failed" | "cancelled", detail?: string) {
  await safePostJson(`${OVERSEER_API}/operations/${encodeURIComponent(operationId)}/finish`, { status, detail: detail?.slice(0, 2000) });
}
