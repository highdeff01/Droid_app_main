/**
 * Master AI: one session that orchestrates every AI-driven operation on the HUD —
 * goal runs (the turn loop), recorded replays, trigger-fired actions, habit routines
 * and the per-sequence Qwen orchestration. Device-touching operations run one at a
 * time in priority order; the rest interleave. Every operation gets its own
 * AbortController, enforced iteration cap, the session duration cap and the
 * failed-methods ledger. Stop aborts everything and reports what it actually stopped.
 */

export type OperationKind = "goal" | "replay" | "trigger" | "habit" | "qwen_orchestrate" | "save_flow";

export type OperationStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";

/** Device-touching kinds share the screen, so only one of them runs at a time. */
export const DEVICE_KINDS: ReadonlySet<OperationKind> = new Set(["goal", "replay", "trigger", "habit"]);

/** User-requested work outranks routines, which outrank trigger firings. */
export const KIND_PRIORITY: Record<OperationKind, number> = {
  goal: 3,
  replay: 3,
  qwen_orchestrate: 3,
  save_flow: 3,
  habit: 2,
  trigger: 1,
};

export interface MasterLimits {
  /** Device steps (or attempts) one operation may take before it is stopped. */
  maxIterations: number;
  /** The whole session is stopped once it has run this long. */
  maxDurationMs: number;
  /** Refuse a method that already failed instead of repeating it. */
  nonRepetition: boolean;
}

export const DEFAULT_LIMITS: MasterLimits = { maxIterations: 20, maxDurationMs: 30 * 60_000, nonRepetition: true };

export interface OperationRequest {
  kind: OperationKind;
  title: string;
  payload?: unknown;
  /** The operation that forwarded this one (operation graph). */
  parentId?: string;
}

export interface MasterOperation extends Required<Omit<OperationRequest, "parentId">> {
  id: string;
  parentId?: string;
  status: OperationStatus;
  priority: number;
  iterations: number;
  detail: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface ChainEntry {
  at: number;
  operationId?: string;
  kind?: OperationKind;
  message: string;
}

export interface GuidanceEntry {
  id: string;
  text: string;
  at: number;
  /** When a turn first carried it to the model; null until then. */
  appliedAt: number | null;
}

export interface PendingApproval {
  operationId: string;
  prompt: string;
}

export interface StopReport {
  at: number;
  reason: string;
  abortedOperations: string[];
  cancelledQueued: string[];
  declinedApprovals: number;
  replaysCancelled: string[];
  triggersDisabled: boolean;
  /** Operations that had not settled when stop returned; 0 means everything stopped. */
  stillRunning: string[];
  errors: string[];
}

export interface MasterSnapshot {
  active: boolean;
  startedAt: number | null;
  triggersEnabled: boolean;
  limits: MasterLimits;
  operations: MasterOperation[];
  chain: ChainEntry[];
  guidance: GuidanceEntry[];
  approvals: PendingApproval[];
  failedMethods: string[];
  lastStop: StopReport | null;
}

export type OperationOutcome =
  | { status: "completed"; detail: string; next?: OperationRequest[] }
  | { status: "failed"; reason: string; next?: OperationRequest[] };

/** What a runner gets from the master for one operation. */
export interface OperationContext {
  signal: AbortSignal;
  limits: MasterLimits;
  ledger: FailedMethodLedger;
  /** Guidance for the next model turn; marks it applied. */
  guidance: () => string[];
  /** Counts one device step; throws once the iteration cap is exceeded. */
  countIteration: () => void;
  log: (message: string) => void;
  requestApproval: (prompt: string) => Promise<boolean>;
  /** Registers a replay run so Stop can cancel it on the server. */
  registerReplay: (runId: string) => void;
}

export type OperationRunner = (operation: MasterOperation, ctx: OperationContext) => Promise<OperationOutcome>;

export type RunnerTable = Record<OperationKind, OperationRunner>;

export interface MasterHooks {
  enableTriggers: () => Promise<void>;
  disableTriggers: () => Promise<void>;
  cancelReplay: (runId: string) => Promise<void>;
  /** Halts work outside the master (the Dashboard gate and sequence); returns what it did. */
  haltExternal?: () => Promise<string | void>;
}

export interface MasterDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** How long Stop waits for aborted operations to settle. */
  settleMs: number;
}

