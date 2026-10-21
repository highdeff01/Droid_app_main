/**
 * The Master AI's runner table: one function per operation kind, each built on the
 * existing real pipelines — the goal turn loop (runGoalLoop), the verified replay
 * (gate → /api/replay → poll), gated habit routines, companion trigger actions and
 * the Qwen sequence orchestrator. Every AI-initiated device action passes the gate.
 */
import type { SequenceStep } from "@/components/live-screen-hud";
import type { PendingCompanionAction, WorkflowStepDraft } from "@shared/companion";
import type { GoalStep, RunEvidence } from "@shared/goal-loop";
import { companionApi } from "@/lib/companion-api";
import { runGatedSequence } from "@/lib/gated-dispatch";
import { habitRoutinePlan } from "@/lib/gated-plans";
import { runGoalLoop, type GoalDevice, type GoalLoopEvent } from "@/lib/goal-loop-runner";
import {
  FailedMethodLedger,
  type MasterHooks,
  type MasterOperation,
  type OperationContext,
  type OperationOutcome,
  type OperationRunner,
  type RunnerTable,
} from "@/lib/master-ai";
import { runVerifiedReplay } from "@/lib/verified-replay";

export interface GoalPayload {
  goal: string;
}
export interface ReplayPayload {
  steps: SequenceStep[];
}
export interface TriggerPayload {
  action: PendingCompanionAction;
}
export interface HabitPayload {
  x: number;
  y: number;
  repeatCount: number;
}
export interface QwenPayload {
  steps: SequenceStep[];
  objective: string;
}
export interface SavePayload {
  goal: string;
  steps: GoalStep[];
  evidence: RunEvidence;
}

