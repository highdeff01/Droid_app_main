import React, { useState, useEffect } from "react";
import {
  Sliders,
  History,
  Camera,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Maximize2,
  Sparkles,
  Target,
  Clock,
  Layers,
  MousePointer,
  Keyboard,
  ArrowRight,
  ArrowDownToLine,
  LayoutGrid,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface ScrubberWorkflowStep {
  id: string;
  name: string;
  action: "click" | "double_click" | "right_click" | "drag" | "type" | "hotkey" | "wait" | "launch";
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  text?: string;
  key?: string;
  timestampOffsetSec: number;
  screenshotUrl: string;
  liveDeviationPx: number;
  status: "aligned" | "moderate_drift" | "severe_drift";
  description?: string;
}

export type ScrubberPlacement = "below_preview" | "bottom_drawer";

interface WorkflowHistoryScrubberProps {
  steps?: ScrubberWorkflowStep[];
  currentStepIndex?: number;
  onSelectStep?: (index: number, step: ScrubberWorkflowStep) => void;
  onRecalibrateStep?: (step: ScrubberWorkflowStep) => void;
  onRetrySegment?: (fromIndex: number, toIndex?: number) => void;
  onClose?: () => void;
  liveScreenshotUrl?: string;
  className?: string;
  placement?: ScrubberPlacement;
  onPlacementChange?: (placement: ScrubberPlacement) => void;
}

export const WorkflowHistoryScrubber: React.FC<WorkflowHistoryScrubberProps> = ({
  steps: propSteps,
  currentStepIndex: initialIndex = 0,
  onSelectStep,
  onRecalibrateStep,
  onRetrySegment,
  onClose,
  liveScreenshotUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=80",
  className = "",
  placement: propPlacement,
  onPlacementChange,
}) => {
  const [internalPlacement, setInternalPlacement] = useState<ScrubberPlacement>(() => {
    if (propPlacement) return propPlacement;
    try {
      return (localStorage.getItem("sightline_scrubber_placement") as ScrubberPlacement) || "below_preview";
    } catch {
      return "below_preview";
    }
  });

  const currentPlacement = propPlacement || internalPlacement;

  const handlePlacementToggle = (newPlacement: ScrubberPlacement) => {
    setInternalPlacement(newPlacement);
    try {
      localStorage.setItem("sightline_scrubber_placement", newPlacement);
    } catch {}
    if (onPlacementChange) {
      onPlacementChange(newPlacement);
    }
    toast.info(`Scrubber Position: ${newPlacement === "below_preview" ? "Below App Preview" : "Bottom Drawer"}`);
  };
  // Fallback rich workflow steps with timestamps and screenshots
  const defaultSteps: ScrubberWorkflowStep[] = [
    {
      id: "scrub_step_01",
      name: "1. Focus Workspace Input",
      action: "click",
      x: 480,
      y: 160,
      timestampOffsetSec: 0.0,
      screenshotUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=80",
      liveDeviationPx: 1.5,
      status: "aligned",
      description: "Clicked search input coordinate (480, 160). UI matching 99.2%.",
    },
    {
      id: "scrub_step_02",
      name: "2. Type Query Term",
      action: "type",
      x: 480,
      y: 160,
      text: "autonomous_vision_pipeline",
      timestampOffsetSec: 1.45,
      screenshotUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&auto=format&fit=crop&q=80",
      liveDeviationPx: 2.1,
      status: "aligned",
      description: "Dispatched keyboard sequence 'autonomous_vision_pipeline' via PyAutoGUI.",
    },
    {
      id: "scrub_step_03",
      name: "3. Click Primary Filter Tag",
      action: "click",
      x: 720,
      y: 220,
      timestampOffsetSec: 3.1,
      screenshotUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&auto=format&fit=crop&q=80",
      liveDeviationPx: 18.4,
      status: "severe_drift",
      description: "Significant layout drift detected! Target shifted rightwards (+18.4px).",
    },
    {
      id: "scrub_step_04",
      name: "4. Drag Result Card",
      action: "drag",
      x: 880,
      y: 450,
      toX: 1240,
      toY: 450,
      timestampOffsetSec: 5.6,
      screenshotUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&auto=format&fit=crop&q=80",
      liveDeviationPx: 12.6,
      status: "moderate_drift",
      description: "Drag-drop path traversed horizontally. Moderate coordinate drift (+12.6px).",
    },
    {
      id: "scrub_step_05",
      name: "5. Confirm Modal Dialog",
      action: "click",
      x: 960,
      y: 680,
      timestampOffsetSec: 7.8,
      screenshotUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=80",
      liveDeviationPx: 24.2,
      status: "severe_drift",
      description: "Modal CTA shifted vertically. High probability of automation failure without recalibration.",
    },
  ];

  const steps = propSteps && propSteps.length > 0 ? propSteps : defaultSteps;
  const [activeIndex, setActiveIndex] = useState<number>(initialIndex);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [compareMode, setCompareMode] = useState<"single" | "side_by_side" | "diff">("side_by_side");

  const currentStep = steps[activeIndex] || steps[0];

  // Auto-play timeline scrubbing loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1 >= steps.length ? 0 : prev + 1));
    }, 1800);
    return () => clearInterval(interval);
  }, [isPlaying, steps.length]);

  const handleScrubChange = (newIndex: number) => {
    setActiveIndex(newIndex);
    if (onSelectStep && steps[newIndex]) {
      onSelectStep(newIndex, steps[newIndex]);
    }
  };

  const handleTriggerStepRecalibrate = () => {
    if (onRecalibrateStep) {
      onRecalibrateStep(currentStep);
    } else {
      toast.success(`Re-calibrated Step #${activeIndex + 1} (${currentStep.name}) coordinates.`);
    }
  };

  const handleTriggerRetrySegment = async (fromIdx: number, toIdx?: number) => {
    setIsRetrying(true);
    try {
      if (onRetrySegment) {
        onRetrySegment(fromIdx, toIdx);
      } else {
        const res = await fetch("/api/pyautogui/retry-segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            steps: steps.slice(fromIdx, typeof toIdx === "number" ? toIdx + 1 : undefined),
            segmentStartIndex: fromIdx,
            segmentEndIndex: toIdx ?? steps.length - 1,
            reason: `History Scrubber retry from Step #${fromIdx + 1}`,
          }),
        });
        if (res.ok) {
          toast.success(`Segment Retried: Step #${fromIdx + 1}`, {
            description: "Targeted action re-dispatched via PyAutoGUI.",
          });
        }
      }
    } catch (err: any) {
      toast.error(`Retry Segment failed: ${err.message}`);
    } finally {
      setIsRetrying(false);
    }
  };

  if (isMinimized) {
    return (
      <div
        id="workflow-history-scrubber-minimized"
        className={`rounded-xl border border-cyan-800/80 bg-slate-950/95 p-2.5 shadow-xl flex items-center justify-between font-mono text-xs text-slate-200 ${className}`}
      >
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="font-bold text-cyan-300">History Scrubber:</span>
          <span>
            Step {activeIndex + 1}/{steps.length}: <strong className="text-white">{currentStep.name}</strong>
          </span>
          <Badge className="bg-slate-800 text-slate-300 text-[9px] font-mono">
            Δ {currentStep.liveDeviationPx.toFixed(1)}px
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Placement Switcher Pill */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 text-[10px] font-mono">
            <button
              onClick={() => handlePlacementToggle("below_preview")}
              className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                currentPlacement === "below_preview"
                  ? "bg-cyan-600 text-white font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Place History Scrubber directly below app preview"
            >
              <ArrowDownToLine className="w-2.5 h-2.5" />
              Below Preview
            </button>
            <button
              onClick={() => handlePlacementToggle("bottom_drawer")}
              className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                currentPlacement === "bottom_drawer"
                  ? "bg-cyan-600 text-white font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Dock History Scrubber at bottom drawer"
            >
              <LayoutGrid className="w-2.5 h-2.5" />
              Bottom
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            aria-label="Previous step in minimized scrubber"
            onClick={() => handleScrubChange(Math.max(0, activeIndex - 1))}
            disabled={activeIndex <= 0}
            className="h-6 w-6 p-0 bg-slate-900 border-slate-700"
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            aria-label="Next step in minimized scrubber"
            onClick={() => handleScrubChange(Math.min(steps.length - 1, activeIndex + 1))}
            disabled={activeIndex >= steps.length - 1}
            className="h-6 w-6 p-0 bg-slate-900 border-slate-700"
          >
            <ChevronRight className="w-3 h-3" />
          </Button>

          <Button
            size="sm"
            onClick={() => setIsMinimized(false)}
            aria-label="Expand Workflow Scrubber"
            className="h-6 px-2 text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white font-bold"
          >
            Expand Scrubber
          </Button>

          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white px-1 text-xs font-bold"
              title="Close Scrubber"
              aria-label="Close Workflow Scrubber"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id="workflow-history-scrubber"
      className={`rounded-xl border border-slate-800 bg-slate-950/95 backdrop-blur-md p-4 shadow-2xl flex flex-col font-sans space-y-3 ${className}`}
    >
      {/* Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/90 border border-cyan-600/80 text-cyan-400 shadow-sm">
            <History className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Workflow History Scrubber
              </h3>
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px] font-mono px-1.5 py-0">
                Timeline & Drift Inspector
              </Badge>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                {currentPlacement === "below_preview" ? "📍 Position: Below Preview" : "📍 Position: Bottom Drawer"}
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Scrub through captured steps to pinpoint where physical coordinate drift occurred
            </p>
          </div>
        </div>

        {/* Play / Pause & Step Navigation Controls & Placement Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Position Setting Toggle */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 text-[11px] font-mono">
            <button
              onClick={() => handlePlacementToggle("below_preview")}
              className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${
                currentPlacement === "below_preview"
                  ? "bg-cyan-600 text-white font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Place History Scrubber directly below app preview"
            >
              <ArrowDownToLine className="w-3 h-3" />
              Below Preview
            </button>
            <button
              onClick={() => handlePlacementToggle("bottom_drawer")}
              className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${
                currentPlacement === "bottom_drawer"
                  ? "bg-cyan-600 text-white font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Dock History Scrubber at bottom drawer"
            >
              <LayoutGrid className="w-3 h-3" />
              Bottom Drawer
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            aria-label="Previous step in workflow scrubber"
            onClick={() => handleScrubChange(Math.max(0, activeIndex - 1))}
            disabled={activeIndex <= 0}
            className="h-7 w-7 p-0 border-slate-700 text-slate-300 hover:text-white bg-slate-900"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            aria-label={isPlaying ? "Pause Workflow Scrubber playback" : "Play Flow in Workflow Scrubber"}
            onClick={() => setIsPlaying(!isPlaying)}
            className="h-7 px-2 text-xs border-cyan-800 text-cyan-300 hover:bg-cyan-950/80 bg-slate-900 gap-1 font-mono"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isPlaying ? "Pause" : "Play Flow"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            aria-label="Next step in workflow scrubber"
            onClick={() => handleScrubChange(Math.min(steps.length - 1, activeIndex + 1))}
            disabled={activeIndex >= steps.length - 1}
            className="h-7 w-7 p-0 border-slate-700 text-slate-300 hover:text-white bg-slate-900"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsMinimized(true)}
            className="h-7 px-2 text-[11px] font-mono text-slate-400 hover:text-white hover:bg-slate-800"
            title="Minimize Scrubber to Compact Bar"
            aria-label="Minimize Scrubber to Compact Bar"
          >
            Minimize
          </Button>

          {onClose && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-7 w-7 p-0 text-slate-400 hover:text-white"
              title="Close Scrubber"
              aria-label="Close Workflow Scrubber"
            >
              ✕
            </Button>
          )}
        </div>
      </div>

      {/* Scrubber Timeline Track with Color-Coded Drift Markers */}
      <div className="space-y-1.5 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-bold">
            Step {activeIndex + 1} of {steps.length}: <span className="text-cyan-300">{currentStep.name}</span>
          </span>
          <span className="text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            T+{(currentStep.timestampOffsetSec || activeIndex * 1.5).toFixed(2)}s
          </span>
        </div>

        {/* Discrete Step Slider */}
        <div className="relative pt-2 pb-1">
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={activeIndex}
            onChange={(e) => handleScrubChange(parseInt(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-950 rounded-lg"
          />

          {/* Step Notches with Drift Color Indicators */}
          <div className="flex justify-between items-center px-1 pt-1.5">
            {steps.map((step, idx) => {
              const isSelected = idx === activeIndex;
              const isSevere = step.status === "severe_drift" || step.liveDeviationPx > 14;
              const isModerate = step.status === "moderate_drift" || (step.liveDeviationPx > 6 && step.liveDeviationPx <= 14);

              return (
                <button
                  key={step.id || idx}
                  onClick={() => handleScrubChange(idx)}
                  className={`flex flex-col items-center gap-1 transition-all group ${
                    isSelected ? "scale-110" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-mono font-bold ${
                      isSevere
                        ? "bg-red-500 border-red-300 text-white shadow-md shadow-red-500/50"
                        : isModerate
                        ? "bg-amber-500 border-amber-300 text-slate-950 shadow-md shadow-amber-500/50"
                        : "bg-emerald-500 border-emerald-300 text-slate-950 shadow-md shadow-emerald-500/50"
                    } ${isSelected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950" : ""}`}
                  >
                    {idx + 1}
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 group-hover:text-white">
                    {step.liveDeviationPx.toFixed(0)}px
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Visual Step & Drift Comparison Stage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Left: Captured Recorded Screenshot at this Step */}
        <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono">
            <span className="text-cyan-300 font-bold flex items-center gap-1">
              <Camera className="w-3 h-3 text-cyan-400" /> Recorded Snapshot (Step #{activeIndex + 1})
            </span>
            <Badge className="bg-slate-800 text-slate-300 text-[9px] px-1.5 py-0 font-mono">
              Target ({currentStep.x}, {currentStep.y})
            </Badge>
          </div>

          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
            <img
              src={currentStep.screenshotUrl || liveScreenshotUrl}
              alt={currentStep.name}
              className="w-full h-full object-cover opacity-90"
            />

            {/* Target Reticle at Recorded Coordinate */}
            <div
              style={{
                left: `${(currentStep.x / 1920) * 100}%`,
                top: `${(currentStep.y / 1080) * 100}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            >
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-500/20 flex items-center justify-center animate-pulse">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
              </div>
              <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-cyan-950/90 border border-cyan-600 text-cyan-200 text-[9px] font-mono px-1.5 py-0.5 rounded shadow">
                Recorded @ ({currentStep.x}, {currentStep.y})
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Frame & Drift Analysis */}
        <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono">
            <span className="text-emerald-300 font-bold flex items-center gap-1">
              <Eye className="w-3 h-3 text-emerald-400" /> Live Stream Comparison
            </span>
            <Badge
              className={`text-[9px] px-1.5 py-0 font-mono ${
                currentStep.status === "severe_drift"
                  ? "bg-red-950 text-red-300 border-red-700"
                  : currentStep.status === "moderate_drift"
                  ? "bg-amber-950 text-amber-300 border-amber-700"
                  : "bg-emerald-950 text-emerald-300 border-emerald-700"
              }`}
            >
              Drift: Δ {currentStep.liveDeviationPx.toFixed(1)}px
            </Badge>
          </div>

          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
            <img
              src={liveScreenshotUrl}
              alt="Live Screen"
              className="w-full h-full object-cover"
            />

            {/* Live Reticle & Drift Vector Arrow */}
            {currentStep.liveDeviationPx > 6 ? (
              <div
                style={{
                  left: `${((currentStep.x + currentStep.liveDeviationPx) / 1920) * 100}%`,
                  top: `${((currentStep.y + currentStep.liveDeviationPx * 0.6) / 1080) * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              >
                <div className="w-8 h-8 rounded-full border-2 border-red-500 bg-red-500/25 flex items-center justify-center animate-ping">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
                <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-950/90 border border-red-600 text-red-200 text-[9px] font-mono px-1.5 py-0.5 rounded shadow">
                  Shifted Live Target (Δ {currentStep.liveDeviationPx.toFixed(1)}px)
                </div>
              </div>
            ) : (
              <div
                style={{
                  left: `${(currentStep.x / 1920) * 100}%`,
                  top: `${(currentStep.y / 1080) * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              >
                <div className="w-6 h-6 rounded-full border border-emerald-400 bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step Detail & Recalibration Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
        <div className="space-y-0.5 flex-1 min-w-[200px]">
          <div className="text-white font-semibold flex items-center gap-1.5">
            <span>Action: <span className="font-mono text-cyan-300 uppercase">{currentStep.action}</span></span>
            {currentStep.text && <span className="text-slate-400 font-mono text-[11px]">("{currentStep.text}")</span>}
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">{currentStep.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleTriggerStepRecalibrate}
            className="h-7 text-xs font-mono font-bold bg-gradient-to-r from-red-600 via-amber-600 to-red-600 hover:from-red-500 hover:to-amber-500 text-white gap-1.5 shadow-md shadow-red-950 border border-amber-300"
          >
            <Sparkles className="w-3 h-3 text-amber-200" />
            Re-calibrate Step #{activeIndex + 1}
          </Button>
        </div>
      </div>
    </div>
  );
};
