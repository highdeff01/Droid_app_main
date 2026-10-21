import React, { useState, useEffect } from "react";
import {
  Brain,
  Sparkles,
  Bot,
  Monitor,
  Smartphone,
  Sliders,
  Play,
  Pause,
  RefreshCw,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Crosshair,
  Settings,
  FolderCode,
  Globe,
  Camera,
  Activity,
  Zap,
  MousePointer,
  Compass,
  Link2,
  Code2,
  Bug,
  Hand,
  Navigation,
  Clock,
  Eye,
  GitFork,
  History,
  BarChart3,
  Terminal,
  ChevronRight,
  ArrowRight,
  Keyboard,
  CornerDownLeft,
  X,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Check,
  Send,
  Loader2,
  Cpu,
  Package,
  AppWindow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export interface OmniTab {
  id: string;
  label: string;
  category: string;
  icon: string;
  description: string;
}

export interface DetectedUIElement {
  id: string;
  name: string;
  type: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  confidence: number;
  interactive: boolean;
  textValue?: string;
}

interface MainAIOmniExecutiveProps {
  currentTab: string;
  onSwitchTab: (tabId: string) => void;
  targetDevice: "desktop" | "android";
  onSetTargetDevice: (device: "desktop" | "android") => void;
  movementMode: "exact" | "variation" | "live";
  onSetMovementMode: (mode: "exact" | "variation" | "live") => void;
  driftPx: number;
  onSetDriftPx: (px: number) => void;
  antiLoopEnabled: boolean;
  onSetAntiLoopEnabled: (enabled: boolean) => void;
  currentScreenshot?: string;
  activeSequence?: any[];
  onUpdateSequence?: (newSequence: any[]) => void;
  onRunSequence?: () => void;
}

export function MainAIOmniExecutive({
  currentTab,
  onSwitchTab,
  targetDevice,
  onSetTargetDevice,
  movementMode,
  onSetMovementMode,
  driftPx,
  onSetDriftPx,
  antiLoopEnabled,
  onSetAntiLoopEnabled,
  currentScreenshot,
  activeSequence = [],
  onUpdateSequence,
  onRunSequence,
}: MainAIOmniExecutiveProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [selectedSubTab, setSelectedSubTab] = useState<"copilot" | "tabs" | "screen" | "interact" | "workflow-fix" | "settings">("copilot");

  // Interaction Form State
  const [interactAction, setInteractAction] = useState<string>("click");
  const [targetX, setTargetX] = useState<number>(960);
  const [targetY, setTargetY] = useState<number>(540);
  const [textInput, setTextInput] = useState<string>("");
  const [selectedKey, setSelectedKey] = useState<string>("enter");
  const [actionDelay, setActionDelay] = useState<number>(350);

  // Analysis state
  const [detectedElements, setDetectedElements] = useState<DetectedUIElement[]>([]);
  const [screenSummary, setScreenSummary] = useState<string>("");

  // Audit Logs
  const [aiLogs, setAiLogs] = useState<Array<{ timestamp: number; title: string; detail: string; status: "pending" | "running" | "completed" | "failed"; type: string }>>([
    {
      timestamp: Date.now(),
      title: "Main AI Executive Ready",
      detail: "Omni-control engine initialized for tab routing, screen analysis, setting adjustments and workflow repairs.",
      status: "completed",
      type: "system",
    },
  ]);

  // Tab definitions categorized
  const tabCategories = [
    {
      name: "Vision & Screen",
      color: "text-cyan-400 border-cyan-500/30 bg-cyan-950/40",
      tabs: [
        { id: "screen", label: "Screen HUD", icon: Monitor, desc: "Live viewport & interactive cursor" },
        { id: "layers", label: "Layers", icon: Layers, desc: "Visual layer & mask inspection" },
        { id: "models", label: "Models", icon: Cpu, desc: "Vision AI model weights" },
        { id: "pack-builder", label: "Pack Builder", icon: Package, desc: "Annotation & dataset builder" },
        { id: "capture", label: "Capture", icon: Camera, desc: "High-speed snapshot capture" },
        { id: "entities", label: "Entities & OCR", icon: Crosshair, desc: "OCR grounding & bounding boxes" },
        { id: "quantum", label: "Quantum Vision", icon: Activity, desc: "Spectral edge analysis" },
      ],
    },
    {
      name: "OS & Hardware Link",
      color: "text-emerald-400 border-emerald-500/30 bg-emerald-950/40",
      tabs: [
        { id: "linker", label: "Device Linker", icon: Link2, desc: "USB / ADB / Bluetooth pairing" },
        { id: "v-desktop", label: "V-Desktop", icon: AppWindow, desc: "Virtual sandbox display" },
        { id: "code-editor", label: "Automation Code", icon: Code2, desc: "PyAutoGUI & ADB scripting" },
        { id: "gap-agent", label: "Gap Agent", icon: Bug, desc: "UI drift & discrepancy detector" },
      ],
    },
    {
      name: "Input & Touch Control",
      color: "text-amber-400 border-amber-500/30 bg-amber-950/40",
      tabs: [
        { id: "drag-drop", label: "Drag-Drop", icon: MousePointer, desc: "Smooth drag curve builder" },
        { id: "movement", label: "Movement (2nd HUD)", icon: Compass, desc: "Human drift & trajectory engine" },
        { id: "touch-gestures", label: "Touch Gestures", icon: Hand, desc: "Pinch, zoom & swipe gestures" },
        { id: "mouse-tracer", label: "Mouse Tracer", icon: Navigation, desc: "Live cursor motion tracer" },
      ],
    },
    {
      name: "AI & Reasoning Pipeline",
      color: "text-purple-400 border-purple-500/30 bg-purple-950/40",
      tabs: [
        { id: "pipeline", label: "Dual-AI Pipeline", icon: Brain, desc: "Qwen perception & Planner AI" },
        { id: "desc-refiner", label: "Desc Refiner", icon: Wand2, desc: "AI prompt engineering & tuning" },
        { id: "assistant", label: "AI Assistant", icon: Bot, desc: "Conversational workflow creator" },
        { id: "auto-actor", label: "Auto-Actor", icon: Zap, desc: "Autonomous state machine runner" },
        { id: "rebound", label: "Rebound Stories", icon: Sparkles, desc: "Self-healing failover routines" },
        { id: "benchmarks", label: "Benchmarks", icon: Activity, desc: "Latency & precision testing" },
      ],
    },
    {
      name: "Automation & Orchestration",
      color: "text-blue-400 border-blue-500/30 bg-blue-950/40",
      tabs: [
        { id: "sequence", label: "Sequence Studio", icon: Play, desc: "Multi-step playback & recorder" },
        { id: "workflows", label: "Workflows Library", icon: FolderCode, desc: "Saved routines & master flows" },
        { id: "scheduler", label: "Scheduler", icon: Clock, desc: "Recurring cron & delayed jobs" },
        { id: "watcher", label: "Scenario Watcher", icon: Eye, desc: "Visual watchdog & auto-trigger" },
        { id: "browser", label: "Browser Inspector", icon: Globe, desc: "Chrome CDP & DOM inspector" },
        { id: "genealogy", label: "Genealogy Lineage", icon: GitFork, desc: "Pattern lineage & master synthesis" },
      ],
    },
    {
      name: "Analytics & System",
      color: "text-rose-400 border-rose-500/30 bg-rose-950/40",
      tabs: [
        { id: "history", label: "Action History", icon: History, desc: "Executed actions audit log" },
        { id: "analytics", label: "Analytics Hub", icon: BarChart3, desc: "Success rates & performance metrics" },
        { id: "logs", label: "System Logs", icon: Terminal, desc: "Central real-time log stream" },
        { id: "settings", label: "Settings", icon: Settings, desc: "Global engine preferences" },
      ],
    },
  ];

  // Helper to append audit logs
  const logAction = (title: string, detail: string, status: "pending" | "running" | "completed" | "failed", type = "exec") => {
    setAiLogs((prev) => [
      {
        timestamp: Date.now(),
        title,
        detail,
        status,
        type,
      },
      ...prev.slice(0, 50),
    ]);
  };

  // 1. Natural Language Autonomous Goal Execution
  const handleExecuteAutonomousGoal = async (customPrompt?: string) => {
    const goalText = customPrompt || prompt;
    if (!goalText.trim()) {
      toast.error("Please provide an instruction for the Main AI");
      return;
    }

    setIsExecuting(true);
    logAction("Autonomous Goal Initiated", `Processing prompt: "${goalText}"`, "running", "ai");

    try {
      const res = await fetch("/api/ai/omni/execute-autonomous-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: goalText,
          currentScreen: currentScreenshot,
          autoExecute: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Autonomous Goal executed successfully!");
        logAction(
          "Goal Completed",
          `Executed ${data.plannedActions?.length || 0} subtasks. Updated view: ${data.currentActiveTab || currentTab}`,
          "completed",
          "ai"
        );

        // If active tab was updated by backend, sync it
        if (data.currentActiveTab && data.currentActiveTab !== currentTab) {
          onSwitchTab(data.currentActiveTab);
        }

        // If settings were updated, sync them
        if (data.settings) {
          if (data.settings.targetDevice) onSetTargetDevice(data.settings.targetDevice);
          if (data.settings.movementMode) onSetMovementMode(data.settings.movementMode);
          if (typeof data.settings.driftPx === "number") onSetDriftPx(data.settings.driftPx);
          if (typeof data.settings.antiLoopEnabled === "boolean") onSetAntiLoopEnabled(data.settings.antiLoopEnabled);
        }

        // If workflow was repaired or requested to run
        if (goalText.toLowerCase().includes("run") && onRunSequence) {
          onRunSequence();
        }
      } else {
        toast.error(data.error || "Execution failed");
        logAction("Goal Failed", data.error || "Unknown error", "failed", "ai");
      }
    } catch (err) {
      toast.error(String(err));
      logAction("Goal Error", String(err), "failed", "ai");
    } finally {
      setIsExecuting(false);
      setPrompt("");
    }
  };

  // 2. Direct Tab Navigation by AI
  const handleAiNavigateTab = async (tabId: string) => {
    try {
      const res = await fetch("/api/ai/omni/switch-tab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId, reason: "Manual AI Director Navigation" }),
      });
      const data = await res.json();
      if (data.success) {
        onSwitchTab(tabId);
        toast.success(`Main AI switched view to ${data.tabInfo?.label || tabId}`);
        logAction("Navigated Tab", `Switched active dashboard view to [${tabId}]`, "completed", "nav");
      } else {
        toast.error(data.error || "Failed to switch tab");
      }
    } catch (e) {
      onSwitchTab(tabId);
    }
  };

  // 3. Screen Visual Grounding & Element Detection
  const handleAnalyzeActiveScreen = async () => {
    if (!currentScreenshot) {
      toast.warning("No screen frame available. Please share screen or connect device first.");
      return;
    }

    setIsAnalyzing(true);
    logAction("Visual Analysis", "Grounding UI controls and OCR text across 1920x1080 canvas...", "running", "vision");

    try {
      const res = await fetch("/api/ai/omni/analyze-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: currentScreenshot,
          objective: "Extract all buttons, input fields, links, icons, and interactive elements",
        }),
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        const els = data.analysis.elements || [];
        setDetectedElements(els);
        setScreenSummary(data.analysis.screenDescription || "Screen analyzed successfully");
        toast.success(`AI identified ${els.length} interactive elements on screen`);
        logAction("Vision Complete", `Grounded ${els.length} UI elements. Center focus: (${data.analysis.feedbackPosition?.x || 960}, ${data.analysis.feedbackPosition?.y || 540})`, "completed", "vision");
      } else {
        toast.error(data.error || "Analysis failed");
        logAction("Vision Failed", data.error || "Analysis failed", "failed", "vision");
      }
    } catch (err) {
      toast.error(String(err));
      logAction("Vision Error", String(err), "failed", "vision");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 4. Interactive Action Dispatcher (Click / Text / Key / Drag)
  const handleDispatchInteraction = async (override?: Partial<{ action: string; x: number; y: number; text: string; key: string }>) => {
    const act = override?.action || interactAction;
    const xCoord = override?.x !== undefined ? override.x : targetX;
    const yCoord = override?.y !== undefined ? override.y : targetY;
    const textVal = override?.text !== undefined ? override.text : textInput;
    const keyVal = override?.key !== undefined ? override.key : selectedKey;

    logAction(`Dispatching ${act.toUpperCase()}`, `Target: (${xCoord}, ${yCoord}) ${textVal ? `Payload: "${textVal}"` : keyVal ? `Key: ${keyVal}` : ""}`, "running", "interact");

    try {
      const res = await fetch("/api/ai/omni/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: act,
          x: xCoord,
          y: yCoord,
          text: textVal,
          key: keyVal,
          delayMs: actionDelay,
          targetDevice,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Executed ${act} on ${targetDevice} at (${xCoord}, ${yCoord})`);
        logAction(`${act.toUpperCase()} Success`, `Action dispatched through ${targetDevice === "android" ? "ADB" : "PyAutoGUI"} bridge.`, "completed", "interact");
      } else {
        toast.error(data.error || "Dispatch failed");
        logAction(`${act.toUpperCase()} Failed`, data.error || "Failed", "failed", "interact");
      }
    } catch (err) {
      toast.error(String(err));
      logAction(`${act.toUpperCase()} Error`, String(err), "failed", "interact");
    }
  };

  // 5. Workflow Auto-Repair Engine
  const handleAutoFixWorkflow = async () => {
    if (!activeSequence || activeSequence.length === 0) {
      toast.warning("No active sequence steps to fix. Create or record some steps first!");
      return;
    }

    setIsRepairing(true);
    logAction("Workflow Repair Initiated", `Analyzing ${activeSequence.length} steps for coordinate drift, missing delays, and error branches...`, "running", "repair");

    try {
      const res = await fetch("/api/ai/omni/fix-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: activeSequence,
          currentScreen: currentScreenshot,
          errorReason: "Proactive AI Drift & Reliability Pass",
        }),
      });
      const data = await res.json();
      if (data.success && data.repairedSteps) {
        if (onUpdateSequence) {
          onUpdateSequence(data.repairedSteps);
        }
        toast.success(`Workflow fixed! ${data.repairedCount} of ${data.repairedSteps.length} steps corrected`);
        logAction("Workflow Repaired", data.summary, "completed", "repair");
      } else {
        toast.error(data.error || "Repair failed");
        logAction("Repair Failed", data.error || "Unknown error", "failed", "repair");
      }
    } catch (err) {
      toast.error(String(err));
      logAction("Repair Error", String(err), "failed", "repair");
    } finally {
      setIsRepairing(false);
    }
  };

  // 6. Settings Adjustments
  const handleUpdateSetting = async (key: string, value: any) => {
    if (key === "targetDevice") onSetTargetDevice(value);
    if (key === "movementMode") onSetMovementMode(value);
    if (key === "driftPx") onSetDriftPx(value);
    if (key === "antiLoopEnabled") onSetAntiLoopEnabled(value);

    try {
      await fetch("/api/ai/omni/adjust-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      toast.info(`Setting updated: ${key} = ${JSON.stringify(value)}`);
      logAction("Setting Changed", `${key} -> ${JSON.stringify(value)}`, "completed", "settings");
    } catch (e) {
      // Local state already updated
    }
  };

  return (
    <>
      {/* Floating Main AI Executive Trigger Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
          <Button
            onClick={() => setIsOpen(true)}
            className="h-12 px-4 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-mono font-bold shadow-2xl shadow-purple-900/50 border border-purple-400/40 flex items-center gap-2.5 transition-transform hover:scale-105"
          >
            <Bot className="w-5 h-5 text-cyan-200 animate-pulse" />
            <span>Main AI Omni-Executive</span>
            <Badge className="bg-slate-950/80 text-cyan-300 border-cyan-500/40 text-[10px] px-1.5 py-0.5 ml-1">
              FULL CONTROL
            </Badge>
          </Button>
        </div>
      )}

      {/* Main AI Omni-Executive Modal / Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-cyan-500/50 rounded-2xl shadow-2xl shadow-cyan-950/80 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-md">
                  <Bot className="w-6 h-6 text-white animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white font-mono tracking-tight">
                      Main AI Omni-Executive Director
                    </h2>
                    <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[10px] font-mono">
                      AUTONOMOUS OPERATOR
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    View & switch any tab • Inspect & analyze screen • Adjust settings & features • Fix workflows & click/type anywhere
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 border-b border-slate-800 text-xs font-mono">
              <button
                onClick={() => setSelectedSubTab("copilot")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  selectedSubTab === "copilot"
                    ? "bg-purple-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> AI Goal Operator
              </button>
              <button
                onClick={() => setSelectedSubTab("tabs")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  selectedSubTab === "tabs"
                    ? "bg-cyan-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Omni Tab Navigator ({currentTab})
              </button>
              <button
                onClick={() => setSelectedSubTab("screen")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  selectedSubTab === "screen"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Visual Grounding & Screen ({detectedElements.length})
              </button>
              <button
                onClick={() => setSelectedSubTab("interact")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  selectedSubTab === "interact"
                    ? "bg-amber-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" /> Button Clicker & Text Inserter
              </button>
              <button
                onClick={() => setSelectedSubTab("workflow-fix")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  selectedSubTab === "workflow-fix"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" /> Workflow Healer ({activeSequence.length} steps)
              </button>
              <button
                onClick={() => setSelectedSubTab("settings")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  selectedSubTab === "settings"
                    ? "bg-slate-700 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Settings className="w-3.5 h-3.5" /> Engine Settings
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-0">
              {/* Main Panel (2 cols) */}
              <div className="lg:col-span-2 p-6 overflow-y-auto border-r border-slate-800 space-y-6">
                {/* 1. COPILOT TAB */}
                {selectedSubTab === "copilot" && (
                  <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/30 shadow-inner">
                      <label className="text-xs font-mono font-bold text-purple-300 mb-2 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        Autonomous Natural Language Directive
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. 'Switch to workflows tab, fix the submit button coordinate, insert text Hello World and run sequence'"
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleExecuteAutonomousGoal();
                            }
                          }}
                          className="font-mono text-sm bg-slate-900 border-slate-700 text-white"
                        />
                        <Button
                          disabled={isExecuting}
                          onClick={() => handleExecuteAutonomousGoal()}
                          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold gap-2 px-5"
                        >
                          {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Execute
                        </Button>
                      </div>

                      {/* Quick Presets */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-mono text-slate-400 py-1 mr-1">Directives:</span>
                        {[
                          "Switch to Workflows tab and auto-fix sequence",
                          "Analyze screen, click search bar and insert text 'Reports'",
                          "Set mouse drift to 2px and switch to screen tab",
                          "Switch device to Android and share phone screen",
                          "Auto-heal broken coordinates and click submit",
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setPrompt(preset);
                              handleExecuteAutonomousGoal(preset);
                            }}
                            className="text-[11px] font-mono bg-slate-900 hover:bg-purple-950 text-purple-300 hover:text-purple-200 px-2.5 py-1 rounded-md border border-purple-800/60 transition-colors"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Action Matrix */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Card
                        onClick={() => setSelectedSubTab("tabs")}
                        className="bg-slate-950/80 border-slate-800 hover:border-cyan-500 cursor-pointer transition-all p-3.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Layers className="w-5 h-5 text-cyan-400" />
                          <Badge className="text-[9px] bg-cyan-950 text-cyan-300 border-cyan-800">26 TABS</Badge>
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold text-white">Omni Tab Control</h4>
                          <p className="text-[10px] text-slate-400 mt-1">Jump to any view</p>
                        </div>
                      </Card>

                      <Card
                        onClick={handleAnalyzeActiveScreen}
                        className="bg-slate-950/80 border-slate-800 hover:border-emerald-500 cursor-pointer transition-all p-3.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Eye className="w-5 h-5 text-emerald-400" />
                          <Badge className="text-[9px] bg-emerald-950 text-emerald-300 border-emerald-800">VISION</Badge>
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold text-white">Ground & Analyze</h4>
                          <p className="text-[10px] text-slate-400 mt-1">Extract UI controls</p>
                        </div>
                      </Card>

                      <Card
                        onClick={() => setSelectedSubTab("interact")}
                        className="bg-slate-950/80 border-slate-800 hover:border-amber-500 cursor-pointer transition-all p-3.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <MousePointer className="w-5 h-5 text-amber-400" />
                          <Badge className="text-[9px] bg-amber-950 text-amber-300 border-amber-800">INTERACT</Badge>
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold text-white">Click & Type</h4>
                          <p className="text-[10px] text-slate-400 mt-1">Dispatch PyAutoGUI/ADB</p>
                        </div>
                      </Card>

                      <Card
                        onClick={handleAutoFixWorkflow}
                        className="bg-slate-950/80 border-slate-800 hover:border-indigo-500 cursor-pointer transition-all p-3.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Wand2 className="w-5 h-5 text-indigo-400" />
                          <Badge className="text-[9px] bg-indigo-950 text-indigo-300 border-indigo-800">AUTO-HEAL</Badge>
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold text-white">Fix Workflows</h4>
                          <p className="text-[10px] text-slate-400 mt-1">Reposition coordinates</p>
                        </div>
                      </Card>
                    </div>

                    {/* Active State Summary */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-bold text-white">Active System View:</span>
                        <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 capitalize">{currentTab}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-bold text-white">Target Execution Engine:</span>
                        <Badge className="bg-purple-950 text-purple-300 border-purple-700 capitalize">{targetDevice} ({targetDevice === "android" ? "ADB Bridge" : "PyAutoGUI"})</Badge>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-bold text-white">Mouse Movement Drift:</span>
                        <span className="text-amber-400 font-bold">{driftPx}px ({movementMode} mode)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-bold text-white">Active Workflow Sequence:</span>
                        <span className="text-emerald-400 font-bold">{activeSequence.length} steps loaded</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. OMNI TAB NAVIGATOR */}
                {selectedSubTab === "tabs" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-mono font-bold text-white mb-1">Omni-Tab Navigation Grid</h3>
                      <p className="text-xs font-mono text-slate-400">
                        The Main AI has full visibility into all 26 dashboard tabs. Click any tab to switch view immediately.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {tabCategories.map((cat, idx) => (
                        <div key={idx} className="space-y-2">
                          <h4 className={`text-xs font-mono font-bold px-2 py-0.5 rounded border inline-block ${cat.color}`}>
                            {cat.name}
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {cat.tabs.map((tab) => {
                              const IconComponent = tab.icon;
                              const isActive = currentTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  onClick={() => handleAiNavigateTab(tab.id)}
                                  className={`p-2.5 rounded-lg border text-left transition-all flex items-start gap-2.5 font-mono ${
                                    isActive
                                      ? "bg-cyan-950 border-cyan-400 text-white shadow-md shadow-cyan-950/50 ring-1 ring-cyan-400"
                                      : "bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700 hover:text-white"
                                  }`}
                                >
                                  <IconComponent className={`w-4 h-4 mt-0.5 ${isActive ? "text-cyan-400 animate-pulse" : "text-slate-400"}`} />
                                  <div className="overflow-hidden">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-xs truncate">{tab.label}</span>
                                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{tab.desc}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. SCREEN & VISUAL GROUNDING */}
                {selectedSubTab === "screen" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-mono font-bold text-white">Visual Grounding & UI Elements</h3>
                        <p className="text-xs font-mono text-slate-400">
                          Inspect detected interactive controls, coordinates, and bounding boxes.
                        </p>
                      </div>
                      <Button
                        disabled={isAnalyzing}
                        onClick={handleAnalyzeActiveScreen}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs gap-1.5"
                      >
                        {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        Re-Analyze Screen
                      </Button>
                    </div>

                    {currentScreenshot ? (
                      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video max-h-64 flex items-center justify-center">
                        <img src={currentScreenshot} alt="Live Screen" className="w-full h-full object-contain" />
                        {/* Overlaid bounding boxes */}
                        {detectedElements.map((el, i) => (
                          <div
                            key={i}
                            style={{
                              left: `${(el.center?.x / 1920) * 100}%`,
                              top: `${(el.center?.y / 1080) * 100}%`,
                            }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                            onClick={() => {
                              setTargetX(el.center?.x);
                              setTargetY(el.center?.y);
                              toast.info(`Selected element: ${el.name} at (${el.center?.x}, ${el.center?.y})`);
                              setSelectedSubTab("interact");
                            }}
                          >
                            <div className="w-3.5 h-3.5 rounded-full bg-cyan-400/80 ring-2 ring-cyan-200 border border-slate-950 animate-ping absolute" />
                            <div className="w-3.5 h-3.5 rounded-full bg-cyan-500 ring-2 ring-cyan-300 border border-slate-950 relative flex items-center justify-center text-[8px] font-bold text-slate-950">
                              {i + 1}
                            </div>
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded bg-slate-900 border border-cyan-500 text-[10px] font-mono text-cyan-300 whitespace-nowrap z-20 shadow-lg">
                              {el.name} ({el.center?.x}, {el.center?.y})
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center font-mono text-xs text-slate-400">
                        No live screen frame captured yet. Start screen sharing or connect mobile stream to analyze.
                      </div>
                    )}

                    {detectedElements.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-mono font-bold text-slate-300">
                          Identified Interactive Elements ({detectedElements.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                          {detectedElements.map((el, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                setTargetX(el.center?.x || 960);
                                setTargetY(el.center?.y || 540);
                                setSelectedSubTab("interact");
                                toast.info(`Loaded target: ${el.name}`);
                              }}
                              className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 cursor-pointer transition-all flex items-center justify-between font-mono text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 flex items-center justify-center font-bold text-[10px]">
                                  {i + 1}
                                </span>
                                <div>
                                  <div className="font-bold text-white truncate max-w-[140px]">{el.name}</div>
                                  <div className="text-[10px] text-slate-400 capitalize">{el.type} • {el.center?.x},{el.center?.y}</div>
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-cyan-300 hover:bg-cyan-950">
                                Target & Click
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. BUTTON CLICKER & TEXT INSERTER */}
                {selectedSubTab === "interact" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-mono font-bold text-white mb-1">Interactive Action Dispatcher</h3>
                      <p className="text-xs font-mono text-slate-400">
                        Instruct Main AI to click buttons, double-click, right-click, type text, or trigger key combinations.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Action Type & Coordinates */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                        <label className="text-xs font-mono font-bold text-amber-300 block">1. Action Mode</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { id: "click", label: "Single Click" },
                            { id: "double_click", label: "Double Click" },
                            { id: "right_click", label: "Right Click" },
                            { id: "type_text", label: "Type Text" },
                            { id: "press_key", label: "Press Key" },
                            { id: "drag_drop", label: "Drag Drop" },
                          ].map((a) => (
                            <button
                              key={a.id}
                              onClick={() => setInteractAction(a.id)}
                              className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold capitalize transition-all ${
                                interactAction === a.id
                                  ? "bg-amber-600 text-slate-950 shadow-md font-black"
                                  : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-mono text-slate-400 block mb-1">Target X Coord</label>
                            <Input
                              type="number"
                              value={targetX}
                              onChange={(e) => setTargetX(parseInt(e.target.value) || 0)}
                              className="font-mono text-xs bg-slate-900 border-slate-700"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-mono text-slate-400 block mb-1">Target Y Coord</label>
                            <Input
                              type="number"
                              value={targetY}
                              onChange={(e) => setTargetY(parseInt(e.target.value) || 0)}
                              className="font-mono text-xs bg-slate-900 border-slate-700"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-mono text-slate-400 block mb-1">Delay Buffer (ms)</label>
                          <Input
                            type="number"
                            value={actionDelay}
                            onChange={(e) => setActionDelay(parseInt(e.target.value) || 300)}
                            className="font-mono text-xs bg-slate-900 border-slate-700"
                          />
                        </div>
                      </div>

                      {/* Payload / Key Selector */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                        <label className="text-xs font-mono font-bold text-amber-300 block">2. Text / Key Payload</label>

                        <div>
                          <label className="text-[11px] font-mono text-slate-400 block mb-1">Text String Payload</label>
                          <Input
                            placeholder="e.g. 'admin@system.local' or search query"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            className="font-mono text-xs bg-slate-900 border-slate-700"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-mono text-slate-400 block mb-1">Keypress Combination</label>
                          <select
                            value={selectedKey}
                            onChange={(e) => setSelectedKey(e.target.value)}
                            className="w-full h-9 rounded-md bg-slate-900 border border-slate-700 px-3 text-xs font-mono text-white"
                          >
                            <option value="enter">Enter / Return</option>
                            <option value="escape">Escape</option>
                            <option value="tab">Tab</option>
                            <option value="space">Spacebar</option>
                            <option value="backspace">Backspace</option>
                            <option value="up">Arrow Up</option>
                            <option value="down">Arrow Down</option>
                            <option value="left">Arrow Left</option>
                            <option value="right">Arrow Right</option>
                          </select>
                        </div>

                        <div className="pt-2">
                          <Button
                            onClick={() => handleDispatchInteraction()}
                            className="w-full h-10 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-mono font-bold gap-2 shadow-lg"
                          >
                            <Zap className="w-4 h-4 text-yellow-200" />
                            Dispatch {interactAction.toUpperCase()} to {targetDevice.toUpperCase()}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. WORKFLOW HEALER & AUTO-FIX */}
                {selectedSubTab === "workflow-fix" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-mono font-bold text-white">Workflow Healer & Auto-Optimizer</h3>
                        <p className="text-xs font-mono text-slate-400">
                          AI detects drifted button coordinates, adjusts delays, and adds failover escape routes.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={isRepairing || activeSequence.length === 0}
                          onClick={handleAutoFixWorkflow}
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs gap-1.5"
                        >
                          {isRepairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                          Heal & Repair ({activeSequence.length} Steps)
                        </Button>
                        {onRunSequence && (
                          <Button
                            onClick={() => {
                              onRunSequence();
                              setIsOpen(false);
                            }}
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5" /> Run Sequence
                          </Button>
                        )}
                      </div>
                    </div>

                    {activeSequence.length > 0 ? (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1 font-mono text-xs">
                        {activeSequence.map((step, idx) => (
                          <div
                            key={step.id || idx}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-md bg-indigo-950 border border-indigo-700 text-indigo-300 flex items-center justify-center font-bold text-xs">
                                #{idx + 1}
                              </span>
                              <div>
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span>{step.name || `Step ${idx + 1}`}</span>
                                  <Badge className="bg-slate-900 text-slate-400 border-slate-700 text-[9px] capitalize">
                                    {step.action}
                                  </Badge>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Position: ({step.x}, {step.y}) • Delay: {step.delayMs}ms {step.text ? `• Text: "${step.text}"` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  handleDispatchInteraction({ action: step.action, x: step.x, y: step.y, text: step.text });
                                }}
                                className="h-7 text-[10px] text-indigo-300 hover:bg-indigo-950"
                              >
                                Test Step
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center font-mono text-xs text-slate-400">
                        No sequence steps loaded. Record steps in Sequence Studio or let Main AI generate one!
                      </div>
                    )}
                  </div>
                )}

                {/* 6. SETTINGS TAB */}
                {selectedSubTab === "settings" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-mono font-bold text-white mb-1">Global Engine Preferences</h3>
                      <p className="text-xs font-mono text-slate-400">
                        Main AI can dynamically adjust hardware execution targets, humanized mouse drift, and anti-tunneling preview.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
                      {/* Target Device */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <label className="font-bold text-white block">Execution Target Device</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleUpdateSetting("targetDevice", "desktop")}
                            className={`p-2 rounded-lg border font-bold flex items-center justify-center gap-2 ${
                              targetDevice === "desktop" ? "bg-cyan-600 text-white border-cyan-400" : "bg-slate-900 text-slate-400 border-slate-800"
                            }`}
                          >
                            <Monitor className="w-4 h-4" /> Desktop (PC)
                          </button>
                          <button
                            onClick={() => handleUpdateSetting("targetDevice", "android")}
                            className={`p-2 rounded-lg border font-bold flex items-center justify-center gap-2 ${
                              targetDevice === "android" ? "bg-emerald-600 text-white border-emerald-400" : "bg-slate-900 text-slate-400 border-slate-800"
                            }`}
                          >
                            <Smartphone className="w-4 h-4" /> Android (Phone)
                          </button>
                        </div>
                      </div>

                      {/* Movement Mode */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <label className="font-bold text-white block">Mouse Movement Variation Mode</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["exact", "variation", "live"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => handleUpdateSetting("movementMode", m)}
                              className={`p-2 rounded-lg border font-bold capitalize ${
                                movementMode === m ? "bg-amber-600 text-white border-amber-400" : "bg-slate-900 text-slate-400 border-slate-800"
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Drift Slider */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="font-bold text-white">Human Drift (0 - 12px)</label>
                          <span className="text-amber-400 font-bold">{driftPx}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={12}
                          value={driftPx}
                          onChange={(e) => handleUpdateSetting("driftPx", parseInt(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      {/* Anti-Loop */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 flex flex-col justify-between">
                        <div>
                          <label className="font-bold text-white block">Anti-Loop Frozen Preview</label>
                          <p className="text-[10px] text-slate-400">Prevents infinite screen tunneling when sharing entire desktop.</p>
                        </div>
                        <button
                          onClick={() => handleUpdateSetting("antiLoopEnabled", !antiLoopEnabled)}
                          className={`p-2 rounded-lg border font-bold ${
                            antiLoopEnabled ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-red-950 text-red-300 border-red-700"
                          }`}
                        >
                          {antiLoopEnabled ? "● Anti-Loop ON (Safe)" : "○ Anti-Loop OFF (Live Stream)"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar: Real-Time Audit Log & Director Telemetry (1 col) */}
              <div className="p-6 bg-slate-950/60 overflow-y-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    Director Execution Logs
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAiLogs([])}
                    className="h-6 text-[10px] font-mono text-slate-400 hover:text-white"
                  >
                    Clear
                  </Button>
                </div>

                <div className="space-y-2.5 font-mono text-xs">
                  {aiLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-left ${
                        log.status === "running"
                          ? "bg-purple-950/40 border-purple-700/60 text-purple-200 animate-pulse"
                          : log.status === "failed"
                          ? "bg-red-950/40 border-red-700/60 text-red-200"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-bold text-cyan-300 capitalize">{log.type}</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="font-bold text-white">{log.title}</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{log.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
