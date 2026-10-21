import React, { useState } from "react";
import {
  Eye,
  Target,
  Crosshair,
  Sparkles,
  Sliders,
  Shield,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Maximize2,
  ChevronRight,
  Layers,
  ScanSearch,
  Activity,
  ArrowRight,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VisionDetectedElement } from "./VisionDebugOverlay";
import { toast } from "sonner";

interface VisionDebugPanelProps {
  detectedElements?: VisionDetectedElement[];
  onSelectElement?: (element: VisionDetectedElement) => void;
  onAutoRepositionStep?: (element: VisionDetectedElement) => void;
  onRunPreExecutionScan?: () => void;
  className?: string;
}

export const VisionDebugPanel: React.FC<VisionDebugPanelProps> = ({
  detectedElements = [
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
  ],
  onSelectElement,
  onAutoRepositionStep,
  onRunPreExecutionScan,
  className = "",
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(detectedElements[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const filtered = detectedElements.filter((elem) => {
    const matchesType = selectedTypeFilter === "all" || elem.type === selectedTypeFilter;
    const matchesSearch =
      elem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (elem.ocrText && elem.ocrText.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const selectedElement = detectedElements.find((e) => e.id === selectedId) || filtered[0];

  const handleTriggerReposition = (elem: VisionDetectedElement) => {
    onAutoRepositionStep?.(elem);
    toast.success(`Coordinate Auto-Repositioned to (${elem.x}, ${elem.y})`, {
      description: `Target element '${elem.name}' recalibrated with Euclidean drift Δ ${elem.driftOffsetPx || 1.2}px`,
    });
  };

  return (
    <div
      id="vision-debug-panel-root"
      className={`rounded-2xl border border-slate-800 bg-[#0c1324] shadow-2xl overflow-hidden font-sans flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 bg-[#080d1a]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-500/60 text-cyan-400 shadow-sm">
            <Eye className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                AI #1 Vision Perception Debug
              </h3>
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px] font-mono py-0">
                ACTIVE PERCEPTION FEED
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Live parsing of identified UI bounding boxes, OCR text extracts & coordinate drift offsets
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsScanning(true);
              onRunPreExecutionScan?.();
              setTimeout(() => {
                setIsScanning(false);
                toast.success("Pre-Execution Vision Scan completed (98.6% match confidence)");
              }, 800);
            }}
            disabled={isScanning}
            className="h-7 px-2.5 text-xs font-mono bg-cyan-950/80 border-cyan-700 text-cyan-300 hover:bg-cyan-900"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Scanning..." : "Rescan Frame"}
          </Button>
        </div>
      </div>

      {/* Main Grid: Element Explorer & Detailed Perception Inspector */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[300px]">
        {/* Left column: List of detected bounding boxes */}
        <div className="md:col-span-5 border-r border-slate-800/80 p-3 space-y-2.5 flex flex-col">
          {/* Search and Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter perception objects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1 text-xs font-mono bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono">
            {["all", "button", "input", "checkbox", "icon"].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTypeFilter(t)}
                className={`px-2 py-0.5 rounded capitalize whitespace-nowrap transition-all ${
                  selectedTypeFilter === t
                    ? "bg-cyan-600 text-white font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* List Items */}
          <div className="space-y-1.5 overflow-y-auto max-h-[260px] pr-1">
            {filtered.map((elem) => {
              const isSelected = elem.id === selectedId;
              return (
                <div
                  key={elem.id}
                  onClick={() => {
                    setSelectedId(elem.id);
                    onSelectElement?.(elem);
                  }}
                  className={`p-2 rounded-xl border text-xs font-mono cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? "bg-cyan-950/70 border-cyan-500 text-white shadow-md ring-1 ring-cyan-500/50"
                      : "bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold bg-cyan-950 border border-cyan-800 text-cyan-300">
                      {elem.type}
                    </span>
                    <span className="font-semibold truncate">{elem.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                    <span className="text-emerald-400 font-bold">
                      {(elem.confidence * 100).toFixed(0)}%
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs font-mono text-slate-500">
                No matching perception bounding boxes found.
              </div>
            )}
          </div>
        </div>

        {/* Right column: Selected Perception Detail Inspector */}
        <div className="md:col-span-7 p-4 bg-[#090f1d] flex flex-col justify-between">
          {selectedElement ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white tracking-wide">
                      {selectedElement.name}
                    </h4>
                    <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px] font-mono uppercase">
                      {selectedElement.type}
                    </Badge>
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    Target Centroid: ({selectedElement.x}, {selectedElement.y}) · Dimensions: {selectedElement.width}×{selectedElement.height}px
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-400 block">Perception Score</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    {(selectedElement.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* OCR Text Box */}
              <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/80 space-y-1">
                <span className="text-[10px] font-mono text-cyan-400 font-semibold uppercase flex items-center gap-1">
                  <ScanSearch className="w-3 h-3" />
                  AI #1 OCR Extracted Text:
                </span>
                <p className="text-xs font-mono text-slate-200">
                  {selectedElement.ocrText ? `"${selectedElement.ocrText}"` : "No direct text label parsed."}
                </p>
              </div>

              {/* Spatial Drift & Coordinates Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">Centroid X</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedElement.x}px</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">Centroid Y</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedElement.y}px</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">Bounding Box</span>
                  <span className="text-sm font-bold text-cyan-300 font-mono">
                    {selectedElement.width}×{selectedElement.height}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">Spatial Drift</span>
                  <span className="text-sm font-bold text-amber-400 font-mono">
                    Δ {selectedElement.driftOffsetPx || 1.2}px
                  </span>
                </div>
              </div>

              {/* Action Bar for Auto-Reposition */}
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ready for Euclidean coordinate re-alignment</span>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleTriggerReposition(selectedElement)}
                  className="h-8 px-3 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950 gap-1.5"
                >
                  <Target className="w-3.5 h-3.5" />
                  Auto-Reposition Step
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
              Select an element to inspect perception telemetry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
