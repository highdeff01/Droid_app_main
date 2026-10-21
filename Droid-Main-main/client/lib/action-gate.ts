import type {
  DetectedUIElement,
  ScreenPerceptionReport,
} from "@/components/dual-ai-copilot-panel";

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
}

export type GateResult =
  | {
      status: "verified";
      frame: string;
      report: ScreenPerceptionReport;
      element?: DetectedUIElement;
      confidence?: number;
    }
  | { status: "blocked" | "cancelled"; reason: string };

export type GatePost = (
  url: string,
  body: unknown,
  options: { apiKey?: string; signal: AbortSignal },
) => Promise<any>;

/** POST JSON with the caller's abort signal; rejects on HTTP or `success: false`. */
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
  const data = await response.json();
  if (!response.ok || data.success !== true) {
    throw new Error(data.error || `${url} failed`);
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

function failure(error: unknown, signal: AbortSignal): GateResult {
  if (signal.aborted) {
    return { status: "cancelled", reason: "Action cancelled before dispatch" };
  }
  const reason =
    error instanceof Error ? error.message : "Screen analysis failed";
  return { status: "blocked", reason };
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

/**
 * Capture a fresh frame, analyze it, and confirm the target is on screen.
 * Never falls back to a stale frame: any capture or analysis failure blocks the action.
 */
export async function runActionGate(
  request: GateRequest,
  post: GatePost = postGateJson,
): Promise<GateResult> {
  const { target, signal, apiKey } = request;
  try {
    const capture = await post(
      "/api/replay/capture",
      { targetDevice: request.targetDevice, deviceId: request.deviceId },
      { apiKey, signal },
    );
    const frame: string | undefined = capture.frame?.image;
    if (!frame) throw new Error("Screen capture returned no frame");
    const point = toFramePoint(target, capture.frame);
    const data = await post(
      "/api/ai/describe-screen",
      { imageData: frame },
      { apiKey, signal },
    );
    if (signal.aborted) return failure(null, signal);
    const report: ScreenPerceptionReport | undefined = data.report;
    if (!report) throw new Error("Screen analysis returned no report");
    if (!target.needsTarget) {
      return {
        status: "verified",
        frame,
        report,
        confidence: analysisConfidence(report),
      };
    }
    const element = findTargetElement(report, point.x, point.y);
    if (!element) {
      const name = target.label ? `"${target.label}" ` : "";
      throw new Error(
        `Target ${name}not found at (${point.x}, ${point.y}) in the analyzed screen`,
      );
    }
    return {
      status: "verified",
      frame,
      report,
      element,
      confidence: analysisConfidence(report, element),
    };
  } catch (error) {
    return failure(error, signal);
  }
}
