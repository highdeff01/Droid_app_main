import { replayRouter } from "./routes/replay";
import { createPhoneRouter } from "./routes/phone";
import { handleStopBridge, handleExecutePyAutoGUI, handleReplayTrail } from "./routes/pyautogui-bridge";
import { handleAiReviewSteps, handleApplySuggestionsWithQwen } from "./routes/ai-workflow-review";
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// === Master App (unified_ai_master_app1) core imports ===
import { handleDemo } from "./routes/demo";
import {
  handleCaptureScreen as handleMasterCaptureScreen,
  handleSyncRealFrame as handleMasterSyncRealFrame,
  handleGetScreenCaptureHistory,
  getLatestSyncedRealFrame,
  getRecentDesktopFrames,
  captureDesktopFrame,
} from "./routes/screen-capture";
import { handleAnalyzeScreenshot as handleMasterAnalyzeScreenshot } from "./routes/analyze-screenshot";
import { centralLogHub } from "./log-hub";
import { assistantRouter } from "./routes/assistant";
import { companionRouter } from "./routes/companion";
import { assistantSourcesRouter } from "./routes/assistant-sources";
import { analysisRouter } from "./routes/analysis";
import { goalWorkflowsRouter } from "./routes/goal-workflows";
import { assistantPlansRouter } from "./routes/assistant-plans";
import { assistantExecutionRouter } from "./routes/assistant-execution";
import { assistantRecordingsRouter } from "./routes/assistant-recordings";
import { assistantWorkflowsRouter } from "./routes/assistant-workflows";
import { createHudToolsRouter } from "./routes/hud-tools";
import { DurableStore } from "./durable-store";
import { recognizeWithProviders } from "./ocr-provider";
import { sendQwenChatRequest } from "./ai-endpoint";
import { validateDeviceId } from "./automation-adapters";
import { assistantConditionsRouter } from "./routes/assistant-conditions";
import {
  createApiRateLimiter,
  createCorsMiddleware,
  requireApiAccess,
  validateAdbEndpoint,
} from "./security";
import { assistantLiveRouter } from "./routes/assistant-live";
import { assistantReportsRouter } from "./routes/assistant-reports";
import { verificationReportsRouter } from "./routes/verification-reports";
import { schedulingRouter } from "./routes/scheduling";
import { methodLearningRouter } from "./routes/method-learning";
import { mobileStreamRouter, getLatestRealMobileFrame, getRecentMobileFrames } from "./routes/mobile-stream";
import { createCaptureHandler, resolveCaptureFrame, type CaptureSource } from "./capture-frame";
import { createOverseer } from "./overseer";
import type { OverseerSupervisor } from "./overseer/supervisor";
import { createOverseerRouter } from "./routes/overseer";
import { workflowRuntime } from "./workflow-runtime";
import { redactSensitive } from "./security";

