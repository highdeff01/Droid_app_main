import type {
  DetectedUIElement,
  ScreenPerceptionReport,
} from "@/components/dual-ai-copilot-panel";
import { readApiJson } from "@/lib/backend-status";

/** Slack around an element's bounding box when matching the action point. */
export const TARGET_PADDING_PX = 12;

/** Actions that land on a screen coordinate and therefore need a verified target. */
const POSITIONAL_ACTIONS = new Set([
  "click",
  "double_click",
  "right_click",
  "clear_and_type",
  "type_text",
  "type",
  "scroll",
  "tap",
  "double_tap",
]);

export interface GateTarget {
  x: number;
  y: number;
  label?: string;
  needsTarget: boolean;
  /** x/y are 0–1 fractions of the captured frame rather than pixels. */
  relative?: boolean;
}

export interface GateStepLike {
  action: string;
  x: number;
  y: number;
  name?: string;
  targetOcrLabel?: string;
}

export interface GateRequest {
  targetDevice: string;
  deviceId?: string;
  apiKey?: string;
  target: GateTarget;
  signal: AbortSignal;
  /** The step being verified, for the blocked reason. */
  stepLabel?: string;
  /** Where the AI may act; defaults to the user's persisted scope (lib/ai-scope). */
  scope?: AiScope;
}

/** Extra capture+analysis rounds after a "target not found" (docs/verified-replay.md: at most twice). */
export const MAX_REINSPECTIONS = 2;

/** Extra rounds after a capture/analysis failure (a transient hiccup gets one more try). */
export const MAX_TRANSIENT_RETRIES = 1;
/** Wait before retrying a failed capture/analysis round. */
export const TRANSIENT_RETRY_BACKOFF_MS = 750;

export type GateSleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** Resolves after `ms`, or at once when the signal aborts. */
export const abortableSleep: GateSleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

/** Where the gate stopped: no frame, no usable analysis, or no element at the target. */
export type GateStage = "capture" | "analysis" | "target_not_found";

/** Everything the HUD/toast needs to say precisely why an action was blocked. */
export interface GateBlockDetail {
  stage: GateStage;
  stepLabel?: string;
  targetLabel?: string;
  x: number;
  y: number;
  /** Elements in the last analysis; null when no analysis completed. */
  elementsDetected: number | null;
  /** Capture+analysis rounds performed (1 + reinspections). */
  attempts: number;
  error: string;
  /** Last analyzed frame and report; present only for target_not_found. */
  frame?: string;
  report?: ScreenPerceptionReport;
}

export type GateResult =
  | {
      status: "verified";
      frame: string;
      report: ScreenPerceptionReport;
      element?: DetectedUIElement;
      confidence?: number;
      attempts?: number;
    }
  | { status: "blocked"; reason: string; detail?: GateBlockDetail }
  | { status: "cancelled"; reason: string };

const STAGE_LABEL: Record<GateStage, string> = {
  capture: "screen capture failed",
  analysis: "screen analysis failed",
  target_not_found: "target not found",
};

/** One actionable sentence: which step, target, coordinates, elements detected and failing stage. */
export function formatBlockedReason(detail: GateBlockDetail): string {
  const step = detail.stepLabel ? `Step "${detail.stepLabel}"` : "Action";
  const target = detail.targetLabel ? ` target "${detail.targetLabel}"` : " target";
  const elements =
    detail.elementsDetected === null
      ? "no elements analyzed"
      : `${detail.elementsDetected} element${detail.elementsDetected === 1 ? "" : "s"} detected`;
  const tries = `${detail.attempts} inspection${detail.attempts === 1 ? "" : "s"}`;
  return `${step}:${target} at (${detail.x}, ${detail.y}) — ${STAGE_LABEL[detail.stage]} after ${tries}, ${elements}. ${detail.error}`;
}

/** Only a target-not-found block (a real frame and analysis exist) may be overridden by the user. */
export function canUserOverride(result: GateResult): result is {
  status: "blocked";
  reason: string;
  detail: GateBlockDetail & { frame: string; report: ScreenPerceptionReport };
} {
  return (
    result.status === "blocked" &&
    result.detail?.stage === "target_not_found" &&
    !!result.detail.frame &&
    !!result.detail.report
  );
}

