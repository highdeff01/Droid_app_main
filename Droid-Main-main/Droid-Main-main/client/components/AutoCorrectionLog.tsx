import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  Search,
  Crosshair,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Filter,
  Trash2,
  Download,
  Copy,
  Check,
  Target,
  Maximize2,
  Minimize2,
  RefreshCw,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  Activity,
  Compass,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart,
  ShieldCheck,
  Cpu,
  AlertOctagon,
  Clock,
  HelpCircle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  Cell,
} from "recharts";

export interface AutoCorrectionEntry {
  id: string;
  timestamp: number;
  stepIndex: number;
  stepName: string;
  originalCoords: { x: number; y: number };
  recalibratedCoords: { x: number; y: number };
  driftDistancePx: number; // Euclidean distance sqrt(dx^2 + dy^2)
  driftDelta: { dx: number; dy: number };
  recoveryBranch:
    | "visual_template_offset"
    | "ocr_landmark_anchor"
    | "ad_modal_bypass"
    | "cubic_bezier_morph"
    | "dwell_stability_settle"
    | "proximity_cluster_search";
  confidenceScore: number; // 0.0 - 1.0 (e.g. 0.98)
  targetElement?: string;
  frameScreenshotUrl?: string;
  diffScore?: number; // e.g. 0.98
  reasoning: string;
  status: "recovered" | "auto_recalibrated" | "branch_rerouted" | "fallback_applied";
}

// Built-in realistic historical drift & recovery log events
export const DEFAULT_DRIFT_LOGS: AutoCorrectionEntry[] = [
  {
    id: "drift-evt-101",
    timestamp: Date.now() - 1000 * 60 * 18,
    stepIndex: 3,
    stepName: "Click 'Quarterly_Report.docx' Row Item",
    originalCoords: { x: 380, y: 260 },
    recalibratedCoords: { x: 396, y: 274 },
    driftDistancePx: 21.3,
    driftDelta: { dx: 16, dy: 14 },
    recoveryBranch: "ocr_landmark_anchor",
    confidenceScore: 0.98,
    targetElement: "Quarterly_Report.docx Row Item",
    diffScore: 0.97,
    reasoning:
      "UI table row shifted downwards by +14px due to dynamic notification banner injection. AI OCR landmark engine identified text bounding box and snapped click target to updated center anchor.",
    status: "auto_recalibrated",
  },
  {
    id: "drift-evt-102",
    timestamp: Date.now() - 1000 * 60 * 14,
    stepIndex: 5,
    stepName: "Drop into Financials Folder Droptarget",
    originalCoords: { x: 580, y: 320 },
    recalibratedCoords: { x: 572, y: 322 },
    driftDistancePx: 8.2,
    driftDelta: { dx: -8, dy: 2 },
    recoveryBranch: "visual_template_offset",
    confidenceScore: 0.96,
    targetElement: "Folder Droptarget",
    diffScore: 0.99,
    reasoning:
      "Sub-pixel layout reflow caused horizontal drag landing target to skew -8px. Vector compensation offset applied dynamically before mouse release event.",
    status: "recovered",
  },
  {
    id: "drift-evt-103",
    timestamp: Date.now() - 1000 * 60 * 9,
    stepIndex: 8,
    stepName: "Trigger Modal Share Action Button",
    originalCoords: { x: 920, y: 120 },
    recalibratedCoords: { x: 938, y: 135 },
    driftDistancePx: 23.4,
    driftDelta: { dx: 18, dy: 15 },
    recoveryBranch: "ad_modal_bypass",
    confidenceScore: 0.94,
    targetElement: "Share Button in Dynamic Header",
    diffScore: 0.95,
    reasoning:
      "Intervening modal overlay expanded header menu rightwards by 18px. AI logic branched to dismiss overlay prompt and recalibrated cursor path along smoothed cubic bezier trajectory.",
    status: "branch_rerouted",
  },
  {
    id: "drift-evt-104",
    timestamp: Date.now() - 1000 * 60 * 4,
    stepIndex: 3,
    stepName: "Click 'Quarterly_Report.docx' Row Item",
    originalCoords: { x: 380, y: 260 },
    recalibratedCoords: { x: 394, y: 272 },
    driftDistancePx: 18.4,
    driftDelta: { dx: 14, dy: 12 },
    recoveryBranch: "ocr_landmark_anchor",
    confidenceScore: 0.97,
    targetElement: "Quarterly_Report.docx Row Item",
    diffScore: 0.96,
    reasoning:
      "Secondary run verified consistent 18px vertical drift on row item. Flagged as high-volatility dynamic container.",
    status: "auto_recalibrated",
  },
  {
    id: "drift-evt-105",
    timestamp: Date.now() - 1000 * 60 * 1,
    stepIndex: 2,
    stepName: "Filter by Date Dropdown",
    originalCoords: { x: 210, y: 180 },
    recalibratedCoords: { x: 214, y: 182 },
    driftDistancePx: 4.5,
    driftDelta: { dx: 4, dy: 2 },
    recoveryBranch: "dwell_stability_settle",
    confidenceScore: 0.99,
    targetElement: "Date Range Filter Pill",
    diffScore: 0.99,
    reasoning:
      "Minor font rasterization difference. 4.5px offset absorbed within standard button padding boundary.",
    status: "recovered",
  },
];

