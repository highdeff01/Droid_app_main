import React, { useState, useEffect } from "react";
import {
  Brain,
  Sparkles,
  Bot,
  GitFork,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Plus,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Layers,
  Clock,
  Zap,
  Target,
  FileCode,
  Wand2,
  Search,
  Eye,
  Crosshair,
  Sliders,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { safeFetchJson, safePostJson } from "@/lib/api-helper";

interface BackgroundTask {
  id: string;
  name: string;
  agentId: string;
  type: "dead_route_scan" | "repeat_bottleneck_scan" | "silent_renavigation" | "drift_sentry" | "loop_recovery";
  targetScope: string;
  cadenceMs: number;
  status: "running" | "paused" | "completed";
  findingsCount: number;
  lastScannedAt: number;
  autoHealEnabled: boolean;
}

interface BackgroundFinding {
  id: string;
  taskId: string;
  agentName: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "dead_route" | "bottleneck" | "loop" | "drift" | "latency";
  title: string;
  description: string;
  affectedPath: string[];
  suggestedAction: string;
  timestamp: number;
  resolved: boolean;
}

interface GenealogyNode {
  id: string;
  parentId: string | null;
  name: string;
  screenTitle: string;
  actionType: string;
  operationKey: string;
  level: number;
  executionCount: number;
  successRate: number;
  avgLatencyMs: number;
  childrenIds: string[];
  isSuccessLeaf: boolean;
  isBottleneck: boolean;
  isDeadEnd: boolean;
  patternTag?: string;
  aiPatternInsight?: string;
  sampleStep: any;
}

interface SuccessPattern {
  id: string;
  name: string;
  description: string;
  successRate: number;
  stepCount: number;
  frequency: string;
  status: "optimal" | "good" | "bottleneck";
  rootNodeId: string;
}

interface AutonomousWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWorkflow?: (workflow: any) => void;
  currentScreenTitle?: string;
}

