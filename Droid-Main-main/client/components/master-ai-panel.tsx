/**
 * Master AI control section of the live screen HUD: one place to start/stop the
 * master session, queue goal runs, replays, habit routines and Qwen orchestration,
 * feed guidance into the next AI turn, answer error-fix approvals and set the
 * enforced limits. Every value shown comes from the MasterAiController snapshot,
 * which is fed only by real endpoint results.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Power, Square } from "lucide-react";
import { toast } from "sonner";
import type { SequenceStep } from "@/components/live-screen-hud";
import { fetchLearningProfile } from "@/lib/ai-intentions";
import type { GoalDevice, GoalLoopEvent } from "@/lib/goal-loop-runner";
import {
  MasterAiController,
  type MasterOperation,
  type MasterSnapshot,
  type OperationRequest,
  type StopReport,
} from "@/lib/master-ai";
import { createMasterHooks, createMasterRunners, newTriggerActions } from "@/lib/master-ai-runners";
import { startPollLoop } from "@/lib/poll-loop";
import { submitOnEnter } from "@/lib/chat-submit";
import type { AssistantExecution } from "@shared/assistant";
import { WorkflowStatusCard } from "@/components/workflow-status-card";
import {
  approveAlternateExecution,
  approvePendingExecution,
  focusExecution,
  listExecutions,
  rejectExecution,
  summarizeExecution,
  type ExecutionFetch,
} from "@/lib/workflow-status";

export const TRIGGER_POLL_MS = 5000;
const MINUTE_MS = 60_000;

export interface MasterAiPanelProps {
  device: GoalDevice;
  sequence: SequenceStep[];
  objective: string;
  onLoopEvent?: (event: GoalLoopEvent) => void;
  onSequenceOptimized?: (steps: SequenceStep[]) => void;
  /** Halts AI work outside the master (HUD execution, Dashboard sequence); returns what it did. */
  haltExternal?: () => Promise<string | void>;
  onSnapshot?: (snapshot: MasterSnapshot) => void;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One honest sentence for what Stop actually stopped. */
export function summarizeStop(report: StopReport): string {
  const parts = [
    `${report.abortedOperations.length} running operation(s) aborted`,
    `${report.cancelledQueued.length} queued cancelled`,
    `${report.replaysCancelled.length} replay run(s) cancelled`,
    `${report.declinedApprovals} approval(s) declined`,
    report.triggersDisabled ? "trigger evaluation disabled" : "trigger evaluation was not confirmed off",
  ];
  const still = report.stillRunning.length ? ` Still settling: ${report.stillRunning.join(", ")}.` : "";
  const errors = report.errors.length ? ` Errors: ${report.errors.join("; ")}.` : "";
  return `${parts.join(", ")}.${still}${errors}`;
}

/** Keeps the latest value of a prop readable from a long-lived controller. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useMasterController(props: MasterAiPanelProps) {
  const { targetDevice, deviceId, apiKey } = props.device;
  const loopEvent = useLatest(props.onLoopEvent);
  const optimized = useLatest(props.onSequenceOptimized);
  const halt = useLatest(props.haltExternal);
  const controller = useMemo(() => {
    const device = { targetDevice, deviceId, apiKey };
    const runners = createMasterRunners({
      device,
      onLoopEvent: (event) => loopEvent.current?.(event),
      onSequenceOptimized: (steps) => optimized.current?.(steps),
    });
    return new MasterAiController(runners, createMasterHooks(device, async () => halt.current?.()));
  }, [targetDevice, deviceId, apiKey]);
  const [snapshot, setSnapshot] = useState<MasterSnapshot>(() => controller.snapshot());
  const onSnapshot = useLatest(props.onSnapshot);
  useEffect(() => {
    const publish = (next: MasterSnapshot) => {
      setSnapshot(next);
      onSnapshot.current?.(next);
    };
    publish(controller.snapshot());
    const unsubscribe = controller.subscribe(publish);
    return () => {
      unsubscribe();
      if (controller.snapshot().active) void controller.stop("Master panel closed");
    };
  }, [controller]);
  return { controller, snapshot };
}

/** While the session has trigger evaluation on, fired trigger actions are queued as operations. */
function useTriggerFeed(controller: MasterAiController, enabled: boolean) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    return startPollLoop(
      [
        {
          everyTicks: 1,
          enabled: () => controller.snapshot().active,
          run: async () => {
            for (const action of await newTriggerActions(seen.current)) {
              controller.enqueue({ kind: "trigger", title: action.reason, payload: { action } });
            }
          },
        },
      ],
      TRIGGER_POLL_MS,
    );
  }, [controller, enabled]);
}

