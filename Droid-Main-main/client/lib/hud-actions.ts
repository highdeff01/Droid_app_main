import {
  findTargetElement,
  gateTargetForAction,
  analysisConfidence,
} from "@/lib/action-gate";
import type {
  DetectedUIElement,
  PlannerActDecision,
  ScreenPerceptionReport,
} from "@/components/dual-ai-copilot-panel";
import type { HudEntity, HudGuideResult, HudPack } from "@shared/api";
import type { ReplayRun } from "@shared/replay";

/**
 * Screen HUD operations. Each one awaits the real endpoint and returns its result,
 * or throws with the server's error; none of them fabricates a result.
 */

export interface HudStepLike {
  id: string;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  delayMs?: number;
  targetOcrLabel?: string;
  referenceScreenshotUrl?: string;
  confidence?: number;
}

export type HudPost = (url: string, body?: unknown) => Promise<any>;

/** POST (or GET without a body) JSON; rejects on HTTP errors and on `success: false`. */
export const postHudJson: HudPost = async (url, body) => {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.success !== true) {
    throw new Error(data?.error || `${url} failed (HTTP ${response.status})`);
  }
  return data;
};

/** The HUD's frame as a data URL the analysis endpoints accept; throws when there is none. */
export function requireScreenshot(frame: string | null | undefined): string {
  if (!frame || !/^data:image\/(png|jpeg);base64,/.test(frame)) {
    throw new Error("No captured screen frame. Start capture or take a snapshot first.");
  }
  return frame;
}

export async function analyzeFrame(frame: string, post: HudPost = postHudJson): Promise<ScreenPerceptionReport> {
  const data = await post("/api/ai/describe-screen", { imageData: requireScreenshot(frame) });
  if (!data.report) throw new Error("Screen analysis returned no report");
  return data.report;
}

// ---------- Manual device bridge ----------

export interface InteractiveActionRequest {
  action: "click" | "double_click" | "right_click" | "drag" | "type" | "press_key";
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  text?: string;
  key?: string;
}

export interface InteractiveActionResult {
  simulated: boolean;
  message: string;
}

/** Manual (user-initiated, ungated) action: await the bridge and report whether it ran on the PC or only virtually. */
export async function dispatchInteractiveAction(
  request: InteractiveActionRequest,
  post: HudPost = postHudJson,
): Promise<InteractiveActionResult> {
  const data = await post("/api/pyautogui/interactive-action", {
    ...request,
    deviceMode: "android_studio_mirror",
  });
  if (data.error) throw new Error(data.error);
  return {
    simulated: data.simulated === true,
    message: data.message || `${request.action} at (${request.x}, ${request.y})`,
  };
}

/** Emergency stop of the PyAutoGUI bridge; throws when the stop did not reach the server. */
export async function stopBridge(post: HudPost = postHudJson): Promise<string> {
  const data = await post("/api/pyautogui/stop", {});
  return data.message || "Execution bridge stopped.";
}

// ---------- Context menu tools ----------

export interface OcrInspectResult {
  provider: string;
  text: string | null;
  confidence: number | null;
  blockCount: number;
}

export async function inspectOcrAtPoint(
  frame: string,
  point: { x: number; y: number },
  frameSize: { width: number; height: number },
  post: HudPost = postHudJson,
): Promise<OcrInspectResult> {
  const data = await post("/api/hud/ocr-inspect", {
    imageData: requireScreenshot(frame),
    x: point.x,
    y: point.y,
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
  });
  return {
    provider: data.provider,
    text: data.text ?? null,
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    blockCount: data.blockCount ?? 0,
  };
}

export async function tagEntityAtPoint(
  entity: Omit<HudEntity, "id" | "createdAt">,
  post: HudPost = postHudJson,
): Promise<HudEntity> {
  const data = await post("/api/hud/entities", entity);
  return data.entity;
}

/** Recorded steps within this distance of the clicked point are integrity-checked against the frame. */
export const INTEGRITY_STEP_RADIUS_PX = 48;

