import { randomUUID } from "node:crypto";
import type {
  CheckupReport,
  DriftMeasure,
  FinishedStatus,
  InterventionKind,
  OperationRegistrationInput,
  OperationStepReport,
  OverseerIntervention,
  OverseerSnapshot,
  OverseerVerdict,
  SupervisedOperation,
} from "../../shared/overseer";
import { DEFAULT_CAPS, actionSignature, conflictLoser, detectConflicts, findCapViolation } from "./caps";
import { classifyCheckup } from "./checkup";
import {
  DIRECTIVE_FOR,
  createIntervention,
  decideIntervention,
  interventionForCheckup,
  interventionForVerdict,
  requiresApproval,
  type InterventionPlan,
} from "./interventions";
import { measureFrameDrift, type OverseerAnalyzer } from "./analyzer";
import type { OperationBusEvent, OperationControl } from "./operation-bus";
import { decideVerdict } from "./verdict";

export type AuditLevel = "INFO" | "WARN" | "ERROR" | "SUCCESS";
export type AuditSink = (level: AuditLevel, message: string, metadata: Record<string, unknown>) => void;

export interface SupervisorDeps {
  analyzer: OverseerAnalyzer;
  /** Fallback fresh capture when the operation supplies none; null when no live frame exists. */
  capture: () => Promise<string | null>;
  audit: AuditSink;
  now?: () => number;
  /** A running operation with no step report for this long is paused as stalled. */
  stallMs?: number;
  /** Long-running operations get a completion checkup this often. */
  checkupIntervalMs?: number;
}

const MAX_VERDICTS_PER_OP = 30;
const MAX_INTERVENTIONS = 200;
const MAX_FINISHED_OPS = 50;
const NO_FRAME = "No live frame was available for the overseer's independent capture.";

type Effect = (op: SupervisedOperation, control: OperationControl | undefined) => void;

/** What each intervention does once it is applied (immediately or after approval). */
const EFFECTS: Record<InterventionKind, Effect> = {
  pause: (op, control) => {
    op.status = "paused";
    control?.pause?.();
  },
  retry: (op, control) => {
    op.retriesUsed += 1;
    control?.retry?.();
  },
  replan: (op, control) => {
    // The executor has no replanner the overseer can drive; an approved replan stops the run for the user to re-plan it.
    op.status = "paused";
    control?.pause?.();
  },
  queue: (op, control) => {
    op.status = "queued";
    control?.pause?.();
  },
  deprioritize: (op) => {
    op.priority -= 1;
  },
  cap_stop: (op, control) => {
    control?.cancel?.();
  },
};

/** Supervises every registered operation and independently verifies each reported step. */
export class OverseerSupervisor {
  private readonly operations = new Map<string, SupervisedOperation>();
  private readonly controls = new Map<string, OperationControl>();
  private interventions: OverseerIntervention[] = [];
  private readonly checkupsInFlight = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly stallMs: number;
  private readonly checkupIntervalMs: number;

  constructor(private readonly deps: SupervisorDeps) {
    this.now = deps.now ?? Date.now;
    this.stallMs = deps.stallMs ?? 120_000;
    this.checkupIntervalMs = deps.checkupIntervalMs ?? 60_000;
  }

  register(input: OperationRegistrationInput, control?: OperationControl): SupervisedOperation {
    const at = this.now();
    const op: SupervisedOperation = {
      id: input.id ?? `op_${randomUUID()}`,
      kind: input.kind,
      source: input.source,
      goal: input.goal,
      status: "running",
      priority: input.priority ?? 0,
      region: input.region,
      caps: { ...DEFAULT_CAPS, ...input.caps },
      startedAt: at,
      lastActivityAt: at,
      iterations: 0,
      retriesUsed: 0,
      ledger: {},
      verdicts: [],
      directive: "continue",
    };
    this.operations.set(op.id, op);
    if (control) this.controls.set(op.id, control);
    this.pruneFinished();
    this.deps.audit("INFO", `Supervising ${op.kind} "${op.goal}"`, { operationId: op.id, source: op.source });
    this.enforceConflicts();
    return op;
  }

  get(id: string): SupervisedOperation | undefined {
    return this.operations.get(id);
  }

