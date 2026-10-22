/**
 * Goal workflow panel: the user types a goal, the AI builds and tests the
 * workflow step by step (runGoalLoop), corrected proposals wait here for
 * approval, and a fully verified run can be saved, confirmed as the best flow
 * and replayed through the existing gated replay path.
 */
import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Play, Save, ShieldCheck, Square, Target, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { SequenceStep } from "@/components/live-screen-hud";
import {
  runGoalLoop,
  toSequenceSteps,
  type GoalDevice,
  type GoalLoopEvent,
  type GoalLoopResult,
} from "@/lib/goal-loop-runner";
import {
  bestVersionOf,
  type BestFlow,
  type ExecutedStep,
  type GoalStep,
  type PlanProposal,
} from "@shared/goal-loop";
import { finishGoalRun, registerGoalRun, reportGoalStep } from "@/lib/overseer-goal-run";

interface GoalWorkflowPanelProps {
  device: GoalDevice;
  /** Loop phases, forwarded to the HUD's AI thinking indicator and verification badge. */
  onLoopEvent: (event: GoalLoopEvent) => void;
  /** The existing gated replay path (desktop or paired phone). */
  onReplay: (steps: SequenceStep[]) => void;
}

interface PendingApproval {
  proposal: PlanProposal;
  resolve: (approved: boolean) => void;
}

type Completed = Extract<GoalLoopResult, { status: "completed" }>;

async function flowRequest(url: string, apiKey: string | undefined, body?: unknown) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.success !== true) throw new Error(data.error || `${url} failed`);
  return data;
}

const StepList: React.FC<{ steps: GoalStep[] }> = ({ steps }) => (
  <ol className="space-y-1 text-xs">
    {steps.map((step, index) => (
      <li key={step.id} className="text-slate-300">
        {index + 1}. {step.name} <span className="text-slate-500">({step.action} @ {Math.round(step.x)},{Math.round(step.y)})</span>
      </li>
    ))}
  </ol>
);

const EvidenceRow: React.FC<{ executed: ExecutedStep }> = ({ executed }) => (
  <li className="flex items-start gap-2 text-xs">
    {executed.verification.passed ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
    ) : (
      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
    )}
    <div>
      <div className="text-slate-200">
        {executed.step.name} <span className="text-slate-500">[{executed.relocation}]</span>
      </div>
      {executed.verification.checks.map((check) => (
        <div key={check.check} className={check.passed ? "text-emerald-300" : "text-red-300"}>
          {check.check}: {check.detail}
        </div>
      ))}
    </div>
  </li>
);

const FlowRow: React.FC<{
  flow: BestFlow;
  onConfirm: (flow: BestFlow, version: number) => void;
  onReplay: (flow: BestFlow) => void;
}> = ({ flow, onConfirm, onReplay }) => {
  const latest = flow.versions[flow.versions.length - 1];
  return (
    <li className="rounded border border-slate-800 p-2 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-200">{flow.name}</span>
        {flow.bestVersion !== undefined ? (
          <Badge className="bg-emerald-900 text-emerald-200">best v{flow.bestVersion}</Badge>
        ) : (
          <Badge variant="outline">unconfirmed</Badge>
        )}
      </div>
      <div className="text-slate-500">{flow.versions.length} version(s) · goal: {flow.goal}</div>
      <div className="flex gap-2">
        {latest && latest.version !== flow.bestVersion && (
          <Button size="sm" variant="outline" onClick={() => onConfirm(flow, latest.version)}>
            <ShieldCheck className="w-3 h-3 mr-1" /> Confirm v{latest.version} works
          </Button>
        )}
        <Button size="sm" disabled={flow.bestVersion === undefined} onClick={() => onReplay(flow)}>
          <Play className="w-3 h-3 mr-1" /> Replay best
        </Button>
      </div>
    </li>
  );
};

