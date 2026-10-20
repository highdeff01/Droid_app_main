import React, { useState } from "react";
import { Badge } from "./ui/badge";
import { MousePointer2, Crosshair, Sparkles, Zap, KeyRound, Type } from "lucide-react";

export interface ReplayOverlayStep {
  id: string;
  stepNumber: number;
  name?: string;
  action?: string;
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  text?: string;
  keyPayload?: string;
  status?: "pending" | "executing" | "completed" | "failed" | "skipped";
}

interface ReplayOverlayLayerProps {
  steps: ReplayOverlayStep[];
  activeStepIndex?: number | null;
  nativeWidth?: number;
  nativeHeight?: number;
  isVisible: boolean;
  onStepClick?: (step: ReplayOverlayStep, index: number) => void;
}

export const ReplayOverlayLayer: React.FC<ReplayOverlayLayerProps> = ({
  steps,
  activeStepIndex = null,
  nativeWidth = 1920,
  nativeHeight = 1080,
  isVisible,
  onStepClick,
}) => {
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);

  if (!isVisible || steps.length === 0) return null;

  const validSteps = steps.filter((s) => typeof s.x === "number" && typeof s.y === "number");

  return (
    <div className="absolute inset-0 pointer-events-none z-35 overflow-hidden select-none">
      {/* 1. Sequential connecting trajectory path between clicks */}
      {validSteps.length > 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <defs>
            <linearGradient id="replayPathGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.95" />
            </linearGradient>
            <filter id="replayGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <polyline
            points={validSteps
              .map((s) => `${(s.x / nativeWidth) * 100}%,${(s.y / nativeHeight) * 100}%`)
              .join(" ")}
            fill="none"
            stroke="url(#replayPathGradient)"
            strokeWidth="2.5"
            strokeDasharray="6 3"
            filter="url(#replayGlow)"
            className="opacity-80"
          />

          {/* Sequential Arrowheads along path */}
          {validSteps.slice(0, -1).map((s, idx) => {
            const next = validSteps[idx + 1];
            const midX = (s.x + next.x) / 2;
            const midY = (s.y + next.y) / 2;
            return (
              <circle
                key={`mid-${idx}`}
                cx={`${(midX / nativeWidth) * 100}%`}
                cy={`${(midY / nativeHeight) * 100}%`}
                r="3"
                fill="#a855f7"
                className="opacity-70"
              />
            );
          })}
        </svg>
      )}

      {/* 2. Persistent Animated Circular Blinks & Waypoints */}
      {validSteps.map((step, idx) => {
        const leftPercent = (step.x / nativeWidth) * 100;
        const topPercent = (step.y / nativeHeight) * 100;
        const isActive = activeStepIndex === idx;
        const isHovered = hoveredStepIndex === idx;
        const isCompleted = step.status === "completed";

        return (
          <div
            key={step.id || `replay_step_${idx}`}
            style={{
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30 cursor-pointer group"
            onMouseEnter={() => setHoveredStepIndex(idx)}
            onMouseLeave={() => setHoveredStepIndex(null)}
            onClick={() => onStepClick?.(step, idx)}
          >
            {/* Persistent Animated Circular Blink using .click-blink-active */}
            <div className="relative flex items-center justify-center">
              {/* Pulsing Glowing Ring (Always active on previous clicks / sequence steps) */}
              <div
                className={`absolute w-10 h-10 rounded-full border-2 border-pink-400/90 pointer-events-none click-blink-active ${
                  isActive
                    ? "border-cyan-400 ring-4 ring-cyan-400/60 scale-125"
                    : isCompleted
                    ? "border-emerald-400 ring-2 ring-emerald-500/40"
                    : "border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.8)]"
                }`}
              />

              {/* Secondary Outer Radar Ripple */}
              <div
                className={`absolute w-14 h-14 rounded-full border border-pink-500/40 pointer-events-none animate-ping ${
                  isActive ? "border-cyan-400" : ""
                }`}
              />

              {/* Center Core Badge with Step Number */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-extrabold text-xs shadow-xl transition-all transform group-hover:scale-110 ${
                  isActive
                    ? "bg-cyan-500 text-slate-950 border-2 border-white shadow-[0_0_20px_rgba(6,182,212,1)]"
                    : isCompleted
                    ? "bg-emerald-600 text-white border-2 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                    : "bg-gradient-to-tr from-pink-600 to-purple-600 text-white border-2 border-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.9)]"
                }`}
              >
                {idx + 1}
              </div>

              {/* Action Pill Badge */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border backdrop-blur-md shadow-lg flex items-center gap-1 transition-opacity ${
                    isActive || isHovered ? "opacity-100 scale-105" : "opacity-85"
                  } ${
                    isActive
                      ? "bg-cyan-950/90 border-cyan-400 text-cyan-300"
                      : isCompleted
                      ? "bg-emerald-950/90 border-emerald-400 text-emerald-300"
                      : "bg-slate-950/90 border-pink-500/80 text-pink-300"
                  }`}
                >
                  {step.action === "right_click" ? (
                    <span>🖱️ Right Click</span>
                  ) : step.action === "double_click" ? (
                    <span>⚡ 2x Click</span>
                  ) : step.action === "type_text" || step.action === "type" ? (
                    <span className="flex items-center gap-0.5">
                      <Type className="w-2.5 h-2.5" /> Type "{step.text || "..."}"
                    </span>
                  ) : step.action === "press_key" ? (
                    <span className="flex items-center gap-0.5">
                      <KeyRound className="w-2.5 h-2.5" /> [{step.keyPayload || "Key"}]
                    </span>
                  ) : (
                    <span>🎯 Click</span>
                  )}
                </div>
              </div>

              {/* Expanded Hover Tooltip */}
              {isHovered && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-cyan-400 text-slate-100 px-2.5 py-1 rounded text-xs font-mono shadow-2xl backdrop-blur-md z-40 whitespace-nowrap flex flex-col items-center gap-0.5">
                  <div className="text-cyan-300 font-bold">
                    Step #{idx + 1}: {step.name || step.action || "Click"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Coords: ({step.x}, {step.y})
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
