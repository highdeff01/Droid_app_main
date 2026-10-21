import React, { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Terminal,
  Search,
  Trash2,
  Download,
  Copy,
  Check,
  Eye,
  Crosshair,
  ShieldAlert,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  level: "info" | "vision" | "evidence" | "reroute" | "integrity" | "action" | "drift" | "error";
  stepIndex?: number;
  stepName?: string;
  evidenceId?: string;
  reasoning?: string;
  targetCoords?: { x: number; y: number };
  detectedCoords?: { x: number; y: number };
  driftPx?: number;
  message: string;
  rawPayload?: any;
}

interface ActionExecutionLogProps {
  logs: ActionLogEntry[];
  onClearLogs?: () => void;
  isOpen: boolean;
  onToggleOpen?: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onSelectEvidence?: (evidenceId: string) => void;
}

export const ActionExecutionLog: React.FC<ActionExecutionLogProps> = ({
  logs,
  onClearLogs,
  isOpen,
  onToggleOpen,
  isPaused = false,
  onTogglePause,
  onSelectEvidence,
}) => {
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when new logs arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    const matchesFilter =
      filterType === "all" ||
      (filterType === "reasoning" && Boolean(log.reasoning)) ||
      (filterType === "evidence" && (log.level === "evidence" || Boolean(log.evidenceId))) ||
      (filterType === "reroute" && (log.level === "reroute" || log.level === "drift")) ||
      (filterType === "integrity" && log.level === "integrity") ||
      (filterType === "action" && log.level === "action");

    if (!matchesFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.message.toLowerCase().includes(q) ||
      (log.stepName && log.stepName.toLowerCase().includes(q)) ||
      (log.evidenceId && log.evidenceId.toLowerCase().includes(q)) ||
      (log.reasoning && log.reasoning.toLowerCase().includes(q))
    );
  });

  const handleCopyEvidence = (evidenceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(evidenceId);
    setCopiedId(evidenceId);
    toast.success(`Copied Evidence ID: ${evidenceId}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `action_execution_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success(`Exported ${logs.length} log entries`);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`border border-cyan-500/40 bg-slate-950/95 backdrop-blur-md rounded-lg shadow-2xl flex flex-col font-mono transition-all duration-200 z-40 ${
        isExpanded
          ? "fixed inset-4 max-w-none max-h-none h-[calc(100vh-2rem)]"
          : "w-full max-h-[360px] h-[360px]"
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/30 bg-gradient-to-r from-slate-900 via-cyan-950/50 to-slate-900 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
            AI ACTION EXECUTION LOG
            <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-600/50 text-[10px]">
              {logs.length} ENTRIES
            </span>
          </span>
          {isPaused && (
            <Badge variant="outline" className="border-amber-400 bg-amber-950/60 text-amber-300 text-[10px] gap-1">
              <Pause className="w-2.5 h-2.5" /> STREAM PAUSED
            </Badge>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Pause / Resume */}
          {onTogglePause && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onTogglePause}
              className="h-6 px-2 text-[10px] text-slate-300 hover:text-white hover:bg-slate-800"
              title={isPaused ? "Resume Live Log Stream" : "Pause Live Log Stream"}
            >
              {isPaused ? <Play className="w-3 h-3 text-emerald-400 mr-1" /> : <Pause className="w-3 h-3 text-amber-400 mr-1" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
          )}

          {/* Export */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="h-6 px-2 text-[10px] text-slate-300 hover:text-white hover:bg-slate-800"
            title="Download logs as JSON"
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </Button>

          {/* Clear */}
          {onClearLogs && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearLogs}
              disabled={logs.length === 0}
              className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950/50"
              title="Clear all log entries"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}

          {/* Expand / Minimize */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
            title={isExpanded ? "Collapse panel" : "Expand to fullscreen"}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>

          {/* Close */}
          {onToggleOpen && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleOpen}
              className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
              title="Close log panel"
            >
              ✕
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900/60 text-xs">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <Filter className="w-3 h-3 text-slate-400 mr-0.5" />
          {[
            { id: "all", label: "ALL" },
            { id: "reasoning", label: "🧠 REASONING" },
            { id: "evidence", label: "🔍 EVIDENCE" },
            { id: "reroute", label: "⚡ REROUTES & DRIFT" },
            { id: "integrity", label: "🛡️ INTEGRITY" },
            { id: "action", label: "🎯 ACTIONS" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                filterType === tab.id
                  ? "bg-cyan-500 text-slate-950 shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input & auto-scroll toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search reasoning or evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-0.5 text-[11px] bg-slate-950 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44"
            />
          </div>

          <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded accent-cyan-500 w-3 h-3"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Log Entries Terminal Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs select-text scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-slate-950"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-1 py-8">
            <Terminal className="w-6 h-6 text-slate-600" />
            <p className="text-xs">No execution logs captured yet.</p>
            <p className="text-[10px] text-slate-600">
              Run a replay or trigger direct hardware actions to see real-time AI reasoning and evidence logs.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              fractionalSecondDigits: 3,
            });

            return (
              <div
                key={log.id}
                className={`p-2 rounded border transition-colors ${
                  log.level === "integrity"
                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                    : log.level === "reroute" || log.level === "drift"
                    ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                    : log.level === "evidence"
                    ? "bg-indigo-950/30 border-indigo-500/40 text-indigo-200"
                    : log.level === "vision"
                    ? "bg-cyan-950/30 border-cyan-500/40 text-cyan-200"
                    : log.level === "error"
                    ? "bg-red-950/40 border-red-500/50 text-red-200"
                    : "bg-slate-900/40 border-slate-800 text-slate-300"
                }`}
              >
                {/* Header Row: Timestamp + Level Badge + Step + Evidence ID */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 font-mono text-[10px]">{timeStr}</span>
                    
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold text-[9px] uppercase tracking-wider ${
                        log.level === "integrity"
                          ? "bg-emerald-900 text-emerald-300 border border-emerald-600/60"
                          : log.level === "reroute" || log.level === "drift"
                          ? "bg-amber-900 text-amber-300 border border-amber-600/60"
                          : log.level === "evidence"
                          ? "bg-indigo-900 text-indigo-300 border border-indigo-600/60"
                          : log.level === "vision"
                          ? "bg-cyan-900 text-cyan-300 border border-cyan-600/60"
                          : log.level === "error"
                          ? "bg-red-900 text-red-300 border border-red-600/60"
                          : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {log.level}
                    </span>

                    {log.stepName && (
                      <span className="font-semibold text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px]">
                        {log.stepName}
                      </span>
                    )}
                  </div>

                  {/* Evidence ID Badge */}
                  {log.evidenceId && (
                    <button
                      onClick={(e) => handleCopyEvidence(log.evidenceId!, e)}
                      className="px-1.5 py-0.5 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/60 text-indigo-300 text-[10px] font-bold flex items-center gap-1 group"
                      title="Click to copy Evidence ID"
                    >
                      <span>🔍 {log.evidenceId}</span>
                      {copiedId === log.evidenceId ? (
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                      )}
                    </button>
                  )}
                </div>

                {/* Primary Message */}
                <div className="text-[12px] font-mono leading-relaxed text-slate-100">
                  {log.message}
                </div>

                {/* AI Internal Reasoning Details */}
                {log.reasoning && (
                  <div className="mt-1.5 p-1.5 rounded bg-slate-950/80 border border-cyan-900/40 text-[11px] text-cyan-200/90 flex items-start gap-1.5">
                    <span className="text-cyan-400 font-bold shrink-0">🧠 Reasoning:</span>
                    <span className="leading-snug">{log.reasoning}</span>
                  </div>
                )}

                {/* Coordinates & Drift Vector */}
                {(log.targetCoords || log.detectedCoords || log.driftPx !== undefined) && (
                  <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-slate-400 flex-wrap">
                    {log.targetCoords && (
                      <span className="flex items-center gap-1">
                        <Crosshair className="w-3 h-3 text-cyan-400" />
                        Target: ({log.targetCoords.x}, {log.targetCoords.y})
                      </span>
                    )}
                    {log.detectedCoords && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <ArrowUpRight className="w-3 h-3" />
                        Detected: ({log.detectedCoords.x}, {log.detectedCoords.y})
                      </span>
                    )}
                    {log.driftPx !== undefined && (
                      <span className="text-amber-400 font-bold">
                        Drift: {log.driftPx.toFixed(1)}px
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
