/**
 * HUD wiring for the replay buttons: the real dependencies of the stepwise replay runner
 * (control backend check, live capture, frame decoding, element check), recorded-trail
 * playback on the AI cursor overlay, the hardware trail dispatch, and session conversion.
 * Every function reports what really happened; none of them assumes success.
 */
import { fetchBridgeStatus, type BridgeStatusView } from "@/lib/bridge-status";
import { captureScreenFrame } from "@/lib/automation-runner";
import { analyzeFrame, type HudStepLike } from "@/lib/hud-actions";
import { findTargetElement } from "@/lib/action-gate";
import { loadGrayFrame } from "@/lib/frame-diff";
import type { LoadedFrame, StepwiseDeps, StepwiseStep } from "@/lib/stepwise-replay";
import type { TurnLoopResult } from "@/lib/qwen-turn-loop";
import type { MouseRecordingSession, SessionThumbnail } from "@/lib/mouse-trajectory-store";
import { trailToTimeline, type TimedWaypoint, type TrailPoint } from "@shared/trail-replay";
import { parseProposedSteps, type GoalStep } from "@shared/goal-loop";

const CLICK_TYPES = new Set(["click", "left_click", "right_click", "double_click"]);

/** Why the desktop control backend cannot act, or null when it can. */
export function controlUnavailableReason(view: BridgeStatusView): string | null {
  if (!view.control.startsWith("Control: unavailable")) return null;
  return [view.control, view.fix].filter(Boolean).join(" — ");
}

/** Browser-only: the pixel size of a data-URL image. */
function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Frame image could not be decoded"));
    img.src = dataUrl;
  });
}

/** Browser-only: a frame decoded for comparison, with the size of the screenshot it came from. */
export async function loadReplayFrame(dataUrl: string): Promise<LoadedFrame> {
  const [size, gray] = await Promise.all([imageSize(dataUrl), loadGrayFrame(dataUrl)]);
  return { gray, ...size };
}

export interface HudStepwiseWiring {
  targetDevice: string;
  /** Dispatches one step through the action gate; resolves once it completed on the device. */
  runStep: (step: StepwiseStep) => Promise<void>;
  replan: StepwiseDeps["replan"];
}

/** The runner's dependencies on the real backend: bridge health, capture, analysis and the gate. */
export function createStepwiseDeps(wiring: HudStepwiseWiring): StepwiseDeps {
  return {
    checkBackend: async (signal) =>
      wiring.targetDevice === "desktop" ? controlUnavailableReason(await fetchBridgeStatus(signal)) : null,
    capture: (signal) => captureScreenFrame(signal),
    loadFrame: loadReplayFrame,
    runStep: (step) => wiring.runStep(step),
    findElement: async (frame, step) => {
      const element = findTargetElement(await analyzeFrame(frame), step.x, step.y);
      return element ? element.name || "element" : null;
    },
    replan: wiring.replan,
  };
}

/** One line on what the Qwen replanner really did. */
export function describeReplanResult(result: TurnLoopResult): string {
  switch (result.status) {
    case "completed":
      return `Qwen replanned and completed the route (${result.steps.length} step(s) verified)`;
    case "planned":
      return `Qwen proposed a new route of ${result.state.plan.length} step(s); it was not run`;
    case "answered":
      return `Qwen answered: ${result.answer}`;
    case "failed":
      return `Qwen replan did not reach the goal: ${result.reason}`;
  }
}

/** A stored session's points as a replayable trail (recorded positions, timing and clicks). */
export function sessionToTrail(session: { points: Array<{ x: number; y: number; timestamp: number; type?: string }> }): TrailPoint[] {
  return session.points.map((p) => ({ x: p.x, y: p.y, time: p.timestamp, isClick: CLICK_TYPES.has(p.type ?? "") }));
}

/** HUD steps as turn-loop goal steps; a step the turn loop cannot verify is reported, never dropped silently. */
export function toGoalSteps(steps: HudStepLike[]): GoalStep[] {
  const goalSteps = parseProposedSteps(
    steps.map((step) => ({
      id: step.id,
      name: step.name,
      action: step.action,
      x: Math.max(0, Math.round(step.x)),
      y: Math.max(0, Math.round(step.y)),
      targetLabel: step.targetOcrLabel,
      text: step.text,
      delayMs: step.delayMs === undefined ? undefined : Math.min(5000, Math.max(0, Math.round(step.delayMs))),
    })),
    "hud_step",
  );
  if (goalSteps.length !== steps.length) {
    throw new Error(`${steps.length - goalSteps.length} step(s) have an action or value the turn loop cannot verify`);
  }
  return goalSteps;
}

/** A recorded trail as session points for the store. */
export function trailToSessionPoints(trail: TrailPoint[]): MouseRecordingSession["points"] {
  return trail.map((p) => ({ x: p.x, y: p.y, timestamp: p.time ?? 0, type: p.isClick ? "click" : "move" }));
}

export interface TrailPlayback {
  signal?: AbortSignal;
  onWaypoint: (waypoint: TimedWaypoint, index: number, total: number) => void;
  schedule?: (fn: () => void, ms: number) => unknown;
}

/**
 * Plays the recorded trail as recorded: each waypoint fires at its recorded offset (scaled by
 * speed). Resolves with how many waypoints were played (fewer when aborted).
 */
export function playTrailTimeline(points: TrailPoint[], speed: number, playback: TrailPlayback): Promise<number> {
  const timeline = trailToTimeline(points, speed);
  const schedule = playback.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  return new Promise((resolve) => {
    let index = 0;
    const startedAt = Date.now();
    const next = () => {
      if (playback.signal?.aborted || index >= timeline.length) return resolve(index);
      playback.onWaypoint(timeline[index], index, timeline.length);
      index += 1;
      if (index >= timeline.length) return resolve(index);
      schedule(next, Math.max(0, timeline[index].atMs - (Date.now() - startedAt)));
    };
    next();
  });
}

/** The AI cursor overlay event for one replayed waypoint. */
export function overlayCursorEvent(waypoint: TimedWaypoint, index: number, total: number) {
  return {
    x: waypoint.x,
    y: waypoint.y,
    action: waypoint.isClick ? "clicking" : "moving",
    targetLabel: `Recorded waypoint ${index + 1}/${total}`,
    isActing: index < total - 1,
  };
}

export interface TrailDispatchResult {
  executed: boolean;
  message: string;
}

/** Sends the recorded trail to the hardware mouse (manual control, ungated) and reports the bridge's real result. */
export async function replayTrailOnPC(points: TrailPoint[], speed: number, signal?: AbortSignal): Promise<TrailDispatchResult> {
  try {
    const response = await fetch("/api/pyautogui/replay-trail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trail: points, speedMultiplier: speed, executeOnHardware: true }),
      signal,
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.success === true && data.executedOnHardware === true) {
      return { executed: true, message: `Replayed ${data.replayedPoints} recorded waypoint(s) on the PC` };
    }
    const reason = data?.error || data?.status || `HTTP ${response.status}`;
    return { executed: false, message: `Trail not replayed on the PC: ${reason}` };
  } catch (error) {
    return { executed: false, message: `Trail not replayed on the PC: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Browser-only: a downscaled JPEG of a captured frame for a session thumbnail; null when it cannot be decoded. */
export function makeThumbnail(frame: SessionThumbnail, maxWidth = 160): Promise<SessionThumbnail | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ imageData: canvas.toDataURL("image/jpeg", 0.7), timestamp: frame.timestamp });
    };
    img.onerror = () => resolve(null);
    img.src = frame.imageData;
  });
}