export interface RunnerEnv {
  device: GoalDevice;
  /** Mirrors goal-loop events into the HUD thinking indicator. */
  onLoopEvent?: (event: GoalLoopEvent) => void;
  /** Applies Qwen-optimized steps to the HUD sequence. */
  onSequenceOptimized?: (steps: SequenceStep[]) => void;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** JSON request to an /api endpoint; throws the server's error on failure. */
export async function masterRequest(
  url: string,
  options: { method?: string; body?: unknown; apiKey?: string; signal?: AbortSignal } = {},
): Promise<any> {
  const response = await fetch(url, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(options.apiKey ? { "x-api-key": options.apiKey } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) throw new Error(data?.error || `${url} failed (${response.status})`);
  return data;
}

/** Companion workflow drafts as HUD sequence steps. */
export function draftsToSteps(drafts: WorkflowStepDraft[]): SequenceStep[] {
  return drafts.map((d, index) => ({
    id: d.id,
    stepNumber: index + 1,
    name: d.name,
    action: d.action as SequenceStep["action"],
    x: d.x,
    y: d.y,
    text: d.text,
    keyPayload: d.keyPayload,
    delayMs: d.delayMs ?? 400,
    status: "pending",
  }));
}

/** The turn loop for one goal, under the master's guidance, ledger, caps and approvals. */
function goalRunner(env: RunnerEnv): OperationRunner {
  return async (op, ctx) => {
    const { goal } = op.payload as GoalPayload;
    const result = await runGoalLoop(goal, {
      device: env.device,
      signal: ctx.signal,
      onEvent: (event) => {
        ctx.log(`${event.phase}: ${event.message}`);
        env.onLoopEvent?.(event);
      },
      guidance: () => [...ctx.guidance(), ...ledgerGuidance(ctx)],
      beforeStep: (step) => {
        ctx.countIteration();
        const method = { action: step.action, x: step.x, y: step.y, label: step.targetLabel ?? step.name };
        if (ctx.limits.nonRepetition && ctx.ledger.has(method)) {
          return `"${step.name}" repeats a method that already failed (${FailedMethodLedger.key(method)}); choose another`;
        }
        return null;
      },
      onStep: (executed) => {
        if (executed.verification.passed) return;
        const { step } = executed;
        const why = executed.verification.checks.find((c) => !c.passed)?.detail ?? "verification failed";
        ctx.ledger.record({ action: step.action, x: step.x, y: step.y, label: step.targetLabel ?? step.name }, why);
      },
      approve: (proposal) =>
        ctx.requestApproval(`Error fix proposal (${proposal.reason}): ${proposal.steps.map((s) => s.name).join(" → ")}`),
      onReplayStarted: ctx.registerReplay,
    });
    if (result.status === "failed") return { status: "failed", reason: result.reason };
    return {
      status: "completed",
      detail: `Goal reached with ${result.steps.length} verified step(s)`,
      next: [{ kind: "save_flow", title: `Save best flow: ${goal}`, payload: { goal, steps: result.steps, evidence: result.evidence } }],
    };
  };
}

function ledgerGuidance(ctx: OperationContext): string[] {
  if (!ctx.limits.nonRepetition) return [];
  const failed = ctx.ledger.list();
  return failed.length ? [`Do not repeat these failed methods: ${failed.join("; ")}`] : [];
}

/** Gate → replay → poll for a step list; registers the run so Stop can cancel it. */
async function replaySteps(steps: SequenceStep[], ctx: OperationContext): Promise<number> {
  ctx.countIteration();
  let registered = false;
  const run = await runVerifiedReplay(steps, {
    signal: ctx.signal,
    onProgress: (snapshot) => {
      if (registered) return;
      registered = true;
      ctx.registerReplay(snapshot.id);
    },
  });
  return run.steps?.length ?? steps.length;
}

/** A failed replay is forwarded to a goal run that re-plans from the current screen. */
function replayRunner(): OperationRunner {
  return async (op, ctx) => {
    const { steps } = op.payload as ReplayPayload;
    try {
      const count = await replaySteps(steps, ctx);
      return { status: "completed", detail: `Replay completed (${count} step(s))` };
    } catch (error) {
      const reason = errorText(error);
      if (ctx.signal.aborted) return { status: "failed", reason };
      return {
        status: "failed",
        reason,
        next: [{ kind: "goal", title: `Re-plan: ${op.title}`, payload: { goal: op.title } }],
      };
    }
  };
}

/** A trigger's pending action: approval when required, then its workflow as a gated replay. */
function triggerRunner(): OperationRunner {
  return async (op, ctx) => {
    const { action } = op.payload as TriggerPayload;
    const approved = !action.requiresApproval || (await ctx.requestApproval(`Trigger action: ${action.reason}`));
    const { workflow } = await companionApi.decidePendingAction(action.id, approved);
    if (!approved) return { status: "failed", reason: "Trigger action declined" };
    if (!workflow || workflow.steps.length === 0) return { status: "failed", reason: "Trigger workflow has no steps" };
    await replaySteps(draftsToSteps(workflow.steps), ctx);
    await companionApi.markDispatched(action.id);
    return { status: "completed", detail: `Trigger workflow "${workflow.name}" ran` };
  };
}

function habitRunner(env: RunnerEnv): OperationRunner {
  return async (op, ctx) => {
    const { x, y, repeatCount } = op.payload as HabitPayload;
    ctx.countIteration();
    const result = await runGatedSequence(habitRoutinePlan(x, y, repeatCount), {
      targetDevice: env.device.targetDevice,
      deviceId: env.device.deviceId,
      apiKey: env.device.apiKey,
      signal: ctx.signal,
    });
    if (result.status !== "completed") return { status: "failed", reason: result.reason };
    const reply = result.results[0] as { success?: boolean; error?: string } | undefined;
    if (reply?.success === false) return { status: "failed", reason: reply.error ?? "Device reported failure" };
    return { status: "completed", detail: `Habit routine dispatched (${repeatCount} cycle(s))` };
  };
}

function qwenRunner(env: RunnerEnv): OperationRunner {
  return async (op, ctx) => {
    const { steps, objective } = op.payload as QwenPayload;
    const guidance = ctx.guidance();
    const data = await masterRequest("/api/ai/apply-suggestions-with-qwen", {
      body: { steps, userObjective: guidance.length ? `${objective}. User guidance: ${guidance.join("; ")}` : objective },
      apiKey: env.device.apiKey,
      signal: ctx.signal,
    });
    if (!Array.isArray(data.optimizedSteps)) return { status: "failed", reason: "Qwen returned no optimized steps" };
    env.onSequenceOptimized?.(data.optimizedSteps);
    const made = typeof data.adjustmentsMade === "number" ? data.adjustmentsMade : null;
    return { status: "completed", detail: `Sequence orchestrated${made === null ? "" : ` (${made} adjustment(s))`}` };
  };
}

function saveFlowRunner(env: RunnerEnv): OperationRunner {
  return async (op, ctx) => {
    const { goal, steps, evidence } = op.payload as SavePayload;
    const { flows } = await masterRequest("/api/goal-workflows/flows", { apiKey: env.device.apiKey, signal: ctx.signal });
    const existing = (flows as Array<{ id: string; goal: string }>).find((flow) => flow.goal === goal);
    await masterRequest("/api/goal-workflows/flows", {
      body: { flowId: existing?.id, name: goal.slice(0, 120), goal, steps, evidence },
      apiKey: env.device.apiKey,
      signal: ctx.signal,
    });
    return { status: "completed", detail: "Saved as a new flow version; confirm it as best in the Goal panel" };
  };
}

export function createMasterRunners(env: RunnerEnv): RunnerTable {
  return {
    goal: goalRunner(env),
    replay: replayRunner(),
    trigger: triggerRunner(),
    habit: habitRunner(env),
    qwen_orchestrate: qwenRunner(env),
    save_flow: saveFlowRunner(env),
  };
}

/** Trigger watch on/off and replay cancel against the real endpoints. */
export function createMasterHooks(device: GoalDevice, haltExternal?: () => Promise<string | void>): MasterHooks {
  const { apiKey } = device;
  return {
    enableTriggers: async () => {
      await masterRequest("/api/companion/triggers/watch", {
        body: { targetDevice: device.targetDevice, deviceId: device.deviceId },
        apiKey,
      });
    },
    disableTriggers: async () => {
      await masterRequest("/api/companion/triggers/watch", { method: "DELETE", apiKey });
    },
    cancelReplay: async (runId) => {
      await masterRequest(`/api/replay/${encodeURIComponent(runId)}/cancel`, { body: {}, apiKey });
    },
    haltExternal,
  };
}

/** Pending trigger actions not yet queued; the caller enqueues them as trigger operations. */
export async function newTriggerActions(seen: Set<string>): Promise<PendingCompanionAction[]> {
  const actions = await companionApi.pendingActions();
  const fresh = actions.filter((a) => a.status === "pending" && !seen.has(a.id));
  fresh.forEach((a) => seen.add(a.id));
  return fresh;
}

export type { MasterOperation, OperationOutcome };
