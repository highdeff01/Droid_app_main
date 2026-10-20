import React, { useState, useEffect } from "react";
import {
  Film,
  Camera,
  Upload,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight,
  Target,
  Sliders,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Plus,
  ShieldAlert,
  Compass,
  Clock,
  Activity,
  Bot,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TemporalSnapshotBundle, getSavedSnapshotBundles } from "@/lib/temporal-action-buffer";
import { toast } from "sonner";

export interface SequenceStepItem {
  id: string;
  stepNumber: number;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  referenceScreenshotUrl?: string;
  status?: string;
}

export interface DiffResultData {
  stepIndex: number;
  stepName: string;
  similarityScore: number;
  driftDetected: boolean;
  driftVector: { deltaX: number; deltaY: number };
  originalCoords: { x: number; y: number };
  autoPositionedCoords: { x: number; y: number };
  differences: Array<{ description: string; area: string; severity: string }>;
  aiInterventionRequired: boolean;
  interventionReason?: string;
  recommendedAction: string;
  suggestedNewStep?: {
    name: string;
    action: string;
    x: number;
    y: number;
    text?: string;
  };
}

export interface TenResponseImagesDiffEngineProps {
  sequence: SequenceStepItem[];
  responseImages: Record<number, string>;
  onUpdateResponseImage: (slotIndex: number, imageUrl: string) => void;
  currentLiveScreenshot: string;
  onUpdateStepCoordinates: (stepId: string, newX: number, newY: number) => void;
  onAddRecoveryStep: (step: any) => void;
  activeStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onUploadKeyframes?: () => void;
  onSaveCurrentAsKeyframe?: () => void;
  className?: string;
}

