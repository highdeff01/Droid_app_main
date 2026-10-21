import React, { useState, useEffect, useMemo } from "react";
import {
  History,
  Play,
  Monitor,
  MousePointer2,
  Video,
  Layers,
  Trash2,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Zap,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Activity,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  MouseTrajectoryStore,
  MouseRecordingSession,
  RecordedMousePoint,
} from "../../src/services/mouseTrajectoryStore";

interface ReplaySessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSessionForReplay: (session: MouseRecordingSession, executeOnHardware: boolean) => void;
  onLoadSessionToActiveTrail: (points: Array<{ x: number; y: number; time: number; isClick?: boolean }>) => void;
}

export const ReplaySessionsModal: React.FC<ReplaySessionsModalProps> = ({
  isOpen,
  onClose,
  onSelectSessionForReplay,
  onLoadSessionToActiveTrail,
}) => {
  const [sessions, setSessions] = useState<MouseRecordingSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "mouse_trail" | "video_recording" | "workflow_steps">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  const trajectoryStore = useMemo(() => MouseTrajectoryStore.getInstance(), []);

  // Reload sessions on modal open
  useEffect(() => {
    if (isOpen) {
      const all = trajectoryStore.getSessions();
      setSessions(all);
      if (all.length > 0 && !selectedSessionId) {
        setSelectedSessionId(all[0].id);
      }
    }
  }, [isOpen, trajectoryStore]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesType =
        filterType === "all" ||
        (filterType === "mouse_trail" && (!s.sessionType || s.sessionType === "mouse_trail")) ||
        s.sessionType === filterType;

      const matchesSearch =
        !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.tags && s.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

      return matchesType && matchesSearch;
    });
  }, [sessions, filterType, searchQuery]);

  const selectedSession = useMemo(() => {
    return sessions.find((s) => s.id === selectedSessionId) || (sessions.length > 0 ? sessions[0] : null);
  }, [sessions, selectedSessionId]);

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    trajectoryStore.deleteSession(id);
    const updated = trajectoryStore.getSessions();
    setSessions(updated);
    if (selectedSessionId === id) {
      setSelectedSessionId(updated.length > 0 ? updated[0].id : null);
    }
    toast.success("Recording session removed.");
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to reset all recording sessions to baseline?")) {
      trajectoryStore.clearAllSessions();
      const updated = trajectoryStore.getSessions();
      setSessions(updated);
      setSelectedSessionId(updated.length > 0 ? updated[0].id : null);
      toast.success("Sessions reset to default historical baselines.");
    }
  };

  const handleExportSession = (session: MouseRecordingSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = JSON.stringify(session, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording-session-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported "${session.name}"`);
  };

  const handleReplayClick = (session: MouseRecordingSession, executeOnHardware: boolean) => {
    onSelectSessionForReplay(session, executeOnHardware);
    onClose();
    toast.success(
      executeOnHardware
        ? `Executing "${session.name}" on Desktop PC via PyAutoGUI...`
        : `Replaying "${session.name}" visual trajectory on canvas...`
    );
  };

  const handleLoadToCanvas = (session: MouseRecordingSession) => {
    const formattedPoints = session.points.map((p, idx) => ({
      x: p.x,
      y: p.y,
      time: Date.now() + idx * 50,
      isClick: p.type === "click" || p.type === "left_click" || p.type === "right_click",
    }));
    onLoadSessionToActiveTrail(formattedPoints);
    onClose();
    toast.success(`Loaded ${session.points.length} waypoints from "${session.name}" into active HUD!`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-5 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                AI Replay & Multi-Session Recording HUD
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 font-mono mt-0.5">
                Holds up to 100 historical recording sessions (Mouse trails, video sequences, workflow steps) for instant preview and AI PC replay.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-amber-950/80 text-amber-300 border-amber-700 font-mono text-xs">
                {sessions.length} / 100 Sessions
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="h-7 text-xs font-mono text-slate-400 hover:text-red-400 border-slate-800 hover:bg-slate-900"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Reset Baselines
              </Button>
            </div>
          </div>

          {/* Filter Tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-800/60">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: "All Sessions", icon: Layers },
                { id: "mouse_trail", label: "Mouse Trails", icon: MousePointer2 },
                { id: "video_recording", label: "Video Recordings", icon: Video },
                { id: "workflow_steps", label: "Workflow Steps", icon: Zap },
              ].map((tab) => {
                const isSel = filterType === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFilterType(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                      isSel
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                        : "text-slate-400 hover:text-slate-200 bg-slate-900/50 hover:bg-slate-800/60 border border-slate-800/50"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions or tags..."
                className="h-7 pl-8 text-xs font-mono bg-slate-900 border-slate-800 text-slate-200 placeholder-slate-600 focus:border-amber-500"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Modal Main Grid: List on Left, Preview & Replay Controls on Right */}
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[460px] max-h-[580px]">
          {/* Left Column: Sessions List */}
          <div className="md:col-span-5 border-r border-slate-800/80 overflow-y-auto p-3 space-y-2 max-h-[560px]">
            {filteredSessions.length === 0 ? (
              <div className="text-center py-16 text-xs font-mono text-slate-500">
                No recording sessions found matching current filter.
              </div>
            ) : (
              filteredSessions.map((session, idx) => {
                const isSelected = selectedSession?.id === session.id;
                const isMouseTrail = !session.sessionType || session.sessionType === "mouse_trail";
                const isVideo = session.sessionType === "video_recording";

                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all relative ${
                      isSelected
                        ? "bg-slate-900/90 border-amber-500/60 ring-1 ring-amber-500/30 shadow-lg"
                        : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500 font-bold">
                          #{idx + 1}
                        </span>
                        {isVideo ? (
                          <Video className="w-3.5 h-3.5 text-cyan-400" />
                        ) : (
                          <MousePointer2 className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <h4 className="text-xs font-bold text-slate-100 truncate max-w-[180px]">
                          {session.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleExportSession(session, e)}
                          className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                          title="Export JSON"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete Session"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400 mb-2">
                      <div>
                        <span className="text-slate-500">Pts:</span>{" "}
                        <strong className="text-slate-200">{session.points.length}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Clicks:</span>{" "}
                        <strong className="text-amber-300">{session.clickCount}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Dur:</span>{" "}
                        <strong className="text-cyan-300">{session.durationSec.toFixed(1)}s</strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-t border-slate-800/60 pt-1.5">
                      <span>{new Date(session.recordedAt).toLocaleTimeString()}</span>
                      <span className="text-slate-400">Avg {session.averageSpeed} px/s</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Selected Session Detail & AI Replay Actions */}
          <div className="md:col-span-7 p-5 flex flex-col justify-between overflow-y-auto bg-slate-950/40">
            {selectedSession ? (
              <div className="space-y-4">
                {/* Header detail */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {selectedSession.name}
                      </h3>
                      <Badge className="bg-amber-950 text-amber-300 border-amber-700 text-[10px] font-mono">
                        {selectedSession.sessionType || "mouse_trail"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Recorded {new Date(selectedSession.recordedAt).toLocaleString()} ({selectedSession.durationSec.toFixed(1)}s total duration)
                    </p>
                  </div>

                  <div className="text-right">
                    <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 font-mono text-[10px]">
                      {selectedSession.targetDevice || "desktop"}
                    </Badge>
                  </div>
                </div>

                {/* Trajectory Mini Map / Visualization Canvas */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 relative overflow-hidden shadow-inner">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      1920x1080 Normalized Coordinate Map
                    </span>
                    <span className="text-emerald-400">{selectedSession.points.length} waypoints</span>
                  </div>

                  <div className="w-full aspect-[16/9] bg-slate-950 rounded-lg border border-slate-800/80 relative overflow-hidden flex items-center justify-center">
                    {/* SVG Trajectory Visualization */}
                    <svg
                      viewBox="0 0 1920 1080"
                      className="w-full h-full absolute inset-0"
                    >
                      {/* Grid Lines */}
                      <line x1="0" y1="540" x2="1920" y2="540" stroke="#1e293b" strokeWidth="2" strokeDasharray="4 4" />
                      <line x1="960" y1="0" x2="960" y2="1080" stroke="#1e293b" strokeWidth="2" strokeDasharray="4 4" />

                      {/* Path Line */}
                      {selectedSession.points.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={selectedSession.points.map((p) => `${p.x},${p.y}`).join(" ")}
                          className="opacity-80"
                        />
                      )}

                      {/* Click Points */}
                      {selectedSession.points.map((pt, pIdx) => {
                        const isClick = pt.type === "click" || pt.type === "left_click" || pt.type === "right_click";
                        if (!isClick && pIdx !== 0 && pIdx !== selectedSession.points.length - 1) return null;

                        return (
                          <g key={pIdx}>
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isClick ? "18" : "12"}
                              fill={pIdx === 0 ? "#10b981" : isClick ? "#f59e0b" : "#ef4444"}
                              className={isClick ? "animate-pulse" : ""}
                            />
                            <text
                              x={pt.x}
                              y={pt.y - 18}
                              fill="#ffffff"
                              fontSize="24"
                              fontFamily="monospace"
                              textAnchor="middle"
                            >
                              {pIdx === 0 ? "START" : isClick ? `CLICK #${pIdx + 1}` : "END"}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
                    <span className="text-[10px] font-mono text-slate-400 block">Waypoints</span>
                    <strong className="text-sm font-mono text-white">{selectedSession.points.length}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
                    <span className="text-[10px] font-mono text-slate-400 block">Click Events</span>
                    <strong className="text-sm font-mono text-amber-300">{selectedSession.clickCount}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
                    <span className="text-[10px] font-mono text-slate-400 block">Avg Speed</span>
                    <strong className="text-sm font-mono text-cyan-300">{selectedSession.averageSpeed} px/s</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-center">
                    <span className="text-[10px] font-mono text-slate-400 block">Max Speed</span>
                    <strong className="text-sm font-mono text-emerald-300">{selectedSession.maxSpeed} px/s</strong>
                  </div>
                </div>

                {/* Action Replay Buttons Bar */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() => handleLoadToCanvas(selectedSession)}
                    variant="outline"
                    className="flex-1 bg-slate-900 border-slate-700 text-slate-200 hover:text-white font-mono text-xs h-9 gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Load into Active Canvas
                  </Button>

                  <Button
                    onClick={() => handleReplayClick(selectedSession, false)}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs h-9 gap-1.5 shadow-md shadow-amber-950"
                  >
                    <Play className="w-3.5 h-3.5" />
                    AI Replay Visual Trail
                  </Button>

                  <Button
                    onClick={() => handleReplayClick(selectedSession, true)}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs h-9 gap-1.5 shadow-md shadow-emerald-950"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Execute on PC Hardware
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-xs font-mono text-slate-500">
                Select a recording session from the list on the left to inspect its trajectory and replay.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
