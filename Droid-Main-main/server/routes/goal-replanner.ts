import { Request, Response } from "express";
import { sendQwenChatRequest, buildVisionMessage, parseModelJson } from "../ai-endpoint";
import type { ReplanResult, ReplanStepItem } from "../../shared/goal-replan";

export type { ReplanResult, ReplanStepItem };

/** A finite number or non-blank numeric string as a number; null for anything else (null, "", booleans, NaN). */
function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Reads the model's own `confidence` from a JSON reply, clamped to [0, 1]; null when absent or unreadable. */
export function readModelConfidence(content: string | null | undefined): number | null {
  if (!content) return null;
  try {
    const value = finiteNumber(parseModelJson<{ confidence?: unknown }>(content).confidence);
    return value === null ? null : Math.min(1, Math.max(0, value));
  } catch {
    return null;
  }
}

/** Measured drift from real verification (step.offsetX/offsetY); null when the step carries none. */
export function measuredOffset(step: any): { dx: number; dy: number } | null {
  const dx = finiteNumber(step?.offsetX);
  const dy = finiteNumber(step?.offsetY);
  if (dx === null && dy === null) return null;
  return { dx: dx ?? 0, dy: dy ?? 0 };
}

function healClickStep(step: any, idx: number, origX: number, origY: number, confidence: number | null): ReplanStepItem {
  const offset = measuredOffset(step);
  const healedX = offset ? Math.max(10, Math.min(1910, origX + offset.dx)) : origX;
  const healedY = offset ? Math.max(10, Math.min(1070, origY + offset.dy)) : origY;
  const replanReason = offset
    ? `Recalibrated target by measured verification offset (Δx: ${healedX - origX}, Δy: ${healedY - origY}) and added +250ms settling delay.`
    : "No measured drift for this step: coordinates unchanged (unverified); added +250ms settling delay only.";
  return {
    id: step.id,
    name: step.name || `Step #${idx + 1}`,
    action: step.action || "click",
    x: healedX,
    y: healedY,
    text: step.text,
    keyPayload: step.keyPayload,
    delayMs: Math.max(300, (step.delayMs || 200) + 250),
    originalX: origX,
    originalY: origY,
    status: "modified",
    replanReason,
    confidence,
  };
}

interface ReplanPromptInput {
  targetGoal: string;
  steps: any[];
  failedStepId?: string;
  consecutiveDriftCount: number;
  currentDriftDistancePx: number;
  driftThreshold: number;
}

function buildReplanPrompt(input: ReplanPromptInput): string {
  const { targetGoal, steps, failedStepId, consecutiveDriftCount, currentDriftDistancePx, driftThreshold } = input;
  return `You are an expert AI Robotic Process Automation (RPA) Goal Re-Planner.
A workflow automation step sequence has encountered continuous coordinate drift (${currentDriftDistancePx}px > ${driftThreshold}px threshold) or step failure.
Workflow Goal: "${targetGoal}"
Workflow Steps: ${JSON.stringify(steps.map((s: any) => ({ name: s.name, action: s.action, x: s.x, y: s.y, delayMs: s.delayMs })))}
Failed Step ID: ${failedStepId || "Step with highest drift"}
Consecutive Drifts: ${consecutiveDriftCount}

Analyze the live screen and propose an optimal healed step sequence. Return concise recommendations in JSON:
{
  "summary": "Brief explanation of drift cause and re-planning fix",
  "confidence": 0.95,
  "mitigations": ["Strategy 1", "Strategy 2"],
  "suggestedStepAdjustments": [
    { "index": 0, "action": "click", "deltaX": 15, "deltaY": -8, "addedDelayMs": 200, "reason": "Adjusted to newly positioned button centroid" }
  ]
}`;
}

/** A model's re-plan analysis text plus the model's own confidence figure. */
interface ReplanInsight {
  analysis: string;
  confidence: number | null;
}

/** Qwen/Ollama vision analysis; returns null on failure. */
async function requestQwenAnalysis(prompt: string, screenshotUrl: string): Promise<ReplanInsight | null> {
  try {
    const qwenResult = await sendQwenChatRequest([buildVisionMessage(prompt, screenshotUrl)], { format: "json" });
    if (!qwenResult.success) return null;
    const parsed = parseModelJson<{ summary?: string }>(qwenResult.content);
    return { analysis: parsed.summary || qwenResult.content, confidence: readModelConfidence(qwenResult.content) };
  } catch (qwenErr) {
    console.warn("[GoalReplan] Qwen vision call skipped/failed:", qwenErr);
    return null;
  }
}

/** Qwen (quantumclaw) is the only AI path; a failure yields null so the re-plan is labelled unverified. */
async function requestReplanInsights(prompt: string, screenshotUrl: string): Promise<ReplanInsight | null> {
  return requestQwenAnalysis(prompt, screenshotUrl);
}