export type IntegrityResult =
  | { kind: "step"; stepName: string; driftPx: number; thresholdPx: number; withinThreshold: boolean; summary: string }
  | { kind: "element"; element: DetectedUIElement | null; confidence?: number };

export function nearestStep<T extends HudStepLike>(steps: T[], x: number, y: number): T | undefined {
  return steps
    .map((step) => ({ step, d: Math.hypot(step.x - x, step.y - y) }))
    .filter(({ d }) => d <= INTEGRITY_STEP_RADIUS_PX)
    .sort((a, b) => a.d - b.d)[0]?.step;
}

/**
 * Analyze the current frame; measure the drift of the recorded step at the point through the
 * auto-calibration pipeline, or report whether an analyzed element covers the point.
 */
export async function verifyIntegrityAtPoint(
  frame: string,
  point: { x: number; y: number },
  steps: HudStepLike[],
  thresholdPx: number,
  post: HudPost = postHudJson,
): Promise<IntegrityResult> {
  const report = await analyzeFrame(frame, post);
  const step = nearestStep(steps, point.x, point.y);
  if (!step) {
    const element = findTargetElement(report, point.x, point.y) ?? null;
    return { kind: "element", element, confidence: element ? analysisConfidence(report, element) : undefined };
  }
  const data = await post("/api/ai/auto-calibrate-workflow", {
    steps: [step],
    thresholdPx,
    elements: report.elements ?? [],
  });
  const drift = data.driftPoints?.[0];
  if (!drift) throw new Error("Calibration returned no drift measurement");
  return {
    kind: "step",
    stepName: step.name,
    driftPx: drift.driftPx,
    thresholdPx: data.thresholdPx,
    withinThreshold: !drift.isProblematic,
    summary: data.summary,
  };
}

// ---------- Qwen ----------

export async function askQwen(frame: string, question: string, post: HudPost = postHudJson): Promise<string> {
  const data = await post("/api/hud/qwen/ask", { imageData: requireScreenshot(frame), question });
  return data.answer;
}

export async function fetchQwenGuide(
  frame: string,
  steps: HudStepLike[],
  post: HudPost = postHudJson,
): Promise<HudGuideResult> {
  const sequence = steps.map(({ id, name, action, x, y, text }) => ({ id, name, action, x, y, text }));
  const data = await post("/api/hud/qwen/guide", { imageData: requireScreenshot(frame), sequence });
  return data.guide;
}

/** The text a guide-detected incomplete typing step still needs, as a gated step to append to it. */
export function completionStep<T extends HudStepLike>(guide: HudGuideResult, steps: T[]): T | null {
  const typing = guide.incompleteTyping;
  if (!typing?.remainingText) return null;
  const step = steps.find((s) => s.id === typing.stepId);
  if (!step) return null;
  return { ...step, id: `${step.id}_completion`, name: `Complete typing: ${step.name}`, action: "type_text", text: typing.remainingText };
}

// ---------- Test / Simulate ----------

export interface SimulatedStep {
  stepId: string;
  name: string;
  wouldPass: boolean;
  reason: string;
  confidence?: number;
}

/** Dry run: check every step against one analysis of the current frame. Dispatches nothing. */
export async function simulateSequence(
  frame: string,
  steps: HudStepLike[],
  post: HudPost = postHudJson,
): Promise<SimulatedStep[]> {
  const report = await analyzeFrame(frame, post);
  return steps.map((step) => {
    const target = gateTargetForAction(step.action, step.x, step.y, step.targetOcrLabel || step.name);
    if (!target.needsTarget) {
      return { stepId: step.id, name: step.name, wouldPass: true, reason: "No screen target needed", confidence: analysisConfidence(report) };
    }
    const element = findTargetElement(report, step.x, step.y);
    return element
      ? { stepId: step.id, name: step.name, wouldPass: true, reason: `Target "${element.name || element.type}" found`, confidence: analysisConfidence(report, element) }
      : { stepId: step.id, name: step.name, wouldPass: false, reason: `No analyzed element at (${step.x}, ${step.y})` };
  });
}

