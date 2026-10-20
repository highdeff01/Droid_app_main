import React, { useMemo } from "react";
import { Crosshair, Eye, Sparkles, Target, Zap, ShieldCheck } from "lucide-react";

export interface FocusAttentionConfig {
  enabled: boolean;
  x: number; // 0 - 1920
  y: number; // 0 - 1080
  radiusPx: number; // 40 - 400
  intensity: number; // 0.2 - 0.9 (dimness of background)
  label?: string;
  targetElement?: string;
  confidence?: number;
  pulseAnimation?: boolean;
  showCoordinates?: boolean;
  color?: "amber" | "emerald" | "cyan" | "purple" | "red";
  mode?: "spotlight" | "reticle" | "radar" | "bounding_box";
}

interface FocusAttentionOverlayProps {
  config: FocusAttentionConfig;
  containerWidth: number;
  containerHeight: number;
  scaleFactor?: number;
  onFocusPointClick?: (x: number, y: number) => void;
  onClose?: () => void;
}

export const FocusAttentionOverlay: React.FC<FocusAttentionOverlayProps> = ({
  config,
  containerWidth,
  containerHeight,
  scaleFactor = 1.0,
  onFocusPointClick,
  onClose,
}) => {
  if (!config.enabled || containerWidth <= 0 || containerHeight <= 0) return null;

  // Normalized coordinates on 1920x1080 baseline
  const screenX = (config.x / 1920) * containerWidth;
  const screenY = (config.y / 1080) * containerHeight;
  const scaledRadius = Math.max(30, (config.radiusPx / 1920) * containerWidth);

  const colorStyles = useMemo(() => {
    switch (config.color) {
      case "emerald":
        return {
          ring: "border-emerald-400 shadow-emerald-500/50",
          glow: "rgba(16, 185, 129, 0.35)",
          text: "text-emerald-300",
          badge: "bg-emerald-950/80 border-emerald-500/60 text-emerald-300",
          bgOverlay: `radial-gradient(circle ${scaledRadius}px at ${screenX}px ${screenY}px, transparent 0%, rgba(6, 78, 59, 0.15) 80%, rgba(2, 6, 23, ${config.intensity}) 100%)`,
        };
      case "cyan":
        return {
          ring: "border-cyan-400 shadow-cyan-500/50",
          glow: "rgba(6, 182, 212, 0.35)",
          text: "text-cyan-300",
          badge: "bg-cyan-950/80 border-cyan-500/60 text-cyan-300",
          bgOverlay: `radial-gradient(circle ${scaledRadius}px at ${screenX}px ${screenY}px, transparent 0%, rgba(8, 51, 68, 0.15) 80%, rgba(2, 6, 23, ${config.intensity}) 100%)`,
        };
      case "purple":
        return {
          ring: "border-purple-400 shadow-purple-500/50",
          glow: "rgba(168, 85, 247, 0.35)",
          text: "text-purple-300",
          badge: "bg-purple-950/80 border-purple-500/60 text-purple-300",
          bgOverlay: `radial-gradient(circle ${scaledRadius}px at ${screenX}px ${screenY}px, transparent 0%, rgba(88, 28, 135, 0.15) 80%, rgba(2, 6, 23, ${config.intensity}) 100%)`,
        };
      case "red":
        return {
          ring: "border-red-500 shadow-red-500/50",
          glow: "rgba(239, 68, 68, 0.35)",
          text: "text-red-300",
          badge: "bg-red-950/80 border-red-500/60 text-red-300",
          bgOverlay: `radial-gradient(circle ${scaledRadius}px at ${screenX}px ${screenY}px, transparent 0%, rgba(127, 29, 29, 0.2) 80%, rgba(2, 6, 23, ${config.intensity}) 100%)`,
        };
      case "amber":
      default:
        return {
          ring: "border-amber-400 shadow-amber-500/50",
          glow: "rgba(245, 158, 11, 0.35)",
          text: "text-amber-300",
          badge: "bg-amber-950/80 border-amber-500/60 text-amber-300",
          bgOverlay: `radial-gradient(circle ${scaledRadius}px at ${screenX}px ${screenY}px, transparent 0%, rgba(120, 53, 15, 0.15) 80%, rgba(2, 6, 23, ${config.intensity}) 100%)`,
        };
    }
  }, [config.color, config.intensity, scaledRadius, screenX, screenY]);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden select-none transition-all duration-300"
      style={{
        background: colorStyles.bgOverlay,
      }}
    >
      {/* Spotlight Ring / Reticle */}
      <div
        className={`absolute rounded-full border-2 ${colorStyles.ring} transition-transform duration-200 pointer-events-auto cursor-crosshair`}
        style={{
          left: `${screenX}px`,
          top: `${screenY}px`,
          width: `${scaledRadius * 2}px`,
          height: `${scaledRadius * 2}px`,
          transform: "translate(-50%, -50%)",
          boxShadow: `0 0 25px ${colorStyles.glow}, inset 0 0 15px ${colorStyles.glow}`,
        }}
        onClick={() => onFocusPointClick?.(config.x, config.y)}
      >
        {/* Pulsing Ripple Effect */}
        {config.pulseAnimation !== false && (
          <div
            className={`absolute inset-0 rounded-full border ${colorStyles.ring} animate-ping opacity-60`}
            style={{ animationDuration: "2.4s" }}
          />
        )}

        {/* Reticle Crosshairs */}
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-400/40 pointer-events-none" />
        <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-amber-400/40 pointer-events-none" />

        {/* Center Target Dot */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md shadow-amber-400"
        />

        {/* Four Corner Tick Markers */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-1 bg-amber-400 rounded-sm" />
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1 bg-amber-400 rounded-sm" />
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-3 bg-amber-400 rounded-sm" />
        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-1 h-3 bg-amber-400 rounded-sm" />
      </div>

      {/* Floating Focus Attention Badge Tooltip */}
      <div
        className="absolute pointer-events-auto z-40 transition-all duration-150 flex flex-col items-center"
        style={{
          left: `${Math.min(containerWidth - 140, Math.max(140, screenX))}px`,
          top: `${Math.min(containerHeight - 50, screenY + scaledRadius + 14)}px`,
          transform: "translateX(-50%)",
        }}
      >
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-xl backdrop-blur-md text-xs font-mono font-medium ${colorStyles.badge}`}
        >
          <Target className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: "6s" }} />
          <span>
            {config.label || "FOCUS ATTENTION ZONE"}
          </span>
          {config.showCoordinates !== false && (
            <span className="opacity-75 text-[11px] bg-black/40 px-1.5 py-0.5 rounded">
              [{Math.round(config.x)}, {Math.round(config.y)}]
            </span>
          )}
          {config.confidence !== undefined && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
              <ShieldCheck className="w-3 h-3" />
              {Math.round(config.confidence * 100)}%
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="ml-1 text-slate-400 hover:text-white p-0.5 rounded hover:bg-white/10"
              title="Dismiss Focus Attention"
            >
              ×
            </button>
          )}
        </div>

        {config.targetElement && (
          <div className="mt-1 text-[10px] font-mono text-slate-300 bg-slate-900/90 border border-slate-700/60 px-2 py-0.5 rounded shadow">
            🎯 Target Element: <strong className="text-amber-300">{config.targetElement}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
