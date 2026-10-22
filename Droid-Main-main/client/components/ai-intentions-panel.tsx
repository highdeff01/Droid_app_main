import React, { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Pause, Play, Plus, RotateCcw, Trash2, CheckCircle2, Circle } from "lucide-react";
import type { ReplayRun } from "@shared/replay";
import type { UserHabitProfile } from "@shared/learning";
import { DELAY_MULTIPLIER_MAX, DELAY_MULTIPLIER_MIN } from "@shared/learning";
import {
  activeGoal,
  completedGoals,
  deriveIntention,
  formatCount,
  formatPercent,
  learningMetrics,
  runSummary,
  type GateReport,
  type RunnableGoal,
} from "@/lib/ai-intentions";
import type { SequenceStep } from "@/components/live-screen-hud";
import type { CheckupReport } from "@shared/overseer";
import { CHECKUP_TEXT } from "@/lib/overseer-client";

export interface AiIntentionsPanelProps {
  gateReport: GateReport | null;
  replayRun: ReplayRun | null;
  sequence: SequenceStep[];
  goals: RunnableGoal[];
  /** Elements in the latest perception report; null before any analysis. */
  detectedElements: number | null;
  profile: UserHabitProfile | null;
  /** Why the learning profile could not be loaded; shown instead of metrics. */
  profileError?: string | null;
  defaultOpen?: boolean;
  onCreateGoal?: (title: string) => void;
  onPauseGoal?: (id: string) => void;
  onResumeGoal?: (id: string) => void;
  onDeleteGoal?: (id: string) => void;
  onExecuteGoal?: (id: string) => void;
  /** Set the movement delay multiplier; null returns it to learning. */
  onAdjustDelay?: (multiplier: number | null) => void;
  /** Latest overseer checkups of long-running operations; null when the overseer could not be reached. */
  overseerCheckups?: OverseerCheckupItem[] | null;
  /** Why the overseer could not be reached. */
  overseerError?: string | null;
}

export type OverseerCheckupItem = CheckupReport & { goal: string };

function OverseerCheckupSection({ overseerCheckups, overseerError }: Pick<AiIntentionsPanelProps, "overseerCheckups" | "overseerError">) {
  if (overseerCheckups === undefined && !overseerError) return null;
  return (
    <section className="space-y-1">
      <h5 className="text-[9px] uppercase text-cyan-400 font-bold">Overseer checkups</h5>
      {overseerError && <p className="text-rose-300" role="alert">Overseer unavailable: {overseerError}</p>}
      {overseerCheckups && overseerCheckups.length === 0 && <p className="text-slate-500">No checkups yet.</p>}
      {(overseerCheckups ?? []).map((c) => (
        <div key={`${c.operationId}_${c.at}`} data-checkup={c.outcome}>
          <p className="text-slate-100">{c.goal}</p>
          <p className={CHECKUP_TEXT[c.outcome].className}>
            {CHECKUP_TEXT[c.outcome].label} after {Math.round(c.elapsedSeconds)}s — {c.summary}
          </p>
        </div>
      ))}
    </section>
  );
}

const DELAY_STEP = 0.1;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1.5 py-1 rounded bg-slate-950/70 border border-slate-800">
      <span className="block text-[9px] text-slate-500 truncate">{label}</span>
      <span className="text-[11px] font-bold text-emerald-300" data-metric={label}>{value}</span>
    </div>
  );
}

function IntentionSection({ gateReport, replayRun, sequence, detectedElements }: Pick<AiIntentionsPanelProps, "gateReport" | "replayRun" | "sequence" | "detectedElements">) {
  const intention = deriveIntention(gateReport, replayRun, sequence);
  return (
    <section className="space-y-1">
      <h5 className="text-[9px] uppercase text-cyan-400 font-bold">Current intention</h5>
      {intention ? (
        <div data-intention-source={intention.source}>
          <p className="text-slate-100">{intention.what}</p>
          <p className="text-slate-400">{intention.why}</p>
        </div>
      ) : (
        <p className="text-slate-500">Idle — no verified action or live run yet.</p>
      )}
      <p className="text-slate-400">
        Detected elements: <strong className="text-cyan-300" data-metric="Detected elements">{formatCount(detectedElements)}</strong>
      </p>
    </section>
  );
}

function GoalRow({ goal, props }: { goal: RunnableGoal; props: AiIntentionsPanelProps }) {
  const paused = goal.status === "blocked";
  return (
    <li className="flex items-center justify-between gap-1" data-goal-id={goal.id} data-goal-status={goal.status}>
      <span className="truncate text-slate-200">{goal.title}</span>
      <span className="text-slate-500 shrink-0">{goal.progressPercent}%</span>
      <span className="flex gap-0.5 shrink-0">
        <button title="Execute" aria-label={`Execute ${goal.title}`} onClick={() => props.onExecuteGoal?.(goal.id)}><Play className="w-3 h-3" /></button>
        {paused ? (
          <button title="Resume" aria-label={`Resume ${goal.title}`} onClick={() => props.onResumeGoal?.(goal.id)}><RotateCcw className="w-3 h-3" /></button>
        ) : (
          <button title="Pause" aria-label={`Pause ${goal.title}`} onClick={() => props.onPauseGoal?.(goal.id)}><Pause className="w-3 h-3" /></button>
        )}
        <button title="Delete" aria-label={`Delete ${goal.title}`} onClick={() => props.onDeleteGoal?.(goal.id)}><Trash2 className="w-3 h-3" /></button>
      </span>
    </li>
  );
}

