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
  RotateCcw,
  Zap,
  Flame,
  ShieldAlert,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { WorkflowStep } from "@/lib/drift-calibration";

export interface TimelineStepSnapshot {
  id: string;
  stepNumber: number;
  name: string;
  action: "click" | "double_click" | "right_click" | "drag" | "type" | "hotkey" | "press_key" | "wait" | "launch_app";
  targetX: number;
  targetY: number;
  executedX?: number;
  executedY?: number;
  driftDistancePx: number;
  toolName: string;
  toolStatus: "verified" | "warning" | "drift_exceeded" | "failed" | "pending";
  timestampOffsetSec: number;
  delayMs: number;
  textPayload?: string;
  keyPayload?: string;
  screenshotUrl: string;
  comparisonScreenshotUrl?: string;
  notes?: string;
}

interface WorkflowTimelineProps {
  steps?: WorkflowStep[];
  currentStepIndex?: number;
  driftThresholdPx?: number;
  onSelectStep?: ((step: TimelineStepSnapshot) => void) | ((index: number, step: TimelineStepSnapshot) => void);
  onRecalibrateStep?: (step: TimelineStepSnapshot) => void;
  onRetrySegment?: (fromIndex: number, toIndex?: number) => void;
  onPauseForCorrection?: () => void;
  onContinueReexecution?: () => void;
  liveScreenshotUrl?: string;
  className?: string;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  steps: propSteps,
  currentStepIndex: initialIndex = 0,
  driftThresholdPx = 10,
  onSelectStep,
  onRecalibrateStep,
  onRetrySegment,
  onPauseForCorrection,
  onContinueReexecution,
  liveScreenshotUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=80",
  className = "",
}) => {
  // Generate or map high-fidelity snapshots from sequence steps
  const fallbackSnapshots: TimelineStepSnapshot[] = [
    {
      id: "snap_01",
      stepNumber: 1,
      name: "Focus Search Bar",
      action: "click",
      targetX: 480,
      targetY: 160,
      executedX: 481,
      executedY: 161,
      driftDistancePx: 1.4,
      toolName: "PyAutoGUI.click()",
      toolStatus: "verified",
      timestampOffsetSec: 0.0,
      delayMs: 350,
      screenshotUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=80",
      notes: "Target aligned. Confidence 99.4%.",
    },
    {
      id: "snap_02",
      stepNumber: 2,
      name: "Type Automation Query",
      action: "type",
      targetX: 480,
      targetY: 160,
      executedX: 480,
      executedY: 160,
      driftDistancePx: 0.0,
      toolName: "PyAutoGUI.typewrite()",
      toolStatus: "verified",
      timestampOffsetSec: 1.45,
      delayMs: 400,
      textPayload: "autonomous_vision_pipeline",
      screenshotUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&auto=format&fit=crop&q=80",
      notes: "Keyboard stream dispatched cleanly.",
    },
    {
      id: "snap_03",
      stepNumber: 3,
      name: "Click Primary Filter Tag",
      action: "click",
      targetX: 720,
      targetY: 220,
      executedX: 738,
      executedY: 226,
      driftDistancePx: 18.9,
      toolName: "PyAutoGUI.click()",
      toolStatus: "drift_exceeded",
      timestampOffsetSec: 2.85,
      delayMs: 300,
      screenshotUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&auto=format&fit=crop&q=80",
      notes: "⚠️ DRIFT ORIGIN: Responsive container shifted rightwards (+18.9px).",
    },
    {
      id: "snap_04",
      stepNumber: 4,
      name: "Select First Result Item",
      action: "click",
      targetX: 610,
      targetY: 380,
      executedX: 624,
      executedY: 388,
      driftDistancePx: 16.1,
      toolName: "PyAutoGUI.click()",
      toolStatus: "drift_exceeded",
      timestampOffsetSec: 4.2,
      delayMs: 500,
      screenshotUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&auto=format&fit=crop&q=80",
      notes: "Cascading drift from previous container displacement.",
    },
    {
      id: "snap_05",
      stepNumber: 5,
      name: "Confirm Modal Dispatch",
      action: "click",
      targetX: 960,
      targetY: 540,
      executedX: 962,
      executedY: 541,
      driftDistancePx: 2.2,
      toolName: "PyAutoGUI.click()",
      toolStatus: "verified",
      timestampOffsetSec: 5.6,
      delayMs: 350,
      screenshotUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1920&auto=format&fit=crop&q=80",
      notes: "Centered modal remained unaffected by horizontal drift.",
    },
  ];

  const snapshots: TimelineStepSnapshot[] =
    propSteps && propSteps.length > 0
      ? propSteps.map((s, idx) => {
          const drift = s.driftDistancePx ?? Math.hypot(s.offsetX || 0, s.offsetY || 0);
          return {
            id: s.id,
            stepNumber: idx + 1,
            name: s.name || `Step #${idx + 1}`,
            action: s.action as any,
            targetX: (s as any).originalX ?? s.x,
            targetY: (s as any).originalY ?? s.y,
            executedX: s.x,
            executedY: s.y,
            driftDistancePx: drift,
            toolName: `PyAutoGUI.${s.action}()`,
            toolStatus: drift > 14 ? "drift_exceeded" : drift > 6 ? "warning" : "verified",
            timestampOffsetSec: idx * 1.5,
            delayMs: s.delayMs || 350,
            textPayload: s.text,
            keyPayload: s.keyPayload,
            screenshotUrl:
              s.referenceScreenshotUrl ||
              liveScreenshotUrl ||
              fallbackSnapshots[idx % fallbackSnapshots.length].screenshotUrl,
            notes: drift > 14 ? `⚠️ Severe drift detected (+${drift.toFixed(1)}px)` : undefined,
          };
        })
      : fallbackSnapshots;

  const [activeIndex, setActiveIndex] = useState<number>(
    Math.min(initialIndex, snapshots.length - 1)
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [showDriftPromptDismissed, setShowDriftPromptDismissed] = useState<boolean>(false);

  const currentStep = snapshots[activeIndex] || snapshots[0];

  // Pinpoint where drift initially began in the sequence
  const driftOriginStep = snapshots.find((s) => s.driftDistancePx > driftThresholdPx || s.driftDistancePx > 6);
  const hasSignificantDrift = currentStep.driftDistancePx >= driftThresholdPx || (driftOriginStep && driftOriginStep.driftDistancePx >= driftThresholdPx);

  // Auto-Snapshot trigger: Save local browser state of UI coordinate map every 5 steps
  useEffect(() => {
    try {
      if (snapshots.length > 0 && (activeIndex + 1) % 5 === 0) {
        const autoSnapshotsKey = "workflow_auto_snapshots_history";
        const existingRaw = localStorage.getItem(autoSnapshotsKey);
        const existing = existingRaw ? JSON.parse(existingRaw) : [];
        const newEntry = {
          stepNumber: activeIndex + 1,
          timestamp: Date.now(),
          coordinates: snapshots.map((s) => ({
            id: s.id,
            x: s.targetX,
            y: s.targetY,
            executedX: s.executedX,
            executedY: s.executedY,
            driftPx: s.driftDistancePx,
          })),
        };
        const updated = [newEntry, ...existing.slice(0, 9)];
        localStorage.setItem(autoSnapshotsKey, JSON.stringify(updated));
      }
    } catch {}
  }, [activeIndex, snapshots]);

  // Playback timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveIndex((prev) => {
          if (prev >= snapshots.length - 1) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1800);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, snapshots.length]);

  const handleStepSelect = (idx: number) => {
    setActiveIndex(idx);
    if (snapshots[idx] && onSelectStep) {
      if (onSelectStep.length === 1) {
        (onSelectStep as (step: TimelineStepSnapshot) => void)(snapshots[idx]);
      } else {
        (onSelectStep as (idx: number, step: TimelineStepSnapshot) => void)(idx, snapshots[idx]);
      }
    }
  };

  // Re-execute single step or segment from current step
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
            steps: snapshots.slice(fromIdx, typeof toIdx === "number" ? toIdx + 1 : undefined),
            segmentStartIndex: fromIdx,
            segmentEndIndex: toIdx ?? snapshots.length - 1,
            reason: `Workflow Timeline scrubber re-execution from Step #${fromIdx + 1}`,
          }),
        });
        if (res.ok) {
          toast.success(`Segment Retried: Steps #${fromIdx + 1} to #${(toIdx ?? snapshots.length - 1) + 1}`, {
            description: "Re-executed targeted segment natively via PyAutoGUI bridge.",
          });
        }
      }
    } catch (err: any) {
      toast.error(`Retry Segment failed: ${err.message}`);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className={`space-y-4 rounded-xl border border-slate-800 bg-[#0c1222] p-4 text-slate-200 shadow-xl ${className}`}>
      {/* Header Bar with Drift Origin Alert */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span>Workflow Timeline & Visual Snapshots</span>
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px] font-mono">
                {snapshots.length} STEPS STORED
              </Badge>
            </h3>
            <p className="text-xs text-slate-400">
              Scrub past actions to inspect active coordinate mappings, tool statuses, and pinpoint where drift began.
            </p>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2 font-mono">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStepSelect(Math.max(0, activeIndex - 1))}
            disabled={activeIndex <= 0}
            className="h-7 w-7 p-0 bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsPlaying(!isPlaying)}
            className="h-7 px-2.5 text-xs bg-slate-900 border-cyan-800 text-cyan-300 hover:bg-cyan-950 font-bold gap-1.5"
          >
            {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            <span>{isPlaying ? "Pause Timeline" : "Auto-Scrub"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStepSelect(Math.min(snapshots.length - 1, activeIndex + 1))}
            disabled={activeIndex >= snapshots.length - 1}
            className="h-7 w-7 p-0 bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Visual Confirmation Prompt on Significant Drift Threshold */}
      {hasSignificantDrift && !showDriftPromptDismissed && (
        <div className="rounded-xl border-2 border-amber-500 bg-amber-950/90 p-3 text-amber-100 shadow-xl shadow-amber-950/80 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 mt-0.5">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-amber-300">SIGNIFICANT DRIFT THRESHOLD REACHED</span>
                  <Badge className="bg-amber-500 text-slate-950 text-[10px] font-mono font-bold">
                    Δ {currentStep.driftDistancePx.toFixed(1)}px (Threshold: {driftThresholdPx}px)
                  </Badge>
                </div>
                <p className="text-xs text-amber-200/90 font-mono mt-0.5">
                  The AI detected substantial spatial drift on Step #{currentStep.stepNumber} ("{currentStep.name}"). Would you like to proceed or pause execution for manual recalibration?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto">
              <Button
                size="sm"
                onClick={() => {
                  if (onContinueReexecution) {
                    onContinueReexecution();
                  } else {
                    toast.success("Continuing re-execution despite detected drift");
                  }
                  setShowDriftPromptDismissed(true);
                }}
                className="flex-1 sm:flex-initial h-8 px-3 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 border border-cyan-300 shadow"
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                Continue Re-execution
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  if (onPauseForCorrection) {
                    onPauseForCorrection();
                  } else {
                    fetch("/api/pyautogui/pause", { method: "POST" });
                    toast.warning("Subprocess Paused for Correction", {
                      description: "Execution halted. You can now manually adjust coordinates or click points.",
                    });
                  }
                  setShowDriftPromptDismissed(true);
                }}
                className="flex-1 sm:flex-initial h-8 px-3 text-xs font-mono font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300 shadow"
              >
                <Pause className="w-3.5 h-3.5 mr-1" />
                Pause for Correction
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drift Origin Callout Banner */}
      {driftOriginStep ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-950/40 border border-amber-600/50 p-2.5 text-xs font-mono text-amber-200 shadow-inner">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-bold">DRIFT DETECTED:</span>
            <span>
              Drift initially emerged at{" "}
              <strong className="text-white underline cursor-pointer" onClick={() => handleStepSelect(driftOriginStep.stepNumber - 1)}>
                Step #{driftOriginStep.stepNumber} ("{driftOriginStep.name}")
              </strong>{" "}
              with a <span className="text-amber-400 font-bold">Δ {driftOriginStep.driftDistancePx.toFixed(1)}px</span> offset.
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => handleTriggerRetrySegment(driftOriginStep.stepNumber - 1)}
            disabled={isRetrying}
            className="h-6 px-2 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300 shadow"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry From Step #{driftOriginStep.stepNumber}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-700/50 p-2 text-xs font-mono text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>All recorded step coordinates are calibrated within tolerance (no severe drift detected).</span>
        </div>
      )}

      {/* Interactive Timeline Track with Snapshot Thumbnails */}
      <div className="space-y-2 rounded-xl bg-slate-950/80 p-3 border border-slate-800">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-semibold">
            Active Snapshot: <strong className="text-cyan-300">#{currentStep.stepNumber} - {currentStep.name}</strong>
          </span>
          <span className="text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            T+{currentStep.timestampOffsetSec.toFixed(2)}s • Delay: {currentStep.delayMs}ms
          </span>
        </div>

        {/* Timeline Slider Track */}
        <div className="pt-1 pb-2">
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={activeIndex}
            onChange={(e) => handleStepSelect(parseInt(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-900 rounded-lg"
          />

          {/* Step Thumbnails / Badges */}
          <div className="grid grid-cols-5 gap-2 pt-2">
            {snapshots.map((snap, idx) => {
              const isSelected = idx === activeIndex;
              const isSevere = snap.driftDistancePx > 14;
              const isModerate = snap.driftDistancePx > 6 && snap.driftDistancePx <= 14;

              return (
                <button
                  key={snap.id}
                  onClick={() => handleStepSelect(idx)}
                  className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "bg-slate-900 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-950"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      #{snap.stepNumber}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${
                        isSevere
                          ? "bg-red-950 text-red-300 border border-red-700"
                          : isModerate
                          ? "bg-amber-950 text-amber-300 border border-amber-700"
                          : "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      }`}
                    >
                      Δ {snap.driftDistancePx.toFixed(0)}px
                    </span>
                  </div>

                  <div className="text-[11px] font-medium text-slate-200 truncate w-full">
                    {snap.name}
                  </div>

                  <div className="text-[9px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                    <span>{snap.toolName}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Snapshot Visual Comparison Stage & Active Coordinate Mapping */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Snapshot Screen View (7 Cols) */}
        <div className="lg:col-span-7 space-y-2">
          <div className="relative aspect-video rounded-xl border border-slate-800 bg-black overflow-hidden shadow-inner flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs font-mono z-10">
              <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                Snapshot #{currentStep.stepNumber}: {currentStep.name}
              </span>
              <Badge className="bg-slate-800 text-slate-300 text-[10px] font-mono">
                Target: ({currentStep.targetX}, {currentStep.targetY})
              </Badge>
            </div>

            <div className="relative flex-1 bg-black overflow-hidden">
              <img
                src={currentStep.screenshotUrl}
                alt={currentStep.name}
                className="w-full h-full object-cover opacity-90"
              />

              {/* Recorded Coordinate Pin */}
              <div
                style={{
                  left: `${(currentStep.targetX / 1920) * 100}%`,
                  top: `${(currentStep.targetY / 1080) * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              >
                <div className="w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-500/20 flex items-center justify-center animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                </div>
                <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950/90 border border-cyan-600 text-cyan-200 text-[9px] font-mono px-1.5 py-0.5 rounded shadow">
                  Recorded ({currentStep.targetX}, {currentStep.targetY})
                </div>
              </div>

              {/* Live Drift Offset Marker if shifted */}
              {currentStep.driftDistancePx > 3 && (
                <div
                  style={{
                    left: `${((currentStep.executedX ?? currentStep.targetX) / 1920) * 100}%`,
                    top: `${((currentStep.executedY ?? currentStep.targetY) / 1080) * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <div className="w-8 h-8 rounded-full border-2 border-amber-400 bg-amber-500/20 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  </div>
                  <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber-950/90 border border-amber-600 text-amber-200 text-[9px] font-mono px-1.5 py-0.5 rounded shadow">
                    Live ({currentStep.executedX ?? currentStep.targetX}, {currentStep.executedY ?? currentStep.targetY}) [Δ {currentStep.driftDistancePx.toFixed(1)}px]
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Active Coordinate Mapping & Tool Status Card (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs font-mono">
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
              <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                Step Telemetry & Mapping
              </span>
              <Badge
                className={`text-[10px] font-mono ${
                  currentStep.toolStatus === "drift_exceeded"
                    ? "bg-red-950 text-red-300 border-red-700"
                    : currentStep.toolStatus === "warning"
                    ? "bg-amber-950 text-amber-300 border-amber-700"
                    : "bg-emerald-950 text-emerald-300 border-emerald-700"
                }`}
              >
                {currentStep.toolStatus.toUpperCase().replace("_", " ")}
              </Badge>
            </div>

            {/* Coordinate Mapping Matrix */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-500 block">TARGET BASELINE</span>
                <span className="text-cyan-300 font-bold text-sm">
                  ({currentStep.targetX}, {currentStep.targetY})
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 block">LIVE EXECUTED</span>
                <span className="text-amber-300 font-bold text-sm">
                  ({currentStep.executedX ?? currentStep.targetX}, {currentStep.executedY ?? currentStep.targetY})
                </span>
              </div>

              <div className="col-span-2 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Euclidean Drift:</span>
                <span
                  className={`font-bold ${
                    currentStep.driftDistancePx > 14
                      ? "text-red-400"
                      : currentStep.driftDistancePx > 6
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  Δ {currentStep.driftDistancePx.toFixed(2)} px
                </span>
              </div>
            </div>

            {/* Tool Status & Parameters */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Bridge Tool:</span>
                <span className="text-cyan-400 font-bold">{currentStep.toolName}</span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Action Type:</span>
                <span className="text-white uppercase font-bold">{currentStep.action}</span>
              </div>

              {currentStep.textPayload && (
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Text Payload:</span>
                  <span className="text-emerald-400 truncate max-w-[160px]">"{currentStep.textPayload}"</span>
                </div>
              )}

              {currentStep.keyPayload && (
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Key Chord:</span>
                  <span className="text-purple-300 font-bold">{currentStep.keyPayload}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Pre-Action Delay:</span>
                <span className="text-slate-200">{currentStep.delayMs} ms</span>
              </div>
            </div>

            {currentStep.notes && (
              <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                {currentStep.notes}
              </div>
            )}
          </div>

            {/* Quick Actions for This Step */}
          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleTriggerRetrySegment(activeIndex, activeIndex)}
                disabled={isRetrying}
                className="h-7 flex-1 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 border border-cyan-300"
              >
                <Zap className="w-3 h-3 mr-1" />
                Retry This Step
              </Button>

              <Button
                size="sm"
                onClick={() => handleTriggerRetrySegment(activeIndex)}
                disabled={isRetrying}
                className="h-7 flex-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry Segment From Here
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
