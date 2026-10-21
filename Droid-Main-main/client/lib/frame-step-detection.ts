import { findTargetElement, postGateJson, type GatePost } from "@/lib/action-gate";
import type { DetectedUIElement, ScreenPerceptionReport } from "@/components/dual-ai-copilot-panel";

/**
 * Real step detection over recorded frames: each frame goes through the vision model
 * (/api/ai/describe-screen), and each recorded click becomes a step only when it lands
 * on an element the model detected in the frame nearest to it. Nothing is invented.
 */

/** Seconds into the recording at which keyframes are sampled. */
export const FRAME_SAMPLE_TIMES = [0.2, 0.8, 1.6, 2.4, 3.2, 4.0];

/** Recorded clicks are normalized to this space; frames are drawn at half of it. */
export const RECORDING_SPACE = { width: 1920, height: 1080 };
export const FRAME_SPACE = { width: 960, height: 540 };

export interface RecordedFrame {
  image: string;
  /** Seconds into the recording. */
  time: number;
}

export interface RecordedClick {
  timestamp: number;
  x: number;
  y: number;
  type: string;
}

export interface FrameDetection {
  frameIndex: number;
  time: number;
  image: string;
  /** Elements in recording-space coordinates; empty when analysis failed. */
  elements: DetectedUIElement[];
  error?: string;
}

export interface DetectedStep {
  id: string;
  stepNumber: number;
  name: string;
  action: "click";
  x: number;
  y: number;
  delayMs: number;
  uiTargetName: string;
  confidence?: number;
  reasoning: string;
  screenshotUrl: string;
}

export type FrameStepResult =
  | { status: "detected"; steps: DetectedStep[]; elementsDetected: number; unanchoredClicks: number }
  | { status: "failed"; reason: string; elementsDetected: number };

/** The sample times that fit in a recording of `durationSec`. */
export function sampleTimesFor(durationSec: number): number[] {
  const times = FRAME_SAMPLE_TIMES.filter((t) => t < durationSec);
  return times.length ? times : [0.1];
}

function toRecordingSpace(el: DetectedUIElement): DetectedUIElement {
  const sx = RECORDING_SPACE.width / FRAME_SPACE.width;
  const sy = RECORDING_SPACE.height / FRAME_SPACE.height;
  const box = el.boundingBox;
  return {
    ...el,
    boundingBox: { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy },
    center: el.center ? { x: el.center.x * sx, y: el.center.y * sy } : el.center,
  };
}

async function detectOne(
  frame: RecordedFrame,
  frameIndex: number,
  post: GatePost,
  signal: AbortSignal,
): Promise<FrameDetection> {
  const base = { frameIndex, time: frame.time, image: frame.image };
  try {
    const data = await post("/api/ai/describe-screen", { imageData: frame.image }, { signal });
    const report: ScreenPerceptionReport | undefined = data.report;
    if (!report) return { ...base, elements: [], error: "Screen analysis returned no report" };
    return { ...base, elements: (report.elements ?? []).filter((e) => e.boundingBox).map(toRecordingSpace) };
  } catch (error) {
    return { ...base, elements: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** Run the vision model over every frame, in order. */
export async function detectFrameElements(
  frames: RecordedFrame[],
  options: { post?: GatePost; signal?: AbortSignal } = {},
): Promise<FrameDetection[]> {
  const post = options.post ?? postGateJson;
  const signal = options.signal ?? new AbortController().signal;
  const detections: FrameDetection[] = [];
  for (let i = 0; i < frames.length; i++) {
    detections.push(await detectOne(frames[i], i, post, signal));
  }
  return detections;
}

function nearestFrame(detections: FrameDetection[], time: number): FrameDetection {
  return detections.reduce((best, d) => (Math.abs(d.time - time) < Math.abs(best.time - time) ? d : best));
}

/** Recorded clicks anchored to the elements detected in their nearest analyzed frame. */
export function anchorClicksToElements(
  clicks: RecordedClick[],
  detections: FrameDetection[],
): { steps: DetectedStep[]; unanchored: number } {
  const analyzed = detections.filter((d) => !d.error);
  const steps: DetectedStep[] = [];
  let unanchored = 0;
  let previousTime = 0;
  for (const click of clicks) {
    const frame = analyzed.length ? nearestFrame(analyzed, click.timestamp) : undefined;
    const element = frame && findTargetElement({ elements: frame.elements } as ScreenPerceptionReport, click.x, click.y);
    if (!frame || !element) {
      unanchored++;
      continue;
    }
    const stepNumber = steps.length + 1;
    steps.push({
      id: `frame_step_${frame.frameIndex}_${stepNumber}`,
      stepNumber,
      name: `Click ${element.name}`,
      action: "click",
      x: click.x,
      y: click.y,
      delayMs: Math.max(0, Math.round((click.timestamp - previousTime) * 1000)),
      uiTargetName: element.name,
      confidence: typeof element.confidence === "number" ? element.confidence : undefined,
      reasoning: `Recorded click at ${click.timestamp.toFixed(1)}s lands on detected ${element.type || "element"} "${element.name}" in frame ${frame.frameIndex + 1}`,
      screenshotUrl: frame.image,
    });
    previousTime = click.timestamp;
  }
  return { steps, unanchored };
}

function failureReason(detections: FrameDetection[], clicks: number, elements: number, unanchored: number): string {
  if (detections.length === 0) return "No recorded frames to analyze";
  const errors = detections.filter((d) => d.error);
  if (errors.length === detections.length) return `Vision analysis failed on every frame: ${errors[0].error}`;
  if (clicks === 0) return `Vision model detected ${elements} elements but there are no recorded clicks to anchor actions to`;
  if (elements === 0) return "Vision model detected no clickable elements in the recorded frames";
  return `None of the ${unanchored} recorded clicks landed on a detected element`;
}

/** Detect real steps from frames and recorded clicks; fails with the reason when none can be anchored. */
export async function detectStepsFromFrames(
  frames: RecordedFrame[],
  events: RecordedClick[],
  options: { post?: GatePost; signal?: AbortSignal } = {},
): Promise<FrameStepResult> {
  const detections = await detectFrameElements(frames, options);
  const elementsDetected = detections.reduce((sum, d) => sum + d.elements.length, 0);
  const clicks = events.filter((e) => e.type === "click");
  const { steps, unanchored } = anchorClicksToElements(clicks, detections);
  if (steps.length > 0) return { status: "detected", steps, elementsDetected, unanchoredClicks: unanchored };
  return { status: "failed", reason: failureReason(detections, clicks.length, elementsDetected, unanchored), elementsDetected };
}