export interface AutoCorrectionLogProps {
  logs: AutoCorrectionEntry[];
  onClearLogs?: () => void;
  isOpen: boolean;
  onClose: () => void;
  onFocusCoordinates?: (x: number, y: number, label: string) => void;
  onTriggerTestDriftEvent?: () => void;
}

export const AutoCorrectionLog: React.FC<AutoCorrectionLogProps> = ({
  logs,
  onClearLogs,
  isOpen,
  onClose,
  onFocusCoordinates,
  onTriggerTestDriftEvent,
}) => {
  const [activeTab, setActiveTab] = useState<"predictive_analysis" | "ledger" | "diagnostics">("predictive_analysis");
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(
    logs.length > 0 ? logs[0].id : null
  );

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        !searchQuery ||
        log.stepName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.targetElement && log.targetElement.toLowerCase().includes(searchQuery.toLowerCase())) ||
        log.reasoning.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.recoveryBranch.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesBranch = branchFilter === "all" || log.recoveryBranch === branchFilter;
      return matchesSearch && matchesBranch;
    });
  }, [logs, searchQuery, branchFilter]);

  const selectedLog = useMemo(() => {
    return logs.find((l) => l.id === selectedLogId) || (logs.length > 0 ? logs[0] : null);
  }, [logs, selectedLogId]);

  // Aggregate Metrics for Overview
  const stats = useMemo(() => {
    if (logs.length === 0) {
      return {
        total: 0,
        avgDrift: 0,
        maxDrift: 0,
        avgConfidence: 100,
        autoRecalibratedCount: 0,
        unstableElementsCount: 0,
      };
    }
    const totalDrift = logs.reduce((acc, l) => acc + l.driftDistancePx, 0);
    const max = Math.max(...logs.map((l) => l.driftDistancePx));
    const avgConf = logs.reduce((acc, l) => acc + l.confidenceScore, 0) / logs.length;
    const autoRecal = logs.filter((l) => l.status === "auto_recalibrated" || l.status === "branch_rerouted").length;

    // Unique elements with drift > 15px
    const highDriftElems = new Set(logs.filter((l) => l.driftDistancePx >= 15).map((l) => l.targetElement || `Step ${l.stepIndex}`));

    return {
      total: logs.length,
      avgDrift: parseFloat((totalDrift / logs.length).toFixed(1)),
      maxDrift: parseFloat(max.toFixed(1)),
      avgConfidence: Math.round(avgConf * 100),
      autoRecalibratedCount: autoRecal,
      unstableElementsCount: highDriftElems.size,
    };
  }, [logs]);

  // Predictive Drift Analysis Aggregation by Step
  const stepDriftTrendData = useMemo(() => {
    const stepMap = new Map<
      number,
      {
        stepIndex: number;
        stepLabel: string;
        occurrences: number;
        totalDrift: number;
        maxDrift: number;
        targetElement: string;
        reasons: string[];
      }
    >();

    logs.forEach((log) => {
      const sIdx = log.stepIndex;
      const current = stepMap.get(sIdx) || {
        stepIndex: sIdx,
        stepLabel: `Step #${sIdx}`,
        occurrences: 0,
        totalDrift: 0,
        maxDrift: 0,
        targetElement: log.targetElement || `Target @ (${log.originalCoords.x}, ${log.originalCoords.y})`,
        reasons: [],
      };

      current.occurrences += 1;
      current.totalDrift += log.driftDistancePx;
      current.maxDrift = Math.max(current.maxDrift, log.driftDistancePx);
      if (log.targetElement) current.targetElement = log.targetElement;
      if (!current.reasons.includes(log.recoveryBranch)) {
        current.reasons.push(log.recoveryBranch);
      }

      stepMap.set(sIdx, current);
    });

    // Generate chart series covering steps 1 to max step index
    const sorted = Array.from(stepMap.values()).sort((a, b) => a.stepIndex - b.stepIndex);

    return sorted.map((item) => {
      const avgD = parseFloat((item.totalDrift / item.occurrences).toFixed(1));
      // Predictive instability probability based on occurrence count and average drift
      const driftProbability = Math.min(100, Math.round((item.occurrences / Math.max(1, logs.length)) * 140 + avgD * 1.5));
      const instabilityRating =
        avgD >= 18 ? "High Risk" : avgD >= 10 ? "Moderate" : "Low Risk";

      return {
        stepLabel: item.stepLabel,
        stepIndex: item.stepIndex,
        driftCount: item.occurrences,
        avgDriftPx: avgD,
        maxDriftPx: item.maxDrift,
        driftProbability,
        targetElement: item.targetElement,
        instabilityRating,
        primaryBranch: item.reasons.join(", "),
      };
    });
  }, [logs]);

  // Unstable UI Elements Rank List
  const unstableElementsRanking = useMemo(() => {
    const elemMap = new Map<
      string,
      {
        name: string;
        stepIndex: number;
        driftCount: number;
        avgDrift: number;
        maxDrift: number;
        lastReason: string;
        recommendedMitigation: string;
        riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "STABLE";
      }
    >();

    logs.forEach((log) => {
      const key = log.targetElement || `Action #${log.stepIndex}`;
      const existing = elemMap.get(key) || {
        name: key,
        stepIndex: log.stepIndex,
        driftCount: 0,
        avgDrift: 0,
        maxDrift: 0,
        lastReason: log.reasoning,
        recommendedMitigation: "",
        riskLevel: "MEDIUM" as const,
      };

      existing.driftCount += 1;
      existing.avgDrift += log.driftDistancePx;
      existing.maxDrift = Math.max(existing.maxDrift, log.driftDistancePx);
      existing.lastReason = log.reasoning;
      elemMap.set(key, existing);
    });

    return Array.from(elemMap.values())
      .map((item) => {
        const avg = parseFloat((item.avgDrift / item.driftCount).toFixed(1));
        let riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "STABLE" = "STABLE";
        let mitigation = "Standard template match is sufficient.";

        if (avg >= 20 || item.driftCount >= 3) {
          riskLevel = "CRITICAL";
          mitigation = "Anchor target with OCR Text Landmark & insert 200ms DOM-settle debounce delay.";
        } else if (avg >= 12 || item.driftCount >= 2) {
          riskLevel = "HIGH";
          mitigation = "Lock target relative to parent container viewport bounding box.";
        } else if (avg >= 6) {
          riskLevel = "MEDIUM";
          mitigation = "Apply sub-pixel cubic bezier spline auto-morph on cursor entry.";
        }

        return {
          ...item,
          avgDrift: avg,
          riskLevel,
          recommendedMitigation: mitigation,
        };
      })
      .sort((a, b) => b.avgDrift * b.driftCount - a.avgDrift * a.driftCount);
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-2xl font-mono text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-slate-100">
                  AUTO-CORRECTION & PREDICTIVE DRIFT ANALYZER
                </h3>
                <Badge
                  variant="outline"
                  className="bg-amber-950/80 border-amber-500/40 text-amber-300 text-xs px-2 py-0.5"
                >
                  {stats.total} DRIFT EVENTS
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time trend analysis of inter-frame shifts, predictive instability modeling, and AI recovery branch telemetry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onTriggerTestDriftEvent && (
              <Button
                size="sm"
                onClick={onTriggerTestDriftEvent}
                className="h-8 text-xs font-mono bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold gap-1.5 shadow-md"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                Simulate Drift Event
              </Button>
            )}

            {onClearLogs && (
              <Button
                size="sm"
                variant="outline"
                onClick={onClearLogs}
                className="h-8 text-xs font-mono bg-slate-900 border-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-800 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Logs
              </Button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation & Search Bar */}
        <div className="px-6 py-2.5 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("predictive_analysis")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                activeTab === "predictive_analysis"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              PREDICTIVE DRIFT ANALYSIS & TRENDS
            </button>

            <button
              onClick={() => setActiveTab("ledger")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                activeTab === "ledger"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              CORRECTION LEDGER ({filteredLogs.length})
            </button>

            <button
              onClick={() => setActiveTab("diagnostics")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                activeTab === "diagnostics"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              AI RECOVERY BRANCH DIAGNOSTICS
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search step, target, branch..."
                className="h-8 pl-8 text-xs font-mono bg-slate-950 border-slate-800 placeholder:text-slate-600 focus:border-amber-500 w-60"
              />
            </div>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Recovery Branches</option>
              <option value="ocr_landmark_anchor">OCR Landmark Anchor</option>
              <option value="visual_template_offset">Visual Template Offset</option>
              <option value="ad_modal_bypass">Ad/Modal Bypass</option>
              <option value="cubic_bezier_morph">Cubic Bezier Morph</option>
              <option value="dwell_stability_settle">Dwell Settle</option>
            </select>
          </div>
        </div>

        {/* Metric Overview Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-900/20 border-b border-slate-800/60 shrink-0">
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono block">DRIFT OCCURRENCES</span>
            <span className="text-base font-bold font-mono text-amber-300">{stats.total} logged</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono block">AVERAGE SHIFT DISTANCE</span>
            <span className="text-base font-bold font-mono text-cyan-300">{stats.avgDrift} px</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono block">PEAK INTER-FRAME DRIFT</span>
            <span className="text-base font-bold font-mono text-red-400">{stats.maxDrift} px</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono block">AI RECOVERY CONFIDENCE</span>
            <span className="text-base font-bold font-mono text-emerald-400">{stats.avgConfidence}% Avg</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono block">UNSTABLE UI ELEMENTS</span>
            <span className="text-base font-bold font-mono text-amber-400">
              {stats.unstableElementsCount} high-risk
            </span>
          </div>
        </div>

        {/* Tab 0: PREDICTIVE DRIFT ANALYSIS & TREND GRAPHS */}
        {activeTab === "predictive_analysis" && (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Trend Chart: Step Index vs Drift Frequency & Pixel Displacement */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold font-mono text-amber-400 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      PREDICTIVE DRIFT FREQUENCY & INSTABILITY TREND GRAPH
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Identifies step-by-step drift occurrence rates and average pixel deviations across repeated workflow iterations.
                    </p>
                  </div>
                  <Badge className="bg-slate-950 border-slate-800 text-slate-300 text-[10px]">
                    Step Drift Spectrum
                  </Badge>
                </div>

                {/* Recharts Bar/Line Chart */}
                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stepDriftTrendData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="stepLabel" stroke="#64748b" fontSize={11} />
                      <YAxis yAxisId="left" stroke="#f59e0b" fontSize={11} label={{ value: "Shift (px)", angle: -90, position: "insideLeft", fill: "#f59e0b" }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={11} label={{ value: "Frequency Count", angle: 90, position: "insideRight", fill: "#38bdf8" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#090d16",
                          borderColor: "#334155",
                          borderRadius: "8px",
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                      <Bar yAxisId="left" dataKey="avgDriftPx" name="Avg Drift (px)" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                        {stepDriftTrendData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.avgDriftPx >= 18 ? "#ef4444" : entry.avgDriftPx >= 10 ? "#f59e0b" : "#3b82f6"}
                          />
                        ))}
                      </Bar>
                      <Bar yAxisId="right" dataKey="driftCount" name="Drift Events" fill="#38bdf8" radius={[4, 4, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                      Critical Volatility (&gt;18px)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Moderate Drift (10–18px)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                      Minor Tolerance (&lt;10px)
                    </span>
                  </div>
                  <span className="text-slate-500">Auto-Recalibration Active</span>
                </div>
              </div>

              {/* Unstable UI Elements Ranking & AI Stabilization Recommendations */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold font-mono text-amber-400 flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-amber-400" />
                      UNSTABLE UI ELEMENTS IDENTIFICATION & AI MITIGATION MATRIX
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Elements exhibiting high displacement variance due to responsive reflow, async rendering, or modal pop-ins.
                    </p>
                  </div>
                  <Badge className="bg-red-950/80 border border-red-500/40 text-red-300 text-[10px]">
                    Root Cause Triage
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  {unstableElementsRanking.map((elem, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-slate-700"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-100 font-mono">
                            {elem.name}
                          </span>
                          <Badge
                            className={`text-[10px] font-mono px-1.5 py-0 ${
                              elem.riskLevel === "CRITICAL"
                                ? "bg-red-950 text-red-300 border-red-600/50"
                                : elem.riskLevel === "HIGH"
                                ? "bg-amber-950 text-amber-300 border-amber-600/50"
                                : "bg-blue-950 text-blue-300 border-blue-600/50"
                            }`}
                          >
                            {elem.riskLevel} VOLATILITY
                          </Badge>
                          <span className="text-[11px] text-slate-500">
                            Step #{elem.stepIndex} • {elem.driftCount} historical events
                          </span>
                        </div>

                        <p className="text-xs text-slate-400">
                          <strong className="text-amber-300/90 font-mono">AI Recommended Mitigation:</strong>{" "}
                          {elem.recommendedMitigation}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">AVG DISPLACEMENT</span>
                          <span className="text-sm font-bold text-amber-400 font-mono">
                            Δ{elem.avgDrift} px (Max {elem.maxDrift}px)
                          </span>
                        </div>

                        {onFocusCoordinates && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onFocusCoordinates(elem.stepIndex * 120 + 200, 250, elem.name)}
                            className="h-8 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5"
                          >
                            <Target className="w-3.5 h-3.5 text-amber-400" />
                            Highlight
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        {/* Tab 1: Detailed Correction Ledger */}
        {activeTab === "ledger" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Event List */}
            <div className="w-96 border-r border-slate-800/80 bg-slate-900/30 flex flex-col shrink-0">
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {filteredLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No drift correction events match the filter.
                    </div>
                  ) : (
                    filteredLogs.map((log) => {
                      const isSelected = log.id === selectedLogId;
                      return (
                        <div
                          key={log.id}
                          onClick={() => setSelectedLogId(log.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer font-mono ${
                            isSelected
                              ? "bg-amber-950/40 border-amber-500/60 shadow-md"
                              : "bg-slate-900/40 border-slate-800/60 hover:bg-slate-900/80 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-1 py-0.5 rounded">
                                  Step #{log.stepIndex}
                                </span>
                                <h4
                                  className={`text-xs font-bold truncate ${
                                    isSelected ? "text-amber-200" : "text-slate-200"
                                  }`}
                                >
                                  {log.stepName}
                                </h4>
                              </div>

                              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                                <span>
                                  Drift: <strong className="text-red-400">Δ{log.driftDistancePx}px</strong>
                                </span>
                                <Badge className="bg-slate-950 text-slate-300 text-[9px] px-1.5 py-0 border-slate-800">
                                  {log.recoveryBranch.replace(/_/g, " ")}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right Column: Selected Log Diagnostic Inspector */}
            <div className="flex-1 flex flex-col bg-slate-950 p-6 overflow-y-auto">
              {selectedLog ? (
                <div className="max-w-3xl space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-100 font-mono">
                          {selectedLog.stepName} (Step #{selectedLog.stepIndex})
                        </h4>
                        <Badge className="bg-emerald-950 border-emerald-600/40 text-emerald-300 text-xs font-mono">
                          {Math.round(selectedLog.confidenceScore * 100)}% Confidence
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        Event Timestamp: {new Date(selectedLog.timestamp).toLocaleTimeString()} • Target: {selectedLog.targetElement}
                      </p>
                    </div>

                    {onFocusCoordinates && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onFocusCoordinates(
                            selectedLog.recalibratedCoords.x,
                            selectedLog.recalibratedCoords.y,
                            `Step ${selectedLog.stepIndex}: Recalibrated`
                          )
                        }
                        className="h-8 text-xs font-mono bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold gap-1.5"
                      >
                        <Target className="w-3.5 h-3.5" />
                        Focus Recalibrated Spot
                      </Button>
                    )}
                  </div>

                  {/* Coordinate Comparison Cards */}
                  <div className="grid grid-cols-3 gap-3 font-mono">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">ORIGINAL SAVED COORDS</span>
                      <span className="text-sm font-bold text-slate-200 mt-1 block">
                        ({selectedLog.originalCoords.x}, {selectedLog.originalCoords.y})
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40">
                      <span className="text-[10px] text-amber-400/80 block">RECALIBRATED COORDS</span>
                      <span className="text-sm font-bold text-amber-300 mt-1 block">
                        ({selectedLog.recalibratedCoords.x}, {selectedLog.recalibratedCoords.y})
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40">
                      <span className="text-[10px] text-red-400/80 block">INTER-FRAME DRIFT DELTA</span>
                      <span className="text-sm font-bold text-red-300 mt-1 block">
                        ΔX: {selectedLog.driftDelta.dx > 0 ? `+${selectedLog.driftDelta.dx}` : selectedLog.driftDelta.dx}px, ΔY: {selectedLog.driftDelta.dy > 0 ? `+${selectedLog.driftDelta.dy}` : selectedLog.driftDelta.dy}px (Total: {selectedLog.driftDistancePx}px)
                      </span>
                    </div>
                  </div>

                  {/* AI Diagnostic Reasoning */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      AI RECOVERY BRANCH & DIAGNOSTIC REASONING
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                      {selectedLog.reasoning}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 font-mono text-sm flex items-center justify-center h-full">
                  Select an entry from the ledger to inspect drift coordinates and AI recovery telemetry.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: AI Recovery Diagnostics */}
        {activeTab === "diagnostics" && (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4 font-mono">
                <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  AI RECOVERY LOGIC BRANCH ROUTING ENGINE
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-950 text-amber-300 border-amber-600/40">
                        OCR LANDMARK ANCHOR
                      </Badge>
                      <span className="text-xs text-slate-400">Drift &gt; 15px</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Used when structural DOM shifts occur. Recognizes bounding text boxes and recalculates button center coordinates regardless of row translation.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-cyan-950 text-cyan-300 border-cyan-600/40">
                        VISUAL TEMPLATE OFFSET
                      </Badge>
                      <span className="text-xs text-slate-400">Drift 5-15px</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Performs normalized cross-correlation 2D convolution against captured frame templates to detect sub-pixel coordinate skew.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-950 text-purple-300 border-purple-600/40">
                        CUBIC BEZIER SPLINE MORPH
                      </Badge>
                      <span className="text-xs text-slate-400">Continuous Paths</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Dynamically bends the approach curvature using physics velocity constraints, preventing abrupt snapping and maintaining natural cursor motion.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-600/40">
                        DWELL STABILITY SETTLE
                      </Badge>
                      <span className="text-xs text-slate-400">Drift &lt; 5px</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Absorbs minor font anti-aliasing or rendering noise within standard target click boundary without triggering full recalculation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
