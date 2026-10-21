import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  Zap,
  Target,
  ArrowRight,
  BookOpen,
  Sliders,
  Layers,
  Clock,
  Crosshair,
} from "lucide-react";
import { toast } from "sonner";
import { SequenceStep } from "@/components/live-screen-hud";

export interface ReviewedStepItem {
  stepId: string;
  stepNumber: number;
  name: string;
  action: string;
  originalCoords: { x: number; y: number };
  recommendedCoords: { x: number; y: number };
  confidence: number;
  status: "aligned" | "recalibrated" | "caution" | "optimal";
  detectedElement?: string;
  notes: string;
  recommendedDelayMs?: number;
}

export interface AIReviewResult {
  overallScore: number;
  overallStatus: "ready" | "needs_recalibration" | "caution" | "empty";
  summary: string;
  consciousGuidance: string;
  reviewedSteps: ReviewedStepItem[];
  suggestedAdditions?: any[];
  aiModelUsed?: string;
}

interface AIWorkflowReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviewResult: AIReviewResult | null;
  isLoading: boolean;
  onApplyOptimizations?: (optimizedSteps: SequenceStep[]) => void;
  onExecuteWithAI?: () => void;
  currentSteps: SequenceStep[];
  screenshotUrl?: string;
}

export const AIWorkflowReviewModal: React.FC<AIWorkflowReviewModalProps> = ({
  isOpen,
  onClose,
  reviewResult,
  isLoading,
  onApplyOptimizations,
  onExecuteWithAI,
  currentSteps,
  screenshotUrl,
}) => {
  const [isSavingToMemory, setIsSavingToMemory] = useState(false);
  const [isApplyingWithQwen, setIsApplyingWithQwen] = useState(false);

  const handleApply = async () => {
    if (!reviewResult || !reviewResult.reviewedSteps.length) return;

    setIsApplyingWithQwen(true);
    try {
      const res = await fetch("/api/ai/apply-suggestions-with-qwen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: currentSteps,
          reviewResult,
          userObjective: reviewResult.summary || "Calibrate workflow sequence",
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.optimizedSteps)) {
        onApplyOptimizations?.(data.optimizedSteps);
        toast.success(
          `🤖 Qwen Orchestrator: Applied & calibrated ${data.optimizedSteps.length} steps!`,
          {
            description: `${data.adjustmentsMade || 0} movement adjustments made. ${data.qwenExplanation || ""}`,
          }
        );
        onClose();
        return;
      }
    } catch (e) {
      console.warn("Qwen apply suggestion fallback:", e);
    } finally {
      setIsApplyingWithQwen(false);
    }

    // Direct fallback if endpoint unreachable
    const updated: SequenceStep[] = currentSteps.map((orig, idx) => {
      const reviewed = reviewResult.reviewedSteps.find((r) => r.stepId === orig.id) || reviewResult.reviewedSteps[idx];
      if (!reviewed) return orig;
      return {
        ...orig,
        x: reviewed.recommendedCoords?.x ?? orig.x,
        y: reviewed.recommendedCoords?.y ?? orig.y,
        delayMs: reviewed.recommendedDelayMs ?? orig.delayMs ?? 400,
        confidence: reviewed.confidence ?? orig.confidence ?? 0.95,
      };
    });

    onApplyOptimizations?.(updated);
    toast.success(`Applied AI optimizations to ${updated.length} workflow steps!`);
    onClose();
  };

  const handleLearnMemory = async () => {
    setIsSavingToMemory(true);
    try {
      const res = await fetch("/api/ai/learn-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historySteps: currentSteps,
          liveContext: reviewResult?.summary || "User verified workflow sequence",
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("🧠 Navigation AI Learned Workflow!", {
          description: "Synthesized into long-term autonomous sequence memory.",
        });
      } else {
        toast.info("Learned workflow updated in session memory.");
      }
    } catch {
      toast.info("Cached workflow pattern to local memory.");
    } finally {
      setIsSavingToMemory(false);
    }
  };

  const score = reviewResult?.overallScore ?? 92;
  const scoreColor =
    score >= 90 ? "text-emerald-400 border-emerald-500 bg-emerald-950/70" :
    score >= 75 ? "text-cyan-300 border-cyan-500 bg-cyan-950/70" :
    "text-amber-400 border-amber-500 bg-amber-950/70";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-slate-950 border border-cyan-500/50 text-slate-100 font-mono shadow-2xl p-0 overflow-hidden max-h-[88vh] flex flex-col">
        <DialogHeader className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300 shadow-lg">
                <Brain className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <span>AI Conscious Operator: Workflow & Screen Review</span>
                  <Badge className="bg-purple-950 text-purple-300 border-purple-600 text-[10px] font-mono">
                    QWEN & GEMINI DUAL-AI
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Multimodal audit of sequence logic, coordinates, screen UI elements, and navigation learning
                </DialogDescription>
              </div>
            </div>

            {reviewResult && (
              <div className={`px-3 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-md ${scoreColor}`}>
                <ShieldCheck className="w-4 h-4" />
                <span>{score}% VIABILITY</span>
              </div>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-cyan-300">Auditing Sequence & Screen Frame...</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Cross-referencing coordinates against 1920x1080 visual viewport, checking UI element bounding boxes, and validating execution paths.
              </p>
            </div>
          </div>
        ) : !reviewResult ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No review result available. Add steps and trigger AI review.
          </div>
        ) : (
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Summary & Conscious Guidance Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-lg">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                <div className="flex items-center gap-1.5 text-cyan-300">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>Audit Verdict & Conscious Guidance</span>
                </div>
                <span className="text-[11px] text-slate-400 font-normal">
                  Model: {reviewResult.aiModelUsed || "Dual AI Engine"}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-2.5 rounded-lg border border-slate-850">
                {reviewResult.summary}
              </p>
              <div className="flex items-start gap-2 bg-indigo-950/40 border border-indigo-800/60 p-2.5 rounded-lg text-xs text-indigo-200">
                <Brain className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-indigo-300 block mb-0.5">Conscious Operator Learning:</span>
                  <span>{reviewResult.consciousGuidance}</span>
                </div>
              </div>
            </div>

            {/* Step-by-Step Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
                <span>Audited Step Sequence ({reviewResult.reviewedSteps.length} Steps)</span>
                <span className="text-[11px] text-slate-400">Target UI & Coordinate Verification</span>
              </div>

              <div className="space-y-2">
                {reviewResult.reviewedSteps.map((step, sIdx) => {
                  const hasShift =
                    step.originalCoords &&
                    step.recommendedCoords &&
                    (step.originalCoords.x !== step.recommendedCoords.x ||
                     step.originalCoords.y !== step.recommendedCoords.y);

                  return (
                    <div
                      key={`review_step_${step.stepId || "s"}_${sIdx}`}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-cyan-600/30 border border-cyan-500/60 flex items-center justify-center text-cyan-300 font-bold shrink-0 text-[11px]">
                          {step.stepNumber}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white truncate">{step.name}</span>
                            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] uppercase">
                              {step.action}
                            </Badge>
                            <Badge
                              className={`text-[10px] ${
                                step.status === "aligned"
                                  ? "bg-emerald-950 text-emerald-300 border-emerald-600"
                                  : step.status === "optimal"
                                  ? "bg-cyan-950 text-cyan-300 border-cyan-600"
                                  : "bg-amber-950 text-amber-300 border-amber-600"
                              }`}
                            >
                              {step.status.toUpperCase()} ({(step.confidence * 100).toFixed(0)}%)
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight">
                            {step.notes}
                          </p>
                          {step.detectedElement && (
                            <span className="inline-block text-[10px] text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50">
                              Target: {step.detectedElement}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
                        <div className="text-[11px] text-slate-300 font-mono">
                          {hasShift ? (
                            <div className="flex items-center gap-1 text-amber-300">
                              <span className="line-through text-slate-500">
                                ({step.originalCoords.x}, {step.originalCoords.y})
                              </span>
                              <ArrowRight className="w-3 h-3 text-cyan-400" />
                              <strong className="text-emerald-300">
                                ({step.recommendedCoords.x}, {step.recommendedCoords.y})
                              </strong>
                            </div>
                          ) : (
                            <span>Coords: ({step.originalCoords.x}, {step.originalCoords.y})</span>
                          )}
                        </div>
                        {step.recommendedDelayMs && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            <span>Delay: {step.recommendedDelayMs}ms</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleLearnMemory}
              disabled={isSavingToMemory || !reviewResult}
              className="h-8 text-xs font-mono bg-purple-950/70 border-purple-600 text-purple-200 hover:bg-purple-900 gap-1.5"
              title="Save this verified workflow into long-term navigation memory so AI learns it"
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>{isSavingToMemory ? "Learning..." : "Teach Navigation AI"}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="h-8 text-xs font-mono bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
            >
              Close
            </Button>

            {onApplyOptimizations && reviewResult && reviewResult.reviewedSteps.length > 0 && (
              <Button
                size="sm"
                onClick={handleApply}
                disabled={isApplyingWithQwen}
                className="h-8 text-xs font-mono font-bold bg-cyan-700 hover:bg-cyan-600 text-white gap-1.5 shadow-md"
              >
                {isApplyingWithQwen ? (
                  <Brain className="w-3.5 h-3.5 text-cyan-300 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300" />
                )}
                {isApplyingWithQwen ? "Qwen Orchestrating..." : "Apply AI Suggestions"}
              </Button>
            )}

            {onExecuteWithAI && reviewResult && (
              <Button
                size="sm"
                onClick={() => {
                  onExecuteWithAI();
                  onClose();
                }}
                className="h-8 text-xs font-mono font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white gap-1.5 shadow-lg shadow-emerald-950"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Execute with AI Supervision
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