  /** Independently verifies one completed step: fresh capture, own analysis, verdict, intervention. */
  async reportStep(operationId: string, report: OperationStepReport, clientDrift?: DriftMeasure): Promise<OverseerVerdict> {
    const op = this.require(operationId);
    this.recordActivity(op, report);
    const image = await this.freshCapture(op);
    const drift = clientDrift ?? measureFrameDrift(report.beforeImage, image ?? undefined);
    const verdict = await this.verify(op, report, image, drift);
    // A run that already ended keeps its verdict as evidence but is no longer intervened on.
    if (op.finishedAt) return verdict;
    this.applyPlan(op, interventionForVerdict(verdict.status, op.retriesUsed));
    this.enforceCaps(op);
    return verdict;
  }

  finish(operationId: string, status: FinishedStatus, detail?: string) {
    const op = this.operations.get(operationId);
    if (!op) return;
    op.status = status;
    op.detail = detail;
    op.finishedAt = this.now();
    this.controls.delete(operationId);
    this.deps.audit(status === "completed" ? "SUCCESS" : "WARN", `${op.kind} "${op.goal}" ${status}`, {
      operationId,
      detail,
      executorReport: true,
    });
  }

  /** User or overseer pause; applied immediately. */
  pauseOperation(operationId: string, reason: string): OverseerIntervention {
    return this.intervene(this.requireActive(operationId), { kind: "pause", reason });
  }

  resumeOperation(operationId: string): SupervisedOperation {
    const op = this.requireActive(operationId);
    if (op.status !== "paused" && op.status !== "queued") throw new Error(`Operation is ${op.status}`);
    op.status = "running";
    op.directive = "continue";
    op.lastActivityAt = this.now();
    this.controls.get(operationId)?.resume?.();
    this.deps.audit("INFO", `Resumed ${op.kind} "${op.goal}"`, { operationId });
    return op;
  }

  /** User asks the overseer to queue or deprioritize an operation; both need approval. */
  propose(operationId: string, kind: "queue" | "deprioritize" | "replan", reason: string, proposal?: string) {
    return this.intervene(this.requireActive(operationId), { kind, reason }, proposal);
  }

  decide(interventionId: string, approved: boolean): OverseerIntervention {
    const index = this.interventions.findIndex((i) => i.id === interventionId);
    if (index < 0) throw new Error("Intervention not found");
    const decided = decideIntervention(this.interventions[index], approved, this.now());
    this.interventions[index] = decided;
    const op = this.operations.get(decided.operationId);
    // A run that already ended keeps its recorded status; approving a stale proposal changes nothing.
    if (approved && op && !op.finishedAt) this.applyEffect(op, decided.kind);
    this.deps.audit(approved ? "INFO" : "WARN", `User ${decided.status} ${decided.kind}: ${decided.reason}`, {
      operationId: decided.operationId,
      interventionId,
      kind: decided.kind,
      status: decided.status,
    });
    return decided;
  }

  /** Completion checkup against the declared goal; "uncertain" when no frame or no model answer. */
  async runCheckup(operationId: string): Promise<CheckupReport> {
    const op = this.require(operationId);
    const elapsedSeconds = Math.round((this.now() - op.startedAt) / 1000);
    const image = await this.freshCapture(op);
    const answer = image ? await this.deps.analyzer.checkup(image, op.goal, elapsedSeconds) : null;
    const outcome = classifyCheckup(answer?.ok ? answer.value : null);
    const summary = answer ? (answer.ok ? answer.value.summary : answer.reason) : NO_FRAME;
    const report: CheckupReport = { operationId, outcome, summary, elapsedSeconds, at: this.now() };
    op.lastCheckup = report;
    this.deps.audit(outcome === "off_track" ? "WARN" : "INFO", `Checkup ${op.kind} "${op.goal}": ${outcome} — ${summary}`, {
      operationId,
      outcome,
      elapsedSeconds,
    });
    this.applyPlan(op, interventionForCheckup(outcome));
    return report;
  }

