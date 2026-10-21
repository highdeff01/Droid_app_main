import { z } from "zod";
import {
  buildVisionMessage,
  parseModelJson,
  sendQwenChatRequest,
} from "../ai-endpoint";
import { VISION_REPORT_PROMPT, normalizeVisionReport } from "../vision-report";
import { executeDeviceTask } from "./execute-task";
/**
 * Dual-AI Pipeline Express Route Handlers
 * Endpoints for AI #1 Qwen Perception, AI #2 Reasoning Planner, Coordinate Recalibration & Adaptive Retry
 */

import { RequestHandler } from "express";
import { qwenVisionEngine } from "../ai-perception-engine";
import { aiPlannerEngine } from "../ai-planner-engine";
import { adaptiveRetryEngine } from "../adaptive-retry-engine";
import { verifyStepAccuracy, resolveStuckState } from "../ai-gemini-service";
import { aiMonitorStore } from "../ai-monitor-store";


// 1. AI #1 Screen Auto-Description & Feedback Positioning
export const handleDescribeScreen: RequestHandler = async (req, res) => {
  try {
    const { imageData, endpoint, model, browserContext } = req.body;
    if (!imageData) {
      return res
        .status(400)
        .json({ success: false, error: "Missing imageData" });
    }

    const context = browserContext || aiMonitorStore.getBrowserContext();
    aiMonitorStore.setStatus({
      status: "perceiving",
      currentAction: "Analyzing the current screen",
    });
    if (typeof imageData !== "string" || !/^data:image\/(png|jpeg);base64,/.test(imageData)) return res.status(400).json({ success: false, error: "An actual PNG/JPEG screenshot is required" });
    const response = await sendQwenChatRequest([
      { role: "system", content: VISION_REPORT_PROMPT },
      buildVisionMessage("Inspect this current screen", imageData),
    ], { endpoint, model, format: "json" });
    if (!response.success) {
      aiMonitorStore.setStatus({ status: "idle", currentAction: null });
      return res.status(502).json({ success: false, error: response.error || "Vision provider unavailable" });
    }
    let report;
    try {
      report = normalizeVisionReport(parseModelJson(response.content), response.content);
    } catch (parseErr) {
      aiMonitorStore.setStatus({ status: "idle", currentAction: null });
      return res.status(502).json({ success: false, error: `Vision model returned unreadable output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` });
    }
    aiMonitorStore.record({
      phase: "perception",
      title: "Screen perceived",
      detail: report.screenDescription,
      status: "completed",
      confidence: report.confidence,
      source: "AI #1 Vision",
    });
    aiMonitorStore.setStatus({ status: "idle", currentAction: null });
    res.json({ success: true, report, elements: report.elements, confidence: report.confidence });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// 2. AI #2 Reasoning Planner, Thinking, Goal Reorganization & Action Formulation
export const handlePlanAndAct: RequestHandler = async (req, res) => {
  try {
    const {
      perceptionReport,
      userObjective,
      endpoint,
      model,
      executeImmediately = false,
    } = req.body;

    if (!perceptionReport) {
      return res
        .status(400)
        .json({ success: false, error: "Missing perceptionReport" });
    }

    aiMonitorStore.setStatus({
      status: "planning",
      objective: userObjective || "Automated desktop task",
      currentAction: "Formulating the next action",
    });
    const decision = await aiPlannerEngine.planAndFormulateAction(
      perceptionReport,
      userObjective,
      endpoint,
      model,
    );
    aiMonitorStore.record({
      phase: "planning",
      title: decision.statusSummary || "Plan formulated",
      detail: decision.thinking?.reasoning || "",
      status: "completed",
      confidence: decision.thinking?.confidence,
      source: "AI #2 Planner",
    });
    aiMonitorStore.setStatus({
      status: "idle",
      currentAction: null,
      activeGoals: (decision.goals || []).map((g: any) => ({
        title: g.title,
        status: g.status,
      })),
    });

    let executionResult: any = null;
    let verification: any = null;
    let stuckResolution: any = null;

    if (executeImmediately) {
      return res.status(409).json({ success: false, decision, error: "Review and save the proposed action, then run it through /api/replay for fresh device verification" });
    }

    res.json({
      success: true,
      decision,
      executionResult,
      verification,
      stuckResolution,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// 3. Post-Execution Coordinate Recalibration
export const handleRecalibrateStep: RequestHandler = async (req, res) => {
  try {
    const { targetName, currentX, currentY, newElements } = req.body;
    const result = adaptiveRetryEngine.recalibrateElementCoordinates(
      targetName || "",
      currentX ?? 960,
      currentY ?? 540,
      newElements || [],
    );
    res.json({ success: true, recalibration: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// 3b. Batch Auto-Calibration for Workflow Steps with Pixel-Drift Threshold Evaluation
export const handleAutoCalibrateWorkflow: RequestHandler = async (req, res) => {
  try {
    const { steps = [], thresholdPx = 8, elements = [] } = req.body;
    if (!Array.isArray(elements) || elements.length === 0) return res.status(422).json({ success: false, error: "Capture and detect actual elements before recalibrating" });
    const threshold = Number(thresholdPx) || 8;
    let recalibratedCount = 0;
    const logs: string[] = [];
    const driftPoints: Array<{
      x: number;
      y: number;
      driftPx: number;
      intensity: number;
      frequency: number;
      selectorName: string;
      isProblematic: boolean;
      status: "critical" | "moderate" | "stable";
    }> = [];

    const calibratedSteps = steps.map((step: any, idx: number) => {
      const stepNum = step.stepNumber || idx + 1;
      const baseX = step.originalX ?? step.x ?? 960;
      const baseY = step.originalY ?? step.y ?? 540;
      const currentOffsetX = step.offsetX ?? 0;
      const currentOffsetY = step.offsetY ?? 0;
      const currentTargetX = baseX + currentOffsetX;
      const currentTargetY = baseY + currentOffsetY;
      const targetName = step.selector || step.targetOcrLabel || step.name || `Step #${stepNum}`;

      // Use adaptive retry engine to find target in elements
      const recal = adaptiveRetryEngine.recalibrateElementCoordinates(
        targetName,
        currentTargetX,
        currentTargetY,
        elements,
      );

      const detectedX = recal.newCoordinates.x;
      const detectedY = recal.newCoordinates.y;

      const dx = detectedX - currentTargetX;
      const dy = detectedY - currentTargetY;
      const driftPx = Math.round(Math.hypot(dx, dy) * 10) / 10;
      const exceeds = driftPx > threshold;

      let newOffsetX = currentOffsetX;
      let newOffsetY = currentOffsetY;
      let recalibrated = false;

      if (exceeds) {
        newOffsetX = currentOffsetX + dx;
        newOffsetY = currentOffsetY + dy;
        recalibrated = true;
        recalibratedCount++;
        logs.push(
          `[AUTO-CALIBRATION] Step #${stepNum} "${targetName}": Drift of ${driftPx}px exceeded threshold (${threshold}px). Offset updated to [ΔX:${newOffsetX > 0 ? "+" : ""}${newOffsetX}px, ΔY:${newOffsetY > 0 ? "+" : ""}${newOffsetY}px].`
        );
      } else {
        logs.push(
          `[AUTO-CALIBRATION] Step #${stepNum} "${targetName}": Drift of ${driftPx}px is within threshold (${threshold}px). Alignment intact.`
        );
      }

      const pointStatus = driftPx > threshold ? "critical" : driftPx > threshold / 2 ? "moderate" : "stable";
      const intensity = Math.min(1, Math.max(0.1, driftPx / (threshold * 1.5)));

      driftPoints.push({
        x: detectedX,
        y: detectedY,
        driftPx,
        intensity,
        frequency: exceeds ? Math.min(10, Math.floor(driftPx / 2)) : 1,
        selectorName: targetName,
        isProblematic: exceeds,
        status: pointStatus,
      });

      return {
        ...step,
        originalX: baseX,
        originalY: baseY,
        offsetX: newOffsetX,
        offsetY: newOffsetY,
        x: baseX + newOffsetX,
        y: baseY + newOffsetY,
        driftDistancePx: driftPx,
        recalibrated: exceeds || step.recalibrated || false,
        lastCalibratedAt: Date.now(),
      };
    });

    res.json({
      success: true,
      calibratedSteps,
      recalibratedCount,
      thresholdPx: threshold,
      driftPoints,
      logs,
      summary: recalibratedCount > 0
        ? `Auto-Calibration updated ${recalibratedCount} step(s) with pixel-drift exceeding ${threshold}px.`
        : `All ${steps.length} step(s) aligned within ${threshold}px threshold (Zero drift corrections needed).`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// 4. Adaptive Retry Calculation with Learning from Past Methods
export const handleAdaptiveRetry: RequestHandler = async (req, res) => {
  try {
    const {
      stepId,
      actionType,
      targetName,
      currentX,
      currentY,
      textPayload,
      perception,
    } = req.body;
    const retryPlan = adaptiveRetryEngine.computeAdaptiveRetry(
      stepId || `step_${Date.now()}`,
      actionType || "click",
      targetName || "Target",
      currentX ?? 960,
      currentY ?? 540,
      textPayload,
      perception || {
        elements: [],
        feedbackPosition: { x: 960, y: 540 },
        screenDescription: "",
      },
    );

    let executionResult: any = null;
    // Recovery is a proposal; it must be reviewed as a new replay step before dispatch.

    res.json({ success: true, retryPlan, executionResult });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// 5. Unified Autonomous Co-Pilot Step (Perceive -> Plan -> Act -> Verify -> Recalibrate)
export const handleAutonomousStep: RequestHandler = async (req, res) => {
  try {
    const { imageData, userObjective, endpoint, model, browserContext } =
      req.body;
    if (!imageData) {
      return res
        .status(400)
        .json({ success: false, error: "Missing imageData" });
    }

    aiMonitorStore.setStatus({
      status: "perceiving",
      objective: userObjective || "Autonomous co-pilot step",
      currentAction: "Analyzing the current screen",
    });
    const perception = await qwenVisionEngine.analyzeScreen(
      imageData,
      endpoint,
      model,
      browserContext || aiMonitorStore.getBrowserContext(),
    );
    aiMonitorStore.record({
      phase: "perception",
      title: "Screen perceived",
      detail: perception.screenDescription,
      status: "completed",
      confidence: perception.confidence,
      source: "AI #1 Vision",
    });
    aiMonitorStore.setStatus({
      status: "planning",
      currentAction: "Formulating the next action",
    });
    const decision = await aiPlannerEngine.planAndFormulateAction(
      perception,
      userObjective,
      endpoint,
      model,
    );
    aiMonitorStore.record({
      phase: "planning",
      title: decision.statusSummary || "Plan formulated",
      detail: decision.thinking?.reasoning || "",
      status: "completed",
      confidence: decision.thinking?.confidence,
      source: "AI #2 Planner",
    });
    aiMonitorStore.setStatus({
      status: "idle",
      currentAction: null,
      activeGoals: (decision.goals || []).map((g: any) => ({
        title: g.title,
        status: g.status,
      })),
    });

    let executionResult: any = null;
    let verification: any = null;
    let stuckResolution: any = null;

    // Planning remains a preview. User-selected steps execute through the replay coordinator.

    res.json({
      success: true,
      perception,
      decision,
      executionResult,
      verification,
      stuckResolution,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// Legacy callers share the strict device adapter and never synthesize success.
export async function dispatchActionToPython(action: any): Promise<any> {
  try { return await executeDeviceTask(action); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "Execution failed" }; }
}

// 7. AI Play Similar Action (Frames 1-10) with Clickpoint Execution on PC
export const handleReplayDriftActions: RequestHandler = (req, res) => {
  res.status(409).json({ success: false, error: "Use Screen Hub verified replay. Legacy drift replay cannot verify screenshot outcomes." });
};

export const handleQwenGuideStep: RequestHandler = (_req, res) => {
  res.status(409).json({ success: false, error: "Use the replay monitor for evidence-based target correction. No live screenshot was supplied to this legacy guide." });
};
