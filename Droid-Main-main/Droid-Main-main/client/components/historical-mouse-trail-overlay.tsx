import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  Minimize2,
  Maximize2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calculateEuclideanDistance } from "@/lib/screen-matching";

export interface MouseTrailPoint {
  x: number;
  y: number;
  timestamp: number;
  isClick?: boolean;
  pressure?: number;
  speedPxPerSec?: number;
}

export interface HistoricalSessionTrail {
  id: string;
  name: string;
  color: string;
  points: MouseTrailPoint[];
  recordedAt: number;
}

interface HistoricalMouseTrailOverlayProps {
  currentLiveTrail: MouseTrailPoint[];
  capturedSteps: Array<{ id: string; name: string; x: number; y: number; action?: string; stepNumber?: number }>;
  nativeWidth?: number;
  nativeHeight?: number;
  isRecording?: boolean;
  className?: string;
  onVerifyPath?: (accuracy: number) => void;
  onClose?: () => void;
}

export const HistoricalMouseTrailOverlay: React.FC<HistoricalMouseTrailOverlayProps> = ({
  currentLiveTrail,
  capturedSteps = [],
  nativeWidth = 1920,
  nativeHeight = 1080,
  isRecording = false,
  className = "",
  onVerifyPath,
  onClose,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(true);
  const [opacity, setOpacity] = useState<number>(0.75);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [showDeltas, setShowDeltas] = useState<boolean>(true);
  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [isReplayingHistorical, setIsReplayingHistorical] = useState<boolean>(false);
  const [replayCursor, setReplayCursor] = useState<{ x: number; y: number } | null>(null);

  // Preset historical sessions for multi-pass comparison
  const [historicalSessions, setHistoricalSessions] = useState<HistoricalSessionTrail[]>([
    {
      id: "session_pass_1",
      name: "Pass #1 (Calibration Baseline)",
      color: "#22d3ee", // Cyan
      recordedAt: Date.now() - 1000 * 60 * 5,
      points: [
        { x: 380, y: 120, timestamp: 100 },
        { x: 520, y: 135, timestamp: 250 },
        { x: 620, y: 140, timestamp: 400, isClick: true }, // search
        { x: 700, y: 220, timestamp: 650 },
        { x: 800, y: 310, timestamp: 900 },
        { x: 960, y: 380, timestamp: 1200, isClick: true }, // email input
        { x: 920, y: 440, timestamp: 1400 },
        { x: 885, y: 490, timestamp: 1650, isClick: true }, // checkbox
        { x: 920, y: 530, timestamp: 1850 },
        { x: 960, y: 560, timestamp: 2100, isClick: true }, // submit
      ],
    },
    {
      id: "session_pass_2",
      name: "Pass #2 (Drift Deviation)",
      color: "#f59e0b", // Amber
      recordedAt: Date.now() - 1000 * 60 * 2,
      points: [
        { x: 400, y: 125, timestamp: 120 },
        { x: 535, y: 142, timestamp: 280 },
        { x: 632, y: 144, timestamp: 430, isClick: true },
        { x: 715, y: 235, timestamp: 680 },
        { x: 820, y: 325, timestamp: 940 },
        { x: 974, y: 372, timestamp: 1240, isClick: true }, // +14px X, -8px Y drift
        { x: 935, y: 450, timestamp: 1450 },
        { x: 897, y: 496, timestamp: 1700, isClick: true }, // +12px X, +6px Y drift
        { x: 930, y: 540, timestamp: 1900 },
        { x: 962, y: 562, timestamp: 2150, isClick: true },
      ],
    },
  ]);

  // Compute Euclidean path alignment between current or historical trails vs. captured steps
  const activeTrailPoints =
    currentLiveTrail.length > 0
      ? currentLiveTrail
      : selectedSession === "all"
      ? historicalSessions.flatMap((s) => s.points)
      : historicalSessions.find((s) => s.id === selectedSession)?.points || [];

  const clickPoints = activeTrailPoints.filter((p) => p.isClick);

  // Compute nearest step for each physical clickpoint
  const alignmentMatches = clickPoints.map((click, idx) => {
    let nearestStep = capturedSteps[0] || null;
    let minDistance = Infinity;

    for (const step of capturedSteps) {
      const dist = calculateEuclideanDistance({ x: click.x, y: click.y }, { x: step.x, y: step.y });
      if (dist < minDistance) {
        minDistance = dist;
        nearestStep = step;
      }
    }

    return {
      clickIndex: idx + 1,
      clickPos: { x: click.x, y: click.y },
      nearestStep,
      euclideanDistancePx: minDistance === Infinity ? 0 : minDistance,
      status: minDistance <= 4 ? "green" : minDistance <= 14 ? "yellow" : "red",
    };
  });

  const avgDistance =
    alignmentMatches.length > 0
      ? Math.round((alignmentMatches.reduce((acc, m) => acc + m.euclideanDistancePx, 0) / alignmentMatches.length) * 10) / 10
      : 0;
  const pathAccuracy = Math.max(0, Math.round((100 - avgDistance * 1.5) * 10) / 10);

  useEffect(() => {
    onVerifyPath?.(pathAccuracy);
  }, [pathAccuracy, onVerifyPath]);

  // Handle replaying physical trail
  const handleReplayPhysicalTrail = async () => {
    if (activeTrailPoints.length < 2 || isReplayingHistorical) return;
    setIsReplayingHistorical(true);

    for (let i = 0; i < activeTrailPoints.length; i++) {
      const pt = activeTrailPoints[i];
      setReplayCursor({ x: pt.x, y: pt.y });
      await new Promise((r) => setTimeout(r, 60));
    }

    setIsReplayingHistorical(false);
    setReplayCursor(null);
  };

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-30 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      {/* SVG Canvas for Historical Paths & Connecting Deltas */}
      <svg className="w-full h-full absolute inset-0">
        <defs>
          <linearGradient id="cyan-trail" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="amber-trail" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* 1. Render Historical Sessions */}
        {historicalSessions.map((session, sIdx) => {
          if (selectedSession !== "all" && selectedSession !== session.id) return null;
          const pts = session.points;
          if (pts.length < 2) return null;

          return (
            <g key={session.id}>
              {/* Semi-transparent glow path */}
              <polyline
                points={pts
                  .map((p) => `${(p.x / nativeWidth) * 100}%,${(p.y / nativeHeight) * 100}%`)
                  .join(" ")}
                fill="none"
                stroke={session.color}
                strokeWidth="3.5"
                strokeDasharray="6 3"
                strokeOpacity="0.7"
                className="filter drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
              />

              {/* Waypoints & Click Contacts with Blinking Animation */}
              {pts.map((p, pIdx) => {
                const cx = `${(p.x / nativeWidth) * 100}%`;
                const cy = `${(p.y / nativeHeight) * 100}%`;
                if (p.isClick) {
                  return (
                    <g key={pIdx} className="click-blink-active">
                      {/* Blinking outer pulse ring */}
                      <circle cx={cx} cy={cy} r="18" fill="none" stroke={session.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
                      <circle cx={cx} cy={cy} r="12" fill={session.color} fillOpacity="0.25" stroke={session.color} strokeWidth="2" />
                      <circle cx={cx} cy={cy} r="6" fill="#ffffff" stroke={session.color} strokeWidth="2.5" />
                    </g>
                  );
                }
                return pIdx % 3 === 0 ? (
                  <circle key={pIdx} cx={cx} cy={cy} r="3" fill={session.color} fillOpacity="0.6" />
                ) : null;
              })}
            </g>
          );
        })}

        {/* 2. Render Live Current Mouse Trail (if active) */}
        {currentLiveTrail.length > 1 && (
          <g>
            <polyline
              points={currentLiveTrail
                .map((p) => `${(p.x / nativeWidth) * 100}%,${(p.y / nativeHeight) * 100}%`)
                .join(" ")}
              fill="none"
              stroke="#a855f7"
              strokeWidth="4"
              className="filter drop-shadow-[0_0_10px_rgba(168,85,247,0.9)]"
            />
            {currentLiveTrail.map((p, idx) =>
              p.isClick ? (
                <g key={idx} className="click-blink-active">
                  <circle
                    cx={`${(p.x / nativeWidth) * 100}%`}
                    cy={`${(p.y / nativeHeight) * 100}%`}
                    r="16"
                    fill="none"
                    stroke="#ec4899"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={`${(p.x / nativeWidth) * 100}%`}
                    cy={`${(p.y / nativeHeight) * 100}%`}
                    r="8"
                    fill="#ec4899"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                </g>
              ) : null
            )}
          </g>
        )}

        {/* 3. Euclidean Distance Vectors between Physical Trail Clickpoints and Captured Steps */}
        {showDeltas &&
          alignmentMatches.map((match, idx) => {
            if (!match.nearestStep) return null;
            const x1 = (match.clickPos.x / nativeWidth) * 100;
            const y1 = (match.clickPos.y / nativeHeight) * 100;
            const x2 = (match.nearestStep.x / nativeWidth) * 100;
            const y2 = (match.nearestStep.y / nativeHeight) * 100;

            const strokeColor =
              match.status === "green" ? "#34d399" : match.status === "yellow" ? "#fbbf24" : "#f87171";

            return (
              <g key={idx}>
                {/* Connecting Vector Line */}
                <line
                  x1={`${x1}%`}
                  y1={`${y1}%`}
                  x2={`${x2}%`}
                  y2={`${y2}%`}
                  stroke={strokeColor}
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
                {/* Target Step Ring */}
                <circle
                  cx={`${x2}%`}
                  cy={`${y2}%`}
                  r="5"
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                />
              </g>
            );
          })}
      </svg>

      {/* Replay Physical Cursor */}
      {replayCursor && (
        <div
          style={{
            left: `${(replayCursor.x / nativeWidth) * 100}%`,
            top: `${(replayCursor.y / nativeHeight) * 100}%`,
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 flex items-center gap-1.5"
        >
          <div className="w-5 h-5 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_12px_rgba(6,182,212,1)] animate-ping" />
          <span className="px-1.5 py-0.5 rounded bg-black/90 text-[9px] font-mono text-cyan-300 font-bold border border-cyan-800">
            Replay ({replayCursor.x}, {replayCursor.y})
          </span>
        </div>
      )}

      {/* Floating Trail HUD Badge & Interactive Controls - Positioned at top-14 right-4 to avoid blocking HUD canvas toolbar buttons */}
      {isMinimized ? (
        <div className="absolute top-14 right-4 pointer-events-auto bg-slate-950/95 border border-cyan-500/50 rounded-xl px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 font-mono text-xs z-40 animate-in fade-in">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-bold text-slate-200">Historical Trail</span>
          <Badge className="text-[9px] bg-cyan-950 text-cyan-300 border-cyan-700">
            {pathAccuracy}% MATCH
          </Badge>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Expand Historical Trail Controls"
          >
            <Maximize2 className="w-3 h-3 text-cyan-300" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Close Historical Trail Overlay"
            >
              <X className="w-3 h-3 text-rose-400" />
            </button>
          )}
        </div>
      ) : (
        <div className="absolute top-14 right-4 pointer-events-auto bg-slate-950/95 border border-cyan-500/40 rounded-xl p-2.5 shadow-2xl backdrop-blur-md flex flex-col gap-2 font-mono text-xs max-w-xs z-40 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
            <span className="font-bold text-slate-100 flex items-center gap-1.5 truncate">
              <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              Historical Trail Overlay
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <Badge
                className={`text-[9px] ${
                  avgDistance <= 4
                    ? "bg-emerald-600 text-white"
                    : avgDistance <= 14
                    ? "bg-amber-600 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {pathAccuracy}% (Δ {avgDistance}px)
              </Badge>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Minimize Trail HUD"
              >
                <Minimize2 className="w-3 h-3" />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-300 transition-colors"
                  title="Close Overlay"
                >
                  <X className="w-3 h-3 text-rose-400" />
                </button>
              )}
            </div>
          </div>

          {/* Multi-Session Selector */}
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-400">Pass:</span>
            {["all", "session_pass_1", "session_pass_2"].map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSession(s)}
                className={`px-1.5 py-0.5 rounded ${
                  selectedSession === s
                    ? "bg-cyan-600 text-white font-bold"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                }`}
              >
                {s === "all" ? "All Merged" : s === "session_pass_1" ? "Pass #1" : "Pass #2"}
              </button>
            ))}
          </div>

          {/* Controls: Opacity & Vectors */}
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
            <div className="flex items-center gap-1">
              <Sliders className="w-3 h-3 text-slate-400" />
              <span>Opacity:</span>
              {[0.4, 0.75, 1.0].map((op) => (
                <button
                  key={op}
                  onClick={() => setOpacity(op)}
                  className={`px-1 py-0.5 rounded ${
                    opacity === op ? "bg-slate-700 text-cyan-300 font-bold" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {Math.round(op * 100)}%
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowDeltas(!showDeltas)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                showDeltas ? "bg-purple-900/80 text-purple-200 border border-purple-500" : "bg-slate-800 text-slate-400"
              }`}
            >
              Deltas: {showDeltas ? "ON" : "OFF"}
            </button>
          </div>

          {/* Action Button: Replay Physical Trail */}
          <Button
            size="sm"
            onClick={handleReplayPhysicalTrail}
            disabled={isReplayingHistorical}
            className="h-7 text-[11px] font-mono bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white gap-1 w-full"
          >
            <Play className="w-3 h-3 text-cyan-200" />
            {isReplayingHistorical ? "Replaying Physical Path..." : "Replay Physical Trail"}
          </Button>
        </div>
      )}
    </div>
  );
};