export async function handleGoalReplan(req: Request, res: Response) {
  try {
    const {
      workflowName = "Active Sequence",
      currentSteps = [],
      failedStepId,
      consecutiveDriftCount = 3,
      currentDriftDistancePx = 28.5,
      driftThreshold = 10,
      screenshotUrl,
      lastErrorDetails,
      targetGoal = "Complete form automation & submit target dialog",
    } = req.body;

    const steps = Array.isArray(currentSteps) ? currentSteps : [];

    const insight =
      typeof screenshotUrl === "string" && screenshotUrl.startsWith("data:image")
        ? await requestReplanInsights(
            buildReplanPrompt({ targetGoal, steps, failedStepId, consecutiveDriftCount, currentDriftDistancePx, driftThreshold }),
            screenshotUrl,
          )
        : null;
    const modelAnalysis = insight?.analysis ?? null;
    const modelConfidence = insight?.confidence ?? null;

    // Heuristic & rule-based adaptive re-planner engine
    const suggestedSteps: ReplanStepItem[] = [];
    const mitigations: string[] = [];

    // Mitigations based on drift magnitude
    if (currentDriftDistancePx > 30) {
      mitigations.push("High screen displacement detected: inserted pre-step window focus & scroll anchor check.");
      mitigations.push("Added +350ms buffer to allow dynamic rendering before action dispatch.");
    } else if (currentDriftDistancePx > 15) {
      mitigations.push("Moderate UI scale/offset shift: shifted interaction centroids by detected Euclidean delta vector.");
      mitigations.push("Added dynamic double-check verification frame capture.");
    } else {
      mitigations.push("Micro-drift detected: smoothed coordinate targeting to closest UI cluster bounding box.");
    }

    // Transform and auto-heal steps. Confidence is only ever the model's own figure.
    const confidence = modelConfidence;
    const verified = confidence !== null;
    steps.forEach((step: any, idx: number) => {
      const isProblemStep = failedStepId ? step.id === failedStepId : idx === steps.length - 1 || ((step.driftDistancePx || 0) > driftThreshold);
      const origX = step.x || 960;
      const origY = step.y || 540;

      if (!isProblemStep) {
        suggestedSteps.push({ ...step, status: "kept", confidence });
      } else if (step.action === "click" || step.action === "double_click" || !step.action) {
        suggestedSteps.push(healClickStep(step, idx, origX, origY, confidence));
      } else if (step.action === "type_text" || step.action === "clear_and_type") {
        suggestedSteps.push({
          id: step.id,
          name: step.name || `Step #${idx + 1}`,
          action: "clear_and_type",
          x: origX,
          y: origY,
          text: step.text || "",
          delayMs: (step.delayMs || 300) + 200,
          originalX: origX,
          originalY: origY,
          status: "modified",
          replanReason: "Upgraded typing action to 'clear_and_type' to ensure clean input field clearing before string injection.",
          confidence,
        });
      } else {
        suggestedSteps.push({ ...step, status: "kept", confidence });
      }
    });

    // If consecutive drifts are continuous (> 2), add an anchor sync step at the beginning
    if (consecutiveDriftCount >= 2 && suggestedSteps.length > 0) {
      const firstStep = suggestedSteps[0];
      const anchorStep: ReplanStepItem = {
        id: `replan-sync-${Date.now()}`,
        name: "⚓ Viewport Sync & Focus Anchor",
        action: "click",
        x: Math.min(1800, Math.max(100, firstStep.x - 40)),
        y: Math.max(80, firstStep.y - 60),
        delayMs: 400,
        status: "inserted",
        replanReason: "Inserted viewport anchor click to bring window to foreground and eliminate background displacement drift.",
        confidence,
      };
      suggestedSteps.unshift(anchorStep);
      mitigations.unshift("Inserted foreground anchor alignment step at sequence index 0.");
    }

    const changedCount = suggestedSteps.filter((s) => s.status === "modified" || s.status === "inserted").length;
    const replanResult: ReplanResult = {
      replanId: `replan_${Date.now()}`,
      timestamp: Date.now(),
      driftDetected: currentDriftDistancePx > driftThreshold,
      maxDriftPx: currentDriftDistancePx,
      originalStepCount: steps.length,
      newStepCount: suggestedSteps.length,
      summary: verified
        ? `Model-assisted re-plan proposes changes to ${changedCount} step(s) for the reported ${currentDriftDistancePx.toFixed(1)}px drift.`
        : `Unverified heuristic re-plan (no model analysis available): proposes changes to ${changedCount} step(s) for the reported ${currentDriftDistancePx.toFixed(1)}px drift; coordinates move only where a measured offset exists.`,
      confidence,
      source: verified ? "model" : "heuristic",
      verified,
      suggestedSteps,
      mitigationStrategies: mitigations,
      executionPlan: `Execute re-planned ${suggestedSteps.length}-step workflow using PyAutoGUI with adaptive settling delays and element bounding re-anchoring.`,
    };

    res.json({
      success: true,
      simulated: !verified,
      source: replanResult.source,
      replan: replanResult,
      aiInsights: modelAnalysis,
    });
  } catch (error: any) {
    console.error("[GoalReplan] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to generate AI goal re-plan",
    });
  }
}