function SessionControls({ controller, active }: { controller: MasterAiController; active: boolean }) {
  const start = async () => {
    await controller.start();
    toast.success("Master AI started");
  };
  const stop = async () => {
    const report = await controller.stop();
    const show = report.stillRunning.length || report.errors.length ? toast.error : toast.success;
    show(`Master AI stopped: ${summarizeStop(report)}`);
  };
  return (
    <div className="flex gap-1">
      <button
        aria-label="Start Master AI"
        disabled={active}
        onClick={start}
        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-emerald-700 disabled:opacity-40 font-bold"
      >
        <Power className="w-3 h-3" /> Start Master AI
      </button>
      <button
        aria-label="Stop all AI"
        disabled={!active}
        onClick={stop}
        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-rose-700 disabled:opacity-40 font-bold"
      >
        <Square className="w-3 h-3" /> Stop ALL AI
      </button>
    </div>
  );
}

function TextSubmit({ label, placeholder, disabled, onSubmit }: {
  label: string;
  placeholder: string;
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };
  return (
    <div className="flex gap-1">
      <input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={submitOnEnter(submit, disabled)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-1"
      />
      <button aria-label={label} disabled={disabled} onClick={submit} className="px-1.5 border border-fuchsia-700 rounded disabled:opacity-40">
        {label}
      </button>
    </div>
  );
}

function QueueControls({ controller, active, sequence, objective }: {
  controller: MasterAiController;
  active: boolean;
  sequence: SequenceStep[];
  objective: string;
}) {
  const enqueue = (request: OperationRequest) => {
    try {
      controller.enqueue(request);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const queueHabit = async () => {
    try {
      const pattern = (await fetchLearningProfile()).repeatedPattern;
      if (!pattern?.coordinates) throw new Error("No repeated habit with a screen position has been learned yet");
      const { x, y } = pattern.coordinates;
      enqueue({ kind: "habit", title: pattern.suggestedAutomation, payload: { x, y, repeatCount: pattern.count } });
    } catch (error) {
      toast.error(`Habit routine unavailable: ${errorText(error)}`);
    }
  };
  const title = objective.trim() || "Current HUD sequence";
  const noSteps = !active || sequence.length === 0;
  return (
    <div className="space-y-1">
      <TextSubmit label="Run goal" placeholder="Goal for the turn loop" disabled={!active} onSubmit={(goal) => enqueue({ kind: "goal", title: goal, payload: { goal } })} />
      <div className="flex flex-wrap gap-1">
        <button disabled={noSteps} onClick={() => enqueue({ kind: "replay", title, payload: { steps: sequence } })} className="px-1.5 border border-cyan-700 rounded disabled:opacity-40">
          Queue replay
        </button>
        <button disabled={!active} onClick={queueHabit} className="px-1.5 border border-cyan-700 rounded disabled:opacity-40">
          Queue habit routine
        </button>
        <button disabled={noSteps} onClick={() => enqueue({ kind: "qwen_orchestrate", title, payload: { steps: sequence, objective: title } })} className="px-1.5 border border-cyan-700 rounded disabled:opacity-40">
          Qwen orchestrate
        </button>
      </div>
    </div>
  );
}

function LimitControls({ controller, snapshot }: { controller: MasterAiController; snapshot: MasterSnapshot }) {
  const { limits } = snapshot;
  const setPositive = (key: "maxIterations" | "maxDurationMs", raw: string, scale: number) => {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) controller.setLimits({ [key]: Math.round(value * scale) });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-slate-300">
      <label className="flex items-center gap-1">
        Max iterations
        <input type="number" min={1} aria-label="Max iterations" value={limits.maxIterations} onChange={(e) => setPositive("maxIterations", e.target.value, 1)} className="w-12 bg-slate-950 border border-slate-700 rounded px-1" />
      </label>
      <label className="flex items-center gap-1">
        Duration cap (min)
        <input type="number" min={1} aria-label="Duration cap minutes" value={limits.maxDurationMs / MINUTE_MS} onChange={(e) => setPositive("maxDurationMs", e.target.value, MINUTE_MS)} className="w-12 bg-slate-950 border border-slate-700 rounded px-1" />
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" aria-label="Non-repetition" checked={limits.nonRepetition} onChange={(e) => controller.setLimits({ nonRepetition: e.target.checked })} />
        Non-repetition
      </label>
    </div>
  );
}

function Approvals({ controller, snapshot }: { controller: MasterAiController; snapshot: MasterSnapshot }) {
  if (snapshot.approvals.length === 0) return null;
  return (
    <ul className="space-y-1">
      {snapshot.approvals.map((a) => (
        <li key={a.operationId} className="p-1 border border-amber-600 rounded text-amber-200" data-approval={a.operationId}>
          <p>{a.prompt}</p>
          <button onClick={() => controller.answerApproval(a.operationId, true)} className="mr-1 px-1.5 border border-emerald-600 rounded">Approve</button>
          <button onClick={() => controller.answerApproval(a.operationId, false)} className="px-1.5 border border-rose-600 rounded">Decline</button>
        </li>
      ))}
    </ul>
  );
}

const ACTIVE_STATUSES = new Set(["running", "awaiting_approval"]);
export const EXECUTION_POLL_MS = 2000;

/** Fetch with the HUD's API key, for the execution endpoints. */
function keyedFetch(apiKey?: string): ExecutionFetch {
  return (url, init) =>
    fetch(url, { ...init, headers: { ...(init?.headers ?? {}), ...(apiKey ? { "x-api-key": apiKey } : {}) } });
}

/** The latest approved-plan execution, polled from GET /api/assistant/execution, with its recovery controls. */
function ExecutionStatusSection({ apiKey }: { apiKey?: string }) {
  const fetcher = useMemo(() => keyedFetch(apiKey), [apiKey]);
  const [execution, setExecution] = useState<AssistantExecution>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      startPollLoop(
        [
          {
            everyTicks: 1,
            enabled: () => true,
            run: async () => {
              try {
                setExecution(focusExecution(await listExecutions(fetcher)));
                setError(undefined);
              } catch (cause) {
                setError(`Workflow status unavailable: ${errorText(cause)}`);
              }
            },
          },
        ],
        EXECUTION_POLL_MS,
      ),
    [fetcher],
  );
  if (!execution) return error ? <p className="text-rose-300">{error}</p> : null;
  const decide = async (action: () => Promise<AssistantExecution>) => {
    setBusy(true);
    try {
      setExecution(await action());
      setError(undefined);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h5 className="text-[9px] uppercase text-fuchsia-400 font-bold">Workflow status</h5>
      <WorkflowStatusCard
        summary={summarizeExecution(execution)}
        busy={busy}
        error={error}
        actions={{
          onApprove: () => void decide(() => approvePendingExecution(execution.id, fetcher)),
          onApproveAlternate: () => void decide(() => approveAlternateExecution(execution.id, fetcher)),
          onReject: () => void decide(() => rejectExecution(execution.id, undefined, fetcher)),
        }}
      />
    </section>
  );
}

function OperationList({ heading, operations }: { heading: string; operations: MasterOperation[] }) {
  return (
    <section>
      <h5 className="text-[9px] uppercase text-fuchsia-400 font-bold">{heading} ({operations.length})</h5>
      {operations.length ? (
        <ul className="space-y-0.5">
          {operations.map((op) => (
            <li key={op.id} data-operation-status={op.status} className="text-slate-300">
              <span className="text-fuchsia-300">[{op.kind}]</span> {op.title} — {op.status}
              {op.iterations ? ` · ${op.iterations} iteration(s)` : ""} · {op.detail}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500">None.</p>
      )}
    </section>
  );
}

function OperationBoard({ snapshot }: { snapshot: MasterSnapshot }) {
  const ops = snapshot.operations;
  return (
    <div className="space-y-1">
      <OperationList heading="Active" operations={ops.filter((op) => ACTIVE_STATUSES.has(op.status))} />
      <OperationList heading="Queued" operations={ops.filter((op) => op.status === "queued")} />
      <OperationList heading="Completed" operations={ops.filter((op) => !ACTIVE_STATUSES.has(op.status) && op.status !== "queued")} />
      {snapshot.failedMethods.length > 0 && (
        <section>
          <h5 className="text-[9px] uppercase text-rose-400 font-bold">Failed methods (not repeated)</h5>
          <ul>{snapshot.failedMethods.map((m) => <li key={m} className="text-rose-200">{m}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

export const MasterAiPanel: React.FC<MasterAiPanelProps> = (props) => {
  const { controller, snapshot } = useMasterController(props);
  useTriggerFeed(controller, snapshot.active && snapshot.triggersEnabled);
  const addGuidance = (text: string) => {
    controller.addGuidance(text);
    toast.info(`Guidance queued for the next AI turn: "${text}"`);
  };
  return (
    <div className="w-full max-w-xl rounded-lg bg-slate-900/95 border border-fuchsia-500/40 shadow-xl text-[10px] font-mono p-2 space-y-2" data-master-active={snapshot.active}>
      <h4 className="flex items-center gap-1 text-fuchsia-300 font-bold">
        <Crown className="w-3 h-3" /> Master AI — {snapshot.active ? "running" : "stopped"}
        {snapshot.active ? <span className="text-slate-400">· triggers {snapshot.triggersEnabled ? "on" : "off"}</span> : null}
      </h4>
      <SessionControls controller={controller} active={snapshot.active} />
      <TextSubmit label="Send guidance" placeholder={'Guidance for the next turn ("avoid the top bar")'} disabled={!snapshot.active} onSubmit={addGuidance} />
      <QueueControls controller={controller} active={snapshot.active} sequence={props.sequence} objective={props.objective} />
      <LimitControls controller={controller} snapshot={snapshot} />
      <Approvals controller={controller} snapshot={snapshot} />
      <ExecutionStatusSection apiKey={props.device.apiKey} />
      <OperationBoard snapshot={snapshot} />
      {snapshot.lastStop && !snapshot.active ? <p className="text-slate-400" data-last-stop>Last stop: {summarizeStop(snapshot.lastStop)}</p> : null}
    </div>
  );
};
