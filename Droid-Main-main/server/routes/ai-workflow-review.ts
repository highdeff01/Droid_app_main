import { RequestHandler } from "express";
import { aiMonitorStore } from "../ai-monitor-store";
import { parseModelJson, sendQwenChatRequest } from "../ai-endpoint";

interface StepReview {
  stepIndex: number;
  stepId?: string;
  confidence: number | null;
  suggestion: string;
  driftTolerancePx: number;
}

const REVIEW_PROMPT =
  'You review recorded UI automation steps. Return JSON {"score":0..100,"suggestions":[{"stepIndex":number,"confidence":0..1,"suggestion":string,"driftTolerancePx":number}]} with one suggestion per step.';

/** Rule-of-thumb review used when the model is unavailable: no confidence is claimed. */
function heuristicReview(steps: any[]): StepReview[] {
  return steps.map((step, index) => ({
    stepIndex: index,
    stepId: step.id,
    confidence: null,
    suggestion: step.delayMs < 200 ? "Increase delayMs to at least 300ms for UI rendering stability" : "Optimal step structure",
    driftTolerancePx: 12,
  }));
}

/** Asks Qwen to review the steps; null when the model is unavailable or unreadable. */
async function qwenReview(steps: any[]): Promise<{ suggestions: StepReview[]; score: number } | null> {
  const reply = await sendQwenChatRequest(
    [
      { role: "system", content: REVIEW_PROMPT },
      { role: "user", content: JSON.stringify(steps.slice(0, 50)) },
    ],
    { format: "json" },
  );
  if (!reply.success) return null;
  try {
    const parsed = parseModelJson(reply.content);
    if (!Array.isArray(parsed.suggestions)) return null;
    const suggestions = parsed.suggestions.map((s: any, i: number) => ({
      stepIndex: Number.isInteger(s.stepIndex) ? s.stepIndex : i,
      stepId: steps[Number.isInteger(s.stepIndex) ? s.stepIndex : i]?.id,
      confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
      suggestion: String(s.suggestion ?? ""),
      driftTolerancePx: typeof s.driftTolerancePx === "number" ? s.driftTolerancePx : 12,
    }));
    return { suggestions, score: typeof parsed.score === "number" ? parsed.score : 0 };
  } catch {
    return null;
  }
}

export const handleAiReviewSteps: RequestHandler = async (req, res) => {
  const steps: any[] = Array.isArray(req.body?.steps) ? req.body.steps : [];
  const modelReview = steps.length > 0 ? await qwenReview(steps) : null;
  const review = modelReview
    ? { ...modelReview, simulated: false }
    : { suggestions: heuristicReview(steps), score: null, simulated: true };

  aiMonitorStore.record({
    phase: "planning",
    title: review.simulated ? "AI Workflow Review Unavailable (heuristic)" : "AI Workflow Review Completed",
    detail: review.simulated
      ? `Model unavailable; ${steps.length} steps checked by heuristic rules only (no score).`
      : `Reviewed ${steps.length} steps (score ${review.score}).`,
    status: "completed",
  });

  res.json({
    success: true,
    simulated: review.simulated,
    source: review.simulated ? "heuristic" : "model",
    suggestions: review.suggestions,
    score: review.score,
  });
};

export const handleApplySuggestionsWithQwen: RequestHandler = (req, res) => {
  const { steps, suggestions } = req.body;
  const optimizedSteps = (steps || []).map((s: any) => ({
    ...s,
    delayMs: Math.max(s.delayMs || 400, 300),
  }));

  aiMonitorStore.record({
    phase: "recovery",
    title: "Applied Rule-Based Workflow Optimization",
    detail: `Raised delays on ${optimizedSteps.length} steps to at least 300ms (heuristic; no model consulted).`,
    status: "completed",
  });

  res.json({
    success: true,
    simulated: true,
    source: "heuristic",
    optimizedSteps,
    message: "Applied rule-based optimization (minimum 300ms delay per step); no model was consulted.",
  });
};
