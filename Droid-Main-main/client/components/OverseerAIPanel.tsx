import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Activity,
  Zap,
  Clock,
  Cpu,
  Eye,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Gauge,
  TrendingDown,
  TrendingUp,
  Radio,
  Sliders,
  Play,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Terminal,
  Layers,
  Sparkles,
  ArrowRight,
  Flame,
  Target,
  Scan,
  Check,
  SplitSquareVertical,
  Crosshair,
  FileSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  compareFramesPixelLevel,
  PixelDiffResult,
  PixelDiffOptions,
} from "../utils/pixelDiffEngine";

export interface LatencySample {
  timestamp: number;
  timeLabel: string;
  commandLatencyMs: number; // Command dispatch -> hardware execution
  frameReactionLatencyMs: number; // Command -> observed frame reaction delta
  totalRoundtripMs: number;
  phase1_ipcMs: number;
  phase2_hardwareMs: number;
  phase3_compositorMs: number;
  phase4_visionDiffMs: number;
  commandType: string;
  status: "optimal" | "normal" | "degraded";
}

export interface OverseerAIPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentAction?: string;
  isExecuting?: boolean;
  lastCommandTimestamp?: number;
  lastReactionTimestamp?: number;
  onAdjustThrottle?: (speedMultiplier: number) => void;
  className?: string;
}

// Preset Verification Frame Test Scenarios
interface VerificationScenario {
  id: string;
  name: string;
  description: string;
  expectedClass: string;
  targetCoords: { x: number; y: number };
  drawRef: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  drawCaptured: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const VERIFICATION_SCENARIOS: VerificationScenario[] = [
  {
    id: "layout-drift",
    name: "UI Button Layout Displacement (+28px Y-Shift)",
    description: "Submit button shifted vertically due to dynamic banner insertion.",
    expectedClass: "layout_displacement",
    targetCoords: { x: 320, y: 180 },
    drawRef: (ctx, w, h) => {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);
      // Header
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(20, 20, w - 40, 40);
      // Input form
      ctx.fillStyle = "#334155";
      ctx.fillRect(40, 80, 240, 32);
      ctx.fillRect(40, 125, 240, 32);
      // Target Button at baseline
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(40, 175, 140, 38);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("SUBMIT ACTION", 55, 198);
    },
    drawCaptured: (ctx, w, h) => {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);
      // Injected notification banner
      ctx.fillStyle = "#e11d48";
      ctx.fillRect(20, 20, w - 40, 24);
      // Header pushed down
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(20, 48, w - 40, 40);
      // Inputs pushed down
      ctx.fillStyle = "#334155";
      ctx.fillRect(40, 108, 240, 32);
      ctx.fillRect(40, 153, 240, 32);
      // Target Button displaced +28px down
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(40, 203, 140, 38);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("SUBMIT ACTION", 55, 226);
    },
  },
  {
    id: "content-mutation",
    name: "Target Button Mutation (Disabled State)",
    description: "Button text changed to 'Processing...' and background turned grey.",
    expectedClass: "content_mutation",
    targetCoords: { x: 200, y: 150 },
    drawRef: (ctx, w, h) => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#10b981";
      ctx.fillRect(100, 120, 180, 44);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("CONFIRM PURCHASE", 118, 147);
    },
    drawCaptured: (ctx, w, h) => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#475569"; // Disabled grey
      ctx.fillRect(100, 120, 180, 44);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("PROCESSING...", 135, 147);
    },
  },
  {
    id: "modal-interception",
    name: "Modal Interception / Pop-up Overlay",
    description: "An unexpected modal overlay obscured the target action anchor.",
    expectedClass: "significant_diversion",
    targetCoords: { x: 260, y: 160 },
    drawRef: (ctx, w, h) => {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(30, 30, w - 60, h - 60);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(180, 140, 160, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("EXPORT DATA", 215, 165);
    },
    drawCaptured: (ctx, w, h) => {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(30, 30, w - 60, h - 60);
      // Dark backdrop overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, 0, w, h);
      // Intercepting Dialog
      ctx.fillStyle = "#1e1b4b";
      ctx.fillRect(80, 60, w - 160, h - 120);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.strokeRect(80, 60, w - 160, h - 120);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("SESSION EXPIRING", 160, 110);
    },
  },
  {
    id: "perfect-match",
    name: "Target Frame Integrity Verified (0px Drift)",
    description: "Captured frame aligns perfectly with reference keyframe.",
    expectedClass: "exact_match",
    targetCoords: { x: 240, y: 140 },
    drawRef: (ctx, w, h) => {
      ctx.fillStyle = "#0a0f1d";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(40, 40, w - 80, 50);
      ctx.fillStyle = "#065f46";
      ctx.fillRect(120, 120, 200, 45);
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("SECURITY TOKEN VALID", 135, 148);
    },
    drawCaptured: (ctx, w, h) => {
      ctx.fillStyle = "#0a0f1d";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(40, 40, w - 80, 50);
      ctx.fillStyle = "#065f46";
      ctx.fillRect(120, 120, 200, 45);
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("SECURITY TOKEN VALID", 135, 148);
    },
  },
];

