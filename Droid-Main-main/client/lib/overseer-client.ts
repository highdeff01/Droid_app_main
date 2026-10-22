import type {
  CheckupOutcome,
  CheckupReport,
  DriftMeasure,
  OverseerIntervention,
  OverseerSnapshot,
  OverseerVerdict,
  OverseerVerdictStatus,
  SupervisedOperation,
} from "@shared/overseer";
import { safeFetchJson, safePostJson } from "@/lib/api-helper";

export const OVERSEER_API = "/api/overseer";

/** One entry of the overseer's audit trail in the central log hub. */
export interface OverseerAuditEntry {
  id: string;
  timestamp: number;
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  message: string;
  metadata?: Record<string, unknown>;
}

/** Result of an overseer request: the payload, or the error the server or network reported. */
export type OverseerResult<T> = { ok: true; value: T } | { ok: false; error: string };

function toResult<T>(data: { success?: boolean; error?: string; message?: string }, value: T): OverseerResult<T> {
  return data.success ? { ok: true, value } : { ok: false, error: data.error || data.message || "Overseer request failed" };
}

export async function fetchOverseerSnapshot(): Promise<OverseerResult<OverseerSnapshot>> {
  const data = await safeFetchJson<OverseerSnapshot>(OVERSEER_API);
  return toResult(data, { operations: data.operations ?? [], interventions: data.interventions ?? [], conflicts: data.conflicts ?? [] });
}

export async function fetchOverseerAudit(limit = 100): Promise<OverseerResult<OverseerAuditEntry[]>> {
  const data = await safeFetchJson<{ entries: OverseerAuditEntry[] }>(`${OVERSEER_API}/audit?limit=${limit}`);
  return toResult(data, data.entries ?? []);
}

export async function fetchOverseerSummary(): Promise<OverseerResult<string>> {
  const data = await safeFetchJson<{ summary: string }>(`${OVERSEER_API}/summary`);
  return toResult(data, data.summary ?? "");
}

export type OperationControl = "pause" | "resume" | "checkup";

export async function controlOperation(operationId: string, control: OperationControl): Promise<OverseerResult<unknown>> {
  const data = await safePostJson(`${OVERSEER_API}/operations/${encodeURIComponent(operationId)}/${control}`);
  return toResult(data, data);
}

export async function decideIntervention(interventionId: string, approved: boolean): Promise<OverseerResult<OverseerIntervention>> {
  const data = await safePostJson<{ intervention: OverseerIntervention }>(
    `${OVERSEER_API}/interventions/${encodeURIComponent(interventionId)}/decide`,
    { approved },
  );
  return toResult(data, data.intervention);
}

/** Accuracy as a percent; "—" when the model reported no score (never a made-up number). */
export function formatAccuracy(score: number | null | undefined): string {
  return typeof score === "number" ? `${Math.round(score * 100)}%` : "—";
}

/** Drift as measured; "not measured" until a diff exists. */
export function formatDrift(drift: DriftMeasure | undefined): string {
  if (!drift) return "not measured";
  if (drift.identical) return "no change (identical frames)";
  return drift.diffPercent === null ? "changed (pixel diff not measured)" : `${drift.diffPercent.toFixed(2)}% pixels changed`;
}

export const VERDICT_STYLE: Record<OverseerVerdictStatus, { label: string; className: string }> = {
  verified: { label: "VERIFIED", className: "bg-emerald-950 text-emerald-300 border-emerald-600/50" },
  completed_early: { label: "COMPLETED EARLY", className: "bg-emerald-950 text-emerald-200 border-emerald-500/50" },
  missed: { label: "MISSED", className: "bg-rose-950 text-rose-300 border-rose-600/50" },
  obstructed: { label: "OBSTRUCTED", className: "bg-orange-950 text-orange-300 border-orange-600/50" },
  off_track: { label: "OFF-TRACK", className: "bg-red-950 text-red-300 border-red-600/50" },
  uncertain: { label: "UNCERTAIN", className: "bg-slate-800 text-slate-300 border-slate-600/50" },
};

export const CHECKUP_TEXT: Record<CheckupOutcome, { label: string; className: string }> = {
  complete: { label: "Complete", className: "text-emerald-300" },
  continuing: { label: "Not complete, continuing", className: "text-cyan-300" },
  off_track: { label: "Off-track", className: "text-rose-300" },
  uncertain: { label: "Uncertain", className: "text-slate-400" },
};

export function latestVerdict(op: SupervisedOperation): OverseerVerdict | undefined {
  return op.verdicts[op.verdicts.length - 1];
}

/** Interventions still waiting on the user, newest first. */
export function pendingApprovals(interventions: OverseerIntervention[]): OverseerIntervention[] {
  return interventions.filter((i) => i.status === "pending_approval").sort((a, b) => b.at - a.at);
}

/** Latest checkup of every operation that has had one, newest first. */
export function latestCheckups(operations: SupervisedOperation[]): Array<CheckupReport & { goal: string }> {
  return operations
    .filter((op) => op.lastCheckup)
    .map((op) => ({ ...op.lastCheckup!, goal: op.goal }))
    .sort((a, b) => b.at - a.at);
}