export const GoalWorkflowPanel: React.FC<GoalWorkflowPanelProps> = ({ device, onLoopEvent, onReplay }) => {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [lastEvent, setLastEvent] = useState<GoalLoopEvent | null>(null);
  const [plan, setPlan] = useState<GoalStep[]>([]);
  const [executed, setExecuted] = useState<ExecutedStep[]>([]);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [flows, setFlows] = useState<BestFlow[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const loadFlows = async () => {
    try {
      setFlows((await flowRequest("/api/goal-workflows/flows", device.apiKey)).flows);
    } catch (error) {
      toast.error(`Could not load best flows: ${error instanceof Error ? error.message : error}`);
    }
  };

  useEffect(() => {
    void loadFlows();
    return () => abortRef.current?.abort();
  }, [device.apiKey]);

  const handleEvent = (event: GoalLoopEvent) => {
    setLastEvent(event);
    onLoopEvent(event);
  };

  const askApproval = (proposal: PlanProposal) =>
    new Promise<boolean>((resolve) => setPending({ proposal, resolve }));

  const answerApproval = (approved: boolean) => {
    pending?.resolve(approved);
    setPending(null);
  };

  const handleStart = async () => {
    if (!goal.trim() || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setExecuted([]);
    setPlan([]);
    setCompleted(null);
    setFailure(null);
    const registration = await registerGoalRun(goal.trim(), `goal-workflow-panel / ${device.targetDevice}`);
    const operationId = registration.ok === true ? registration.value : null;
    if (registration.ok === false) toast.warning(`Overseer not supervising this run: ${registration.error}`);
    const superviseStep = async (step: ExecutedStep) => {
      if (!operationId) return;
      const outcome = await reportGoalStep(operationId, step);
      if (outcome.ok === true && (outcome.value === "pause" || outcome.value === "stop")) {
        toast.warning(`Overseer ${outcome.value === "stop" ? "stopped" : "paused"} the run; see the Overseer console`);
        controller.abort();
      }
    };
    const result = await runGoalLoop(goal, {
      device,
      signal: controller.signal,
      onEvent: handleEvent,
      onPlan: (state) => setPlan(state.plan),
      onStep: (step) => {
        setExecuted((prev) => [...prev, step]);
        void superviseStep(step);
      },
      approve: askApproval,
    });
    if (operationId) {
      const status = result.status === "completed" ? "completed" : controller.signal.aborted ? "cancelled" : "failed";
      void finishGoalRun(operationId, status, result.status === "failed" ? result.reason : undefined);
    }
    setRunning(false);
    if (result.status === "completed") setCompleted(result);
    else setFailure(result.reason);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    answerApproval(false);
  };

  const handleSave = async () => {
    if (!completed) return;
    try {
      await flowRequest("/api/goal-workflows/flows", device.apiKey, {
        // A run for a goal that already has a flow becomes its next version, never a silent replacement.
        flowId: flows.find((flow) => flow.goal === goal.trim())?.id,
        name: goal.trim().slice(0, 120),
        goal: goal.trim(),
        steps: completed.steps,
        evidence: completed.evidence,
      });
      toast.success("Verified run saved as a new flow version; confirm it to make it the best flow");
      setCompleted(null);
      await loadFlows();
    } catch (error) {
      toast.error(`Save failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const handleConfirm = async (flow: BestFlow, version: number) => {
    const replacing = flow.bestVersion !== undefined && flow.bestVersion !== version;
    if (replacing && !window.confirm(`Replace confirmed best v${flow.bestVersion} with v${version}?`)) return;
    try {
      await flowRequest(`/api/goal-workflows/flows/${encodeURIComponent(flow.id)}/confirm`, device.apiKey, {
        version,
        approvedReplace: replacing,
      });
      toast.success(`v${version} is now the confirmed best flow`);
      await loadFlows();
    } catch (error) {
      toast.error(`Confirm failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const handleReplayBest = (flow: BestFlow) => {
    const best = bestVersionOf(flow);
    if (best) onReplay(toSequenceSteps(best.steps));
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4 text-slate-200">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-cyan-400" />
        <span className="font-bold text-sm">AI GOAL WORKFLOW</span>
        {lastEvent && <Badge variant="outline">{lastEvent.phase.replace("_", " ")}</Badge>}
      </div>
      <div className="flex gap-2">
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe the goal, e.g. open Settings and enable Wi-Fi"
          disabled={running}
        />
        {running ? (
          <Button variant="destructive" onClick={handleStop}>
            <Square className="w-4 h-4 mr-1" /> Stop
          </Button>
        ) : (
          <Button onClick={handleStart} disabled={!goal.trim()}>
            <Play className="w-4 h-4 mr-1" /> Build &amp; test
          </Button>
        )}
      </div>
      {lastEvent && <p className="text-xs text-slate-400">{lastEvent.message}</p>}
      {failure && <p className="text-xs text-red-400">Run failed: {failure}</p>}

      {pending && (
        <div className="rounded border border-amber-600 bg-amber-950/40 p-3 space-y-2">
          <div className="text-xs font-semibold text-amber-200">Corrected proposal — {pending.proposal.reason}</div>
          <div className="text-xs text-slate-400">Goal (unchanged): {pending.proposal.goal}</div>
          <StepList steps={pending.proposal.steps} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => answerApproval(true)}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => answerApproval(false)}>Reject</Button>
          </div>
        </div>
      )}

      {plan.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 mb-1">Plan</div>
          <StepList steps={plan} />
        </div>
      )}
      {executed.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 mb-1">Step evidence</div>
          <ul className="space-y-2">
            {executed.map((step) => (
              <EvidenceRow key={`${step.step.id}_${step.at}`} executed={step} />
            ))}
          </ul>
        </div>
      )}

      {completed && (
        <div className="rounded border border-emerald-700 bg-emerald-950/40 p-3 space-y-2 text-xs">
          <div>All {completed.steps.length} step(s) verified; goal reached: {completed.evidence.goalAssessment.reason}</div>
          <Button size="sm" onClick={handleSave}>
            <Save className="w-3 h-3 mr-1" /> Save as best flow
          </Button>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-slate-400 mb-1">Saved flows</div>
        {flows.length === 0 ? (
          <p className="text-xs text-slate-500">No verified flows saved yet.</p>
        ) : (
          <ul className="space-y-2">
            {flows.map((flow) => (
              <FlowRow key={flow.id} flow={flow} onConfirm={handleConfirm} onReplay={handleReplayBest} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
