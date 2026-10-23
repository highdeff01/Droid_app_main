/**
 * The mouse-adjacent cognition panel's model: a pure reduction of real
 * GoalLoopEvent emissions (and the master AI session state) into what the
 * panel shows. Nothing here invents a thought: the thought is the last event's
 * own message, and before any event the panel says it is waiting.
 */
import type { GoalLoopEvent, GoalLoopPhase, PipelineReport, StepBrief, StepNarration } from "@/lib/qwen-turn-loop";
import type { MasterSnapshot } from "@/lib/master-ai";

export const WAITING_FOR_INSPECTION = "waiting for first inspection…";

/** The three honest activity kinds the HUD notifies about. */
export type ActivityKind = "thinking" | "acting" | "replay";

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  thinking: "AI is thinking/verifying",
  acting: "AI is acting (real click/type dispatched)",
  replay: "Automation replay executing (no AI decision)",
};

/** Which notification each loop phase is; completed/failed end the activity. */
export const PHASE_ACTIVITY: Record<GoalLoopPhase, ActivityKind | null> = {
  thinking: "thinking",
  analyzing: "thinking",
  verifying: "thinking",
  awaiting_approval: "thinking",
  acting: "acting",
  completed: null,
  failed: null,
};

export interface ActivityNotice {
  kind: ActivityKind;
  message: string;
}

export interface CognitionState {
  goal: string | null;
  phase: GoalLoopPhase | null;
  /** Exactly the last event's message; null before any event. */
  thought: string | null;
  /** Coordinates/target the last event carried (never defaulted). */
  point: { x: number; y: number } | null;
  targetLabel: string | null;
  confidence: number | null;
  current: StepBrief | null;
  /** undefined: no step event yet; null: the loop reported no step left. */
  next: StepBrief | null | undefined;
  narration: StepNarration | null;
  pipeline: PipelineReport | null;
  activity: ActivityNotice | null;
}

export const INITIAL_COGNITION: CognitionState = {
  goal: null,
  phase: null,
  thought: null,
  point: null,
  targetLabel: null,
  confidence: null,
  current: null,
  next: undefined,
  narration: null,
  pipeline: null,
  activity: null,
};

/** Folds one real loop event into the panel state; fields the event does not carry keep their last real value. */
export function reduceCognition(state: CognitionState, event: GoalLoopEvent): CognitionState {
  const kind = PHASE_ACTIVITY[event.phase];
  const hasPoint = typeof event.x === "number" && typeof event.y === "number";
  return {
    goal: event.goal ?? state.goal,
    phase: event.phase,
    thought: event.message,
    point: hasPoint ? { x: event.x!, y: event.y! } : null,
    targetLabel: event.label ?? null,
    confidence: typeof event.confidence === "number" ? event.confidence : null,
    current: event.current ?? state.current,
    next: event.next !== undefined ? event.next : state.next,
    narration: event.narration ?? state.narration,
    pipeline: event.pipeline ?? state.pipeline,
    activity: kind ? { kind, message: event.message } : null,
  };
}

/** A plain HUD sequence replay: no AI decision, reported as such. */
export function replayActivity(state: CognitionState, message: string | null): CognitionState {
  return { ...state, activity: message ? { kind: "replay", message } : null };
}

export interface CognitionView {
  goal: string;
  thought: string;
  detail: string | null;
  current: string | null;
  next: string | null;
  narration: string | null;
  pipeline: string | null;
  master: string | null;
}

/** "click \"Submit\" at (120, 340)"; coordinates only when known. */
export function formatStep(step: StepBrief): string {
  const target = step.label && step.label !== step.name ? ` → ${step.label}` : "";
  return `${step.name} · ${step.action}${target} @ (${Math.round(step.x)}, ${Math.round(step.y)})`;
}

function detailOf(state: CognitionState): string | null {
  const parts: string[] = [];
  if (state.phase) parts.push(state.phase.replace("_", " "));
  if (state.targetLabel) parts.push(`target "${state.targetLabel}"`);
  if (state.point) parts.push(`(${Math.round(state.point.x)}, ${Math.round(state.point.y)})`);
  if (state.confidence !== null) parts.push(`${Math.round(state.confidence * 100)}% confidence`);
  return parts.length ? parts.join(" · ") : null;
}

function narrationOf(n: StepNarration | null): string | null {
  if (!n) return null;
  const verdict = n.passed ? "✓ verified" : "✗ not verified";
  const track = n.progress === "on_track" ? "on track" : `${n.progress.replace("_", " ")}: ${n.progressReason ?? ""}`.trim();
  const plotted = n.nextObjective ? `next objective: ${n.nextObjective}` : "no planned step left";
  return `Previous "${n.step}" ${verdict}${n.checks ? ` (${n.checks})` : ""} · ${track} · ${plotted}`;
}

function pipelineOf(p: PipelineReport | null): string | null {
  if (!p) return null;
  const stage = p.stage === "pre" ? "pre-verified in background" : "confirmed on fresh frame";
  return `Next "${p.step}" ${stage}: ${p.verdict} — ${p.reason}`;
}

/** The master AI's running operation, from its real snapshot. */
export function masterLine(snapshot: MasterSnapshot | null | undefined): string | null {
  if (!snapshot?.active) return null;
  const running = snapshot.operations.find((op) => op.status === "running" || op.status === "awaiting_approval");
  if (!running) return "Master AI session active; no operation running";
  return `Master AI: ${running.kind} "${running.title}" ${running.status.replace("_", " ")}${running.detail ? ` — ${running.detail}` : ""}`;
}

/** What the panel renders; before any event the thought is the waiting line and nothing else is invented. */
export function cognitionView(state: CognitionState, master?: MasterSnapshot | null): CognitionView {
  return {
    goal: state.goal ?? "—",
    thought: state.thought ?? WAITING_FOR_INSPECTION,
    detail: detailOf(state),
    current: state.current ? formatStep(state.current) : null,
    next: state.next === undefined ? null : state.next ? formatStep(state.next) : "no further planned step",
    narration: narrationOf(state.narration),
    pipeline: pipelineOf(state.pipeline),
    master: masterLine(master),
  };
}

export const COGNITION_CUES_STORAGE_KEY = "sightline_cognition_cues";

/** The sound/visual cue toggle; off unless the user turned it on. */
export function loadCuesEnabled(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  return storage?.getItem(COGNITION_CUES_STORAGE_KEY) === "on";
}

export function saveCuesEnabled(enabled: boolean, storage: Pick<Storage, "setItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  storage?.setItem(COGNITION_CUES_STORAGE_KEY, enabled ? "on" : "off");
}

const CUE_TONE: Record<ActivityKind, number> = { thinking: 440, acting: 880, replay: 660 };

/** A short tone distinct per activity kind. */
export function playActivityCue(kind: ActivityKind) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(CUE_TONE[kind], ctx.currentTime);
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch {
    // Audio is optional; the visual cue still shows.
  }
}
