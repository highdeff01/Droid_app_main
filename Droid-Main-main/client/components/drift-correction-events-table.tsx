import React, { useState, useEffect } from "react";
import {
  Activity,
  Target,
  Crosshair,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Zap,
  Sliders,
  Filter,
  Clock,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface DriftCorrectionEventItem {
  id: string;
  timestamp: number;
  stepId: string;
  stepName: string;
  actionType: string;
  originalPosition: { x: number; y: number };
  correctedPosition: { x: number; y: number };
  offsetX: number;
  offsetY: number;
  euclideanDriftPx: number;
  driftThresholdPx: number;
  recalibrationStatus: "recalibrated" | "exceeded_threshold" | "aligned";
  triggerSource: "auto_reposition_agent" | "pre_execution_scanner" | "vision_debug" | "manual";
  confidenceScore: number;
  details: string;
}

interface DriftCorrectionEventsTableProps {
  className?: string;
  onApplyReposition?: (event: DriftCorrectionEventItem) => void;
}

export const DriftCorrectionEventsTable: React.FC<DriftCorrectionEventsTableProps> = ({
  className = "",
  onApplyReposition,
}) => {
  const [events, setEvents] = useState<DriftCorrectionEventItem[]>([
    {
      id: "drift_evt_01",
      timestamp: Date.now() - 1000 * 60 * 8,
      stepId: "step_search_bar",
      stepName: "Search Input Bar",
      actionType: "click",
      originalPosition: { x: 608, y: 140 },
      correctedPosition: { x: 620, y: 140 },
      offsetX: 12,
      offsetY: 0,
      euclideanDriftPx: 12.0,
      driftThresholdPx: 14,
      recalibrationStatus: "recalibrated",
      triggerSource: "auto_reposition_agent",
      confidenceScore: 0.985,
      details: "Detected +12px horizontal layout shift in search bar container. Auto-repositioned target centroid.",
    },
    {
      id: "drift_evt_02",
      timestamp: Date.now() - 1000 * 60 * 3,
      stepId: "step_submit_btn",
      stepName: "Primary Submit Button",
      actionType: "click",
      originalPosition: { x: 952, y: 554 },
      correctedPosition: { x: 960, y: 560 },
      offsetX: 8,
      offsetY: 6,
      euclideanDriftPx: 10.0,
      driftThresholdPx: 12,
      recalibrationStatus: "recalibrated",
      triggerSource: "pre_execution_scanner",
      confidenceScore: 0.992,
      details: "Template mismatch compensated before click dispatch. Adjusted offset (+8px X, +6px Y).",
    },
    {
      id: "drift_evt_03",
      timestamp: Date.now() - 1000 * 60 * 1,
      stepId: "step_email_input",
      stepName: "Email Address Input Field",
      actionType: "type_text",
      originalPosition: { x: 955, y: 382 },
      correctedPosition: { x: 960, y: 380 },
      offsetX: 5,
      offsetY: -2,
      euclideanDriftPx: 5.4,
      driftThresholdPx: 8,
      recalibrationStatus: "recalibrated",
      triggerSource: "auto_reposition_agent",
      confidenceScore: 0.978,
      details: "Bounding box centroid locked with Euclidean drift within safe tolerance.",
    },
  ]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/pyautogui/drift-events");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      }
    } catch (err) {
      console.error("Failed to fetch drift correction events:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 6000);
    return () => clearInterval(interval);
  }, []);

  const filteredEvents = events.filter((evt) => {
    const matchesStatus = filterStatus === "all" || evt.recalibrationStatus === filterStatus;
    const matchesSearch =
      evt.stepName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.triggerSource.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div
      id="drift-correction-events-table-root"
      className={`rounded-2xl border border-slate-800 bg-[#0c1324] shadow-2xl overflow-hidden font-sans flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 bg-[#080d1a]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-400 shadow-sm">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Drift Correction Events & Auto-Repositioning Log
              </h3>
              <Badge className="bg-amber-950/80 text-amber-300 border-amber-700 text-[10px] font-mono py-0">
                {filteredEvents.length} RECORDED EVENTS
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Real-time audit log of automated Euclidean distance calculations, target offset shifts & coordinate adjustments
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchEvents}
            disabled={isLoading}
            className="h-7 px-2.5 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            {isLoading ? "Refreshing..." : "Refresh Events"}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-800/80 bg-[#090f1d] text-xs font-mono">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search step, trigger, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-slate-400 mr-1">Status:</span>
          {["all", "recalibrated", "aligned", "exceeded_threshold"].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2 py-0.5 rounded text-[11px] uppercase transition-all ${
                filterStatus === st
                  ? "bg-amber-600 text-white font-bold"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Events List / Table */}
      <div className="overflow-x-auto max-h-[380px] divide-y divide-slate-800/60">
        {filteredEvents.map((evt) => {
          const isRecalibrated = evt.recalibrationStatus === "recalibrated";
          const isAligned = evt.recalibrationStatus === "aligned";

          return (
            <div
              key={evt.id}
              className="p-3 hover:bg-slate-900/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={`mt-0.5 p-1 rounded-full shrink-0 ${
                    isRecalibrated
                      ? "bg-cyan-950 text-cyan-400 border border-cyan-800"
                      : isAligned
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : "bg-red-950 text-red-400 border border-red-800"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white tracking-wide">{evt.stepName}</span>
                    <Badge className="bg-slate-900 text-slate-300 border-slate-700 text-[10px] uppercase">
                      {evt.actionType}
                    </Badge>
                    <Badge
                      className={`text-[10px] uppercase ${
                        isRecalibrated
                          ? "bg-cyan-950 text-cyan-300 border-cyan-700"
                          : isAligned
                          ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                          : "bg-red-950 text-red-300 border-red-700"
                      }`}
                    >
                      {evt.recalibrationStatus.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-snug">{evt.details}</p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                    <span>
                      Trigger: <strong className="text-cyan-300">{evt.triggerSource}</strong>
                    </span>
                    <span>
                      Confidence:{" "}
                      <strong className="text-emerald-400">{(evt.confidenceScore * 100).toFixed(1)}%</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Offset Metrics & Coordinates Box */}
              <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-right space-y-0.5">
                  <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                    <span>Euclidean Drift:</span>
                    <span className="text-amber-400 font-bold">Δ {evt.euclideanDriftPx}px</span>
                    <span className="text-slate-600">/ limit {evt.driftThresholdPx}px</span>
                  </div>

                  <div className="text-[11px] flex items-center justify-end gap-1.5 text-slate-300">
                    <span className="text-slate-500">
                      ({evt.originalPosition.x}, {evt.originalPosition.y})
                    </span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span className="text-cyan-300 font-bold">
                      ({evt.correctedPosition.x}, {evt.correctedPosition.y})
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onApplyReposition?.(evt);
                    toast.success(`Coordinates applied for '${evt.stepName}'`, {
                      description: `Target updated to (${evt.correctedPosition.x}, ${evt.correctedPosition.y})`,
                    });
                  }}
                  className="h-8 px-2.5 text-xs font-mono bg-cyan-950/80 hover:bg-cyan-900 border-cyan-700 text-cyan-300"
                >
                  Apply
                </Button>
              </div>
            </div>
          );
        })}

        {filteredEvents.length === 0 && (
          <div className="p-8 text-center text-xs font-mono text-slate-500">
            No drift correction events match current filter.
          </div>
        )}
      </div>
    </div>
  );
};