const defaultDeps: MasterDeps = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  settleMs: 5000,
};

const MAX_CHAIN = 200;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class MasterLimitError extends Error {}

/** Methods (action + rounded point + label) that already failed; never retried as-is. */
export class FailedMethodLedger {
  private readonly methods = new Map<string, string>();

  static key(method: { action: string; x: number; y: number; label?: string }): string {
    const label = (method.label ?? "").trim().toLowerCase();
    return `${method.action}@${Math.round(method.x / 10) * 10},${Math.round(method.y / 10) * 10}:${label}`;
  }

  record(method: { action: string; x: number; y: number; label?: string }, why: string): void {
    this.methods.set(FailedMethodLedger.key(method), why);
  }

  has(method: { action: string; x: number; y: number; label?: string }): boolean {
    return this.methods.has(FailedMethodLedger.key(method));
  }

  list(): string[] {
    return [...this.methods.entries()].map(([key, why]) => `${key} (${why})`);
  }

  clear(): void {
    this.methods.clear();
  }
}

/** Next device operation to start: highest priority, then oldest. */
export function nextDeviceOperation(operations: MasterOperation[]): MasterOperation | undefined {
  return operations
    .filter((op) => op.status === "queued" && DEVICE_KINDS.has(op.kind))
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0];
}

interface Running {
  controller: AbortController;
  done: Promise<void>;
}

export class MasterAiController {
  private readonly listeners = new Set<(snapshot: MasterSnapshot) => void>();
  private readonly running = new Map<string, Running>();
  private readonly approvals = new Map<string, { prompt: string; resolve: (ok: boolean) => void }>();
  private readonly replays = new Map<string, string>();
  private readonly ledger = new FailedMethodLedger();
  private operations: MasterOperation[] = [];
  private chain: ChainEntry[] = [];
  private guidanceEntries: GuidanceEntry[] = [];
  private active = false;
  private startedAt: number | null = null;
  private triggersEnabled = false;
  private durationTimer: unknown = null;
  private lastStop: StopReport | null = null;
  private seq = 0;
  private limits: MasterLimits;

