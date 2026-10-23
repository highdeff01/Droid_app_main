import { AlertTriangle, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkflowStatusSummary } from "@/lib/workflow-status";

export interface WorkflowStatusActions {
  onApprove: () => void;
  onApproveAlternate: () => void;
  onReject: () => void;
}

function RetryList({ retries }: { retries: WorkflowStatusSummary["retries"] }) {
  if (retries.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-[11px] text-amber-200" data-testid="workflow-retries">
      {retries.map((retry, index) => (
        <li key={`${retry.stepId}-${index}`} className="flex items-center gap-1.5">
          <RotateCcw className="h-3 w-3 shrink-0" />
          Retry attempt {retry.attempt}/{retry.max}
          {retry.stepId ? ` · ${retry.stepId}` : ""}
        </li>
      ))}
    </ul>
  );
}

function PendingDecision({ summary, actions, busy }: { summary: WorkflowStatusSummary; actions: WorkflowStatusActions; busy: boolean }) {
  const alternate = summary.alternate;
  const approval = summary.approval;
  if (!alternate && !approval) return null;
  const reason = alternate?.reason ?? approval?.reason;
  return (
    <div className="mt-2 rounded border border-amber-300/30 bg-amber-300/5 p-2 text-[11px] text-amber-100">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          {alternate
            ? `Alternate step proposed: ${alternate.alternateStepId} replaces ${alternate.stepId}.`
            : `Approval required for ${approval!.stepId} (${approval!.retryStep ? "retries the step" : "continues to the next step"}).`}{" "}
          {reason}
        </span>
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={busy} onClick={alternate ? actions.onApproveAlternate : actions.onApprove}>
          {alternate ? "Approve alternate" : "Approve and continue"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={actions.onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function Verdict({ verdict }: { verdict: NonNullable<WorkflowStatusSummary["verdict"]> }) {
  const passed = verdict.outcome === "completed";
  const Icon = passed ? CheckCircle2 : XCircle;
  return (
    <p className={`mt-2 flex items-start gap-1.5 text-[11px] ${passed ? "text-emerald-300" : "text-rose-300"}`} data-testid="workflow-verdict">
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {passed ? "Completed" : verdict.outcome === "cancelled" ? "Cancelled" : "Failed"}: {verdict.reason}
      </span>
    </p>
  );
}

/** One execution's real status: step, retries, pending decision with controls, and the final verdict. */
export function WorkflowStatusCard({
  summary,
  actions,
  busy = false,
  error,
}: {
  summary: WorkflowStatusSummary;
  actions: WorkflowStatusActions;
  busy?: boolean;
  error?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2.5" data-testid="workflow-status-card">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
        <span>
          Step {summary.currentStep} / {summary.totalSteps}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {summary.status}
        </Badge>
      </div>
      <RetryList retries={summary.retries} />
      <PendingDecision summary={summary} actions={actions} busy={busy} />
      {summary.verdict && <Verdict verdict={summary.verdict} />}
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
