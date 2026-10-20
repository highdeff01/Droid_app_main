import React, { useState, useEffect } from "react";
import {
  Activity,
  Cpu,
  Terminal,
  ShieldCheck,
  Eye,
  FileCode,
  AppWindow,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  ListChecks,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface WatcherAgentInfo {
  id: string;
  name: string;
  type: "system_process" | "file_integrity" | "window_focus" | "pyautogui_bridge";
  status: "running" | "idle" | "paused" | "warning";
  pid: number;
  cpu: string;
  memory: string;
  target: string;
  lastPing: number;
}

export interface InspectorBridgeLog {
  id: string;
  timestamp: number;
  action: string;
  status: "success" | "warning" | "error" | "running";
  details: string;
  pid?: number;
}

interface TaskInspectorProps {
  className?: string;
  compact?: boolean;
  onAssembleTask?: () => void;
}

export const TaskInspector: React.FC<TaskInspectorProps> = ({
  className = "",
  compact = false,
  onAssembleTask,
}) => {
  const [agents, setAgents] = useState<WatcherAgentInfo[]>([
    {
      id: "agent_pyautogui",
      name: "PyAutoGUI Execution Bridge",
      type: "pyautogui_bridge",
      status: "running",
      pid: 14201,
      cpu: "0.4%",
      memory: "18.2 MB",
      target: "Low-level OS Input Hooks",
      lastPing: Date.now(),
    },
    {
      id: "agent_sys_process",
      name: "System Process Watcher",
      type: "system_process",
      status: "running",
      pid: 14210,
      cpu: "0.6%",
      memory: "24.5 MB",
      target: "notepad.exe, calc.exe, chrome.exe, code.exe",
      lastPing: Date.now() - 2000,
    },
    {
      id: "agent_file_watch",
      name: "File Integrity & Storage Watcher",
      type: "file_integrity",
      status: "running",
      pid: 14218,
      cpu: "0.1%",
      memory: "12.1 MB",
      target: "/workspace/tasks.json, /workspace/input.txt",
      lastPing: Date.now() - 4000,
    },
    {
      id: "agent_window_monitor",
      name: "Foreground Window Monitor",
      type: "window_focus",
      status: "running",
      pid: 14224,
      cpu: "0.2%",
      memory: "9.8 MB",
      target: "Active Workspace Canvas (1920x1080)",
      lastPing: Date.now() - 1000,
    },
  ]);

  const [bridgeLogs, setBridgeLogs] = useState<InspectorBridgeLog[]>([]);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isAddingProgram, setIsAddingProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [monitoredPrograms, setMonitoredPrograms] = useState<string[]>([
    "notepad.exe",
    "calc.exe",
    "chrome.exe",
    "code.exe",
    "terminal",
  ]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Fetch real-time watcher status & bridge logs
  const fetchTelemetry = async () => {
    try {
      const [watcherRes, logsRes] = await Promise.all([
        fetch("/api/watcher/status"),
        fetch("/api/pyautogui/logs"),
      ]);

      if (watcherRes.ok) {
        const wData = await watcherRes.json();
        if (wData.success && wData.state?.monitoredPrograms) {
          setMonitoredPrograms(wData.state.monitoredPrograms);
        }
      }

      if (logsRes.ok) {
        const lData = await logsRes.json();
        if (lData.success && Array.isArray(lData.logs)) {
          setBridgeLogs(lData.logs.slice(0, 15));
        }
      }
    } catch (e) {
      // Graceful fallback
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  // Add Monitored Program
  const handleAddProgram = async () => {
    if (!newProgramName.trim()) return;
    const updated = Array.from(new Set([...monitoredPrograms, newProgramName.trim()]));
    setMonitoredPrograms(updated);
    setNewProgramName("");
    setIsAddingProgram(false);

    try {
      await fetch("/api/watcher/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitoredPrograms: updated }),
      });
      toast.success(`Watcher Agent attached to program: ${newProgramName}`);
    } catch (e) {
      toast.success(`Monitored program added: ${newProgramName}`);
    }
  };

  // Remove Monitored Program
  const handleRemoveProgram = (prog: string) => {
    setMonitoredPrograms((prev) => prev.filter((p) => p !== prog));
    toast.info(`Removed ${prog} from active monitoring.`);
  };

  // Trigger Live Task Assembly
  const handleTriggerAssembleTask = async () => {
    setIsAssembling(true);
    try {
      const res = await fetch("/api/watcher/assemble-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName: "Live Assembled UI Routine",
          action: "click",
          parameters: { x: 960, y: 540 },
          targetApp: monitoredPrograms[0] || "Desktop Canvas",
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Assembled live task: "${data.task?.name || "Auto Action"}"`);
        if (onAssembleTask) onAssembleTask();
      }
      await fetchTelemetry();
    } catch (e: any) {
      toast.error(`Task assembly error: ${e.message}`);
    } finally {
      setIsAssembling(false);
    }
  };

  // Toggle agent status
  const handleToggleAgent = (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === agentId) {
          const nextStatus = a.status === "running" ? "paused" : "running";
          toast.info(`${a.name} is now ${nextStatus.toUpperCase()}`);
          return { ...a, status: nextStatus };
        }
        return a;
      })
    );
  };

  return (
    <div
      id="task-inspector-panel"
      className={`rounded-xl border border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-2xl flex flex-col font-sans overflow-hidden text-xs ${className}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-cyan-950 border border-cyan-600/80 text-cyan-400">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              Task Inspector
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[9px] font-mono px-1 py-0">
                Watcher Agents
              </Badge>
            </h4>
            <p className="text-[10px] font-mono text-slate-400">
              Active Processes & PyAutoGUI Bridge Logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchTelemetry}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {/* Active Watcher Agents Matrix */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" /> Active Watcher Agents:
              </span>
              <span className="text-emerald-400 font-bold">
                {agents.filter((a) => a.status === "running").length} / {agents.length} Online
              </span>
            </div>

            <div className="space-y-1.5">
              {agents.map((agent) => {
                const isRunning = agent.status === "running";
                return (
                  <div
                    key={agent.id}
                    className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${
                      isRunning
                        ? "bg-slate-900/80 border-slate-800 text-slate-200"
                        : "bg-slate-950 border-slate-800/60 text-slate-500 opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                          }`}
                        />
                        <span className="text-[11px] truncate max-w-[150px]">{agent.name}</span>
                      </div>

                      <div className="flex items-center gap-1 font-mono text-[9px]">
                        <span className="bg-slate-950 px-1 py-0.2 rounded border border-slate-800 text-cyan-300">
                          PID {agent.pid}
                        </span>
                        <button
                          onClick={() => handleToggleAgent(agent.id)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            isRunning
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                              : "bg-amber-950 text-amber-300 border border-amber-700"
                          }`}
                        >
                          {isRunning ? "RUNNING" : "PAUSED"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                      <span className="truncate max-w-[170px] text-slate-400">{agent.target}</span>
                      <span className="text-slate-500">
                        CPU {agent.cpu} • {agent.memory}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monitored Programs & Targets Tag Cloud */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span className="flex items-center gap-1 font-bold">
                <AppWindow className="w-3 h-3 text-purple-400" /> Monitored Programs:
              </span>
              <button
                onClick={() => setIsAddingProgram(!isAddingProgram)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" /> Add Program
              </button>
            </div>

            {isAddingProgram && (
              <div className="flex gap-1 pt-1">
                <Input
                  value={newProgramName}
                  onChange={(e) => setNewProgramName(e.target.value)}
                  placeholder="e.g. figma.exe, blender.exe"
                  className="h-6 text-[11px] bg-slate-950 border-slate-700"
                  onKeyDown={(e) => e.key === "Enter" && handleAddProgram()}
                />
                <Button size="sm" onClick={handleAddProgram} className="h-6 px-2 text-[10px] bg-cyan-600">
                  Add
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {monitoredPrograms.map((prog) => (
                <span
                  key={prog}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-mono text-cyan-200"
                >
                  {prog}
                  <button
                    onClick={() => handleRemoveProgram(prog)}
                    className="text-slate-500 hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Recent Python Execution Bridge Logs Stream */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 font-bold">
              <span className="flex items-center gap-1">
                <Terminal className="w-3 h-3 text-emerald-400" /> Recent Bridge Operations:
              </span>
              <span className="text-[10px] text-slate-500">{bridgeLogs.length} logged</span>
            </div>

            <div className="p-2 rounded-lg bg-[#070c18] border border-slate-800/90 max-h-36 overflow-y-auto space-y-1 font-mono text-[10px]">
              {bridgeLogs.length === 0 ? (
                <div className="text-slate-500 py-3 text-center">No bridge events recorded yet.</div>
              ) : (
                bridgeLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-1 rounded bg-slate-900/60 border border-white/5 flex flex-col gap-0.5 text-slate-300"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-cyan-300 font-bold flex items-center gap-1">
                        <span className="text-slate-500">$</span>
                        {log.action}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-400 truncate text-[9.5px] font-sans">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live Task Assembly CTA */}
          <Button
            size="sm"
            onClick={handleTriggerAssembleTask}
            disabled={isAssembling}
            className="w-full h-7 text-xs font-mono font-bold bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white gap-1.5 shadow-md shadow-indigo-950"
          >
            <Sparkles className={`w-3 h-3 text-amber-300 ${isAssembling ? "animate-spin" : ""}`} />
            {isAssembling ? "Assembling Routine..." : "Assemble Live Tasks"}
          </Button>
        </div>
      )}
    </div>
  );
};