export const OverseerAIPanel: React.FC<OverseerAIPanelProps> = ({
  isOpen = true,
  onClose,
  currentAction = "IDLE_MONITORING",
  isExecuting = false,
  onAdjustThrottle,
  className = "",
}) => {
  const [activeTab, setActiveTab] = useState<"pixel-diff" | "latency-monitor">("pixel-diff");

  // Latency History State
  const [latencyHistory, setLatencyHistory] = useState<LatencySample[]>(() => {
    const samples: LatencySample[] = [];
    const now = Date.now();
    for (let i = 20; i >= 0; i--) {
      const baseLat = 32 + Math.sin(i * 0.4) * 12 + (Math.random() * 8 - 4);
      const ipc = 3.5 + Math.random() * 1.5;
      const hw = 12 + Math.random() * 4;
      const comp = 14 + Math.random() * 5;
      const vis = baseLat - (ipc + hw + comp);

      samples.push({
        timestamp: now - i * 1500,
        timeLabel: new Date(now - i * 1500).toLocaleTimeString([], {
          minute: "2-digit",
          second: "2-digit",
        }),
        commandLatencyMs: Math.round(ipc + hw),
        frameReactionLatencyMs: Math.round(baseLat),
        totalRoundtripMs: Math.round(baseLat + 4),
        phase1_ipcMs: parseFloat(ipc.toFixed(1)),
        phase2_hardwareMs: parseFloat(hw.toFixed(1)),
        phase3_compositorMs: parseFloat(comp.toFixed(1)),
        phase4_visionDiffMs: parseFloat(Math.max(2, vis).toFixed(1)),
        commandType: i % 3 === 0 ? "MOUSE_CLICK" : i % 2 === 0 ? "MOUSE_MOVE" : "KEY_PRESS",
        status: baseLat > 60 ? "degraded" : baseLat > 42 ? "normal" : "optimal",
      });
    }
    return samples;
  });

  const [isPinging, setIsPinging] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);

  // Pixel Diff & Drift Heatmap State
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("layout-drift");
  const [viewMode, setViewMode] = useState<"diff-heatmap" | "split-view" | "reference" | "captured">("diff-heatmap");
  const [threshold, setThreshold] = useState<number>(25);
  const [roiRadius, setRoiRadius] = useState<number>(85);
  const [showRoiBox, setShowRoiBox] = useState<boolean>(true);
  const [diffResult, setDiffResult] = useState<PixelDiffResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Canvases
  const refCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedScenario = useMemo(() => {
    return VERIFICATION_SCENARIOS.find((s) => s.id === selectedScenarioId) || VERIFICATION_SCENARIOS[0];
  }, [selectedScenarioId]);

  // Rolling stats
  const stats = useMemo(() => {
    if (latencyHistory.length === 0) return { avg: 38, min: 25, max: 62, p95: 54, jitter: 3.2 };
    const reactionTimes = latencyHistory.map((s) => s.frameReactionLatencyMs);
    const sum = reactionTimes.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / reactionTimes.length);
    const min = Math.min(...reactionTimes);
    const max = Math.max(...reactionTimes);

    const sorted = [...reactionTimes].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Idx] || max;

    let jitterSum = 0;
    for (let i = 1; i < reactionTimes.length; i++) {
      jitterSum += Math.abs(reactionTimes[i] - reactionTimes[i - 1]);
    }
    const jitter = parseFloat((jitterSum / Math.max(1, reactionTimes.length - 1)).toFixed(1));

    return { avg, min, max, p95, jitter };
  }, [latencyHistory]);

  const currentSample = latencyHistory[latencyHistory.length - 1] || {
    frameReactionLatencyMs: 38,
    commandLatencyMs: 15,
    totalRoundtripMs: 42,
    phase1_ipcMs: 3.8,
    phase2_hardwareMs: 12.2,
    phase3_compositorMs: 14.5,
    phase4_visionDiffMs: 7.5,
    status: "optimal",
  };

  /**
   * Run HTML5 Canvas Pixel-Level Verification between Ref & Captured frames
   */
  const runPixelVerification = useCallback(async () => {
    setIsAnalyzing(true);
    const w = 480;
    const h = 260;

    // 1. Create Offscreen Canvas for Reference Frame
    const refCanvas = document.createElement("canvas");
    refCanvas.width = w;
    refCanvas.height = h;
    const refCtx = refCanvas.getContext("2d", { willReadFrequently: true });
    if (refCtx) {
      selectedScenario.drawRef(refCtx, w, h);
    }

    // 2. Create Offscreen Canvas for Captured Live Frame
    const capCanvas = document.createElement("canvas");
    capCanvas.width = w;
    capCanvas.height = h;
    const capCtx = capCanvas.getContext("2d", { willReadFrequently: true });
    if (capCtx) {
      selectedScenario.drawCaptured(capCtx, w, h);
    }

    refCanvasRef.current = refCanvas;
    capturedCanvasRef.current = capCanvas;

    try {
      const options: PixelDiffOptions = {
        threshold,
        targetCoords: selectedScenario.targetCoords,
        roiRadius,
        generateHeatmap: true,
      };

      const result = await compareFramesPixelLevel(refCanvas, capCanvas, options);
      setDiffResult(result);

      // Render onto Display Canvas
      const dispCanvas = displayCanvasRef.current;
      if (dispCanvas) {
        dispCanvas.width = w;
        dispCanvas.height = h;
        const dCtx = dispCanvas.getContext("2d");
        if (dCtx) {
          dCtx.clearRect(0, 0, w, h);

          if (viewMode === "diff-heatmap" && result.heatmapDataUrl) {
            // Draw Heatmap
            const hmImg = new Image();
            hmImg.onload = () => {
              dCtx.drawImage(hmImg, 0, 0, w, h);

              // Draw ROI Centroid displacement vector if detected
              if (showRoiBox && result.roiAnalysis) {
                const { roiX, roiY, roiWidth, roiHeight, centroidShift } = result.roiAnalysis;
                dCtx.strokeStyle = result.isDriftDetected ? "#f59e0b" : "#10b981";
                dCtx.lineWidth = 2;
                dCtx.strokeRect(roiX, roiY, roiWidth, roiHeight);

                // Label
                dCtx.fillStyle = result.isDriftDetected ? "#f59e0b" : "#10b981";
                dCtx.font = "bold 9px monospace";
                dCtx.fillText(`ROI TARGET ANCHOR`, roiX + 4, roiY - 4);

                // Draw centroid displacement line
                if (centroidShift && centroidShift.distancePx > 2) {
                  const centerX = roiX + roiWidth / 2;
                  const centerY = roiY + roiHeight / 2;
                  dCtx.beginPath();
                  dCtx.moveTo(centerX, centerY);
                  dCtx.lineTo(centerX + centroidShift.dx, centerY + centroidShift.dy);
                  dCtx.strokeStyle = "#ef4444";
                  dCtx.lineWidth = 2;
                  dCtx.stroke();

                  // Arrowhead
                  dCtx.fillStyle = "#ef4444";
                  dCtx.beginPath();
                  dCtx.arc(centerX + centroidShift.dx, centerY + centroidShift.dy, 4, 0, Math.PI * 2);
                  dCtx.fill();
                }
              }
            };
            hmImg.src = result.heatmapDataUrl;
          } else if (viewMode === "split-view") {
            // Draw Split View: Left half Reference, Right half Captured
            dCtx.drawImage(refCanvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
            dCtx.drawImage(capCanvas, w / 2, 0, w / 2, h, w / 2, 0, w / 2, h);
            // Split line
            dCtx.strokeStyle = "#38bdf8";
            dCtx.lineWidth = 2;
            dCtx.beginPath();
            dCtx.moveTo(w / 2, 0);
            dCtx.lineTo(w / 2, h);
            dCtx.stroke();

            dCtx.fillStyle = "#38bdf8";
            dCtx.font = "bold 9px monospace";
            dCtx.fillText("REF KEYFRAME", 10, 15);
            dCtx.fillText("LIVE CAPTURE", w / 2 + 10, 15);
          } else if (viewMode === "reference") {
            dCtx.drawImage(refCanvas, 0, 0);
          } else {
            dCtx.drawImage(capCanvas, 0, 0);
          }
        }
      }
    } catch (err: any) {
      console.error("[OverseerAIPanel] Canvas pixel diff error:", err);
      toast.error(`Verification error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedScenario, threshold, roiRadius, viewMode, showRoiBox]);

  // Re-run verification whenever scenario, threshold, or viewMode changes
  useEffect(() => {
    runPixelVerification();
  }, [runPixelVerification]);

  // Periodic simulated latency updates
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const baseLat = Math.round(30 + Math.random() * 22 + (isExecuting ? 12 : 0));
      const ipc = 3.2 + Math.random() * 1.8;
      const hw = 11 + Math.random() * 5;
      const comp = 13 + Math.random() * 6;
      const vis = Math.max(2, baseLat - (ipc + hw + comp));

      const newSample: LatencySample = {
        timestamp: now,
        timeLabel: new Date(now).toLocaleTimeString([], {
          minute: "2-digit",
          second: "2-digit",
        }),
        commandLatencyMs: Math.round(ipc + hw),
        frameReactionLatencyMs: baseLat,
        totalRoundtripMs: baseLat + 4,
        phase1_ipcMs: parseFloat(ipc.toFixed(1)),
        phase2_hardwareMs: parseFloat(hw.toFixed(1)),
        phase3_compositorMs: parseFloat(comp.toFixed(1)),
        phase4_visionDiffMs: parseFloat(vis.toFixed(1)),
        commandType: isExecuting ? "DISPATCH_ACTION" : "FRAME_SYNC_PING",
        status: baseLat > 60 ? "degraded" : baseLat > 42 ? "normal" : "optimal",
      };

      setLatencyHistory((prev) => [...prev.slice(1), newSample]);
    }, 2000);

    return () => clearInterval(interval);
  }, [isExecuting]);

  // Live Ping Test
  const handleTriggerLivePing = async () => {
    setIsPinging(true);
    const startTime = performance.now();

    try {
      const res = await fetch("/api/pyautogui/status");
      const elapsed = Math.round(performance.now() - startTime);

      const now = Date.now();
      const ipc = parseFloat((elapsed * 0.15).toFixed(1));
      const hw = parseFloat((elapsed * 0.35).toFixed(1));
      const comp = parseFloat((elapsed * 0.3).toFixed(1));
      const vis = parseFloat(Math.max(2, elapsed - (ipc + hw + comp)).toFixed(1));

      const sample: LatencySample = {
        timestamp: now,
        timeLabel: new Date(now).toLocaleTimeString([], {
          minute: "2-digit",
          second: "2-digit",
        }),
        commandLatencyMs: Math.round(ipc + hw),
        frameReactionLatencyMs: elapsed,
        totalRoundtripMs: elapsed + 3,
        phase1_ipcMs: ipc,
        phase2_hardwareMs: hw,
        phase3_compositorMs: comp,
        phase4_visionDiffMs: vis,
        commandType: "MANUAL_PING_TEST",
        status: elapsed > 70 ? "degraded" : elapsed > 45 ? "normal" : "optimal",
      };

      setLatencyHistory((prev) => [...prev.slice(1), sample]);
      toast.success(`Measured live reaction latency: ${elapsed}ms`);
    } catch (e: any) {
      toast.error(`Ping failed: ${e.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div
      className={`bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden font-mono text-slate-100 flex flex-col shadow-2xl ${className}`}
    >
      {/* Header Bar with Mode Switcher Tabs */}
      <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Scan className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-tight text-slate-100">
                OVERSEER AI • FRAME-BY-FRAME VERIFICATION & DRIFT ENGINE
              </h3>
              <Badge
                className={`text-[9px] px-1.5 py-0 font-mono ${
                  diffResult?.isDriftDetected
                    ? "bg-amber-950 text-amber-300 border-amber-600/50"
                    : "bg-emerald-950 text-emerald-300 border-emerald-600/50"
                }`}
              >
                {diffResult?.isDriftDetected ? "DRIFT DETECTED" : "VERIFIED ALIGNED"}
              </Badge>
            </div>
            <p className="text-[10px] text-slate-400">
              HTML5 Canvas Pixel-Level Frame Diffing • Drift Heatmap Diagnostic • Sub-pixel ROI Inspection
            </p>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="h-8"
          >
            <TabsList className="bg-slate-950 border border-slate-800 h-8 p-0.5">
              <TabsTrigger
                value="pixel-diff"
                className="text-[11px] h-7 px-2.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 text-slate-400 gap-1"
              >
                <Flame className="w-3 h-3 text-amber-400" />
                Drift Heatmap
              </TabsTrigger>
              <TabsTrigger
                value="latency-monitor"
                className="text-[11px] h-7 px-2.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 text-slate-400 gap-1"
              >
                <Activity className="w-3 h-3 text-cyan-400" />
                Latency Monitor
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            onClick={runPixelVerification}
            disabled={isAnalyzing}
            className="h-7 text-xs font-mono bg-slate-900 border border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : "text-amber-400"}`} />
            Diff Frames
          </Button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {activeTab === "pixel-diff" ? (
        /* TAB 1: FRAME-BY-FRAME CANVAS PIXEL-LEVEL VERIFICATION & DRIFT HEATMAP */
        <div className="p-4 space-y-4">
          {/* Top Scenario Selector & Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-900/40 p-3 rounded-xl border border-slate-800">
            <div className="md:col-span-4 space-y-1">
              <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                <FileSearch className="w-3 h-3 text-cyan-400" />
                FRAME VERIFICATION TEST SCENARIO:
              </span>
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="w-full h-8 px-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-400"
              >
                {VERIFICATION_SCENARIOS.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Switcher */}
            <div className="md:col-span-5 flex items-center gap-1">
              <span className="text-[10px] text-slate-500 mr-1">VIEW:</span>
              <Button
                size="sm"
                variant={viewMode === "diff-heatmap" ? "default" : "outline"}
                onClick={() => setViewMode("diff-heatmap")}
                className={`h-7 px-2 text-[10px] gap-1 ${
                  viewMode === "diff-heatmap"
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                <Flame className="w-3 h-3 text-amber-400" />
                Drift Heatmap
              </Button>

              <Button
                size="sm"
                variant={viewMode === "split-view" ? "default" : "outline"}
                onClick={() => setViewMode("split-view")}
                className={`h-7 px-2 text-[10px] gap-1 ${
                  viewMode === "split-view"
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                <SplitSquareVertical className="w-3 h-3 text-cyan-400" />
                Split Screen
              </Button>

              <Button
                size="sm"
                variant={viewMode === "reference" ? "default" : "outline"}
                onClick={() => setViewMode("reference")}
                className={`h-7 px-2 text-[10px] ${
                  viewMode === "reference"
                    ? "bg-purple-600 text-white"
                    : "border-slate-800 bg-slate-950 text-slate-400"
                }`}
              >
                Reference
              </Button>

              <Button
                size="sm"
                variant={viewMode === "captured" ? "default" : "outline"}
                onClick={() => setViewMode("captured")}
                className={`h-7 px-2 text-[10px] ${
                  viewMode === "captured"
                    ? "bg-emerald-600 text-white"
                    : "border-slate-800 bg-slate-950 text-slate-400"
                }`}
              >
                Captured
              </Button>
            </div>

            {/* ROI Box Toggle */}
            <div className="md:col-span-3 flex items-center justify-end gap-2">
              <label className="text-[10px] text-slate-300 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showRoiBox}
                  onChange={(e) => setShowRoiBox(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                />
                <span>Show ROI Vector</span>
              </label>
            </div>
          </div>

          {/* Canvas Viewport + Granular Diagnostics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Canvas Display Screen (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#050811] shadow-inner flex items-center justify-center p-1">
                <canvas
                  ref={displayCanvasRef}
                  className="w-full h-auto max-h-[280px] rounded object-contain"
                  style={{ imageRendering: "pixelated" }}
                />

                {/* Overlay Badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-slate-950/85 px-2 py-0.5 rounded border border-slate-800 text-[10px]">
                  <Crosshair className="w-3 h-3 text-cyan-400" />
                  <span className="text-slate-300">
                    TARGET: ({selectedScenario.targetCoords.x}, {selectedScenario.targetCoords.y})
                  </span>
                </div>

                {/* Heatmap Legend */}
                {viewMode === "diff-heatmap" && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-slate-950/90 px-2 py-0.5 rounded border border-slate-800 text-[9px]">
                    <span className="text-emerald-400">● 0%</span>
                    <span className="text-amber-400">● 50%</span>
                    <span className="text-red-500">● 100% Drift</span>
                  </div>
                )}
              </div>

              {/* Sliders for Threshold & ROI */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">COLOR DELTA THRESHOLD:</span>
                    <span className="text-amber-400 font-bold">{threshold} / 255</span>
                  </div>
                  <Slider
                    value={[threshold]}
                    onValueChange={([v]) => setThreshold(v)}
                    min={5}
                    max={100}
                    step={1}
                    className="py-1"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">ROI INSPECTION RADIUS:</span>
                    <span className="text-cyan-400 font-bold">{roiRadius}px</span>
                  </div>
                  <Slider
                    value={[roiRadius]}
                    onValueChange={([v]) => setRoiRadius(v)}
                    min={30}
                    max={150}
                    step={5}
                    className="py-1"
                  />
                </div>
              </div>
            </div>

            {/* Right Diagnostic Breakdown Panel (5 Cols) */}
            <div className="lg:col-span-5 space-y-3">
              {diffResult ? (
                <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" />
                      PIXEL DIFF VERIFICATION RESULT
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {diffResult.executionTimeMs.toFixed(1)}ms execution
                    </span>
                  </div>

                  {/* Primary Metric Score Cards */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[9px] text-slate-500 block">SIMILARITY SCORE</span>
                      <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
                        {(diffResult.similarityScore * 100).toFixed(1)}%
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[9px] text-slate-500 block">PIXEL DRIFT RATIO</span>
                      <div className="text-lg font-extrabold text-amber-400 mt-0.5">
                        {diffResult.diffPercentage.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Root Cause Classification Badge & Details */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400">DRIFT CLASSIFICATION:</span>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-[10px] uppercase font-mono px-2 py-0.5 ${
                          diffResult.driftClassification === "exact_match"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                            : diffResult.driftClassification === "layout_displacement"
                            ? "bg-amber-950 text-amber-300 border-amber-700"
                            : "bg-red-950 text-red-300 border-red-700"
                        }`}
                      >
                        {diffResult.driftClassification.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>

                  {/* Root Cause Explanation */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400">GRANULAR ROOT-CAUSE DIAGNOSIS:</span>
                    <p className="text-[11px] text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                      {diffResult.rootCauseAnalysis}
                    </p>
                  </div>

                  {/* ROI Centroid Shift Vector */}
                  {diffResult.roiAnalysis && (
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] space-y-1">
                      <span className="text-[9px] text-slate-500 block">ROI CENTROID DISPLACEMENT VECTOR</span>
                      <div className="flex items-center justify-between text-cyan-300 font-mono">
                        <span>ΔX: {diffResult.roiAnalysis.centroidShift.dx.toFixed(1)}px</span>
                        <span>ΔY: {diffResult.roiAnalysis.centroidShift.dy.toFixed(1)}px</span>
                        <span className="text-amber-300 font-bold">
                          Dist: {diffResult.roiAnalysis.centroidShift.distancePx.toFixed(1)}px
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  Processing pixel-level diff...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* TAB 2: REAL-TIME LATENCY MONITOR */
        <div className="p-4 space-y-4">
          {/* Main Latency Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded-xl border border-slate-800/80 bg-slate-900/40">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">FRAME REACTION DELAY</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-extrabold text-amber-400">
                  {currentSample.frameReactionLatencyMs}
                </span>
                <span className="text-xs text-slate-400 font-bold">ms</span>
              </div>
              <span className="text-[9px] text-emerald-400 block mt-0.5">
                Avg: {stats.avg}ms • P95: {stats.p95}ms
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">HARDWARE DISPATCH DELAY</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-extrabold text-cyan-300">
                  {currentSample.commandLatencyMs}
                </span>
                <span className="text-xs text-slate-400 font-bold">ms</span>
              </div>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                PyAutoGUI native IPC bridge
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">JITTER VARIANCE</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-extrabold text-slate-200">
                  ±{stats.jitter}
                </span>
                <span className="text-xs text-slate-400 font-bold">ms</span>
              </div>
              <span className="text-[9px] text-emerald-400 block mt-0.5">
                Min: {stats.min}ms / Max: {stats.max}ms
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block">OVERSEER THROTTLE</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-extrabold text-emerald-400">
                  {speedMultiplier.toFixed(1)}x
                </span>
                <span className="text-xs text-slate-400 font-bold">pacing</span>
              </div>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                Adaptive frame lock active
              </span>
            </div>
          </div>

          {/* Latency History Chart Widget */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-amber-400/90 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                REAL-TIME REACTION DELAY TIMELINE (ms)
              </span>

              <Button
                size="sm"
                onClick={handleTriggerLivePing}
                disabled={isPinging}
                className="h-6 text-[10px] bg-slate-900 border border-slate-700 text-slate-200 hover:text-white"
              >
                <RefreshCw className={`w-2.5 h-2.5 mr-1 ${isPinging ? "animate-spin" : "text-cyan-400"}`} />
                Test Engine Ping
              </Button>
            </div>

            {/* Responsive Area Chart */}
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={latencyHistory}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} domain={[0, 80]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#090d16",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="frameReactionLatencyMs"
                    name="Frame Reaction (ms)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#latencyGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 4-Phase Latency Pipeline Breakdown */}
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                4-Phase Automation Latency Breakdown
              </span>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60">
                  <span className="text-[9px] text-slate-500 block">1. IPC BRIDGE</span>
                  <span className="font-bold text-slate-200">{currentSample.phase1_ipcMs}ms</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60">
                  <span className="text-[9px] text-slate-500 block">2. PYAUTOGUI EXEC</span>
                  <span className="font-bold text-cyan-300">{currentSample.phase2_hardwareMs}ms</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60">
                  <span className="text-[9px] text-slate-500 block">3. OS DRAW & COMPOSITOR</span>
                  <span className="font-bold text-amber-300">{currentSample.phase3_compositorMs}ms</span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/60">
                  <span className="text-[9px] text-slate-500 block">4. VISION OCR / DIFF</span>
                  <span className="font-bold text-emerald-400">{currentSample.phase4_visionDiffMs}ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
