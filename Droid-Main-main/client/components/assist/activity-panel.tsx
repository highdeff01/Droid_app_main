import { useCallback, useEffect, useState } from "react";
import type { AssistAutomation, AssistMonitorStatus, HandoffRecord, InboxRequest, StepRecord } from "@shared/assist-bridge";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { assistBridgeApi, errorText } from "@/lib/assist-bridge-api";
import { ActionButton, OutcomeView, useOutcome } from "./outcome";

const POLL_MS = 3000;

interface Activity {
  inbox: InboxRequest[];
  steps: StepRecord[];
  handoffs: HandoffRecord[];
  monitor: AssistMonitorStatus;
}

async function loadActivity(): Promise<Activity> {
  const [inbox, steps, handoffs, monitor] = await Promise.all([
    assistBridgeApi.inbox(),
    assistBridgeApi.steps(),
    assistBridgeApi.handoffs(),
    assistBridgeApi.monitor(),
  ]);
  return { inbox, steps, handoffs, monitor };
}

const TOGGLES: { key: keyof AssistAutomation; label: string }[] = [
  { key: "monitoring", label: "Auto screen capture" },
  { key: "autoAssist", label: "Auto-assist problems" },
  { key: "autoTakeover", label: "Auto takeover stalled steps" },
];

function MonitorToggles({ monitor, onChanged }: { monitor: AssistMonitorStatus; onChanged: (m: AssistMonitorStatus) => void }) {
  const [error, setError] = useState<string | null>(null);
  const toggle = async (key: keyof AssistAutomation, value: boolean) => {
    try {
      onChanged(await assistBridgeApi.configureMonitor({ [key]: value }));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <section className="space-y-1 text-xs" aria-label="Monitor">
      <div className="flex flex-wrap gap-3">
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1 text-slate-300">
            <Switch aria-label={label} checked={monitor[key]} onCheckedChange={(v) => void toggle(key, v)} />
            {label}
          </label>
        ))}
      </div>
      <p className="text-slate-400">
        {monitor.live ? "Live frame" : `Standby${monitor.lastMessage ? `: ${monitor.lastMessage}` : ""}`} · {monitor.framesCaptured} frames captured ·{" "}
        {monitor.problems.length} problems detected
      </p>
      {error && <p role="alert" className="text-red-300">Monitor update failed: {error}</p>}
    </section>
  );
}

function StepRow({ step }: { step: StepRecord }) {
  const { busy, outcome, run } = useOutcome();
  const canTakeOver = step.state === "incomplete" || step.state === "running";
  return (
    <li className="rounded border border-slate-800 p-1 text-xs space-y-0.5">
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px]">{step.state}</Badge>
        <span className="text-slate-200">{step.step}</span>
        <span className="text-slate-500">— {step.goal}</span>
      </div>
      {step.main && <div className="text-slate-400">Main watcher: {step.main.passed ? "passed" : "failed"} ({step.main.evidence})</div>}
      {step.assistVerified !== undefined && <div className="text-slate-400">droid-new: {step.assistVerified ? "passed" : "failed"}</div>}
      {step.resolution && <div className="text-slate-400">Resolution: {step.resolution}</div>}
      {canTakeOver && (
        <ActionButton busy={busy} onClick={() => void run(() => assistBridgeApi.takeoverStep(step.stepId))}>Take over</ActionButton>
      )}
      <OutcomeView outcome={outcome} label="Takeover" />
    </li>
  );
}

/** Live bridge activity: user requests from droid-new, step consensus, handoffs and monitor toggles. */
export function AssistActivityPanel() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setActivity(await loadActivity());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!activity) return <p className="text-xs text-slate-500">{error ? `Bridge activity unavailable: ${error}` : "Loading bridge activity…"}</p>;
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs text-red-300">Bridge activity unavailable: {error}</p>}
      <MonitorToggles monitor={activity.monitor} onChanged={(monitor) => setActivity({ ...activity, monitor })} />
      <section aria-label="Inbox" className="space-y-1">
        <h4 className="text-[11px] font-semibold uppercase text-slate-400">Requests from droid-new</h4>
        {!activity.inbox.length && <p className="text-xs text-slate-500">No requests yet.</p>}
        <ul className="space-y-1">
          {activity.inbox.map((r) => (
            <li key={r.id} className="text-xs text-slate-200">{r.text} <span className="text-slate-500">({r.source}, {new Date(r.receivedAt).toLocaleTimeString()})</span></li>
          ))}
        </ul>
      </section>
      <section aria-label="Steps" className="space-y-1">
        <h4 className="text-[11px] font-semibold uppercase text-slate-400">Steps (both sides must verify)</h4>
        {!activity.steps.length && <p className="text-xs text-slate-500">No steps reported.</p>}
        <ul className="space-y-1">{activity.steps.map((s) => <StepRow key={s.stepId} step={s} />)}</ul>
      </section>
      <section aria-label="Handoffs" className="space-y-1">
        <h4 className="text-[11px] font-semibold uppercase text-slate-400">Handoffs</h4>
        {!activity.handoffs.length && <p className="text-xs text-slate-500">No handoffs.</p>}
        <ul className="space-y-1">
          {activity.handoffs.map((h) => (
            <li key={h.id} className="text-xs text-slate-200">
              <Badge variant="outline" className="text-[10px]">{h.origin}</Badge> <Badge variant="outline" className="text-[10px]">{h.outcome}</Badge> {h.step}
              {h.detail && <span className="text-slate-400"> — {h.detail}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
