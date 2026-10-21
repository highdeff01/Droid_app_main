import React, { useState } from "react";
import { CheckCircle2, ClipboardList, Flame, Pause, Play, ScrollText, ShieldAlert, Stethoscope, XCircle } from "lucide-react";
import type { OverseerIntervention, OverseerVerdict, SupervisedOperation } from "@shared/overseer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useOverseerSnapshot } from "@/hooks/use-overseer";
import {
  CHECKUP_TEXT,
  VERDICT_STYLE,
  controlOperation,
  decideIntervention,
  fetchOverseerAudit,
  fetchOverseerSummary,
  formatAccuracy,
  formatDrift,
  latestVerdict,
  pendingApprovals,
  type OperationControl,
  type OverseerAuditEntry,
} from "@/lib/overseer-client";
import { compareFramesPixelLevel, type PixelDiffResult } from "../utils/pixelDiffEngine";

type HeatmapState = { status: "idle" } | { status: "running" } | { status: "done"; result: PixelDiffResult } | { status: "failed"; error: string };

/** Pixel-diff heatmap between the frame before the step and the overseer's own fresh capture. */
function DriftHeatmap({ verdict }: { verdict: OverseerVerdict }) {
  const [state, setState] = useState<HeatmapState>({ status: "idle" });
  if (!verdict.beforeImage || !verdict.evidenceImage) return null;
  const run = async () => {
    setState({ status: "running" });
    try {
      const result = await compareFramesPixelLevel(verdict.beforeImage!, verdict.evidenceImage!, { generateHeatmap: true });
      setState({ status: "done", result });
    } catch (error) {
      setState({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <div className="space-y-1">
      <Button size="sm" onClick={run} disabled={state.status === "running"} className="h-6 text-[10px] bg-slate-900 border border-slate-700 gap-1">
        <Flame className="w-3 h-3 text-amber-400" /> Drift heatmap
      </Button>
      {state.status === "failed" && <p className="text-rose-300">Pixel diff failed: {state.error}</p>}
      {state.status === "done" && (
        <div>
          <p className="text-slate-300">{state.result.diffPercent.toFixed(2)}% pixels changed ({state.result.driftClassification})</p>
          {state.result.heatmapDataUrl && <img src={state.result.heatmapDataUrl} alt="Drift heatmap" className="max-h-32 rounded border border-slate-800" />}
        </div>
      )}
    </div>
  );
}

function VerdictRow({ verdict }: { verdict: OverseerVerdict }) {
  const style = VERDICT_STYLE[verdict.status];
  return (
    <div className="p-2 rounded border border-slate-800 bg-slate-950/60 space-y-1" data-verdict={verdict.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`text-[9px] ${style.className}`}>{style.label}</Badge>
        <span className="text-slate-300">Accuracy {formatAccuracy(verdict.accuracyScore)}</span>
        <span className="text-slate-500">via {verdict.provider}</span>
        <span className="text-slate-500">executor: {verdict.executorVerified === null ? "did not verify" : verdict.executorVerified ? "verified" : "failed"}</span>
        <span className="text-slate-500">{new Date(verdict.at).toLocaleTimeString()}</span>
      </div>
      {verdict.expectation && <p className="text-slate-400">Expected: {verdict.expectation}</p>}
      <p className="text-slate-200">{verdict.analysis}</p>
      <p className="text-slate-500">Drift: {formatDrift(verdict.drift)}</p>
      {verdict.evidenceImage ? (
        <img src={verdict.evidenceImage} alt="Overseer verification capture" className="max-h-32 rounded border border-slate-800" />
      ) : (
        <p className="text-slate-500">No verification capture was available.</p>
      )}
      <DriftHeatmap verdict={verdict} />
    </div>
  );
}

function OperationCard({ op, onControl }: { op: SupervisedOperation; onControl: (id: string, control: OperationControl) => void }) {
  const [expanded, setExpanded] = useState(false);
  const verdict = latestVerdict(op);
  const checkup = op.lastCheckup ? CHECKUP_TEXT[op.lastCheckup.outcome] : null;
  return (
    <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 space-y-1" data-operation={op.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="text-[9px] bg-slate-800 text-cyan-300 border-slate-700">{op.kind}</Badge>
        <span className="font-bold text-slate-100 truncate max-w-[16rem]">{op.goal}</span>
        <Badge className="text-[9px] bg-slate-950 text-slate-300 border-slate-700">{op.status}</Badge>
        {verdict && <Badge className={`text-[9px] ${VERDICT_STYLE[verdict.status].className}`}>{VERDICT_STYLE[verdict.status].label}</Badge>}
        <span className="text-slate-500">steps {op.iterations} · retries {op.retriesUsed} · priority {op.priority}</span>
      </div>
      <p className="text-slate-500">{op.source}{op.detail ? ` — ${op.detail}` : ""}</p>
      {checkup && <p className={checkup.className}>Checkup: {checkup.label} — {op.lastCheckup!.summary}</p>}
      <div className="flex flex-wrap gap-1">
        {op.status === "running" && (
          <Button size="sm" onClick={() => onControl(op.id, "pause")} className="h-6 text-[10px] bg-slate-900 border border-slate-700 gap-1">
            <Pause className="w-3 h-3" /> Pause
          </Button>
        )}
        {op.status === "paused" && (
          <Button size="sm" onClick={() => onControl(op.id, "resume")} className="h-6 text-[10px] bg-slate-900 border border-slate-700 gap-1">
            <Play className="w-3 h-3" /> Resume
          </Button>
        )}
        {(op.status === "running" || op.status === "paused") && (
          <Button size="sm" onClick={() => onControl(op.id, "checkup")} className="h-6 text-[10px] bg-slate-900 border border-slate-700 gap-1">
            <Stethoscope className="w-3 h-3" /> Checkup
          </Button>
        )}
        {op.verdicts.length > 0 && (
          <Button size="sm" onClick={() => setExpanded(!expanded)} className="h-6 text-[10px] bg-slate-900 border border-slate-700">
            {expanded ? "Hide" : "Show"} {op.verdicts.length} verdict(s)
          </Button>
        )}
      </div>
      {expanded && <div className="space-y-1">{[...op.verdicts].reverse().map((v) => <VerdictRow key={v.id} verdict={v} />)}</div>}
    </div>
  );
}

function InterventionRow({ item, onDecide }: { item: OverseerIntervention; onDecide: (id: string, approved: boolean) => void }) {
  return (
    <div className="p-2 rounded border border-slate-800 bg-slate-950/60 space-y-1" data-intervention={item.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="text-[9px] bg-slate-800 text-amber-300 border-slate-700">{item.kind}</Badge>
        <span className="text-slate-400">{item.status.replace("_", " ")}</span>
        <span className="text-slate-500">{item.operationId}</span>
        <span className="text-slate-500">{new Date(item.at).toLocaleTimeString()}</span>
      </div>
      <p className="text-slate-200">{item.reason}</p>
      {item.proposal && <p className="text-slate-400">Proposed fix: {item.proposal}</p>}
      {item.status === "pending_approval" && (
        <div className="flex gap-1">
          <Button size="sm" onClick={() => onDecide(item.id, true)} className="h-6 text-[10px] bg-emerald-900 border border-emerald-700 gap-1">
            <CheckCircle2 className="w-3 h-3" /> Approve
          </Button>
          <Button size="sm" onClick={() => onDecide(item.id, false)} className="h-6 text-[10px] bg-rose-900 border border-rose-700 gap-1">
            <XCircle className="w-3 h-3" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditLog() {
  const [entries, setEntries] = useState<OverseerAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const result = await fetchOverseerAudit(200);
    if (result.ok === true) {
      setEntries(result.value);
      setError(null);
    } else {
      setError(result.error);
    }
  };
  return (
    <section className="space-y-1">
      <div className="flex items-center gap-2">
        <h4 className="text-[10px] uppercase text-cyan-400 font-bold flex items-center gap-1"><ScrollText className="w-3 h-3" /> Audit log</h4>
        <Button size="sm" onClick={load} className="h-6 text-[10px] bg-slate-900 border border-slate-700">Load audit log</Button>
      </div>
      {error && <p className="text-rose-300" role="alert">Audit log unavailable: {error}</p>}
      {entries && entries.length === 0 && <p className="text-slate-500">No overseer verdicts or interventions recorded yet.</p>}
      {entries && entries.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {entries.map((e) => (
            <p key={e.id} className="text-slate-300">
              <span className="text-slate-500">{new Date(e.timestamp).toLocaleTimeString()}</span> [{e.level}] {e.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** The overseer console: every supervised operation, its verdicts and evidence, interventions and controls. */
export function OverseerConsole() {
  const { snapshot, error, refresh } = useOverseerSnapshot();
  const [summary, setSummary] = useState<string | null>(null);

  const report = async (outcome: { ok: true } | { ok: false; error: string }, success: string) => {
    if (outcome.ok === false) toast.error(outcome.error);
    else toast.success(success);
    await refresh();
  };
  const onControl = async (id: string, control: OperationControl) => report(await controlOperation(id, control), `Overseer ${control} sent`);
  const onDecide = async (id: string, approved: boolean) => report(await decideIntervention(id, approved), approved ? "Intervention approved" : "Intervention rejected");
  const askSummary = async () => {
    const result = await fetchOverseerSummary();
    if (result.ok === true) setSummary(result.value);
    else toast.error(`Summary unavailable: ${result.error}`);
  };

  const operations = snapshot?.operations ?? [];
  const interventions = snapshot ? [...snapshot.interventions].sort((a, b) => b.at - a.at) : [];
  const pending = pendingApprovals(interventions);

  return (
    <div className="p-4 space-y-4 text-[11px]" data-overseer-console>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={askSummary} className="h-7 text-xs bg-slate-900 border border-slate-700 gap-1">
          <ClipboardList className="w-3 h-3 text-cyan-400" /> Ask overseer for status
        </Button>
        <span className="text-slate-500">{operations.length} operation(s) · {pending.length} awaiting approval</span>
      </div>
      {error && <p className="text-rose-300" role="alert">Overseer unreachable: {error}</p>}
      {summary && <pre className="whitespace-pre-wrap p-2 rounded border border-slate-800 bg-slate-950 text-slate-200">{summary}</pre>}
      {snapshot && snapshot.conflicts.length > 0 && (
        <div className="p-2 rounded border border-orange-700/50 bg-orange-950/30 text-orange-200 space-y-0.5">
          {snapshot.conflicts.map((c) => (
            <p key={c.operationIds.join(":")} className="flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Screen-region conflict: {c.operationIds[0]} ↔ {c.operationIds[1]}
            </p>
          ))}
        </div>
      )}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase text-cyan-400 font-bold">Operations</h4>
        {!snapshot && !error && <p className="text-slate-500">Loading overseer state…</p>}
        {snapshot && operations.length === 0 && <p className="text-slate-500">No AI operations are being supervised.</p>}
        {operations.map((op) => <OperationCard key={op.id} op={op} onControl={onControl} />)}
      </section>
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase text-cyan-400 font-bold">Interventions</h4>
        {snapshot && interventions.length === 0 && <p className="text-slate-500">No interventions yet.</p>}
        {interventions.map((item) => <InterventionRow key={item.id} item={item} onDecide={onDecide} />)}
      </section>
      <AuditLog />
    </div>
  );
}
