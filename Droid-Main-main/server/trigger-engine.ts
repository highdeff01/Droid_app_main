import type {
  CompanionTrigger,
  PendingCompanionAction,
  TriggerAction,
  TriggerActionKind,
  TriggerCondition,
  TriggerConditionKind,
  TriggerObservation,
} from "@shared/companion";
import type { DurableStore } from "./durable-store";
import { CompanionCollection, createCompanionId, nowIso } from "./companion-store";
import type { ErrorBus } from "./error-bus";
import type { NotesStore } from "./notes-store";

export const MIN_TRIGGER_INTERVAL_MS = 5000;

export interface TriggerInput {
  name: string;
  enabled?: boolean;
  condition: TriggerCondition;
  action: TriggerAction;
}

export interface TriggerFiring {
  triggerId: string;
  action: TriggerActionKind;
  noteId?: string;
  pendingActionId?: string;
}

const includes = (text: string | undefined, pattern: string) =>
  !!text && text.toLowerCase().includes(pattern.toLowerCase());

const elementVisible = (obs: TriggerObservation, pattern: string) =>
  (obs.elements ?? []).some((e) => includes(e.name, pattern) || includes(e.textValue, pattern));

/** Whether a condition holds on this observation (time_interval is handled separately). */
const MATCHERS: Record<
  Exclude<TriggerConditionKind, "time_interval">,
  (obs: TriggerObservation, pattern: string) => boolean
> = {
  screen_state: (obs, p) => includes(obs.screenDescription, p),
  element_appears: elementVisible,
  element_disappears: (obs, p) => !elementVisible(obs, p),
  ocr_text: (obs, p) => includes(obs.ocrText, p),
  error_observed: (obs, p) => (obs.errors ?? []).some((e) => includes(e, p)),
};

/** Edge-triggered kinds fire only when the condition starts to hold. */
const EDGE_TRIGGERED = new Set<TriggerConditionKind>([
  "screen_state",
  "element_appears",
  "element_disappears",
  "ocr_text",
]);

/** The data an observation must carry for a condition kind to be evaluated at all. */
const REQUIRED_DATA: Record<Exclude<TriggerConditionKind, "time_interval">, (o: TriggerObservation) => boolean> = {
  screen_state: (o) => typeof o.screenDescription === "string",
  element_appears: (o) => Array.isArray(o.elements),
  element_disappears: (o) => Array.isArray(o.elements),
  ocr_text: (o) => typeof o.ocrText === "string",
  error_observed: (o) => Array.isArray(o.errors),
};

export function validateTriggerInput(input: TriggerInput): string | undefined {
  if (!input?.name?.trim()) return "A trigger needs a name";
  const { condition, action } = input;
  if (!condition || !(condition.kind in REQUIRED_DATA || condition.kind === "time_interval"))
    return "Unknown trigger condition";
  if (condition.kind === "time_interval") {
    if (!(Number(condition.intervalMs) >= MIN_TRIGGER_INTERVAL_MS))
      return `time_interval needs intervalMs of at least ${MIN_TRIGGER_INTERVAL_MS}`;
  } else if (!condition.pattern?.trim()) return `${condition.kind} needs a pattern`;
  if (!action || !ACTION_KINDS.includes(action.kind)) return "Unknown trigger action";
  if ((action.kind === "run_workflow" || action.kind === "ask_approval") && !action.workflowId)
    return `${action.kind} needs a workflowId`;
  return undefined;
}

const ACTION_KINDS: TriggerActionKind[] = [
  "run_workflow",
  "take_note",
  "capture_screenshot",
  "notify_user",
  "ask_approval",
];

/**
 * Persists user-defined triggers and evaluates them against fresh captures.
 * Actions that touch the device are queued as pending actions for the client,
 * which runs them through the action gate; nothing here dispatches input.
 */
export class TriggerEngine {
  readonly triggers: CompanionCollection<CompanionTrigger>;
  readonly pendingActions: CompanionCollection<PendingCompanionAction>;

  constructor(
    store: DurableStore,
    private readonly notes: NotesStore,
    private readonly errors: ErrorBus,
  ) {
    this.triggers = new CompanionCollection<CompanionTrigger>(store, "companionTriggers");
    this.pendingActions = new CompanionCollection<PendingCompanionAction>(
      store,
      "companionPendingActions",
    );
  }

  create(input: TriggerInput): CompanionTrigger {
    const problem = validateTriggerInput(input);
    if (problem) throw new Error(problem);
    return this.triggers.insert({
      id: createCompanionId("trigger"),
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      condition: input.condition,
      action: input.action,
      lastMatched: false,
      createdAt: nowIso(),
    });
  }

  update(id: string, changes: Partial<TriggerInput>): CompanionTrigger {
    const existing = this.triggers.get(id);
    if (!existing) throw new Error("Trigger not found");
    const merged = { ...existing, ...changes };
    const problem = validateTriggerInput(merged);
    if (problem) throw new Error(problem);
    return this.triggers.update(id, { ...changes, lastMatched: false });
  }

  list(): CompanionTrigger[] {
    return this.triggers.all();
  }

