import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { FixTask, PendingCompanionAction, WorkflowProposal, WorkflowStepDraft } from "@shared/companion";
import type { FollowUpThread } from "@shared/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companionApi } from "@/lib/companion-api";

/** Runs approved steps on the device; the Dashboard routes this through the action gate. */
export type RunCompanionSteps = (steps: WorkflowStepDraft[]) => Promise<unknown>;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface ProposalCardProps {
  proposal: WorkflowProposal;
  onRunSteps: RunCompanionSteps;
  onDecided?: (proposal: WorkflowProposal) => void;
}

/** A proposed fix/improvement workflow; nothing runs until the user presses Approve. */
export function ProposalCard({ proposal, onRunSteps, onDecided }: ProposalCardProps) {
  const [busy, setBusy] = useState(false);
  const decide = async (approved: boolean) => {
    setBusy(true);
    try {
      const decided = await companionApi.decideProposal(proposal.id, approved);
      onDecided?.(decided);
      if (approved) await onRunSteps(decided.steps);
    } catch (error) {
      toast.error(`Proposal decision failed: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded border border-amber-800/60 bg-amber-950/20 p-2 text-xs space-y-1">
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px]">{proposal.origin}</Badge>
        <Badge variant="outline" className="text-[10px]">{proposal.status}</Badge>
        <span className="text-slate-200">{proposal.summary}</span>
      </div>
      <ol className="list-decimal pl-4 text-slate-400">
        {proposal.steps.map((step) => (
          <li key={step.id}>{step.name} — {step.action} ({step.x}, {step.y})</li>
        ))}
      </ol>
      {proposal.status === "proposed" && (
        <div className="flex gap-1">
          <Button size="sm" className="h-7 text-xs bg-emerald-700" disabled={busy} onClick={() => decide(true)}>
            Approve & test
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => decide(false)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function FixTaskRow({ task, onChanged }: { task: FixTask; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (error) {
      toast.error(`${failure}: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded border border-red-900/60 bg-red-950/20 p-2 text-xs space-y-1">
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px]">{task.source}</Badge>
        <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
        <span className="text-slate-200">{task.title}</span>
      </div>
      <div className="text-red-300">{task.error}</div>
      {task.failedStep?.name && <div className="text-slate-400">Failed step: {task.failedStep.name}</div>}
      {task.screenshot && <img src={task.screenshot} alt="Screen at failure" className="max-h-24 rounded border border-slate-800" />}
      <div className="text-[10px] text-slate-500">{new Date(task.createdAt).toLocaleString()}</div>
      {task.status === "open" && (
        <div className="flex gap-1">
          <Button size="sm" className="h-7 text-xs" disabled={busy}
            onClick={() => act(() => companionApi.proposeFix(task.id), "Fix proposal failed")}>
            Propose AI fix
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
            onClick={() => act(() => companionApi.dismissTask(task.id), "Dismiss failed")}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

interface PendingActionRowProps {
  action: PendingCompanionAction;
  onRunSteps: RunCompanionSteps;
  onChanged: () => void;
}

/** A trigger-queued device action; approving loads its workflow and runs it through the gate. */
function PendingActionRow({ action, onRunSteps, onChanged }: PendingActionRowProps) {
  const [busy, setBusy] = useState(false);
  const decide = async (approved: boolean) => {
    setBusy(true);
    try {
      const { workflow } = await companionApi.decidePendingAction(action.id, approved);
      if (approved) {
        if (!workflow?.steps.length) throw new Error("Workflow not found or has no steps");
        await onRunSteps(workflow.steps);
        await companionApi.markDispatched(action.id);
      }
      onChanged();
    } catch (error) {
      toast.error(`Pending action failed: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded border border-cyan-900/60 bg-cyan-950/20 p-2 text-xs space-y-1">
      <div className="text-slate-200">{action.reason}</div>
      <div className="text-[10px] text-slate-500">
        {action.requiresApproval ? "Needs your approval" : "Queued by trigger"} • {new Date(action.createdAt).toLocaleString()}
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs bg-emerald-700" disabled={busy} onClick={() => decide(true)}>
          Run (gated)
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => decide(false)}>
          Reject
        </Button>
      </div>
    </div>
  );
}

const POLL_MS = 5000;
const LEDGER_SHOWN = 8;

/** One follow-up thread: what the AI suggested, what the user chose, what happened. */
export function FollowUpRow({ thread }: { thread: FollowUpThread }) {
  const extensions = thread.entries.filter((e) => e.kind === "extension").length;
  return (
    <li className="rounded border border-slate-800 bg-slate-950/40 p-2 text-xs space-y-0.5" data-follow-up={thread.proposal.proposalId}>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px]">{thread.proposal.topic}</Badge>
        <span className="text-slate-200">{thread.proposal.summary}</span>
      </div>
      <div className="text-[10px] text-slate-400">
        Chose: <span data-decision>{thread.decision ?? "no decision yet"}</span> • Outcome:{" "}
        <span data-outcome>{thread.outcome ?? "not recorded"}</span>
        {extensions > 0 && <> • {extensions} workflow extension(s)</>}
      </div>
    </li>
  );
}

/** The follow-up ledger, newest first; a failed load is shown, never hidden. */
export function FollowUpLedger({ threads, error }: { threads: FollowUpThread[]; error: string | null }) {
  return (
    <section className="space-y-1" aria-label="Follow-up ledger">
      <h4 className="text-[11px] font-semibold uppercase text-slate-400">Suggestions, choices &amp; outcomes</h4>
      {error && <p className="text-xs text-red-300">Ledger unavailable: {error}</p>}
      {!error && threads.length === 0 && <p className="text-xs text-slate-500">No AI proposals recorded yet.</p>}
      <ul className="space-y-1">
        {threads.slice(-LEDGER_SHOWN).reverse().map((thread) => (
          <FollowUpRow key={thread.proposal.id} thread={thread} />
        ))}
      </ul>
    </section>
  );
}

/** Fix tasks from captured errors, AI-proposed workflows and trigger-queued actions awaiting the user. */
export function CompanionTasksPanel({ onRunSteps }: { onRunSteps: RunCompanionSteps }) {
  const [tasks, setTasks] = useState<FixTask[]>([]);
  const [proposals, setProposals] = useState<WorkflowProposal[]>([]);
  const [actions, setActions] = useState<PendingCompanionAction[]>([]);
  const [threads, setThreads] = useState<FollowUpThread[]>([]);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const refreshLedger = useCallback(async () => {
    try {
      setThreads(await companionApi.ledger());
      setLedgerError(null);
    } catch (error) {
      setLedgerError(errorText(error));
    }
  }, []);

  const refresh = useCallback(async () => {
    void refreshLedger();
    try {
      const [nextTasks, nextProposals, nextActions] = await Promise.all([
        companionApi.tasks(),
        companionApi.proposals(),
        companionApi.pendingActions(),
      ]);
      setTasks(nextTasks.filter((t) => t.status !== "dismissed"));
      setProposals(nextProposals.filter((p) => p.status === "proposed"));
      setActions(nextActions.filter((a) => a.status === "pending"));
    } catch {
      // Server unreachable: keep the last lists; the next poll retries.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const empty = !tasks.length && !proposals.length && !actions.length;
  return (
    <div className="space-y-2">
      {empty && <div className="text-xs text-slate-500">No fix tasks, proposals or pending actions.</div>}
      {actions.map((action) => (
        <PendingActionRow key={action.id} action={action} onRunSteps={onRunSteps} onChanged={refresh} />
      ))}
      {proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} onRunSteps={onRunSteps} onDecided={() => void refresh()} />
      ))}
      {tasks.map((task) => (
        <FixTaskRow key={task.id} task={task} onChanged={refresh} />
      ))}
      <FollowUpLedger threads={threads} error={ledgerError} />
    </div>
  );
}