export function AutonomousWorkflowModal({
  isOpen,
  onClose,
  onSelectWorkflow,
  currentScreenTitle = "Device Screen",
}: AutonomousWorkflowModalProps) {
  const [activeModalTab, setActiveModalTab] = useState<"agents" | "genealogy" | "creator">("agents");

  // Background Agent Manager State
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [backgroundFindings, setBackgroundFindings] = useState<BackgroundFinding[]>([]);
  const [metrics, setMetrics] = useState<{ activeTasksCount: number; totalFindings: number; unresolvedFindings: number; autoHealActionsExecuted: number }>({
    activeTasksCount: 3,
    totalFindings: 2,
    unresolvedFindings: 2,
    autoHealActionsExecuted: 5,
  });
  const [isScanning, setIsScanning] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskType, setNewTaskType] = useState<BackgroundTask["type"]>("dead_route_scan");
  const [newTaskCadence, setNewTaskCadence] = useState(1500);
  const [newTaskScope, setNewTaskScope] = useState("all_navigation_routes");
  const [newTaskAutoHeal, setNewTaskAutoHeal] = useState(true);

  // Workflow Genealogy State
  const [genealogyNodes, setGenealogyNodes] = useState<GenealogyNode[]>([]);
  const [successPatterns, setSuccessPatterns] = useState<SuccessPattern[]>([]);
  const [selectedGenealogyNode, setSelectedGenealogyNode] = useState<GenealogyNode | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<SuccessPattern | null>(null);
  const [isSynthesizingBranch, setIsSynthesizingBranch] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    gen_root: true,
    gen_direct_cta: true,
    gen_search_path: true,
    gen_settings_path: true,
  });

  // Fetch Background Agent Tasks & Findings
  const fetchBackgroundData = async () => {
    try {
      const data = await safeFetchJson<{
        tasks?: BackgroundTask[];
        findings?: BackgroundFinding[];
        metrics?: any;
      }>("/api/mobile-stream/background-agents/tasks");
      if (data.success) {
        setBackgroundTasks(data.tasks || []);
        setBackgroundFindings(data.findings || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.warn("Background agent fetch note:", err);
    }
  };

  // Fetch Workflow Genealogy
  const fetchGenealogyData = async () => {
    try {
      const data = await safeFetchJson<{
        nodes?: GenealogyNode[];
        patterns?: SuccessPattern[];
      }>("/api/mobile-stream/genealogy");
      if (data.success) {
        setGenealogyNodes(data.nodes || []);
        setSuccessPatterns(data.patterns || []);
        if (data.nodes && data.nodes.length > 0 && !selectedGenealogyNode) {
          setSelectedGenealogyNode(data.nodes[1] || data.nodes[0]);
        }
      }
    } catch (err) {
      console.warn("Workflow genealogy fetch note:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBackgroundData();
      fetchGenealogyData();
      const interval = setInterval(fetchBackgroundData, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Toggle Background Task
  const handleToggleTask = async (taskId: string) => {
    try {
      const data = await safePostJson(`/api/mobile-stream/background-agents/tasks/${taskId}/toggle`);
      if (data.success && data.task) {
        toast.success(`Task status updated to ${data.task.status}`);
        fetchBackgroundData();
      } else if (!data.success) {
        toast.error(data.error || "Failed to update task");
      }
    } catch {
      toast.error("Failed to toggle task");
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    try {
      const data = await safeFetchJson(`/api/mobile-stream/background-agents/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (data.success) {
        toast.success("Task removed");
        fetchBackgroundData();
      } else {
        toast.error(data.error || "Failed to delete task");
      }
    } catch {
      toast.error("Failed to delete task");
    }
  };

  // Trigger Silent Scan Now
  const handleTriggerSilentScan = async (taskType: string = "dead_route_scan") => {
    setIsScanning(true);
    try {
      const data = await safePostJson("/api/mobile-stream/background-agents/scan-now", {
        scanType: taskType,
      });
      if (data.success) {
        toast.success("Silent background sweep completed!");
        fetchBackgroundData();
      } else {
        toast.error(data.error || "Background sweep failed");
      }
    } catch {
      toast.error("Background sweep failed");
    } finally {
      setIsScanning(false);
    }
  };

  // Create New Background Monitoring Task
  const handleCreateTask = async () => {
    if (!newTaskName.trim()) {
      toast.error("Please enter a task name");
      return;
    }
    try {
      const data = await safePostJson("/api/mobile-stream/background-agents/tasks", {
        name: newTaskName,
        type: newTaskType,
        cadenceMs: newTaskCadence,
        targetScope: newTaskScope,
        autoHealEnabled: newTaskAutoHeal,
        agentId: newTaskType === "dead_route_scan" ? "agent_sentinel" : "agent_loop_recovery",
      });
      if (data.success) {
        toast.success("Background monitoring task assigned!");
        setIsCreatingTask(false);
        setNewTaskName("");
        fetchBackgroundData();
      } else {
        toast.error(data.error || "Failed to assign background task");
      }
    } catch {
      toast.error("Failed to assign background task");
    }
  };

  // Resolve Finding
  const handleResolveFinding = async (findingId: string) => {
    try {
      const data = await safePostJson(`/api/mobile-stream/background-agents/findings/${findingId}/resolve`);
      if (data.success) {
        toast.success("Finding marked resolved / auto-healed!");
        fetchBackgroundData();
      } else {
        toast.error(data.error || "Failed to resolve finding");
      }
    } catch {
      toast.error("Failed to resolve finding");
    }
  };

  // Synthesize Workflow from Genealogy Branch
  const handleSynthesizeBranch = async (node: GenealogyNode) => {
    setIsSynthesizingBranch(true);
    try {
      const data = await safePostJson("/api/mobile-stream/genealogy/synthesize", {
        branchId: node.id,
        customName: `Master ${node.name} Routine`,
      });
      if (data.success && data.workflow) {
        toast.success(`Synthesized Workflow "${data.workflow.name}"!`);
        if (onSelectWorkflow) {
          onSelectWorkflow(data.workflow);
        }
      } else {
        toast.error(data.error || "Failed to synthesize branch workflow");
      }
    } catch {
      toast.error("Failed to synthesize branch workflow");
    } finally {
      setIsSynthesizingBranch(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-purple-500/40 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-inner">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                  Autonomous Workflow Director & Genealogy Engine
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-950 border border-purple-500/40 text-[10px] font-mono font-bold text-purple-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                  {metrics.activeTasksCount} SENTINELS ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Silent background scanning for dead routes & bottlenecks • Multi-level parent-child navigation genealogy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveModalTab("agents")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                  activeModalTab === "agents"
                    ? "bg-purple-600 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Bot className="w-3.5 h-3.5" /> Background Agent Manager
              </button>
              <button
                onClick={() => setActiveModalTab("genealogy")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                  activeModalTab === "genealogy"
                    ? "bg-indigo-600 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <GitFork className="w-3.5 h-3.5 text-indigo-300" /> Workflow Genealogy & Lineage
              </button>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-slate-900/90">
          {/* TAB 1: BACKGROUND AGENT MANAGER */}
          {activeModalTab === "agents" && (
            <div className="space-y-4">
              {/* Telemetry Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Active Tasks</span>
                    <Bot className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <p className="text-xl font-bold text-purple-400 font-mono mt-1">{metrics.activeTasksCount}</p>
                  <span className="text-[10px] text-slate-500 font-mono">Silent background threads</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Identified Issues</span>
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <p className="text-xl font-bold text-rose-400 font-mono mt-1">{metrics.totalFindings}</p>
                  <span className="text-[10px] text-slate-500 font-mono">{metrics.unresolvedFindings} pending action</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Auto-Heal Actions</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{metrics.autoHealActionsExecuted}</p>
                  <span className="text-[10px] text-slate-500 font-mono">100% loop recoveries</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Cadence Scan Rate</span>
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <p className="text-xl font-bold text-cyan-400 font-mono mt-1">1.5s</p>
                  <span className="text-[10px] text-slate-500 font-mono">Zero UI latency impact</span>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleTriggerSilentScan("dead_route_scan")}
                    disabled={isScanning}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold gap-1.5 shadow-md"
                  >
                    {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Run Silent Background Sweep
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsCreatingTask(!isCreatingTask)}
                    className="text-xs bg-slate-900 border-slate-700 text-slate-200 hover:text-white gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-400" /> Assign New Monitoring Task
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={fetchBackgroundData}
                    className="text-xs text-slate-400 hover:text-white gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Findings
                  </Button>
                </div>
              </div>

              {/* Create Task Form */}
              {isCreatingTask && (
                <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/40 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-purple-400" /> Assign Background Monitoring Task
                    </h4>
                    <button onClick={() => setIsCreatingTask(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-300">Task Name:</label>
                      <Input
                        value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        placeholder="e.g. Silent Cart Checkout Bottleneck Scanner"
                        className="h-8 text-xs bg-slate-900 border-slate-700 text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-300">Scan Type & Objective:</label>
                      <select
                        value={newTaskType}
                        onChange={(e: any) => setNewTaskType(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      >
                        <option value="dead_route_scan">Dead Route & Screen Freeze Scanner</option>
                        <option value="repeat_bottleneck_scan">Repeat Bottleneck & Latency Hunter</option>
                        <option value="silent_renavigation">Silent Auto-Renavigation & Shortcut Planner</option>
                        <option value="drift_sentry">Visual Drift & Golden Baseline Sentry</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-300">Scan Cadence (ms):</label>
                      <Input
                        type="number"
                        min={500}
                        max={10000}
                        step={250}
                        value={newTaskCadence}
                        onChange={(e) => setNewTaskCadence(Number(e.target.value))}
                        className="h-8 text-xs bg-slate-900 border-slate-700 text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-300">Target Screen / Route Scope:</label>
                      <Input
                        value={newTaskScope}
                        onChange={(e) => setNewTaskScope(e.target.value)}
                        placeholder="all_routes, settings_flow, or custom tags"
                        className="h-8 text-xs bg-slate-900 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="autoHealCheck"
                        checked={newTaskAutoHeal}
                        onChange={(e) => setNewTaskAutoHeal(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-purple-600"
                      />
                      <label htmlFor="autoHealCheck" className="text-xs text-slate-300">
                        Enable Auto-Heal (Execute bypasses and prune dead routes automatically)
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setIsCreatingTask(false)} className="text-xs">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleCreateTask} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                        Assign Sentinel Task
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tasks & Findings Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Active Background Tasks */}
                <div className="lg:col-span-6 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-purple-400" /> Assigned Monitoring Sentinels ({backgroundTasks.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Continuous background polling</span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {backgroundTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 rounded-xl border space-y-2 transition-all ${
                          task.status === "running"
                            ? "bg-slate-950 border-purple-800/40"
                            : "bg-slate-950/60 border-slate-800 opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                task.status === "running" ? "bg-emerald-400 animate-ping" : "bg-slate-500"
                              }`}
                            />
                            <h4 className="text-xs font-bold text-white">{task.name}</h4>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleTask(task.id)}
                              className="h-6 px-2 text-[10px] text-slate-300 hover:text-white"
                            >
                              {task.status === "running" ? <Pause className="w-3 h-3 text-amber-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteTask(task.id)}
                              className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-purple-300">
                            {task.type.replace(/_/g, " ")}
                          </span>
                          <span>Cadence: {task.cadenceMs}ms</span>
                          <span>Scope: {task.targetScope}</span>
                          <span className="text-amber-300 font-bold">{task.findingsCount} findings</span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                          <span>Auto-Heal: {task.autoHealEnabled ? "Active" : "Off"}</span>
                          <span>Last Sweep: {new Date(task.lastScannedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Silent Findings Stream */}
                <div className="lg:col-span-6 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Silent Sentinel Findings & Bottleneck Alerts ({backgroundFindings.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Auto-detected without disruption</span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {backgroundFindings.length === 0 ? (
                      <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                        No background bottlenecks or dead routes detected. All navigation paths optimal!
                      </div>
                    ) : (
                      backgroundFindings.map((finding) => (
                        <div
                          key={finding.id}
                          className={`p-3 rounded-xl border space-y-2 transition-all ${
                            finding.resolved
                              ? "bg-slate-950/40 border-slate-800 opacity-60"
                              : finding.severity === "high" || finding.severity === "critical"
                              ? "bg-rose-950/30 border-rose-800/60"
                              : "bg-amber-950/20 border-amber-800/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                                    finding.severity === "high" || finding.severity === "critical"
                                      ? "bg-rose-950 text-rose-300 border border-rose-600/40"
                                      : "bg-amber-950 text-amber-300 border border-amber-600/40"
                                  }`}
                                >
                                  {finding.category.replace(/_/g, " ")}
                                </span>
                                <h4 className="text-xs font-bold text-white">{finding.title}</h4>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                                Spotted by {finding.agentName}
                              </span>
                            </div>

                            {!finding.resolved ? (
                              <Button
                                size="sm"
                                onClick={() => handleResolveFinding(finding.id)}
                                className="h-6 px-2 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
                              >
                                Auto-Heal & Resolve
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                                Resolved
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-slate-300">{finding.description}</p>

                          {finding.affectedPath && finding.affectedPath.length > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono bg-slate-950/60 p-1.5 rounded border border-slate-800">
                              <span className="text-slate-500">Path:</span>
                              {finding.affectedPath.map((p, i) => (
                                <React.Fragment key={i}>
                                  <span className="text-cyan-300">{p}</span>
                                  {i < finding.affectedPath.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-slate-600" />}
                                </React.Fragment>
                              ))}
                            </div>
                          )}

                          <div className="p-2 rounded bg-purple-950/30 border border-purple-800/30 text-[10px] text-purple-200">
                            💡 <span className="font-bold text-purple-300">Suggested Bypass:</span> {finding.suggestedAction}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORKFLOW GENEALOGY & SUCCESS PATTERNS */}
          {activeModalTab === "genealogy" && (
            <div className="space-y-4">
              {/* Success Pattern Banners */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Cross-Referenced Common Success Patterns
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Ranked by historical success rate</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {successPatterns.map((pat) => (
                    <div
                      key={pat.id}
                      onClick={() => setSelectedPattern(pat)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedPattern?.id === pat.id
                          ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500 shadow-md"
                          : pat.status === "optimal"
                          ? "bg-emerald-950/20 border-emerald-700/40 hover:border-emerald-500"
                          : pat.status === "bottleneck"
                          ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-bold text-white">{pat.name}</h4>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                            pat.status === "optimal"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                              : pat.status === "bottleneck"
                              ? "bg-rose-950 text-rose-400 border border-rose-500/30"
                              : "bg-indigo-950 text-indigo-300 border border-indigo-500/30"
                          }`}
                        >
                          {(pat.successRate * 100).toFixed(0)}% SUCCESS
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1">{pat.description}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-2 pt-1.5 border-t border-slate-800">
                        <span>Steps: {pat.stepCount}</span>
                        <span>Usage: {pat.frequency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Genealogy Tree Visualizer & Node Details */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Multi-Level Lineage Tree */}
                <div className="lg:col-span-7 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-indigo-400" /> Historical Navigation Lineage Tree
                    </span>
                    <span className="text-[10px] text-slate-400">Parent → Child hierarchical dependencies</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 max-h-[420px] overflow-y-auto">
                    {genealogyNodes.map((node) => {
                      const isSelected = selectedGenealogyNode?.id === node.id;
                      const indentClass =
                        node.level === 0 ? "ml-0" : node.level === 1 ? "ml-4" : node.level === 2 ? "ml-8" : "ml-12";

                      return (
                        <div
                          key={node.id}
                          onClick={() => setSelectedGenealogyNode(node)}
                          className={`${indentClass} p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? "bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-500 shadow-md"
                              : node.isDeadEnd
                              ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600"
                              : node.isBottleneck
                              ? "bg-amber-950/20 border-amber-800/40 hover:border-amber-600"
                              : "bg-slate-900 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {node.level > 0 && (
                              <ChevronRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                            )}
                            <div className="truncate">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-white truncate">{node.name}</span>
                                {node.isSuccessLeaf && (
                                  <span className="px-1 py-0.2 rounded bg-emerald-950 border border-emerald-500/30 text-[9px] text-emerald-400 font-mono">
                                    TARGET
                                  </span>
                                )}
                                {node.isDeadEnd && (
                                  <span className="px-1 py-0.2 rounded bg-rose-950 border border-rose-500/30 text-[9px] text-rose-400 font-mono">
                                    DEAD END
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                Screen: {node.screenTitle} • Action: {node.actionType}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                node.successRate >= 0.9
                                  ? "text-emerald-400 bg-emerald-950/60"
                                  : node.successRate >= 0.7
                                  ? "text-amber-400 bg-amber-950/60"
                                  : "text-rose-400 bg-rose-950/60"
                              }`}
                            >
                              {(node.successRate * 100).toFixed(0)}%
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">{node.avgLatencyMs}ms</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Node Details & AI Cross-Reference Insight */}
                <div className="lg:col-span-5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-indigo-400" /> Lineage Pattern Inspector
                    </span>
                    {selectedGenealogyNode && (
                      <Button
                        size="sm"
                        onClick={() => handleSynthesizeBranch(selectedGenealogyNode)}
                        disabled={isSynthesizingBranch}
                        className="h-6 px-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold gap-1"
                      >
                        {isSynthesizingBranch ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                        Synthesize Workflow
                      </Button>
                    )}
                  </div>

                  {selectedGenealogyNode ? (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div>
                        <span className="text-[10px] font-mono text-indigo-400 uppercase">
                          {selectedGenealogyNode.patternTag || "Genealogy Branch"}
                        </span>
                        <h4 className="text-sm font-bold text-white">{selectedGenealogyNode.name}</h4>
                        <span className="text-xs text-slate-400 font-mono">
                          Operation Key: {selectedGenealogyNode.operationKey}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400">Historical Reliability</span>
                          <p className="text-sm font-bold text-emerald-400 font-mono">
                            {(selectedGenealogyNode.successRate * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400">Average Latency</span>
                          <p className="text-sm font-bold text-cyan-400 font-mono">
                            {selectedGenealogyNode.avgLatencyMs} ms
                          </p>
                        </div>
                      </div>

                      {selectedGenealogyNode.aiPatternInsight && (
                        <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200">
                          <span className="font-bold text-indigo-300 block text-[10px] uppercase mb-0.5">
                            AI Pattern Recognition:
                          </span>
                          {selectedGenealogyNode.aiPatternInsight}
                        </div>
                      )}

                      <div className="space-y-1.5 pt-1 border-t border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400">Sample Step Parameters:</span>
                        <pre className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto">
                          {JSON.stringify(selectedGenealogyNode.sampleStep || {}, null, 2)}
                        </pre>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleSynthesizeBranch(selectedGenealogyNode)}
                        disabled={isSynthesizingBranch}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold gap-1.5 shadow-md"
                      >
                        {isSynthesizingBranch ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Compile & Load Workflow into Main HUD
                      </Button>
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                      Select a genealogy node from the lineage tree to inspect cross-referenced success patterns.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