  remove(id: string): boolean {
    return this.triggers.remove(id);
  }

  /** Whether any enabled trigger needs a screen capture to be evaluated. */
  needsCapture(): boolean {
    return this.list().some((t) => t.enabled && t.condition.kind !== "error_observed");
  }

  /** Evaluates enabled triggers (optionally only some condition kinds) and runs the actions of those that fire. */
  evaluate(observation: TriggerObservation, kinds?: TriggerConditionKind[]): TriggerFiring[] {
    const firings: TriggerFiring[] = [];
    const selected = this.list().filter(
      (t) => t.enabled && (!kinds || kinds.includes(t.condition.kind)),
    );
    for (const trigger of selected) {
      try {
        const firing = this.evaluateOne(trigger, observation);
        if (firing) firings.push(firing);
      } catch (error) {
        this.errors.report({
          source: "trigger",
          message: `Trigger "${trigger.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          screenshot: observation.frame,
        });
      }
    }
    return firings;
  }

  listPendingActions(): PendingCompanionAction[] {
    return this.pendingActions
      .all()
      .filter((a) => a.status === "pending" || a.status === "approved")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** User decision on a pending action; approval only allows the client to run it through the gate. */
  decidePendingAction(id: string, approved: boolean): PendingCompanionAction {
    const action = this.pendingActions.get(id);
    if (!action) throw new Error("Pending action not found");
    if (action.status !== "pending") throw new Error(`Action already ${action.status}`);
    return this.pendingActions.update(id, { status: approved ? "approved" : "rejected" })!;
  }

  /** The client reports it ran the action (through the gate). */
  markDispatched(id: string): PendingCompanionAction {
    const action = this.pendingActions.get(id);
    if (!action) throw new Error("Pending action not found");
    if (action.requiresApproval && action.status !== "approved")
      throw new Error("This action needs the user's approval first");
    return this.pendingActions.update(id, { status: "dispatched" })!;
  }

  private evaluateOne(trigger: CompanionTrigger, obs: TriggerObservation): TriggerFiring | undefined {
    const { condition } = trigger;
    if (condition.kind === "time_interval") {
      const since = Date.parse(trigger.lastFiredAt ?? trigger.createdAt);
      if (obs.at - since < Math.max(MIN_TRIGGER_INTERVAL_MS, condition.intervalMs ?? 0)) return undefined;
      return this.fire(trigger, obs);
    }
    if (!REQUIRED_DATA[condition.kind](obs)) return undefined;
    const matched = MATCHERS[condition.kind](obs, condition.pattern ?? "");
    const shouldFire = matched && (!EDGE_TRIGGERED.has(condition.kind) || !trigger.lastMatched);
    if (matched !== trigger.lastMatched) this.triggers.update(trigger.id, { lastMatched: matched });
    return shouldFire ? this.fire(trigger, obs) : undefined;
  }

  private fire(trigger: CompanionTrigger, obs: TriggerObservation): TriggerFiring {
    this.triggers.update(trigger.id, { lastFiredAt: new Date(obs.at).toISOString() });
    const result = this.actionHandlers[trigger.action.kind](trigger, obs);
    return { triggerId: trigger.id, action: trigger.action.kind, ...result };
  }

  private recordFired(
    trigger: CompanionTrigger,
    obs: TriggerObservation,
    content: string,
    tags: string[] = [],
  ) {
    return this.notes.recordEvent("trigger_fired", `Trigger fired: ${trigger.name}`, content, obs.frame, [
      trigger.condition.kind,
      ...tags,
    ]).id;
  }

  private queueWorkflow(trigger: CompanionTrigger, requiresApproval: boolean) {
    return this.pendingActions.insert({
      id: createCompanionId("pending"),
      kind: "run_workflow",
      requiresApproval,
      workflowId: trigger.action.workflowId,
      triggerId: trigger.id,
      reason: trigger.action.message || `Trigger "${trigger.name}" fired`,
      status: "pending",
      createdAt: nowIso(),
    }).id;
  }

  private readonly actionHandlers: Record<
    TriggerActionKind,
    (trigger: CompanionTrigger, obs: TriggerObservation) => Omit<TriggerFiring, "triggerId" | "action">
  > = {
    run_workflow: (t) => ({ pendingActionId: this.queueWorkflow(t, false) }),
    ask_approval: (t, obs) => ({
      pendingActionId: this.queueWorkflow(t, true),
      noteId: this.recordFired(t, obs, t.action.message || "Waiting for your approval"),
    }),
    take_note: (t, obs) => ({
      noteId: this.notes.add({
        category: "observation",
        title: t.action.message || `Observed: ${t.name}`,
        content: obs.screenDescription || obs.ocrText || `Trigger "${t.name}" fired`,
        tags: ["trigger", t.condition.kind],
      }).id,
    }),
    capture_screenshot: (t, obs) => ({
      noteId: this.recordFired(t, obs, obs.screenDescription || "Screenshot captured by trigger"),
    }),
    notify_user: (t, obs) => ({
      noteId: this.recordFired(t, obs, t.action.message || `Trigger "${t.name}" fired`, ["notify"]),
    }),
  };
}