/** Label every override dispatch carries; never applied without an explicit user confirmation. */
export const USER_VERIFIED_OVERRIDE = "user-verified override";

/**
 * Turn a target-not-found block into a verified result after the user explicitly confirmed it.
 * Returns undefined for any other result: capture/analysis failures can never be overridden.
 */
export function applyUserOverride(
  result: GateResult,
  userConfirmed: boolean,
): (GateResult & { status: "verified"; override: true }) | undefined {
  if (!userConfirmed || !canUserOverride(result)) return undefined;
  return {
    status: "verified",
    frame: result.detail.frame,
    report: result.detail.report,
    confidence: undefined,
    attempts: result.detail.attempts,
    override: true,
  };
}

export type GatePost = (
  url: string,
  body: unknown,
  options: { apiKey?: string; signal: AbortSignal },
) => Promise<any>;

/** Why a gate request got a non-JSON body: the Express automation API is not behind /api. */
export function backendNonJsonReason(status: number): string {
  return `backend API unreachable or returned non-JSON (HTTP ${status}) — the automation server is not running; start it locally (npm run dev, port 3000)`;
}

/** POST JSON with the caller's abort signal; rejects on a non-JSON body, HTTP error or `success: false`. */
export const postGateJson: GatePost = async (url, body, { apiKey, signal }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = await readApiJson(response, url);
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || `${url} failed`);
  }
  return data;
};

/** The gate target for one action at a point; only positional actions need an element there. */
export function gateTargetForAction(
  action: string,
  x: number,
  y: number,
  label?: string,
  relative?: boolean,
): GateTarget {
  return { x, y, label, needsTarget: POSITIONAL_ACTIONS.has(action), relative };
}

/** The step whose coordinate the gate verifies: the first positional step, else the first step. */
export function gateTargetForSteps(steps: GateStepLike[]): GateTarget {
  const step = steps.find((s) => POSITIONAL_ACTIONS.has(s.action)) ?? steps[0];
  return {
    x: step.x,
    y: step.y,
    label: step.targetOcrLabel || step.name,
    needsTarget: POSITIONAL_ACTIONS.has(step.action),
  };
}

function containsPoint(el: DetectedUIElement, x: number, y: number): boolean {
  const { x: left, y: top, width, height } = el.boundingBox;
  return (
    x >= left - TARGET_PADDING_PX &&
    x <= left + width + TARGET_PADDING_PX &&
    y >= top - TARGET_PADDING_PX &&
    y <= top + height + TARGET_PADDING_PX
  );
}

/** The smallest analyzed element whose (padded) bounding box contains the point. */
export function findTargetElement(
  report: ScreenPerceptionReport,
  x: number,
  y: number,
): DetectedUIElement | undefined {
  const area = (el: DetectedUIElement) =>
    el.boundingBox.width * el.boundingBox.height;
  return (report.elements ?? [])
    .filter((el) => el.boundingBox && containsPoint(el, x, y))
    .sort((a, b) => area(a) - area(b))[0];
}

