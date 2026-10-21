import { RequestHandler } from "express";
import {
  verifyStepAccuracy,
  resolveStuckState,
  evaluateCheckupAndCompletion,
  detectScreenElementsAndSteps,
  compareScreensForMatch,
  detectVisualErrorsAndDifferenceMapping,
  ScreenMatchResult,
} from "../ai-gemini-service";
import { dispatchActionToPython } from "./dual-ai-pipeline";
import { centralLogHub } from "../log-hub";

export const handleVerifyStep: RequestHandler = async (req, res) => {
  try {
    const { imageData, step, userObjective } = req.body;
    if (!step) {
      return res.status(400).json({ success: false, error: "Missing step data" });
    }

    const result = await verifyStepAccuracy({
      imageData,
      step,
      userObjective,
    });

    res.json({ success: true, verification: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const handleStuckResolver: RequestHandler = async (req, res) => {
  try {
    const {
      imageData,
      currentStep,
      userObjective,
      elapsedSeconds,
      targetSeconds,
      lastError,
      autoExecuteFix = false,
    } = req.body;

    const resolution = await resolveStuckState({
      imageData,
      currentStep,
      userObjective,
      elapsedSeconds,
      targetSeconds,
      lastError,
    });

    let executedActions: any[] = [];
    if (autoExecuteFix && resolution.recommendedActions?.length > 0) {
      centralLogHub.addLog(
        "AI-StuckResolver",
        "INFO",
        `Auto-executing ${resolution.recommendedActions.length} recovery action(s)`
      );
      for (const rec of resolution.recommendedActions) {
        try {
          const res = await dispatchActionToPython({
            title: `Unstuck: ${rec.reason}`,
            action: rec.action,
            x: rec.x || 960,
            y: rec.y || 540,
            textPayload: rec.text,
            keyPayload: rec.key || "escape",
            delayMs: rec.delayMs || 500,
          });
          executedActions.push(res);
        } catch (e) {
          executedActions.push({ error: String(e) });
        }
      }
    }

    res.json({
      success: true,
      resolution,
      executedActions: autoExecuteFix ? executedActions : undefined,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const handleScheduleCheckup: RequestHandler = async (req, res) => {
  try {
    const {
      imageData,
      userObjective = "Workflow completion check",
      elapsedSeconds = 0,
      maxSeconds = 60,
      remainingStepCount = 0,
      autoFinishIfFound = true,
    } = req.body;

    const evaluation = await evaluateCheckupAndCompletion({
      imageData,
      userObjective,
      elapsedSeconds,
      maxSeconds,
      remainingStepCount,
    });

    let finishActionResult: any = null;
    if (
      autoFinishIfFound &&
      !evaluation.isFinished &&
      evaluation.recommendedNextAction
    ) {
      const act = evaluation.recommendedNextAction;
      finishActionResult = await dispatchActionToPython({
        title: `Checkup Final Action: ${act.explanation}`,
        action: act.action,
        x: act.x || 960,
        y: act.y || 540,
        textPayload: act.text,
      });
    }

    res.json({
      success: true,
      evaluation,
      finishActionResult,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const handleDetectElementsAndSteps: RequestHandler = async (req, res) => {
  try {
    const { imageData, screenWidth, screenHeight, objective } = req.body;
    if (!imageData) {
      return res.status(400).json({ success: false, error: "Missing imageData (screen frame)" });
    }

    const analysis = await detectScreenElementsAndSteps({
      imageData,
      screenWidth: screenWidth ? Number(screenWidth) : 1920,
      screenHeight: screenHeight ? Number(screenHeight) : 1080,
      objective,
    });

    res.json({
      success: true,
      ...analysis,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const handleCompareScreenMatch: RequestHandler = async (req, res) => {
  try {
    const { currentScreen, expectedScreen, expectedStepLabel, threshold } = req.body;
    if (!currentScreen || !expectedScreen) {
      return res.status(400).json({
        success: false,
        error: "Both currentScreen and expectedScreen are required",
      });
    }

    const matchResult = await compareScreensForMatch({
      currentScreen,
      expectedScreen,
      expectedStepLabel,
      threshold: threshold !== undefined ? Number(threshold) : 0.75,
    });

    res.json({
      success: true,
      ...matchResult,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const handleAutoActorTrigger: RequestHandler = async (req, res) => {
  try {
    const {
      currentScreen,
      expectedScreen,
      step,
      autoActEnabled = false,
      threshold = 0.75,
      modeTransition = "manual",
    } = req.body;

    centralLogHub.addLog(
      "AI-AutoActor",
      "INFO",
      `Auto-Actor triggered via mode transition: "${modeTransition}". Auto-Act enabled: ${autoActEnabled}`
    );

    let matchResult: ScreenMatchResult = {
      matched: true,
      similarityScore: 0.9,
      reason: "Visual state verified.",
      identifiedElements: ["Screen Interface"],
      suggestedNextStep: step || {
        action: "click",
        x: 960,
        y: 540,
        name: "Auto-Act Next Step",
      },
    };

    if (currentScreen && expectedScreen) {
      matchResult = await compareScreensForMatch({
        currentScreen,
        expectedScreen,
        expectedStepLabel: step?.name || "Target Step",
        threshold: Number(threshold),
      });
    }

    let executionResult: any = null;
    if (autoActEnabled && matchResult.matched) {
      const targetStep = step || matchResult.suggestedNextStep;
      centralLogHub.addLog(
        "AI-AutoActor",
        "SUCCESS",
        `Screen matched (${((matchResult.similarityScore || 0) * 100).toFixed(1)}%) -> Auto-executing step: "${targetStep.name || targetStep.action}"`
      );

      executionResult = await dispatchActionToPython({
        title: `Auto-Act: ${targetStep.name || targetStep.action}`,
        action: targetStep.action || "click",
        x: targetStep.x || 960,
        y: targetStep.y || 540,
        textPayload: targetStep.text,
        keyPayload: targetStep.keyPayload,
        delayMs: targetStep.delayMs || 400,
      });
    }

    res.json({
      success: true,
      matched: matchResult.matched,
      similarityScore: matchResult.similarityScore,
      reason: matchResult.reason,
      autoActExecuted: Boolean(autoActEnabled && matchResult.matched && executionResult),
      executionResult,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const handleVisualErrorAndDiff: RequestHandler = async (req, res) => {
  try {
    const {
      expectedImage,
      responseImage,
      stepName,
      stepAction,
      targetCoords,
      autoRepositionEnabled = true,
    } = req.body;

    if (!expectedImage || !responseImage) {
      return res.status(400).json({
        success: false,
        error: "Both expectedImage and responseImage are required for Visual Error Detection & Difference Mapping.",
      });
    }

    const diffResult = await detectVisualErrorsAndDifferenceMapping({
      expectedImage,
      responseImage,
      stepName,
      stepAction,
      targetCoords,
      autoRepositionEnabled: Boolean(autoRepositionEnabled),
    });

    res.json({
      success: true,
      ...diffResult,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

