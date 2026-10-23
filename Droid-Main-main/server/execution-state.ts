import type {
  AllowlistedAction,
  AssistantExecution,
  AssistantPlan,
  ActionExecutionResult,
  ExecutionEvidence,
  ExecutionTimelineEvent,
  PlannedStep,
} from "@shared/assistant";
import { DurableStore, type StorageOptions } from "./durable-store";
import { verifyObservation, type Observation } from "./visual-verification";
import { methodLearningSystem, type LearningContext } from "./method-learning";
import { RealTimeElementTracker } from "./element-tracking";
import { operationBus } from "./overseer/operation-bus";
import type { OperationStepReport } from "../shared/overseer";

const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const ACTION_TIMEOUT_MS = 30_000;
export const EXECUTION_TIMEOUT_MS = 30_000;

/** What the overseer is told about a step the executor just completed. */
function stepReport(step: PlannedStep, action: AllowlistedAction): OperationStepReport {
  return {
    stepId: step.id,
    name: step.title,
    action: action.type,
    x: action.type === "click" ? action.x : undefined,
    y: action.type === "click" ? action.y : undefined,
    text: action.type === "type" ? action.text : undefined,
    expectation: step.description,
    executorVerified: null,
  };
}

/** Steps named as another step's alternate: they only run when approved in that step's place. */
function reserveStepIds(plan: AssistantPlan): Set<string> {
  return new Set(
    plan.steps
      .map((step) => step.adaptive?.retry?.alternateStepId)
      .filter((stepId): stepId is string => Boolean(stepId)),
  );
}

export type SafeActionExecutor = (
  action: AllowlistedAction,
  signal?: AbortSignal,
) => Promise<ActionExecutionResult>;
export type ObservationProvider = (
  step: PlannedStep,
  attempt: number,
) => Promise<Observation>;

const defaultExecutor: SafeActionExecutor = async (action, signal) => {
  if (action.type === "wait") {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, action.durationMs);
      signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
  return {
    actionType: action.type,
    success: action.type === "wait",
    message: action.type === "wait" ? "Wait completed" : "No device adapter is configured for this assistant plan. Use Screen Hub replay.",
  };
};

export class ExecutionStateRepository {
  private readonly store: DurableStore;
  private executions = new Map<string, AssistantExecution>();
  private readonly controls = new Map<
    string,
    { paused: boolean; cancelled: boolean }
  >();
  private readonly elementTrackers = new Map<string, RealTimeElementTracker>();
  /** Step ids held in reserve as alternates, from the plan the execution first started with. */
  private readonly reserves = new Map<string, Set<string>>();
  /** Plan slots where an approved alternate was swapped in; those slots run despite the reserve. */
  private readonly swappedSlots = new Map<string, Set<number>>();

  constructor(
    private readonly executeAction: SafeActionExecutor = defaultExecutor,
    optionsOrObserve: StorageOptions | ObservationProvider = {},
    observe: ObservationProvider = async () => ({}),
    private readonly learningContext?: LearningContext,
  ) {
    const options =
      typeof optionsOrObserve === "function" ? {} : optionsOrObserve;
    this.observe =
      typeof optionsOrObserve === "function" ? optionsOrObserve : observe;
    this.store = new DurableStore(options);
    this.load();
  }

  private readonly observe: ObservationProvider;

  private load() {
    this.executions = new Map(
      this.store
        .readCollection<AssistantExecution>("executions")
        .map((execution) => [execution.id, execution]),
    );
  }

  private persist() {
    this.store.writeCollection("executions", [...this.executions.values()]);
  }

  get(id: string): AssistantExecution | undefined {
    this.load();
    return this.executions.get(id);
  }