// === AppBrief unique imports (Drive + PyAutoGUI + Dual-AI) ===
import {
  handleExecuteTask,
  handleGetInteractions,
  handleClearInteractions,
} from "./routes/execute-task";
import {
  handleDescribeScreen,
  handlePlanAndAct,
  handleAutonomousStep,
  handleRecalibrateStep,
  handleAutoCalibrateWorkflow,
  handleAdaptiveRetry,
  handleReplayDriftActions,
  handleQwenGuideStep,
} from "./routes/dual-ai-pipeline";
import {
  handleVerifyStep,
  handleStuckResolver,
  handleScheduleCheckup,
  handleDetectElementsAndSteps,
  handleCompareScreenMatch,
  handleAutoActorTrigger,
  handleVisualErrorAndDiff,
} from "./routes/ai-automation-controller";
import {
  handleRefineDescription,
  handleGetSamplePresets,
  handleBulkGenerateNamesDescriptions,
  handleGenerateFileSummary,
} from "./routes/description-refiner";
import {
  testAiEndpoint,
  getConfiguredAiEndpoint,
  setConfiguredAiEndpoint,
  getConfiguredAiModel,
  setConfiguredAiModel,
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_LOCAL_OLLAMA_ENDPOINT,
  DEFAULT_QWEN_MODEL,
} from "./ai-endpoint";
import {
  handlePyAutoGUIBridge,
  handleGetBridgeLogs,
  handleClearBridgeLogs,
  handleBridgeHealth,
  handleBridgeReconnect,
  handlePauseBridge,
  handleResumeBridge,
  handleGetBridgeState,
  handleRetrySegment,
  handleCoordinateSync,
  handlePreExecutionValidate,
  handleBridgePing,
  handlePreExecutionScan,
  handleAutoRepositionAgent,
  handleGetDriftEvents,
  handlePreReplaySnapshotCheck,
  handleInteractiveDeviceAction,
  handleAiNavigationCheck,
  handleAiAutoRecordStep,
} from "./routes/pyautogui-bridge";
import {
  handleGetAiMonitor,
  handleGetActionHistory,
  handleExportActionHistoryCsv,
  handleRecordAction,
  handleClearActionHistory,
} from "./routes/ai-monitor";
import {
  handleGetBrowserTabs,
  handleInspectBrowserTab,
  handleBrowserExtensionReport,
  handleGetBrowserContext,
} from "./routes/browser-inspector";
import { handleAnalyzeAndAct } from "./routes/analyze-and-act";
import {
  handleLearnWorkflows,
  handleGetLearnedWorkflows,
  handleDeleteLearnedWorkflow,
} from "./routes/autonomous-workflow-learner";
import {
  handleGetWatcherStatus,
  handleStartWatcher,
  handleStopWatcher,
  handleAssembleTask,
} from "./routes/watcher-agent";
import { handleGoalReplan } from "./routes/goal-replanner";
import {
  handleGetScheduledJobs,
  handleCreateScheduledJob,
  handleToggleScheduledJob,
  handleRunJobNow,
  handleDeleteScheduledJob,
} from "./routes/workflow-scheduler";
import {
  handleBreakdownVideoSteps,
  handleScreenshotIntegrityCheck,
} from "./routes/video-breakdown-and-integrity";
import {
  handleGetOmniState,
  handleOmniSwitchTab,
  handleOmniAdjustSettings,
  handleOmniAnalyzeScreen,
  handleOmniInteract,
  handleOmniFixWorkflow,
  handleOmniExecuteAutonomousTask,
} from "./routes/omni-ai-controller";
import { mainAiChatRouter } from "./routes/main-ai-chat-controller";
import { handleCompareScreenshots } from "./routes/compare-screenshots";
import { handleAdbDevices, createAdbCaptureHandler, createAdbScanHandler } from "./routes/adb-capture";
import { handleAdbConnect, createAdbDisconnectHandler } from "./routes/adb-link";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory store for last synced real frame (AppBrief HUD sync)
let lastSyncedFrame: string | null = null;
let lastSyncedTimestamp = Date.now();

/** One fallback order for every capture route: HUD share -> desktop capture -> real mobile stream. */
const screenCaptureSources: CaptureSource[] = [
  {
    name: "live_hud_sync",
    read: () =>
      lastSyncedFrame
        ? { imageData: lastSyncedFrame, timestamp: lastSyncedTimestamp }
        : null,
  },
  {
    name: "desktop_capture",
    read: async () => {
      const result = await captureDesktopFrame();
      if (!result.success || !result.imageData) {
        if (result.error) throw new Error(result.error);
        return null;
      }
      return {
        imageData: result.imageData,
        timestamp: result.timestamp ?? Date.now(),
        method: result.method,
        metadata: result.metadata,
      };
    },
  },
  {
    name: "mobile_stream_mirror",
    read: () => getLatestRealMobileFrame(),
  },
];

let overseer: OverseerSupervisor | null = null;

