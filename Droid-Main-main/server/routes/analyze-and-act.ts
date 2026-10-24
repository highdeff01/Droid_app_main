/**
 * Analyze & Act: sends the live captured frame, the previous steps and the
 * operator's instructions to the Qwen endpoint (with the session's conversation
 * history) and returns the model's summary, cross-reference and assembled
 * tasks. No frame is a 400; an unreachable endpoint or unreadable reply is a
 * 502. Nothing here is a template.
 */

import { RequestHandler } from "express";
import { buildVisionMessage, parseModelJson } from "../ai-endpoint";
import { aiConversations } from "../ai-conversation";

export const ANALYZE_AND_ACT_SESSION_ID = "analyze-and-act";

const SCREENSHOT_PATTERN = /^data:image\/(png|jpeg);base64,/;

export interface AssembledTask {
  id: string;
  stepNumber: number;
  name: string;
  action: string;
  targetPosition: { x: number; y: number };
  text?: string;
  confidence: number | null;
}

export interface AnalyzeAndActResponse {
  success: true;
  visualSummary: string;
  crossReferenceAnalysis: {
    previousActionSummary: string;
    currentScreenState: string;
    identifiedChanges: string[];
    recommendedAdjustments: string[];
  };
  autoAssembledTasks: AssembledTask[];
  endpoint?: string;
}

const SYSTEM_PROMPT = `You are the Analyze & Act vision engine of a desktop automation assistant.
You receive a screenshot of the operator's live screen, the steps already executed and the operator's instructions.
Describe ONLY what is actually visible. Propose next steps whose x/y are pixel centers of elements you can see.
Respond with STRICT JSON only:
{
  "visualSummary": "2 sentences about the visible screen",
  "crossReferenceAnalysis": {
    "previousActionSummary": "what the previous steps did",
    "currentScreenState": "what the screen shows now relative to those steps",
    "identifiedChanges": ["..."],
    "recommendedAdjustments": ["..."]
  },
  "autoAssembledTasks": [
    { "name": "Click Sign In", "action": "click", "x": 412, "y": 318, "text": "", "confidence": 0.8 }
  ]
}`;

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Keeps only tasks with numeric coordinates from the model. */
export function readAssembledTasks(value: unknown): AssembledTask[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t) => Number.isFinite(Number(t?.x)) && Number.isFinite(Number(t?.y)))
    .map((t, idx) => ({
      id: `task_${Date.now()}_${idx + 1}`,
      stepNumber: idx + 1,
      name: String(t.name || t.action || `Step ${idx + 1}`),
      action: String(t.action || "click"),
      targetPosition: { x: Number(t.x), y: Number(t.y) },
      ...(t.text ? { text: String(t.text) } : {}),
      confidence: typeof t.confidence === "number" ? Math.min(1, Math.max(0, t.confidence)) : null,
    }));
}

function buildPrompt(body: any): string {
  const previousTasks = Array.isArray(body.previousTasks) ? body.previousTasks : [];
  return `Operator instructions: ${body.userInstructions || "Analyze the screen and propose the next steps"}
Previous steps (${previousTasks.length}): ${JSON.stringify(previousTasks.slice(-5))}`;
}

export const handleAnalyzeAndAct: RequestHandler = async (req, res) => {
  const body = req.body ?? {};
  const frame = body.liveScreenUrl || body.screenStreamUrl;
  if (typeof frame !== "string" || !SCREENSHOT_PATTERN.test(frame)) {
    return res.status(400).json({
      success: false,
      error: "No live screen frame: start screen capture so the AI can see the screen",
    });
  }

  const reply = await aiConversations.send(
    String(body.sessionId || ANALYZE_AND_ACT_SESSION_ID),
    buildVisionMessage(buildPrompt(body), frame),
    { system: SYSTEM_PROMPT, endpoint: body.endpoint, model: body.model, format: "json" },
  );
  if (!reply.success) {
    return res.status(502).json({ success: false, error: `AI endpoint unreachable: ${reply.error || "no response"}` });
  }

  let parsed: any;
  try {
    parsed = parseModelJson(reply.content);
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: `AI model returned unreadable output: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const cross = parsed.crossReferenceAnalysis ?? {};
  const payload: AnalyzeAndActResponse = {
    success: true,
    visualSummary: String(parsed.visualSummary ?? ""),
    crossReferenceAnalysis: {
      previousActionSummary: String(cross.previousActionSummary ?? ""),
      currentScreenState: String(cross.currentScreenState ?? ""),
      identifiedChanges: toStringList(cross.identifiedChanges),
      recommendedAdjustments: toStringList(cross.recommendedAdjustments),
    },
    autoAssembledTasks: readAssembledTasks(parsed.autoAssembledTasks),
    endpoint: reply.endpoint,
  };
  res.json(payload);
};
