import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Play,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Filter,
  Activity,
  Cpu,
  MousePointer,
  Keyboard,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  Search,
  Maximize2,
  Minimize2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface BridgeLogItem {
  id: string;
  timestamp: number;
  action: string;
  type: "stdout" | "stderr" | "command" | "process" | "info" | "error";
  status: "success" | "warning" | "error" | "running";
  command?: string;
  details: string;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  pid?: number;
  exitCode?: number;
}

interface ActiveProcessItem {
  name: string;
  pid: number;
  status: string;
  cpu: string;
  mem: string;
}

interface LiveExecutionConsoleProps {
  className?: string;
  standalone?: boolean;
  height?: string;
  onDispatchAction?: (action: string, params: any) => Promise<any>;
  onExecuteTestCommand?: (cmd: any) => void;
}

export const LiveExecutionConsole: React.FC<LiveExecutionConsoleProps> = ({
  className = "",
  standalone = false,
  height,
  onDispatchAction,
  onExecuteTestCommand,
}) => {
  const [logs, setLogs] = useState<BridgeLogItem[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<ActiveProcessItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const [pollingInterval, setPollingInterval] = useState<number>(2000);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Quick Action Test Form State
  const [testActionType, setTestActionType] = useState<
    "click" | "double_click" | "right_click" | "move" | "drag" | "type" | "hotkey" | "press_key" | "companion_command"
  >("click");
  const [testCoords, setTestCoords] = useState<{ x: number; y: number }>({ x: 960, y: 540 });
  const [testText, setTestText] = useState("Hello from PyAutoGUI Bridge!");
  const [testKey, setTestKey] = useState("ctrl+s");
  const [testCompanionCmd, setTestCompanionCmd] = useState("echo 'Automated Subprocess' > /tmp/bridge_test.log");

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch Bridge Telemetry & Stdout/Stderr
  const fetchLogs = async (silent = true) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch("/api/pyautogui/logs");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
        if (Array.isArray(data.activeProcesses)) {
          setActiveProcesses(data.activeProcesses);
        }
      }
    } catch (err) {
      if (!silent) console.error("Failed to fetch bridge telemetry:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(false);
  }, []);

  // Real-time Polling Interval
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, pollingInterval);
    return () => clearInterval(interval);
  }, [isPolling, pollingInterval]);

  // Auto-scroll on new log entries
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/pyautogui/logs", { method: "DELETE" });
      if (res.ok) {
        setLogs([]);
        toast.success("Live execution console cleared.");
      }
    } catch (e) {
      setLogs([]);
      toast.success("Console buffer cleared locally.");
    }
  };

  // Copy Entire Console Log
  const handleCopyLogs = () => {
    const formatted = filteredLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [PID:${l.pid || 14201}] [${l.action}] [${l.status.toUpperCase()}] ${
            l.command ? `CMD: ${l.command} | ` : ""
          }${l.details} ${l.stdout ? `\n  STDOUT: ${l.stdout}` : ""} ${
            l.stderr ? `\n  STDERR: ${l.stderr}` : ""
          }`
      )
      .join("\n\n");
    navigator.clipboard.writeText(formatted);
    toast.success("Execution log copied to clipboard.");
  };

  // Copy single log line
  const handleCopySingleLog = (item: BridgeLogItem) => {
    const text = `[${new Date(item.timestamp).toLocaleTimeString()}] [${item.action}] ${item.command || ""} -> ${
      item.details
    } ${item.stdout || ""} ${item.stderr || ""}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Log item copied.");
  };

  // Trigger PyAutoGUI Action Test
  const handleExecuteTestAction = async () => {
    setIsExecutingTest(true);
    try {
      let payload: any = {
        action: testActionType,
        targetPosition: testCoords,
      };

      if (testActionType === "type") {
        payload.text = testText;
      } else if (testActionType === "hotkey" || testActionType === "press_key") {
        payload.key = testKey;
      } else if (testActionType === "companion_command") {
        payload.companionCommand = testCompanionCmd;
      } else if (testActionType === "drag") {
        payload.actions = [
          {
            type: "drag",
            x: testCoords.x,
            y: testCoords.y,
            toX: testCoords.x + 120,
            toY: testCoords.y + 60,
          },
        ];
      }

      if (onDispatchAction) {
        await onDispatchAction(testActionType, payload);
      } else {
        const res = await fetch("/api/pyautogui/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`Executed ${testActionType.toUpperCase()} via PyAutoGUI bridge`);
        } else {
          toast.error(`Execution warning: ${data.error || "Subprocess warning"}`);
        }
      }
      await fetchLogs(true);
    } catch (err: any) {
      toast.error(`Bridge dispatch failed: ${err.message}`);
    } finally {
      setIsExecutingTest(false);
    }
  };

  // Filter and search logs
  const filteredLogs = logs.filter((l) => {
    if (filterType === "commands" && l.type !== "command") return false;
    if (filterType === "stdout" && l.type !== "stdout" && !l.stdout) return false;
    if (filterType === "stderr" && l.type !== "stderr" && !l.stderr && l.status !== "error") return false;
    if (filterType === "mouse" && !["CLICK", "MOVE", "DOUBLE_CLICK", "RIGHT_CLICK", "DRAG"].includes(l.action.toUpperCase())) return false;
    if (filterType === "keyboard" && !["TYPE", "HOTKEY", "PRESS_KEY"].includes(l.action.toUpperCase())) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAction = l.action.toLowerCase().includes(q);
      const matchDetails = l.details.toLowerCase().includes(q);
      const matchCommand = l.command?.toLowerCase().includes(q);
      const matchStdout = l.stdout?.toLowerCase().includes(q);
      const matchStderr = l.stderr?.toLowerCase().includes(q);
      return matchAction || matchDetails || matchCommand || matchStdout || matchStderr;
    }
    return true;
  });

  const commandCount = logs.filter((l) => l.type === "command" || ["CLICK", "MOVE", "TYPE", "DRAG", "HOTKEY"].includes(l.action)).length;
  const stdoutCount = logs.filter((l) => l.stdout || l.type === "stdout").length;
  const stderrCount = logs.filter((l) => l.stderr || l.status === "error").length;

  return (
    <div
      id="live-execution-console"
      className={`rounded-xl border border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-2xl flex flex-col font-sans overflow-hidden transition-all ${
        isExpanded ? "fixed inset-4 z-50 shadow-2xl border-cyan-500/80" : ""
      } ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-950/90 border border-emerald-600/80 text-emerald-400 shadow-sm">
            <Terminal className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                Live Execution Console
              </h3>
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[10px] font-mono px-1.5 py-0">
                PyAutoGUI • stdout/stderr
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Low-level native OS interaction stream • Subprocess bridge
            </p>
          </div>
        </div>

        {/* Status Metrics & Quick Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400">Commands:</span>
            <span className="text-cyan-300 font-bold">{commandCount}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">stdout:</span>
            <span className="text-emerald-400 font-bold">{stdoutCount}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">stderr:</span>
            <span className={stderrCount > 0 ? "text-red-400 font-bold" : "text-slate-500 font-bold"}>
              {stderrCount}
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchLogs(false)}
            disabled={isLoading}
            className="h-7 px-2 text-xs border-slate-700 text-slate-300 hover:text-white bg-slate-900"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyLogs}
            className="h-7 px-2 text-xs border-slate-700 text-slate-300 hover:text-white bg-slate-900"
          >
            <Copy className="w-3 h-3 mr-1" />
            Copy All
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleClearLogs}
            className="h-7 px-2 text-xs border-red-900/60 text-red-300 hover:bg-red-950/70 bg-slate-900"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
            title={isExpanded ? "Collapse View" : "Maximize View"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Process & Polling Control Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-950/90 border-b border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-slate-400 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-400" /> Active Subprocesses:
          </span>
          {activeProcesses.map((p) => (
            <div
              key={p.pid}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-bold text-cyan-300">{p.name}</span>
              <span className="text-slate-500">(PID {p.pid})</span>
              <span className="text-emerald-400">{p.status}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3 rounded accent-cyan-500"
            />
            <span>Auto-scroll</span>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPolling}
              onChange={(e) => setIsPolling(e.target.checked)}
              className="w-3 h-3 rounded accent-emerald-500"
            />
            <span>Live Stream</span>
          </label>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-900/50 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          {[
            { id: "all", label: "All Logs" },
            { id: "commands", label: "Commands" },
            { id: "mouse", label: "Mouse Clicks/Moves" },
            { id: "keyboard", label: "Keyboard" },
            { id: "stdout", label: "stdout Stream" },
            { id: "stderr", label: "stderr & Errors" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                filterType === tab.id
                  ? "bg-cyan-600 text-white font-bold shadow-sm"
                  : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stdout, commands, PIDs..."
            className="h-7 pl-8 text-xs bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 w-full"
          />
        </div>
      </div>

      {/* Interactive Quick-Test Dispatcher Banner */}
      <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono font-bold text-amber-300 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Interactive Action Trigger:
          </span>
          <select
            value={testActionType}
            onChange={(e) => setTestActionType(e.target.value as any)}
            className="h-7 text-xs font-mono bg-slate-950 border border-slate-700 rounded px-2 text-slate-200"
          >
            <option value="click">Mouse Click</option>
            <option value="double_click">Double Click</option>
            <option value="right_click">Right Click</option>
            <option value="move">Move Cursor</option>
            <option value="drag">Drag & Drop (+120px)</option>
            <option value="type">Typewrite Text</option>
            <option value="hotkey">Hotkey Chord</option>
            <option value="press_key">Press Single Key</option>
            <option value="companion_command">Companion Subprocess</option>
          </select>

          {["click", "double_click", "right_click", "move", "drag"].includes(testActionType) && (
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="text-slate-400">X:</span>
              <input
                type="number"
                value={testCoords.x}
                onChange={(e) => setTestCoords({ ...testCoords, x: parseInt(e.target.value) || 0 })}
                className="w-16 h-7 px-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-cyan-300"
              />
              <span className="text-slate-400 ml-1">Y:</span>
              <input
                type="number"
                value={testCoords.y}
                onChange={(e) => setTestCoords({ ...testCoords, y: parseInt(e.target.value) || 0 })}
                className="w-16 h-7 px-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-cyan-300"
              />
            </div>
          )}

          {testActionType === "type" && (
            <Input
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Text to typewrite..."
              className="h-7 w-48 text-xs bg-slate-950 border-slate-700 text-slate-200"
            />
          )}

          {(testActionType === "hotkey" || testActionType === "press_key") && (
            <Input
              value={testKey}
              onChange={(e) => setTestKey(e.target.value)}
              placeholder="e.g. ctrl+s, enter, esc"
              className="h-7 w-32 text-xs bg-slate-950 border-slate-700 text-slate-200 font-mono"
            />
          )}

          {testActionType === "companion_command" && (
            <Input
              value={testCompanionCmd}
              onChange={(e) => setTestCompanionCmd(e.target.value)}
              placeholder="e.g. echo 123, calc.exe"
              className="h-7 w-56 text-xs bg-slate-950 border-slate-700 text-slate-200 font-mono"
            />
          )}
        </div>

        <Button
          size="sm"
          onClick={handleExecuteTestAction}
          disabled={isExecutingTest}
          className="h-7 text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-md shadow-emerald-950"
        >
          <Play className={`w-3 h-3 ${isExecutingTest ? "animate-spin" : ""}`} />
          {isExecutingTest ? "Executing..." : "Dispatch to PC"}
        </Button>
      </div>

      {/* Main Terminal Output Window */}
      <div
        ref={logContainerRef}
        className="flex-1 p-3 overflow-y-auto max-h-[420px] min-h-[220px] space-y-2 bg-[#080d1a] font-mono text-xs select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
            <Terminal className="w-8 h-8 text-slate-600 stroke-[1.5]" />
            <p className="text-xs font-mono">No execution logs matched your active filter.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExecuteTestAction}
              className="h-7 text-xs text-slate-300 border-slate-800 bg-slate-900"
            >
              Trigger Test Command
            </Button>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isClick = ["CLICK", "DOUBLE_CLICK", "RIGHT_CLICK", "MOVE", "DRAG"].includes(log.action.toUpperCase());
            const isKey = ["TYPE", "HOTKEY", "PRESS_KEY"].includes(log.action.toUpperCase());
            const isError = log.status === "error" || !!log.stderr;
            const isWarning = log.status === "warning";

            return (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border transition-all ${
                  isError
                    ? "bg-red-950/40 border-red-800/70 text-red-200"
                    : isWarning
                    ? "bg-amber-950/30 border-amber-800/60 text-amber-200"
                    : isClick
                    ? "bg-cyan-950/30 border-cyan-800/60 text-cyan-100"
                    : isKey
                    ? "bg-purple-950/30 border-purple-800/60 text-purple-100"
                    : "bg-slate-900/60 border-slate-800/80 text-slate-300"
                }`}
              >
                {/* Top Line: Timestamp, Action Badge, PID, Duration, Copy Action */}
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}.
                      {String(new Date(log.timestamp).getMilliseconds()).padStart(3, "0")}
                    </span>

                    <Badge
                      className={`text-[9px] font-mono uppercase px-1.5 py-0 ${
                        isError
                          ? "bg-red-900 text-red-100 border-red-700"
                          : isWarning
                          ? "bg-amber-900 text-amber-100 border-amber-700"
                          : isClick
                          ? "bg-cyan-900 text-cyan-200 border-cyan-700"
                          : isKey
                          ? "bg-purple-900 text-purple-200 border-purple-700"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {log.action}
                    </Badge>

                    {log.pid && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                        PID: {log.pid}
                      </span>
                    )}

                    {log.durationMs !== undefined && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {log.durationMs}ms
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleCopySingleLog(log)}
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedId === log.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                </div>

                {/* Command & Details */}
                <div className="pt-1.5 space-y-1">
                  {log.command && (
                    <div className="flex items-start gap-1.5 text-amber-300 font-mono text-[11px]">
                      <span className="text-slate-500 select-none">$</span>
                      <code className="bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800/80 break-all">
                        {log.command}
                      </code>
                    </div>
                  )}

                  <p className="text-slate-200 text-xs leading-relaxed font-sans">{log.details}</p>

                  {/* stdout stream */}
                  {log.stdout && (
                    <div className="mt-1 p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 whitespace-pre-wrap break-all">
                      <div className="text-[9px] uppercase tracking-wider text-emerald-500/80 font-bold mb-0.5 flex items-center gap-1">
                        <ArrowRight className="w-2.5 h-2.5" /> stdout:
                      </div>
                      {log.stdout}
                    </div>
                  )}

                  {/* stderr stream */}
                  {log.stderr && (
                    <div className="mt-1 p-2 rounded bg-red-950/70 border border-red-800 font-mono text-[11px] text-red-300 whitespace-pre-wrap break-all">
                      <div className="text-[9px] uppercase tracking-wider text-red-400 font-bold mb-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> stderr:
                      </div>
                      {log.stderr}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Terminal Footer Info */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            PyAutoGUI Bridge: Online
          </span>
          <span className="text-slate-600">•</span>
          <span>Native Platform: Linux/Windows Low-Level Hooks</span>
        </div>
        <div className="text-slate-500">
          Showing {filteredLogs.length} of {logs.length} entries
        </div>
      </div>
    </div>
  );
};