/** Confidence as reported by the analysis; undefined when the analysis gave none. */
export function analysisConfidence(
  report: ScreenPerceptionReport,
  element?: DetectedUIElement,
): number | undefined {
  const value = element ? element.confidence : report.confidence;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

const CANCELLED: GateResult = {
  status: "cancelled",
  reason: "Action cancelled before dispatch",
};

/** A failure tagged with the gate stage it happened in. */
class GateStageError extends Error {
  constructor(
    readonly stage: GateStage,
    message: string,
    readonly inspection?: Inspection,
  ) {
    super(message);
  }
}

interface Inspection {
  frame: string;
  report: ScreenPerceptionReport;
  point: { x: number; y: number };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** The target point in frame pixels; relative (0–1) targets are scaled by the captured frame's size. */
export function toFramePoint(
  target: GateTarget,
  frame: { width?: number; height?: number } | undefined,
): { x: number; y: number } {
  if (!target.relative) return { x: target.x, y: target.y };
  const width = frame?.width;
  const height = frame?.height;
  if (!width || !height) {
    throw new Error("Screen capture reported no frame size for a relative target");
  }
  return { x: Math.round(target.x * width), y: Math.round(target.y * height) };
}

/** One fresh capture + analysis; throws a GateStageError naming the stage that failed. */
async function inspectOnce(
  request: GateRequest,
  post: GatePost,
): Promise<Inspection> {
  const { target, signal, apiKey } = request;
  let frame: string;
  let point: { x: number; y: number };
  try {
    const capture = await post(
      "/api/replay/capture",
      { targetDevice: request.targetDevice, deviceId: request.deviceId },
      { apiKey, signal },
    );
    frame = capture.frame?.image;
    if (!frame) throw new Error("Screen capture returned no frame");
    point = toFramePoint(target, capture.frame);
  } catch (error) {
    throw new GateStageError("capture", messageOf(error, "Screen capture failed"));
  }
  try {
    const data = await post(
      "/api/ai/describe-screen",
      { imageData: frame },
      { apiKey, signal },
    );
    const report: ScreenPerceptionReport | undefined = data.report;
    if (!report) throw new Error("Screen analysis returned no report");
    return { frame, report, point };
  } catch (error) {
    throw new GateStageError("analysis", messageOf(error, "Screen analysis failed"));
  }
}

function blocked(
  request: GateRequest,
  error: GateStageError,
  attempts: number,
): GateResult {
  const point = error.inspection?.point ?? { x: request.target.x, y: request.target.y };
  const detail: GateBlockDetail = {
    stage: error.stage,
    stepLabel: request.stepLabel,
    targetLabel: request.target.label,
    x: point.x,
    y: point.y,
    elementsDetected: error.inspection ? (error.inspection.report.elements ?? []).length : null,
    attempts,
    error: error.message,
    frame: error.inspection?.frame,
    report: error.inspection?.report,
  };
  return { status: "blocked", reason: formatBlockedReason(detail), detail };
}

/**
 * Capture a fresh frame, analyze it, and confirm the target is on screen.
 * A missed target is re-captured and re-analyzed up to MAX_REINSPECTIONS times;
 * a capture or analysis failure is retried MAX_TRANSIENT_RETRIES times after a
 * short backoff, then blocks with the total attempts. Never falls back to a stale frame.
 */
export async function runActionGate(
  request: GateRequest,
  post: GatePost = postGateJson,
  sleep: GateSleep = abortableSleep,
): Promise<GateResult> {
  const { signal } = request;
  const scope = request.scope ?? getAiScope();
  const scoped = scopeTarget(request.target, scope, request.targetDevice);
  if (scoped.reason !== undefined) return { status: "blocked", reason: scoped.reason };
  const target = scoped.target!;
  const scopedRequest = { ...request, target };
  let attempts = 0;
  let transientRetries = 0;
  for (;;) {
    attempts++;
    let inspection: Inspection;
    try {
      inspection = await inspectOnce(scopedRequest, post);
    } catch (error) {
      if (signal.aborted) return CANCELLED;
      return blocked(scopedRequest, error as GateStageError, attempts);
    }
    if (signal.aborted) return CANCELLED;
    const { frame, report, point } = inspection;
    if (!target.needsTarget) {
      return { status: "verified", frame, report, confidence: analysisConfidence(report), attempts };
    }
    const element = findTargetElement(scopeReport(report, scope, request.targetDevice), point.x, point.y);
    if (element) {
      return {
        status: "verified",
        frame,
        report,
        element,
        confidence: analysisConfidence(report, element),
        attempts,
      };
    }
    if (attempts - transientRetries > MAX_REINSPECTIONS) {
      const name = target.label ? `"${target.label}" ` : "";
      const miss = new GateStageError(
        "target_not_found",
        `Target ${name}not found at (${point.x}, ${point.y}) in the analyzed screen`,
        inspection,
      );
      return blocked(scopedRequest, miss, attempts);
    }
  }
}
