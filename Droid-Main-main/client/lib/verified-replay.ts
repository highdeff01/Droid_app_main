/**
 * Runs AI/replay-driven step sequences for real: the action gate verifies the
 * target on a fresh analyzed frame, the replay engine executes the steps, and
 * the run is polled until it reaches a terminal status. Nothing is simulated:
 * every failure rejects with the reason so callers surface it and stop.
 */
import type { SequenceStep } from "@/components/live-screen-hud";
import {
  gateTargetForSteps,
  runActionGate,
  type GateResult,
} from "@/lib/action-gate";
import {
  fetchReplay,
  startReplay,
  TERMINAL_REPLAY_STATUSES,
  type ReplayRunSnapshot,
} from "@/lib/automation-runner";

/** Matches the replay request limit in shared/replay.ts. */
export const MAX_REPLAY_ACTIONS = 100;
export const REPLAY_STATUS_POLL_MS = 1000;
const GATE_TIMEOUT_MS = 45000;

export interface RecordedStepLike {
  id: string;
  name: string;
  action: SequenceStep["action"];
  x: number;
  y: number;
  originalX?: number;
  originalY?: number;
  offsetX?: number;
  offsetY?: number;
  text?: string;
  keyPayload?: string;
  delayMs?: number;
  targetOcrLabel?: string;
}

export interface RecordedSessionLike {
  id?: string;
  name: string;
  points: { x: number; y: number; type?: string }[];
}

const CLICK_POINT_ACTIONS: Record<string, SequenceStep["action"]> = {
  click: "click",
  left_click: "click",
  right_click: "right_click",
};

export interface ReplayDeps {
  gate: typeof runActionGate;
  start: typeof startReplay;
  fetch: typeof fetchReplay;
  sleep: (ms: number) => Promise<void>;
}

export interface VerifiedReplayOptions {
  signal: AbortSignal;
  onGate?: (result: GateResult) => void;
  onProgress?: (run: ReplayRunSnapshot) => void;
}

const defaultDeps: ReplayDeps = {
  gate: runActionGate,
  start: startReplay,
  fetch: fetchReplay,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Recorded steps → replay steps at their calibrated coordinates; rejects an empty recording. */
export function toReplaySteps(steps: RecordedStepLike[]): SequenceStep[] {
  if (steps.length === 0) {
    throw new Error("No recorded steps to replay. Record a workflow first.");
  }
  return steps.map((step, index) => ({
    id: step.id,
    stepNumber: index + 1,
    name: step.name,
    action: step.action,
    x: Math.round((step.originalX ?? step.x) + (step.offsetX || 0)),
    y: Math.round((step.originalY ?? step.y) + (step.offsetY || 0)),
    delayMs: step.delayMs ?? 500,
    text: step.text,
    keyPayload: step.keyPayload,
    targetOcrLabel: step.targetOcrLabel,
    status: "pending",
  }));
}

/** A mouse recording's click points as replayable steps; moves/hovers/drags are not replayed. */
export function sessionToReplaySteps(session: RecordedSessionLike): SequenceStep[] {
  const clicks = session.points.filter((p) => p.type && CLICK_POINT_ACTIONS[p.type]);
  if (clicks.length === 0) {
    throw new Error(`Session "${session.name}" has no recorded clicks to replay`);
  }
  if (clicks.length > MAX_REPLAY_ACTIONS) {
    throw new Error(
      `Session "${session.name}" has ${clicks.length} clicks; a replay run allows at most ${MAX_REPLAY_ACTIONS}`,
    );
  }
  return clicks.map((point, index) => ({
    id: `${session.id || "session"}_click_${index + 1}`,
    stepNumber: index + 1,
    name: `${session.name} click ${index + 1}`,
    action: CLICK_POINT_ACTIONS[point.type as string],
    x: Math.round(point.x),
    y: Math.round(point.y),
    delayMs: 500,
    status: "pending",
  }));
}

/** Polls the replay run until it is terminal; rejects unless it completed. */
export async function waitForReplayRun(
  run: ReplayRunSnapshot,
  { signal, onProgress }: VerifiedReplayOptions,
  deps: ReplayDeps = defaultDeps,
): Promise<ReplayRunSnapshot> {
  let current = run;
  onProgress?.(current);
  while (!TERMINAL_REPLAY_STATUSES.includes(current.status)) {
    await deps.sleep(REPLAY_STATUS_POLL_MS);
    if (signal.aborted) throw new Error("Replay monitoring cancelled");
    current = await deps.fetch(current.id, signal);
    onProgress?.(current);
  }
  if (current.status !== "completed") {
    throw new Error(current.error || `Replay ${current.status}`);
  }
  return current;
}

/** Gate → replay → wait. Resolves with the completed run; rejects with the blocking reason. */
export async function runVerifiedReplay(
  steps: SequenceStep[],
  options: VerifiedReplayOptions,
  deps: ReplayDeps = defaultDeps,
): Promise<ReplayRunSnapshot> {
  const gate = await deps.gate({
    targetDevice: "desktop",
    target: gateTargetForSteps(steps),
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(GATE_TIMEOUT_MS)]),
  });
  options.onGate?.(gate);
  if (gate.status !== "verified") {
    throw new Error(`Action blocked: ${gate.reason}`);
  }
  if (options.signal.aborted) throw new Error("Replay cancelled before dispatch");
  const run = await deps.start(steps, options.signal);
  return waitForReplayRun(run, options, deps);
}
