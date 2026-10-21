import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Flame,
  Layers,
  Crosshair,
  Sparkles,
  Sliders,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Download,
  Activity,
  Target,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export interface InteractionPoint {
  id: string;
  x: number; // 0-1920
  y: number; // 0-1080
  weight: number; // 1 - 100
  type: "click" | "double_click" | "drag_end" | "hover_dwell" | "automation_step";
  timestamp: number;
  label?: string;
}

export interface HotspotCluster {
  id: string;
  centroidX: number;
  centroidY: number;
  totalHits: number;
  densityScore: number; // 0-100%
  radiusPx: number;
  label: string;
  category: string;
  recentTimestamp: number;
}

interface HighInteractionHeatmapOverlayProps {
  isVisible: boolean;
  onToggleVisibility: () => void;
  interactionHistory?: InteractionPoint[];
  currentSequenceSteps?: Array<{ id: string; name?: string; x: number; y: number; action?: string }>;
  onAdoptHotspotAsStep?: (hotspot: HotspotCluster) => void;
  containerWidth?: number;
  containerHeight?: number;
}

export const HighInteractionHeatmapOverlay: React.FC<HighInteractionHeatmapOverlayProps> = ({
  isVisible,
  onToggleVisibility,
  interactionHistory = [],
  currentSequenceSteps = [],
  onAdoptHotspotAsStep,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [opacity, setOpacity] = useState<number>(0.75);
  const [blurRadius, setBlurRadius] = useState<number>(36);
  const [intensityMultiplier, setIntensityMultiplier] = useState<number>(1.2);
  const [colorScheme, setColorScheme] = useState<"fire" | "neon" | "spectrum">("fire");
  const [showTargetRings, setShowTargetRings] = useState<boolean>(true);
  const [showRankingsSidebar, setShowRankingsSidebar] = useState<boolean>(false);
  const [decayMode, setDecayMode] = useState<"persistent" | "decay">("persistent");
  const [filterType, setFilterType] = useState<string>("all");

  // Local interaction accumulator
  const [localPoints, setLocalPoints] = useState<InteractionPoint[]>(() => {
    // Seed with realistic baseline interactions if empty
    const seed: InteractionPoint[] = [
      { id: "p1", x: 960, y: 540, weight: 18, type: "click", timestamp: Date.now() - 30000, label: "Center Viewport" },
      { id: "p2", x: 965, y: 538, weight: 24, type: "click", timestamp: Date.now() - 25000, label: "Confirm Action" },
      { id: "p3", x: 1720, y: 980, weight: 32, type: "click", timestamp: Date.now() - 20000, label: "Submit CTA" },
      { id: "p4", x: 1715, y: 985, weight: 28, type: "click", timestamp: Date.now() - 15000, label: "Submit CTA" },
      { id: "p5", x: 240, y: 160, weight: 14, type: "hover_dwell", timestamp: Date.now() - 10000, label: "Navigation Menu" },
      { id: "p6", x: 480, y: 320, weight: 22, type: "click", timestamp: Date.now() - 5000, label: "Input Text Field" },
      { id: "p7", x: 1150, y: 450, weight: 16, type: "drag_end", timestamp: Date.now() - 2000, label: "Table Data Row" },
    ];
    return seed;
  });

  // Merge external interactions & sequence steps
  const allInteractionPoints = useMemo(() => {
    const list: InteractionPoint[] = [...localPoints];

    if (interactionHistory && interactionHistory.length > 0) {
      list.push(...interactionHistory);
    }

    if (currentSequenceSteps && currentSequenceSteps.length > 0) {
      currentSequenceSteps.forEach((s, idx) => {
        list.push({
          id: `seq-${s.id}-${idx}`,
          x: s.x,
          y: s.y,
          weight: 20,
          type: "automation_step",
          timestamp: Date.now(),
          label: s.name || `Step #${idx + 1}`,
        });
      });
    }

    if (filterType !== "all") {
      return list.filter((p) => p.type === filterType);
    }

    return list;
  }, [localPoints, interactionHistory, currentSequenceSteps, filterType]);

  // Cluster points into hotspots using Euclidean distance threshold (60px)
  const clusters = useMemo(() => {
    const clusterMap: HotspotCluster[] = [];
    const threshold = 70;

    allInteractionPoints.forEach((pt) => {
      let matchedCluster = clusterMap.find((c) => {
        const dist = Math.hypot(c.centroidX - pt.x, c.centroidY - pt.y);
        return dist <= threshold;
      });

      if (matchedCluster) {
        // Weighted running centroid calculation
        const newHits = matchedCluster.totalHits + 1;
        matchedCluster.centroidX = Math.round(
          (matchedCluster.centroidX * matchedCluster.totalHits + pt.x) / newHits
        );
        matchedCluster.centroidY = Math.round(
          (matchedCluster.centroidY * matchedCluster.totalHits + pt.y) / newHits
        );
        matchedCluster.totalHits = newHits;
        matchedCluster.densityScore = Math.min(100, Math.round(newHits * 12 * intensityMultiplier));
        matchedCluster.radiusPx = Math.min(90, Math.max(30, 25 + newHits * 4));
        matchedCluster.recentTimestamp = Math.max(matchedCluster.recentTimestamp, pt.timestamp);
        if (pt.label && !matchedCluster.label) {
          matchedCluster.label = pt.label;
        }
      } else {
        clusterMap.push({
          id: `cluster-${clusterMap.length + 1}`,
          centroidX: pt.x,
          centroidY: pt.y,
          totalHits: 1,
          densityScore: Math.min(100, Math.round(15 * intensityMultiplier)),
          radiusPx: 35,
          label: pt.label || `Target Area @ (${pt.x}, ${pt.y})`,
          category: pt.type,
          recentTimestamp: pt.timestamp,
        });
      }
    });

    return clusterMap.sort((a, b) => b.totalHits - a.totalHits);
  }, [allInteractionPoints, intensityMultiplier]);

  // Render canvas heatmap
  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fixed virtual resolution 1920x1080
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (allInteractionPoints.length === 0) return;

    // Create offscreen alpha map
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = w;
    alphaCanvas.height = h;
    const alphaCtx = alphaCanvas.getContext("2d");
    if (!alphaCtx) return;

    // Draw radial blur for each point
    allInteractionPoints.forEach((pt) => {
      const radius = blurRadius * 1.5;
      const grad = alphaCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
      
      const pointWeight = (pt.weight || 10) / 100 * intensityMultiplier;
      const alpha = Math.min(1, Math.max(0.1, pointWeight));

      grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      grad.addColorStop(0.5, `rgba(0, 0, 0, ${alpha * 0.4})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      alphaCtx.fillStyle = grad;
      alphaCtx.beginPath();
      alphaCtx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      alphaCtx.fill();
    });

    // Colorize alpha canvas using chosen gradient palette
    const alphaData = alphaCtx.getImageData(0, 0, w, h);
    const pixels = alphaData.data;
    const finalData = ctx.createImageData(w, h);
    const finalPixels = finalData.data;

    // Generate gradient lookup table
    const lutCanvas = document.createElement("canvas");
    lutCanvas.width = 256;
    lutCanvas.height = 1;
    const lutCtx = lutCanvas.getContext("2d");
    if (lutCtx) {
      const grad = lutCtx.createLinearGradient(0, 0, 256, 0);

      if (colorScheme === "fire") {
        grad.addColorStop(0.0, "rgba(0, 0, 255, 0)");
        grad.addColorStop(0.2, "rgba(0, 200, 255, 0.4)");
        grad.addColorStop(0.4, "rgba(0, 255, 120, 0.7)");
        grad.addColorStop(0.7, "rgba(255, 230, 0, 0.85)");
        grad.addColorStop(0.9, "rgba(255, 60, 0, 0.95)");
        grad.addColorStop(1.0, "rgba(255, 255, 255, 1.0)");
      } else if (colorScheme === "neon") {
        grad.addColorStop(0.0, "rgba(10, 0, 30, 0)");
        grad.addColorStop(0.3, "rgba(139, 92, 246, 0.5)");
        grad.addColorStop(0.6, "rgba(6, 182, 212, 0.8)");
        grad.addColorStop(0.85, "rgba(236, 72, 153, 0.95)");
        grad.addColorStop(1.0, "rgba(255, 255, 255, 1.0)");
      } else {
        grad.addColorStop(0.0, "rgba(0, 0, 0, 0)");
        grad.addColorStop(0.25, "rgba(59, 130, 246, 0.6)");
        grad.addColorStop(0.5, "rgba(16, 185, 129, 0.75)");
        grad.addColorStop(0.75, "rgba(245, 158, 11, 0.9)");
        grad.addColorStop(1.0, "rgba(239, 68, 68, 1.0)");
      }

      lutCtx.fillStyle = grad;
      lutCtx.fillRect(0, 0, 256, 1);
      const lutData = lutCtx.getImageData(0, 0, 256, 1).data;

      for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3];
        if (a > 0) {
          const lutIdx = Math.min(255, a) * 4;
          finalPixels[i] = lutData[lutIdx];
          finalPixels[i + 1] = lutData[lutIdx + 1];
          finalPixels[i + 2] = lutData[lutIdx + 2];
          finalPixels[i + 3] = Math.round(lutData[lutIdx + 3] * opacity);
        }
      }

      ctx.putImageData(finalData, 0, 0);
    }
  }, [allInteractionPoints, blurRadius, intensityMultiplier, opacity, colorScheme, isVisible]);

  // Helper coordinate converter from 1920x1080 to percent
  const toPercent = (x: number, y: number) => ({
    left: `${(x / 1920) * 100}%`,
    top: `${(y / 1080) * 100}%`,
  });

  const handleSimulateClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVisible) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.round(((e.clientX - rect.left) / rect.width) * 1920);
    const clickY = Math.round(((e.clientY - rect.top) / rect.height) * 1080);

    const newPoint: InteractionPoint = {
      id: `pt-${Date.now()}`,
      x: clickX,
      y: clickY,
      weight: 35,
      type: "click",
      timestamp: Date.now(),
      label: `Recorded Click (${clickX}, ${clickY})`,
    };

    setLocalPoints((prev) => [...prev, newPoint]);
    toast.success(`Heatmap registered interaction @ (${clickX}, ${clickY})`);
  };

  const handleExportHeatmapJson = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      totalInteractions: allInteractionPoints.length,
      clusters: clusters,
      rawPoints: allInteractionPoints,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ui-interaction-heatmap-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported UI Interaction Heatmap JSON");
  };

  const handleClearHeatmap = () => {
    setLocalPoints([]);
    toast.info("Cleared high-interaction heatmap data");
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 pointer-events-auto z-20 overflow-hidden select-none"
      onDoubleClick={handleSimulateClick}
    >
      {/* Canvas Heatmap Rendering Layer */}
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        className="w-full h-full object-fill pointer-events-none transition-opacity duration-300"
        style={{ opacity }}
      />

      {/* Target Cluster Centroids & Pulsing Heat Rings */}
      {showTargetRings &&
        clusters.map((cluster, idx) => {
          const pos = toPercent(cluster.centroidX, cluster.centroidY);
          const isHot = cluster.densityScore > 60;

          return (
            <div
              key={cluster.id}
              style={pos}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group pointer-events-auto z-30"
              onClick={(e) => {
                e.stopPropagation();
                if (onAdoptHotspotAsStep) {
                  onAdoptHotspotAsStep(cluster);
                  toast.success(`Converted hotspot #${idx + 1} into workflow step!`);
                }
              }}
            >
              {/* Outer pulsing ring */}
              <div
                className={`absolute -inset-4 rounded-full border-2 animate-ping pointer-events-none ${
                  isHot ? "border-red-500/80" : "border-amber-400/60"
                }`}
              />

              {/* Glowing Target Ring */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-2xl transition-all cursor-pointer backdrop-blur-xs ${
                  isHot
                    ? "bg-red-950/80 border-red-400 shadow-red-500/80 ring-2 ring-red-400/50"
                    : "bg-amber-950/80 border-amber-400 shadow-amber-500/50"
                }`}
              >
                <Flame
                  className={`w-4 h-4 ${
                    isHot ? "text-red-300 animate-bounce" : "text-amber-300"
                  }`}
                />
              </div>

              {/* Rank & Hit Count Badge */}
              <div className="absolute -top-3 -right-2 bg-slate-950 text-white font-mono font-black text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400 shadow-md">
                #{idx + 1}
              </div>

              {/* Hover Details Tooltip */}
              <div className="absolute top-11 left-1/2 transform -translate-x-1/2 bg-slate-950/95 border border-amber-500/70 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-40 min-w-[160px]">
                <div className="flex items-center justify-between gap-2 font-bold text-amber-300 border-b border-slate-800 pb-1 mb-1">
                  <span>{cluster.label}</span>
                  <Badge variant="outline" className="text-[9px] bg-red-950/80 text-red-300 border-red-600">
                    🔥 {cluster.totalHits} hits
                  </Badge>
                </div>
                <div className="text-[10px] text-slate-300 flex items-center justify-between">
                  <span>Coordinates:</span>
                  <span className="text-cyan-300 font-bold">({cluster.centroidX}, {cluster.centroidY})</span>
                </div>
                <div className="text-[10px] text-slate-300 flex items-center justify-between">
                  <span>Density:</span>
                  <span className="text-emerald-400 font-bold">{cluster.densityScore}%</span>
                </div>
                <div className="text-[9px] text-amber-400/90 mt-1 italic text-center">
                  Click to add as automation target
                </div>
              </div>
            </div>
          );
        })}

      {/* Floating Control HUD Widget */}
      <div className="absolute top-3 right-3 bg-slate-950/95 border border-amber-500/60 rounded-xl p-3 shadow-2xl backdrop-blur-md z-40 max-w-xs space-y-2.5 text-xs text-slate-200 font-mono">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-amber-300">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>UI INTERACTION HEATMAP</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleVisibility}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div>
            <span className="text-slate-400 block text-[9px]">INTERACTIONS:</span>
            <span className="text-cyan-300 font-bold text-sm">{allInteractionPoints.length}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[9px]">HOT CLUSTERS:</span>
            <span className="text-amber-400 font-bold text-sm">{clusters.length}</span>
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-slate-300">
            <span>Heatmap Opacity:</span>
            <span className="text-amber-400 font-bold">{Math.round(opacity * 100)}%</span>
          </div>
          <Slider
            value={[opacity * 100]}
            min={10}
            max={100}
            step={5}
            onValueChange={([val]) => setOpacity(val / 100)}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-slate-300">
            <span>Spot Radius / Blur:</span>
            <span className="text-amber-400 font-bold">{blurRadius}px</span>
          </div>
          <Slider
            value={[blurRadius]}
            min={15}
            max={65}
            step={1}
            onValueChange={([val]) => setBlurRadius(val)}
            className="w-full"
          />
        </div>

        {/* Palette selector */}
        <div className="flex items-center justify-between gap-1 pt-1">
          <span className="text-[10px] text-slate-400">Palette:</span>
          <div className="flex items-center gap-1">
            {(["fire", "neon", "spectrum"] as const).map((scheme) => (
              <button
                key={scheme}
                onClick={() => setColorScheme(scheme)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize transition-colors ${
                  colorScheme === scheme
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-900 text-slate-300 hover:text-white"
                }`}
              >
                {scheme}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRankingsSidebar(!showRankingsSidebar)}
            className={`h-7 flex-1 text-[10px] font-mono border-slate-700 ${
              showRankingsSidebar ? "bg-amber-950 text-amber-300 border-amber-500" : ""
            }`}
          >
            <TrendingUp className="w-3 h-3 mr-1" />
            Targets ({clusters.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportHeatmapJson}
            className="h-7 px-2 text-[10px] font-mono border-slate-700"
            title="Export JSON"
          >
            <Download className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearHeatmap}
            className="h-7 px-2 text-[10px] font-mono text-red-400 hover:text-red-300"
            title="Clear data"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Targets Ranking Drawer */}
      {showRankingsSidebar && (
        <div className="absolute top-3 left-3 bg-slate-950/95 border border-amber-500/70 rounded-xl p-3 shadow-2xl backdrop-blur-md z-40 w-72 max-h-[85%] overflow-y-auto space-y-2 text-xs font-mono text-slate-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-300">
              <Target className="w-4 h-4 text-amber-400" />
              <span>TOP INTERACTED TARGETS</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRankingsSidebar(false)}
              className="h-5 w-5 p-0 text-slate-400"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="space-y-1.5">
            {clusters.map((c, idx) => (
              <div
                key={c.id}
                className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-amber-500/60 transition-all flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-100 truncate text-[11px]">{c.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="text-cyan-300">({c.centroidX}, {c.centroidY})</span>
                    <span>•</span>
                    <span className="text-amber-400 font-bold">{c.totalHits} hits</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    if (onAdoptHotspotAsStep) {
                      onAdoptHotspotAsStep(c);
                      toast.success(`Adopted target (${c.centroidX}, ${c.centroidY}) as step`);
                    }
                  }}
                  className="h-6 px-2 text-[10px] bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold shrink-0"
                >
                  <Plus className="w-3 h-3 mr-0.5" /> Add Step
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
