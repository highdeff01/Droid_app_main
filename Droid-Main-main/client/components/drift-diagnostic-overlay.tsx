import React, { useState } from "react";
import {
  AlertTriangle,
  Flame,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  Crosshair,
  ArrowRight,
  ShieldAlert,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface DiagnosticElementNode {
  id: string;
  name: string;
  templateX: number;
  templateY: number;
  liveX: number;
  liveY: number;
  width?: number;
  height?: number;
  confidence: number;
  actionType?: "click" | "double_click" | "right_click" | "type" | "drag" | "hover";
  isDrifted: boolean;
  driftDistancePx: number;
  deltaX: number;
  deltaY: number;
  recalibrated?: boolean;
}

interface DriftDiagnosticOverlayProps {
  elements?: DiagnosticElementNode[];
  thresholdPx?: number;
  onRecalibrateElement?: (elementId: string, correctedX: number, correctedY: number) => void;
  onRecalibrateAll?: () => void;
  nativeWidth?: number;
  nativeHeight?: number;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

export const DriftDiagnosticOverlay: React.FC<DriftDiagnosticOverlayProps> = ({
  elements = [],
  thresholdPx = 6,
  onRecalibrateElement,
  onRecalibrateAll,
  nativeWidth = 1920,
  nativeHeight = 1080,
  isVisible = true,
  onToggleVisibility,
}) => {
  const [activeThreshold, setActiveThreshold] = useState<number>(thresholdPx);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isRecalibratingMap, setIsRecalibratingMap] = useState<Record<string, boolean>>({});
  const [recalibratedSuccessMap, setRecalibratedSuccessMap] = useState<Record<string, boolean>>({});

  // Default fallback elements if none provided
  const targetElements: DiagnosticElementNode[] =
    elements.length > 0
      ? elements
      : [
          {
            id: "diag_elem_01",
            name: "Primary Submit CTA",
            templateX: 960,
            templateY: 540,
            liveX: 978,
            liveY: 554,
            width: 140,
            height: 48,
            confidence: 0.88,
            actionType: "click",
            isDrifted: true,
            driftDistancePx: 22.8,
            deltaX: 18,
            deltaY: 14,
          },
          {
            id: "diag_elem_02",
            name: "Search Input Field",
            templateX: 640,
            templateY: 120,
            liveX: 649,
            liveY: 122,
            width: 220,
            height: 38,
            confidence: 0.94,
            actionType: "type",
            isDrifted: true,
            driftDistancePx: 9.2,
            deltaX: 9,
            deltaY: 2,
          },
          {
            id: "diag_elem_03",
            name: "Navigation Menu Tab",
            templateX: 320,
            templateY: 80,
            liveX: 322,
            liveY: 81,
            width: 110,
            height: 32,
            confidence: 0.99,
            actionType: "click",
            isDrifted: false,
            driftDistancePx: 2.2,
            deltaX: 2,
            deltaY: 1,
          },
          {
            id: "diag_elem_04",
            name: "Export File Dropdown",
            templateX: 1420,
            templateY: 220,
            liveX: 1442,
            liveY: 236,
            width: 130,
            height: 40,
            confidence: 0.84,
            actionType: "click",
            isDrifted: true,
            driftDistancePx: 27.2,
            deltaX: 22,
            deltaY: 16,
          },
        ];

  // Check which elements exceed drift threshold
  const diagnosticNodes = targetElements.map((elem) => {
    const euclideanDist =
      Math.sqrt(Math.pow(elem.liveX - elem.templateX, 2) + Math.pow(elem.liveY - elem.templateY, 2));
    const isDrifted = euclideanDist >= activeThreshold && !recalibratedSuccessMap[elem.id];
    return {
      ...elem,
      driftDistancePx: parseFloat(euclideanDist.toFixed(1)),
      deltaX: elem.liveX - elem.templateX,
      deltaY: elem.liveY - elem.templateY,
      isDrifted,
    };
  });

  const driftedNodes = diagnosticNodes.filter((n) => n.isDrifted);
  const alignedNodes = diagnosticNodes.filter((n) => !n.isDrifted);

  // Single element re-calibration handler
  const handleSingleRecalibrate = async (elem: DiagnosticElementNode) => {
    setIsRecalibratingMap((prev) => ({ ...prev, [elem.id]: true }));
    try {
      if (onRecalibrateElement) {
        onRecalibrateElement(elem.id, elem.liveX, elem.liveY);
      } else {
        // Dispatch to AI recalibrate API
        await fetch("/api/ai/recalibrate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stepId: elem.id,
            originalPosition: { x: elem.templateX, y: elem.templateY },
            liveDetectedPosition: { x: elem.liveX, y: elem.liveY },
            deltaX: elem.deltaX,
            deltaY: elem.deltaY,
          }),
        });
      }

      setRecalibratedSuccessMap((prev) => ({ ...prev, [elem.id]: true }));
      toast.success(`Re-calibrated "${elem.name}" to live position (${elem.liveX}, ${elem.liveY})`);
    } catch (err: any) {
      toast.error(`Re-calibration warning: ${err.message}`);
    } finally {
      setIsRecalibratingMap((prev) => ({ ...prev, [elem.id]: false }));
    }
  };

  // Re-calibrate all drifted elements
  const handleRecalibrateAllNodes = async () => {
    if (onRecalibrateAll) {
      onRecalibrateAll();
    } else {
      for (const node of driftedNodes) {
        await handleSingleRecalibrate(node);
      }
    }
    toast.success(`Re-calibrated all ${driftedNodes.length} drifted UI elements.`);
  };

  if (!isVisible) return null;

  return (
    <div id="drift-diagnostic-overlay" className="absolute inset-0 pointer-events-none z-30 overflow-hidden font-sans">
      {/* SVG Canvas for coordinate drift vectors & bounding highlight boxes */}
      <svg
        className="w-full h-full absolute inset-0"
        viewBox={`0 0 ${nativeWidth} ${nativeHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="red-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="drift-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {diagnosticNodes.map((node) => {
          const w = node.width || 120;
          const h = node.height || 40;
          const boxX = (node.liveX || node.templateX) - w / 2;
          const boxY = (node.liveY || node.templateY) - h / 2;

          if (node.isDrifted) {
            return (
              <g key={`svg_diag_${node.id}`}>
                {/* Red Bounding Box Highlighting Deviated UI Element */}
                <rect
                  x={boxX}
                  y={boxY}
                  width={w}
                  height={h}
                  rx={8}
                  fill="rgba(239, 68, 68, 0.15)"
                  stroke="#ef4444"
                  strokeWidth="3.5"
                  strokeDasharray="6 3"
                  className="animate-pulse"
                />

                {/* Connecting Vector Line from Template to Live Position */}
                <line
                  x1={node.templateX}
                  y1={node.templateY}
                  x2={node.liveX}
                  y2={node.liveY}
                  stroke="url(#drift-line-grad)"
                  strokeWidth="3"
                  strokeDasharray="4 2"
                />

                {/* Original Template Anchor Marker (Ghost Target) */}
                <circle
                  cx={node.templateX}
                  cy={node.templateY}
                  r="7"
                  fill="rgba(239, 68, 68, 0.4)"
                  stroke="#ef4444"
                  strokeWidth="2"
                />

                {/* Live Shifted Target Landmark */}
                <circle
                  cx={node.liveX}
                  cy={node.liveY}
                  r="9"
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  className="animate-ping"
                  opacity="0.7"
                />
                <circle
                  cx={node.liveX}
                  cy={node.liveY}
                  r="6"
                  fill="#ffffff"
                  stroke="#ef4444"
                  strokeWidth="2"
                />
              </g>
            );
          } else {
            // Aligned Node Subtle Green Outline
            return (
              <g key={`svg_diag_${node.id}`}>
                <rect
                  x={boxX}
                  y={boxY}
                  width={w}
                  height={h}
                  rx={6}
                  fill="rgba(16, 185, 129, 0.08)"
                  stroke="#10b981"
                  strokeWidth="1.5"
                  opacity="0.8"
                />
                <circle
                  cx={node.liveX}
                  cy={node.liveY}
                  r="5"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </g>
            );
          }
        })}
      </svg>

      {/* Floating Interactive Diagnostic Badges on Deviated Elements */}
      {diagnosticNodes.map((node) => {
        const leftPercent = (node.liveX / nativeWidth) * 100;
        const topPercent = (node.liveY / nativeHeight) * 100;
        const isRecalibrating = isRecalibratingMap[node.id];
        const isResolved = recalibratedSuccessMap[node.id];

        return (
          <div
            key={`badge_${node.id}`}
            style={{
              left: `${Math.min(92, Math.max(8, leftPercent))}%`,
              top: `${Math.min(90, Math.max(8, topPercent))}%`,
              transform: "translate(-50%, -130%)",
            }}
            className="absolute pointer-events-auto z-40 transition-all"
          >
            {node.isDrifted ? (
              <div className="flex flex-col items-center bg-slate-950/95 border-2 border-red-500 rounded-xl p-2.5 shadow-2xl shadow-red-950/80 backdrop-blur text-xs min-w-[200px] animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between w-full gap-2 pb-1 border-b border-red-900/60">
                  <span className="font-bold text-red-400 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-bounce" />
                    DRIFT DETECTED
                  </span>
                  <Badge className="bg-red-900/90 text-red-200 border-red-700 text-[10px] font-mono px-1.5 py-0">
                    Δ {node.driftDistancePx}px
                  </Badge>
                </div>

                <div className="py-1.5 text-[11px] font-mono text-slate-300 w-full space-y-0.5">
                  <div className="font-sans font-semibold text-white truncate max-w-[190px]">{node.name}</div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Recorded: ({node.templateX}, {node.templateY})</span>
                  </div>
                  <div className="text-[10px] text-red-300 flex justify-between">
                    <span>Live Shift: ({node.liveX}, {node.liveY})</span>
                    <span className="text-amber-400">dx:{node.deltaX > 0 ? `+${node.deltaX}` : node.deltaX} dy:{node.deltaY > 0 ? `+${node.deltaY}` : node.deltaY}</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleSingleRecalibrate(node)}
                  disabled={isRecalibrating}
                  className="w-full h-6 text-[10px] font-mono font-bold bg-gradient-to-r from-red-600 via-amber-600 to-red-600 hover:from-red-500 hover:to-amber-500 text-white gap-1 shadow-md shadow-red-950 border border-amber-400/50 mt-1"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRecalibrating ? "animate-spin" : ""}`} />
                  {isRecalibrating ? "Re-calculating..." : "Re-calibrate Coordinates"}
                </Button>
              </div>
            ) : isResolved ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500 text-[10px] font-mono font-bold text-emerald-300 shadow-lg">
                <Check className="w-3 h-3 text-emerald-400" />
                Re-calibrated (0.0px Δ)
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/80 border border-emerald-600/60 text-[9px] font-mono text-emerald-400 backdrop-blur">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Aligned ({node.driftDistancePx}px)
              </div>
            )}
          </div>
        );
      })}

      {/* Master Floating Drift Diagnostic HUD Ribbon */}
      <div className="absolute top-4 right-4 pointer-events-auto z-40 max-w-sm w-full bg-slate-950/95 border border-red-700/80 rounded-xl p-3 shadow-2xl backdrop-blur text-xs">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-red-950 border border-red-600 text-red-400">
              <ShieldAlert className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                Drift Diagnostic Monitor
              </h4>
              <p className="text-[10px] font-mono text-slate-400">
                Euclidean Template Matching & Coordinate Drift
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-900"
          >
            {isToolbarCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {!isToolbarCollapsed && (
          <div className="pt-2 space-y-2.5">
            {/* Drift Summary Counters */}
            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="p-2 rounded-lg bg-red-950/50 border border-red-800/80">
                <div className="text-[10px] text-red-300 uppercase font-bold">Deviated Targets</div>
                <div className="text-lg font-black text-red-400">{driftedNodes.length}</div>
                <div className="text-[9px] text-slate-400">Requires Re-calibration</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-800/80">
                <div className="text-[10px] text-emerald-300 uppercase font-bold">Aligned Targets</div>
                <div className="text-lg font-black text-emerald-400">{alignedNodes.length}</div>
                <div className="text-[9px] text-slate-400">Precision Verified</div>
              </div>
            </div>

            {/* Threshold Slider */}
            <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>Drift Tolerance Threshold:</span>
                <span className="text-cyan-300 font-bold">{activeThreshold}px</span>
              </div>
              <input
                type="range"
                min={2}
                max={24}
                value={activeThreshold}
                onChange={(e) => setActiveThreshold(parseInt(e.target.value))}
                className="w-full accent-red-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>2px (Strict)</span>
                <span>6px (Default)</span>
                <span>24px (Relaxed)</span>
              </div>
            </div>

            {/* Actions: Re-calibrate All */}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleRecalibrateAllNodes}
                disabled={driftedNodes.length === 0}
                className="flex-1 h-7 text-xs font-mono font-bold bg-gradient-to-r from-red-600 via-amber-600 to-red-600 hover:from-red-500 hover:to-amber-500 text-white gap-1.5 shadow-md shadow-red-950 border border-amber-300"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                Re-calibrate All ({driftedNodes.length})
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