function GoalsSection(props: AiIntentionsPanelProps) {
  const [title, setTitle] = useState("");
  const active = activeGoal(props.goals);
  const done = completedGoals(props.goals);
  const open = props.goals.filter((g) => g.status !== "completed");
  const summary = runSummary(props.replayRun);
  const create = () => {
    if (!title.trim()) return;
    props.onCreateGoal?.(title.trim());
    setTitle("");
  };
  return (
    <section className="space-y-1">
      <h5 className="text-[9px] uppercase text-cyan-400 font-bold">Active goal</h5>
      {active ? (
        <div data-active-goal={active.id}>
          <p className="text-slate-100">{active.title} — {active.progressPercent}%</p>
          <div className="h-1 rounded bg-slate-800"><div className="h-1 rounded bg-cyan-500" style={{ width: `${active.progressPercent}%` }} /></div>
        </div>
      ) : (
        <p className="text-slate-500">No goal in progress.</p>
      )}
      {summary && <p className="text-slate-400" data-run-summary>{summary}</p>}
      <ul className="space-y-0.5">{open.map((g) => <GoalRow key={g.id} goal={g} props={props} />)}</ul>
      <div className="flex gap-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New goal from current steps"
          className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-1 text-[10px]"
        />
        <button aria-label="Create goal" onClick={create} className="px-1 border border-cyan-700 rounded"><Plus className="w-3 h-3" /></button>
      </div>
      <h5 className="text-[9px] uppercase text-emerald-400 font-bold pt-1">Completed goals</h5>
      {done.length ? (
        <ul>
          {done.map((g) => (
            <li key={g.id} className="flex items-center gap-1 text-emerald-300" data-completed-goal={g.id}>
              <CheckCircle2 className="w-3 h-3" />{g.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500 flex items-center gap-1"><Circle className="w-3 h-3" />None yet.</p>
      )}
    </section>
  );
}

function LearningSection({ profile, profileError, onAdjustDelay }: Pick<AiIntentionsPanelProps, "profile" | "profileError" | "onAdjustDelay">) {
  const m = learningMetrics(profile);
  const zones = m.topZones.length ? m.topZones.map((z) => `(${z.x}, ${z.y})×${z.count}`).join(" ") : "—";
  const adjust = (delta: number) => {
    if (m.delayMultiplier === null) return;
    const next = Math.round((m.delayMultiplier + delta) * 10) / 10;
    onAdjustDelay?.(Math.min(DELAY_MULTIPLIER_MAX, Math.max(DELAY_MULTIPLIER_MIN, next)));
  };
  return (
    <section className="space-y-1">
      <h5 className="text-[9px] uppercase text-cyan-400 font-bold">Learning &amp; habits</h5>
      {profileError && <p className="text-rose-300" role="alert">Learning profile unavailable: {profileError}</p>}
      <div className="grid grid-cols-3 gap-1">
        <Metric label="Habit rate" value={formatPercent(m.habitDetectionRate)} />
        <Metric label="Repeated actions" value={formatCount(m.repetitiveActionCount)} />
        <Metric label="Learned workflows" value={formatCount(m.learnedWorkflows)} />
        <Metric label="Gate success" value={formatPercent(m.gateSuccessRate)} />
        <Metric label="Gate checks" value={formatCount(m.gateAttempts)} />
        <Metric label="Top zones" value={zones} />
      </div>
      <div className="flex items-center gap-1 text-slate-300">
        <span>Movement delay ×{m.delayMultiplier === null ? "—" : m.delayMultiplier.toFixed(1)}</span>
        <span className="text-slate-500">{m.userAdjusted ? "(set by you)" : "(learned)"}</span>
        <button aria-label="Slower movement" disabled={m.delayMultiplier === null} onClick={() => adjust(DELAY_STEP)} className="px-1 border border-slate-700 rounded">+</button>
        <button aria-label="Faster movement" disabled={m.delayMultiplier === null} onClick={() => adjust(-DELAY_STEP)} className="px-1 border border-slate-700 rounded">−</button>
        {m.userAdjusted && (
          <button aria-label="Return delay to learning" onClick={() => onAdjustDelay?.(null)} className="px-1 border border-slate-700 rounded">auto</button>
        )}
      </div>
    </section>
  );
}

/** Collapsible HUD panel: live intention, goals with checkoffs, and the learning strip. */
export const AiIntentionsPanel: React.FC<AiIntentionsPanelProps> = (props) => {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <div className="w-full max-w-xl max-h-[70vh] overflow-y-auto rounded-lg bg-slate-900/95 border border-cyan-500/40 shadow-xl text-[10px] font-mono">
      <button
        className="w-full flex items-center gap-1 px-2 py-1 text-cyan-300 font-bold"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Brain className="w-3 h-3" /> AI Intentions, Goals &amp; Learning
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          <IntentionSection {...props} />
          {props.masterChain || props.masterGuidance ? <OrchestrationSection {...props} /> : null}
          <GoalsSection {...props} />
          <LearningSection {...props} />
          <OverseerCheckupSection {...props} />
        </div>
      )}
    </div>
  );
};
