import React, { useState } from "react";
import {
  Brain,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Zap,
  Target,
  Clock,
  ShieldCheck,
  X,
  Play,
  Sliders,
  Layers,
  Flame,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SequenceStep } from "./live-screen-hud";

export interface ReplanStepItem {
  id: string;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  keyPayload?: string;
  delayMs?: number;
  originalX?: number;
  originalY?: number;
  status?: "kept" | "modified" | "inserted" | "removed";
  replanReason?: string;
  confidence?: number;
}

export interface ReplanResult {
  replanId: string;
  timestamp: number;
  driftDetected: boolean;
  maxDriftPx: number;
  originalStepCount: number;
  newStepCount: number;
  summary: string;
  confidence: number;
  suggestedSteps: ReplanStepItem[];
  mitigationStrategies: string[];
  executionPlan: string;
}

interface AIGoalReplannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSteps: SequenceStep[];
  currentDriftPx?: number;
  driftThresholdPx?: number;
  screenshotUrl?: string;
  onApplyReplan: (healedSteps: Partial<SequenceStep>[]) => void;
  onExecuteTestStep?: (step: ReplanStepItem) => void;
}

export const AIGoalReplannerModal: React.FC<AIGoalReplannerModalProps> = ({
  isOpen,
  onClose,
  currentSteps,
  currentDriftPx = 28.5,
  driftThresholdPx = 10,
  screenshotUrl,
  onApplyReplan,
  onExecuteTestStep,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [replanData, setReplanData] = useState<ReplanResult | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [customGoal, setCustomGoal] = useState<string>(
    "Complete screen target workflow with resilient anchor alignment"
  );

  const handleGenerateReplan = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/goal-replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowName: "Active Live HUD Workflow",
          currentSteps,
          consecutiveDriftCount: 3,
          currentDriftDistancePx: currentDriftPx,
          driftThreshold: driftThresholdPx,
          screenshotUrl,
          targetGoal: customGoal,
        }),
      });

      const data = await res.json();
      if (data.success && data.replan) {
        setReplanData(data.replan);
        toast.success("AI Goal Re-Planner generated optimized sequence!");
      } else {
        toast.error(data.error || "Failed to generate re-plan");
      }
    } catch (err: any) {
      toast.error(`Re-planner error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyToActiveWorkflow = () => {
    if (!replanData) return;
    const formattedSteps: Partial<SequenceStep>[] = replanData.suggestedSteps.map((s, idx) => ({
      id: s.id || `step-${Date.now()}-${idx}`,
      name: s.name,
      action: s.action as any,
      x: s.x,
      y: s.y,
      text: s.text,
      keyPayload: s.keyPayload,
      delayMs: s.delayMs || 300,
    }));

    onApplyReplan(formattedSteps);
    toast.success(`Adopted ${formattedSteps.length} healed automation steps!`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-indigo-500/70 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-mono text-slate-200">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950/90 border-b border-indigo-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-950 border border-indigo-500 rounded-xl">
              <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  AI GOAL RE-PLANNER AGENT
                </h2>
                <Badge className="bg-red-950 text-red-300 border-red-700 text-[10px]">
                  DRIFT: {currentDriftPx.toFixed(1)}px &gt; {driftThresholdPx}px
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Monitors execution failures & continuous coordinate deviations to suggest auto-healed workflow step sequences
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Goal & Drift Diagnostic Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 md:col-span-2">
              <span className="text-[10px] text-slate-400 font-bold block">TARGET GOAL STATEMENT:</span>
              <input
                type="text"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-indigo-200 font-mono"
                placeholder="Workflow objective"
              />
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">ACTIVE STEPS ANALYZED:</span>
                <span className="text-lg font-bold text-cyan-400">{currentSteps.length} Steps</span>
              </div>
              <Button
                size="sm"
                onClick={handleGenerateReplan}
                disabled={isLoading}
                className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold gap-1.5 shadow-md"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                )}
                {isLoading ? "Analyzing Screen..." : "Analyze & Re-Plan"}
              </Button>
            </div>
          </div>

          {/* Re-planner Result Analysis */}
          {replanData ? (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>AI Re-Planner Recommendation Summary</span>
                  </div>
                  <Badge className="bg-emerald-950 text-emerald-300 border-emerald-600 text-[10px]">
                    Confidence: {(replanData.confidence * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{replanData.summary}</p>

                {/* Mitigations badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {replanData.mitigationStrategies.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] bg-indigo-900/60 border border-indigo-700 text-indigo-200"
                    >
                      🛡️ {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Step Diff Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    MODIFIED STEP SEQUENCE ({replanData.suggestedSteps.length} Steps)
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Click step to inspect adjustments
                  </span>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 bg-slate-950">
                  {replanData.suggestedSteps.map((s, idx) => {
                    const isSelected = selectedStepId === s.id;
                    return (
                      <div
                        key={s.id || idx}
                        onClick={() => setSelectedStepId(s.id)}
                        className={`p-3 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          isSelected
                            ? "bg-indigo-950/70 border-l-4 border-l-indigo-400"
                            : "hover:bg-slate-900/80"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">{s.name}</span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  s.status === "modified"
                                    ? "bg-amber-950 text-amber-300 border-amber-600"
                                    : s.status === "inserted"
                                    ? "bg-emerald-950 text-emerald-300 border-emerald-600"
                                    : "bg-slate-800 text-slate-300 border-slate-700"
                                }`}
                              >
                                {s.status?.toUpperCase() || "KEPT"}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Action: <span className="text-cyan-300 uppercase">{s.action}</span> •
                              Coords:{" "}
                              <span className="text-amber-300">
                                ({s.x}, {s.y})
                              </span>
                              {s.originalX !== undefined && s.status === "modified" && (
                                <span className="text-slate-500 line-through ml-1">
                                  ({s.originalX}, {s.originalY})
                                </span>
                              )}{" "}
                              • Delay: <span className="text-emerald-300">{s.delayMs}ms</span>
                            </div>
                            {s.replanReason && (
                              <div className="text-[10px] text-indigo-300 mt-1 italic">
                                ↳ {s.replanReason}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Step Test Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {onExecuteTestStep && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                onExecuteTestStep(s);
                                toast.success(`Testing step #${idx + 1} via PyAutoGUI...`);
                              }}
                              className="h-7 text-[10px] border-slate-700 hover:bg-slate-800"
                            >
                              <Play className="w-3 h-3 mr-1 text-emerald-400" />
                              Test Step
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 space-y-3">
              <Brain className="w-10 h-10 text-indigo-400 mx-auto animate-pulse opacity-70" />
              <div className="text-sm font-bold text-slate-200">
                AI Goal Re-planner is ready to analyze workflow drift
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                When automation encounters screen displacement or repeated failure, the re-planner inspects live frames and automatically adapts coordinates, settling delays, and sync anchors.
              </p>
              <Button
                size="sm"
                onClick={handleGenerateReplan}
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-300" />
                Run AI Sequence Re-Planner Now
              </Button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-indigo-900/60 flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="text-xs border-slate-700 hover:bg-slate-800"
          >
            Cancel
          </Button>

          {replanData && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleApplyToActiveWorkflow}
                className="text-xs bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold shadow-md gap-1.5"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-200" />
                Apply Re-Planned Workflow ({replanData.suggestedSteps.length} Steps)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
