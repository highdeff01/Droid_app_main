import { centralLogHub } from "./log-hub";
import {
  sendQwenChatRequest,
  buildVisionMessage,
  toBase64Image,
  parseModelJson,
} from "./ai-endpoint";

export interface StepVerificationResult {
  verified: boolean;
  accuracyScore: number;
  status: "verified" | "missed" | "obstructed" | "completed_early";
  analysis: string;
  goalFinished: boolean;
  suggestedCorrection?: {
    action: string;
    x?: number;
    y?: number;
    reason: string;
  };
  /** True when this result is a heuristic placeholder, not model analysis. */
  simulated?: boolean;
  simulationReason?: string;
}

export interface StuckResolutionResult {
  isStuck: boolean;
  reason: string;
  obstacleType: "modal_popup" | "loading_spinner" | "target_shifted" | "unresponsive" | "none";
  recommendedActions: Array<{
    action: string;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    delayMs?: number;
    reason: string;
  }>;
  aiExplanation: string;
  /** True when this result is a heuristic placeholder, not model analysis. */
  simulated?: boolean;
  simulationReason?: string;
}

export interface CheckupEvaluationResult {
  isFinished: boolean;
  nothingLeftToDo: boolean;
  timeExceeded: boolean;
  summary: string;
  recommendedNextAction?: {
    action: string;
    x?: number;
    y?: number;
    text?: string;
    explanation: string;
  };
  /** True when this result is a heuristic placeholder, not model analysis. */
  simulated?: boolean;
  simulationReason?: string;
}

export interface DetectedElement {
  id: string;
  name: string;
  type: "button" | "input" | "icon" | "scroll_area" | "tab" | "link" | "toggle" | "dropdown";
  x: number;
  y: number;
  width?: number;
  height?: number;
  suggestedAction: "click" | "double_click" | "clear_and_type" | "type_text" | "scroll";
  suggestedTextPayload?: string;
  confidence: number;
  description: string;
}

export interface ScreenAnalysisAndStepsResult {
  elements: DetectedElement[];
  suggestedSteps: Array<{
    id: string;
    stepNumber: number;
    name: string;
    action: string;
    x: number;
    y: number;
    text?: string;
    delayMs: number;
    description: string;
  }>;
  summary: string;
  primaryActionTarget?: { x: number; y: number; label: string };
  /** True when this result is a heuristic placeholder, not model analysis. */
  simulated?: boolean;
  simulationReason?: string;
}