  constructor(
    private readonly runners: RunnerTable,
    private readonly hooks: MasterHooks,
    limits: Partial<MasterLimits> = {},
    private readonly deps: MasterDeps = defaultDeps,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  subscribe(listener: (snapshot: MasterSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): MasterSnapshot {
    return {
      active: this.active,
      startedAt: this.startedAt,
      triggersEnabled: this.triggersEnabled,
      limits: { ...this.limits },
      operations: this.operations.map((op) => ({ ...op })),
      chain: [...this.chain],
      guidance: this.guidanceEntries.map((g) => ({ ...g })),
      approvals: [...this.approvals.entries()].map(([operationId, a]) => ({ operationId, prompt: a.prompt })),
      failedMethods: this.ledger.list(),
      lastStop: this.lastStop,
    };
  }

  setLimits(limits: Partial<MasterLimits>): void {
    this.limits = { ...this.limits, ...limits };
    if (this.active && limits.maxDurationMs !== undefined) this.armDurationCap();
    this.emit();
  }

  /** Starts the session: duration cap armed, trigger evaluation enabled, queue pumping. */
  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.startedAt = this.deps.now();
    this.ledger.clear();
    this.log("Master AI started");
    this.armDurationCap();
    try {
      await this.hooks.enableTriggers();
      this.triggersEnabled = true;
      this.log("Trigger evaluation enabled");
    } catch (error) {
      this.log(`Trigger evaluation could not be enabled: ${errorText(error)}`);
    }
    this.pump();
  }

  enqueue(request: OperationRequest): MasterOperation {
    if (!this.active) throw new Error("Start Master AI before queuing operations");
    const op: MasterOperation = {
      id: `op_${++this.seq}`,
      kind: request.kind,
      title: request.title,
      payload: request.payload,
      parentId: request.parentId,
      status: "queued",
      priority: KIND_PRIORITY[request.kind],
      iterations: 0,
      detail: "Queued",
      createdAt: this.deps.now(),
    };
    this.operations = [...this.operations, op];
    const from = request.parentId ? ` (forwarded from ${request.parentId})` : "";
    this.log(`Queued ${op.kind}: ${op.title}${from}`, op);
    this.pump();
    return op;
  }

  /** Guidance for the next turn of every running and later operation; never interrupts a step. */
  addGuidance(text: string): GuidanceEntry {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Guidance is empty");
    const entry: GuidanceEntry = { id: `g_${++this.seq}`, text: trimmed, at: this.deps.now(), appliedAt: null };
    this.guidanceEntries = [...this.guidanceEntries, entry];
    this.log(`Guidance acknowledged: "${trimmed}" — applied from the next AI turn`);
    return entry;
  }

  answerApproval(operationId: string, approved: boolean): void {
    const pending = this.approvals.get(operationId);
    if (!pending) return;
    this.approvals.delete(operationId);
    this.update(operationId, { status: "running", detail: approved ? "Approved by user" : "Declined by user" });
    this.log(`${approved ? "Approved" : "Declined"}: ${pending.prompt}`, this.find(operationId));
    pending.resolve(approved);
  }

  /** Stops ALL AI operations and reports exactly what was stopped. */
  async stop(reason = "Stopped by user"): Promise<StopReport> {
    const report: StopReport = {
      at: this.deps.now(),
      reason,
      abortedOperations: [],
      cancelledQueued: [],
      declinedApprovals: this.approvals.size,
      replaysCancelled: [],
      triggersDisabled: false,
      stillRunning: [],
      errors: [],
    };
    this.active = false;
    this.clearDurationCap();
    this.cancelQueued(report);
    this.declineApprovals();
    const settling = this.abortRunning(report);
    await this.haltOutside(report);
    await this.waitForSettle(settling, report);
    this.triggersEnabled = false;
    this.lastStop = report;
    this.log(`Master AI stopped: ${reason}`);
    return report;
  }

  private cancelQueued(report: StopReport) {
    for (const op of this.operations.filter((o) => o.status === "queued")) {
      report.cancelledQueued.push(op.title);
      this.update(op.id, { status: "cancelled", detail: "Cancelled before start", endedAt: this.deps.now() });
    }
  }

  private declineApprovals() {
    for (const [, pending] of this.approvals) pending.resolve(false);
    this.approvals.clear();
  }

  private abortRunning(report: StopReport): Promise<void>[] {
    const settling: Promise<void>[] = [];
    for (const [id, run] of this.running) {
      run.controller.abort();
      report.abortedOperations.push(this.find(id)?.title ?? id);
      settling.push(run.done);
    }
    return settling;
  }

  private async haltOutside(report: StopReport) {
    const replayIds = [...new Set(this.replays.values())];
    this.replays.clear();
    const results = await Promise.allSettled([
      this.hooks.disableTriggers(),
      ...replayIds.map((id) => this.hooks.cancelReplay(id)),
      this.hooks.haltExternal?.() ?? Promise.resolve(),
    ]);
    report.triggersDisabled = results[0].status === "fulfilled";
    replayIds.forEach((id, i) => {
      if (results[i + 1].status === "fulfilled") report.replaysCancelled.push(id);
    });
    for (const result of results) {
      if (result.status === "rejected") report.errors.push(errorText(result.reason));
    }
  }

  private async waitForSettle(settling: Promise<void>[], report: StopReport) {
    let timer: unknown;
    const timeout = new Promise<void>((resolve) => (timer = this.deps.setTimer(resolve, this.deps.settleMs)));
    await Promise.race([Promise.allSettled(settling), timeout]);
    this.deps.clearTimer(timer);
    report.stillRunning = [...this.running.keys()].map((id) => this.find(id)?.title ?? id);
  }

  private armDurationCap() {
    this.clearDurationCap();
    const elapsed = this.startedAt === null ? 0 : this.deps.now() - this.startedAt;
    const remaining = Math.max(0, this.limits.maxDurationMs - elapsed);
    this.durationTimer = this.deps.setTimer(() => {
      void this.stop(`Duration cap reached (${Math.round(this.limits.maxDurationMs / 1000)}s)`);
    }, remaining);
  }

  private clearDurationCap() {
    if (this.durationTimer !== null) this.deps.clearTimer(this.durationTimer);
    this.durationTimer = null;
  }

  private deviceBusy(): boolean {
    return [...this.running.keys()].some((id) => DEVICE_KINDS.has(this.find(id)!.kind));
  }

  private pump() {
    if (!this.active) return;
    for (const op of this.operations.filter((o) => o.status === "queued" && !DEVICE_KINDS.has(o.kind))) {
      this.launch(op);
    }
    if (this.deviceBusy()) {
      this.emit();
      return;
    }
    const next = nextDeviceOperation(this.operations);
    if (next) this.launch(next);
    else this.emit();
  }

  private launch(op: MasterOperation) {
    const controller = new AbortController();
    this.update(op.id, { status: "running", detail: "Running", startedAt: this.deps.now() });
    this.log(`Started ${op.kind}: ${op.title}`, op);
    const done = this.execute(op, controller).finally(() => {
      this.running.delete(op.id);
      this.pump();
    });
    this.running.set(op.id, { controller, done });
  }

  private async execute(op: MasterOperation, controller: AbortController): Promise<void> {
    let outcome: OperationOutcome;
    try {
      outcome = await this.runners[op.kind](this.find(op.id)!, this.contextFor(op.id, controller));
    } catch (error) {
      outcome = { status: "failed", reason: errorText(error) };
    }
    this.finish(op.id, outcome, controller.signal.aborted);
  }

  private finish(id: string, outcome: OperationOutcome, aborted: boolean) {
    const endedAt = this.deps.now();
    if (aborted) {
      this.update(id, { status: "cancelled", detail: "Stopped by Master Stop", endedAt });
      this.log("Cancelled by Master Stop", this.find(id));
      return;
    }
    const detail = outcome.status === "completed" ? outcome.detail : outcome.reason;
    this.update(id, { status: outcome.status, detail, endedAt });
    this.log(`${outcome.status === "completed" ? "Completed" : "Failed"}: ${detail}`, this.find(id));
    if (!this.active) return;
    for (const next of outcome.next ?? []) this.enqueue({ ...next, parentId: id });
  }

  private contextFor(id: string, controller: AbortController): OperationContext {
    return {
      signal: controller.signal,
      limits: { ...this.limits },
      ledger: this.ledger,
      guidance: () => this.takeGuidance(id),
      countIteration: () => this.countIteration(id),
      log: (message) => this.log(message, this.find(id)),
      requestApproval: (prompt) => this.requestApproval(id, prompt, controller.signal),
      registerReplay: (runId) => {
        this.replays.set(`${id}:${runId}`, runId);
        this.log(`Replay run ${runId} started on the device`, this.find(id));
      },
    };
  }

  private takeGuidance(id: string): string[] {
    const now = this.deps.now();
    let changed = false;
    this.guidanceEntries = this.guidanceEntries.map((g) => {
      if (g.appliedAt !== null) return g;
      changed = true;
      this.log(`Guidance applied to this turn: "${g.text}"`, this.find(id));
      return { ...g, appliedAt: now };
    });
    if (changed) this.emit();
    return this.guidanceEntries.map((g) => g.text);
  }

  /** Throwing before dispatch ends the operation as failed; nothing past the cap reaches the device. */
  private countIteration(id: string) {
    const op = this.find(id)!;
    const iterations = op.iterations + 1;
    if (iterations > this.limits.maxIterations) {
      this.log(`Max iterations (${this.limits.maxIterations}) reached; stopping this operation`, op);
      throw new MasterLimitError(`Max iterations (${this.limits.maxIterations}) reached`);
    }
    this.update(id, { iterations });
  }

  private requestApproval(id: string, prompt: string, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted || !this.active) return Promise.resolve(false);
    this.update(id, { status: "awaiting_approval", detail: prompt });
    this.log(`Awaiting approval: ${prompt}`, this.find(id));
    return new Promise((resolve) => this.approvals.set(id, { prompt, resolve }));
  }

  private find(id: string): MasterOperation | undefined {
    return this.operations.find((op) => op.id === id);
  }

  private update(id: string, patch: Partial<MasterOperation>) {
    this.operations = this.operations.map((op) => (op.id === id ? { ...op, ...patch } : op));
    this.emit();
  }

  private log(message: string, op?: MasterOperation) {
    const entry: ChainEntry = { at: this.deps.now(), operationId: op?.id, kind: op?.kind, message };
    this.chain = [...this.chain, entry].slice(-MAX_CHAIN);
    this.emit();
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
