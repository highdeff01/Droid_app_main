import React, { useState } from "react";
import {
  Flame,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Eye,
  EyeOff,
  Sparkles,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { DriftHeatmapPoint } from "@/lib/drift-calibration";

interface DriftHeatmapOverlayProps {
  driftPoints: DriftHeatmapPoint[];
  thresholdPx: number;
  opacity?: number;
  showDetails?: boolean;
  onSelectSelector?: (point: DriftHeatmapPoint) => void;
  onTriggerCalibration?: () => void;
  nativeWidth?: number;
  nativeHeight?: number;
}

export const DriftHeatmapOverlay: React.FC<DriftHeatmapOverlayProps> = ({
  driftPoints,
  thresholdPx,
  opacity = 0.85,
  showDetails = true,
  onSelectSelector,
  onTriggerCalibration,
  nativeWidth = 1920,
  nativeHeight = 1080,
}) => {
  const [selectedPoint, setSelectedPoint] = useState<DriftHeatmapPoint | null>(
    null
  );
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);

  const problematicPoints = driftPoints.filter((p) => p.isProblematic);
  const moderatePoints = driftPoints.filter(
    (p) => !p.isProblematic && p.status === "moderate"
  );
  const stablePoints = driftPoints.filter((p) => p.status === "stable");

  return (
    <div
      className="absolute inset-0 pointer-events-none z-35 overflow-hidden transition-opacity duration-300"
      style={{ opacity }}
    >
      {/* SVG Radial Heat Halos & Gradient Field */}
      <svg
        className="w-full h-full absolute inset-0"
        viewBox={`0 0 ${nativeWidth} ${nativeHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Radial Gradient for Critical Problematic Drift */}
          <radialGradient
            id="grad-drift-critical"
            cx="50%"
            cy="50%"
            r="50%"
            fx="50%"
            fy="50%"
          >
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#dc2626" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#b91c1c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0" />
          </radialGradient>

          {/* Radial Gradient for Moderate Drift Warning */}
          <radialGradient
            id="grad-drift-moderate"
            cx="50%"
            cy="50%"
            r="50%"
            fx="50%"
            fy="50%"
          >
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.75" />
            <stop offset="45%" stopColor="#d97706" stopOpacity="0.4" />
            <stop offset="80%" stopColor="#b45309" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#78350f" stopOpacity="0" />
          </radialGradient>

          {/* Radial Gradient for Stable Aligned Selectors */}
          <radialGradient
            id="grad-drift-stable"
            cx="50%"
            cy="50%"
            r="50%"
            fx="50%"
            fy="50%"
          >
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#059669" stopOpacity="0.3" />
            <stop offset="85%" stopColor="#047857" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#064e3b" stopOpacity="0" />
          </radialGradient>

          {/* Filter for Heatmap Glow */}
          <filter id="heat-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Render Heat Clusters */}
        {driftPoints.map((point) => {
          const radiusScale =
            point.status === "critical"
              ? Math.max(50, point.driftPx * 4)
              : point.status === "moderate"
              ? Math.max(36, point.driftPx * 3.5)
              : 28;

          const gradId =
            point.status === "critical"
              ? "url(#grad-drift-critical)"
              : point.status === "moderate"
              ? "url(#grad-drift-moderate)"
              : "url(#grad-drift-stable)";

          return (
            <g key={point.id} className="transition-all duration-300">
              {/* Outer soft heat halo */}
              <circle
                cx={point.x}
                cy={point.y}
                r={radiusScale * 1.6}
                fill={gradId}
                filter="url(#heat-glow)"
              />

              {/* Core heat disk */}
              <circle
                cx={point.x}
                cy={point.y}
                r={radiusScale}
                fill={gradId}
              />

              {/* Problematic Selector Pulsing Ring */}
              {point.isProblematic && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radiusScale * 0.9}
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="2.5"
                  strokeDasharray="4 3"
                  className="animate-spin origin-center"
                  style={{ transformOrigin: `${point.x}px ${point.y}px` }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Interactive Problematic Automation Selector Markers (Pointer-events auto) */}
      <div className="absolute inset-0 pointer-events-none">
        {driftPoints.map((point) => {
          const leftPercent = (point.x / nativeWidth) * 100;
          const topPercent = (point.y / nativeHeight) * 100;

          const isCritical = point.status === "critical";
          const isModerate = point.status === "moderate";

          return (
            <div
              key={`marker_${point.id}`}
              style={{
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto group z-40"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPoint(point);
                onSelectSelector?.(point);
              }}
            >
              {/* Pin indicator */}
              <div
                className={`relative flex items-center justify-center cursor-pointer transition-transform hover:scale-125 ${
                  isCritical
                    ? "text-red-400"
                    : isModerate
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {isCritical ? (
                  <div className="relative">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600/90 text-white font-mono text-[11px] font-bold shadow-[0_0_15px_rgba(239,68,68,0.9)] border-2 border-red-300">
                      !
                    </span>
                    <span className="absolute -inset-1 rounded-full border-2 border-red-400 animate-ping opacity-75" />
                  </div>
                ) : isModerate ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600/90 text-white text-[9px] font-bold shadow-[0_0_10px_rgba(245,158,11,0.8)] border border-amber-300">
                    ▲
                  </div>
                ) : (
                  <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500/80 text-white text-[8px] shadow-[0_0_8px_rgba(16,185,129,0.7)] border border-emerald-300">
                    ✓
                  </div>
                )}

                {/* Floating Selector Tooltip */}
                <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 hidden group-hover:flex flex-col items-center pointer-events-none z-50 min-w-[210px]">
                  <div className="rounded-lg bg-slate-950/95 border border-slate-700 p-2.5 shadow-2xl backdrop-blur-md text-left font-mono text-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 mb-1.5">
                      <span
                        className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                          isCritical
                            ? "bg-red-950 text-red-300 border border-red-800"
                            : isModerate
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        }`}
                      >
                        {isCritical
                          ? "CRITICAL DRIFT"
                          : isModerate
                          ? "MODERATE DRIFT"
                          : "ALIGNED"}
                      </span>
                      <span className="text-[11px] font-bold text-slate-200">
                        Δ {point.driftPx}px
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-cyan-300 truncate max-w-[200px]">
                      {point.selectorName}
                    </p>
                    <div className="mt-1 text-[10px] text-slate-400 space-y-0.5">
                      <div>
                        Coords: ({Math.round(point.x)}, {Math.round(point.y)})
                      </div>
                      <div>
                        Threshold: {thresholdPx}px (
                        {point.driftPx > thresholdPx
                          ? `Exceeded by +${(
                              point.driftPx - thresholdPx
                            ).toFixed(1)}px`
                          : "Within limit"}
                        )
                      </div>
                      <div>Occurrences: {point.frequency}x</div>
                    </div>
                    {isCritical && (
                      <div className="mt-2 pt-1 border-t border-red-900/60 text-[10px] text-red-300 font-sans">
                        ⚠️ High-risk automation selector. Click to inspect in
                        Workflow Debugger.
                      </div>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 -mt-1" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Drift Heatmap HUD Legend & Controller */}
      {showDetails && (
        <div className="absolute top-3 right-3 pointer-events-auto z-40">
          <div className="rounded-xl border border-red-500/40 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-md text-xs font-mono text-slate-200 max-w-xs transition-all">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-400 fill-red-400 animate-pulse" />
                <span className="font-bold text-slate-100">
                  DRIFT HEATMAP OVERLAY
                </span>
              </div>
              <button
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="text-slate-400 hover:text-slate-200 p-0.5"
                title="Toggle heatmap legend"
              >
                {isLegendExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {isLegendExpanded && (
              <div className="mt-2.5 space-y-2">
                {/* Problematic Selectors Warning Count */}
                <div
                  className={`p-2 rounded-lg border text-[11px] ${
                    problematicPoints.length > 0
                      ? "bg-red-950/60 border-red-500/50 text-red-200"
                      : "bg-emerald-950/50 border-emerald-500/40 text-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>
                      {problematicPoints.length > 0
                        ? `⚠️ ${problematicPoints.length} Problematic Selector(s)`
                        : "✓ All Selectors Stabilized"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Limit: {thresholdPx}px
                    </span>
                  </div>
                  {problematicPoints.length > 0 && (
                    <p className="mt-1 text-[10px] text-red-300 font-sans leading-tight">
                      Screen areas color-coded red experience UI element
                      pixel-drift beyond acceptable tolerances.
                    </p>
                  )}
                </div>

                {/* Color Legend Gradient Bar */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>Stable (≤{Math.round(thresholdPx / 2)}px)</span>
                    <span>Warning</span>
                    <span className="text-red-400 font-bold">
                      Critical (&gt;{thresholdPx}px)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 shadow-inner" />
                </div>

                {/* Quick Auto-Calibration trigger */}
                {onTriggerCalibration && problematicPoints.length > 0 && (
                  <button
                    onClick={onTriggerCalibration}
                    className="w-full mt-1.5 py-1.5 px-2.5 rounded-lg font-bold text-[11px] bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                    Auto-Calibrate {problematicPoints.length} Drifting Selectors
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