// ---------- Plan / Pack ----------

export interface CreatedPlan {
  name: string;
  decision: PlannerActDecision;
}

/** Analyze the frame, ask the planner for the next actions, and save the plan with the sequence as a workflow. */
export async function createPlan(
  name: string,
  frame: string,
  steps: HudStepLike[],
  objective: string,
  post: HudPost = postHudJson,
): Promise<CreatedPlan> {
  const report = await analyzeFrame(frame, post);
  const planned = await post("/api/ai/plan-and-act", { perceptionReport: report, userObjective: objective });
  const saved = await post("/api/workflows/save", {
    name,
    sequence: steps,
    metadata: { kind: "plan", objective, decision: planned.decision, createdFrom: "screen-hud" },
  });
  return { name: saved.name, decision: planned.decision };
}

/** The planner's proposed next action as a HUD step; null when it proposed none with coordinates. */
export function planNextStep(decision: PlannerActDecision): HudStepLike | null {
  const next = decision.nextAction;
  if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return null;
  return {
    id: next.id,
    name: next.title,
    action: next.actionType,
    x: next.x as number,
    y: next.y as number,
    text: next.textPayload,
    delayMs: next.delayMs,
    targetOcrLabel: next.targetName,
  };
}

/** Persist a pack server-side and list it in the workflows store so the workflows tab can load it. */
export async function createPack(
  name: string,
  steps: HudStepLike[],
  plan: unknown | null,
  post: HudPost = postHudJson,
): Promise<HudPack> {
  const screenshots = steps
    .map((s) => s.referenceScreenshotUrl)
    .filter((url): url is string => !!url && url.startsWith("data:image/"));
  const data = await post("/api/hud/packs", { name, sequence: steps, plan, screenshots });
  const pack: HudPack = data.pack;
  await post("/api/workflows/save", {
    name: `pack_${name}`,
    sequence: steps,
    metadata: { kind: "pack", packId: pack.id, screenshotCount: pack.screenshots.length, hasPlan: !!plan },
  });
  return pack;
}

export async function loadPack(id: string, post: HudPost = postHudJson): Promise<HudPack> {
  const data = await post(`/api/hud/packs/${encodeURIComponent(id)}`);
  return data.pack;
}

// ---------- Presentation ----------

export interface PresentationSlide {
  stepId: string;
  name: string;
  status: string;
  events: Array<{ at: number; phase: string; detail: string }>;
  screenshotUrl?: string;
  confidence?: number;
}

export interface Presentation {
  runId: string;
  status: ReplayRun["status"];
  startedAt: number;
  completed: number;
  total: number;
  error?: string;
  slides: PresentationSlide[];
}

/** Summarize a finished replay run from its own events; confidence appears only where analysis gave one. */
export function buildPresentation(run: ReplayRun, steps: HudStepLike[]): Presentation {
  if (run.status === "running" || run.status === "paused") {
    throw new Error("The run is still in progress; build the presentation once it finishes.");
  }
  const byId = new Map(steps.map((s) => [s.id, s]));
  const slides = run.steps.map((runStep, index) => {
    const step = byId.get(runStep.id);
    return {
      stepId: runStep.id,
      name: step?.name ?? `Step ${index + 1}`,
      status: runStep.status,
      events: run.events
        .filter((e) => e.stepId === runStep.id)
        .map((e) => ({ at: e.at, phase: e.phase, detail: e.detail })),
      screenshotUrl: step?.referenceScreenshotUrl,
      confidence: typeof step?.confidence === "number" ? step.confidence : undefined,
    };
  });
  return {
    runId: run.id,
    status: run.status,
    startedAt: run.startedAt,
    completed: run.completed,
    total: run.total,
    error: run.error,
    slides,
  };
}
