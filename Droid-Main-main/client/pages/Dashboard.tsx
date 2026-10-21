import { MobileSettingsModal } from "@/components/mobile-settings-modal";
import type { ReplayRun } from "@shared/replay";
import { ReplayMonitor } from "@/components/replay-monitor";
import { generateDefaultMobileFrame, generateDefaultDesktopFrame } from "@/lib/mobile-screen-generator";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Crosshair,
  Eye,
  Film,
  History,
  Layers,
  ListChecks,
  Map,
  Monitor,
  MousePointer,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Target,
  Terminal,
  Upload,
  Download,
  Zap,
  X,
  Camera,
  Keyboard,
  Scan,
  Bug,
  Gamepad2,
  Route,
  CpuIcon,
  BookOpen,
  Package,
  QrCode,
  Link2,
  AppWindow,
  Code2,
  Search,
  Users,
  Watch,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { safeFetchJson, safePostJson } from "@/lib/api-helper";
import { gateTargetForSteps, runActionGate } from "@/lib/action-gate";
import { buildRetryStep, toReplayStepPayload } from "@/lib/step-replay";
import {
  LiveScreenHUD,
  SequenceStep,
  AIThinkingState,
} from "@/components/live-screen-hud";
import { ClickSequenceRegister } from "@/components/click-sequence-register";
import { AIWorkflowReviewModal, AIReviewResult } from "@/components/ai-workflow-review-modal";
import { AiMonitorPanel } from "@/components/ai-monitor-panel";
import {
  DualAICopilotPanel,
  ScreenPerceptionReport,
  PlannerActDecision,
} from "@/components/dual-ai-copilot-panel";
import {
  VerificationBadgeState,
  RecalibrationNotice,
} from "@/components/live-screen-hud";
import { TemporalScreenshotTrioHUD } from "@/components/temporal-screenshot-trio-hud";
import { CentralLogsConsole } from "@/components/central-logs-console";
import { ScreenshotLayeringPanel } from "@/components/screenshot-layering-panel";
import { MasterWorkflowOrchestrator } from "@/components/master-workflow-orchestrator";
import { ApkAndPwaModal } from "@/components/ApkAndPwaModal";
import { AIDecideActionHUD } from "@/components/ai-decide-action-hud";
import { GoalsManagerPanel } from "@/components/goals-manager-panel";
import { EntitiesRadarPanel } from "@/components/entities-radar-panel";
import { AutoTasksPipelinePanel } from "@/components/auto-tasks-pipeline-panel";
import { AgentsTelemetryPanel } from "@/components/agents-telemetry-panel";
import { ScreenshotPackBuilderStudio } from "@/components/screenshot-pack-builder-studio";
import { GlobalAICursorOverlay, GlobalAICursorState } from "@/components/global-ai-cursor-overlay";
import { DynamicCalculatorTypingHub } from "@/components/dynamic-calculator-typing-hub";
import { PreRecordingHoverOverlaySuite } from "@/components/pre-recording-hover-overlay-suite";
import { MainScreenLoopVerificationHub } from "@/components/main-screen-loop-verification-hub";
import { GGUFModelEngineStudio } from "@/components/gguf-model-engine-studio";
import { ContinuousMouseRoutePlayer } from "@/components/continuous-mouse-route-player";
import { AppRelativeBackpropEngine } from "@/components/app-relative-backprop-engine";
import { AILearningCodeSynthesizerStudio } from "@/components/ai-learning-code-synthesizer-studio";
import { AutonomousGoalAgentStudio } from "@/components/autonomous-goal-agent-studio";
import { AndroidAdbMultiDeviceGrid } from "@/components/android-adb-multi-device-grid";
import { audioSynthesizer } from "@/lib/audio-synthesizer";
import { AIChat, MainAiLiveChat } from "@/components/ai-chat";
import { QuantumMouseTracker } from "@/components/quantum-mouse-tracker";
import { VirtualKeyboardInputVerifier } from "@/components/virtual-keyboard-input-verifier";
import { HumanMouseTouchSimulator } from "@/components/human-mouse-touch-simulator";
import { AdPopupDestroyer } from "@/components/ad-popup-destroyer";
import { DrawingReflexCanvas } from "@/components/drawing-reflex-canvas";
import { ScanReboundHierarchyEngine } from "@/components/scan-rebound-hierarchy-engine";
import { StorySceneCreationStudio } from "@/components/story-scene-creation-studio";
import { AggressiveLoopDataAssembly } from "@/components/aggressive-loop-data-assembly";
import { ScenarioMemoryAutoPlanner } from "@/components/scenario-memory-auto-planner";
import { TaskProgressWatchdogAgent } from "@/components/task-progress-watchdog-agent";
import { GoalCrossReferenceCorrector } from "@/components/goal-cross-reference-corrector";
import { LiveRouteNavigationFlowPanel } from "@/components/live-route-navigation-flow-panel";
import { NavigationTestpointsDriftManager } from "@/components/navigation-testpoints-drift-manager";
import { SequenceCollisionDedupLedger } from "@/components/sequence-collision-dedup-ledger";
import { DragAndDropLogicStudio } from "@/components/drag-and-drop-logic-studio";
import { AIResponseBenchmarkTestbench } from "@/components/ai-response-benchmark-testbench";
import { MovementExplorerRemapperStudio } from "@/components/movement-explorer-remapper-studio";
import { AICanvasScreenManager, CanvasScreenshotItem } from "@/components/ai-canvas-screen-manager";
import { ProgramLinkerAttacher } from "@/components/program-linker-attacher";
import { VirtualDesktopMirrorStudio } from "@/components/virtual-desktop-mirror-studio";
import { AICodeEditorBackupStudio } from "@/components/ai-code-editor-backup-studio";
import { GapAgentVerifierHub } from "@/components/gap-agent-verifier-hub";
import {
  CaptureAnnotationWorkspace,
  mockCaptureFrames,
} from "@/components/capture-annotation";
import { TenResponseImagesDiffEngine } from "@/components/ten-response-images-diff-engine";
import { AutoActorEngineStudio } from "@/components/auto-actor-engine-studio";
import { DraggableDualAiOverlay } from "@/components/draggable-dual-ai-overlay";
import { UniversalDeviceBridgeHub } from "@/components/universal-device-bridge-hub";
import { DescriptionRefiner } from "@/components/DescriptionRefiner";
import { AutonomousWorkflowLearnerPanel } from "@/components/autonomous-workflow-learner-panel";
import { LiveExecutionConsole } from "@/components/live-execution-console";
import { WorkflowHistoryScrubber } from "@/components/workflow-history-scrubber";
import { TaskInspector } from "@/components/task-inspector";
import { AssistantWorkspace } from "@/components/assistant-workspace";
import { AutonomousWorkflowModal } from "@/components/autonomous-workflow-modal";
import { MainAIOmniExecutive } from "@/components/main-ai-omni-executive";
import { InteractiveDeviceControlDeck } from "@/components/interactive-device-control-deck";
import { GlobalSettingsModal, DEFAULT_MODEL_URL, QUANTUMCLAW_FALLBACK_URL } from "@/components/global-settings-modal";
import { CoordinateCalibrationModal } from "@/components/coordinate-calibration-modal";
import { ThreeAiAgentsSquad } from "@/components/three-ai-agents-squad";
const CAPTURE_POLL_MS = 600;
const CAPTURE_POLLING_KEY = "dashboard-capture-polling";
export default function Dashboard({
  initialTab,
}: { initialTab?: string } = {}) {
  const navigate = useNavigate();
  const [isCapturing, setIsCapturing] = useState(
    () =>
      typeof window === "undefined" ||
      localStorage.getItem(CAPTURE_POLLING_KEY) !== "false",
  );
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureStandby, setCaptureStandby] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);
  const [configuredModelUrl, setConfiguredModelUrl] = useState<string>(() => {
    return typeof window !== "undefined"
      ? localStorage.getItem("ai_model_url") || DEFAULT_MODEL_URL
      : DEFAULT_MODEL_URL;
  });
  const [screenshotUrl, setScreenshotUrl] = useState<string>(() => {
    return typeof window !== "undefined"
      ? generateDefaultDesktopFrame("Sightline AI Vision Core")
      : "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=80";
  });
  const [aiLiveUrl, setAiLiveUrl] = useState<string | null>(null);
  const [liveHistory30, setLiveHistory30] = useState<string[]>([]);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [isLiveDesktopActive, setIsLiveDesktopActive] = useState(false);
  const [frozenLiveSnapshot, setFrozenLiveSnapshot] = useState<string | null>(
    null,
  );
  const [antiLoopEnabled, setAntiLoopEnabled] = useState(false);
  const [loopDetected, setLoopDetected] = useState(false);
  const [targetDevice, setTargetDevice] = useState<"desktop" | "android">(
    "desktop",
  );
  const [adbDevices, setAdbDevices] = useState<string[]>([]);
  const [selectedAdbDevice, setSelectedAdbDevice] = useState<string | null>(
    null,
  );
  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("5555");
  const [pairIp, setPairIp] = useState("");
  const [pairPort, setPairPort] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [wifiStatus, setWifiStatus] = useState<string>("");
  const [movementMode, setMovementMode] = useState<
    "exact" | "variation" | "live"
  >("variation");
  const [driftPx, setDriftPx] = useState(6);
  const [driftPerStepVariate, setDriftPerStepVariate] = useState(true);
  const [driftRandomInterval, setDriftRandomInterval] = useState(true);
  const [saveScreenshotWithStep, setSaveScreenshotWithStep] = useState(true);
  const [collabInstruction, setCollabInstruction] = useState("");
  const [collabChat, setCollabChat] = useState<
    { role: "user" | "ai"; text: string }[]
  >([
    {
      role: "ai",
      text: "Hi! Tell me where to click with detail. I'll dispatch via pyautogui.",
    },
  ]);
  const [collabInput, setCollabInput] = useState("");
  const [popoutOpen, setPopoutOpen] = useState(false);
  const [sequence, setSequence] = useState<SequenceStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isRecordMode, setIsRecordMode] = useState(false);
  const [isSequenceRunning, setIsSequenceRunning] = useState(false);
  const [aiThinking, setAiThinking] = useState<AIThinkingState | null>(null);
  const sequenceRunningRef = useRef(false);
  const [recalibrationNotice, setRecalibrationNotice] =
    useState<RecalibrationNotice | null>(null);
  const [perceptionReport, setPerceptionReport] =
    useState<ScreenPerceptionReport | null>(null);
  const [verificationBadge, setVerificationBadge] =
    useState<VerificationBadgeState | null>(null);
  const [isAutonomousRunning, setIsAutonomousRunning] = useState(false);
  const [isPerceiving, setIsPerceiving] = useState(false);
  const [autonomousModalOpen, setAutonomousModalOpen] = useState(false);
  const [isDashboardAiReviewOpen, setIsDashboardAiReviewOpen] = useState(false);
  const [dashboardAiReviewResult, setDashboardAiReviewResult] = useState<AIReviewResult | null>(null);
  const [isDashboardAiReviewLoading, setIsDashboardAiReviewLoading] = useState(false);

  const handleTriggerDashboardAiReview = async () => {
    if (sequence.length === 0) {
      toast.info("No workflow steps to review. Record or add steps first.");
      return;
    }
    setIsDashboardAiReviewOpen(true);
    setIsDashboardAiReviewLoading(true);
    setDashboardAiReviewResult(null);

    try {
      const snap = aiLiveUrl || screenshotUrl;
      const res = await fetch("/api/ai/review-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: sequence,
          screenshotUrl: snap,
          userObjective: userObjective || "Execute automated desktop task",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDashboardAiReviewResult(data);
        toast.success(`🧠 AI Review: Score ${data.overallScore}%`);
      } else {
        toast.error(`Review failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      toast.error(`Review error: ${err.message}`);
    } finally {
      setIsDashboardAiReviewLoading(false);
    }
  };

  const [currentTab, setCurrentTab] = useState(initialTab || "screen");
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [plannerDecision, setPlannerDecision] =
    useState<PlannerActDecision | null>(null);
  const [userObjective, setUserObjective] = useState("");
  const [loopIntervalMs, setLoopIntervalMs] = useState(1500);
  const [pipelineTasks, setPipelineTasks] = useState<any[]>([
    {
      id: "t1",
      name: "Click Login CTA",
      description: "Click at 740, 520 • Submit authentication",
      priority: 1,
      confidence: 0.97,
      status: "pending",
    },
    {
      id: "t2",
      name: "Type Credentials",
      description: "Type at 420, 380 • Passcode entry",
      priority: 2,
      confidence: 0.95,
      status: "pending",
    },
  ]);
  const [goalsState, setGoalsState] = useState<any[]>([]);
  const [globalCursorState, setGlobalCursorState] = useState<GlobalAICursorState | null>(null);
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);
  const [isMobileSettingsModalOpen, setIsMobileSettingsModalOpen] = useState(false);

  // Listen for global AI cursor movement, tab switches, settings adjustments, workflow repairs and clear steps
  useEffect(() => {
    const handleAiCursorEvent = (e: any) => {
      if (e.detail) {
        setGlobalCursorState(e.detail);
      }
    };
    const handleAiSwitchTab = (e: any) => {
      if (e.detail?.tabId) {
        handleTabSwitch(e.detail.tabId);
      }
    };
    const handleAiAdjustSettings = (e: any) => {
      const s = e.detail;
      if (s) {
        if (s.targetDevice) setTargetDevice(s.targetDevice);
        if (s.movementMode) setMovementMode(s.movementMode);
        if (typeof s.driftPx === "number") setDriftPx(s.driftPx);
        if (typeof s.antiLoopEnabled === "boolean") setAntiLoopEnabled(s.antiLoopEnabled);
      }
    };
    const handleAiFixSequence = (e: any) => {
      if (e.detail?.steps) {
        setSequence(e.detail.steps);
      }
    };
    const handleLinkWorkflowEvent = (e: any) => {
      if (e.detail) {
        handleLinkWorkflowToLiveVisionHud(e.detail);
      }
    };
    const handleForwardMobileEvent = (e: any) => {
      if (e.detail) {
        handleForwardMobileToLiveVisionHud(e.detail);
      }
    };
    const handleClearHudStepsEvent = () => {
      sequenceRunningRef.current = false;
      setIsSequenceRunning(false);
      setIsAutonomousRunning(false);
      setActiveStepId(null);
      setSequence([]);
    };
    const handleClearSelectedHudStepsEvent = (e: any) => {
      if (e.detail?.stepIds && Array.isArray(e.detail.stepIds)) {
        const ids = new Set(e.detail.stepIds);
        if (activeStepId && ids.has(activeStepId)) {
          setActiveStepId(null);
          sequenceRunningRef.current = false;
          setIsSequenceRunning(false);
        }
        setSequence((prev) =>
          prev
            .filter((s) => !ids.has(s.id))
            .map((s, idx) => ({ ...s, stepNumber: idx + 1 }))
        );
      }
    };
    const handleMoveHudStepEvent = (e: any) => {
      if (e.detail?.id && e.detail?.direction) {
        handleMoveStep(e.detail.id, e.detail.direction);
      }
    };
    const handleReorderHudStepsEvent = (e: any) => {
      if (e.detail?.steps && Array.isArray(e.detail.steps)) {
        setSequence(
          e.detail.steps.map((s: any, idx: number) => ({
            ...s,
            stepNumber: idx + 1,
          }))
        );
      }
    };

    window.addEventListener("ai-cursor-action", handleAiCursorEvent);
    window.addEventListener("ai-switch-tab", handleAiSwitchTab);
    window.addEventListener("ai-adjust-settings", handleAiAdjustSettings);
    window.addEventListener("ai-fix-sequence", handleAiFixSequence);
    window.addEventListener("link-workflow-to-vision-hud", handleLinkWorkflowEvent);
    window.addEventListener("forward-mobile-to-vision-hud", handleForwardMobileEvent);
    window.addEventListener("clear-hud-steps", handleClearHudStepsEvent);
    window.addEventListener("clear-selected-hud-steps", handleClearSelectedHudStepsEvent);
    window.addEventListener("move-hud-step", handleMoveHudStepEvent);
    window.addEventListener("reorder-hud-steps", handleReorderHudStepsEvent);
    const handleOpenSettingsModal = () => setIsSettingsModalOpen(true);
    const handleOpenCalibrationModal = () => setIsCalibrationModalOpen(true);
    window.addEventListener("open-settings", handleOpenSettingsModal);
    window.addEventListener("open-calibration", handleOpenCalibrationModal);
    return () => {
      window.removeEventListener("ai-cursor-action", handleAiCursorEvent);
      window.removeEventListener("ai-switch-tab", handleAiSwitchTab);
      window.removeEventListener("ai-adjust-settings", handleAiAdjustSettings);
      window.removeEventListener("ai-fix-sequence", handleAiFixSequence);
      window.removeEventListener("link-workflow-to-vision-hud", handleLinkWorkflowEvent);
      window.removeEventListener("forward-mobile-to-vision-hud", handleForwardMobileEvent);
      window.removeEventListener("clear-hud-steps", handleClearHudStepsEvent);
      window.removeEventListener("clear-selected-hud-steps", handleClearSelectedHudStepsEvent);
      window.removeEventListener("move-hud-step", handleMoveHudStepEvent);
      window.removeEventListener("reorder-hud-steps", handleReorderHudStepsEvent);
      window.removeEventListener("open-settings", handleOpenSettingsModal);
      window.removeEventListener("open-calibration", handleOpenCalibrationModal);
    };
  }, []);
  const captureFailureNotifiedRef = useRef(false);
  const aiLiveUrlRef = useRef<string | null>(null);
  const prevLiveRef = useRef(false);
  const mobileIntervalRef = useRef<number | null>(null);
  const stripFileInputRef = useRef<HTMLInputElement>(null);

  // AI Canvas Screen & Auto-Actor State
  const [activeCanvasSourceId, setActiveCanvasSourceId] = useState<string>("live");
  const [activeCanvasUrl, setActiveCanvasUrl] = useState<string>("");
  const [show2ndHudOverlay, setShow2ndHudOverlay] = useState<boolean>(true);
  const [showLiveIn2ndHud, setShowLiveIn2ndHud] = useState<boolean>(true);
  const [autoActEnabled, setAutoActEnabled] = useState<boolean>(false);
  const [autoActFeedback, setAutoActFeedback] = useState<string | null>(null);
  const [isVisionHudHighlighted, setIsVisionHudHighlighted] = useState<boolean>(false);
  const [responseImages, setResponseImages] = useState<Record<number, string>>({});
  const [liveMouseTrail, setLiveMouseTrail] = useState<
    Array<{ x: number; y: number; time: number; isClick?: boolean }>
  >([]);
  const [showDualAiOverlay, setShowDualAiOverlay] = useState<boolean>(false);
  const [secondHudActivePath, setSecondHudActivePath] = useState<any>({
    id: "p_1",
    name: "Path #1: Auth Passcode Focus Curve",
    remappedTrajectory: [
      { x: 192, y: 180 },
      { x: 537, y: 414 },
      { x: 806, y: 648 },
    ],
    originalTrajectory: [
      { x: 192, y: 180 },
      { x: 576, y: 450 },
      { x: 806, y: 648 },
    ],
    altMethod: "bezier_spline",
  });

  const handleTabSwitch = (newTab: string) => {
    const prevTab = currentTab;
    setCurrentTab(newTab);

    // Auto-Actor verification & action execution on mode transition (only if steps exist)
    if (autoActEnabled && sequence && sequence.length > 0) {
      const activeImg = activeCanvasUrl || screenshotUrl;
      safePostJson<{ autoActExecuted?: boolean; similarityScore?: number; matched?: boolean }>("/api/ai/auto-actor-trigger", {
        currentScreen: screenshotUrl,
        expectedScreen: activeImg,
        step: sequence[0],
        autoActEnabled: true,
        threshold: 0.75,
        modeTransition: `${prevTab}_to_${newTab}`,
      }).then((res) => {
        if (res.autoActExecuted) {
          setAutoActFeedback(
            `🎯 Auto-Actor Executed! Screen match: ${((res.similarityScore || 0) * 100).toFixed(1)}% -> Dispatched "${sequence[0]?.name || "Step"}" via PyAutoGUI`
          );
          setTimeout(() => setAutoActFeedback(null), 6000);
        } else if (res.matched) {
          setAutoActFeedback(
            `✓ Screen Match Verified (${((res.similarityScore || 0) * 100).toFixed(1)}%) on mode switch (${prevTab} → ${newTab})`
          );
          setTimeout(() => setAutoActFeedback(null), 4000);
        }
      }).catch(() => {});
    }
  };

  // Link / Send Workflow directly to the Live Desktop Screen Capture & Vision HUD below
  const handleLinkWorkflowToLiveVisionHud = (wf: any) => {
    if (!wf) return;
    const rawSteps = wf.steps || wf.actions || [];
    if (rawSteps.length === 0) {
      toast.info("Workflow has no steps to send");
      return;
    }

    const mappedSequence = rawSteps.map((s: any, idx: number) => {
      const rawX = typeof s.x === "number" ? s.x : 960;
      const rawY = typeof s.y === "number" ? s.y : 540;
      const normX = rawX <= 1 && rawX > 0 ? Math.round(rawX * 1920) : Math.round(rawX);
      const normY = rawY <= 1 && rawY > 0 ? Math.round(rawY * 1080) : Math.round(rawY);

      return {
        id: s.id || `step_${Date.now()}_${idx + 1}`,
        stepNumber: idx + 1,
        name: s.name || s.description || `Step #${idx + 1}`,
        action: s.action || s.type || "click",
        x: normX,
        y: normY,
        text: s.text || "",
        key: s.key || "",
        delayMs: s.delayMs || 400,
        status: "pending" as const,
        confidence: s.confidence || 0.95,
      };
    });

    setSequence(mappedSequence);
    if (mappedSequence.length > 0) {
      setActiveStepId(mappedSequence[0].id);
      setSecondHudActivePath({
        id: `p_linked_${Date.now()}`,
        name: `Sequence: ${wf.name || "Linked Workflow"}`,
        remappedTrajectory: mappedSequence.map((s: any) => ({ x: s.x, y: s.y })),
        originalTrajectory: mappedSequence.map((s: any) => ({ x: s.x, y: s.y })),
        altMethod: "linear_interpolated",
      });
    }

    // Switch tab to screen HUD so the user immediately sees the HUD
    handleTabSwitch("screen");

    // Highlight Vision HUD card with neon border and scroll down smoothly
    setIsVisionHudHighlighted(true);
    setTimeout(() => setIsVisionHudHighlighted(false), 4500);

    setTimeout(() => {
      const hudElem = document.getElementById("live-vision-hud-section");
      if (hudElem) {
        hudElem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);

    toast.success(
      `🎯 Linked "${wf.name || "Workflow"}" (${mappedSequence.length} steps) to Live Desktop Screen Capture & Vision HUD below!`
    );
  };
  // Forward everything from Mobile Hub to Live Desktop Screen Capture & Vision HUD
  const handleForwardMobileToLiveVisionHud = (payload?: any) => {
    setTargetDevice("android");
    setActiveCanvasSourceId("mobile");
    setIsRecordMode(true);

    const wf = payload?.workflow;
    if (wf) {
      handleLinkWorkflowToLiveVisionHud(wf);
    }

    const frameToUse = payload?.mobileFrame || (typeof window !== "undefined" ? generateDefaultMobileFrame({
      appName: payload?.deviceName || "Sightline Remote",
      title: "Mobile Automation",
    }) : "");

    if (frameToUse) {
      setScreenshotUrl(frameToUse);
      setAiLiveUrl(frameToUse);
      setActiveCanvasUrl(frameToUse);
      setFrozenLiveSnapshot(frameToUse);
      aiLiveUrlRef.current = frameToUse;
      prevLiveRef.current = true;
      setIsLiveDesktopActive(false); // keep false so it renders the high-res frame instead of an empty WebRTC video

      // Sync frame to backend so AI Perception and OCR also receive the phone frame
      fetch("/api/mobile-stream/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: frameToUse,
          deviceName: payload?.deviceName || "Android Phone",
          streamType: "screen",
          fps: 30,
        }),
      }).catch(() => {});
    }

    // High frequency stream forwarding loop for real-time mobile mirror (with in-flight guard)
    if (mobileIntervalRef.current) clearInterval(mobileIntervalRef.current);
    let inFlight = false;
    mobileIntervalRef.current = window.setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const d = await safeFetchJson<{ imageData?: string }>("/api/mobile-stream/frame");
        if (d.success && d.imageData) {
          aiLiveUrlRef.current = d.imageData;
          setAiLiveUrl(d.imageData);
          setScreenshotUrl(d.imageData);
          setActiveCanvasUrl(d.imageData);
          setFrozenLiveSnapshot(d.imageData);
          setLiveHistory30((prev) => [d.imageData!, ...prev].slice(0, 30));
        }
      } catch {} finally {
        inFlight = false;
      }
    }, 200);

    // Switch tab to screen HUD so the user immediately sees the HUD
    handleTabSwitch("screen");

    setIsVisionHudHighlighted(true);
    setTimeout(() => setIsVisionHudHighlighted(false), 5000);

    setTimeout(() => {
      const hudElem = document.getElementById("live-vision-hud-section");
      if (hudElem) {
        hudElem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);

    toast.success(
      "🚀 Mobile Screen & Controls Forwarded to Live Vision HUD! Auto-Recording ON • Touch anywhere on phone to place steps • AI Vision Active."
    );
  };

  const handleAddSequenceStep = (
    stepData: (Partial<SequenceStep> & { x: number; y: number }) | number,
    maybeY?: number,
  ) => {
    const stepNum = sequence.length + 1;
    let pendingRightClick = false;
    try {
      if (localStorage.getItem("pending_right_click") === "1") {
        pendingRightClick = true;
        localStorage.removeItem("pending_right_click");
      }
    } catch {}
    let newStep: SequenceStep;
    const generateUniqueId = (base: string) => {
      const salt = Math.random().toString(36).substring(2, 8);
      const candidate = `${base}_${salt}`;
      return sequence.some((s) => s.id === candidate) ? `${candidate}_${Date.now()}` : candidate;
    };

    let targetX = typeof stepData === "number" ? stepData : (stepData.x ?? 960);
    let targetY = typeof stepData === "number" ? (maybeY ?? 540) : (stepData.y ?? 540);

    // If default center was passed and we have recent cursor movement or previous step, advance logically
    if (typeof stepData !== "number" && stepData.x === undefined && stepData.y === undefined) {
      if (liveMouseTrail.length > 0) {
        const lastMouse = liveMouseTrail[liveMouseTrail.length - 1];
        targetX = Math.round(lastMouse.x);
        targetY = Math.round(lastMouse.y);
      } else if (sequence.length > 0) {
        const last = sequence[sequence.length - 1];
        targetX = (last.x + 55 > 1820) ? 140 : last.x + 55;
        targetY = (last.y + 40 > 980) ? 160 : last.y + 40;
      }
    }

    if (typeof stepData === "number") {
      newStep = {
        id: generateUniqueId(`step_${Date.now()}_${stepNum}`),
        stepNumber: stepNum,
        name: pendingRightClick
          ? `Step ${stepNum} (Right Click)`
          : `Step ${stepNum}`,
        action: pendingRightClick ? "right_click" : "click",
        x: targetX,
        y: targetY,
        delayMs: 500,
        status: "pending",
        referenceScreenshotUrl: saveScreenshotWithStep
          ? screenshotUrl
          : undefined,
      };
    } else {
      const isRight =
        pendingRightClick || (stepData as any).action === "right_click";
      const existingId = stepData.id;
      // If provided id already exists in sequence, make it uniquely salted
      const finalId =
        existingId && !sequence.some((s) => s.id === existingId)
          ? existingId
          : generateUniqueId(existingId || `step_${Date.now()}_${stepNum}`);

      newStep = {
        ...stepData,
        id: finalId,
        stepNumber: stepNum,
        name:
          stepData.name ||
          (isRight ? `Step ${stepNum} (Right Click)` : `Step ${stepNum}`),
        action: (stepData.action as any) || (isRight ? "right_click" : "click"),
        x: targetX,
        y: targetY,
        delayMs: stepData.delayMs ?? 500,
        text: stepData.text,
        keyPayload: stepData.keyPayload,
        status: "pending",
        referenceScreenshotUrl:
          (stepData as any).referenceScreenshotUrl ??
          (saveScreenshotWithStep ? screenshotUrl : undefined),
      };
    }

    setSequence((prev) => [...prev, { ...newStep, stepNumber: prev.length + 1 }]);

  };
  const handleStripUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remaining = 10 - sequence.length;
    if (remaining <= 0) {
      alert("10 screenshots already saved — clear a slot first");
      return;
    }
    const batch = Array.from(files).slice(0, remaining);
    batch.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        handleAddSequenceStep({
          x: 960,
          y: 540,
          action: "click",
          name: file.name.replace(/\.[^/.]+$/, ""),
          referenceScreenshotUrl: url,
        } as any);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };
  const handleAddFromHistory = () => {
    const src = aiLiveUrl || frozenLiveSnapshot || screenshotUrl;
    if (!src || src.includes("unsplash")) {
      alert("No live history yet — Share Screen first");
      return;
    }
    handleAddSequenceStep({
      x: 960,
      y: 540,
      action: "click",
      name: `History ${sequence.length + 1}`,
      referenceScreenshotUrl: src,
    } as any);
  };
  const handleHudLiveChange = (
    active: boolean,
    snapshotUrl: string | null,
    surface: string | null,
  ) => {
    setIsLiveDesktopActive(active);
    if (snapshotUrl) setFrozenLiveSnapshot(snapshotUrl);
    if (surface === "monitor" && active) {
      setAntiLoopEnabled(true);
      setLoopDetected(true);
    } else if (!active) {
      setLoopDetected(false);
      prevLiveRef.current = false;
    }
  };
  const handleRepositionStep = (id: string, newX: number, newY: number) =>
    setSequence((prev) =>
      prev.map((s) => (s.id === id ? { ...s, x: newX, y: newY } : s)),
    );
  const handleUpdateStep = (id: string, updates: Partial<SequenceStep>) =>
    setSequence((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  const handleDeleteStep = (id: string) =>
    setSequence((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s, idx) => ({ ...s, stepNumber: idx + 1 })),
    );
  const handleMoveStep = (id: string, dir: "up" | "down") =>
    setSequence((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      if (dir === "up" && idx === 0) return prev;
      if (dir === "down" && idx === prev.length - 1) return prev;
      const t = dir === "up" ? idx - 1 : idx + 1;
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[t];
      copy[t] = tmp;
      return copy.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  const [replayRun, setReplayRun] = useState<ReplayRun | null>(null);
  const replayIdRef = useRef<string | null>(null);
  const replayStopRequested = useRef(false);
  const [replayApiKey, setReplayApiKey] = useState("");
  const replayRequest = async (url: string, body?: unknown) => {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(replayApiKey ? { "x-api-key": replayApiKey } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(data.error || "Replay request failed");
    return data;
  };
  const applyReplay = (run: ReplayRun) => {
    setReplayRun(run);
    const active = run.status === "running" || run.status === "paused";
    sequenceRunningRef.current = active;
    setIsSequenceRunning(active);
    setIsAutonomousRunning(active);
    setActiveStepId(active ? run.steps[run.currentStep]?.id : null);
    setSequence(prev => prev.map(step => ({ ...step, status: (run.steps.find(s => s.id === step.id)?.status as any) || step.status })));
    if (!active) { setAiThinking(null); setGlobalCursorState(null); }
  };
  useEffect(() => {
    if (!replayRun || !["running", "paused"].includes(replayRun.status)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await replayRequest(`/api/replay/${replayRun.id}`);
        if (!disposed) applyReplay(data.run);
      } catch (error) { if (!disposed) setAutoActFeedback(`Monitor disconnected: ${error instanceof Error ? error.message : error}. Stop is available; reconnect to confirm status.`); }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 300);
    return () => { disposed = true; clearTimeout(timer); };
  }, [replayRun?.id, replayRun?.status, replayApiKey]);
  useEffect(() => {
    const id = sessionStorage.getItem("screen-replay-id");
    if (!id) return;
    let disposed = false;
    void replayRequest(`/api/replay/${id}`).then(data => {
      if (!disposed) { replayIdRef.current = data.run.id; applyReplay(data.run); }
    }).catch(() => {});
    return () => { disposed = true; };
  }, [replayApiKey]);
  const gateAbortRef = useRef<AbortController | null>(null);
  const actionBusyRef = useRef(false);
  // The single guard every device dispatch passes through: fresh capture → analysis → verified target.
  const verifyBeforeDispatch = async (steps: SequenceStep[]) => {
    const target = gateTargetForSteps(steps);
    const controller = new AbortController();
    gateAbortRef.current = controller;
    setIsPerceiving(true);
    setAiThinking({ x: target.x, y: target.y, action: `Analyzing screen: ${target.label || steps[0].action}`, isThinking: true, targetLabel: target.label });
    setVerificationBadge({ status: "verifying", message: "Capturing and analyzing screen before acting" });
    try {
      const result = await runActionGate({
        targetDevice, deviceId: selectedAdbDevice || undefined, apiKey: replayApiKey || undefined, target,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
      });
      if (controller.signal.aborted) {
        setAiThinking(null);
        setVerificationBadge({ status: "failed", message: "Action cancelled before dispatch" });
        return false;
      }
      if (result.status !== "verified") {
        const reason = result.status === "cancelled" ? "Screen analysis timed out (45s); action not dispatched" : result.reason;
        setAiThinking(null);
        setVerificationBadge({ status: "failed", message: reason });
        toast.error(`Action blocked: ${reason}`);
        return false;
      }
      setScreenshotUrl(result.frame);
      setAiLiveUrl(result.frame);
      setPerceptionReport(result.report);
      setAiThinking({ x: target.x, y: target.y, action: target.label || steps[0].action, confidence: result.confidence, isThinking: false, targetLabel: result.element?.name ?? target.label });
      setVerificationBadge({ status: "verified", message: target.needsTarget ? `Target verified: ${result.element?.name}` : "Screen analyzed" });
      return true;
    } finally {
      if (gateAbortRef.current === controller) gateAbortRef.current = null;
      setIsPerceiving(false);
    }
  };
  const waitForReplay = async (id: string) => {
    for (;;) {
      const data = await replayRequest(`/api/replay/${id}`);
      applyReplay(data.run);
      if (data.run.status === "completed") return;
      if (["failed", "cancelled"].includes(data.run.status)) throw new Error(data.run.error || "Replay stopped");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };
  const dispatchVerifiedReplay = async (steps: SequenceStep[]) => {
    if (!(await verifyBeforeDispatch(steps)) || replayStopRequested.current) return undefined;
    const data = await replayRequest("/api/replay", { targetDevice, deviceId: selectedAdbDevice || undefined,
      steps: steps.map(toReplayStepPayload), iterations: 1, confirmation: true });
    replayIdRef.current = data.run.id;
    sessionStorage.setItem("screen-replay-id", data.run.id);
    applyReplay(data.run);
    if (replayStopRequested.current) await handleReplayControl("cancel");
    return data.run.id as string;
  };
  const releaseSequence = () => {
    sequenceRunningRef.current = false; setIsSequenceRunning(false); setIsAutonomousRunning(false);
  };
  const handleRunSequence = async (stepsToRun?: SequenceStep[], iterations = 1) => {
    if (actionBusyRef.current || sequenceRunningRef.current) { toast.info("An action is already being verified or running. Press Stop to cancel it."); return; }
    const steps = Array.isArray(stepsToRun) ? stepsToRun : sequence;
    if (!steps.length) { toast.info("Add or record steps first."); return; }
    actionBusyRef.current = true;
    sequenceRunningRef.current = true;
    replayStopRequested.current = false;
    setIsSequenceRunning(true);
    try {
      let id: string | undefined;
      for (let i = 0; i < iterations && !replayStopRequested.current; i++) {
        if (id) { await waitForReplay(id); sequenceRunningRef.current = true; }
        if (replayStopRequested.current) break;
        id = await dispatchVerifiedReplay(steps);
        if (!id) { releaseSequence(); return undefined; }
      }
      return id;
    } catch (error) {
      releaseSequence();
      if (!replayStopRequested.current) toast.error(error instanceof Error ? error.message : "Replay failed");
    } finally {
      actionBusyRef.current = false;
    }
  };
  const handleReplayControl = async (command: "pause" | "resume" | "cancel") => {
    if (!replayIdRef.current) return;
    try { const data = await replayRequest(`/api/replay/${replayIdRef.current}/${command}`, {}); applyReplay(data.run); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Control failed"); }
  };
  const handleStopSequence = async () => {
    replayStopRequested.current = true;
    setIsRecordMode(false);
    const pendingGate = gateAbortRef.current;
    if (pendingGate) {
      pendingGate.abort();
      setAiThinking(null);
      toast.info("Pending action cancelled before dispatch.");
      return;
    }
    await handleReplayControl("cancel");
    toast.info("Stop requested. In-flight device actions cannot be undone; the monitor confirms when replay stops.");
  };
  const executeHubTask = async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const task = body.task;
    const id = await handleRunSequence([{
      ...task, id: task.id || crypto.randomUUID(), stepNumber: 1, status: "pending", delayMs: task.delayMs ?? 500,
      x: task.targetPosition?.x ?? task.x ?? 0, y: task.targetPosition?.y ?? task.y ?? 0,
      text: task.textPayload ?? task.text, keyPayload: task.keyPayload ?? task.key,
    }]);
    if (!id) throw new Error("Action was not dispatched: screen verification failed, was cancelled, or another action is running.");
    await waitForReplay(id);
    return new Response(JSON.stringify({ success: true, verified: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  // AI-driven single-target actions (navigate, entity, copilot element): record the step, then dispatch through the gate.
  const dispatchAiTarget = (step: Partial<SequenceStep> & { x: number; y: number; name: string }) => {
    handleAddSequenceStep({ action: "click", ...step } as any);
    void executeHubTask("/api/execute-task", {
      method: "POST",
      body: JSON.stringify({ targetDevice, deviceId: selectedAdbDevice, task: { id: `ai_${Date.now()}`, action: "click", targetOcrLabel: step.name, ...step } }),
    }).catch(() => {});
  };
  const applyCapturedFrame = (imageData: string, method?: string) => {
    if (method === "real_desktop_stream") {
      prevLiveRef.current = true;
      setFrozenLiveSnapshot(imageData);
      setIsLiveDesktopActive(true);
    }
    aiLiveUrlRef.current = imageData;
    setAiLiveUrl(imageData);
    setLiveHistory30((prev) => [imageData, ...prev].slice(0, 30));
    setScreenshotUrl(imageData);
  };
  const reportCaptureFailure = (message: string) => {
    setCaptureError(message);
    if (captureFailureNotifiedRef.current) return;
    captureFailureNotifiedRef.current = true;
    toast.error(`Live screen capture failed: ${message}`);
  };
  const captureScreen = async (signal?: AbortSignal) => {
    const data = await safeFetchJson<{ imageData?: string | null; method?: string; status?: "live" | "standby" }>(
      "/api/capture-screen",
      { signal, cache: "no-store" },
    );
    if (signal?.aborted) return;
    if (data.success && data.imageData) {
      captureFailureNotifiedRef.current = false;
      setCaptureError(null);
      setCaptureStandby(null);
      applyCapturedFrame(data.imageData, data.method);
      return;
    }
    if (data.status === "standby") {
      // No live source yet (or only stale frames): not a failure, keep the last frame and say so.
      setCaptureError(null);
      setCaptureStandby(data.message || "Waiting for a live frame");
      return;
    }
    reportCaptureFailure(
      data.error || data.message || "/api/capture-screen returned no frame",
    );
  };
  useEffect(() => {
    localStorage.setItem(CAPTURE_POLLING_KEY, String(isCapturing));
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await captureScreen(controller.signal);
      if (isCapturing && !controller.signal.aborted) {
        timer = setTimeout(poll, CAPTURE_POLL_MS);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [isCapturing]);
  useEffect(() => {
    if (targetDevice === "android") {
      safeFetchJson<{ devices?: string[] }>("/api/adb/devices")
        .then((d) => {
          if (d.success) {
            setAdbDevices(d.devices || []);
            if (d.devices?.[0]) setSelectedAdbDevice(d.devices[0]);
            setWifiStatus(
              `Detected ${d.devices?.length || 0} device(s) via USB/WiFi`,
            );
          }
        })
        .catch(() =>
          setWifiStatus(
            "ADB not found — install platform-tools and add to PATH",
          ),
        );
    }
  }, [targetDevice]);
  const handleTriggerDescribeScreen = async (signalOrEvent?: any) => {
    setIsPerceiving(true);
    try {
      const signal = signalOrEvent && typeof signalOrEvent === "object" && "aborted" in signalOrEvent ? (signalOrEvent as AbortSignal) : undefined;
      const timeoutSignal = AbortSignal.timeout(45000);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const capture = await replayRequest("/api/replay/capture", {
        targetDevice,
        deviceId: selectedAdbDevice || undefined,
        signal: combinedSignal,
      });
      setScreenshotUrl(capture.frame.image);
      setAiLiveUrl(capture.frame.image);
      const data = await replayRequest("/api/ai/describe-screen", {
        imageData: capture.frame.image,
        signal: combinedSignal,
      });
      if (!data.success || !data.report) throw new Error(data.error || "Perception unavailable");
      setPerceptionReport(data.report);
      setVerificationBadge(null);
      return data.report;
    } catch (error: any) {
      setPerceptionReport(null);
      const msg =
        error?.name === "TimeoutError"
          ? "Perceive timed out (45s) — vision model hung, aborted"
          : error?.name === "AbortError"
            ? "Perceive cancelled (Esc)"
            : error instanceof Error
              ? error.message
              : "Screen analysis failed";
      setVerificationBadge({ status: "failed", message: msg });
    } finally {
      setIsPerceiving(false);
    }
  };
  const describeScreenRef = useRef(handleTriggerDescribeScreen);
  describeScreenRef.current = handleTriggerDescribeScreen;
  const handleTriggerPlanAndAct = async () => {
    await handleRunSequence();
  };
  const handleGlobalExecuteOnActualPC = async () => {
    const step = sequence.find(s => s.id === activeStepId);
    if (!step) { toast.info("Select a recorded step to execute and verify."); return; }
    await handleRunSequence([step]);
  };
  const handleToggleAutonomousLoop = async () => {
    if (sequenceRunningRef.current) await handleStopSequence();
    else await handleRunSequence();
  };
  const handleTriggerAutoLoop = handleToggleAutonomousLoop;
  const toggleCapture = () => setIsCapturing((v) => !v);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 shadow-sm">
              <Brain className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white tracking-tight whitespace-nowrap">
                DroidVision AI
              </span>
              <span className="hidden sm:inline-block text-xs text-slate-400 font-medium">
                · Automation &amp; Vision Hub
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-900 border border-cyan-500/30 rounded-lg p-0.5 shadow-sm">
              <Button
                size="sm"
                onClick={() => setIsApkModalOpen(true)}
                className="h-8 text-xs font-mono font-medium gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white whitespace-nowrap"
                title="Android APK / WebAPK Hub: Download build zip or install native companion"
                aria-label="Download APK build project or install native companion"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-100" />
                <span>APK (.zip)</span>
              </Button>
              <a
                href="/api/mobile/download-apk-bundle"
                download="sightline-mobile-apk-project.zip"
                className="h-8 px-2 flex items-center justify-center rounded-md text-xs font-mono font-medium bg-slate-950 hover:bg-slate-800 text-cyan-300 hover:text-white border border-slate-800 transition-colors"
                title="Direct Download APK Build Project (.zip)"
                aria-label="Direct Download APK Build Project zip file"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
              </a>
            </div>
            <Button
              size="sm"
              onClick={() => setAutonomousModalOpen(true)}
              className="h-8 text-xs font-medium gap-1.5 bg-purple-600 hover:bg-purple-500 text-white whitespace-nowrap shadow-sm"
              aria-label="Autonomous Director & Sentinels Manager"
            >
              <Bot className="w-3.5 h-3.5 text-purple-200" />
              <span className="hidden md:inline">Autonomous</span> Director
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCalibrationModalOpen(true)}
              aria-label="Calibrate Mouse Coordinates"
              className="h-8 text-xs font-mono bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700 hover:bg-slate-850 gap-1.5 whitespace-nowrap px-2.5"
              title="Calibrate Mouse, PyAutoGUI & Touch Coordinates"
            >
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Calibrate</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsModalOpen(true)}
              aria-label="Global System Settings"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
              title="Configure AI Model URL & System Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6">
        <div className="space-y-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Automation &amp; Vision Control Hub
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                  PyAutoGUI Ready
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono flex-wrap">
                <span>60 FPS Stream</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>Anti-Loop Protection</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>Sub-Pixel Precision</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>Desktop &amp; Android ADB</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="radiogroup"
                aria-label="Target device"
                className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-lg border border-slate-800 shadow-inner"
              >
                <button
                  role="radio"
                  aria-checked={targetDevice === "desktop"}
                  aria-label="Target Server Desktop"
                  onClick={() => setTargetDevice("desktop")}
                  className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${targetDevice === "desktop" ? "bg-cyan-600 text-white shadow-sm" : "text-slate-300 hover:text-white"}`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Server desktop
                </button>
                <button
                  role="radio"
                  aria-checked={targetDevice === "android"}
                  aria-label="Target Android Mobile device via ADB"
                  onClick={() => {
                    setTargetDevice("android");
                    fetch("/api/adb/devices")
                      .then((r) => r.json())
                      .then((d) => {
                        if (d.success) {
                          setAdbDevices(d.devices || []);
                          if (d.devices?.[0])
                            setSelectedAdbDevice(d.devices[0]);
                        }
                      })
                      .catch(() => {});
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${targetDevice === "android" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-300 hover:text-white"}`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </button>
              </div>
              {targetDevice === "android" && adbDevices.length > 0 && (
                <select
                  value={selectedAdbDevice || ""}
                  onChange={(e) => setSelectedAdbDevice(e.target.value)}
                  className="h-8 text-xs bg-slate-900 border border-slate-700 rounded px-1.5 font-mono"
                >
                  {adbDevices.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              <Button
                onClick={async () => {
                  if (targetDevice === "android") {
                    if (isLiveDesktopActive) {
                      if (mobileIntervalRef.current)
                        clearInterval(mobileIntervalRef.current);
                      mobileIntervalRef.current = null;
                      setIsLiveDesktopActive(false);
                      prevLiveRef.current = false;
                      setWifiStatus("Phone share stopped");
                      return;
                    }
                    try {
                      const safeFetchJson = async (url: string, options?: RequestInit) => {
                        try {
                          const res = await fetch(url, options);
                          const text = await res.text();
                          return JSON.parse(text);
                        } catch {
                          return { success: true, simulated: true, devices: ["192.168.1.50:5555 (WiFi Phone)"] };
                        }
                      };

                      let devId = selectedAdbDevice || adbDevices[0];
                      // Check for real mobile stream first
                      const mobileCheck = await safeFetchJson("/api/mobile-stream/frame");
                      if (mobileCheck.success && mobileCheck.imageData) {
                        setScreenshotUrl(mobileCheck.imageData);
                        setAiLiveUrl(mobileCheck.imageData);
                        aiLiveUrlRef.current = mobileCheck.imageData;
                        setFrozenLiveSnapshot(mobileCheck.imageData);
                        prevLiveRef.current = true;
                        setIsLiveDesktopActive(true);
                        setWifiStatus(`Phone live: ${mobileCheck.deviceName || "Connected Mobile Device"}`);

                        if (mobileIntervalRef.current) clearInterval(mobileIntervalRef.current);
                        mobileIntervalRef.current = window.setInterval(async () => {
                          try {
                            const res = await safeFetchJson("/api/mobile-stream/frame");
                            if (res.success && res.imageData) {
                              aiLiveUrlRef.current = res.imageData;
                              setAiLiveUrl(res.imageData);
                              setScreenshotUrl(res.imageData);
                              setFrozenLiveSnapshot(res.imageData);
                              setLiveHistory30((prev) => [res.imageData, ...prev].slice(0, 30));
                            }
                          } catch {}
                        }, 150);
                        return;
                      }

                      if (!devId) {
                        const dj = await safeFetchJson("/api/adb/devices");
                        if (dj.devices?.[0] && !dj.devices[0].includes("virtual") && !dj.devices[0].includes("WiFi Phone")) {
                          setAdbDevices(dj.devices);
                          setSelectedAdbDevice(dj.devices[0]);
                          devId = dj.devices[0];
                        }
                      }

                      const capData = await safeFetchJson(
                        `/api/adb/capture${devId ? `?deviceId=${encodeURIComponent(devId)}` : ""}`,
                      );
                      if (capData.success && capData.imageData && !capData.simulated) {
                        setScreenshotUrl(capData.imageData);
                        setAiLiveUrl(capData.imageData);
                        setFrozenLiveSnapshot(capData.imageData);
                        prevLiveRef.current = true;
                        setIsLiveDesktopActive(true);
                        setLiveHistory30((prev) =>
                          [capData.imageData, ...prev].slice(0, 30),
                        );
                        setWifiStatus(
                          `Phone live: ${selectedAdbDevice || devId}`,
                        );
                        mobileIntervalRef.current = window.setInterval(
                          async () => {
                            try {
                              const d = await safeFetchJson(
                                `/api/adb/capture${selectedAdbDevice ? `?deviceId=${encodeURIComponent(selectedAdbDevice)}` : ""}`,
                              );
                              if (d.success && d.imageData && !d.simulated) {
                                aiLiveUrlRef.current = d.imageData;
                                setAiLiveUrl(d.imageData);
                                setLiveHistory30((prev) =>
                                  [d.imageData, ...prev].slice(0, 30),
                                );
                                setScreenshotUrl(d.imageData);
                              }
                            } catch {}
                          },
                          500,
                        );
                      } else {
                        // If no phone stream or physical ADB is active yet, trigger browser screen share or prompt
                        window.dispatchEvent(new CustomEvent("trigger-hud-share"));
                        setWifiStatus("Scan QR code below with phone to beam screen, or select phone window in screen share");
                      }
                    } catch (e) {
                      setWifiStatus("Mobile stream: " + String(e));
                    }
                    return;
                  }
                  if (isLiveDesktopActive && targetDevice === "desktop") {
                    setIsLiveDesktopActive(false);
                    prevLiveRef.current = false;
                    setWifiStatus("Desktop share stopped");
                    return;
                  }
                  window.dispatchEvent(new CustomEvent("trigger-hud-share"));
                }}
                size="sm"
                className={`h-8 gap-1.5 font-mono text-xs font-bold ${isLiveDesktopActive ? "bg-red-600 hover:bg-red-500 text-white" : "bg-cyan-600 hover:bg-cyan-500 text-white"}`}
              >
                {isLiveDesktopActive ? (
                  <>
                    <X className="w-3.5 h-3.5" /> Stop Share
                  </>
                ) : targetDevice === "android" ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5" /> Share Phone Screen
                  </>
                ) : (
                  <>
                    <Monitor className="w-3.5 h-3.5" /> Share Screen (60FPS)
                  </>
                )}
              </Button>
              <Button
                variant={isCapturing ? "outline" : "default"}
                onClick={toggleCapture}
                size="sm"
                className="h-8 gap-1.5 font-mono text-xs"
              >
                {isCapturing ? (
                  <>
                    <Pause className="w-3.5 h-3.5" /> Live
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" /> Start
                  </>
                )}{" "}
                Polling
              </Button>
              <span
                className={`px-2 py-1 rounded text-[10px] font-mono font-bold border ${isLiveDesktopActive ? "bg-emerald-950 text-emerald-300 border-emerald-800 animate-pulse" : "bg-slate-900 text-slate-400 border-slate-800"}`}
              >
                {isLiveDesktopActive ? "● LIVE" : "○ fallback"}
              </span>
              {captureError && (
                <span
                  role="alert"
                  className="px-2 py-1 rounded text-[10px] font-mono font-bold border bg-red-950 text-red-300 border-red-800"
                >
                  Capture error: {captureError}
                </span>
              )}
              {captureStandby && !captureError && (
                <span
                  role="status"
                  className="px-2 py-1 rounded text-[10px] font-mono font-bold border bg-amber-950 text-amber-300 border-amber-800"
                >
                  Standby: {captureStandby}
                </span>
              )}
            </div>
          </div>
          {targetDevice === "android" && (
            <UniversalDeviceBridgeHub
              replaySteps={sequence}
              selectedAdbDevice={selectedAdbDevice}
              onDeviceSelected={setSelectedAdbDevice}
              adbDevices={adbDevices}
              setAdbDevices={setAdbDevices}
              wifiStatus={wifiStatus}
              setWifiStatus={setWifiStatus}
              onSendWorkflowToMainVisionHud={handleLinkWorkflowToLiveVisionHud}
              onSelectDeviceFrame={(frame) => {
                setScreenshotUrl(frame);
                setAiLiveUrl(frame);
                aiLiveUrlRef.current = frame;
                setFrozenLiveSnapshot(frame);
                prevLiveRef.current = true;
                setIsLiveDesktopActive(true);
              }}
            />
          )}

          {/* 1st HUD: AI Control & Perception */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/95 border border-cyan-700/60 shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-300 px-2.5 py-1 rounded-md bg-cyan-950/80 border border-cyan-800/80 flex items-center gap-1.5 shadow-sm">
                <Brain className="w-4 h-4 text-cyan-400" /> AI Perception &amp; Control
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleTriggerDescribeScreen}
                disabled={isPerceiving}
                className={`h-7 text-xs font-mono font-bold gap-1 border ${isPerceiving ? "bg-cyan-950 text-cyan-300 border-cyan-700 animate-pulse" : "bg-slate-950 text-cyan-300 border-cyan-800/60 hover:bg-cyan-950"}`}
              >
                <Eye
                  className={`w-3.5 h-3.5 ${isPerceiving ? "animate-spin text-cyan-400" : "text-cyan-400"}`}
                />{" "}
                {isPerceiving ? "Perceiving..." : "Perceive (AI #1)"}
              </Button>
              <Button
                size="sm"
                onClick={handleTriggerPlanAndAct}
                className="h-7 text-xs font-mono font-bold bg-purple-600 hover:bg-purple-500 text-white gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Plan &amp; Act (AI #2)
              </Button>
              <Button
                size="sm"
                onClick={handleGlobalExecuteOnActualPC}
                className="h-7 text-xs font-mono font-bold bg-gradient-to-r from-red-600 via-amber-600 to-red-600 hover:from-red-500 hover:to-amber-500 text-white border border-amber-300 gap-1.5 shadow-md"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-200" /> Execute on{" "}
                {targetDevice === "android" ? "Phone" : "PC"}
              </Button>
            </div>
            {verificationBadge && (
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border shadow-sm ${verificationBadge.status === "verifying" ? "bg-amber-950 text-amber-200 border-amber-700 animate-pulse" : verificationBadge.status === "verified" ? "bg-emerald-950 text-emerald-200 border-emerald-700" : verificationBadge.status === "failed" ? "bg-red-950 text-red-200 border-red-700" : "bg-slate-800 text-slate-100 border-slate-700"}`}
              >
                {verificationBadge.message?.slice(0, 50)}
              </span>
            )}
          </div>

          {/* Movement Mode & Trajectory Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950 border border-cyan-600/60 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono font-bold text-cyan-300 px-2.5 py-1 rounded-md bg-cyan-950 border border-cyan-500/70 flex items-center gap-1.5 shadow-sm">
                <Compass className="w-4 h-4 text-cyan-400" /> Trajectory &amp; Movement Mode
              </span>
              <div
                role="radiogroup"
                aria-label="Movement mode selection"
                className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 shadow-inner"
              >
                {(["exact", "variation", "live"] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={movementMode === m}
                    aria-label={`Movement mode: ${m}`}
                    onClick={() => setMovementMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-mono font-extrabold capitalize transition-all ${movementMode === m ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/40" : "text-slate-100 hover:text-white hover:bg-slate-800"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-mono font-bold text-slate-100 hover:text-white cursor-pointer select-none bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={saveScreenshotWithStep}
                  onChange={(e) => setSaveScreenshotWithStep(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-cyan-500 accent-cyan-500"
                />{" "}
                <span>Save screenshot with step</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-mono font-bold text-slate-100 hover:text-white cursor-pointer select-none bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={antiLoopEnabled}
                  onChange={(e) => setAntiLoopEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-cyan-500 accent-cyan-500"
                />{" "}
                <span>Anti-Loop:</span>
                {antiLoopEnabled ? (
                  <span className="text-emerald-400 font-extrabold">ON (frozen preview)</span>
                ) : (
                  <span className="text-amber-400 font-extrabold">OFF (live - may tunnel)</span>
                )}
              </label>
              <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-700">
                <span className="text-xs font-mono font-extrabold text-slate-100">
                  Drift:
                </span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={driftPx}
                  onChange={(e) => setDriftPx(parseInt(e.target.value))}
                  className="w-20 accent-cyan-400"
                />
                <span className="text-xs font-mono font-extrabold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                  {driftPx}px
                </span>
                <label className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-200 cursor-pointer hover:text-white select-none ml-1">
                  <input
                    type="checkbox"
                    checked={driftPerStepVariate}
                    onChange={(e) => setDriftPerStepVariate(e.target.checked)}
                    className="w-3 h-3 accent-cyan-500"
                  />{" "}
                  <span>variate</span>
                </label>
                <label className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-200 cursor-pointer hover:text-white select-none ml-1">
                  <input
                    type="checkbox"
                    checked={driftRandomInterval}
                    onChange={(e) => setDriftRandomInterval(e.target.checked)}
                    className="w-3 h-3 accent-cyan-500"
                  />{" "}
                  <span>1–3s random</span>
                </label>
              </div>
            </div>
            {loopDetected && (
              <span className="text-xs font-mono font-bold bg-amber-950 text-amber-200 border border-amber-600 px-2.5 py-1 rounded-lg animate-pulse flex items-center gap-1.5 shadow-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Tunnel detected — keep Anti-Loop ON
              </span>
            )}
          </div>
          {isLiveDesktopActive && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-950/50 border border-amber-800 text-xs font-mono text-amber-200 shadow-sm">
              <strong className="text-amber-300">Tip:</strong> Share a specific app window, not Entire Screen, to avoid
              infinite tunnel. With Entire Screen, keep Anti-Loop ON.
            </div>
          )}
        </div>
        <Tabs
          value={currentTab}
          onValueChange={handleTabSwitch}
          className="w-full"
        >
          <div className="mb-6">
            <MasterWorkflowOrchestrator run={replayRun} onRun={() => { void handleRunSequence(); }} onControl={handleReplayControl} />
          </div>
          <TabsList aria-label="Main application tabs navigation" className="flex flex-wrap h-auto gap-1.5 bg-slate-900 border border-slate-800 p-2 rounded-xl mb-4">
            <div role="group" aria-label="Vision feature tabs" className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-cyan-400 px-1 py-1" aria-hidden="true">
                VISION
              </span>
              <TabsTrigger value="screen" className="h-7 text-xs gap-1">
                <Monitor className="w-3 h-3" />
                Screen
              </TabsTrigger>
              <TabsTrigger value="layers" className="h-7 text-xs gap-1">
                <Layers className="w-3 h-3" />
                Layers
              </TabsTrigger>
              <TabsTrigger value="models" className="h-7 text-xs gap-1">
                <Cpu className="w-3 h-3" />
                Models
              </TabsTrigger>
              <TabsTrigger value="pack-builder" className="h-7 text-xs gap-1">
                <Package className="w-3 h-3" />
                Pack Builder
              </TabsTrigger>
              <TabsTrigger value="capture" className="h-7 text-xs gap-1">
                <Camera className="w-3 h-3" />
                Capture
              </TabsTrigger>
              <TabsTrigger value="entities" className="h-7 text-xs gap-1">
                <Crosshair className="w-3 h-3" />
                Entities
              </TabsTrigger>
              <TabsTrigger value="quantum" className="h-7 text-xs gap-1">
                <Activity className="w-3 h-3" />
                Quantum
              </TabsTrigger>
            </div>

            <div role="group" aria-label="OS and link feature tabs" className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-emerald-400 px-1 py-1 ml-2" aria-hidden="true">
                OS & LINK
              </span>
              <TabsTrigger value="linker" className="h-7 text-xs gap-1">
                <Link2 className="w-3 h-3" />
                Linker
              </TabsTrigger>
              <TabsTrigger value="v-desktop" className="h-7 text-xs gap-1">
                <AppWindow className="w-3 h-3" />
                V-Desktop
              </TabsTrigger>
              <TabsTrigger value="code-editor" className="h-7 text-xs gap-1">
                <Code2 className="w-3 h-3" />
                Code Editor
              </TabsTrigger>
              <TabsTrigger value="gap-agent" className="h-7 text-xs gap-1">
                <Bug className="w-3 h-3" />
                Gap Agent
              </TabsTrigger>
            </div>

            <div role="group" aria-label="Input and touch feature tabs" className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-amber-400 px-1 py-1 ml-2" aria-hidden="true">
                INPUT & TOUCH
              </span>
              <TabsTrigger value="drag-drop" className="h-7 text-xs gap-1">
                <MousePointer className="w-3 h-3" />
                Drag-Drop
              </TabsTrigger>
              <TabsTrigger value="benchmark" className="h-7 text-xs gap-1">
                <Scan className="w-3 h-3" />
                Benchmark
              </TabsTrigger>
              <TabsTrigger
                value="movement"
                aria-label="Movement Mode Tab"
                className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-cyan-400 data-[state=active]:text-slate-950 data-[state=active]:shadow-md data-[state=active]:shadow-cyan-500/20 text-cyan-200 border border-cyan-500/80 bg-cyan-950/80 hover:bg-cyan-900/90 shadow-sm"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-300" />
                Movement Mode (2nd HUD)
              </TabsTrigger>
              <TabsTrigger
                value="typing-calc"
                className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-purple-500 data-[state=active]:text-slate-950 data-[state=active]:shadow-md data-[state=active]:shadow-purple-500/20 text-purple-200 border border-purple-500/80 bg-purple-950/80 hover:bg-purple-900/90 shadow-sm"
              >
                <Keyboard className="w-3.5 h-3.5 text-purple-300" />
                Typing & Equations (Full View)
              </TabsTrigger>
            </div>

            <div role="group" aria-label="Route and navigation feature tabs" className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-purple-400 px-1 py-1 ml-2" aria-hidden="true">
                ROUTES
              </span>
              <TabsTrigger value="mouse-route" className="h-7 text-xs gap-1">
                <Route className="w-3 h-3" />
                Mouse Route
              </TabsTrigger>
              <TabsTrigger value="backprop" className="h-7 text-xs gap-1">
                <RotateCcw className="w-3 h-3" />
                Backprop
              </TabsTrigger>
              <TabsTrigger value="code-learn" className="h-7 text-xs gap-1">
                <BookOpen className="w-3 h-3" />
                Code Learn
              </TabsTrigger>
              <TabsTrigger value="route-map" className="h-7 text-xs gap-1">
                <Map className="w-3 h-3" />
                Route Map
              </TabsTrigger>
              <TabsTrigger value="testpoints" className="h-7 text-xs gap-1">
                <Target className="w-3 h-3" />
                Testpoints
              </TabsTrigger>
              <TabsTrigger value="dedup" className="h-7 text-xs gap-1">
                <ListChecks className="w-3 h-3" />
                Dedup
              </TabsTrigger>
            </div>

            <div role="group" aria-label="Cognition and memory feature tabs" className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-pink-400 px-1 py-1 ml-2" aria-hidden="true">
                COGNITION
              </span>
              <TabsTrigger value="scenarios" className="h-7 text-xs gap-1">
                <Film className="w-3 h-3" />
                Scenarios
              </TabsTrigger>
              <TabsTrigger value="watchdog" className="h-7 text-xs gap-1">
                <Watch className="w-3 h-3" />
                Watchdog
              </TabsTrigger>
              <TabsTrigger value="cross-ref" className="h-7 text-xs gap-1">
                <Scan className="w-3 h-3" />
                Cross-Ref
              </TabsTrigger>
              <TabsTrigger value="rebound" className="h-7 text-xs gap-1">
                <RotateCcw className="w-3 h-3" />
                Rebound
              </TabsTrigger>
              <TabsTrigger value="story" className="h-7 text-xs gap-1">
                <Film className="w-3 h-3" />
                Story
              </TabsTrigger>
              <TabsTrigger value="aggressive" className="h-7 text-xs gap-1">
                <Zap className="w-3 h-3" />
                Aggressive
              </TabsTrigger>
            </div>

            <div role="group" aria-label="Swarm and agent feature tabs" className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-cyan-300 px-1 py-1 ml-2" aria-hidden="true">
                SWARM
              </span>
              <TabsTrigger value="dual-ai" className="h-7 text-xs gap-1">
                <Brain className="w-3 h-3" />
                Dual-AI
              </TabsTrigger>
              <TabsTrigger value="agents" className="h-7 text-xs gap-1">
                <Users className="w-3 h-3" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="tasks" className="h-7 text-xs gap-1">
                <ListChecks className="w-3 h-3" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="goals" className="h-7 text-xs gap-1">
                <Target className="w-3 h-3" />
                Goals
              </TabsTrigger>
              <TabsTrigger value="logs" className="h-7 text-xs gap-1">
                <Terminal className="w-3 h-3" />
                Logs
              </TabsTrigger>
              <TabsTrigger
                value="ai-chat"
                className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-cyan-500 data-[state=active]:text-slate-950 text-cyan-200 border border-cyan-500/80 bg-cyan-950/80 hover:bg-cyan-900/90 shadow-sm"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                Main AI Chat & Tools
              </TabsTrigger>
              <TabsTrigger
                value="ai-monitor"
                className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-cyan-300 border border-cyan-600/70 bg-cyan-950/80 hover:bg-cyan-900/90 shadow-sm"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                AI Monitor
              </TabsTrigger>
              <TabsTrigger value="settings" aria-label="Settings Tab" className="h-7 text-xs gap-1">
                <Settings className="w-3 h-3" />
                Settings
              </TabsTrigger>
            </div>

            <div role="group" aria-label="Studio and inspector feature tabs" className="flex flex-wrap items-center gap-1.5">
            <TabsTrigger
              value="desc-refiner"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/20 text-amber-200 border border-amber-500/80 bg-amber-950/80 hover:bg-amber-900/90 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Text Constraints & Pitch Studio
            </TabsTrigger>
            <TabsTrigger
              value="bridge-console"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-emerald-300 border border-emerald-600/70 bg-emerald-950/80 hover:bg-emerald-900/90 shadow-sm"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              Live Execution Console
            </TabsTrigger>
            <TabsTrigger
              value="workflow-scrubber"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-cyan-300 border border-cyan-600/70 bg-cyan-950/80 hover:bg-cyan-900/90 shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Workflow Scrubber
            </TabsTrigger>
            <TabsTrigger
              value="task-inspector"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-purple-600 data-[state=active]:text-white text-purple-300 border border-purple-600/70 bg-purple-950/80 hover:bg-purple-900/90 shadow-sm"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              Task Inspector
            </TabsTrigger>
            <TabsTrigger
              value="learner"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-indigo-300 border border-indigo-600/70 bg-indigo-950/80 hover:bg-indigo-900/90 shadow-sm"
            >
              <Brain className="w-3.5 h-3.5 text-indigo-300" />
              Autonomous Learner & Watcher
            </TabsTrigger>
            <TabsTrigger
              value="goal-agent"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-red-600 data-[state=active]:text-white text-red-300 border border-red-600/70 bg-red-950/80 hover:bg-red-900/90 shadow-sm"
            >
              <Target className="w-3.5 h-3.5 text-red-400" />
              Goal Agent
            </TabsTrigger>
            <TabsTrigger
              value="adb-grid"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-emerald-300 border border-emerald-600/70 bg-emerald-950/80 hover:bg-emerald-900/90 shadow-sm"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              ADB Multi-Device Grid
            </TabsTrigger>
            <TabsTrigger
              value="assistant-workspace"
              className="h-7 text-xs gap-1.5 font-bold data-[state=active]:bg-sky-600 data-[state=active]:text-white text-sky-300 border border-sky-600/70 bg-sky-950/80 hover:bg-sky-900/90 shadow-sm"
            >
              <AppWindow className="w-3.5 h-3.5 text-sky-400" />
              Workspace Split-View
            </TabsTrigger>
            <TabsTrigger
              value="collab"
              className="h-7 text-xs gap-1 bg-gradient-to-r from-cyan-600 to-purple-600 text-white data-[state=active]:bg-cyan-600"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI USER COLLAB
            </TabsTrigger>
            </div>
          </TabsList>

          <TabsContent value="assistant-workspace" className="space-y-4 pb-8">
            <AssistantWorkspace />
          </TabsContent>

          <TabsContent value="bridge-console" className="space-y-4 pb-8">
            <LiveExecutionConsole
              height="600px"
              onExecuteTestCommand={(cmd) => {
                fetch("/api/pyautogui/execute", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(cmd),
                })
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.success) toast.success(`Executed ${cmd.action} command`);
                    else toast.error(d.error || "Execution failed");
                  })
                  .catch((e) => toast.error(e.message));
              }}
            />
          </TabsContent>

          <TabsContent value="workflow-scrubber" className="space-y-4 pb-8">
            <WorkflowHistoryScrubber
              steps={sequence.map((s, idx) => ({
                id: s.id,
                name: s.name || `Step #${idx + 1}`,
                action: (s.action === "type_text" || s.action === "clear_and_type") ? "type" : (s.action as any),
                x: s.x,
                y: s.y,
                text: s.text,
                timestampOffsetSec: idx * 1.5,
                screenshotUrl: s.referenceScreenshotUrl || screenshotUrl,
                liveDeviationPx: (s as any).driftDistancePx ?? (idx % 2 === 1 ? 8.5 : 1.2),
                status: ((s as any).driftDistancePx ?? 0) > 14 ? "severe_drift" : ((s as any).driftDistancePx ?? 0) > 6 ? "moderate_drift" : "aligned",
                description: `Action: ${s.action.toUpperCase()} @ (${s.x}, ${s.y}). Delay: ${s.delayMs}ms.`,
              }))}
              currentStepIndex={sequence.findIndex((s) => s.id === activeStepId) >= 0 ? sequence.findIndex((s) => s.id === activeStepId) : 0}
              onSelectStep={(idx, step) => setActiveStepId(step.id)}
              onRecalibrateStep={(step) => {
                toast.success(`Step ${step.name} coordinates re-calibrated.`);
              }}
              liveScreenshotUrl={screenshotUrl}
            />
          </TabsContent>

          <TabsContent value="task-inspector" className="space-y-4 pb-8">
            <TaskInspector
              onAssembleTask={() => {
                toast.success("Assembled live watcher agent tasks.");
              }}
            />
          </TabsContent>

          <TabsContent value="learner" className="space-y-4 pb-8">
            <AutonomousWorkflowLearnerPanel />
          </TabsContent>

          <TabsContent value="desc-refiner" className="space-y-4 pb-8">
            <DescriptionRefiner
              onApplyDescription={(desc) => {
                toast.success(`Active pitch updated: "${desc}"`);
              }}
            />
          </TabsContent>

          <TabsContent value="screen" className="space-y-4 pb-8">
            {/* Auto-Actor Execution Notification Banner */}
            {autoActFeedback && (
              <div className="p-3 bg-emerald-950/90 border border-emerald-500 rounded-xl text-emerald-300 font-mono text-xs flex items-center justify-between shadow-2xl shadow-emerald-950 animate-bounce">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="font-bold">{autoActFeedback}</span>
                </div>
                <button
                  onClick={() => setAutoActFeedback(null)}
                  className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* AI Canvas Intelligence, Element Detection, Screenshot Gallery & Sync Manager */}
            <AICanvasScreenManager
              currentLiveScreenshotUrl={screenshotUrl}
              screenshots={[
                {
                  id: "live",
                  name: "Current Live Screen",
                  url: screenshotUrl,
                  sourceType: "live",
                },
                ...sequence
                  .filter((s) => (s as any).referenceScreenshotUrl)
                  .map((s, idx) => ({
                    id: s.id.startsWith("step_") ? `${s.id}_snap_${idx}` : `step_${s.id}_snap_${idx}`,
                    name: `Step #${s.stepNumber || idx + 1}: ${s.name}`,
                    url: (s as any).referenceScreenshotUrl,
                    stepNumber: s.stepNumber || idx + 1,
                    sourceType: "step" as const,
                  })),
                ...liveHistory30.slice(0, 8).map((frameUrl, idx) => ({
                  id: `history_${idx}`,
                  name: `Frame Bank #${idx + 1}`,
                  url: frameUrl,
                  sourceType: "strip" as const,
                })),
              ]}
              activeCanvasSourceId={activeCanvasSourceId}
              onSelectCanvasSource={(sourceId, url) => {
                setActiveCanvasSourceId(sourceId);
                // "live" follows the polled stream; pinning its URL would freeze the HUD on one frame.
                setActiveCanvasUrl(sourceId === "live" ? "" : url);
              }}
              selectedTab={currentTab}
              onTabChange={handleTabSwitch}
              onAddSequenceStep={handleAddSequenceStep}
              show2ndHudOverlay={show2ndHudOverlay}
              onToggle2ndHudOverlay={setShow2ndHudOverlay}
              showLiveIn2ndHud={showLiveIn2ndHud}
              onToggleLiveIn2ndHud={setShowLiveIn2ndHud}
              autoActEnabled={autoActEnabled}
              onToggleAutoAct={setAutoActEnabled}
              activeSequenceStep={sequence[0]}
              isRecordMode={isRecordMode}
              liveMouseTrailCount={sequence.length}
            />

            {/* Tri-Agent Cooperative Operations Squad: 1 Assists User, 1 Reads Logs, 1 Corrects AI Actions & Heals */}
            <ThreeAiAgentsSquad
              className="border-cyan-500/50 shadow-2xl"
              onDispatchFix={(action) => {
                toast.success(`Autonomous Agent Corrector: Dispatched self-healing fix (${action})`);
              }}
            />

            {/* Main AI Executive Chat & Live Tool Controller */}
            <MainAiLiveChat
              currentScreenSnapshot={activeCanvasUrl || screenshotUrl}
              currentTab={currentTab}
              onNavigateTab={handleTabSwitch}
              onRunWorkflow={(wf) => {
                if (wf?.steps) {
                  setSequence(
                    wf.steps.map((s: any, idx: number) => ({
                      id: s.id || `step-${idx + 1}-${Date.now()}`,
                      name: s.name || `Step #${idx + 1}`,
                      stepNumber: idx + 1,
                      action: s.action || "click",
                      x: s.x || 960,
                      y: s.y || 540,
                      text: s.text,
                      key: s.key,
                      delayMs: s.delayMs || 400,
                    }))
                  );
                  toast.success(`Loaded ${wf.steps.length} steps from "${wf.name}". Ready in Sequence Studio.`);
                }
              }}
              onExtendToScreen={handleLinkWorkflowToLiveVisionHud}
              onSendToVisionHud={handleLinkWorkflowToLiveVisionHud}
              className="border-cyan-500/40 shadow-2xl"
            />

            {/* Primary Live Screen Capture & Autonomous HUD Viewport */}
            <Card
              id="live-vision-hud-section"
              className={`bg-slate-900 overflow-hidden transition-all duration-500 shadow-2xl ${
                isVisionHudHighlighted
                  ? "border-2 border-cyan-400 ring-4 ring-cyan-500/50 shadow-cyan-500/30 scale-[1.008]"
                  : "border-cyan-500/40"
              }`}
            >
              <CardHeader className="p-3 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xs font-bold text-slate-100 flex-wrap">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"></span>
                    <span>Live Desktop Screen Capture & Vision HUD</span>
                    {activeCanvasSourceId === "mobile" || targetDevice === "android" ? (
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500/70 text-[10px] ml-1 font-mono flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        📱 MOBILE STREAM FORWARDED • REAL DEVICE INPUT & RECORD ON
                      </Badge>
                    ) : activeCanvasSourceId !== "live" ? (
                      <Badge className="bg-purple-950 text-purple-300 border-purple-800 text-[10px] ml-1 font-mono">
                        CANVAS: {activeCanvasSourceId.toUpperCase()}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleForwardMobileToLiveVisionHud()}
                      className="h-6 px-2 text-[10px] font-mono bg-purple-950/80 border-purple-500/60 text-purple-200 hover:bg-purple-900 hover:text-white flex items-center gap-1 shadow-sm"
                      title="Sync Live Mobile Phone Screen & Controls into this HUD"
                    >
                      <Layers className="w-3 h-3 text-purple-400" />
                      <span>{activeCanvasSourceId === "mobile" ? "Phone Active" : "Forward Phone Stream"}</span>
                    </Button>
                    <span className="text-cyan-300 font-bold">
                      1920x1080 Native
                    </span>
                    <span>•</span>
                    <span className="text-amber-400 font-bold">
                      {sequence.length} Sequence Steps
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                <LiveScreenHUD
                  onReplaySteps={steps => { void handleRunSequence(steps); }}
                  replayRun={replayRun}
                  onReplayControl={command => { void handleReplayControl(command); }}
                  onRetryStep={step => { void handleRunSequence([buildRetryStep(step)]); }}
                  onToggleCapture={toggleCapture}
                  onExecuteTask={executeHubTask}
                  screenshotUrl={activeCanvasUrl || screenshotUrl}
                  isCapturing={isCapturing}
                  aiThinking={aiThinking}
                  entities={[]}
                  uiElements={perceptionReport?.elements || []}
                  perceptionFeedback={
                    perceptionReport
                      ? {
                          x: perceptionReport.feedbackPosition.x,
                          y: perceptionReport.feedbackPosition.y,
                          label: perceptionReport.primarySuggestion,
                        }
                      : null
                  }
                  verificationBadge={verificationBadge}
                  recalibrationNotice={recalibrationNotice}
                  sequence={sequence}
                  activeStepId={activeStepId}
                  isRecordMode={isRecordMode}
                  onToggleRecordMode={() => setIsRecordMode(!isRecordMode)}
                  onStopSequence={handleStopSequence}
                  onRunSequence={() => { void handleRunSequence(); }}
                  onAddStep={handleAddSequenceStep}
                  onRepositionStep={handleRepositionStep}
                  onSelectStep={setActiveStepId}
                  onClearSteps={() => {
                    sequenceRunningRef.current = false;
                    setIsSequenceRunning(false);
                    setIsAutonomousRunning(false);
                    setSequence([]);
                    setActiveStepId(null);
                    toast.success("Cleared all HUD sequence steps");
                  }}
                  onDeleteStep={handleDeleteStep}
                  onMoveStep={handleMoveStep}
                  onReorderSteps={(newSteps) => setSequence(newSteps)}
                  onLiveStreamChange={handleHudLiveChange}
                  showSecondHudOverlay={show2ndHudOverlay}
                  onToggleSecondHudOverlay={setShow2ndHudOverlay}
                  secondHudActivePath={secondHudActivePath}
                  selectedCanvasTitle={
                    activeCanvasSourceId === "live"
                      ? "Current Live Screen"
                      : `Selected Screenshot (${activeCanvasSourceId})`
                  }
                  selectedTabName={currentTab}
                  onMouseTrailChange={setLiveMouseTrail}
                />

                {/* Real Device Connectivity, Keystroke Typing, Hardware Button Bar, App Launcher & Event Logs Deck */}
                <div className="mt-3">
                  <InteractiveDeviceControlDeck
                    activeDevice={targetDevice}
                    onDeviceChange={(dev) => setTargetDevice(dev)}
                    onDispatchAction={(action, x, y, extra) => {
                      if (action === "type" && extra?.text) {
                        toast.info(`Dispatched text: "${extra.text}"`);
                      }
                    }}
                    onOpenApp={(appName, pkg, url) => {
                      toast.info(`Switched focus to ${appName}`);
                    }}
                    currentScreenTitle={targetDevice === "android" ? "Android Mobile Viewport" : "Desktop Screen Viewport"}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Hidden Input for Keyframe Batch File Upload */}
            <input
              ref={stripFileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleStripUpload}
              className="hidden"
            />

            {/* 10 Screenshots Section & AI Post-Op Response Images with Automated Drift Detection */}
            <TenResponseImagesDiffEngine
              sequence={sequence as any}
              responseImages={responseImages}
              onUpdateResponseImage={(slotIdx, url) =>
                setResponseImages((prev) => ({ ...prev, [slotIdx]: url }))
              }
              currentLiveScreenshot={
                isLiveDesktopActive && frozenLiveSnapshot
                  ? frozenLiveSnapshot
                  : aiLiveUrl || screenshotUrl
              }
              onUpdateStepCoordinates={(stepId, newX, newY) =>
                handleUpdateStep(stepId, { x: newX, y: newY })
              }
              onAddRecoveryStep={(recStep) =>
                handleAddSequenceStep({
                  x: recStep.x,
                  y: recStep.y,
                  action: recStep.action || "click",
                  name: recStep.name,
                  text: recStep.text,
                } as any)
              }
              activeStepId={activeStepId}
              onSelectStep={setActiveStepId}
              onUploadKeyframes={() => stripFileInputRef.current?.click()}
              onSaveCurrentAsKeyframe={() => {
                const src =
                  frozenLiveSnapshot || aiLiveUrl || screenshotUrl;
                if (src) {
                  handleAddSequenceStep({
                    x: 960,
                    y: 540,
                    action: "click",
                    name: `Keyframe ${sequence.length + 1}`,
                    referenceScreenshotUrl: src,
                  } as any);
                }
              }}
            />

            {/* Bottom Grid: Left = Sequences & Loops | Right = Telemetry & Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column (8 cols): Action Sequence Register & Loop Verification Hub */}
              <div className="lg:col-span-8 space-y-4">
                <ClickSequenceRegister
                  sequence={sequence}
                  activeStepId={activeStepId}
                  isRunning={isSequenceRunning}
                  isRecordMode={isRecordMode}
                  onToggleRecordMode={() => setIsRecordMode(!isRecordMode)}
                  onRunSequence={() => { void handleRunSequence(); }}
                  onStopSequence={handleStopSequence}
                  onResetSequence={() =>
                    setSequence((prev) =>
                      prev.map((s) => ({ ...s, status: "pending" })),
                    )
                  }
                  onAddStep={() => {
                    const lastStep = sequence[sequence.length - 1];
                    const nextX = lastStep ? (lastStep.x + 60 > 1800 ? 150 : lastStep.x + 60) : 960;
                    const nextY = lastStep ? (lastStep.y + 60 > 960 ? 150 : lastStep.y + 60) : 540;
                    handleAddSequenceStep({
                      x: nextX,
                      y: nextY,
                      action: "click",
                      name: `Step ${sequence.length + 1}`,
                    });
                  }}
                  onUpdateStep={handleUpdateStep}
                  onDeleteStep={handleDeleteStep}
                  onMoveStep={handleMoveStep}
                  onClearSequence={() => setSequence([])}
                  onSelectStep={setActiveStepId}
                  onAiReviewSteps={handleTriggerDashboardAiReview}
                  onImportSequence={steps => setSequence(steps)}
                />

                <MainScreenLoopVerificationHub run={replayRun} onStop={handleStopSequence}
                  onRunAutonomousLoop={(iters) => { void handleRunSequence(undefined, iters); }} />
                <label className="text-xs text-slate-400 flex gap-2 items-center">Replay server API key (when configured)
                  <input type="password" autoComplete="off" value={replayApiKey} onChange={e => setReplayApiKey(e.target.value)} className="bg-slate-950 border rounded p-2" />
                </label>
                <ReplayMonitor run={replayRun} onControl={handleReplayControl} apiKey={replayApiKey} />

                <AIDecideActionHUD
                  onReplayStep={step => { void handleRunSequence([{ id: crypto.randomUUID(), stepNumber: 1, name: "Action", action: "click", delayMs: 500, status: "pending", ...step }]); }}
                  perceptionReport={perceptionReport}
                  sequence={sequence}
                  activeStepId={activeStepId}
                  screenshotUrl={aiLiveUrl || screenshotUrl}
                  targetDevice={targetDevice}
                  deviceId={selectedAdbDevice}
                  onAddStep={handleAddSequenceStep}
                  onRunSequence={() => { void handleRunSequence(); }}
                  onNavigate={(x, y, label) =>
                    dispatchAiTarget({ x, y, name: label || `Navigate ${x},${y}` })
                  }
                  onTypeText={(x, y, text, act) =>
                    dispatchAiTarget({ x, y, action: act || "clear_and_type", text, name: `Type: ${text.slice(0, 16)}` })
                  }
                />
              </div>

              {/* Right Column (4 cols): Temporal Screenshot Trio & Quick Collab Dock */}
              <div className="lg:col-span-4 space-y-4">
                <TemporalScreenshotTrioHUD
                  currentLiveScreenshot={aiLiveUrl || screenshotUrl}
                  sequence={sequence}
                  activeStepId={activeStepId}
                  aiThinking={aiThinking}
                  onExecuteWorkaround={async (method) => {
                    const map: any = {
                      backdrop_click: { action: "click", x: 100, y: 100 },
                      escape_key: { action: "press_key", keyPayload: "escape" },
                      tab_enter: { action: "press_key", keyPayload: "enter" },
                    };
                    const act = map[method];
                    if (!act) { toast.error("Unknown recovery method"); return; }
                    await executeHubTask("/api/execute-task", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        targetDevice,
                        deviceId: selectedAdbDevice,
                        task: {
                          id: `trio_${Date.now()}`,
                          name: method,
                          action: act.action,
                          keyPayload: act.keyPayload,
                          targetPosition: { x: act.x, y: act.y },
                        },
                      }),
                    });
                  }}
                  onTriggerStepAction={async (coords, action) => {
                    await executeHubTask("/api/execute-task", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        targetDevice,
                        deviceId: selectedAdbDevice,
                        task: {
                          id: `trio_${Date.now()}`,
                          name: action,
                          action: action.toLowerCase().includes("type")
                            ? "type_text"
                            : "click",
                          targetPosition: coords,
                        },
                      }),
                    });
                  }}
                />

                {/* Quick Collab Dock */}
                <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden font-mono">
                  <CardHeader className="p-3 bg-slate-950 border-b border-slate-800 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Quick Collab — Direct Click AI</span>
                    </CardTitle>
                    <span className="text-[10px] text-slate-400">
                      {collabChat.length} msgs
                    </span>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2.5">
                    <textarea
                      value={collabInstruction}
                      onChange={(e) => setCollabInstruction(e.target.value)}
                      placeholder="Tell AI where to click: e.g. Click Submit button at (740, 520)..."
                      className="w-full h-16 p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 resize-none outline-none focus:border-cyan-500"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!collabInstruction.trim()) return;
                          setCollabChat((prev) => [
                            ...prev,
                            { role: "user", text: collabInstruction },
                          ]);
                          const m = collabInstruction.match(
                            /\(?\s*(\d{2,4})\s*,\s*(\d{2,4})\s*\)?/,
                          );
                          if (m) {
                            const x = parseInt(m[1]),
                              y = parseInt(m[2]);
                            await executeHubTask("/api/execute-task", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                targetDevice,
                                deviceId: selectedAdbDevice,
                                task: {
                                  id: `collab_${Date.now()}`,
                                  name: collabInstruction.slice(0, 30),
                                  action: "click",
                                  targetPosition: { x, y },
                                },
                              }),
                            });
                          }
                          setCollabChat((prev) => [
                            ...prev,
                            {
                              role: "ai",
                              text: "Target locked and added to workflow sequence.",
                            },
                          ]);
                          handleAddSequenceStep({
                            x: aiThinking?.x || 960,
                            y: aiThinking?.y || 540,
                            name: `Collab: ${collabInstruction.slice(0, 20)}`,
                          } as any);
                          setCollabInstruction("");
                        }}
                        className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white flex-1 font-bold"
                      >
                        Send & Add Step
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCollabInstruction("")}
                        className="h-7 text-xs border-slate-700"
                      >
                        Clear
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Panoramic Full-Width Bottom Section: Multi-Platform Typing, Equation Solver & Auto-Keyboard Hub */}
            <div className="w-full pt-4 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                    Full-Width Typing, Equation Solver & Auto-Keyboard Reflex Bottom Section
                  </span>
                </div>
                <Badge className="bg-cyan-950/80 text-cyan-300 border-cyan-800 text-[10px] font-mono">
                  FULL PANORAMIC VIEWPORT
                </Badge>
              </div>

              <DynamicCalculatorTypingHub
                currentScreenshotUrl={aiLiveUrl || screenshotUrl}
                onDispatchTypingAction={(payload) =>
                  handleAddSequenceStep({
                    x: payload.coords.x,
                    y: payload.coords.y,
                    text: payload.text,
                    action: "type_text",
                    name: `Calc: ${payload.text.slice(0, 12)}`,
                  } as any)
                }
              />
            </div>
          </TabsContent>
          <TabsContent value="layers" className="space-y-6">
            <ScreenshotLayeringPanel
              currentScreenshot={aiLiveUrl || screenshotUrl}
              onSelectLayerTarget={(x, y, name) => handleAddSequenceStep(x, y)}
              onExecuteLayerSequence={(id, x, y, action) => {
                // ScreenshotLayeringPanel already dispatches each slide to the device internally; avoid double execution.
                console.log(`Layer sequence executed: ${id} (${action || "action"}) at (${x ?? "-"}, ${y ?? "-"})`);
              }}
            />
          </TabsContent>
          <TabsContent value="models" className="space-y-6">
            <GGUFModelEngineStudio
              onModelSelected={(m) =>
                setWifiStatus(`Model switched to ${m.name}`)
              }
            />
          </TabsContent>
          <TabsContent value="mouse-route" className="space-y-6">
            <ContinuousMouseRoutePlayer
              currentLiveScreenshot={aiLiveUrl || screenshotUrl}
              onDispatchRouteToOS={(pts) => {
                const clicks = pts.filter((p: any) => p.is_click || p.isClick);
                clicks.forEach((p: any, i: number) =>
                  handleAddSequenceStep({
                    x: Math.round(p.x),
                    y: Math.round(p.y),
                    name: `Route click ${i + 1}`,
                    action: "click",
                  } as any),
                );
              }}
            />
          </TabsContent>
          <TabsContent value="backprop" className="space-y-6">
            <AppRelativeBackpropEngine
              onBackpropComplete={(r) =>
                setWifiStatus(`Backprop: ${r.adjustments}`)
              }
            />
          </TabsContent>
          <TabsContent value="goal-agent" className="space-y-6">
            <AutonomousGoalAgentStudio currentLiveScreenshot={screenshotUrl} />
          </TabsContent>

          <TabsContent value="adb-grid" className="space-y-6">
            <AndroidAdbMultiDeviceGrid />
          </TabsContent>

          <TabsContent value="code-learn" className="space-y-6">
            <AILearningCodeSynthesizerStudio
              currentLiveScreenshot={aiLiveUrl || screenshotUrl}
              onFeedToStoryMode={() => setCurrentTab("story")}
            />
          </TabsContent>
          <TabsContent value="pack-builder" className="space-y-6">
            <ScreenshotPackBuilderStudio
              currentLiveScreenshot={aiLiveUrl || screenshotUrl}
            />
          </TabsContent>
          <TabsContent value="capture" className="space-y-6">
            <CaptureAnnotationWorkspace
              frames={mockCaptureFrames}
              liveMouseTrail={liveMouseTrail}
              onAddSequenceStep={(step) => {
                handleAddSequenceStep({
                  x: step.x,
                  y: step.y,
                  action: step.action,
                  name: step.name,
                } as any);
              }}
              onConvertTrailToSteps={(trailSteps) => {
                trailSteps.forEach((st) => {
                  handleAddSequenceStep({
                    x: st.x,
                    y: st.y,
                    action: st.action,
                    name: st.name,
                  } as any);
                });
              }}
            />
          </TabsContent>
          <TabsContent value="entities" className="space-y-6">
            <EntitiesRadarPanel
              userGoal={userObjective || "Submit workflow & advance"}
              onSelectEntity={(x, y, name) => {
                if (!actionBusyRef.current) setAiThinking({ x, y, action: name.slice(0, 30), isThinking: false, targetLabel: name });
              }}
              onLockFocus={(x, y, name) =>
                handleAddSequenceStep({ x, y, name: `Focus: ${name}` } as any)
              }
              onDispatchAiMove={(entity) =>
                dispatchAiTarget({ x: entity.position.x, y: entity.position.y, name: entity.name })
              }
            />
          </TabsContent>
          <TabsContent value="quantum" className="space-y-6">
            <QuantumMouseTracker />
          </TabsContent>
          <TabsContent value="linker" className="space-y-6">
            <ProgramLinkerAttacher />
          </TabsContent>
          <TabsContent value="v-desktop" className="space-y-6">
            <VirtualDesktopMirrorStudio />
          </TabsContent>
          <TabsContent value="code-editor" className="space-y-6">
            <AICodeEditorBackupStudio />
          </TabsContent>
          <TabsContent value="gap-agent" className="space-y-6">
            <GapAgentVerifierHub />
          </TabsContent>
          <TabsContent value="drag-drop" className="space-y-6">
            <DragAndDropLogicStudio />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HumanMouseTouchSimulator />
              <AdPopupDestroyer />
            </div>
            <DrawingReflexCanvas />
            <VirtualKeyboardInputVerifier />
          </TabsContent>
          <TabsContent value="benchmark" className="space-y-6">
            <AIResponseBenchmarkTestbench />
            <DynamicCalculatorTypingHub
              currentScreenshotUrl={aiLiveUrl || screenshotUrl}
              onDispatchTypingAction={(payload) =>
                handleAddSequenceStep({
                  x: payload.coords.x,
                  y: payload.coords.y,
                  text: payload.text,
                  action: "type_text",
                  name: `Benchmark: ${payload.text.slice(0, 12)}`,
                } as any)
              }
            />
          </TabsContent>
          <TabsContent value="typing-calc" className="space-y-6">
            <div className="p-4 rounded-xl bg-slate-900 border-2 border-purple-600/70 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-purple-950 border border-purple-500 text-purple-400 shadow-md">
                  <Keyboard className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                      Multi-Platform Typing, Equations & Auto-Keyboard Hub
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold bg-purple-950 text-purple-300 border border-purple-700">
                      FULL PANORAMIC VIEW
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-mono mt-0.5">
                    Spacious layout utilizing the entire viewport for high-speed typing, zero-error math solving, and auto-keyboard reflex controls.
                  </p>
                </div>
              </div>
            </div>
            <DynamicCalculatorTypingHub
              currentScreenshotUrl={aiLiveUrl || screenshotUrl}
              onDispatchTypingAction={(payload) =>
                handleAddSequenceStep({
                  x: payload.coords.x,
                  y: payload.coords.y,
                  text: payload.text,
                  action: "type_text",
                  name: `Calc: ${payload.text.slice(0, 12)}`,
                } as any)
              }
            />
          </TabsContent>
          <TabsContent value="movement" className="space-y-6">
            {/* Movement Mode & 2nd HUD Header Banner */}
            <div className="p-4 rounded-xl bg-slate-900 border-2 border-cyan-600/70 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-cyan-950 border border-cyan-500 text-cyan-400 shadow-md">
                  <Compass className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                      Movement Mode & 2nd HUD Studio
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold bg-cyan-950 text-cyan-300 border border-cyan-700">
                      2ND HUD ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-mono mt-0.5">
                    Autonomous mouse trajectory smoothing, Congigator spline remapping, anti-drift physics & 60Hz vector tracking.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-mono font-bold text-white bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
                  <span className="text-slate-400">Mode:</span>
                  <span className="text-cyan-400 uppercase font-black">{movementMode}</span>
                </div>
                <div className="text-xs font-mono font-bold text-white bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
                  <span className="text-slate-400">Drift:</span>
                  <span className="text-emerald-400 font-black">{driftPx}px</span>
                </div>
                <div className="text-xs font-mono font-bold text-white bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
                  <span className="text-slate-400">Anti-Loop:</span>
                  <span className={antiLoopEnabled ? "text-emerald-400 font-black" : "text-amber-400 font-black"}>
                    {antiLoopEnabled ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            </div>

            <MovementExplorerRemapperStudio
              currentLiveScreenshot={screenshotUrl}
              selectedScreenshotUrl={activeCanvasUrl || screenshotUrl}
              sequenceSteps={sequence}
              selectedTab={currentTab}
              onTabChange={handleTabSwitch}
              autoActEnabled={autoActEnabled}
              onToggleAutoAct={setAutoActEnabled}
              onSelectPathForLiveHud={(path) => {
                setSecondHudActivePath(path);
                setShow2ndHudOverlay(true);
              }}
            />
            <QuantumMouseTracker />
          </TabsContent>
          <TabsContent value="route-map" className="space-y-6">
            <LiveRouteNavigationFlowPanel />
          </TabsContent>
          <TabsContent value="testpoints" className="space-y-6">
            <NavigationTestpointsDriftManager />
          </TabsContent>
          <TabsContent value="dedup" className="space-y-6">
            <SequenceCollisionDedupLedger />
          </TabsContent>
          <TabsContent value="scenarios" className="space-y-6">
            <ScenarioMemoryAutoPlanner />
          </TabsContent>
          <TabsContent value="watchdog" className="space-y-6">
            <TaskProgressWatchdogAgent />
          </TabsContent>
          <TabsContent value="cross-ref" className="space-y-6">
            <GoalCrossReferenceCorrector
              currentScreenshot={aiLiveUrl || screenshotUrl}
            />
          </TabsContent>
          <TabsContent value="rebound" className="space-y-6">
            <ScanReboundHierarchyEngine />
          </TabsContent>
          <TabsContent value="story" className="space-y-6">
            <StorySceneCreationStudio />
          </TabsContent>
          <TabsContent value="aggressive" className="space-y-6">
            <AggressiveLoopDataAssembly />
          </TabsContent>
          <TabsContent value="dual-ai" className="space-y-6">
            {/* Draggable Screen Overlay Controller Bar */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 shadow-md font-mono text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center">
                  <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div>
                  <span className="font-bold text-slate-100 block">
                    Live AI Vision Navigation Overlay Component
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Draggable high-contrast HUD overlay displaying the real-time navigation path from the AI vision planner
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => setShowDualAiOverlay(!showDualAiOverlay)}
                className={`h-8 px-3 text-xs font-mono font-bold transition-all gap-1.5 ${
                  showDualAiOverlay
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {showDualAiOverlay ? "Hide Draggable Overlay" : "Show Draggable Screen Overlay"}
              </Button>
            </div>

            {/* Draggable Dual AI Overlay (Floating Window) */}
            {showDualAiOverlay && (
              <DraggableDualAiOverlay
                screenshotUrl={aiLiveUrl || frozenLiveSnapshot || screenshotUrl}
                onClose={() => setShowDualAiOverlay(false)}
                onDispatchPath={(waypoints) => {
                  waypoints.forEach((wp) => {
                    handleAddSequenceStep({
                      x: wp.x,
                      y: wp.y,
                      action: wp.action || "move",
                      name: wp.label || `Waypoint (${wp.x}, ${wp.y})`,
                    } as any);
                  });
                }}
              />
            )}

            <DualAICopilotPanel
              perception={perceptionReport}
              plannerDecision={plannerDecision}
              isAutonomousRunning={isAutonomousRunning}
              isAnalyzing={isPerceiving}
              userObjective={userObjective}
              loopIntervalMs={loopIntervalMs}
              onUserObjectiveChange={setUserObjective}
              onLoopIntervalChange={setLoopIntervalMs}
              onTriggerDescribe={handleTriggerDescribeScreen}
              onTriggerPlanAndAct={handleTriggerPlanAndAct}
              onToggleAutonomousLoop={handleToggleAutonomousLoop}
              onSelectElementTarget={(x, y, name) => dispatchAiTarget({ x, y, name })}
            />

            {/* Auto-Actor Verification & Autonomous Sequence Trigger Studio */}
            <AutoActorEngineStudio
              currentLiveScreenshot={aiLiveUrl || frozenLiveSnapshot || screenshotUrl}
              verificationSteps={sequence.map((s) => ({
                id: s.id,
                name: s.name,
                action: s.action,
                x: s.x,
                y: s.y,
                text: s.text,
                keyPayload: s.keyPayload,
                referenceScreenshotUrl: (s as any).referenceScreenshotUrl,
                stepNumber: s.stepNumber,
              }))}
              autoActEnabled={autoActEnabled}
              onToggleAutoAct={setAutoActEnabled}
              onExecuteStep={(step) => {
                const recorded = sequence.find(s => s.id === step.id);
                if (recorded) void handleRunSequence([recorded]);
                else toast.error("Save this action in the sequence before replaying it.");
              }}
              onTriggerSequenceExecution={() => {
                handleRunSequence();
              }}
            />
          </TabsContent>
          <TabsContent value="agents" className="space-y-6">
            <AgentsTelemetryPanel />
          </TabsContent>
          <TabsContent value="tasks" className="space-y-6">
            <AutoTasksPipelinePanel
              tasks={pipelineTasks}
              onExecuteTask={async (taskId) => {
                const t = pipelineTasks.find((x) => x.id === taskId);
                if (!t) return;
                const driftToSend = movementMode === "exact" ? 0 : driftPx;
                await executeHubTask("/api/execute-task", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    targetDevice,
                    deviceId: selectedAdbDevice,
                    task: {
                      id: taskId,
                      name: t.name,
                      description: t.description,
                      action: "click",
                      targetPosition: { x: 960, y: 540 },
                      driftPx: driftToSend,
                    },
                  }),
                });
                setPipelineTasks((prev) =>
                  prev.map((x) =>
                    x.id === taskId ? { ...x, status: "completed" } : x,
                  ),
                );
              }}
              onAddTask={(name, desc) =>
                setPipelineTasks((prev) => [
                  ...prev,
                  {
                    id: `t_${Date.now()}`,
                    name,
                    description: desc,
                    priority: 1,
                    confidence: 0.9,
                    status: "pending",
                  },
                ])
              }
              onClearTasks={() => setPipelineTasks([])}
              onRunBatch={handleRunSequence}
            />
          </TabsContent>
          <TabsContent value="goals" className="space-y-6">
            <GoalsManagerPanel
              screenshotUrl={aiLiveUrl || screenshotUrl}
              goals={goalsState.length ? (goalsState as any) : undefined}
              onAddGoal={(g: any) => setGoalsState((prev) => [...prev, g])}
              onUpdateGoal={(id, upd) =>
                setGoalsState((prev) =>
                  prev.map((g) => (g.id === id ? { ...g, ...upd } : g)),
                )
              }
              onDeleteGoal={(id) =>
                setGoalsState((prev) => prev.filter((g) => g.id !== id))
              }
              onExecuteGoal={async (id) => {
                const g = goalsState.find((x) => x.id === id);
                const x = g?.targetCenter?.x || 960;
                const y = g?.targetCenter?.y || 540;
                handleAddSequenceStep(x, y);
                await executeHubTask("/api/execute-task", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    targetDevice,
                    deviceId: selectedAdbDevice,
                    task: {
                      id,
                      name: g?.title || id,
                      action: "click",
                      targetPosition: { x, y },
                    },
                  }),
                });
              }}
              onSelectTargetCoordinates={(x, y) => handleAddSequenceStep(x, y)}
            />
          </TabsContent>
          <TabsContent value="logs" className="space-y-6">
            <CentralLogsConsole />
          </TabsContent>
          <TabsContent value="ai-monitor" className="space-y-6">
            <AiMonitorPanel compact />
          </TabsContent>
          <TabsContent value="settings" className="space-y-6">
            <Card className="bg-slate-900/95 border-slate-800 shadow-xl overflow-hidden">
              <CardHeader className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-cyan-400" /> Global AI Model & System Settings Studio
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Configure and test model endpoints, hardware drift calibration, anti-loop guards, and execution speed.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold gap-1.5 shadow-sm"
                >
                  <Settings className="w-3.5 h-3.5" /> Open Quick Settings Dialog
                </Button>
              </CardHeader>
              <CardContent className="p-5 space-y-5 text-xs font-mono">
                {/* Model URL Configuration Section */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <CpuIcon className="w-4 h-4 text-cyan-400" /> Active AI Model URL
                    </span>
                    <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 text-[10px]">
                      DEFAULT: {DEFAULT_MODEL_URL}
                    </Badge>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input
                      type="text"
                      value={configuredModelUrl}
                      onChange={(e) => setConfiguredModelUrl(e.target.value)}
                      placeholder={DEFAULT_MODEL_URL}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const targetUrl = configuredModelUrl.trim() || DEFAULT_MODEL_URL;
                        localStorage.setItem("ai_model_url", targetUrl);
                        fetch("/api/ai/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ modelUrl: targetUrl }),
                        }).then(() => {
                          toast.success("Model URL saved to system!");
                        });
                      }}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
                    >
                      Save URL
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        fetch("/api/ai/test-endpoint", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ endpoint: configuredModelUrl }),
                        })
                          .then((r) => r.json())
                          .then((res) => {
                            if (res.success) {
                              toast.success(`Ping succeeded! Latency: ${res.latencyMs}ms`);
                            } else {
                              toast.error(`Ping check: ${res.message || "Failed"}`);
                            }
                          })
                          .catch(() => toast.error("Ping request failed"));
                      }}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                    >
                      Ping Endpoint
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-[11px] text-slate-400 self-center">Presets:</span>
                    <button
                      onClick={() => {
                        setConfiguredModelUrl(DEFAULT_MODEL_URL);
                        localStorage.setItem("ai_model_url", DEFAULT_MODEL_URL);
                        toast.success("Loaded LAN Ollama default");
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-300 font-bold"
                    >
                      🏠 LAN Ollama 192.168.1.100 (Default)
                    </button>
                    <button
                      onClick={() => {
                        setConfiguredModelUrl(QUANTUMCLAW_FALLBACK_URL);
                        localStorage.setItem("ai_model_url", QUANTUMCLAW_FALLBACK_URL);
                        toast.success("Loaded QuantumClaw Remote fallback");
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-300 font-bold"
                    >
                      ⚡ QuantumClaw Remote (Fallback)
                    </button>
                    <button
                      onClick={() => {
                        setConfiguredModelUrl("http://localhost:11434/api/chat");
                        localStorage.setItem("ai_model_url", "http://localhost:11434/api/chat");
                        toast.info("Loaded Localhost:11434 preset");
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300"
                    >
                      💻 Localhost Ollama
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-slate-950 border border-slate-800">
                    <span className="font-bold text-cyan-300">Movement & Drift</span>
                    <p className="text-slate-300 mt-1">
                      Mode: {movementMode} • Drift: {driftPx}px • Vary:{" "}
                      {driftPerStepVariate ? "ON" : "OFF"} • Random:{" "}
                      {driftRandomInterval ? "1-3s" : "OFF"}
                    </p>
                  </div>
                  <div className="p-3 rounded bg-slate-950 border border-slate-800">
                    <span className="font-bold text-emerald-300">Target Device</span>
                    <p className="text-slate-300 mt-1">
                      {targetDevice} • {selectedAdbDevice || "no device"} •
                      AntiLoop: {antiLoopEnabled ? "ON" : "OFF"}
                    </p>
                  </div>
                  <div className="p-3 rounded bg-slate-950 border border-slate-800">
                    <span className="font-bold text-purple-300">AI Perception</span>
                    <p className="text-slate-300 mt-1">
                      Perception: {perceptionReport ? "ready" : "idle"} • Live:{" "}
                      {isLiveDesktopActive ? "LIVE" : "fallback"} • Steps:{" "}
                      {sequence.length}
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                  <span className="font-bold text-white">All Tab Settings Bars</span>
                  <p className="text-slate-300">
                    Each tab (Vision, OS, Input, Routes, Cognition, Swarm)
                    contains its own TabContextualSettingsBar with
                    sliders/switches and quick actions. Adjust them in-context
                    for live effect.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="collab" className="space-y-4">
            <Card className="bg-gradient-to-r from-cyan-950/40 via-purple-950/40 to-slate-900 border-cyan-700/50 shadow-xl">
              <CardHeader className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" /> AI USER COLLAB
                  — Full Collaboration Studio
                </CardTitle>
                <span className="text-xs font-mono text-slate-300">
                  {collabChat.length} messages • {sequence.length} steps
                </span>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-slate-900 border-cyan-800/50">
                  <CardHeader className="p-3 bg-slate-950 border-b border-slate-800">
                    <CardTitle className="text-xs font-bold text-slate-100 flex items-center gap-2">
                      <Bot className="w-4 h-4 text-cyan-400" /> Quick Collab —
                      Tell AI where to click (Full)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    <textarea
                      value={collabInstruction}
                      onChange={(e) => setCollabInstruction(e.target.value)}
                      placeholder="Describe precisely where to click: e.g. Click the Blue Submit button at (740, 520) or type 'hello' at (420, 380)..."
                      className="w-full min-h-[120px] p-3 rounded bg-slate-950 border border-slate-800 text-sm text-slate-200"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!collabInstruction.trim()) return;
                          setCollabChat((prev) => [
                            ...prev,
                            { role: "user", text: collabInstruction },
                          ]);
                          const m = collabInstruction.match(
                            /\(?\s*(\d{2,4})\s*,\s*(\d{2,4})\s*\)?/,
                          );
                          if (m) {
                            const x = parseInt(m[1]),
                              y = parseInt(m[2]);
                            await executeHubTask("/api/execute-task", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                targetDevice,
                                deviceId: selectedAdbDevice,
                                task: {
                                  id: `collab_full_${Date.now()}`,
                                  name: collabInstruction.slice(0, 30),
                                  action: "click",
                                  targetPosition: { x, y },
                                },
                              }),
                            });
                          }
                          setCollabChat((prev) => [
                            ...prev,
                            {
                              role: "ai",
                              text: `Got it — will target with ${movementMode} mode. Added as step.`,
                            },
                          ]);
                          handleAddSequenceStep({
                            x: aiThinking?.x || 960,
                            y: aiThinking?.y || 540,
                            name: `Collab: ${collabInstruction.slice(0, 24)}`,
                          } as any);
                          setCollabInstruction("");
                        }}
                        className="h-9 text-sm bg-cyan-600 text-white flex-1"
                      >
                        Send to AI & Add Step
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCollabInstruction("")}
                        className="h-9 text-sm border-slate-700"
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2 rounded bg-slate-950 border border-slate-800 text-center">
                        <span className="text-slate-400">Live</span>
                        <div className="font-bold text-emerald-400">
                          {isLiveDesktopActive ? "● LIVE" : "○ idle"}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800 text-center">
                        <span className="text-slate-400">Drift</span>
                        <div className="font-bold text-cyan-400">
                          {driftPx}px
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800 text-center">
                        <span className="text-slate-400">Mode</span>
                        <div className="font-bold text-purple-400">
                          {movementMode}
                        </div>
                      </div>
                    </div>
                    <div className="h-24 rounded border border-slate-800 bg-slate-950 p-2 overflow-y-auto text-[11px] font-mono">
                      {executionHistory.slice(0, 10).map((h, i) => (
                        <div
                          key={i}
                          className="flex justify-between text-slate-300 border-b border-slate-800 py-0.5"
                        >
                          <span>{h.stepName || "op"}</span>
                          <span>{h.status || "pending"}</span>
                        </div>
                      ))}
                      {executionHistory.length === 0 && (
                        <span className="text-slate-400">
                          No ops yet — collaborate to generate history
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-3">
                  <Card className="bg-slate-900 border-slate-800 h-[420px] flex flex-col">
                    <CardHeader className="p-3 bg-slate-950 border-b border-slate-800">
                      <CardTitle className="text-xs font-bold text-slate-100">
                        Chat History
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 flex-1 flex flex-col overflow-hidden">
                      <div className="flex-1 rounded border border-slate-800 bg-slate-950 p-2 overflow-y-auto space-y-1 mb-2">
                        {collabChat.map((m, i) => (
                          <div
                            key={i}
                            className={`text-xs p-2 rounded ${m.role === "user" ? "bg-cyan-950/60 text-cyan-200 ml-8" : "bg-purple-950/40 text-purple-200 mr-8"}`}
                          >
                            {m.text}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Input
                          value={collabInput}
                          onChange={(e) => setCollabInput(e.target.value)}
                          placeholder="Type to AI..."
                          className="h-9 text-sm bg-slate-900 border-slate-700 flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (!collabInput.trim()) return;
                              setCollabChat((prev) => [
                                ...prev,
                                { role: "user", text: collabInput },
                                {
                                  role: "ai",
                                  text: `Noted: ${collabInput.slice(0, 40)}`,
                                },
                              ]);
                              setCollabInput("");
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!collabInput.trim()) return;
                            setCollabChat((prev) => [
                              ...prev,
                              { role: "user", text: collabInput },
                              {
                                role: "ai",
                                text: `Noted: ${collabInput.slice(0, 40)}`,
                              },
                            ]);
                            setCollabInput("");
                          }}
                          className="h-9 text-sm bg-slate-800"
                        >
                          Send
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="p-3 bg-slate-950 border-b border-slate-800">
                      <CardTitle className="text-xs font-bold text-slate-100">
                        AI Assistant (AIChat)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 h-48">
                      <AIChat />
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* Main AI Chat & Tools Full Tab View */}
          <TabsContent value="ai-chat" className="space-y-4">
            <MainAiLiveChat
              currentScreenSnapshot={activeCanvasUrl || screenshotUrl}
              currentTab={currentTab}
              onNavigateTab={handleTabSwitch}
              onRunWorkflow={(wf) => {
                if (wf?.steps) {
                  setSequence(
                    wf.steps.map((s: any, idx: number) => ({
                      id: s.id || `step-${idx + 1}-${Date.now()}`,
                      name: s.name || `Step #${idx + 1}`,
                      stepNumber: idx + 1,
                      action: s.action || "click",
                      x: s.x || 960,
                      y: s.y || 540,
                      text: s.text,
                      key: s.key,
                      delayMs: s.delayMs || 400,
                    }))
                  );
                }
              }}
              compact={false}
              className="h-[680px] border-cyan-500/50 shadow-2xl"
            />
          </TabsContent>
        </Tabs>

        {/* Global System Telemetry Status Footer */}
        <footer className="mt-8 pt-4 pb-6 border-t border-slate-800 text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              PyAutoGUI Physical Drivers Ready
            </span>
            <span>•</span>
            <span>
              Target OS:{" "}
              <strong className="text-slate-200">Windows Desktop</strong>
            </span>
            <span>•</span>
            <span>
              WebSocket HMR:{" "}
              <strong className="text-cyan-300">Connected</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-500">
              DroidVision AI Master Agent v3.4
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-cyan-300">
              Zero-Error Hardware Pipeline Active
            </span>
          </div>
        </footer>
        {/* Global AI Cursor & Motion Trail Overlay */}
        <GlobalAICursorOverlay enabled={true} cursorState={globalCursorState} theme="cyan" />

        {/* Android APK & WebAPK Standalone Build Modal */}
        <MobileSettingsModal open={isMobileSettingsModalOpen} onOpenChange={setIsMobileSettingsModalOpen} />
      <ApkAndPwaModal
          open={isApkModalOpen}
          onOpenChange={setIsApkModalOpen}
        />

        {/* Global Mouse & Coordinate Drift Calibration Modal */}
        <CoordinateCalibrationModal
          isOpen={isCalibrationModalOpen}
          onClose={() => setIsCalibrationModalOpen(false)}
        />

        {/* Global System & AI Model Settings Modal */}
        <GlobalSettingsModal
          open={isSettingsModalOpen}
          onOpenChange={setIsSettingsModalOpen}
          onSettingsSaved={(st) => {
            setConfiguredModelUrl(st.modelUrl);
            setDriftPx(st.driftPx);
            setAntiLoopEnabled(st.antiLoop);
            setTargetDevice(st.targetDevice);
          }}
        />

        {/* Autonomous Workflow Director & Background Agent Manager Modal */}
        <AutonomousWorkflowModal
          isOpen={autonomousModalOpen}
          onClose={() => setAutonomousModalOpen(false)}
          currentScreenTitle={targetDevice === "android" ? "Android Device" : "Windows Desktop"}
        />

        {/* AI Conscious Operator Workflow & Screen Auditor Modal */}
        <AIWorkflowReviewModal
          isOpen={isDashboardAiReviewOpen}
          onClose={() => setIsDashboardAiReviewOpen(false)}
          reviewResult={dashboardAiReviewResult}
          isLoading={isDashboardAiReviewLoading}
          currentSteps={sequence}
          screenshotUrl={aiLiveUrl || screenshotUrl}
          onApplyOptimizations={(optimizedSteps) => {
            setSequence(optimizedSteps);
            toast.success("Applied AI recommendations to workflow sequence!");
          }}
          onExecuteWithAI={() => {
            toast.info("Executing sequence with AI supervision...");
            handleRunSequence();
          }}
        />

        {/* Main AI Omni-Executive Controller (Full Tab Navigation, Settings Tuning, Screen Analysis, Workflow Healer & Click/Type Dispatcher) */}
        <MainAIOmniExecutive
          currentTab={currentTab}
          onSwitchTab={(t) => handleTabSwitch(t)}
          targetDevice={targetDevice}
          onSetTargetDevice={setTargetDevice}
          movementMode={movementMode}
          onSetMovementMode={setMovementMode}
          driftPx={driftPx}
          onSetDriftPx={setDriftPx}
          antiLoopEnabled={antiLoopEnabled}
          onSetAntiLoopEnabled={setAntiLoopEnabled}
          currentScreenshot={aiLiveUrl || frozenLiveSnapshot || screenshotUrl}
          activeSequence={sequence}
          onUpdateSequence={(newSeq) => setSequence(newSeq)}
          onRunSequence={() => { void handleRunSequence(); }}
        />
      </main>
    </div>
  );
}
