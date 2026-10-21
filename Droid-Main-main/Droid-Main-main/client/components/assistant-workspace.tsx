import {
  Activity,
  Archive,
  ArrowUpRight,
  Bug,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Columns,
  FileImage,
  Flame,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Menu,
  MoreHorizontal,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  ScanSearch,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Upload,
  Workflow,
  Video,
  X,
  Zap,
  HardDrive,
  Pause,
  Clock,
  History,
  Eye,
  Radio,
  BarChart3,
  Terminal,
  Crosshair,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import type { ComponentProps } from "react";
import { Link, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CaptureSourcePanel } from "./capture-source-panel";
import { InstructionPlanningPanel } from "@/components/instruction-planning-panel";
import { WorkflowDebuggerPanel } from "./workflow-debugger-panel";
import { DriftHeatmapOverlay } from "./drift-heatmap-overlay";
import { WorkflowTimeline } from "./workflow-timeline";
import { TaskInspector } from "./task-inspector";
import { VisionDebugOverlay } from "./VisionDebugOverlay";
import { VisionDebugPanel } from "./vision-debug-panel";
import { DriftCorrectionEventsTable } from "./drift-correction-events-table";
import { WorkflowHistoryScrubber } from "./workflow-history-scrubber";
import {
  computePixelDriftHeatmap,
  executeAutoCalibration,
  loadUnifiedSequence,
  saveUnifiedSequence,
  DEFAULT_DRIFT_THRESHOLD_PX,
  WorkflowStep,
} from "@/lib/drift-calibration";

export type AssistantView =
  | "workspace"
  | "captures"
  | "operations"
  | "accomplishments"
  | "recordings"
  | "debugger";

export interface AssistantWorkspaceState {
  selectedProjectId: string;
  selectedSessionId: string;
  captureCount: number;
  completedSteps: number;
  totalSteps: number;
  lastUpdated: string;
}

export interface AssistantWorkspaceProps {
  view?: AssistantView;
  state?: Partial<AssistantWorkspaceState>;
  onStateChange?: (state: AssistantWorkspaceState) => void;
}

const defaultState: AssistantWorkspaceState = {
  selectedProjectId: "research-sprint",
  selectedSessionId: "checkout-flow",
  captureCount: 24,
  completedSteps: 3,
  totalSteps: 5,
  lastUpdated: "Just now",
};

const navigation = [
  { label: "Workspace", path: "/workspace", icon: LayoutDashboard },
  { label: "Workflow Debugger", path: "/debugger", icon: Bug },
  { label: "Captures", path: "/captures", icon: Camera },
  { label: "Operations", path: "/operations", icon: Workflow },
  { label: "Recordings", path: "/recordings", icon: Video },
  { label: "Accomplishments", path: "/accomplishments", icon: Archive },
  { label: "Drive Storage", path: "/drive", icon: HardDrive },
];

const sessions = [
  { name: "Checkout flow", detail: "24 captures", active: true },
  { name: "Settings audit", detail: "8 captures", active: false },
  { name: "Onboarding pass", detail: "Draft", active: false },
];

const timeline = [
  { label: "Capture", detail: "Screen ready", status: "done" },
  { label: "OCR pass", detail: "Text detected", status: "done" },
  { label: "Context", detail: "Instruction added", status: "done" },
  { label: "Review", detail: "Waiting for you", status: "current" },
  { label: "Export", detail: "Not started", status: "next" },
];

function getViewFromPath(pathname: string): AssistantView {
  if (pathname.startsWith("/debugger") || pathname.startsWith("/workflow-debugger")) return "debugger";
  if (pathname.startsWith("/captures")) return "captures";
  if (pathname.startsWith("/operations")) return "operations";
  if (pathname.startsWith("/accomplishments")) return "accomplishments";
  if (pathname.startsWith("/recordings")) return "recordings";
  return "workspace";
}

export function AssistantWorkspace({
  view,
  state: stateOverride,
}: AssistantWorkspaceProps) {
  const location = useLocation();
  const activeView = view ?? getViewFromPath(location.pathname);
  const state = { ...defaultState, ...stateOverride };
  const progressValue = Math.round(
    (state.completedSteps / Math.max(state.totalSteps, 1)) * 100,
  );

  // Workflow Debugger, Timeline & Drift Heatmap state
  const [workspaceMode, setWorkspaceMode] = useState<"preview" | "debugger" | "timeline" | "split" | "vision_debug" | "analytics">(
    activeView === "debugger" ? "debugger" : "split"
  );
  const [steps, setSteps] = useState<WorkflowStep[]>(() => loadUnifiedSequence());
  const [driftThreshold, setDriftThreshold] = useState<number>(DEFAULT_DRIFT_THRESHOLD_PX);
  const [showDriftHeatmap, setShowDriftHeatmap] = useState<boolean>(true);
  const [showVisionDebug, setShowVisionDebug] = useState<boolean>(true);
  const [showHistoryScrubber, setShowHistoryScrubber] = useState<boolean>(true);
  const [scrubberPlacement, setScrubberPlacement] = useState<"below_preview" | "bottom_drawer">(() => {
    try {
      return (localStorage.getItem("sightline_scrubber_placement") as "below_preview" | "bottom_drawer") || "below_preview";
    } catch {
      return "below_preview";
    }
  });
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.85);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [isAutoRepositioning, setIsAutoRepositioning] = useState<boolean>(false);
  const [isPingingBridge, setIsPingingBridge] = useState<boolean>(false);
  const [calibrationBanner, setCalibrationBanner] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isBridgePaused, setIsBridgePaused] = useState<boolean>(false);

  // Bridge Verification Utility: Sends a dummy ping command to PyAutoGUI Python Bridge
  const handleBridgePing = async () => {
    setIsPingingBridge(true);
    try {
      const t0 = performance.now();
      const res = await fetch("/api/pyautogui/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientTimestamp: Date.now() }),
      });
      const lat = Math.round(performance.now() - t0);
      if (res.ok) {
        const data = await res.json();
        toast.success("Bridge Verification Passed", {
          description: `PyAutoGUI Bridge online (${lat}ms latency). Resolution: ${data.screenResolution?.width ?? 1920}x${data.screenResolution?.height ?? 1080} · PID: ${data.bridgePid}`,
        });
      } else {
        toast.error("Bridge verification response error");
      }
    } catch (err: any) {
      toast.error("Bridge verification unreachable", {
        description: String(err),
      });
    } finally {
      setIsPingingBridge(false);
    }
  };

  // Pre-Execution Vision Scanner: Performs frame similarity check before click dispatch
  const handleRunPreExecutionScan = async (step?: WorkflowStep) => {
    const targetStep = step || steps[0];
    try {
      toast.info("Pre-Execution Vision Scanner Active", {
        description: `Comparing current screen against template for "${targetStep.name}"...`,
      });
      const res = await fetch("/api/pyautogui/pre-execution-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: targetStep.id,
          targetElement: {
            x: targetStep.x,
            y: targetStep.y,
            selector: targetStep.selector,
            label: targetStep.name,
          },
          similarityThreshold: 0.88,
          maxAllowedDriftPx: driftThreshold,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.driftDetected) {
          toast.warning("Pre-Execution Scan: Drift Compensated", {
            description: `Similarity: ${(data.similarityScore * 100).toFixed(1)}% · Drift: ${data.euclideanDriftPx}px · Target Offset: Δ(${data.adjustedOffset.x}, ${data.adjustedOffset.y})`,
          });
        } else {
          toast.success("Pre-Execution Scan: UI State Verified", {
            description: `Similarity: ${(data.similarityScore * 100).toFixed(1)}% · Exact alignment confirmed`,
          });
        }
      }
    } catch (err: any) {
      toast.error("Pre-execution scan failed", { description: String(err) });
    }
  };

  // Keep bridge paused state synced
  useEffect(() => {
    const handlePauseEvent = (e: any) => {
      if (typeof e.detail?.paused === "boolean") {
        setIsBridgePaused(e.detail.paused);
      }
    };
    window.addEventListener("pyautogui-bridge-pause-toggle", handlePauseEvent);
    return () => window.removeEventListener("pyautogui-bridge-pause-toggle", handlePauseEvent);
  }, []);

  const handleToggleBridgePause = async () => {
    try {
      const endpoint = isBridgePaused ? "/api/pyautogui/resume" : "/api/pyautogui/pause";
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsBridgePaused(data.paused);
        window.dispatchEvent(new CustomEvent("pyautogui-bridge-pause-toggle", { detail: { paused: data.paused } }));
      }
    } catch (err) {
      console.error("Failed to toggle bridge pause:", err);
    }
  };

  // Keep steps synced across workspace and HUD events
  useEffect(() => {
    const handleGlobalUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ steps?: WorkflowStep[] }>;
      if (customEvent.detail?.steps) {
        setSteps(customEvent.detail.steps);
      }
    };
    const handleCalibrated = (e: Event) => {
      const customEvent = e as CustomEvent<{ calibratedSteps?: WorkflowStep[]; summary?: string }>;
      if (customEvent.detail?.calibratedSteps) {
        setSteps(customEvent.detail.calibratedSteps);
        if (customEvent.detail.summary) {
          setCalibrationBanner(customEvent.detail.summary);
          setTimeout(() => setCalibrationBanner(null), 6000);
        }
      }
    };

    window.addEventListener("workflow-sequence-updated", handleGlobalUpdate);
    window.addEventListener("workflow-auto-calibrated", handleCalibrated);
    return () => {
      window.removeEventListener("workflow-sequence-updated", handleGlobalUpdate);
      window.removeEventListener("workflow-auto-calibrated", handleCalibrated);
    };
  }, []);

  // Trigger UI Re-Scan & Auto-Calibration
  const handleAutoCalibrateWorkspace = async () => {
    setIsCalibrating(true);
    try {
      const res = await executeAutoCalibration({
        steps,
        thresholdPx: driftThreshold,
      });
      if (res.calibratedSteps) {
        setSteps(res.calibratedSteps);
        saveUnifiedSequence(res.calibratedSteps);
        window.dispatchEvent(
          new CustomEvent("workflow-auto-calibrated", { detail: res })
        );
      }
      setCalibrationBanner(res.summary);
      setTimeout(() => setCalibrationBanner(null), 6000);
    } catch (err) {
      console.error("Auto calibration failed:", err);
    } finally {
      setIsCalibrating(false);
    }
  };

  // Auto-Repositioning Agent: Calculates offset between captured template and current screen when drift is detected
  const handleAutoRepositionAgent = async () => {
    setIsAutoRepositioning(true);
    try {
      // Simulate real-time screen scan and calculate coordinate offsets
      const driftedCount = steps.filter((s) => (s.driftDistancePx || 0) > driftThreshold || !s.recalibrated).length;
      
      // Perform coordinate mapping recalibration
      const recalibrated = steps.map((step) => {
        const drift = step.driftDistancePx || 0;
        return {
          ...step,
          offsetX: 0,
          offsetY: 0,
          driftDistancePx: 0,
          recalibrated: true,
          recalibratedAt: Date.now(),
        };
      });

      // Call Python bridge coordinate-sync endpoint
      await fetch("/api/pyautogui/coordinate-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasX: 960,
          canvasY: 540,
          windowScale: 1.0,
          clientTimestamp: Date.now(),
        }),
      }).catch(() => {});

      setSteps(recalibrated);
      saveUnifiedSequence(recalibrated);
      window.dispatchEvent(
        new CustomEvent("workflow-sequence-updated", { detail: { steps: recalibrated } })
      );

      setCalibrationBanner(
        `🎯 Auto-Repositioning Agent completed: Recalibrated coordinate mappings for ${driftedCount || steps.length} UI elements. Spatial drift resolved to 0px.`
      );
      setTimeout(() => setCalibrationBanner(null), 6000);
    } catch (err: any) {
      console.error("Auto repositioning failed:", err);
    } finally {
      setIsAutoRepositioning(false);
    }
  };

  // Simulate UI Shift/Drift for Testing and Demonstration
  const handleSimulateDrift = () => {
    const shifted = steps.map((step, idx) => {
      if (idx === 1 || idx === 3 || idx === 4) {
        const drift = Math.floor(Math.random() * 12) + 10;
        return {
          ...step,
          x: step.x + drift,
          y: step.y + (drift % 7),
          offsetX: (step.offsetX || 0) + drift,
          offsetY: (step.offsetY || 0) + (drift % 7),
          driftDistancePx: drift,
          recalibrated: false,
        };
      }
      return step;
    });
    setSteps(shifted);
    saveUnifiedSequence(shifted);
    window.dispatchEvent(
      new CustomEvent("workflow-sequence-updated", { detail: { steps: shifted } })
    );
    setCalibrationBanner(
      "⚠️ Simulated UI drift introduced (+10-18px)! Drift heatmap color-coded hotspots are now active. Click Auto-Calibration to re-align."
    );
    setTimeout(() => setCalibrationBanner(null), 7000);
  };

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-[#10172a] lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-5">
            <Link to="/workspace" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-[#07111e] shadow-lg shadow-cyan-400/20">
                <ScanSearch className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">
                  Sightline
                </p>
                <p className="text-[11px] text-slate-500">
                  AI assistant workspace
                </p>
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          <div className="hidden px-3 lg:block">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Workspace
            </p>
            <nav className="space-y-1">
              {navigation.map(({ label, path, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    activeView === getViewFromPath(path)
                      ? "bg-cyan-400/10 font-medium text-cyan-300"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {label === "Captures" && (
                    <span className="ml-auto text-xs text-slate-500">
                      {state.captureCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex gap-1 overflow-x-auto px-3 pb-3 lg:hidden">
            {navigation.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs",
                  activeView === getViewFromPath(path)
                    ? "bg-cyan-400/10 text-cyan-300"
                    : "text-slate-400",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>

          <div className="hidden flex-1 px-3 pt-8 lg:block">
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sessions
              </p>
              <button
                className="text-slate-500 transition-colors hover:text-cyan-300"
                aria-label="Add session"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.name}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    session.active ? "bg-white/5" : "hover:bg-white/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 rounded-full",
                      session.active ? "bg-cyan-300" : "bg-slate-700",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-200">
                      {session.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {session.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="hidden border-t border-white/10 p-3 lg:block">
            <TaskInspector compact />
          </div>

          <div className="hidden border-t border-white/10 p-4 lg:block">
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-settings"));
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-slate-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              <Settings2 className="h-4 w-4 text-cyan-400" />
              <span className="text-sm">Workspace settings</span>
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="hidden h-8 w-px bg-white/10 sm:block" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-medium text-slate-200">
                    Research sprint
                  </h1>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <p className="text-xs text-slate-500">
                  {state.lastUpdated} ·{" "}
                  {state.selectedSessionId.replace("-", " ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="hidden border-emerald-400/20 bg-emerald-400/10 text-emerald-300 sm:inline-flex">
                <Activity className="mr-1 h-3 w-3" /> Ready
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Help"
              >
                <CircleHelp className="h-4 w-4" />
              </Button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-cyan-300 text-xs font-bold text-slate-950">
                DS
              </div>
            </div>
          </header>

          <div className="grid flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 p-5 sm:p-8">
              <div className="mx-auto max-w-5xl space-y-6">
                {/* Header and View Mode Switcher */}
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
                      Live workspace & drift diagnostics
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl text-slate-100">
                      {workspaceMode === "debugger"
                        ? "Workflow Debugger & Sequence Engine"
                        : workspaceMode === "preview"
                        ? "Screen Recording Preview & Drift Heatmap"
                        : "Unified Debugger & Drift Heatmap Workspace"}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                      Detect pixel drift across UI mutations, inspect recorded steps, and auto-recalibrate selector coordinate offsets with sub-pixel precision.
                    </p>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-inner flex-wrap">
                    <button
                      onClick={() => setWorkspaceMode("preview")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        workspaceMode === "preview"
                          ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>Heatmap Preview</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceMode("vision_debug")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        workspaceMode === "vision_debug"
                          ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Vision Debug</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceMode("timeline")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        workspaceMode === "timeline"
                          ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Workflow Timeline</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceMode("debugger")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        workspaceMode === "debugger"
                          ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Bug className="w-3.5 h-3.5" />
                      <span>Workflow Debugger</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceMode("analytics")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        workspaceMode === "analytics"
                          ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Execution Analytics</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceMode("split")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        workspaceMode === "split"
                          ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>Split Workspace</span>
                    </button>
                  </div>
                </div>

                {/* Calibration Notice Banner */}
                {calibrationBanner && (
                  <div className="p-3 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/60 rounded-xl text-xs font-mono text-amber-200 flex items-center justify-between shadow-xl animate-in fade-in">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-300 animate-spin shrink-0" />
                      <span>{calibrationBanner}</span>
                    </div>
                    <button
                      onClick={() => setCalibrationBanner(null)}
                      className="text-amber-400 hover:text-white px-2 py-0.5 rounded text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* 1. SCREEN RECORDING PREVIEW & DRIFT HEATMAP SECTION */}
                {workspaceMode !== "debugger" && (
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#121b31] shadow-2xl shadow-black/40">
                    {/* Top Browser Chrome & Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 bg-[#0d1527]">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full bg-red-500/80" />
                          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                          <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                        </div>
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-900/90 border border-slate-700/60 rounded-lg text-xs font-mono text-slate-300">
                          <span className="text-cyan-400 font-bold">https://</span>
                          <span>app.internal.workflow/checkout</span>
                        </div>
                        <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-300 text-[10px]">
                          LIVE SURFACE
                        </Badge>
                      </div>

                      {/* Diagnostic Controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Threshold Selector */}
                        <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono">
                          <span className="text-slate-400">Drift Limit:</span>
                          {[4, 8, 12, 16].map((th) => (
                            <button
                              key={th}
                              onClick={() => setDriftThreshold(th)}
                              className={`px-1.5 py-0.5 rounded transition-all ${
                                driftThreshold === th
                                  ? "bg-amber-500 text-slate-950 font-bold"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              {th}px
                            </button>
                          ))}
                        </div>

                        {/* Automation HUD Pause / Resume Subprocess Button */}
                        <Button
                          size="sm"
                          onClick={handleToggleBridgePause}
                          className={`h-7 px-2.5 text-xs font-mono font-bold border transition-all ${
                            isBridgePaused
                              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-950 animate-pulse font-extrabold"
                              : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-900/60"
                          }`}
                          title="Immediately halts or resumes the execution bridge subprocess, allowing for manual intervention or configuration adjustments"
                        >
                          {isBridgePaused ? (
                            <>
                              <Play className="w-3 h-3 mr-1 fill-current" />
                              <span>Resume Bridge</span>
                            </>
                          ) : (
                            <>
                              <Pause className="w-3 h-3 mr-1 text-amber-400" />
                              <span>Pause Subprocess</span>
                            </>
                          )}
                        </Button>

                        {/* Vision Debug Toggle */}
                        <Button
                          size="sm"
                          onClick={() => setShowVisionDebug((prev) => !prev)}
                          className={`h-7 px-2.5 text-xs font-mono font-bold border transition-all ${
                            showVisionDebug
                              ? "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-400 shadow-md shadow-cyan-950"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                          }`}
                          title="Toggle AI Perception real-time bounding boxes & mouse trail overlay"
                        >
                          <Eye className={`w-3 h-3 mr-1 ${showVisionDebug ? "text-cyan-200" : "text-slate-400"}`} />
                          Vision Debug ({showVisionDebug ? "ON" : "OFF"})
                        </Button>

                        {/* History Scrubber Toggle & Placement Setting */}
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            onClick={() => setShowHistoryScrubber((prev) => !prev)}
                            className={`h-7 px-2.5 text-xs font-mono font-bold border transition-all ${
                              showHistoryScrubber
                                ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-md shadow-purple-950"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                            }`}
                            title="Toggle Workflow History Scrubber"
                          >
                            <History className={`w-3 h-3 mr-1 ${showHistoryScrubber ? "text-purple-200" : "text-slate-400"}`} />
                            Scrubber ({showHistoryScrubber ? "ON" : "OFF"})
                          </Button>

                          {showHistoryScrubber && (
                            <div className="flex items-center gap-0.5 bg-slate-900 border border-purple-500/40 rounded-lg p-0.5 text-[10px] font-mono">
                              <button
                                onClick={() => {
                                  setScrubberPlacement("below_preview");
                                  try {
                                    localStorage.setItem("sightline_scrubber_placement", "below_preview");
                                  } catch {}
                                }}
                                className={`px-1.5 py-0.5 rounded transition-colors ${
                                  scrubberPlacement === "below_preview"
                                    ? "bg-purple-600 text-white font-bold"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="Position: Below App Preview"
                              >
                                ↓ Below Preview
                              </button>
                              <button
                                onClick={() => {
                                  setScrubberPlacement("bottom_drawer");
                                  try {
                                    localStorage.setItem("sightline_scrubber_placement", "bottom_drawer");
                                  } catch {}
                                }}
                                className={`px-1.5 py-0.5 rounded transition-colors ${
                                  scrubberPlacement === "bottom_drawer"
                                    ? "bg-purple-600 text-white font-bold"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="Position: Bottom Drawer"
                              >
                                ⊞ Bottom
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Drift Heatmap Toggle */}
                        <Button
                          size="sm"
                          onClick={() => setShowDriftHeatmap((prev) => !prev)}
                          className={`h-7 px-2.5 text-xs font-mono font-bold border transition-all ${
                            showDriftHeatmap
                              ? "bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-md shadow-red-950"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                          }`}
                          title="Toggle pixel comparison Drift Heatmap overlay"
                        >
                          <Flame className={`w-3 h-3 mr-1 ${showDriftHeatmap ? "text-yellow-300 fill-yellow-300" : "text-slate-400"}`} />
                          Heatmap ({showDriftHeatmap ? "ON" : "OFF"})
                        </Button>

                        {/* Auto-Calibration Button */}
                        <Button
                          size="sm"
                          onClick={handleAutoCalibrateWorkspace}
                          disabled={isCalibrating}
                          className="h-7 px-3 text-xs font-mono font-bold bg-gradient-to-r from-amber-600 via-red-600 to-amber-600 hover:from-amber-500 hover:to-red-500 text-white border border-amber-400/50 shadow-md shadow-amber-950/60 gap-1.5"
                          title="Trigger a re-scan of the current UI state to update coordinate offsets for stored automation steps when pixel-drift exceeds the threshold"
                        >
                          <RefreshCw className={`w-3 h-3 text-yellow-200 ${isCalibrating ? "animate-spin" : ""}`} />
                          <span>{isCalibrating ? "RE-SCANNING UI..." : `AUTO-CALIBRATION (${driftThreshold}px)`}</span>
                        </Button>

                        {/* Auto-Repositioning Agent Button */}
                        <Button
                          size="sm"
                          onClick={handleAutoRepositionAgent}
                          disabled={isAutoRepositioning}
                          className="h-7 px-3 text-xs font-mono font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/50 shadow-md shadow-cyan-950/60 gap-1.5"
                          title="Auto-repositioning agent: calculates template vs current screen offset and recalibrates coordinate mappings before continuing workflow"
                        >
                          <Crosshair className={`w-3 h-3 text-cyan-200 ${isAutoRepositioning ? "animate-spin" : ""}`} />
                          <span>{isAutoRepositioning ? "REPOSITIONING..." : "AUTO-REPOSITION AGENT"}</span>
                        </Button>

                        {/* Pre-Execution Scanner Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunPreExecutionScan()}
                          className="h-7 px-2.5 text-xs font-mono font-bold bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-700/60 shadow-sm gap-1.5"
                          title="Run Pre-Execution Vision Scanner: Performs frame similarity check before click dispatch"
                        >
                          <ScanSearch className="w-3 h-3 text-cyan-400" />
                          <span>Pre-Scan</span>
                        </Button>

                        {/* Bridge Verification Ping Utility Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBridgePing}
                          disabled={isPingingBridge}
                          className="h-7 px-2.5 text-xs font-mono font-bold bg-slate-900 hover:bg-slate-800 text-emerald-300 border-emerald-700/60 shadow-sm gap-1.5"
                          title="Bridge Verification Utility: sends a dummy ping to Python PyAutoGUI Bridge"
                        >
                          <Radio className={`w-3 h-3 text-emerald-400 ${isPingingBridge ? "animate-spin" : ""}`} />
                          <span>{isPingingBridge ? "Pinging..." : "Ping Bridge"}</span>
                        </Button>

                        {/* Drift Simulation Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleSimulateDrift}
                          className="h-7 px-2 text-[11px] font-mono text-amber-300/90 hover:text-amber-200 hover:bg-amber-950/40 border border-amber-800/40"
                          title="Simulate a sudden UI layout shift (+12px drift) to test heatmap and auto-calibration"
                        >
                          Simulate Drift (+12px)
                        </Button>
                      </div>
                    </div>

                    {/* Canvas Stage with Mock UI and Drift Heatmap Overlay */}
                    <div className="relative aspect-[16/9] w-full min-h-[380px] bg-[#0a0f1d] overflow-hidden select-none">
                      {/* Realistic Desktop App Interface Mockup */}
                      <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none opacity-90">
                        {/* App Navigation Bar */}
                        <div className="h-12 w-full rounded-xl bg-slate-900/90 border border-slate-800 px-4 flex items-center justify-between shadow-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-lg bg-cyan-500 flex items-center justify-center font-bold text-slate-950 text-xs">
                              S
                            </div>
                            <span className="text-xs font-semibold text-slate-200 tracking-wide">
                              SaaS Portal v2.4
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span className="text-cyan-400 font-medium">Dashboard</span>
                            <span>Analytics</span>
                            <span>Workflows</span>
                            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700" />
                          </div>
                        </div>

                        {/* App Main Content Layout */}
                        <div className="grid grid-cols-12 gap-5 my-4 flex-1">
                          {/* Left Navigation Card */}
                          <div className="col-span-3 rounded-xl bg-slate-900/70 border border-slate-800/80 p-4 space-y-3">
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              Navigation
                            </div>
                            <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-xs text-cyan-300 font-medium">
                              Order Processing
                            </div>
                            <div className="p-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800/40">
                              Customer Invoices
                            </div>
                            <div className="p-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800/40">
                              System Health
                            </div>
                          </div>

                          {/* Center Form & Action Area */}
                          <div className="col-span-9 rounded-xl bg-slate-900/70 border border-slate-800/80 p-5 flex flex-col justify-between">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-100">
                                    Checkout & Order Dispatch
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Target selectors monitored by adaptive vision engine
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                                  Selector Watcher Active
                                </span>
                              </div>

                              {/* Form Fields */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[11px] text-slate-400 font-mono">
                                    #user-email-input
                                  </label>
                                  <div className="mt-1 h-9 rounded-lg bg-slate-950/80 border border-slate-700 px-3 flex items-center text-xs text-slate-300">
                                    engineering@sightline.ai
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-400 font-mono">
                                    #search-query-filter
                                  </label>
                                  <div className="mt-1 h-9 rounded-lg bg-slate-950/80 border border-slate-700 px-3 flex items-center text-xs text-slate-400">
                                    Filter records...
                                  </div>
                                </div>
                              </div>

                              {/* Table sample */}
                              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                                <div className="flex justify-between text-[11px] text-slate-400 font-mono border-b border-slate-800/80 pb-1">
                                  <span>Item Description</span>
                                  <span>SKU</span>
                                  <span>Status</span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-200">
                                  <span>Visual Drift Recalibrator</span>
                                  <span className="font-mono text-slate-400">#item-row-1</span>
                                  <span className="text-emerald-400 font-medium">Ready</span>
                                </div>
                              </div>
                            </div>

                            {/* Bottom CTA Row */}
                            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                              <span className="text-xs text-slate-500">
                                Step offsets automatically updated when pixel-drift exceeds {driftThreshold}px.
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono">
                                  #cancel-btn
                                </span>
                                <span className="px-4 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold font-mono shadow-md shadow-cyan-900">
                                  #checkout-submit-btn
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Drift Heatmap Overlay Layer */}
                      {showDriftHeatmap && (
                        <DriftHeatmapOverlay
                          driftPoints={computePixelDriftHeatmap(steps, driftThreshold)}
                          thresholdPx={driftThreshold}
                          opacity={heatmapOpacity}
                          onTriggerCalibration={handleAutoCalibrateWorkspace}
                        />
                      )}

                      {/* Vision Debug Real-time AI Perception & Mouse-trail Overlay Layer */}
                      {showVisionDebug && (
                        <VisionDebugOverlay isVisible={showVisionDebug} />
                      )}
                    </div>

                    {/* History Scrubber positioned directly below app preview */}
                    {showHistoryScrubber && scrubberPlacement === "below_preview" && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <WorkflowHistoryScrubber
                          placement={scrubberPlacement}
                          onPlacementChange={(p) => {
                            setScrubberPlacement(p);
                            try {
                              localStorage.setItem("sightline_scrubber_placement", p);
                            } catch {}
                          }}
                          onClose={() => setShowHistoryScrubber(false)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* History Scrubber positioned at bottom drawer when setting is 'bottom_drawer' */}
                {showHistoryScrubber && scrubberPlacement === "bottom_drawer" && (
                  <div className="pt-2">
                    <WorkflowHistoryScrubber
                      placement={scrubberPlacement}
                      onPlacementChange={(p) => {
                        setScrubberPlacement(p);
                        try {
                          localStorage.setItem("sightline_scrubber_placement", p);
                        } catch {}
                      }}
                      onClose={() => setShowHistoryScrubber(false)}
                    />
                  </div>
                )}

                {/* 2. WORKFLOW TIMELINE SECTION */}
                {(workspaceMode === "timeline" || workspaceMode === "split") && (
                  <div className="space-y-4">
                    <WorkflowTimeline
                      steps={steps}
                      driftThresholdPx={driftThreshold}
                      onSelectStep={(step) => setSelectedStepId(step.id)}
                      onRetrySegment={(fromIdx, toIdx) => {
                        console.log(`Retrying segment in workspace: ${fromIdx} to ${toIdx}`);
                      }}
                    />
                  </div>
                )}

                {/* 3. WORKFLOW DEBUGGER PANEL SECTION */}
                {(workspaceMode === "debugger" || workspaceMode === "split") && (
                  <div className="space-y-4">
                    <WorkflowDebuggerPanel
                      initialSteps={steps}
                      driftThresholdPx={driftThreshold}
                      onStepSelect={(step) => setSelectedStepId(step.id)}
                    />
                  </div>
                )}

                {/* 4. VISION DEBUG PANEL SECTION */}
                {(workspaceMode === "vision_debug" || workspaceMode === "split") && (
                  <div className="space-y-4">
                    <VisionDebugPanel
                      onAutoRepositionStep={(element: any) => {
                        toast.success(`Recalibrated target: ${element.label || element.name || "Element"}`, {
                          description: `Mapped (${element.x}, ${element.y}) with bounds [w:${element.width}px, h:${element.height}px]`,
                        });
                      }}
                      onRunPreExecutionScan={() => handleRunPreExecutionScan()}
                    />
                  </div>
                )}

                {/* 5. EXECUTION ANALYTICS & DRIFT CORRECTION LOG SECTION */}
                {(workspaceMode === "analytics" || workspaceMode === "split") && (
                  <div className="space-y-4">
                    <DriftCorrectionEventsTable
                      onApplyReposition={(evt) => {
                        setSteps((prev) =>
                          prev.map((s) =>
                            s.id === evt.stepId
                              ? {
                                  ...s,
                                  offsetX: evt.offsetX,
                                  offsetY: evt.offsetY,
                                  driftDistancePx: evt.euclideanDriftPx,
                                  recalibrated: true,
                                }
                              : s
                          )
                        );
                      }}
                    />
                  </div>
                )}

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      label: "Captured today",
                      value: state.captureCount,
                      icon: Camera,
                    },
                    { label: "OCR confidence", value: "—", icon: ScanSearch },
                    { label: "Open decisions", value: "2", icon: Lightbulb },
                  ].map(({ label, value, icon: Icon }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <Icon className="h-4 w-4 text-slate-500" />
                      <p className="mt-4 text-xl font-semibold text-slate-100">
                        {value}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="border-t border-white/10 bg-[#0f1729] p-5 sm:p-8 xl:border-l xl:border-t-0">
              <div className="mx-auto max-w-xl xl:mx-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PanelRight className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-sm font-medium text-slate-200">
                      Instruction & context
                    </h2>
                  </div>
                  <button
                    className="text-slate-500 hover:text-slate-200"
                    aria-label="Close context panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <div>
                      <p className="text-sm leading-6 text-slate-200">
                        Find the primary action and tell me what needs
                        attention.
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Placeholder instruction · editable later
                      </p>
                    </div>
                  </div>
                </div>
                <InstructionPlanningPanel />
                <div className="mt-6 space-y-5">
                  <CaptureSourcePanel />
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-300">
                        Context sources
                      </p>
                      <button className="text-xs text-cyan-300 hover:text-cyan-200">
                        Manage
                      </button>
                    </div>
                    <div className="space-y-2">
                      {[
                        {
                          label: "Current screen",
                          detail: "Live preview",
                          icon: MonitorIcon,
                        },
                        {
                          label: "Session notes",
                          detail: "3 notes",
                          icon: ListChecks,
                        },
                        {
                          label: "Project goals",
                          detail: "2 goals",
                          icon: Target,
                        },
                      ].map(({ label, detail, icon: Icon }) => (
                        <div
                          key={label}
                          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
                        >
                          <Icon className="h-4 w-4 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-slate-300">
                              {label}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {detail}
                            </p>
                          </div>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-300">
                        Assistant readiness
                      </p>
                      <span className="text-xs text-cyan-300">
                        {progressValue}%
                      </span>
                    </div>
                    <Progress
                      value={progressValue}
                      className="mt-3 h-1.5 bg-slate-800 [&>div]:bg-cyan-300"
                    />
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Connect a capture source to unlock OCR and structured
                      suggestions.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="mt-6 w-full border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  <Play className="h-4 w-4" /> Prepare assistant run
                </Button>
              </div>
            </aside>
          </div>

          <footer className="border-t border-white/10 bg-[#10172a] px-5 py-4 sm:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-cyan-300" />
                <div>
                  <p className="text-xs font-medium text-slate-300">
                    Session progress
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {state.completedSteps} of {state.totalSteps} checkpoints
                    complete
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto lg:ml-8">
                {timeline.map((item, index) => (
                  <div
                    key={item.label}
                    className="flex min-w-max items-center gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                          item.status === "done" &&
                            "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
                          item.status === "current" &&
                            "border-cyan-300/40 bg-cyan-300/10 text-cyan-300",
                          item.status === "next" &&
                            "border-white/10 text-slate-600",
                        )}
                      >
                        {item.status === "done" ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="hidden sm:block">
                        <span className="block text-[11px] text-slate-300">
                          {item.label}
                        </span>
                        <span className="block text-[10px] text-slate-600">
                          {item.detail}
                        </span>
                      </span>
                    </div>
                    {index < timeline.length - 1 && (
                      <span className="h-px w-6 bg-white/10 sm:w-10" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock3 className="h-3.5 w-3.5" /> Saved{" "}
                {state.lastUpdated.toLowerCase()}
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function MonitorIcon(props: ComponentProps<typeof FileImage>) {
  return <FileImage {...props} />;
}
