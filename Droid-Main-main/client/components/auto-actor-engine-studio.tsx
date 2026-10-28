import React, { useState, useEffect } from "react";
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Eye,
  RefreshCw,
  Sparkles,
  Sliders,
  Check,
  X,
  Target,
  Crosshair,
  ArrowRight,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export interface AutoActorStep {
  id: string;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  keyPayload?: string;
  referenceScreenshotUrl?: string;
  stepNumber?: number;
}

export interface AutoActorEngineStudioProps {
  currentLiveScreenshot: string;
  verificationSteps: AutoActorStep[];
  autoActEnabled: boolean;
  onToggleAutoAct: (enabled: boolean) => void;
  onExecuteStep?: (step: AutoActorStep) => void;
  onTriggerSequenceExecution?: (steps: AutoActorStep[]) => void;
  className?: string;
}

export function AutoActorEngineStudio({
  currentLiveScreenshot,
  verificationSteps,
  autoActEnabled,
  onToggleAutoAct,
  onExecuteStep,
  onTriggerSequenceExecution,
  className = "",
}: AutoActorEngineStudioProps) {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(75);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<{
    matched: boolean;
    similarityScore: number;
    reason: string;
    identifiedElements: string[];
    timestamp: number;
    autoActExecuted: boolean;
    executedStepName?: string;
  } | null>(null);
  const [continuousScan, setContinuousScan] = useState<boolean>(false);
  const [executionLog, setExecutionLog] = useState<
    Array<{
      id: string;
      time: string;
      stepName: string;
      score: number;
      matched: boolean;
      executed: boolean;
      reason: string;
    }>
  >([]);

  const currentStep = verificationSteps[activeStepIndex] || verificationSteps[0];
  const expectedImg = currentStep?.referenceScreenshotUrl || currentLiveScreenshot;

  // Run AI Comparison
  const triggerAiComparison = async (overrideStep?: AutoActorStep) => {
    const stepToEvaluate = overrideStep || currentStep;
    if (!stepToEvaluate) return;

    setIsComparing(true);
    try {
      const stepImg = stepToEvaluate.referenceScreenshotUrl || expectedImg;
      const res = await fetch("/api/ai/auto-actor-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentScreen: currentLiveScreenshot,
          expectedScreen: stepImg,
          step: stepToEvaluate,
          autoActEnabled: false,
          threshold: similarityThreshold / 100,
          modeTransition: "auto_actor_evaluation",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Comparison failed");
      if (data.success) {
        const resultPayload = {
          matched: Boolean(data.matched),
          similarityScore: Number(data.similarityScore) || 0,
          reason: data.reason || "Comparison completed.",
          identifiedElements: data.identifiedElements || ["Target Interface"],
          timestamp: Date.now(),
          autoActExecuted: Boolean(data.autoActExecuted),
          executedStepName: stepToEvaluate.name,
        };
        setComparisonResult(resultPayload);

        // Add to execution log
        setExecutionLog((prev) => [
          {
            id: `log_${Date.now()}`,
            time: new Date().toLocaleTimeString(),
            stepName: stepToEvaluate.name,
            score: Number(data.similarityScore) || 0,
            matched: Boolean(data.matched),
            executed: Boolean(data.autoActExecuted),
            reason: data.reason || "Visual state evaluated",
          },
          ...prev.slice(0, 9),
        ]);

        if (autoActEnabled && data.matched && !continuousScan && onExecuteStep) {
          onToggleAutoAct(false);
          onExecuteStep(stepToEvaluate);
        }
      }
    } catch (err) {
      setComparisonResult({ matched: false, similarityScore: 0, reason: err instanceof Error ? err.message : "Comparison failed", identifiedElements: [], timestamp: Date.now(), autoActExecuted: false });
    } finally {
      setIsComparing(false);
    }
  };

  // Continuous background scanner if enabled
  useEffect(() => {
    if (!continuousScan) return;
    const timer = setInterval(() => {
      if (!isComparing && currentStep) {
        triggerAiComparison();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [continuousScan, isComparing, currentStep, currentLiveScreenshot, autoActEnabled, similarityThreshold]);

  return (
    <Card className={`bg-slate-900 border-indigo-500/40 shadow-2xl overflow-hidden ${className}`}>
      <CardHeader className="p-3.5 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-900/50">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Auto-Actor Screen Comparison & Execution Engine
              </CardTitle>
              <Badge
                className={`text-[10px] font-mono ${
                  autoActEnabled
                    ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {autoActEnabled ? "AUTO-ACT: ARMED" : "AUTO-ACT: STANDBY"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Compares live screen snapshots against workflow steps using AI vision triggers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[11px] font-mono text-slate-300 font-bold">Auto Act</span>
            <Switch
              checked={autoActEnabled}
              onCheckedChange={onToggleAutoAct}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          <Button
            size="sm"
            onClick={() => triggerAiComparison()}
            disabled={isComparing || !currentStep}
            className="h-8 text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 shadow-md shadow-indigo-950"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isComparing ? "animate-spin" : ""}`} />
            {isComparing ? "Comparing..." : "Trigger AI Comparison"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Step Selector & Threshold Config */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <div className="space-y-1 md:col-span-2">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-400 flex items-center gap-1.5">
              <Target className="w-3 h-3 text-cyan-400" />
              Target Verification Step to Match:
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {verificationSteps.length === 0 ? (
                <span className="text-xs text-slate-500 italic py-1">
                  No workflow steps saved yet. Add steps in the HUD or Editor.
                </span>
              ) : (
                verificationSteps.map((step, idx) => (
                  <button
                    key={step.id}
                    onClick={() => {
                      setActiveStepIndex(idx);
                      setComparisonResult(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold whitespace-nowrap border transition-all ${
                      activeStepIndex === idx
                        ? "bg-indigo-950 text-indigo-200 border-indigo-500 ring-1 ring-indigo-400"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    #{step.stepNumber || idx + 1} {step.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Match Threshold:</span>
              <span className="text-cyan-400 font-bold">{similarityThreshold}%</span>
            </div>
            <Slider
              value={[similarityThreshold]}
              onValueChange={([val]) => setSimilarityThreshold(val)}
              min={50}
              max={95}
              step={1}
              className="py-1"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>Forgiving (50%)</span>
              <span>Strict (95%)</span>
            </div>
          </div>
        </div>

        {/* Live Visual Comparison Dual View */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Current Screen Snapshot */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                Current Live Screen Snapshot
              </span>
              <Badge className="bg-slate-800 text-slate-300 text-[10px]">1920×1080 Viewport</Badge>
            </div>
            <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-800 bg-black">
              <img
                src={currentLiveScreenshot}
                alt="Current Live Screen"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-cyan-300 border border-slate-700">
                LIVE CAPTURE
              </div>
            </div>
          </div>

          {/* Target Verification Step Snapshot */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-purple-400 font-bold flex items-center gap-1">
                <Target className="w-3.5 h-3.5" />
                Expected Verification Snapshot (#{currentStep?.stepNumber || activeStepIndex + 1})
              </span>
              <Badge className="bg-purple-950 text-purple-300 border-purple-800 text-[10px]">
                {currentStep ? currentStep.action.toUpperCase() : "CLICK"}
              </Badge>
            </div>
            <div className="relative aspect-video rounded-lg overflow-hidden border border-purple-900/50 bg-black">
              <img
                src={expectedImg}
                alt="Expected Target"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-purple-300 border border-purple-800">
                {currentStep?.name || "Target Verification Keyframe"}
              </div>
              {currentStep && (
                <div
                  className="absolute w-5 h-5 rounded-full border-2 border-white bg-purple-600/80 -translate-x-1/2 -translate-y-1/2 animate-ping"
                  style={{
                    left: `${(currentStep.x / 1920) * 100}%`,
                    top: `${(currentStep.y / 1080) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* AI Comparison Result Card */}
        {comparisonResult && (
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              comparisonResult.matched
                ? "bg-emerald-950/80 border-emerald-500 shadow-xl shadow-emerald-950/50"
                : "bg-amber-950/80 border-amber-500 shadow-xl shadow-amber-950/50"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {comparisonResult.matched ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <div>
                  <h4 className="text-xs font-bold text-slate-100 font-mono flex items-center gap-2">
                    <span>
                      {comparisonResult.matched
                        ? "Screen Match Confirmed by Qwen Vision"
                        : "Visual Discrepancy / Below Match Threshold"}
                    </span>
                    <Badge
                      className={`text-[10px] font-mono ${
                        comparisonResult.matched
                          ? "bg-emerald-600 text-white"
                          : "bg-amber-600 text-white"
                      }`}
                    >
                      {(comparisonResult.similarityScore * 100).toFixed(1)}% Match
                    </Badge>
                  </h4>
                  <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                    {comparisonResult.reason}
                  </p>
                </div>
              </div>

              {comparisonResult.autoActExecuted && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-mono font-bold animate-pulse">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Auto-Act Dispatched to Native PyAutoGUI!
                </div>
              )}
            </div>
          </div>
        )}

        {/* Continuous Scan & History Logs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Continuous Auto-Scan (4s interval):</span>
            <Switch
              checked={continuousScan}
              onCheckedChange={setContinuousScan}
              className="data-[state=checked]:bg-indigo-600"
            />
          </div>

          <div className="flex items-center gap-2">
            {onTriggerSequenceExecution && (
              <Button
                size="sm"
                onClick={() => onTriggerSequenceExecution(verificationSteps)}
                disabled={verificationSteps.length === 0}
                className="h-7 text-xs font-mono font-bold bg-cyan-700 hover:bg-cyan-600 text-white gap-1"
              >
                <Play className="w-3 h-3" />
                Execute Full Matched Sequence ({verificationSteps.length} steps)
              </Button>
            )}
          </div>
        </div>

        {/* Execution Log Table */}
        {executionLog.length > 0 && (
          <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase font-mono font-bold text-slate-400">
              Recent Auto-Actor AI Match Log:
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin text-[11px] font-mono">
              {executionLog.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-slate-500 text-[10px]">{log.time}</span>
                    <span className="font-bold text-slate-200">{log.stepName}</span>
                    <span className="text-slate-400 truncate max-w-xs">{log.reason}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        log.matched ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"
                      }`}
                    >
                      {(log.score * 100).toFixed(0)}%
                    </span>
                    {log.executed && (
                      <Badge className="bg-emerald-600 text-white text-[9px] px-1 py-0">ACTED</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