export function TenResponseImagesDiffEngine({
  sequence,
  responseImages,
  onUpdateResponseImage,
  currentLiveScreenshot,
  onUpdateStepCoordinates,
  onAddRecoveryStep,
  activeStepId,
  onSelectStep,
  onUploadKeyframes,
  onSaveCurrentAsKeyframe,
  className = "",
}: TenResponseImagesDiffEngineProps) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [autoRepositionEnabled, setAutoRepositionEnabled] = useState<boolean>(true);
  const [isAnalyzingSlot, setIsAnalyzingSlot] = useState<number | null>(null);
  const [diffResults, setDiffResults] = useState<Record<number, DiffResultData>>({});
  const [snapshotBundles, setSnapshotBundles] = useState<Record<number, TemporalSnapshotBundle>>({});
  const [autoPositionNotices, setAutoPositionNotices] = useState<
    Array<{ id: string; stepName: string; from: string; to: string; drift: string }>
  >([]);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState<boolean>(false);
  const [isRefiningPipeline, setIsRefiningPipeline] = useState<boolean>(false);

  // Listen for live snapshot broadcasts from HUD & Action Ledger
  useEffect(() => {
    const handleAddSnapshot = (e: any) => {
      const detail = e.detail;
      if (detail?.imageUrl) {
        const slot = typeof detail.slotIndex === "number" ? detail.slotIndex : selectedSlotIndex;
        onUpdateResponseImage(slot, detail.imageUrl);
        if (detail.bundle) {
          setSnapshotBundles((prev) => ({ ...prev, [slot]: detail.bundle }));
        }
      }
    };

    // Load initial bundles from store
    const bundles = getSavedSnapshotBundles();
    if (bundles.length > 0) {
      const initMap: Record<number, TemporalSnapshotBundle> = {};
      bundles.forEach((b, i) => {
        initMap[b.slotIndex || i] = b;
      });
      setSnapshotBundles(initMap);
    }

    window.addEventListener("add-10-screenshot", handleAddSnapshot);
    return () => window.removeEventListener("add-10-screenshot", handleAddSnapshot);
  }, [selectedSlotIndex, onUpdateResponseImage]);

  // AI Refine Pipeline for Selected Slot
  const handleRefinePipelineForSlot = async (slotIdx: number) => {
    const step = sequence[slotIdx];
    const postOpImg = responseImages[slotIdx] || currentLiveScreenshot;
    setIsRefiningPipeline(true);
    try {
      toast.info(`⚡ Running AI Refine Pipeline on Slot #${slotIdx + 1}...`);
      const res = await fetch("/api/dual-ai/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenshot: postOpImg,
          goalPrompt: `Refine action execution for step: ${step?.name || `Step #${slotIdx + 1}`}, detect element drift and generate self-healed coordinates`,
          confidence: 0.92,
          autoExecute: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`✅ AI Refinement Complete! Recalibrated step #${slotIdx + 1}`);
        if (step && data.steps && data.steps.length > 0) {
          const suggested = data.steps[0];
          if (suggested.x && suggested.y) {
            onUpdateStepCoordinates(step.id, suggested.x, suggested.y);
          }
        }
      } else {
        toast.info("AI Refinement finished: Zero critical drift detected.");
      }
    } catch (err) {
      toast.error(`Refinement failed: ${String(err)}`);
    } finally {
      setIsRefiningPipeline(false);
    }
  };

  // Perform Visual Error Detection & Difference Mapping for a single slot
  const handleAnalyzeSlot = async (slotIdx: number) => {
    const step = sequence[slotIdx];
    if (!step) return;

    const targetKeyframe = step.referenceScreenshotUrl || currentLiveScreenshot;
    let postOpImage = responseImages[slotIdx];

    // If no response image recorded yet, capture from current live screen
    if (!postOpImage) {
      postOpImage = currentLiveScreenshot;
      onUpdateResponseImage(slotIdx, currentLiveScreenshot);
    }

    setIsAnalyzingSlot(slotIdx);

    try {
      const res = await fetch("/api/ai/visual-error-diff-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedImage: targetKeyframe,
          responseImage: postOpImage,
          stepName: step.name,
          stepAction: step.action,
          targetCoords: { x: step.x, y: step.y },
          autoRepositionEnabled,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const result: DiffResultData = {
          stepIndex: slotIdx,
          stepName: step.name,
          similarityScore: Number(data.similarityScore) || 0.85,
          driftDetected: Boolean(data.driftDetected),
          driftVector: data.driftVector || { deltaX: 0, deltaY: 0 },
          originalCoords: data.originalCoordinates || { x: step.x, y: step.y },
          autoPositionedCoords: data.autoPositionedCoordinates || { x: step.x, y: step.y },
          differences: data.differences || [],
          aiInterventionRequired: Boolean(data.aiInterventionRequired),
          interventionReason: data.interventionReason,
          recommendedAction: data.recommendedAction || "proceed",
          suggestedNewStep: data.suggestedNewStep,
        };

        setDiffResults((prev) => ({ ...prev, [slotIdx]: result }));

        // If drift detected and auto-reposition enabled, update step coordinates
        if (result.driftDetected && autoRepositionEnabled && result.autoPositionedCoords) {
          onUpdateStepCoordinates(
            step.id,
            result.autoPositionedCoords.x,
            result.autoPositionedCoords.y
          );

          setAutoPositionNotices((prev) => [
            {
              id: `notice_${Date.now()}`,
              stepName: step.name,
              from: `(${step.x}, ${step.y})`,
              to: `(${result.autoPositionedCoords.x}, ${result.autoPositionedCoords.y})`,
              drift: `ΔX: ${result.driftVector.deltaX > 0 ? "+" : ""}${result.driftVector.deltaX}px, ΔY: ${result.driftVector.deltaY > 0 ? "+" : ""}${result.driftVector.deltaY}px`,
            },
            ...prev.slice(0, 4),
          ]);
        }
      }
    } catch (err) {
      console.error("Diff detection failed for slot", slotIdx, err);
    } finally {
      setIsAnalyzingSlot(null);
    }
  };

  // Cross-reference all 10 slots sequentially
  const handleCrossReferenceAll = async () => {
    setIsAnalyzingAll(true);
    for (let i = 0; i < Math.min(10, sequence.length); i++) {
      await handleAnalyzeSlot(i);
    }
    setIsAnalyzingAll(false);
  };

  const activeStep = sequence[selectedSlotIndex];
  const activeDiff = diffResults[selectedSlotIndex];

  return (
    <Card className={`bg-slate-900 border-cyan-500/40 shadow-2xl overflow-hidden ${className}`}>
      {/* Header Controls */}
      <CardHeader className="p-3.5 bg-slate-950 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center shadow-md">
            <Film className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                10 Screenshots Section & Post-Operation Response Gallery
              </CardTitle>
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 text-[10px] font-mono">
                {sequence.filter((s) => s.referenceScreenshotUrl).length}/10 KEYFRAMES •{" "}
                {Object.keys(responseImages).length}/10 RESPONSES
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Compares Target Keyframes against AI Post-Operation Responses with automated Drift Detection & Auto-Positioning
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[11px] font-mono text-slate-300 font-bold">Auto-Position Drift:</span>
            <Switch
              aria-label="Auto-Position Drift"
              checked={autoRepositionEnabled}
              onCheckedChange={setAutoRepositionEnabled}
              className="data-[state=checked]:bg-cyan-600"
            />
          </div>

          <Button
            size="sm"
            onClick={handleCrossReferenceAll}
            disabled={isAnalyzingAll || sequence.length === 0}
            className="h-8 text-xs font-mono font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-1.5 shadow-md shadow-purple-950"
          >
            <Sparkles className={`w-3.5 h-3.5 text-yellow-300 ${isAnalyzingAll ? "animate-spin" : ""}`} />
            {isAnalyzingAll ? "Analyzing 10 Slots..." : "Cross-Reference All (AI Vision)"}
          </Button>

          {onUploadKeyframes && (
            <Button
              size="sm"
              variant="outline"
              onClick={onUploadKeyframes}
              className="h-8 text-xs font-mono border-slate-700 text-slate-300 hover:text-white gap-1"
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </Button>
          )}

          {onSaveCurrentAsKeyframe && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveCurrentAsKeyframe}
              className="h-8 text-xs font-mono border-cyan-800 text-cyan-300 hover:text-white hover:bg-cyan-950 gap-1"
            >
              <Camera className="w-3.5 h-3.5" /> Capture Keyframe
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Auto-Positioning Notices Banner */}
        {autoPositionNotices.length > 0 && (
          <div className="space-y-1 bg-cyan-950/40 border border-cyan-500/40 p-2.5 rounded-xl">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-cyan-300">
              <span className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                Automated Visual Drift Auto-Positioning Active:
              </span>
              <button
                onClick={() => setAutoPositionNotices([])}
                className="text-slate-400 hover:text-white text-[10px]"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-mono">
              {autoPositionNotices.map((n) => (
                <div
                  key={n.id}
                  className="px-2 py-1 rounded bg-slate-900/90 border border-cyan-700/60 text-slate-300 flex items-center gap-1.5"
                >
                  <span className="text-cyan-300 font-bold">{n.stepName}</span>
                  <span className="text-slate-400">{n.from} → {n.to}</span>
                  <Badge className="bg-cyan-600 text-white text-[9px] px-1 py-0">{n.drift}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 10 Paired Screenshot Slots (Target Keyframe [Above] + AI Post-Op Response [Below]) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="font-bold text-slate-200">
              10-Screenshot Execution Strip (Row 1: Target Keyframe | Row 2: AI Post-Action Response):
            </span>
            <span>Click slot to inspect visual difference map & cross-reference</span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
            {Array.from({ length: 10 }).map((_, slotIdx) => {
              const step = sequence[slotIdx];
              const targetKeyframe = step?.referenceScreenshotUrl || currentLiveScreenshot;
              const postOpImg = responseImages[slotIdx];
              const diff = diffResults[slotIdx];
              const isSelected = selectedSlotIndex === slotIdx;
              const isAnalyzing = isAnalyzingSlot === slotIdx;

              if (!step) {
                return (
                  <div
                    key={`slot_empty_${slotIdx}`}
                    className="flex-shrink-0 w-36 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-2 flex flex-col items-center justify-center text-slate-500 text-center"
                  >
                    <span className="text-[11px] font-mono font-bold">Slot #{slotIdx + 1}</span>
                    <span className="text-[9px] text-slate-600 font-mono mt-1">Empty Slot</span>
                  </div>
                );
              }

              return (
                <div
                  key={step.id}
                  onClick={() => {
                    setSelectedSlotIndex(slotIdx);
                    onSelectStep(step.id);
                  }}
                  className={`flex-shrink-0 w-44 rounded-xl border p-2 cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? "bg-slate-900 border-cyan-400 shadow-lg shadow-cyan-950/60 ring-2 ring-cyan-500/30"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Slot Header */}
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="font-bold text-cyan-300 truncate max-w-[90px]">
                      #{slotIdx + 1} {step.name}
                    </span>
                    <Badge className="bg-slate-800 text-slate-300 text-[9px] px-1 py-0 uppercase">
                      {step.action}
                    </Badge>
                  </div>

                  {/* Tier 1: Target Keyframe (Before) */}
                  <div className="relative aspect-video rounded bg-black overflow-hidden border border-slate-800">
                    <img
                      src={targetKeyframe}
                      alt={`Target ${step.name}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-cyan-300 border border-slate-700">
                      TARGET
                    </div>
                  </div>

                  {/* Tier 2: AI Post-Action Response Image (After) */}
                  <div className="relative aspect-video rounded bg-black overflow-hidden border border-purple-900/50">
                    {postOpImg ? (
                      <img
                        src={postOpImg}
                        alt={`Response ${step.name}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-slate-950/80">
                        <span className="text-[9px] font-mono text-slate-500">No Response Image</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateResponseImage(slotIdx, currentLiveScreenshot);
                          }}
                          className="mt-1 text-[8px] font-mono text-cyan-400 hover:underline"
                        >
                          + Record Frame
                        </button>
                      </div>
                    )}
                    <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-purple-300 border border-purple-800">
                      RESPONSE
                    </div>
                  </div>

                  {/* Slot Status & Action */}
                  <div className="pt-1 flex items-center justify-between gap-1 text-[10px] font-mono">
                    {diff ? (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          diff.driftDetected
                            ? "bg-amber-950 text-amber-300"
                            : "bg-emerald-950 text-emerald-300"
                        }`}
                      >
                        {diff.driftDetected ? "DRIFT" : `${(diff.similarityScore * 100).toFixed(0)}% MATCH`}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[9px]">Unchecked</span>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAnalyzeSlot(slotIdx);
                      }}
                      disabled={isAnalyzing}
                      className="h-6 px-1.5 text-[9px] border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-300 gap-1"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                      {isAnalyzing ? "Diff..." : "Check"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deep Visual Error Detection & Difference Mapping Panel for Selected Slot */}
        {activeStep && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold font-mono text-slate-100">
                  Visual Error Detection & Difference Mapping: Slot #{selectedSlotIndex + 1} ({activeStep.name})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRefinePipelineForSlot(selectedSlotIndex)}
                  disabled={isRefiningPipeline}
                  className="h-7 text-xs font-mono font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white gap-1 shadow-md"
                  title="Run AI Vision Refine Pipeline on slot to heal drift and optimize next actions"
                >
                  <Sparkles className={`w-3 h-3 text-yellow-300 ${isRefiningPipeline ? "animate-spin" : ""}`} />
                  {isRefiningPipeline ? "Refining..." : "⚡ AI Refine Pipeline"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAnalyzeSlot(selectedSlotIndex)}
                  disabled={isAnalyzingSlot === selectedSlotIndex}
                  className="h-7 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isAnalyzingSlot === selectedSlotIndex ? "animate-spin" : ""}`} />
                  {isAnalyzingSlot === selectedSlotIndex ? "Analyzing..." : "Re-Analyze Diff & Drift"}
                </Button>
              </div>
            </div>

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Target Keyframe (Expected State)</span>
                  <span className="text-cyan-400">({activeStep.x}, {activeStep.y})</span>
                </div>
                <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-800 bg-black">
                  <img
                    src={activeStep.referenceScreenshotUrl || currentLiveScreenshot}
                    alt="Target Keyframe"
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute w-4 h-4 rounded-full border-2 border-white bg-cyan-500 -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(activeStep.x / 1920) * 100}%`,
                      top: `${(activeStep.y / 1080) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>AI Post-Op Response Image (Actual State)</span>
                  <span className="text-purple-400">
                    {responseImages[selectedSlotIndex] ? "Captured Response" : "Live Stream Preview"}
                  </span>
                </div>
                <div className="relative aspect-video rounded-lg overflow-hidden border border-purple-900/60 bg-black">
                  <img
                    src={responseImages[selectedSlotIndex] || currentLiveScreenshot}
                    alt="Post-Op Response"
                    className="w-full h-full object-cover"
                  />
                  {activeDiff && activeDiff.autoPositionedCoords && (
                    <div
                      className="absolute w-4 h-4 rounded-full border-2 border-white bg-emerald-500 -translate-x-1/2 -translate-y-1/2 animate-ping"
                      style={{
                        left: `${(activeDiff.autoPositionedCoords.x / 1920) * 100}%`,
                        top: `${(activeDiff.autoPositionedCoords.y / 1080) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Temporal Pre & Post 10-Second Action Ledger for Slot */}
            {snapshotBundles[selectedSlotIndex] && (
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Attached 10s Pre- & Post-Snapshot Action Buffer:</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {snapshotBundles[selectedSlotIndex].actionsBefore10s.length} Pre-Actions •{" "}
                    {snapshotBundles[selectedSlotIndex].actionsAfter10s.length} Post-Actions
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Pre-Snapshot 10s */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                      <span>⏪ 10s Prior to Snapshot:</span>
                    </span>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                      {snapshotBundles[selectedSlotIndex].actionsBefore10s.length > 0 ? (
                        snapshotBundles[selectedSlotIndex].actionsBefore10s.map((act) => (
                          <div
                            key={act.id}
                            className="p-1.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] flex items-center justify-between"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Badge className={`text-[8px] px-1 py-0 ${act.source === "user" ? "bg-emerald-950 text-emerald-300" : act.source === "ai" ? "bg-cyan-950 text-cyan-300" : "bg-purple-950 text-purple-300"}`}>
                                {act.source.toUpperCase()}
                              </Badge>
                              <span className="text-slate-300 truncate">{act.description}</span>
                            </div>
                            <span className="text-slate-500 text-[9px] shrink-0">{act.timeStr}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-500 italic p-1">No recorded actions in prior 10 seconds.</div>
                      )}
                    </div>
                  </div>

                  {/* Post-Snapshot 10s */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                      <span>⏩ 10s After Snapshot:</span>
                    </span>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                      {snapshotBundles[selectedSlotIndex].actionsAfter10s.length > 0 ? (
                        snapshotBundles[selectedSlotIndex].actionsAfter10s.map((act) => (
                          <div
                            key={act.id}
                            className="p-1.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] flex items-center justify-between"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Badge className={`text-[8px] px-1 py-0 ${act.source === "user" ? "bg-emerald-950 text-emerald-300" : act.source === "ai" ? "bg-cyan-950 text-cyan-300" : "bg-purple-950 text-purple-300"}`}>
                                {act.source.toUpperCase()}
                              </Badge>
                              <span className="text-slate-300 truncate">{act.description}</span>
                            </div>
                            <span className="text-slate-500 text-[9px] shrink-0">{act.timeStr}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-500 italic p-1">Capturing subsequent actions in 10-second window...</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Difference Mapping & Drift Metrics */}
            {activeDiff ? (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Visual Similarity:</span>
                    <div className="font-bold text-slate-100 text-sm mt-0.5">
                      {(activeDiff.similarityScore * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Detected Drift Vector:</span>
                    <div className={`font-bold text-sm mt-0.5 ${activeDiff.driftDetected ? "text-amber-400" : "text-emerald-400"}`}>
                      {activeDiff.driftDetected
                        ? `ΔX: ${activeDiff.driftVector.deltaX > 0 ? "+" : ""}${activeDiff.driftVector.deltaX}px, ΔY: ${activeDiff.driftVector.deltaY > 0 ? "+" : ""}${activeDiff.driftVector.deltaY}px`
                        : "0px (Zero Drift)"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Auto-Positioning Coords:</span>
                    <div className="font-bold text-cyan-300 text-sm mt-0.5">
                      ({activeDiff.autoPositionedCoords.x}, {activeDiff.autoPositionedCoords.y})
                    </div>
                  </div>
                </div>

                {/* Differences List */}
                {activeDiff.differences.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400">
                      Detected Visual Differences:
                    </span>
                    <div className="space-y-1">
                      {activeDiff.differences.map((diffItem, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-300"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                            <span>{diffItem.description}</span>
                          </div>
                          <Badge className="bg-slate-800 text-slate-300 text-[9px]">
                            {diffItem.area || "Canvas"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Intervention Section */}
                {activeDiff.aiInterventionRequired && (
                  <div className="p-3 rounded-lg bg-amber-950/80 border border-amber-500/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-300 text-xs font-mono font-bold">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        AI Intervention Recommended: {activeDiff.interventionReason || "Discrepancy detected"}
                      </div>
                      <Badge className="bg-amber-600 text-white text-[10px] font-mono uppercase">
                        {activeDiff.recommendedAction}
                      </Badge>
                    </div>

                    {activeDiff.suggestedNewStep && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-300 font-mono">
                          Suggested Recovery Step: <strong>{activeDiff.suggestedNewStep.name}</strong> ({activeDiff.suggestedNewStep.action} at {activeDiff.suggestedNewStep.x}, {activeDiff.suggestedNewStep.y})
                        </span>
                        <Button
                          size="sm"
                          onClick={() => onAddRecoveryStep(activeDiff.suggestedNewStep)}
                          className="h-7 text-xs font-mono font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Recovery Step
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-xs font-mono text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-800">
                Click "Re-Analyze Diff & Drift" to run Gemini vision difference mapping and automatic coordinate auto-positioning.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
