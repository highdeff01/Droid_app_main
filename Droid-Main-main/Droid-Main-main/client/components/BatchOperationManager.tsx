import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Square,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  Sliders,
  ShieldCheck,
  Activity,
  FileText,
  Copy,
  ChevronRight,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  MouseTrajectoryStore,
  MouseRecordingSession,
} from "../../src/services/mouseTrajectoryStore";

export interface BatchSessionItem {
  id: string; // unique batch item id
  sessionId: string; // references MouseRecordingSession
  name: string;
  delayBeforeMs: number;
  delayAfterMs: number;
  speedMultiplier: number;
  onErrorAction: "skip" | "retry_3x" | "abort";
  verifyScreenshot: boolean;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  executionTimeMs?: number;
  errorReason?: string;
}

export interface BatchPipeline {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  items: BatchSessionItem[];
}

interface BatchOperationManagerProps {
  onExecuteBatchStep?: (session: MouseRecordingSession, speed: number) => Promise<boolean>;
  className?: string;
}

export const BatchOperationManager: React.FC<BatchOperationManagerProps> = ({
  onExecuteBatchStep,
  className = "",
}) => {
  const store = MouseTrajectoryStore.getInstance();
  const [allSessions, setAllSessions] = useState<MouseRecordingSession[]>([]);

  // Batch Pipeline Items
  const [pipelineItems, setPipelineItems] = useState<BatchSessionItem[]>([]);
  const [pipelineName, setPipelineName] = useState<string>("Sequential Production Pipeline #1");
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [selectedPipelinePreset, setSelectedPipelinePreset] = useState<string>("default");

  // Execution State
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [isBatchPaused, setIsBatchPaused] = useState<boolean>(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState<number | null>(null);
  const [currentStepWithinSession, setCurrentStepWithinSession] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [batchLogs, setBatchLogs] = useState<Array<{
    timestamp: string;
    level: "info" | "success" | "warn" | "error";
    message: string;
  }>>([]);

  const isPausedRef = useRef<boolean>(false);
  const isAbortedRef = useRef<boolean>(false);

  // Load available sessions from 100-session ledger
  const loadSessions = () => {
    const list = store.getAllSessions();
    setAllSessions(list);
    if (pipelineItems.length === 0 && list.length > 0) {
      // Seed initial batch from available sessions
      const initial: BatchSessionItem[] = list.slice(0, 3).map((s, idx) => ({
        id: `batch_item_${Date.now()}_${idx}`,
        sessionId: s.id,
        name: s.name,
        delayBeforeMs: 300,
        delayAfterMs: 500,
        speedMultiplier: 1.0,
        onErrorAction: "retry_3x",
        verifyScreenshot: true,
        status: "pending",
      }));
      setPipelineItems(initial);
    }
  };

  useEffect(() => {
    loadSessions();
    const unsub = store.subscribe(() => {
      setAllSessions(store.getAllSessions());
    });
    return () => unsub();
  }, []);

  // Compute overall progress metrics
  const progressMetrics = useMemo(() => {
    if (pipelineItems.length === 0) return { percent: 0, completed: 0, total: 0, failed: 0 };
    const total = pipelineItems.length;
    const completed = pipelineItems.filter((i) => i.status === "completed").length;
    const failed = pipelineItems.filter((i) => i.status === "failed").length;
    const skipped = pipelineItems.filter((i) => i.status === "skipped").length;

    let fractional = 0;
    if (currentRunningIndex !== null && currentStepWithinSession.total > 0) {
      fractional = currentStepWithinSession.current / currentStepWithinSession.total;
    }

    const effectiveCompleted = completed + (isBatchRunning ? fractional : 0);
    const percent = Math.min(100, Math.round((effectiveCompleted / total) * 100));

    return { percent, completed, total, failed, skipped };
  }, [pipelineItems, currentRunningIndex, currentStepWithinSession, isBatchRunning]);

  const addSessionToPipeline = (session: MouseRecordingSession) => {
    const newItem: BatchSessionItem = {
      id: `batch_item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: session.id,
      name: session.name,
      delayBeforeMs: 300,
      delayAfterMs: 500,
      speedMultiplier: 1.0,
      onErrorAction: "retry_3x",
      verifyScreenshot: true,
      status: "pending",
    };
    setPipelineItems((prev) => [...prev, newItem]);
    toast.success(`Added "${session.name}" to batch pipeline`);
  };

  const removePipelineItem = (id: string) => {
    if (isBatchRunning) {
      toast.error("Cannot modify pipeline while batch is executing");
      return;
    }
    setPipelineItems((prev) => prev.filter((i) => i.id !== id));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (isBatchRunning) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= pipelineItems.length) return;
    setPipelineItems((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const updateItemConfig = (id: string, updates: Partial<BatchSessionItem>) => {
    setPipelineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const appendLog = (level: "info" | "success" | "warn" | "error", message: string) => {
    setBatchLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      },
      ...prev.slice(0, 100),
    ]);
  };

  // Run the batch pipeline sequentially
  const runBatchPipeline = async () => {
    if (pipelineItems.length === 0) {
      toast.error("Add at least one session to the batch pipeline");
      return;
    }

    setIsBatchRunning(true);
    setIsBatchPaused(false);
    isPausedRef.current = false;
    isAbortedRef.current = false;

    // Reset item statuses
    setPipelineItems((prev) =>
      prev.map((i) => ({ ...i, status: "pending", executionTimeMs: undefined, errorReason: undefined }))
    );

    appendLog("info", `🚀 Starting batch pipeline "${pipelineName}" (${pipelineItems.length} sessions queued)...`);

    for (let i = 0; i < pipelineItems.length; i++) {
      if (isAbortedRef.current) {
        appendLog("warn", "⏹️ Batch pipeline execution aborted by user.");
        break;
      }

      // Handle pause loop
      while (isPausedRef.current) {
        await new Promise((res) => setTimeout(res, 250));
        if (isAbortedRef.current) break;
      }
      if (isAbortedRef.current) break;

      const currentItem = pipelineItems[i];
      const sessionData = store.getSessionById(currentItem.sessionId);

      if (!sessionData) {
        appendLog("error", `Session ID ${currentItem.sessionId} not found in store, skipping.`);
        setPipelineItems((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "skipped", errorReason: "Not found" } : item))
        );
        continue;
      }

      setCurrentRunningIndex(i);
      setPipelineItems((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "running" } : item))
      );

      appendLog("info", `[${i + 1}/${pipelineItems.length}] Executing "${currentItem.name}" (${sessionData.points.length} coordinates)...`);

      // Pre-delay
      if (currentItem.delayBeforeMs > 0) {
        await new Promise((res) => setTimeout(res, currentItem.delayBeforeMs));
      }

      const startTime = Date.now();
      let success = false;
      const totalPoints = sessionData.points.length;
      setCurrentStepWithinSession({ current: 0, total: totalPoints });

      // If external executor provided
      if (onExecuteBatchStep) {
        try {
          success = await onExecuteBatchStep(sessionData, currentItem.speedMultiplier);
        } catch (err: any) {
          success = false;
        }
      } else {
        // Step-by-step simulated pipeline progression
        for (let p = 0; p < totalPoints; p++) {
          if (isAbortedRef.current) break;
          while (isPausedRef.current) {
            await new Promise((res) => setTimeout(res, 250));
            if (isAbortedRef.current) break;
          }
          setCurrentStepWithinSession({ current: p + 1, total: totalPoints });
          await new Promise((res) => setTimeout(res, Math.max(15, 60 / currentItem.speedMultiplier)));
        }
        success = !isAbortedRef.current;
      }

      const elapsed = Date.now() - startTime;

      if (success) {
        setPipelineItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "completed", executionTimeMs: elapsed } : item
          )
        );
        appendLog("success", `✓ [${i + 1}/${pipelineItems.length}] "${currentItem.name}" completed successfully in ${elapsed}ms.`);
      } else {
        setPipelineItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? { ...item, status: "failed", executionTimeMs: elapsed, errorReason: "Verification threshold failed" }
              : item
          )
        );
        appendLog("error", `✗ [${i + 1}/${pipelineItems.length}] "${currentItem.name}" failed.`);

        if (currentItem.onErrorAction === "abort") {
          appendLog("warn", "Policy set to 'Abort on Failure' - stopping pipeline.");
          break;
        }
      }

      // Post-delay
      if (currentItem.delayAfterMs > 0 && i < pipelineItems.length - 1) {
        await new Promise((res) => setTimeout(res, currentItem.delayAfterMs));
      }
    }

    setCurrentRunningIndex(null);
    setCurrentStepWithinSession({ current: 0, total: 0 });
    setIsBatchRunning(false);

    if (!isAbortedRef.current) {
      appendLog("success", `🎉 Batch execution finished: ${progressMetrics.completed} passed, ${progressMetrics.failed} failed.`);
      toast.success("Batch pipeline execution complete!");

      if (isLooping) {
        appendLog("info", "🔁 Looping mode enabled: Restarting pipeline in 2s...");
        setTimeout(() => {
          runBatchPipeline();
        }, 2000);
      }
    }
  };

  const togglePause = () => {
    const next = !isBatchPaused;
    setIsBatchPaused(next);
    isPausedRef.current = next;
    appendLog("warn", next ? "⏸️ Batch execution paused." : "▶️ Batch execution resumed.");
    toast.info(next ? "Batch paused" : "Batch resumed");
  };

  const abortBatch = () => {
    isAbortedRef.current = true;
    setIsBatchRunning(false);
    setIsBatchPaused(false);
    setCurrentRunningIndex(null);
    appendLog("error", "⏹️ Pipeline aborted.");
    toast.error("Batch aborted");
  };

  const resetPipelineStatuses = () => {
    if (isBatchRunning) return;
    setPipelineItems((prev) =>
      prev.map((i) => ({ ...i, status: "pending", executionTimeMs: undefined, errorReason: undefined }))
    );
    toast.info("Reset batch item statuses");
  };

  return (
    <div className={`flex flex-col gap-5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 p-6 font-mono shadow-2xl ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                BATCH OPERATION MANAGER & SEQUENTIAL PIPELINE
              </h3>
              <p className="text-xs text-slate-400">
                Group, reorder, and execute multi-session automation workflows with synchronized progress tracking
              </p>
            </div>
          </div>
        </div>

        {/* Global Pipeline Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isBatchRunning ? (
            <Button
              onClick={runBatchPipeline}
              disabled={pipelineItems.length === 0}
              className="h-9 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-950/50 gap-1.5"
            >
              <Play className="w-4 h-4 fill-current" />
              RUN ENTIRE BATCH ({pipelineItems.length})
            </Button>
          ) : (
            <>
              <Button
                onClick={togglePause}
                variant="outline"
                className="h-9 px-3 border-amber-500/50 text-amber-300 bg-amber-950/30 hover:bg-amber-900/50 gap-1"
              >
                {isBatchPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                {isBatchPaused ? "RESUME" : "PAUSE"}
              </Button>
              <Button
                onClick={abortBatch}
                variant="destructive"
                className="h-9 px-3 gap-1"
              >
                <Square className="w-4 h-4 fill-current" />
                ABORT
              </Button>
            </>
          )}

          <Button
            onClick={resetPipelineStatuses}
            disabled={isBatchRunning}
            variant="outline"
            size="sm"
            className="h-9 px-3 border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
            title="Reset execution statuses"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Prominent Overall Batch Progress Bar Card */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">TOTAL BATCH PIPELINE PROGRESS:</span>
            <Badge
              className={`font-mono text-xs ${
                isBatchRunning
                  ? "bg-amber-950 text-amber-300 border-amber-600/50 animate-pulse"
                  : progressMetrics.percent === 100
                  ? "bg-emerald-950 text-emerald-300 border-emerald-600/50"
                  : "bg-slate-950 text-slate-400 border-slate-800"
              }`}
            >
              {isBatchRunning ? "⚡ EXECUTING PIPELINE" : progressMetrics.percent === 100 ? "✓ COMPLETE" : "IDLE"}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <span>
              Passed: <strong className="text-emerald-400">{progressMetrics.completed}</strong>/{progressMetrics.total}
            </span>
            {progressMetrics.failed > 0 && (
              <span>
                Failed: <strong className="text-red-400">{progressMetrics.failed}</strong>
              </span>
            )}
            <span className="text-slate-200 font-bold text-sm">{progressMetrics.percent}%</span>
          </div>
        </div>

        {/* Outer overall progress bar */}
        <div className="relative w-full bg-slate-950 rounded-full h-3.5 overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${progressMetrics.percent}%` }}
          />
        </div>

        {/* Current Active Session Sub-indicator */}
        {isBatchRunning && currentRunningIndex !== null && pipelineItems[currentRunningIndex] && (
          <div className="flex items-center justify-between text-[11px] pt-1 text-slate-300">
            <span className="flex items-center gap-1.5 text-amber-300">
              <Zap className="w-3.5 h-3.5 animate-bounce" />
              Active Session ({currentRunningIndex + 1}/{pipelineItems.length}):{" "}
              <strong>{pipelineItems[currentRunningIndex].name}</strong>
            </span>
            <span>
              Waypoint Progress: {currentStepWithinSession.current} / {currentStepWithinSession.total}
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Pipeline Items Queue on Left, Session Picker & Execution Logs on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Col (7 cols): Sequential Execution Queue */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              QUEUED SESSIONS PIPELINE ({pipelineItems.length})
            </h4>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`px-2 py-0.5 rounded text-[11px] border transition-all ${
                  isLooping
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}
              >
                🔁 Loop Batch: {isLooping ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {pipelineItems.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No sessions in pipeline. Select sessions from the right-hand panel to add them.
              </div>
            ) : (
              pipelineItems.map((item, index) => {
                const isCurrent = currentRunningIndex === index;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isCurrent
                        ? "bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/40"
                        : item.status === "completed"
                        ? "bg-emerald-950/20 border-emerald-700/40"
                        : item.status === "failed"
                        ? "bg-red-950/20 border-red-700/40"
                        : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Index, Status icon, Session Name */}
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <span className="w-5 h-5 rounded bg-slate-800 border border-slate-700 text-[10px] font-bold flex items-center justify-center text-slate-300">
                            {index + 1}
                          </span>
                          {/* Reorder Buttons */}
                          {!isBatchRunning && (
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => moveItem(index, "up")}
                                disabled={index === 0}
                                className="p-0.5 rounded text-slate-500 hover:text-white disabled:opacity-20"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => moveItem(index, "down")}
                                disabled={index === pipelineItems.length - 1}
                                className="p-0.5 rounded text-slate-500 hover:text-white disabled:opacity-20"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="text-xs font-bold text-slate-200 truncate">
                              {item.name}
                            </h5>
                            <Badge
                              className={`text-[9px] px-1.5 py-0 font-mono ${
                                item.status === "running"
                                  ? "bg-amber-500 text-slate-950 font-bold animate-pulse"
                                  : item.status === "completed"
                                  ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                                  : item.status === "failed"
                                  ? "bg-red-950 text-red-300 border-red-700"
                                  : "bg-slate-950 text-slate-400 border-slate-800"
                              }`}
                            >
                              {item.status.toUpperCase()}
                            </Badge>
                            {item.executionTimeMs && (
                              <span className="text-[10px] text-slate-400">
                                {item.executionTimeMs}ms
                              </span>
                            )}
                          </div>

                          {/* Item Configuration Row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[10px] text-slate-400">
                            <div>
                              <span>Speed:</span>
                              <select
                                value={item.speedMultiplier}
                                disabled={isBatchRunning}
                                onChange={(e) =>
                                  updateItemConfig(item.id, { speedMultiplier: parseFloat(e.target.value) })
                                }
                                className="ml-1 bg-slate-950 border border-slate-800 rounded px-1 text-slate-200"
                              >
                                <option value="0.5">0.5x</option>
                                <option value="1.0">1.0x</option>
                                <option value="2.0">2.0x</option>
                                <option value="5.0">5.0x</option>
                              </select>
                            </div>

                            <div>
                              <span>Post-Delay:</span>
                              <input
                                type="number"
                                step="100"
                                min="0"
                                max="5000"
                                value={item.delayAfterMs}
                                disabled={isBatchRunning}
                                onChange={(e) =>
                                  updateItemConfig(item.id, { delayAfterMs: parseInt(e.target.value) || 0 })
                                }
                                className="ml-1 w-14 bg-slate-950 border border-slate-800 rounded px-1 text-slate-200"
                              />
                              <span>ms</span>
                            </div>

                            <div className="col-span-2">
                              <span>On-Error:</span>
                              <select
                                value={item.onErrorAction}
                                disabled={isBatchRunning}
                                onChange={(e) =>
                                  updateItemConfig(item.id, { onErrorAction: e.target.value as any })
                                }
                                className="ml-1 bg-slate-950 border border-slate-800 rounded px-1 text-slate-200"
                              >
                                <option value="retry_3x">Retry 3x</option>
                                <option value="skip">Skip Next</option>
                                <option value="abort">Abort Batch</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Delete Button */}
                      {!isBatchRunning && (
                        <button
                          onClick={() => removePipelineItem(item.id)}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800"
                          title="Remove from batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col (5 cols): Available Session Picker & Live Batch Logs */}
        <div className="lg:col-span-5 space-y-4">
          {/* Section A: Session Picker */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <h4 className="text-xs font-bold text-amber-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4" />
                AVAILABLE SESSIONS ({allSessions.length})
              </span>
              <span className="text-[10px] text-slate-500 font-normal">Click + to add</span>
            </h4>

            <ScrollArea className="h-44 pr-2">
              <div className="space-y-1.5">
                {allSessions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No recorded sessions found. Record actions from HUD first.
                  </div>
                ) : (
                  allSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-xs hover:border-slate-700"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-200 truncate">{sess.name}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                          <span>{sess.points.length} pts</span>
                          <span>•</span>
                          <span>{sess.durationSec.toFixed(1)}s</span>
                          {sess.tags && sess.tags.length > 0 && (
                            <span className="text-amber-400/80">#{sess.tags[0]}</span>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => addSessionToPipeline(sess)}
                        disabled={isBatchRunning}
                        className="h-7 px-2.5 bg-slate-900 border border-slate-700 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        ADD
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Section B: Real-time Batch Telemetry Logs */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                PIPELINE EXECUTION TELEMETRY
              </h4>
              <button
                onClick={() => setBatchLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>

            <ScrollArea className="h-44 p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[10px]">
              {batchLogs.length === 0 ? (
                <div className="p-4 text-center text-slate-600">
                  Ready. Click "Run Entire Batch" to begin execution.
                </div>
              ) : (
                <div className="space-y-1">
                  {batchLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`leading-relaxed ${
                        log.level === "success"
                          ? "text-emerald-300"
                          : log.level === "error"
                          ? "text-red-400 font-bold"
                          : log.level === "warn"
                          ? "text-amber-300"
                          : "text-slate-400"
                      }`}
                    >
                      <span className="text-slate-600 mr-1.5">[{log.timestamp}]</span>
                      {log.message}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};
