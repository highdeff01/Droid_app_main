import React, { useState, useEffect } from "react";
import { Eye, Target, Crosshair, Sparkles, Sliders, Shield, Zap, AlertTriangle, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface VisionDetectedElement {
  id: string;
  name: string;
  type: "button" | "input" | "icon" | "checkbox" | "text" | "dropdown" | "modal";
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  ocrText?: string;
  isTargetActive?: boolean;
  driftOffsetPx?: number;
}

interface VisionDebugOverlayProps {
  isVisible?: boolean;
  activeTargetStep?: { id: string; name: string; x: number; y: number; action?: string } | null;
  nativeWidth?: number;
  nativeHeight?: number;
  customElements?: VisionDetectedElement[];
  onSelectElement?: (element: VisionDetectedElement) => void;
  className?: string;
}

export const VisionDebugOverlay: React.FC<VisionDebugOverlayProps> = ({
  isVisible = true,
  activeTargetStep,
  nativeWidth = 1920,
  nativeHeight = 1080,
  customElements,
  onSelectElement,
  className = "",
}) => {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [showConfidencePills, setShowConfidencePills] = useState<boolean>(true);
  const [showMouseCrosshair, setShowMouseCrosshair] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [perceptionScanPulse, setPerceptionScanPulse] = useState<number>(0);

  // Default AI #1 Perception Data Elements
  const [detectedElements, setDetectedElements] = useState<VisionDetectedElement[]>(() => {
    return [
      {
        id: "ai_elem_01",
        name: "Search Input Bar",
        type: "input",
        x: 620,
        y: 140,
        width: 320,
        height: 48,
        confidence: 0.985,
        ocrText: "Search workflows, tasks or agents...",
        isTargetActive: true,
        driftOffsetPx: 1.4,
      },
      {
        id: "ai_elem_02",
        name: "Primary Action Button",
        type: "button",
        x: 960,
        y: 560,
        width: 180,
        height: 44,
        confidence: 0.992,
        ocrText: "Submit & Execute",
        isTargetActive: true,
        driftOffsetPx: 2.1,
      },
      {
        id: "ai_elem_03",
        name: "Terms & Conditions Checkbox",
        type: "checkbox",
        x: 885,
        y: 490,
        width: 24,
        height: 24,
        confidence: 0.941,
        ocrText: "Accept automated execution terms",
        isTargetActive: false,
        driftOffsetPx: 0.8,
      },
      {
        id: "ai_elem_04",
        name: "Email Address Input Field",
        type: "input",
        x: 960,
        y: 380,
        width: 280,
        height: 42,
        confidence: 0.978,
        ocrText: "user@enterprise.internal",
        isTargetActive: false,
        driftOffsetPx: 3.2,
      },
      {
        id: "ai_elem_05",
        name: "Settings Gear Icon",
        type: "icon",
        x: 1840,
        y: 45,
        width: 36,
        height: 36,
        confidence: 0.965,
        ocrText: "⚙️",
        isTargetActive: false,
        driftOffsetPx: 0.5,
      },
      {
        id: "ai_elem_06",
        name: "Status Dropdown Selector",
        type: "dropdown",
        x: 340,
        y: 220,
        width: 160,
        height: 40,
        confidence: 0.952,
        ocrText: "Priority: High",
        isTargetActive: false,
        driftOffsetPx: 1.9,
      },
    ];
  });

  // Pulse animation to simulate real-time AI #1 stream
  useEffect(() => {
    const timer = setInterval(() => {
      setPerceptionScanPulse((prev) => (prev + 1) % 100);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const elementsToRender = customElements || detectedElements;
  const filteredElements = filterType === "all"
    ? elementsToRender
    : elementsToRender.filter((e) => e.type === filterType);

  if (!isVisible) return null;

  return (
    <div
      id="vision-debug-overlay-root"
      className={`absolute inset-0 pointer-events-none z-35 font-sans overflow-hidden select-none ${className}`}
    >
      {/* 1. Real-time Laser Scan line */}
      <div
        style={{
          top: `${(perceptionScanPulse * 1.0) % 100}%`,
        }}
        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_rgba(6,182,212,0.9)] opacity-40 transition-all duration-300"
      />

      {/* 2. SVG Bounding Boxes Layer */}
      <svg className="absolute inset-0 w-full h-full">
        {filteredElements.map((elem) => {
          const xPercent = (elem.x / nativeWidth) * 100;
          const yPercent = (elem.y / nativeHeight) * 100;
          const wPercent = (elem.width / nativeWidth) * 100;
          const hPercent = (elem.height / nativeHeight) * 100;
          const isSelected = elem.id === selectedElementId;
          const isTarget = elem.isTargetActive || (activeTargetStep && Math.hypot(elem.x - activeTargetStep.x, elem.y - activeTargetStep.y) < 60);

          const borderColor = isTarget ? "#ec4899" : isSelected ? "#38bdf8" : "#06b6d4";
          const fillColor = isTarget ? "rgba(236, 72, 153, 0.12)" : isSelected ? "rgba(56, 189, 248, 0.12)" : "rgba(6, 182, 212, 0.06)";

          return (
            <g key={elem.id} className="pointer-events-auto cursor-pointer" onClick={() => {
              setSelectedElementId(elem.id);
              onSelectElement?.(elem);
            }}>
              {/* Bounding box rectangle */}
              <rect
                x={`${xPercent - wPercent / 2}%`}
                y={`${yPercent - hPercent / 2}%`}
                width={`${wPercent}%`}
                height={`${hPercent}%`}
                fill={fillColor}
                stroke={borderColor}
                strokeWidth={isSelected || isTarget ? 2.5 : 1.5}
                strokeDasharray={isTarget ? "6 3" : undefined}
                rx="4"
                className="transition-all duration-150 hover:stroke-white hover:fill-cyan-500/20"
              />

              {/* Corner crosshairs for precision perception */}
              <path
                d={`M ${(xPercent - wPercent / 2)} ${(yPercent - hPercent / 2) + 1.5} L ${(xPercent - wPercent / 2)} ${(yPercent - hPercent / 2)} L ${(xPercent - wPercent / 2) + 1.5} ${(yPercent - hPercent / 2)}`}
                stroke="#ffffff"
                strokeWidth="2"
                fill="none"
              />

              {/* Center centroid point */}
              <circle
                cx={`${xPercent}%`}
                cy={`${yPercent}%`}
                r="3.5"
                fill={borderColor}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          );
        })}
      </svg>

      {/* 3. HTML Labels and Confidence Tags */}
      {filteredElements.map((elem) => {
        const xPercent = (elem.x / nativeWidth) * 100;
        const yPercent = (elem.y / nativeHeight) * 100;
        const hPercent = (elem.height / nativeHeight) * 100;
        const isSelected = elem.id === selectedElementId;
        const isTarget = elem.isTargetActive || (activeTargetStep && Math.hypot(elem.x - activeTargetStep.x, elem.y - activeTargetStep.y) < 60);

        return (
          <div
            key={`lbl-${elem.id}`}
            style={{
              left: `${xPercent}%`,
              top: `${yPercent - hPercent / 2}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-full mb-1 pointer-events-auto flex items-center gap-1 z-40 transition-transform"
          >
            <div
              onClick={() => {
                setSelectedElementId(elem.id);
                onSelectElement?.(elem);
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer shadow-md backdrop-blur-sm transition-all ${
                isTarget
                  ? "bg-pink-950/90 border border-pink-500 text-pink-200 font-bold"
                  : isSelected
                  ? "bg-cyan-950/90 border border-cyan-400 text-white font-bold ring-1 ring-cyan-400"
                  : "bg-slate-950/85 border border-slate-700 text-cyan-300 hover:border-cyan-400"
              }`}
            >
              <span className="uppercase text-[9px] px-1 py-0.2 rounded bg-cyan-900/60 text-cyan-200 font-bold">
                {elem.type}
              </span>
              <span>{elem.name}</span>
              {showConfidencePills && (
                <span className="text-[9px] text-emerald-400 font-semibold">
                  {(elem.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* 4. Top-Right Real-time Perception Status Indicator */}
      <div className="absolute top-3 left-3 pointer-events-auto bg-slate-950/90 border border-cyan-500/50 rounded-xl p-2.5 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 font-mono text-xs max-w-xs z-50">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="font-bold text-white text-[11px] tracking-wide">
              AI #1 Perception Active
            </span>
          </div>
          <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[9px] font-mono py-0">
            {filteredElements.length} Bounding Boxes
          </Badge>
        </div>

        <div className="flex items-center gap-1 text-[10px] flex-wrap">
          <span className="text-slate-400">Filter:</span>
          {["all", "button", "input", "checkbox", "icon"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-1.5 py-0.5 rounded uppercase ${
                filterType === t
                  ? "bg-cyan-600 text-white font-bold"
                  : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