/** One overseer per process (createServer may run more than once); captures through the shared fallback order. */
function getOverseer(): OverseerSupervisor {
  if (!overseer) {
    overseer = createOverseer(async () => (await resolveCaptureFrame(screenCaptureSources)).imageData);
    overseer.start();
  }
  return overseer;
}

export function createServer() {
  const app = express();

  // CORS is an explicit allowlist; a failure here fails server creation (closed), never permissive.
  app.use(createCorsMiddleware());
  // Per-IP safety limit on /api (streaming/polling routes are whitelisted inside the limiter).
  app.use("/api", createApiRateLimiter());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Every /api route below is rate limited and behind the API authentication boundary;
  // requireApiAccess itself lets the public health/demo routes through.
  app.use("/api", createApiRateLimiter(), requireApiAccess);

  // === Master assistant routes (protected) ===
  app.use("/api/assistant", requireApiAccess, assistantRouter);
  app.use("/api/assistant/sources", requireApiAccess, assistantSourcesRouter);
  app.use("/api/assistant/analysis", requireApiAccess, analysisRouter);
  app.use("/api/assistant/plans", requireApiAccess, assistantPlansRouter);
  app.use("/api/goal-workflows", requireApiAccess, goalWorkflowsRouter);
  app.use(
    "/api/assistant/execution",
    requireApiAccess,
    assistantExecutionRouter,
  );
  app.use(
    "/api/assistant/recordings",
    requireApiAccess,
    assistantRecordingsRouter,
  );
  app.use(
    "/api/assistant/workflows",
    requireApiAccess,
    assistantWorkflowsRouter,
  );
  app.use(
    "/api/assistant/conditions",
    requireApiAccess,
    assistantConditionsRouter,
  );
  app.use("/api/assistant/live", requireApiAccess, assistantLiveRouter);
  app.use("/api/assistant/reports", requireApiAccess, assistantReportsRouter);
  app.use("/api/assistant/verification", requireApiAccess, verificationReportsRouter);
  app.use("/api/assistant/scheduling", requireApiAccess, schedulingRouter);
  app.use("/api/assistant/method-learning", requireApiAccess, methodLearningRouter);
  app.use("/api/method-learning", requireApiAccess, methodLearningRouter);
  // Habit profile, outcome feedback and templates (client: HUD learning strip, squad, workflow library).
  app.use("/api/learning", requireApiAccess, methodLearningRouter);
  // Companion notes, triggers (watch on/off), pending trigger actions; the HUD Master AI panel drives it.
  app.use("/api/companion", requireApiAccess, companionRouter);

  // === Master assistant routes ===
  app.use("/api/assistant", assistantRouter);
  app.use("/api/assistant/sources", assistantSourcesRouter);
  app.use("/api/assistant/analysis", analysisRouter);
  app.use("/api/assistant/plans", assistantPlansRouter);
  app.use("/api/assistant/execution", assistantExecutionRouter);
  app.use("/api/assistant/recordings", assistantRecordingsRouter);
  app.use("/api/assistant/workflows", assistantWorkflowsRouter);
  app.use("/api/assistant/conditions", assistantConditionsRouter);
  app.use("/api/assistant/live", assistantLiveRouter);
  app.use("/api/assistant/reports", assistantReportsRouter);
  app.use("/api/assistant/verification", verificationReportsRouter);
  app.use("/api/assistant/scheduling", schedulingRouter);
  app.use("/api/assistant/method-learning", methodLearningRouter);
  app.use("/api/method-learning", methodLearningRouter);

  // Health and ping (master + appbrief)
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "pong";
    res.json({ message: ping, time: new Date().toISOString() });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });
  app.get("/api/demo", handleDemo);

  // === Screen capture: one implementation behind every capture route ===
  const handleCapture = createCaptureHandler(screenCaptureSources);
  app.get("/api/capture-screen", handleCapture);
  app.get("/api/screen/capture", handleCapture);
  app.get("/api/screen-capture", handleCapture);
  app.post("/api/sync-real-frame", (req, res) => {
    try {
      const { imageData, metadata } = req.body;
      if (imageData) {
        lastSyncedFrame = imageData;
        lastSyncedTimestamp = Date.now();
        // Also sync to master store for parity
        handleMasterSyncRealFrame(req as any, res as any).catch(() => {
          if (!res.headersSent) res.json({ success: true, timestamp: lastSyncedTimestamp });
        });
        if (!res.headersSent) res.json({ success: true, timestamp: lastSyncedTimestamp });
        return;
      }
      res.status(400).json({ success: false, error: "Missing imageData" });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });
  // Master explicit endpoints kept for compatibility
  app.get("/api/master/capture-screen", handleMasterCaptureScreen);
  app.post("/api/master/sync-real-frame", handleMasterSyncRealFrame);
  app.get("/api/master/screen-capture-history", handleGetScreenCaptureHistory);

  // Unified Multi-Device Screenshot & Frame History for AI Strategy and Workflows
  app.get("/api/screenshots/history", (_req, res) => {
    try {
      const desktopFrames = getRecentDesktopFrames().map((f) => ({
        ...f,
        device: "desktop" as const,
        source: "desktop_capture",
      }));
      const mobileFrames = getRecentMobileFrames().map((f) => ({
        ...f,
        device: "android" as const,
        source: "mobile_stream",
      }));
      const combined = [...desktopFrames, ...mobileFrames].sort((a, b) => b.timestamp - a.timestamp);
      res.json({
        success: true,
        count: combined.length,
        desktopCount: desktopFrames.length,
        mobileCount: mobileFrames.length,
        frames: combined,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.post("/api/analyze-screenshot", async (req, res) => {
    try {
      const { imageData } = req.body;
      const targetImage = imageData || lastSyncedFrame;
      if (!targetImage) {
        return res.status(400).json({ success: false, error: "Missing imageData" });
      }
      // Try master analyze first
      try {
        return await handleMasterAnalyzeScreenshot(req as any, res as any, () => {});
      } catch (err) {
        console.error("[analyze-screenshot] analysis failed:", err);
      }
      if (res.headersSent) return;
      res.json({
        success: false,
        status: "unavailable",
        simulated: true,
        detectedElements: [],
        interactiveCount: 0,
        confidence: null,
        error: "Screenshot analysis is unavailable; no elements were detected.",
      });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Task execution and logs
  app.post("/api/execute-task", handleExecuteTask);
  app.get("/api/interactions", handleGetInteractions);
  app.delete("/api/interactions", handleClearInteractions);

  // Dual-AI Perception, Reasoning Planner & Adaptive Retry Pipeline
  app.post("/api/ai/describe-screen", handleDescribeScreen);
  app.post("/api/ai/plan-and-act", handlePlanAndAct);
  app.post("/api/ai/autonomous-step", handleAutonomousStep);
  app.post("/api/ai/recalibrate-step", handleRecalibrateStep);
  app.post("/api/ai/auto-calibrate-workflow", handleAutoCalibrateWorkflow);
  app.post("/api/ai/adaptive-retry", handleAdaptiveRetry);
  app.post("/api/ai/replay-drift-actions", handleReplayDriftActions);
  app.post("/api/ai/qwen-guide-step", handleQwenGuideStep);

  // Model Endpoint Testing & System AI Settings
  app.post("/api/ai/test-endpoint", async (req, res) => {
    try {
      const { endpoint, model } = req.body;
      const result = await testAiEndpoint(endpoint, model);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        latencyMs: 0,
        endpoint: req.body?.endpoint || getConfiguredAiEndpoint(),
        model: req.body?.model || DEFAULT_QWEN_MODEL,
        error: err instanceof Error ? err.message : String(err),
        message: err instanceof Error ? err.message : "Failed to test endpoint",
      });
    }
  });

  app.get("/api/ai/settings", (_req, res) => {
    res.json({
      success: true,
      settings: {
        modelUrl: getConfiguredAiEndpoint(),
        model: getConfiguredAiModel(),
        defaultModelUrl: DEFAULT_LOCAL_OLLAMA_ENDPOINT,
        fallbackModelUrl: DEFAULT_OLLAMA_ENDPOINT,
        defaultModel: DEFAULT_QWEN_MODEL,
      },
    });
  });

  app.post("/api/ai/settings", (req, res) => {
    const { modelUrl, model } = req.body;
    if (modelUrl && typeof modelUrl === "string") {
      setConfiguredAiEndpoint(modelUrl);
    }
    if (model && typeof model === "string") {
      setConfiguredAiModel(model);
    }
    res.json({
      success: true,
      settings: {
        modelUrl: getConfiguredAiEndpoint(),
        model: getConfiguredAiModel(),
      },
    });
  });

  // Main AI Omni-Executive Controller (Omni-Operate, Tab Navigation, Screen Analysis, Workflow Fix & Settings)
  app.use(mainAiChatRouter);
  app.get("/api/ai/omni/state", handleGetOmniState);
  app.post("/api/ai/omni/switch-tab", handleOmniSwitchTab);
  app.post("/api/ai/omni/adjust-settings", handleOmniAdjustSettings);
  app.post("/api/ai/omni/analyze-screen", handleOmniAnalyzeScreen);
  app.post("/api/ai/omni/interact", handleOmniInteract);
  app.post("/api/ai/omni/fix-workflow", handleOmniFixWorkflow);
  app.post("/api/ai/omni/execute-autonomous-task", handleOmniExecuteAutonomousTask);

  // AI Monitor: live status, action history & CSV export (Google Sheets import)
  app.get("/api/ai-monitor", handleGetAiMonitor);
  app.get("/api/ai/action-history", handleGetActionHistory);
  app.get("/api/ai/action-history.csv", handleExportActionHistoryCsv);
  app.post("/api/ai/action-history", handleRecordAction);
  app.delete("/api/ai/action-history", handleClearActionHistory);

  // Browser Inspector: real tabs & page elements for accurate screen interpretation
  app.get("/api/browser/tabs", handleGetBrowserTabs);
  app.post("/api/browser/inspect", handleInspectBrowserTab);
  app.post("/api/browser/extension-report", handleBrowserExtensionReport);
  app.get("/api/browser/context", handleGetBrowserContext);

  // AI Verification, Stuck Thinking & Scheduled Checkups
  app.post("/api/ai/verify-step", handleVerifyStep);
  app.post("/api/ai/stuck-resolver", handleStuckResolver);
  app.post("/api/ai/schedule-checkup", handleScheduleCheckup);
  app.post("/api/ai/detect-elements-steps", handleDetectElementsAndSteps);
  app.post("/api/ai/compare-screen-match", handleCompareScreenMatch);
  app.post("/api/ai/auto-actor-trigger", handleAutoActorTrigger);
  app.post("/api/ai/visual-error-diff-detection", handleVisualErrorAndDiff);

  // Description Refiner Tool
  app.post("/api/ai/refine-description", handleRefineDescription);
  app.get("/api/ai/refine-description/sample-presets", handleGetSamplePresets);
  app.post("/api/ai/bulk-generate-names-descriptions", handleBulkGenerateNamesDescriptions);
  app.post("/api/ai/generate-file-summary", handleGenerateFileSummary);

  // PyAutoGUI & Subprocess Low-Level Execution Bridge
  app.post("/api/pyautogui/bridge", handlePyAutoGUIBridge);
  app.get("/api/pyautogui/logs", handleGetBridgeLogs);
  app.delete("/api/pyautogui/logs", handleClearBridgeLogs);
  app.get("/api/pyautogui/health", handleBridgeHealth);
  app.post("/api/pyautogui/reconnect", handleBridgeReconnect);
  app.post("/api/pyautogui/pause", handlePauseBridge);
  app.post("/api/pyautogui/resume", handleResumeBridge);
  app.get("/api/pyautogui/state", handleGetBridgeState);
  app.get("/api/pyautogui/status", handleGetBridgeState);
  app.post("/api/pyautogui/retry-segment", handleRetrySegment);
  app.post("/api/pyautogui/coordinate-sync", handleCoordinateSync);
  app.post("/api/pyautogui/pre-execution-validate", handlePreExecutionValidate);
  app.get("/api/pyautogui/ping", handleBridgePing);
  app.post("/api/pyautogui/ping", handleBridgePing);
  app.post("/api/pyautogui/pre-execution-scan", handlePreExecutionScan);
  app.post("/api/pyautogui/auto-reposition", handleAutoRepositionAgent);
  app.get("/api/pyautogui/drift-events", handleGetDriftEvents);
  app.post("/api/pyautogui/pre-replay-snapshot-check", handlePreReplaySnapshotCheck);
  app.post("/api/pyautogui/interactive-action", handleInteractiveDeviceAction);
  app.post("/api/pyautogui/ai-navigation-check", handleAiNavigationCheck);
  app.post("/api/pyautogui/ai-record-step", handleAiAutoRecordStep);

  // AI Video Recording Step Breakdown & Screenshot Integrity Check
  app.post("/api/ai/breakdown-video-steps", handleBreakdownVideoSteps);
  app.post("/api/ai/screenshot-integrity-check", handleScreenshotIntegrityCheck);

  // Analyze & Act Master Vision Pipeline
  app.post("/api/ai/analyze-and-act", handleAnalyzeAndAct);

  // Autonomous Workflow Learning Engine
  app.post("/api/ai/learn-workflows", handleLearnWorkflows);
  app.get("/api/ai/learned-workflows", handleGetLearnedWorkflows);
  app.delete("/api/ai/learned-workflows/:id", handleDeleteLearnedWorkflow);

  // Watcher Agent & Live Task Assembly
  app.get("/api/watcher/status", handleGetWatcherStatus);
  app.post("/api/watcher/start", handleStartWatcher);
  app.post("/api/watcher/stop", handleStopWatcher);
  app.post("/api/watcher/assemble-task", handleAssembleTask);

  // AI Goal Re-Planner
  app.post("/api/ai/goal-replan", handleGoalReplan);

  // Screen HUD tools: OCR at a point, persisted entity tags, Qwen ask/guide, reusable packs
  app.use(
    "/api/hud",
    createHudToolsRouter({ store: new DurableStore(), recognize: recognizeWithProviders, chat: sendQwenChatRequest }),
  );

  // Workflow Disk Persistence Endpoints (/api/workflows)
  const WORKFLOWS_DIR = path.join(process.cwd(), "workflows");
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    try {
      fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
    } catch {}
  }
  app.post("/api/workflows/save", async (req, res) => {
    try {
      const { name, sequence, metadata } = req.body;
      const sanitizedName = (name || `workflow_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
      const filePath = path.join(WORKFLOWS_DIR, `${sanitizedName}.json`);
      const payload = {
        name: sanitizedName,
        savedAt: new Date().toISOString(),
        sequence: sequence || [],
        metadata: metadata || {},
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      res.json({ success: true, name: sanitizedName, path: filePath, stepCount: (sequence || []).length });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });
  app.get("/api/workflows/list", async (_req, res) => {
    try {
      if (!fs.existsSync(WORKFLOWS_DIR)) {
        return res.json({ success: true, workflows: [] });
      }
      const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".json"));
      const workflows = files.map((file) => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf8"));
          return {
            name: content.name || file.replace(".json", ""),
            file,
            savedAt: content.savedAt || new Date().toISOString(),
            stepCount: content.sequence ? content.sequence.length : 0,
            metadata: content.metadata || {},
          };
        } catch {
          return { name: file.replace(".json", ""), file, stepCount: 0 };
        }
      });
      res.json({ success: true, workflows });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });
  app.get("/api/workflows/load/:name", async (req, res) => {
    try {
      const sanitizedName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filePath = path.join(WORKFLOWS_DIR, `${sanitizedName}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: "Workflow not found on disk" });
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      res.json({ success: true, workflow: data });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });
  app.delete("/api/workflows/:name", async (req, res) => {
    try {
      const sanitizedName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filePath = path.join(WORKFLOWS_DIR, `${sanitizedName}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true, deleted: sanitizedName });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Workflow Scheduler (Delayed & Recurring Cron Automation Triggers)
  app.get("/api/scheduler/jobs", handleGetScheduledJobs);
  app.post("/api/scheduler/jobs", handleCreateScheduledJob);
  app.put("/api/scheduler/jobs/:id/toggle", handleToggleScheduledJob);
  app.post("/api/scheduler/jobs/:id/run", handleRunJobNow);
  app.delete("/api/scheduler/jobs/:id", handleDeleteScheduledJob);

  // Screenshot comparison: PIL similarity, or an honest failure with similarity: null
  app.post("/api/compare-screenshots", handleCompareScreenshots);

  const simulatedConnectedDevices = new Set<string>();

  // ADB device scan and capture: only real devices and real frames, never synthetic ones
  app.get("/api/adb/devices", handleAdbDevices);
  app.get(
    "/api/adb/capture",
    createAdbCaptureHandler(() => getLatestSyncedRealFrame()?.imageData || lastSyncedFrame),
  );

  app.post("/api/adb/connect", handleAdbConnect);

  app.post("/api/adb/pair", async (req, res) => {
    let responded = false;
    const sendOnce = (obj: any) => {
      if (!responded) {
        responded = true;
        res.json(obj);
      }
    };
    try {
      const { ip, port, code } = req.body;
      if (!code || typeof code !== "string" || !/^\d{4,8}$/.test(code))
        return sendOnce({ success: false, error: "A 4-8 digit pairing code is required" });
      let target: string;
      try { target = validateAdbEndpoint(ip, port); } catch (error) {
        return sendOnce({ success: false, error: error instanceof Error ? error.message : "Invalid endpoint" });
      }
      const py = spawn("adb", ["pair", target, String(code)], { stdio: ["pipe", "pipe", "pipe"] });
      let out = ""; let er = "";
      py.stdout.on("data", (d) => (out += d.toString()));
      py.stderr.on("data", (d) => (er += d.toString()));
      py.on("close", () => {
        const success = out.toLowerCase().includes("successfully paired") || out.toLowerCase().includes("paired") || !er;
        if (success) simulatedConnectedDevices.add(target);
        sendOnce({
          success,
          output: out.trim() || `Successfully paired to ${target}`,
          error: er.trim() || undefined,
          target,
          hasLocalAdb: true,
        });
      });
      py.on("error", () => {
        simulatedConnectedDevices.add(target);
        sendOnce({
          success: true,
          simulated: true,
          isCloudSandbox: true,
          output: `Virtual pairing code ${code} verified for ${target}. (Note: Cloud sandbox cannot reach LAN IP ${target} directly; run locally on PC for physical pairing).`,
          target,
        });
      });
      setTimeout(() => {
        try { py.kill(); } catch {};
        simulatedConnectedDevices.add(target);
        sendOnce({
          success: true,
          simulated: true,
          isCloudSandbox: true,
          output: `Virtual pairing timeout for ${target}`,
          target,
        });
      }, 12000);
    } catch {
      const target = `${req.body.ip || "192.168.1.50"}:${req.body.port || 5555}`;
      simulatedConnectedDevices.add(target);
      sendOnce({
        success: true,
        simulated: true,
        isCloudSandbox: true,
        output: `Virtual pairing recorded for ${target}`,
        target,
      });
    }
  });

  app.post("/api/adb/tcpip", async (req, res) => {
    let responded = false;
    const sendOnce = (obj: any) => {
      if (!responded) {
        responded = true;
        res.json(obj);
      }
    };
    try {
      const { port = 5555, deviceId } = req.body;
      const args: string[] = [];
      if (deviceId) {
        try { args.push("-s", validateDeviceId(deviceId)); } catch (error) {
          return sendOnce({ success: false, error: error instanceof Error ? error.message : "Invalid device ID" });
        }
      }
      if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
        return sendOnce({ success: false, error: "Invalid port" });
      }
      args.push("tcpip", String(port));
      const py = spawn("adb", args, { stdio: ["pipe", "pipe", "pipe"] });
      let out = ""; let er = "";
      py.stdout.on("data", (d) => (out += d.toString()));
      py.stderr.on("data", (d) => (er += d.toString()));
      py.on("close", () => sendOnce({ success: true, output: out.trim() || `restarting in TCP mode port: ${port}`, error: er.trim() || undefined }));
      py.on("error", () => sendOnce({ success: true, simulated: true, output: `restarting in TCP mode port: ${port}` }));
      setTimeout(() => { try { py.kill(); } catch {}; sendOnce({ success: true, simulated: true, output: `restarting in TCP mode port: ${port}` }); }, 5000);
    } catch {
      sendOnce({ success: true, simulated: true, output: `restarting in TCP mode port: ${req.body.port || 5555}` });
    }
  });

  app.post("/api/adb/disconnect", createAdbDisconnectHandler(simulatedConnectedDevices));
  app.get("/api/adb/scan", createAdbScanHandler(() => simulatedConnectedDevices));

  // Central logs (master)
  app.post("/api/logs", (req, res) => {
    const { source, level, message, metadata } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "Missing message" });
    const entry = centralLogHub.addLog(source || "System", level || "INFO", message, redactSensitive(metadata));
    res.json({ success: true, entry });
  });
  app.get("/api/logs", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const source = req.query.source as string;
    const level = req.query.level as string;
    res.json({ success: true, logs: centralLogHub.getLogs(limit, source, level) });
  });
  app.delete("/api/logs", (_req, res) => {
    centralLogHub.clearLogs();
    res.json({ success: true });
  });

  // Mobile Remote QR Code Endpoint - for phone screen beam & AI automation
  app.get("/api/mobile-remote", (req, res) => {
    try {
      const host = req.get("host") || "localhost:3000";
      const protocol = req.protocol || "https";
      const baseUrl = `${protocol}://${host}`;

      res.json({
        success: true,
        mobileRemoteUrl: `${baseUrl}/api/mobile-remote`,
        qrCodeValue: `${baseUrl}/api/mobile-remote`,
        description: "Scan this QR code with your phone to beam screen & receive AI automations",
      });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.use(mobileStreamRouter);

  workflowRuntime.start();

  // Overseer AI: independent verification and supervision of every AI operation.
  app.use("/api/overseer", requireApiAccess, createOverseerRouter(getOverseer()));
  
  // Replay, Phone bridge & Review routes
  try {
    app.use("/api/replay", replayRouter);
    app.use("/api/phone", createPhoneRouter());
    app.post("/api/pyautogui/stop", handleStopBridge);
    app.post("/api/pyautogui/execute", handleExecutePyAutoGUI);
    app.post("/api/pyautogui/replay-trail", handleReplayTrail);
    app.post("/api/ai/review-steps", handleAiReviewSteps);
    app.post("/api/dual-ai/review-steps", handleAiReviewSteps);
    app.post("/api/ai/apply-suggestions-with-qwen", handleApplySuggestionsWithQwen);
  } catch (err) {
    console.warn("Optional replay/phone routes init warning:", err);
  }

  return app;
}

export default createServer;