  /** Every stored execution, newest first. */
  list(): AssistantExecution[] {
    this.load();
    return [...this.executions.values()].sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
    );
  }

  create(plan: AssistantPlan): AssistantExecution {
    const execution: AssistantExecution = {
      id: id("execution"),
      planId: plan.id,
      sessionId: plan.sessionId,
      status: "pending",
      currentStep: 0,
      totalSteps: plan.steps.length,
      timeline: [],
      results: [],
      evidence: [],
    };
    this.executions.set(execution.id, execution);
    this.persist();
    this.controls.set(execution.id, { paused: false, cancelled: false });
    
    // Initialize element tracker for this execution
    this.elementTrackers.set(execution.id, new RealTimeElementTracker(execution.id));
    
    return execution;
  }

  pause(executionId: string): AssistantExecution | undefined {
    this.load();
    const execution = this.executions.get(executionId);
    const control = this.controls.get(executionId);
    if (
      !execution ||
      !control ||
      !["running", "pending"].includes(execution.status)
    )
      return execution;
    control.paused = true;
    execution.status = "paused";
    this.addEvent(execution, "info", "Execution paused");
    this.persist();
    return execution;
  }

  private cancelHooks = new Map<string, Array<() => void>>();

  addCancelHook(executionId: string, hook: () => void) {
    const list = this.cancelHooks.get(executionId) || [];
    list.push(hook);
    this.cancelHooks.set(executionId, list);
  }

  cancel(executionId: string): AssistantExecution | undefined {
    this.load();
    const execution = this.executions.get(executionId);
    const control = this.controls.get(executionId);
    if (
      !execution ||
      !control ||
      ["completed", "cancelled", "failed"].includes(execution.status)
    )
      return execution;
    control.cancelled = true;
    control.paused = false;
    execution.status = "cancelled";
    execution.completedAt = now();
    this.addEvent(execution, "info", "Execution cancelled");
    this.persist();
    operationBus.finished(executionId, "cancelled");

    const hooks = this.cancelHooks.get(executionId);
    if (hooks) {
      for (const h of hooks) {
        try { h(); } catch {}
      }
      this.cancelHooks.delete(executionId);
    }

    return execution;
  }

  async start(
    execution: AssistantExecution,
    plan: AssistantPlan,
    customExecutor?: SafeActionExecutor
  ) {
    this.load();
    const storedExecution = this.executions.get(execution.id);
    if (storedExecution && storedExecution !== execution) {
      Object.assign(execution, storedExecution);
      this.executions.set(execution.id, execution);
    }
    if (execution.status !== "pending" && execution.status !== "paused")
      return execution;
    const control = this.controls.get(execution.id);
    if (!control) throw new Error("Execution control state not found");
    control.paused = false;
    execution.status = "running";
    execution.pendingApproval = undefined;
    if (!execution.startedAt) this.announce(execution, plan);
    execution.startedAt ??= now();
    this.addEvent(execution, "started", "Execution started");
    this.persist();

    const deadline = Date.now() + EXECUTION_TIMEOUT_MS;
    if (!this.reserves.has(execution.id))
      this.reserves.set(execution.id, reserveStepIds(plan));
    for (
      let index = execution.currentStep;
      index < plan.steps.length;
      index += 1
    ) {
      while (control.paused && !control.cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (control.cancelled) return execution;
      if (Date.now() > deadline)
        return this.fail(execution, "Execution timed out");

      const step = plan.steps[index];
      if (this.isReserved(execution.id, step.id, index)) continue;
      const action = step.action;
      if (!action)
        return this.fail(execution, `Step ${index + 1} has no approved action`);
      execution.currentStep = index + 1;
      this.addEvent(
        execution,
        "started",
        `Running step ${index + 1}`,
        plan.steps[index].id,
      );
      this.persist();
      try {
        if (step.adaptive?.captureBefore) {
          const evidence = await this.captureAndVerify(execution, step, 0);
          if (evidence.verification.status === "uncertain") {
            return this.awaitApproval(execution, step, evidence, true);
          }
        }

        let result = customExecutor
          ? await customExecutor(action)
          : await this.runAction(action);
        execution.results.push(result);
        this.persist();
        if (control.cancelled || (execution.status as string) === "cancelled") return execution;
        if (!result.success) return this.fail(execution, result.message);
        this.addEvent(execution, "completed", result.message, step.id, result);
        operationBus.step(execution.id, stepReport(step, action));

        const verification = step.adaptive?.verification;
        if (verification) {
          const maxAttempts = step.adaptive.retry?.maxAttempts ?? 1;
          let attempt = 1;
          while (true) {
            const evidence = await this.captureAndVerify(
              execution,
              step,
              attempt,
            );
            if (evidence.verification.status === "passed") break;
            if (evidence.verification.status === "uncertain") {
              return this.awaitApproval(execution, step, evidence, false);
            }
            if (attempt >= maxAttempts) {
              const alternateId = step.adaptive.retry?.alternateStepId;
              return alternateId
                ? this.selectAlternate(execution, step, alternateId)
                : this.fail(execution, evidence.verification.reason);
            }
            attempt += 1;
            this.addEvent(
              execution,
              "retry",
              `Verification failed; retrying step ${index + 1} (attempt ${attempt}/${maxAttempts}).`,
              step.id,
              undefined,
              execution.evidence[execution.evidence.length - 1]?.id,
            );
            const delay = Math.min(step.adaptive.retry?.backoffMs ?? 0, 5_000);
            if (delay > 0)
              await new Promise((resolve) => setTimeout(resolve, delay));
            result = customExecutor
              ? await customExecutor(action)
              : await this.runAction(action);
            execution.results.push(result);
            if (control.cancelled || (execution.status as string) === "cancelled") return execution;
            if (!result.success) return this.fail(execution, result.message);
          }
        }
      } catch (error) {
        if (control.cancelled || (execution.status as string) === "cancelled") return execution;
        return this.fail(
          execution,
          error instanceof Error ? error.message : "Action failed",
        );
      }
    }

    execution.status = "completed";
    execution.completedAt = now();
    this.addEvent(execution, "completed", "Execution completed");
    this.persist();
    operationBus.finished(execution.id, "completed");
    
    // Learn from this execution if context is provided
    if (this.learningContext) {
      try {
        methodLearningSystem.learnFromExecution(execution, plan, this.learningContext);
      } catch (error) {
        console.error("Failed to learn from execution:", error);
      }
    }
    
    return execution;
  }

  async approveAlternate(executionId: string, plan: AssistantPlan) {
    const execution = this.executions.get(executionId);
    const pending = execution?.pendingApproval;
    if (!execution || !pending?.alternateStepId) return undefined;
    const currentIndex = plan.steps.findIndex(
      (step) => step.id === pending.stepId,
    );
    const alternate = plan.steps.find(
      (step) => step.id === pending.alternateStepId,
    );
    if (currentIndex < 0 || !alternate) return undefined;
    const alternatePlan = {
      ...plan,
      steps: plan.steps.map((step, index) =>
        index === currentIndex ? { ...alternate, order: step.order } : step,
      ),
    };
    const slots = this.swappedSlots.get(executionId) ?? new Set<number>();
    slots.add(currentIndex);
    this.swappedSlots.set(executionId, slots);
    this.addEvent(
      execution,
      "info",
      `Alternate step ${alternate.id} approved; it replaces step ${currentIndex + 1}.`,
      alternate.id,
    );
    execution.currentStep = currentIndex;
    execution.status = "paused";
    this.persist();
    return this.start(execution, alternatePlan);
  }

  /** Ends an execution awaiting approval as failed; undefined when nothing awaits approval. */
  reject(executionId: string, reason?: string): AssistantExecution | undefined {
    this.load();
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== "awaiting_approval") return undefined;
    const pending = execution.pendingApproval;
    execution.pendingApproval = undefined;
    this.addEvent(
      execution,
      "approval",
      `Approval rejected by user${reason ? `: ${reason}` : ""}`,
      pending?.stepId,
    );
    return this.fail(
      execution,
      `Rejected by user: ${reason || pending?.reason || "no reason given"}`,
    );
  }

  private isReserved(executionId: string, stepId: string, index: number) {
    if (this.swappedSlots.get(executionId)?.has(index)) return false;
    return this.reserves.get(executionId)?.has(stepId) ?? false;
  }

  async approvePending(executionId: string, plan: AssistantPlan) {
    const execution = this.executions.get(executionId);
    const pending = execution?.pendingApproval;
    if (!execution || !pending) return undefined;
    const stepIndex = plan.steps.findIndex(
      (step) => step.id === pending.stepId,
    );
    if (stepIndex < 0) return undefined;
    execution.currentStep = pending.retryStep ? stepIndex : stepIndex + 1;
    execution.status = "paused";
    this.persist();
    return this.start(execution, plan);
  }

  /**
   * Runs one action under ACTION_TIMEOUT_MS. On timeout the in-flight action is
   * cancelled through its AbortSignal (so the device stops instead of carrying
   * on while the run reports failure) and the timer never outlives the action.
   */
  private async runAction(action: AllowlistedAction) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `Action timed out after ${ACTION_TIMEOUT_MS}ms and was cancelled; its effect is uncertain`,
          ),
        );
      }, ACTION_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        this.executeAction(action, controller.signal),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async captureAndVerify(
    execution: AssistantExecution,
    step: PlannedStep,
    attempt: number,
  ): Promise<ExecutionEvidence> {
    this.addEvent(
      execution,
      "capture",
      `Requesting fresh capture for attempt ${attempt}.`,
      step.id,
    );
    const observation = await this.observe(step, attempt);
    
    // Update element tracker with new analysis
    const elementTracker = this.elementTrackers.get(execution.id);
    if (elementTracker && observation.analysis) {
      elementTracker.updateFromAnalysis(observation.analysis, observation.capture?.imageData);
      
      // Use element tracking for adaptive element location
      if (step.adaptive?.verification?.elementLabel) {
        const trackedElement = elementTracker.findElementsByLabel(step.adaptive.verification.elementLabel)[0];
        if (trackedElement && trackedElement.stability > 0.7) {
          // Adjust verification region based on tracked element position
          if (step.adaptive.verification.region) {
            step.adaptive.verification.region = trackedElement.region;
          }
        }
      }
    }
    
    this.addEvent(
      execution,
      "analysis",
      "Fresh capture analysis received.",
      step.id,
    );
    const verification = step.adaptive?.verification
      ? verifyObservation(step.adaptive.verification, observation)
      : observation.analysis
        ? { status: "passed" as const, reason: "Fresh analysis recorded." }
        : {
            status: "uncertain" as const,
            reason:
              "Fresh capture was requested but no analysis was provided; approval is required.",
          };
    const evidence: ExecutionEvidence = {
      id: id("evidence"),
      stepId: step.id,
      attempt,
      capturedAt: now(),
      capture: observation.capture,
      analysis: observation.analysis,
      verification,
    };
    execution.evidence.push(evidence);
    this.addEvent(
      execution,
      "verification",
      verification.reason,
      step.id,
      verification,
      evidence.id,
    );
    return evidence;
  }

  private awaitApproval(
    execution: AssistantExecution,
    step: PlannedStep,
    evidence: ExecutionEvidence,
    retryStep: boolean,
  ) {
    execution.status = "awaiting_approval";
    execution.pendingApproval = {
      stepId: step.id,
      reason: evidence.verification.reason,
      alternateStepId: step.adaptive?.retry?.alternateStepId,
      retryStep,
    };
    this.addEvent(
      execution,
      "approval",
      `Paused for approval: ${evidence.verification.reason}`,
      step.id,
      undefined,
      evidence.id,
    );
    this.persist();
    return execution;
  }

  private selectAlternate(
    execution: AssistantExecution,
    step: PlannedStep,
    alternateStepId: string,
  ) {
    execution.status = "awaiting_approval";
    execution.pendingApproval = {
      stepId: step.id,
      reason: "Verification remained false after the bounded retry limit.",
      alternateStepId,
    };
    this.addEvent(
      execution,
      "alternate",
      `Alternate step ${alternateStepId} is available for explicit approval.`,
      step.id,
    );
    this.persist();
    return execution;
  }

  private fail(execution: AssistantExecution, error: string) {
    execution.status = "failed";
    execution.error = error;
    execution.completedAt = now();
    this.addEvent(execution, "failed", error);
    this.persist();
    operationBus.finished(execution.id, "failed", error);
    return execution;
  }

  /** Registers the execution with the overseer, which can pause or cancel it. */
  private announce(execution: AssistantExecution, plan: AssistantPlan) {
    operationBus.started(
      {
        id: execution.id,
        kind: "assistant_execution",
        source: `assistant-execution / ${execution.sessionId}`,
        goal: plan.instruction?.text || `Plan ${plan.id}`,
      },
      { pause: () => void this.pause(execution.id), cancel: () => void this.cancel(execution.id) },
    );
  }

  private addEvent(
    execution: AssistantExecution,
    status: ExecutionTimelineEvent["status"],
    message: string,
    stepId?: string,
    result?: unknown,
    evidenceId?: string,
  ) {
    execution.timeline.push({
      id: id("event"),
      timestamp: now(),
      status,
      message,
      stepId,
      result,
      evidenceId,
    });
  }
}

export const executionStateRepository = new ExecutionStateRepository();