  /** One supervisory sweep over all operations: stalls, caps, conflicts and due checkups. */
  async tick(): Promise<void> {
    const now = this.now();
    for (const op of this.running()) {
      if (now - op.lastActivityAt > this.stallMs)
        this.intervene(op, { kind: "pause", reason: `Stalled: no progress for ${Math.round(this.stallMs / 1000)}s.` });
      else this.enforceCaps(op);
    }
    this.enforceConflicts();
    await Promise.all(this.running().filter((op) => this.checkupDue(op, now)).map((op) => this.guardedCheckup(op.id)));
  }

  start(intervalMs = 15_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick().catch(() => undefined), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Feeds bus events from the executors into the supervisor. */
  handleBusEvent(event: OperationBusEvent) {
    if (event.type === "started") this.register(event.input, event.control);
    else if (event.type === "finished") this.finish(event.operationId, event.status, event.detail);
    else if (this.operations.has(event.operationId))
      void this.reportStep(event.operationId, event.report).catch((error) =>
        this.deps.audit("ERROR", `Verification failed: ${error instanceof Error ? error.message : String(error)}`, {
          operationId: event.operationId,
        }),
      );
  }

  snapshot(): OverseerSnapshot {
    const operations = [...this.operations.values()].sort((a, b) => b.priority - a.priority || b.startedAt - a.startedAt);
    return {
      operations: structuredClone(operations),
      interventions: structuredClone(this.interventions),
      conflicts: detectConflicts(operations),
    };
  }

  /** Plain status summary built from recorded state only. */
  summary(): string {
    const { operations, interventions, conflicts } = this.snapshot();
    const active = operations.filter((op) => !op.finishedAt);
    const pending = interventions.filter((i) => i.status === "pending_approval").length;
    const lines = active.map((op) => {
      const last = op.verdicts[op.verdicts.length - 1];
      const verdict = last ? `last verdict ${last.status}` : "no verdict yet";
      const checkup = op.lastCheckup ? `, checkup ${op.lastCheckup.outcome}` : "";
      return `- ${op.kind} "${op.goal}": ${op.status}, ${verdict}${checkup}`;
    });
    return [
      `${active.length} active operation(s), ${pending} proposal(s) awaiting approval, ${conflicts.length} region conflict(s).`,
      ...lines,
    ].join("\n");
  }

  private require(operationId: string): SupervisedOperation {
    const op = this.operations.get(operationId);
    if (!op) throw new Error("Operation not found");
    return op;
  }

  /** An operation that has not finished; a finished run cannot be paused, resumed or re-planned. */
  private requireActive(operationId: string): SupervisedOperation {
    const op = this.require(operationId);
    if (op.finishedAt) throw new Error(`Operation already ${op.status}`);
    return op;
  }

  private running(): SupervisedOperation[] {
    return [...this.operations.values()].filter((op) => op.status === "running");
  }

  private recordActivity(op: SupervisedOperation, report: OperationStepReport) {
    op.iterations += 1;
    op.lastActivityAt = this.now();
    if (op.status === "running") op.directive = "continue";
    if (report.region) op.region = report.region;
    const signature = actionSignature(report);
    op.ledger[signature] = (op.ledger[signature] ?? 0) + 1;
  }

  private async freshCapture(op: SupervisedOperation): Promise<string | null> {
    const capture = this.controls.get(op.id)?.capture ?? this.deps.capture;
    try {
      return await capture();
    } catch {
      return null;
    }
  }

  private async verify(
    op: SupervisedOperation,
    report: OperationStepReport,
    image: string | null,
    drift: DriftMeasure | undefined,
  ): Promise<OverseerVerdict> {
    const answer = image ? await this.deps.analyzer.assessStep(image, report, op.goal) : null;
    const reason = answer && !answer.ok ? answer.reason : NO_FRAME;
    const decision = decideVerdict(answer?.ok ? answer.value : null, reason, drift, report.action);
    const verdict: OverseerVerdict = {
      id: `verdict_${randomUUID()}`,
      operationId: op.id,
      stepId: report.stepId,
      ...decision,
      expectation: report.expectation,
      executorVerified: report.executorVerified ?? null,
      evidenceImage: image ?? undefined,
      beforeImage: report.beforeImage,
      drift,
      provider: answer?.ok ? answer.provider : "none",
      at: this.now(),
    };
    op.verdicts.push(verdict);
    if (op.verdicts.length > MAX_VERDICTS_PER_OP) op.verdicts.shift();
    this.auditVerdict(op, report, verdict);
    return verdict;
  }

  private auditVerdict(op: SupervisedOperation, report: OperationStepReport, verdict: OverseerVerdict) {
    const level: AuditLevel = verdict.status === "verified" ? "SUCCESS" : verdict.status === "uncertain" ? "INFO" : "WARN";
    const score = verdict.accuracyScore === null ? "no score" : `score ${verdict.accuracyScore.toFixed(2)}`;
    this.deps.audit(level, `Verdict ${verdict.status} for "${report.name}" (${score}): ${verdict.analysis}`, {
      operationId: op.id,
      verdictId: verdict.id,
      stepId: report.stepId,
      status: verdict.status,
      accuracyScore: verdict.accuracyScore,
      executorVerified: verdict.executorVerified,
      provider: verdict.provider,
      drift: verdict.drift,
    });
  }

  private applyPlan(op: SupervisedOperation, plan: InterventionPlan | null) {
    if (!plan) return;
    // One open proposal per kind: repeated misses never stack identical replan requests.
    if (requiresApproval(plan.kind) && this.hasPending(op.id, plan.kind)) return;
    this.intervene(op, this.executablePlan(op, plan));
  }

  /** A retry only an executor with a retry hook can perform; any other executor is paused for the user instead. */
  private executablePlan(op: SupervisedOperation, plan: InterventionPlan): InterventionPlan {
    if (plan.kind !== "retry" || this.controls.get(op.id)?.retry) return plan;
    return { kind: "pause", reason: `${plan.reason} This executor cannot retry on request; paused for you to retry or resume.` };
  }

  private intervene(op: SupervisedOperation, plan: InterventionPlan, proposal?: string): OverseerIntervention {
    const intervention = createIntervention(`intervention_${randomUUID()}`, op.id, plan, this.now(), proposal);
    this.interventions.unshift(intervention);
    if (this.interventions.length > MAX_INTERVENTIONS) this.interventions.pop();
    if (intervention.status === "applied") this.applyEffect(op, plan.kind);
    this.deps.audit(intervention.status === "applied" ? "WARN" : "INFO", `Intervention ${plan.kind} (${intervention.status}): ${plan.reason}`, {
      operationId: op.id,
      interventionId: intervention.id,
      kind: plan.kind,
      status: intervention.status,
    });
    return intervention;
  }

  private applyEffect(op: SupervisedOperation, kind: InterventionKind) {
    EFFECTS[kind](op, this.controls.get(op.id));
    op.directive = DIRECTIVE_FOR[kind];
  }

  private enforceCaps(op: SupervisedOperation) {
    if (op.directive === "stop") return;
    const violation = findCapViolation(op, this.now());
    if (violation) this.intervene(op, { kind: "cap_stop", reason: `Safety cap ${violation.cap}: ${violation.reason}` });
  }

  private enforceConflicts() {
    for (const conflict of detectConflicts([...this.operations.values()])) {
      const [a, b] = conflict.operationIds.map((id) => this.operations.get(id)!);
      const loser = conflictLoser(a, b);
      if (this.hasPending(loser.id, "queue")) continue;
      const other = loser === a ? b : a;
      this.intervene(loser, { kind: "queue", reason: `Screen region conflict with ${other.kind} "${other.goal}"; queue proposed.` });
    }
  }

  private hasPending(operationId: string, kind: InterventionKind): boolean {
    return this.interventions.some((i) => i.operationId === operationId && i.kind === kind && i.status === "pending_approval");
  }

  private checkupDue(op: SupervisedOperation, now: number): boolean {
    return !this.checkupsInFlight.has(op.id) && now - (op.lastCheckup?.at ?? op.startedAt) >= this.checkupIntervalMs;
  }

  private async guardedCheckup(operationId: string) {
    this.checkupsInFlight.add(operationId);
    try {
      await this.runCheckup(operationId);
    } finally {
      this.checkupsInFlight.delete(operationId);
    }
  }

  private pruneFinished() {
    const finished = [...this.operations.values()].filter((op) => op.finishedAt).sort((a, b) => a.finishedAt! - b.finishedAt!);
    for (const op of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_OPS))) this.operations.delete(op.id);
  }
}