export interface ScreenMatchResult {
  matched: boolean;
  similarityScore: number;
  reason: string;
  identifiedElements: string[];
  suggestedNextStep?: {
    action: string;
    x: number;
    y: number;
    text?: string;
    name: string;
  };
  /** True when this result is a heuristic placeholder, not model analysis. */
  simulated?: boolean;
  simulationReason?: string;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Marks a result as a heuristic placeholder so the UI can label it, never as real analysis. */
export function simulatedMarker(reason: string): { simulated: true; simulationReason: string } {
  return { simulated: true, simulationReason: reason };
}

/** Screen match that could not be evaluated: never claims a match or a score. */
function unverifiedScreenMatch(reason: string): ScreenMatchResult {
  return {
    matched: false,
    similarityScore: 0,
    reason: `Not compared: ${reason}`,
    identifiedElements: [],
    ...simulatedMarker(reason),
  };
}

/** Visual diff that could not be evaluated: asks for intervention instead of proceeding. */
function unverifiedVisualDiff(targetCoords: { x: number; y: number }, reason: string): VisualDiffAndDriftResult {
  return {
    similarityScore: 0,
    driftDetected: false,
    driftVector: { deltaX: 0, deltaY: 0 },
    originalCoordinates: targetCoords,
    autoPositionedCoordinates: targetCoords,
    differences: [],
    aiInterventionRequired: true,
    interventionReason: `Not evaluated: ${reason}`,
    recommendedAction: "stalled_abort",
    ...simulatedMarker(reason),
  };
}

/**
 * Runs a vision+JSON prompt through the Qwen vision-language model
 * (quantumclaw by default) and returns the parsed JSON reply.
 */
export async function generateVisionJson(
  prompt: string,
  images: string[],
): Promise<any> {
  const message =
    images.length === 1
      ? buildVisionMessage(prompt, images[0])
      : { role: "user" as const, content: prompt, images: images.map(toBase64Image) };

  const result = await sendQwenChatRequest([message], { format: "json" });
  if (!result.success) {
    throw new Error(result.error);
  }
  return parseModelJson(result.content);
}

/**
 * 1. AI Check After Every Action:
 * Evaluates whether the action succeeded visually, if target was hit, or if goal finished early.
 */
export async function verifyStepAccuracy(params: {
  imageData: string;
  step: {
    id: string;
    name: string;
    action: string;
    x: number;
    y: number;
    text?: string;
  };
  userObjective?: string;
}): Promise<StepVerificationResult> {
  const { imageData, step, userObjective = "Automate user task on screen" } = params;

  if (!imageData) {
    return {
      verified: false,
      accuracyScore: 0,
      status: "missed",
      analysis: "Not verified: no screenshot was captured, so no AI verification ran.",
      goalFinished: false,
      ...simulatedMarker("No screenshot supplied; step was not visually verified."),
    };
  }

  try {
    const prompt = `You are a precision AI Quality Inspector for GUI and desktop computer automation.
An action was just physically executed:
- Action Type: ${step.action}
- Target Coordinates: (${step.x}, ${step.y})
- Step Name: "${step.name}"
${step.text ? `- Text Payload: "${step.text}"` : ""}
- Overall Task Objective: "${userObjective}"

Examine the screenshot of the current screen post-action.
Determine:
1. Did this action hit accurately and produce expected visual response?
2. Did a blocking popup, error, or modal appear?
3. Is the overall task goal ALREADY COMPLETELY SATISFIED on screen right now (so subsequent actions can be skipped)?
4. If the target shifted or missed, provide corrected (x, y) coordinates.

Return a STRICT JSON response only (no markdown, no backticks, just valid JSON):
{
  "verified": true,
  "accuracyScore": 0.95,
  "status": "verified",
  "goalFinished": false,
  "analysis": "Action clicked successfully on target and page transitioned.",
  "suggestedCorrection": null
}

"status" must be one of: "verified", "missed", "obstructed", "completed_early".
"goalFinished": set true if the overall task goal is visibly 100% finished on screen.`;

    const parsed = await generateVisionJson(prompt, [imageData]);

    centralLogHub.addLog(
      "AI-Verifier",
      parsed.verified ? "SUCCESS" : "WARN",
      `Verified Step "${step.name}": ${parsed.status} (score: ${parsed.accuracyScore}) - ${parsed.analysis}`,
      { stepId: step.id, status: parsed.status, goalFinished: parsed.goalFinished }
    );

    return {
      verified: Boolean(parsed.verified),
      accuracyScore: Number(parsed.accuracyScore) || 0,
      status: parsed.status || (parsed.verified ? "verified" : "missed"),
      analysis: parsed.analysis || "Verification completed.",
      goalFinished: Boolean(parsed.goalFinished),
      suggestedCorrection: parsed.suggestedCorrection || undefined,
      simulated: false,
    };
  } catch (err) {
    centralLogHub.addLog("AI-Verifier", "WARN", `AI Verification fallback: ${errorText(err)}`);
    return {
      verified: false,
      accuracyScore: 0,
      status: "missed",
      analysis: `Not verified: AI model unavailable (${errorText(err)}).`,
      goalFinished: false,
      ...simulatedMarker(`AI model unavailable: ${errorText(err)}`),
    };
  }
}

/**
 * 2. AI Thinking When Stuck or Taking Too Long:
 * Reason through obstacles, modals, lag, or off-target elements and devise an immediate fix.
 */
export async function resolveStuckState(params: {
  imageData: string;
  currentStep?: any;
  userObjective?: string;
  elapsedSeconds?: number;
  targetSeconds?: number;
  lastError?: string;
}): Promise<StuckResolutionResult> {
  const {
    imageData,
    currentStep,
    userObjective = "Complete task workflow",
    elapsedSeconds = 0,
    targetSeconds = 30,
    lastError = "Task took longer than anticipated or element unresponsive",
  } = params;

  if (!imageData) {
    return {
      ...simulatedMarker("No screenshot supplied; recovery actions are a generic heuristic."),
      isStuck: true,
      reason: "Execution time limit or element timeout reached.",
      obstacleType: "unresponsive",
      // No capture means no visual evidence: never recommend a positional action blindly.
      recommendedActions: [
        { action: "wait", delayMs: 1000, reason: "Allow UI to stabilize" },
      ],
      aiExplanation: "No screen capture available; only a non-positional wait is recommended until a fresh capture can be analyzed.",
    };
  }

  try {
    const prompt = `You are an autonomous cognitive automation troubleshooter.
The user's automation workflow is STUCK or took too long:
- User Objective: "${userObjective}"
- Time Elapsed: ${elapsedSeconds}s (Target was: ${targetSeconds}s)
- Current Stalled Step: ${JSON.stringify(currentStep || {})}
- Error / Issue: "${lastError}"

Inspect the live screen:
1. Identify why it is stuck: modal dialog blocking? loading spinner? captcha? shifted button? unfocused window?
2. Devise 1 to 3 precise corrective physical actions (e.g. click 'X' to close popup at coords (x,y), press 'escape', re-click button at shifted location, or wait for loading).

Return a STRICT JSON response only:
{
  "isStuck": true,
  "reason": "A confirmation popup is blocking the main window at (1100, 320).",
  "obstacleType": "modal_popup",
  "recommendedActions": [
    { "action": "click", "x": 1100, "y": 320, "reason": "Dismiss blocking dialog" },
    { "action": "wait", "delayMs": 500, "reason": "Wait for dialog fade" }
  ],
  "aiExplanation": "Detected dialog overlay preventing button click. Plan is to dismiss and resume."
}

"obstacleType" must be one of: "modal_popup", "loading_spinner", "target_shifted", "unresponsive", "none".`;

    const parsed = await generateVisionJson(prompt, [imageData]);

    centralLogHub.addLog(
      "AI-StuckResolver",
      "INFO",
      `AI Stuck Thinking: ${parsed.reason} -> Recommended ${parsed.recommendedActions?.length || 0} corrective action(s)`
    );

    return {
      isStuck: Boolean(parsed.isStuck),
      reason: parsed.reason || "Stuck condition detected",
      obstacleType: parsed.obstacleType || "unresponsive",
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
      aiExplanation: parsed.aiExplanation || "Corrective actions planned.",
      simulated: false,
    };
  } catch (err) {
    centralLogHub.addLog("AI-StuckResolver", "ERROR", `Stuck resolution error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      isStuck: true,
      reason: `Automated recovery: ${err instanceof Error ? err.message : String(err)}`,
      obstacleType: "unresponsive",
      recommendedActions: [
        { action: "wait", delayMs: 1000, reason: "Allow UI to stabilize" },
      ],
      aiExplanation: `AI model unavailable (${errorText(err)}); only a non-positional wait is recommended.`,
      ...simulatedMarker(`AI model unavailable: ${errorText(err)}`),
    };
  }
}

/**
 * 3. Scheduling & Checkup Evaluator:
 * In case time passed too much and there's nothing left, inspect if goal is achieved or finalize.
 */
export async function evaluateCheckupAndCompletion(params: {
  imageData: string;
  userObjective: string;
  elapsedSeconds: number;
  maxSeconds?: number;
  remainingStepCount?: number;
}): Promise<CheckupEvaluationResult> {
  const {
    imageData,
    userObjective,
    elapsedSeconds,
    maxSeconds = 60,
    remainingStepCount = 0,
  } = params;

  const timeExceeded = elapsedSeconds >= maxSeconds;

  if (!imageData) {
    return {
      isFinished: remainingStepCount === 0 || timeExceeded,
      nothingLeftToDo: remainingStepCount === 0,
      timeExceeded,
      summary: `Checkup at ${elapsedSeconds}s from step counts only (no screenshot). Remaining steps: ${remainingStepCount}.`,
      ...simulatedMarker("No screenshot supplied; completion inferred from step counts, not AI analysis."),
    };
  }

  try {
    const prompt = `You are a Scheduled Checkup & Watchdog AI for desktop workflow automation.
Scheduled checkup trigger:
- User Objective: "${userObjective}"
- Elapsed Time: ${elapsedSeconds}s (Threshold: ${maxSeconds}s)
- Remaining Registered Steps: ${remainingStepCount}

Inspect the live screen:
1. Has the intended goal ALREADY BEEN ACHIEVED (e.g. download finished, confirmation banner visible, form submitted, success checkmark visible)?
2. Is there TRULY NOTHING LEFT TO DO, meaning executing more clicks would be redundant or destructive?
3. If not finished and time has elapsed, what is the single best final action to finish completion?

Return a STRICT JSON response only:
{
  "isFinished": true,
  "nothingLeftToDo": true,
  "timeExceeded": ${timeExceeded},
  "summary": "The objective is already satisfied on screen. No further actions needed.",
  "recommendedNextAction": null
}`;

    const parsed = await generateVisionJson(prompt, [imageData]);

    centralLogHub.addLog(
      "AI-Checkup",
      parsed.isFinished ? "SUCCESS" : "INFO",
      `Scheduled Checkup (${elapsedSeconds}s): ${parsed.summary} (Finished: ${parsed.isFinished})`
    );

    return {
      isFinished: Boolean(parsed.isFinished),
      nothingLeftToDo: Boolean(parsed.nothingLeftToDo),
      timeExceeded,
      summary: parsed.summary || "Checkup evaluation finished.",
      recommendedNextAction: parsed.recommendedNextAction || undefined,
      simulated: false,
    };
  } catch (err) {
    return {
      isFinished: remainingStepCount === 0 || timeExceeded,
      nothingLeftToDo: remainingStepCount === 0,
      timeExceeded,
      summary: `Checkup from step counts only; AI model unavailable (${errorText(err)}).`,
      ...simulatedMarker(`AI model unavailable: ${errorText(err)}`),
    };
  }
}

export async function detectScreenElementsAndSteps(params: {
  imageData: string;
  screenWidth?: number;
  screenHeight?: number;
  objective?: string;
}): Promise<ScreenAnalysisAndStepsResult> {
  const { imageData, screenWidth = 1920, screenHeight = 1080, objective = "Detect interactive elements and auto-generate sequence steps" } = params;

  if (!imageData) {
    throw new Error("No screen frame supplied; capture the live screen before detecting elements.");
  }

  try {
    const prompt = `You are a High-Precision Computer Vision & Desktop Automation AI.
Inspect this screen capture image carefully (${screenWidth}x${screenHeight} native viewport).
Objective: "${objective}"

Analyze all key visible interactive UI elements:
1. "button" -> Action: "click". Look for submit, save, confirm, next, close, run buttons.
2. "input" -> Action: "clear_and_type" or "type_text". Look for search bars, text boxes, username/password fields. Suggest an appropriate sample text payload.
3. "tab" or "link" -> Action: "click". Look for tab headers, breadcrumb links, hyperlinked menus.
4. "scroll_area" -> Action: "scroll". Look for long scrollable data tables, feeds, message logs.
5. "toggle" -> Action: "click". Look for check boxes, switches.
6. "icon" -> Action: "click". Look for tool icons (pencil, trash, settings, search magnifying glass).

Calculate the exact pixel center coordinates (X: 0-${screenWidth}, Y: 0-${screenHeight}) for each element.

Return a STRICT JSON response ONLY without markdown:
{
  "summary": "Short 1-2 sentence description of what this screen contains",
  "elements": [
    {
      "id": "elem_1",
      "name": "Concise label (e.g. 'Submit Button', 'Search Bar')",
      "type": "button",
      "x": 960,
      "y": 620,
      "width": 120,
      "height": 40,
      "suggestedAction": "click",
      "suggestedTextPayload": "",
      "confidence": 0.95,
      "description": "Short explanation of purpose"
    }
  ],
  "suggestedSteps": [
    {
      "id": "step_1",
      "stepNumber": 1,
      "name": "Step label",
      "action": "click",
      "x": 960,
      "y": 620,
      "text": "",
      "delayMs": 500,
      "description": "What this step achieves"
    }
  ],
  "primaryActionTarget": { "x": 960, "y": 620, "label": "Main Target" }
}`;

    const parsed = await generateVisionJson(prompt, [imageData]);

    centralLogHub.addLog(
      "Screen-Detection",
      "SUCCESS",
      `AI detected ${(parsed.elements || []).length} UI elements and ${(parsed.suggestedSteps || []).length} steps from canvas`
    );

    return {
      elements: parsed.elements || [],
      suggestedSteps: parsed.suggestedSteps || [],
      summary: parsed.summary || "Screen detection completed.",
      primaryActionTarget: parsed.primaryActionTarget || undefined,
      simulated: false,
    };
  } catch (err) {
    centralLogHub.addLog(
      "Screen-Detection",
      "WARN",
      `Screen detection failed: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

export async function compareScreensForMatch(params: {
  currentScreen: string;
  expectedScreen: string;
  expectedStepLabel?: string;
  threshold?: number;
}): Promise<ScreenMatchResult> {
  const { currentScreen, expectedScreen, expectedStepLabel = "Next automation step", threshold = 0.75 } = params;

  if (!currentScreen || !expectedScreen) {
    // If either image is missing or AI is unavailable, use heuristic comparison
    return unverifiedScreenMatch("Both screenshots are required; no comparison ran.");
  }

  try {

    const prompt = `You are an Autonomous Desktop Actor & Screen State Verifier.
Compare Image 1 (Current Live Screen) with Image 2 (Expected / Reference Screen for: "${expectedStepLabel}").

Determine:
1. Does the current screen visually match the required state to execute "${expectedStepLabel}"?
2. Has the target page or modal loaded so the user's expected action is ready to execute?
3. Calculate a similarityScore between 0.0 and 1.0 (where >= ${threshold} is considered a confirmed match).
4. Identify which landmark elements confirm the match.
5. If matched, specify the target X, Y coordinates and recommended action for "${expectedStepLabel}".

Return a STRICT JSON response ONLY:
{
  "matched": true,
  "similarityScore": 0.92,
  "reason": "The screen successfully loaded the expected form layout and the primary action button is clearly visible.",
  "identifiedElements": ["Form Title", "Input Box", "Submit Button"],
  "suggestedNextStep": {
    "action": "click",
    "x": 960,
    "y": 640,
    "name": "Auto-Execute ${expectedStepLabel}"
  }
}`;

    const parsed = await generateVisionJson(
      `Image 1 is the current live screen; image 2 is the expected target screen.\n${prompt}`,
      [currentScreen, expectedScreen],
    );

    const matched = Boolean(parsed.matched && (parsed.similarityScore ?? 0) >= threshold);

    centralLogHub.addLog(
      "AI-AutoActor",
      matched ? "SUCCESS" : "INFO",
      `Screen Match Evaluation: ${matched ? "MATCHED" : "UNMATCHED"} (${((parsed.similarityScore || 0) * 100).toFixed(1)}%). Reason: ${parsed.reason}`
    );

    return {
      matched,
      similarityScore: Number(parsed.similarityScore) || 0,
      reason: parsed.reason || "Screen match evaluated.",
      identifiedElements: parsed.identifiedElements || [],
      suggestedNextStep: parsed.suggestedNextStep || undefined,
      simulated: false,
    };
  } catch (err) {
    centralLogHub.addLog(
      "AI-AutoActor",
      "WARN",
      `Screen match fallback evaluation: ${err instanceof Error ? err.message : String(err)}`
    );

    return unverifiedScreenMatch(`AI model unavailable: ${errorText(err)}`);
  }
}

export interface VisualDiffAndDriftResult {
  similarityScore: number;
  driftDetected: boolean;
  driftVector: { deltaX: number; deltaY: number };
  originalCoordinates: { x: number; y: number };
  autoPositionedCoordinates: { x: number; y: number };
  differences: Array<{
    description: string;
    area: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
  aiInterventionRequired: boolean;
  interventionReason?: string;
  recommendedAction: "proceed" | "reposition_and_retry" | "create_new_step" | "stalled_abort";
  suggestedNewStep?: {
    name: string;
    action: string;
    x: number;
    y: number;
    text?: string;
  };
  /** True when this result is a heuristic placeholder, not model analysis. */
  simulated?: boolean;
  simulationReason?: string;
}

/**
 * Visual Error Detection & Difference Mapping with Auto-Positioning:
 * Cross-references post-operation response images against target keyframes.
 * Detects visual drift, calculates displacement vector (deltaX, deltaY),
 * applies auto-positioning, and determines if AI should intervene or create a new step.
 */
export async function detectVisualErrorsAndDifferenceMapping(params: {
  expectedImage: string;
  responseImage: string;
  stepName?: string;
  stepAction?: string;
  targetCoords?: { x: number; y: number };
  autoRepositionEnabled?: boolean;
}): Promise<VisualDiffAndDriftResult> {
  const {
    expectedImage,
    responseImage,
    stepName = "Keyframe Execution",
    stepAction = "click",
    targetCoords = { x: 960, y: 540 },
    autoRepositionEnabled = true,
  } = params;


  if (!expectedImage || !responseImage) {
    return unverifiedVisualDiff(targetCoords, "Both images are required; no visual diff ran.");
  }

  try {

    const prompt = `You are an Autonomous Visual Error Detection & Difference Mapping Engine.
Compare Image 1 (Target Reference Keyframe) with Image 2 (Post-Action Response Image captured after AI executed: "${stepName}", action: "${stepAction}" at coordinates X=${targetCoords.x}, Y=${targetCoords.y}).

Perform the following:
1. Difference Mapping: Detect visual changes between Image 1 and Image 2. Did the screen change as expected from the action, or is it stalled or showing an error/modal?
2. Visual Error Detection: Check if an error banner, modal obstacle, dropdown failure, or displaced UI occurred.
3. Drift Detection: Check if UI elements shifted/drifted (due to scroll, layout reflow, or window resize). Calculate the pixel drift vector { deltaX: number, deltaY: number } (in standard 1920x1080 screen space).
4. Auto-Positioning: If drift is detected, compute the new adjusted target coordinates { x: ${targetCoords.x} + deltaX, y: ${targetCoords.y} + deltaY }.
5. Cross-Reference & Intervention:
   - Should AI intervene? (true if stalled, error detected, or drift exceeds tolerance).
   - Recommended action: "proceed" (if next step ready), "reposition_and_retry", "create_new_step" (if a new intermediate step is needed like closing a popup or clicking shifted element), or "stalled_abort".
   - If "create_new_step", supply the exact step parameters (name, action, x, y, text).

Return a STRICT JSON response ONLY:
{
  "similarityScore": 0.85,
  "driftDetected": false,
  "driftVector": { "deltaX": 0, "deltaY": 0 },
  "differences": [
    { "description": "Form submitted successfully", "area": "Center canvas", "severity": "low" }
  ],
  "aiInterventionRequired": false,
  "interventionReason": "Action caused desired state transition.",
  "recommendedAction": "proceed",
  "suggestedNewStep": null
}`;

    const parsed = await generateVisionJson(prompt, [expectedImage, responseImage]);

    const driftX = Number(parsed.driftVector?.deltaX) || 0;
    const driftY = Number(parsed.driftVector?.deltaY) || 0;
    const driftDetected = Boolean(parsed.driftDetected || Math.abs(driftX) > 5 || Math.abs(driftY) > 5);

    const adjustedCoords = autoRepositionEnabled && driftDetected
      ? {
          x: Math.max(0, Math.min(1920, targetCoords.x + driftX)),
          y: Math.max(0, Math.min(1080, targetCoords.y + driftY)),
        }
      : targetCoords;

    centralLogHub.addLog(
      "AI-VisualDiff",
      driftDetected ? "WARN" : "SUCCESS",
      `Visual Error & Diff Mapping for "${stepName}": Drift=${driftDetected ? `Δ(${driftX}, ${driftY})` : "None"}, Intervention=${parsed.aiInterventionRequired ? "YES" : "NO"}`
    );

    return {
      similarityScore: typeof parsed.similarityScore === "number" ? parsed.similarityScore : 0,
      driftDetected,
      driftVector: { deltaX: driftX, deltaY: driftY },
      originalCoordinates: targetCoords,
      autoPositionedCoordinates: adjustedCoords,
      differences: Array.isArray(parsed.differences) ? parsed.differences : [],
      aiInterventionRequired: Boolean(parsed.aiInterventionRequired),
      interventionReason: parsed.interventionReason || undefined,
      recommendedAction: parsed.recommendedAction || (driftDetected ? "reposition_and_retry" : "proceed"),
      suggestedNewStep: parsed.suggestedNewStep || undefined,
      simulated: false,
    };
  } catch (err) {
    centralLogHub.addLog(
      "AI-VisualDiff",
      "WARN",
      `Visual diff fallback: ${err instanceof Error ? err.message : String(err)}`
    );

    return unverifiedVisualDiff(targetCoords, `AI model unavailable: ${errorText(err)}`);
  }
}

export interface FileSummaryResult {
  summary: string;
  wordCount: number;
  sentenceCount: number;
  source: "qwen" | "heuristic";
}

/**
 * Generates a 1-sentence, under-10-word summary of a file's content based on its name or type.
 */
export async function generateFileSummary(params: {
  fileName: string;
  mimeType?: string;
  size?: number;
  modifiedTime?: string;
}): Promise<FileSummaryResult> {
  const { fileName = "", mimeType = "", size } = params;
  const nameClean = fileName.trim() || "Untitled";

  // Helper to ensure text meets strict constraint: 1 sentence, < 10 words (max 9 words)
  const sanitizeSummary = (raw: string, fallbackSource: "qwen" | "heuristic"): FileSummaryResult => {
    let text = raw
      .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
      .replace(/^(summary|description|file summary|file description):\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

    // Take only the first sentence if multiple
    const firstSentenceMatch = text.match(/^([^.!?]+[.!?]?)/);
    if (firstSentenceMatch) {
      text = firstSentenceMatch[1].trim();
    }

    // Split words
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 10) {
      // Keep up to 8 words and append period
      const sliced = words.slice(0, 8).join(" ");
      text = sliced.replace(/[.,!?;:]*$/, "") + ".";
    } else if (!/[.!?]$/.test(text)) {
      text = text + ".";
    }

    const finalWords = text.replace(/[.!?]/g, "").split(/\s+/).filter(Boolean);

    return {
      summary: text,
      wordCount: finalWords.length,
      sentenceCount: 1,
      source: fallbackSource,
    };
  };


  try {
    const prompt = `You are an AI assistant that writes ultra-concise file descriptions.
Based on the file name and/or MIME type / metadata provided, generate a 1-sentence summary of the likely contents or purpose of this file:
- File Name: "${nameClean}"
- MIME Type: "${mimeType || "unknown"}"
${size !== undefined ? `- File Size: ${size} bytes` : ""}

CRITICAL STRICT CONSTRAINTS:
1. The response MUST be exactly ONE complete sentence.
2. The response MUST be strictly UNDER 10 WORDS total (between 4 and 9 words maximum).
3. Do NOT include quotation marks, formatting, prefixes like "Summary:", or bullet points.
4. Output ONLY the single sentence.`;

    const response = await sendQwenChatRequest([{ role: "user", content: prompt }]);
    if (!response.success) throw new Error(response.error || "AI model unavailable");

    const outputText = response.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (outputText) {
      const result = sanitizeSummary(outputText, "qwen");
      centralLogHub.addLog(
        "AI-FileSummary",
        "SUCCESS",
        `Generated summary for "${nameClean}": "${result.summary}" (${result.wordCount} words)`,
        { fileName: nameClean, wordCount: result.wordCount }
      );
      return result;
    }
  } catch (err) {
    centralLogHub.addLog(
      "AI-FileSummary",
      "WARN",
      `File summary model fallback: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Heuristic rule-based summary fallback (guaranteed 1 sentence, strictly < 10 words)
  const lowerName = nameClean.toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();

  let heuristicText = "";
  if (lowerMime.includes("folder") || !lowerName.includes(".")) {
    heuristicText = "Folder containing organized project documents.";
  } else if (lowerMime.includes("image") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(lowerName)) {
    heuristicText = "Visual image asset for graphic presentations.";
  } else if (lowerMime.includes("spreadsheet") || lowerMime.includes("sheet") || /\.(xlsx?|csv|tsv)$/i.test(lowerName)) {
    heuristicText = "Data spreadsheet tracking structured table records.";
  } else if (lowerMime.includes("presentation") || lowerMime.includes("slides") || /\.(pptx?|key)$/i.test(lowerName)) {
    heuristicText = "Slide presentation deck with overview topics.";
  } else if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) {
    heuristicText = "Formatted PDF document with structured reference text.";
  } else if (lowerMime.includes("document") || lowerMime.includes("word") || /\.(docx?|odt|rtf|txt|md)$/i.test(lowerName)) {
    heuristicText = "Text document containing notes and guidelines.";
  } else if (lowerMime.includes("video") || /\.(mp4|mov|avi|mkv|webm)$/i.test(lowerName)) {
    heuristicText = "Media video recording of playback content.";
  } else if (lowerMime.includes("audio") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(lowerName)) {
    heuristicText = "Recorded audio track with voice content.";
  } else if (lowerMime.includes("json") || /\.(json|ya?ml|toml)$/i.test(lowerName)) {
    heuristicText = "Structured configuration data for application settings.";
  } else if (/\.(tsx?|jsx?|py|sh|html|css|sql|rs|go|c|cpp)$/i.test(lowerName)) {
    heuristicText = "Source code module implementing application logic.";
  } else if (/\.(zip|tar|gz|rar|7z)$/i.test(lowerName)) {
    heuristicText = "Compressed archive packaging bundled resource files.";
  } else {
    heuristicText = "File asset storing user data records.";
  }

  return sanitizeSummary(heuristicText, "heuristic");
}
