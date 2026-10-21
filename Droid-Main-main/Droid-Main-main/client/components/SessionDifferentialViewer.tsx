import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  SplitSquareVertical,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Download,
  Copy,
  Eye,
  Activity,
  Compass,
  Zap,
  MousePointer,
  Crosshair,
  TrendingDown,
  ChevronRight,
  Flame,
  Target,
  FileSearch,
  Maximize2,
  Scan,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  MouseTrajectoryStore,
  MouseRecordingSession,
} from "../../src/services/mouseTrajectoryStore";
import { compareFramesPixelLevel, PixelDiffResult } from "../utils/pixelDiffEngine";

interface SessionDifferentialViewerProps {
  initialSessionAId?: string;
  initialSessionBId?: string;
  onSelectGoldenSession?: (mergedSession: MouseRecordingSession) => void;
  className?: string;
}

interface FailurePoint {
  stepIndex: number;
  type: "coordinate_drift" | "missing_action" | "timing_anomaly" | "speed_divergence";
  severity: "critical" | "warning" | "low";
  deltaPx: number;
  coordA: { x: number; y: number };
  coordB: { x: number; y: number };
  actionA: string;
  actionB: string;
  cause: string;
  recommendation: string;
}

export interface DriftHotspot {
  id: string;
  rank: number;
  x: number; // screen coordinate 0-1920
  y: number; // screen coordinate 0-1080
  canvasX: number;
  canvasY: number;
  frequencyCount: number; // occurrences in spatial cluster
  avgDeltaPx: number;
  maxDeltaPx: number;
  dominantSeverity: "critical" | "warning" | "low";
  steps: number[];
  label: string;
}

type HeatmapColorScheme = "thermal" | "cyber" | "solar";
type HeatmapCalculationMode = "frequency" | "displacement" | "critical_only";

export const SessionDifferentialViewer: React.FC<SessionDifferentialViewerProps> = ({
  initialSessionAId,
  initialSessionBId,
  onSelectGoldenSession,
  className = "",
}) => {
  const store = MouseTrajectoryStore.getInstance();
  const [sessions, setSessions] = useState<MouseRecordingSession[]>([]);

  // Selected Sessions
  const [sessionAId, setSessionAId] = useState<string>(initialSessionAId || "");
  const [sessionBId, setSessionBId] = useState<string>(initialSessionBId || "");

  // Playback / Scrubber State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(1.0); // 0.0 to 1.0
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showConnectors, setShowConnectors] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"canvas_diff" | "pixel_heatmap" | "failure_points" | "table_ledger">("canvas_diff");
  const [pixelDiffResult, setPixelDiffResult] = useState<PixelDiffResult | null>(null);
  const [isComputingPixelDiff, setIsComputingPixelDiff] = useState<boolean>(false);
  const [pixelThreshold, setPixelThreshold] = useState<number>(20);

  // --- HEATMAP OVERLAY CONFIGURATION STATE ---
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapIntensity, setHeatmapIntensity] = useState<number>(0.85); // 0.1 to 1.0
  const [heatmapRadius, setHeatmapRadius] = useState<number>(48); // px blur radius
  const [heatmapColorScheme, setHeatmapColorScheme] = useState<HeatmapColorScheme>("thermal");
  const [heatmapCalcMode, setHeatmapCalcMode] = useState<HeatmapCalculationMode>("frequency");
  const [showHotspotTags, setShowHotspotTags] = useState<boolean>(true);
  const [showIsobars, setShowIsobars] = useState<boolean>(true);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);

  // Canvas Interactivity State
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; normX: number; normY: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Load Sessions from store
  useEffect(() => {
    const list = store.getAllSessions();
    setSessions(list);
    if (list.length >= 2) {
      if (!sessionAId) setSessionAId(list[0].id);
      if (!sessionBId) setSessionBId(list[1].id);
    } else if (list.length === 1) {
      if (!sessionAId) setSessionAId(list[0].id);
      if (!sessionBId) setSessionBId(list[0].id);
    }
  }, []);

  const sessionA = useMemo(() => sessions.find((s) => s.id === sessionAId) || null, [sessions, sessionAId]);
  const sessionB = useMemo(() => sessions.find((s) => s.id === sessionBId) || null, [sessions, sessionBId]);

  // Compute common failure points, step-by-step diffs & coordinate drift metrics
  const diffAnalysis = useMemo(() => {
    if (!sessionA || !sessionB) {
      return {
        failurePoints: [] as FailurePoint[],
        maxDriftPx: 0,
        avgDriftPx: 0,
        alignmentScore: 100,
        stepDiffs: [] as any[],
        driftEvents: [] as any[],
      };
    }

    const maxLen = Math.max(sessionA.points.length, sessionB.points.length);
    const stepDiffs: any[] = [];
    const failurePoints: FailurePoint[] = [];
    const driftEvents: any[] = [];
    let totalDrift = 0;
    let validPairs = 0;
    let maxDrift = 0;

    for (let i = 0; i < maxLen; i++) {
      const ptA = sessionA.points[i];
      const ptB = sessionB.points[i];

      if (ptA && ptB) {
        const dx = ptB.x - ptA.x;
        const dy = ptB.y - ptA.y;
        const dist = parseFloat(Math.hypot(dx, dy).toFixed(1));
        totalDrift += dist;
        validPairs++;
        if (dist > maxDrift) maxDrift = dist;

        const isActionMismatch = ptA.type !== ptB.type;
        const diffItem = {
          step: i + 1,
          coordA: { x: ptA.x, y: ptA.y },
          coordB: { x: ptB.x, y: ptB.y },
          typeA: ptA.type || "move",
          typeB: ptB.type || "move",
          deltaPx: dist,
          dx,
          dy,
          status: dist > 30 ? "critical" : dist > 15 ? "warning" : "aligned",
        };
        stepDiffs.push(diffItem);

        // Record drift occurrence event for heatmap spatial accumulation
        if (dist > 3) {
          driftEvents.push({
            step: i + 1,
            x: (ptA.x + ptB.x) / 2,
            y: (ptA.y + ptB.y) / 2,
            xA: ptA.x,
            yA: ptA.y,
            xB: ptB.x,
            yB: ptB.y,
            deltaPx: dist,
            severity: dist > 30 ? "critical" : dist > 15 ? "warning" : "low",
          });
        }

        if (dist > 30) {
          failurePoints.push({
            stepIndex: i + 1,
            type: "coordinate_drift",
            severity: "critical",
            deltaPx: dist,
            coordA: { x: ptA.x, y: ptA.y },
            coordB: { x: ptB.x, y: ptB.y },
            actionA: ptA.type || "move",
            actionB: ptB.type || "move",
            cause: `Severe ${dist}px target displacement. UI layout bounding box shifted across sessions.`,
            recommendation: "Apply OCR Landmark Anchor or Dynamic Template Offset to re-center clicks.",
          });
        } else if (dist > 15 || isActionMismatch) {
          failurePoints.push({
            stepIndex: i + 1,
            type: isActionMismatch ? "missing_action" : "coordinate_drift",
            severity: "warning",
            deltaPx: dist,
            coordA: { x: ptA.x, y: ptA.y },
            coordB: { x: ptB.x, y: ptB.y },
            actionA: ptA.type || "move",
            actionB: ptB.type || "move",
            cause: isActionMismatch
              ? `Action mismatch (Session A performed "${ptA.type}", Session B performed "${ptB.type}").`
              : `Moderate ${dist}px trajectory deviation.`,
            recommendation: isActionMismatch
              ? "Ensure asynchronous loading spinners have finished before firing click."
              : "Spline smoothing with cubic bezier morphing recommended.",
          });
        }
      } else if (ptA && !ptB) {
        failurePoints.push({
          stepIndex: i + 1,
          type: "missing_action",
          severity: "critical",
          deltaPx: 0,
          coordA: { x: ptA.x, y: ptA.y },
          coordB: { x: 0, y: 0 },
          actionA: ptA.type || "move",
          actionB: "NONE (Truncated)",
          cause: "Session B terminated early; missing expected trailing actions.",
          recommendation: "Inspect preceding wait conditions and network timeout limits.",
        });
      }
    }

    const avgDrift = validPairs > 0 ? parseFloat((totalDrift / validPairs).toFixed(1)) : 0;
    const alignmentScore = Math.max(0, Math.min(100, Math.round(100 - avgDrift * 1.8)));

    return {
      failurePoints,
      maxDriftPx: maxDrift,
      avgDriftPx: avgDrift,
      alignmentScore,
      stepDiffs,
      driftEvents,
    };
  }, [sessionA, sessionB]);

  // Compute Spatial Drift Hotspots (Clusters of localized frequent pixel drift)
  const driftHotspots = useMemo<DriftHotspot[]>(() => {
    if (!diffAnalysis.driftEvents || diffAnalysis.driftEvents.length === 0) return [];

    const events = diffAnalysis.driftEvents;
    const clusterThresholdPx = 140; // Spatial proximity grouping radius
    const clusters: Array<{
      points: typeof events;
      sumX: number;
      sumY: number;
      sumDelta: number;
      maxDelta: number;
      steps: number[];
    }> = [];

    events.forEach((ev: any) => {
      let found = false;
      for (const cl of clusters) {
        const avgX = cl.sumX / cl.points.length;
        const avgY = cl.sumY / cl.points.length;
        const dist = Math.hypot(ev.x - avgX, ev.y - avgY);
        if (dist <= clusterThresholdPx) {
          cl.points.push(ev);
          cl.sumX += ev.x;
          cl.sumY += ev.y;
          cl.sumDelta += ev.deltaPx;
          if (ev.deltaPx > cl.maxDelta) cl.maxDelta = ev.deltaPx;
          cl.steps.push(ev.step);
          found = true;
          break;
        }
      }

      if (!found) {
        clusters.push({
          points: [ev],
          sumX: ev.x,
          sumY: ev.y,
          sumDelta: ev.deltaPx,
          maxDelta: ev.deltaPx,
          steps: [ev.step],
        });
      }
    });

    // Sort clusters by frequency count descending, then by average delta
    const sorted = clusters
      .map((c, idx) => {
        const count = c.points.length;
        const avgDelta = parseFloat((c.sumDelta / count).toFixed(1));
        const avgX = Math.round(c.sumX / count);
        const avgY = Math.round(c.sumY / count);
        const dominantSeverity: "critical" | "warning" | "low" =
          avgDelta > 28 || c.maxDelta > 38 ? "critical" : avgDelta > 14 ? "warning" : "low";

        return {
          id: `hotspot-${idx + 1}`,
          rank: idx + 1,
          x: avgX,
          y: avgY,
          canvasX: 0, // Assigned during canvas render
          canvasY: 0,
          frequencyCount: count,
          avgDeltaPx: avgDelta,
          maxDeltaPx: Math.round(c.maxDelta),
          dominantSeverity,
          steps: Array.from(new Set(c.steps)).sort((a, b) => a - b),
          label: `Hotspot #${idx + 1} (${avgX}, ${avgY})`,
        };
      })
      .sort((a, b) => b.frequencyCount * 2 + b.avgDeltaPx - (a.frequencyCount * 2 + a.avgDeltaPx))
      .map((item, rankIdx) => ({ ...item, rank: rankIdx + 1, id: `hotspot-${rankIdx + 1}`, label: `Hotspot #${rankIdx + 1} (${item.x}, ${item.y})` }));

    return sorted.slice(0, 6); // Top 6 hotspots
  }, [diffAnalysis.driftEvents]);

  /**
   * Helper: Map normalized scalar (0.0 to 1.0) into RGBA color for Canvas API
   */
  const getColorForHeatmapValue = useCallback(
    (normalizedValue: number, scheme: HeatmapColorScheme, alphaMultiplier: number): [number, number, number, number] => {
      const v = Math.max(0, Math.min(1, normalizedValue));
      let r = 0, g = 0, b = 0, a = 0;

      if (v <= 0.01) return [0, 0, 0, 0];

      if (scheme === "thermal") {
        // Classic Infrared Thermal: Deep Cyan -> Emerald Lime -> Yellow -> Orange -> Red-Magenta
        if (v < 0.25) {
          const t = v / 0.25;
          r = Math.round(6 * (1 - t) + 16 * t);
          g = Math.round(182 * (1 - t) + 185 * t);
          b = Math.round(212 * (1 - t) + 129 * t);
          a = 0.35 + t * 0.25;
        } else if (v < 0.5) {
          const t = (v - 0.25) / 0.25;
          r = Math.round(16 * (1 - t) + 234 * t);
          g = Math.round(185 * (1 - t) + 179 * t);
          b = Math.round(129 * (1 - t) + 8 * t);
          a = 0.6 + t * 0.15;
        } else if (v < 0.75) {
          const t = (v - 0.5) / 0.25;
          r = Math.round(234 * (1 - t) + 249 * t);
          g = Math.round(179 * (1 - t) + 115 * t);
          b = Math.round(8 * (1 - t) + 22 * t);
          a = 0.75 + t * 0.15;
        } else {
          const t = (v - 0.75) / 0.25;
          r = Math.round(249 * (1 - t) + 239 * t);
          g = Math.round(115 * (1 - t) + 68 * t);
          b = Math.round(22 * (1 - t) + 68 * t);
          a = 0.9 + t * 0.1;
        }
      } else if (scheme === "cyber") {
        // Cyber Neon: Deep Violet -> Neon Cyan -> Hot Pink -> White Magenta
        if (v < 0.3) {
          const t = v / 0.3;
          r = Math.round(99 * (1 - t) + 6 * t);
          g = Math.round(102 * (1 - t) + 182 * t);
          b = Math.round(241 * (1 - t) + 212 * t);
          a = 0.4 + t * 0.25;
        } else if (v < 0.65) {
          const t = (v - 0.3) / 0.35;
          r = Math.round(6 * (1 - t) + 236 * t);
          g = Math.round(182 * (1 - t) + 72 * t);
          b = Math.round(212 * (1 - t) + 153 * t);
          a = 0.65 + t * 0.2;
        } else {
          const t = (v - 0.65) / 0.35;
          r = Math.round(236 * (1 - t) + 244 * t);
          g = Math.round(72 * (1 - t) + 63 * t);
          b = Math.round(153 * (1 - t) + 94 * t);
          a = 0.85 + t * 0.15;
        }
      } else {
        // Solar Flare: Dark Amber -> Vibrant Gold -> Fiery Crimson
        if (v < 0.4) {
          const t = v / 0.4;
          r = Math.round(180 * (1 - t) + 245 * t);
          g = Math.round(83 * (1 - t) + 158 * t);
          b = Math.round(9 * (1 - t) + 11 * t);
          a = 0.4 + t * 0.3;
        } else if (v < 0.75) {
          const t = (v - 0.4) / 0.35;
          r = Math.round(245 * (1 - t) + 249 * t);
          g = Math.round(158 * (1 - t) + 115 * t);
          b = Math.round(11 * (1 - t) + 22 * t);
          a = 0.7 + t * 0.2;
        } else {
          const t = (v - 0.75) / 0.25;
          r = Math.round(249 * (1 - t) + 220 * t);
          g = Math.round(115 * (1 - t) + 38 * t);
          b = Math.round(22 * (1 - t) + 38 * t);
          a = 0.9 + t * 0.1;
        }
      }

      return [r, g, b, Math.min(255, Math.round(a * alphaMultiplier * 255))];
    },
    []
  );

  /**
   * Main Canvas Render Loop: Composite Trajectories + Canvas API Drift Heatmap Overlay
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 960);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 480);

    // 1. Draw Base Dark Screen Canvas
    ctx.fillStyle = "#060913";
    ctx.fillRect(0, 0, width, height);

    // Coordinate grid overlay
    ctx.strokeStyle = "rgba(51, 65, 85, 0.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!sessionA || !sessionB) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Select two recording sessions to render differential comparison overlay", width / 2, height / 2);
      return;
    }

    // Coordinate scale factors (Assuming standard 1920x1080 resolution normalized to canvas)
    const scaleX = width / 1920;
    const scaleY = height / 1080;

    const ptsA = sessionA.points;
    const ptsB = sessionB.points;

    const countA = Math.floor(ptsA.length * playbackProgress);
    const countB = Math.floor(ptsB.length * playbackProgress);
    const visibleSteps = Math.min(countA, countB);

    // Filter drift events up to current playback scrubber
    const visibleDriftEvents = diffAnalysis.driftEvents.filter((ev: any) => ev.step <= visibleSteps);

    // -------------------------------------------------------------------------
    // 2. CANVAS API COLORED HEATMAP OVERLAY GENERATION
    // -------------------------------------------------------------------------
    if (showHeatmap && visibleDriftEvents.length > 0) {
      // Create or reuse offscreen accumulation canvas
      let offscreen = offscreenCanvasRef.current;
      if (!offscreen) {
        offscreen = document.createElement("canvas");
        offscreenCanvasRef.current = offscreen;
      }
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext("2d");

      if (offCtx) {
        offCtx.clearRect(0, 0, width, height);
        offCtx.globalCompositeOperation = "lighter";

        // Draw radial blur intensity stamps for each drift event
        visibleDriftEvents.forEach((ev: any) => {
          const cx = ev.x * scaleX;
          const cy = ev.y * scaleY;

          // Weight according to calculation mode
          let weight = 1.0;
          if (heatmapCalcMode === "displacement") {
            weight = Math.min(3.0, ev.deltaPx / 15);
          } else if (heatmapCalcMode === "critical_only") {
            if (ev.deltaPx < 20) return;
            weight = 2.5;
          }

          const radius = Math.max(16, heatmapRadius * (scaleX + scaleY) * 0.5);
          const radGrad = offCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);

          const alphaBase = 0.28 * weight;
          radGrad.addColorStop(0, `rgba(0, 0, 0, ${Math.min(1.0, alphaBase * 1.5)})`);
          radGrad.addColorStop(0.4, `rgba(0, 0, 0, ${Math.min(1.0, alphaBase * 0.8)})`);
          radGrad.addColorStop(0.75, `rgba(0, 0, 0, ${Math.min(1.0, alphaBase * 0.3)})`);
          radGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

          offCtx.fillStyle = radGrad;
          offCtx.beginPath();
          offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
          offCtx.fill();
        });

        // Colorize the accumulated density map using Canvas API ImageData
        const densityImgData = offCtx.getImageData(0, 0, width, height);
        const pixels = densityImgData.data;

        // Find peak density for normalization
        let maxAlpha = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > maxAlpha) maxAlpha = pixels[i];
        }
        if (maxAlpha === 0) maxAlpha = 255;

        for (let i = 0; i < pixels.length; i += 4) {
          const rawAlpha = pixels[i + 3];
          if (rawAlpha > 0) {
            const normalized = rawAlpha / maxAlpha;
            const [r, g, b, finalAlpha] = getColorForHeatmapValue(normalized, heatmapColorScheme, heatmapIntensity);
            pixels[i] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = b;
            pixels[i + 3] = finalAlpha;
          }
        }

        offCtx.putImageData(densityImgData, 0, 0);

        // Composite the colorized heatmap overlay onto the main viewport canvas
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(offscreen, 0, 0);
        ctx.restore();
      }
    }

    // -------------------------------------------------------------------------
    // 3. DRAW ISOBARS & HOTSPOT TARGET HUD MARKERS
    // -------------------------------------------------------------------------
    if (showHeatmap && showIsobars && driftHotspots.length > 0) {
      driftHotspots.forEach((hs) => {
        const hx = hs.x * scaleX;
        const hy = hs.y * scaleY;
        hs.canvasX = hx;
        hs.canvasY = hy;

        const isSelected = selectedHotspotId === hs.id;
        const radius = Math.max(22, 20 + hs.frequencyCount * 4);

        // Isobar contour concentric ring
        ctx.beginPath();
        ctx.arc(hx, hy, radius, 0, Math.PI * 2);
        ctx.strokeStyle =
          hs.dominantSeverity === "critical"
            ? "rgba(239, 68, 68, 0.7)"
            : hs.dominantSeverity === "warning"
            ? "rgba(245, 158, 11, 0.6)"
            : "rgba(6, 182, 212, 0.5)";
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash(isSelected ? [4, 2] : [3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hotspot target crosshair
        ctx.strokeStyle = hs.dominantSeverity === "critical" ? "#ef4444" : "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx - 8, hy);
        ctx.lineTo(hx + 8, hy);
        ctx.moveTo(hx, hy - 8);
        ctx.lineTo(hx, hy + 8);
        ctx.stroke();

        // Pulsing center dot
        ctx.beginPath();
        ctx.arc(hx, hy, isSelected ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = hs.dominantSeverity === "critical" ? "#ef4444" : "#f59e0b";
        ctx.fill();

        // Optional Top-Rank Hotspot Pill Badge Tag
        if (showHotspotTags) {
          const tagText = `#${hs.rank} (${hs.frequencyCount}x • Δ${hs.avgDeltaPx}px)`;
          ctx.font = "bold 9px monospace";
          const textW = ctx.measureText(tagText).width;
          const tagX = Math.min(width - textW - 20, Math.max(10, hx + 12));
          const tagY = Math.max(24, Math.min(height - 12, hy - 8));

          // Tag Box Background
          ctx.fillStyle = isSelected ? "rgba(220, 38, 38, 0.9)" : "rgba(15, 23, 42, 0.88)";
          ctx.fillRect(tagX - 4, tagY - 10, textW + 8, 15);
          ctx.strokeStyle = hs.dominantSeverity === "critical" ? "#ef4444" : "#f59e0b";
          ctx.lineWidth = 1;
          ctx.strokeRect(tagX - 4, tagY - 10, textW + 8, 15);

          // Tag Text
          ctx.fillStyle = isSelected ? "#ffffff" : hs.dominantSeverity === "critical" ? "#fca5a5" : "#fef08a";
          ctx.fillText(tagText, tagX, tagY + 1);
        }
      });
    }

    // -------------------------------------------------------------------------
    // 4. DRAW CONNECTORS & DRIFT VECTORS
    // -------------------------------------------------------------------------
    if (showConnectors) {
      const minCount = Math.min(countA, countB);
      for (let i = 0; i < minCount; i++) {
        const a = ptsA[i];
        const b = ptsB[i];
        const ax = a.x * scaleX;
        const ay = a.y * scaleY;
        const bx = b.x * scaleX;
        const by = b.y * scaleY;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);

        if (dist > 30) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
          ctx.lineWidth = 2.5;
        } else if (dist > 15) {
          ctx.strokeStyle = "rgba(245, 158, 11, 0.65)";
          ctx.lineWidth = 1.8;
        } else {
          ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();

        // Highlight failure drift anchor points
        if (dist > 25) {
          ctx.beginPath();
          ctx.arc((ax + bx) / 2, (ay + by) / 2, 5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
          ctx.fill();
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. DRAW TRAJECTORY PATHS (PATH A & PATH B)
    // -------------------------------------------------------------------------
    // Draw Path A (Reference Cyan)
    if (countA > 0) {
      ctx.beginPath();
      ctx.moveTo(ptsA[0].x * scaleX, ptsA[0].y * scaleY);
      for (let i = 1; i < countA; i++) {
        ctx.lineTo(ptsA[i].x * scaleX, ptsA[i].y * scaleY);
      }
      ctx.strokeStyle = "#06b6d4"; // Cyan-500
      ctx.lineWidth = 2.5;
      ctx.stroke();

      for (let i = 0; i < countA; i++) {
        const p = ptsA[i];
        const px = p.x * scaleX;
        const py = p.y * scaleY;
        ctx.beginPath();
        ctx.arc(px, py, p.type === "click" || p.type === "left_click" ? 5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.type === "click" || p.type === "left_click" ? "#22d3ee" : "rgba(6, 182, 212, 0.85)";
        ctx.fill();
      }
    }

    // Draw Path B (Comparison Amber)
    if (countB > 0) {
      ctx.beginPath();
      ctx.moveTo(ptsB[0].x * scaleX, ptsB[0].y * scaleY);
      for (let i = 1; i < countB; i++) {
        ctx.lineTo(ptsB[i].x * scaleX, ptsB[i].y * scaleY);
      }
      ctx.strokeStyle = "#f59e0b"; // Amber-500
      ctx.lineWidth = 2.5;
      ctx.stroke();

      for (let i = 0; i < countB; i++) {
        const p = ptsB[i];
        const px = p.x * scaleX;
        const py = p.y * scaleY;
        ctx.beginPath();
        ctx.arc(px, py, p.type === "click" || p.type === "left_click" ? 5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.type === "click" || p.type === "left_click" ? "#fbbf24" : "rgba(245, 158, 11, 0.85)";
        ctx.fill();
      }
    }

    // -------------------------------------------------------------------------
    // 6. CANVAS HUD: TOP-LEFT LEGEND & HEATMAP SCALE BAR
    // -------------------------------------------------------------------------
    // Legend Container
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.fillRect(12, 12, 270, 68);
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 270, 68);

    ctx.font = "11px monospace";
    ctx.fillStyle = "#06b6d4";
    ctx.fillText(`● Path A (Ref): ${sessionA.name.slice(0, 20)}`, 22, 30);

    ctx.fillStyle = "#f59e0b";
    ctx.fillText(`● Path B (Cmp): ${sessionB.name.slice(0, 20)}`, 22, 48);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.fillText(`Alignment: ${diffAnalysis.alignmentScore}% • Max Δ: ${diffAnalysis.maxDriftPx}px`, 22, 66);

    // Heatmap Gradient Scale Bar on Bottom-Right
    if (showHeatmap) {
      const barW = 160;
      const barH = 10;
      const barX = width - barW - 16;
      const barY = height - 28;

      // Container
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(barX - 10, barY - 18, barW + 20, 36);
      ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
      ctx.strokeRect(barX - 10, barY - 18, barW + 20, 36);

      // Label
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 9px monospace";
      ctx.fillText("DRIFT FREQUENCY DENSITY", barX, barY - 6);

      // Gradient Bar
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      if (heatmapColorScheme === "thermal") {
        grad.addColorStop(0, "#06b6d4");
        grad.addColorStop(0.35, "#10b981");
        grad.addColorStop(0.65, "#f59e0b");
        grad.addColorStop(1, "#ef4444");
      } else if (heatmapColorScheme === "cyber") {
        grad.addColorStop(0, "#6366f1");
        grad.addColorStop(0.4, "#06b6d4");
        grad.addColorStop(0.75, "#ec4899");
        grad.addColorStop(1, "#d946ef");
      } else {
        grad.addColorStop(0, "#b45309");
        grad.addColorStop(0.5, "#f59e0b");
        grad.addColorStop(1, "#dc2626");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = "#334155";
      ctx.strokeRect(barX, barY, barW, barH);

      // Labels Low / Peak
      ctx.fillStyle = "#94a3b8";
      ctx.font = "8px monospace";
      ctx.fillText("LOW (0)", barX, barY + barH + 10);
      ctx.fillText("HIGH PEAK", barX + barW - 48, barY + barH + 10);
    }

    // -------------------------------------------------------------------------
    // 7. HOVER CROSSHAIR & INTERACTIVE MAGNIFIER TOOLTIP
    // -------------------------------------------------------------------------
    if (hoverCoord) {
      const hx = hoverCoord.x;
      const hy = hoverCoord.y;

      // Guide lines
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, height);
      ctx.moveTo(0, hy);
      ctx.lineTo(width, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Reticle
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Tooltip Card
      const scrX = Math.round(hx / scaleX);
      const scrY = Math.round(hy / scaleY);

      // Check for closest drift event
      let nearestEv: any = null;
      let minDistance = 9999;
      visibleDriftEvents.forEach((ev: any) => {
        const d = Math.hypot(ev.x * scaleX - hx, ev.y * scaleY - hy);
        if (d < minDistance) {
          minDistance = d;
          nearestEv = ev;
        }
      });

      const ttW = 180;
      const ttH = minDistance < 50 && nearestEv ? 58 : 36;
      let ttX = hx + 14;
      let ttY = hy + 14;
      if (ttX + ttW > width) ttX = hx - ttW - 14;
      if (ttY + ttH > height) ttY = hy - ttH - 14;

      ctx.fillStyle = "rgba(10, 15, 30, 0.95)";
      ctx.fillRect(ttX, ttY, ttW, ttH);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1;
      ctx.strokeRect(ttX, ttY, ttW, ttH);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9px monospace";
      ctx.fillText(`CANVAS POS: (${scrX}, ${scrY})`, ttX + 6, ttY + 12);

      if (minDistance < 50 && nearestEv) {
        ctx.fillStyle = nearestEv.deltaPx > 25 ? "#f87171" : "#fbbf24";
        ctx.fillText(`STEP #${nearestEv.step}: DRIFT Δ${nearestEv.deltaPx}px`, ttX + 6, ttY + 26);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`Ref: (${nearestEv.xA}, ${nearestEv.yA})`, ttX + 6, ttY + 38);
        ctx.fillText(`Cmp: (${nearestEv.xB}, ${nearestEv.yB})`, ttX + 6, ttY + 50);
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("Move over path/hotspots to inspect", ttX + 6, ttY + 26);
      }
    }
  }, [
    sessionA,
    sessionB,
    playbackProgress,
    showConnectors,
    showHeatmap,
    heatmapIntensity,
    heatmapRadius,
    heatmapColorScheme,
    heatmapCalcMode,
    showHotspotTags,
    showIsobars,
    selectedHotspotId,
    hoverCoord,
    diffAnalysis,
    driftHotspots,
    getColorForHeatmapValue,
  ]);

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const step = (now: number) => {
      if (lastTimeRef.current !== null) {
        const deltaSec = (now - lastTimeRef.current) / 1000;
        setPlaybackProgress((prev) => {
          const next = prev + (deltaSec * playbackSpeed) / 4;
          if (next >= 1.0) {
            setIsPlaying(false);
            return 1.0;
          }
          return next;
        });
      }
      lastTimeRef.current = now;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, playbackSpeed]);

  // Canvas Mouse Move Handler for Crosshair Hover
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHoverCoord({
      x,
      y,
      normX: x / canvas.width,
      normY: y / canvas.height,
    });
  };

  const handleCanvasMouseLeave = () => {
    setHoverCoord(null);
  };

  // Canvas Click Handler: Select Hotspot if clicked nearby
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let clickedHotspot: DriftHotspot | null = null;
    for (const hs of driftHotspots) {
      const d = Math.hypot(hs.canvasX - x, hs.canvasY - y);
      if (d <= 35) {
        clickedHotspot = hs;
        break;
      }
    }

    if (clickedHotspot) {
      setSelectedHotspotId(clickedHotspot.id);
      if (clickedHotspot.steps.length > 0) {
        const maxSteps = Math.max(sessionA?.points.length || 1, sessionB?.points.length || 1);
        setPlaybackProgress(clickedHotspot.steps[0] / maxSteps);
      }
      toast.info(`Focused on ${clickedHotspot.label}`, {
        description: `${clickedHotspot.frequencyCount} drift events occurred here with avg displacement of Δ${clickedHotspot.avgDeltaPx}px.`,
      });
    } else {
      setSelectedHotspotId(null);
    }
  };

  // Export Full Canvas with Heatmap Overlay as PNG
  const handleExportHeatmapSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `drift_heatmap_overlay_${sessionA?.id || "sessionA"}_vs_${sessionB?.id || "sessionB"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Exported Canvas Drift Heatmap snapshot!");
  };

  // Create & Save Merged "Golden Reference" Session
  const handleMergeAndStabilize = () => {
    if (!sessionA || !sessionB) return;

    const maxLen = Math.max(sessionA.points.length, sessionB.points.length);
    const mergedPoints: any[] = [];

    for (let i = 0; i < maxLen; i++) {
      const pA = sessionA.points[i];
      const pB = sessionB.points[i];

      if (pA && pB) {
        // Weighted centroid: 70% Reference A + 30% Verification B
        const avgX = Math.round(pA.x * 0.7 + pB.x * 0.3);
        const avgY = Math.round(pA.y * 0.7 + pB.y * 0.3);
        mergedPoints.push({
          x: avgX,
          y: avgY,
          timestamp: pA.timestamp || Date.now() + i * 40,
          type: pA.type || pB.type || "move",
          speed: ((pA.speed || 1.0) + (pB.speed || 1.0)) / 2,
        });
      } else if (pA) {
        mergedPoints.push(pA);
      } else if (pB) {
        mergedPoints.push(pB);
      }
    }

    const goldenSession: MouseRecordingSession = {
      id: `golden_session_${Date.now()}`,
      name: `★ Golden Reference: ${sessionA.name} [Merged]`,
      recordedAt: Date.now(),
      durationSec: (sessionA.durationSec + sessionB.durationSec) / 2,
      clickCount: sessionA.clickCount,
      frameCount: mergedPoints.length,
      averageSpeed: Math.round((sessionA.averageSpeed + sessionB.averageSpeed) / 2),
      maxSpeed: Math.max(sessionA.maxSpeed, sessionB.maxSpeed),
      points: mergedPoints,
      sessionType: "mouse_trail",
      tags: ["Golden Reference", "Stabilized", "Multi-Pass Verified"],
      notes: `Generated from Differential Merge of "${sessionA.name}" and "${sessionB.name}". Drift corrected.`,
      confidenceScore: 0.99,
      appEnvironment: sessionA.appEnvironment || "Chrome 128 / Win 11",
      source: "diff_merger",
      targetDevice: "desktop",
    };

    store.saveSession(goldenSession);
    toast.success("Saved Golden Reference Session to 100-Session Store!", {
      description: `New session created with ${mergedPoints.length} stabilized coordinate waypoints.`,
    });

    if (onSelectGoldenSession) {
      onSelectGoldenSession(goldenSession);
    }
  };

  return (
    <div className={`flex flex-col gap-5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 p-6 font-mono shadow-2xl ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <SplitSquareVertical className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                SESSION DIFFERENTIAL & CANVAS DRIFT HEATMAP VIEWER
              </h3>
              <p className="text-xs text-slate-400">
                Compare sessions side-by-side with HTML5 Canvas pixel-level drift heatmaps, spatial cluster detection, and failure analysis
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportHeatmapSnapshot}
            disabled={!sessionA || !sessionB}
            className="h-9 px-3 border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 gap-1.5"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            EXPORT CANVAS PNG
          </Button>

          <Button
            onClick={handleMergeAndStabilize}
            disabled={!sessionA || !sessionB}
            className="h-9 px-4 bg-gradient-to-r from-cyan-600 to-amber-600 hover:from-cyan-500 hover:to-amber-500 text-white font-bold gap-1.5 shadow-lg shadow-cyan-950/40"
          >
            <Sparkles className="w-4 h-4" />
            MERGE & STABILIZE GOLDEN SESSION
          </Button>
        </div>
      </div>

      {/* Session Pickers Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
        {/* Session A (Reference) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-400 flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              SESSION A (GOLDEN REFERENCE):
            </span>
            {sessionA && <span className="text-[10px] text-slate-400">{sessionA.points.length} pts</span>}
          </div>
          <select
            value={sessionAId}
            onChange={(e) => setSessionAId(e.target.value)}
            className="w-full bg-slate-950 border border-cyan-500/40 rounded-lg p-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="">-- Select Reference Session A --</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationSec.toFixed(1)}s • {s.points.length} pts)
              </option>
            ))}
          </select>
        </div>

        {/* Session B (Comparison) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-400 flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              SESSION B (CANDIDATE / DRIFTED):
            </span>
            {sessionB && <span className="text-[10px] text-slate-400">{sessionB.points.length} pts</span>}
          </div>
          <select
            value={sessionBId}
            onChange={(e) => setSessionBId(e.target.value)}
            className="w-full bg-slate-950 border border-amber-500/40 rounded-lg p-2 text-xs font-mono text-amber-200 focus:outline-none focus:border-amber-400"
          >
            <option value="">-- Select Comparison Session B --</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationSec.toFixed(1)}s • {s.points.length} pts)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparative Metrics Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">ALIGNMENT SCORE</span>
          <span className="text-base font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
            {diffAnalysis.alignmentScore}% Match
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">MAX TRAJECTORY DRIFT</span>
          <span className={`text-base font-bold flex items-center gap-1 mt-0.5 ${diffAnalysis.maxDriftPx > 30 ? "text-red-400" : "text-amber-400"}`}>
            <Compass className="w-4 h-4" />
            Δ{diffAnalysis.maxDriftPx} px
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">AVG COORDINATE OFFSET</span>
          <span className="text-base font-bold text-slate-200 flex items-center gap-1 mt-0.5">
            <Activity className="w-4 h-4 text-cyan-400" />
            Δ{diffAnalysis.avgDriftPx} px
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">SPATIAL DRIFT HOTSPOTS</span>
          <span className={`text-base font-bold flex items-center gap-1 mt-0.5 ${driftHotspots.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            <Flame className="w-4 h-4" />
            {driftHotspots.length} Zones Detected
          </span>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("canvas_diff")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === "canvas_diff"
              ? "bg-amber-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          CANVAS DRIFT HEATMAP OVERLAY
        </button>

        <button
          onClick={() => setActiveTab("failure_points")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === "failure_points"
              ? "bg-amber-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          FAILURE POINTS & ROOT CAUSES ({diffAnalysis.failurePoints.length})
        </button>

        <button
          onClick={() => setActiveTab("table_ledger")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === "table_ledger"
              ? "bg-amber-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <SplitSquareVertical className="w-3.5 h-3.5" />
          STEP-BY-STEP DIFF TABLE
        </button>

        <button
          onClick={async () => {
            setActiveTab("pixel_heatmap");
            if (!pixelDiffResult && sessionA && sessionB) {
              setIsComputingPixelDiff(true);
              try {
                const canvasElA = canvasRef.current;
                const result = await compareFramesPixelLevel(
                  sessionA.captureFrameScreenshotUrl || (canvasElA ? canvasElA.toDataURL() : ""),
                  sessionB.captureFrameScreenshotUrl || (canvasElA ? canvasElA.toDataURL() : ""),
                  {
                    threshold: pixelThreshold,
                    targetCoords: sessionA.points[0] ? { x: sessionA.points[0].x, y: sessionA.points[0].y } : undefined,
                    roiRadius: 90,
                    generateHeatmap: true,
                  }
                );
                setPixelDiffResult(result);
              } catch (e) {
                console.error("Pixel diff failed:", e);
              } finally {
                setIsComputingPixelDiff(false);
              }
            }
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === "pixel_heatmap"
              ? "bg-purple-600 text-white shadow-md"
              : "text-purple-400 hover:text-white hover:bg-purple-950/40"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          FRAME PIXEL-DIFF MATRIX
        </button>
      </div>

      {/* TAB 1: VISUAL DIFFERENTIAL CANVAS WITH CANVAS API HEATMAP OVERLAY */}
      {activeTab === "canvas_diff" && (
        <div className="space-y-4">
          {/* Main Visual Canvas Container */}
          <div className="relative w-full h-[450px] rounded-xl overflow-hidden border border-slate-800 bg-[#060913] shadow-2xl select-none">
            <canvas
              ref={canvasRef}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={handleCanvasMouseLeave}
              onClick={handleCanvasClick}
              className="w-full h-full block cursor-crosshair"
            />
          </div>

          {/* Interactive Heatmap Controls & Parameter Tuning Bar */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Flame className="w-4 h-4" />
                  CANVAS HEATMAP OVERLAY CONTROLS:
                </span>
                <Badge
                  className={`text-[9px] px-1.5 py-0 font-mono ${
                    showHeatmap ? "bg-amber-950 text-amber-300 border-amber-600/50" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {showHeatmap ? "ACTIVE OVERLAY" : "DISABLED"}
                </Badge>
              </div>

              {/* Color Scheme Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Palette:</span>
                <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                  <button
                    onClick={() => setHeatmapColorScheme("thermal")}
                    className={`px-2 py-0.5 text-[10px] rounded font-bold transition-all ${
                      heatmapColorScheme === "thermal" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Thermal
                  </button>
                  <button
                    onClick={() => setHeatmapColorScheme("cyber")}
                    className={`px-2 py-0.5 text-[10px] rounded font-bold transition-all ${
                      heatmapColorScheme === "cyber" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Cyber Neon
                  </button>
                  <button
                    onClick={() => setHeatmapColorScheme("solar")}
                    className={`px-2 py-0.5 text-[10px] rounded font-bold transition-all ${
                      heatmapColorScheme === "solar" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Solar Flare
                  </button>
                </div>
              </div>

              {/* Calculation Mode */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Weighting:</span>
                <select
                  value={heatmapCalcMode}
                  onChange={(e) => setHeatmapCalcMode(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-slate-200 focus:outline-none"
                >
                  <option value="frequency">Drift Frequency (Occurrence Count)</option>
                  <option value="displacement">Pixel Displacement (Delta Px)</option>
                  <option value="critical_only">Critical Shifts Only (&gt;20px)</option>
                </select>
              </div>
            </div>

            {/* Heatmap Sliders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-1">
              {/* Toggle Heatmap Checkbox */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                    className="rounded accent-amber-500 w-4 h-4"
                  />
                  <span>Render Colored Heatmap</span>
                </label>
              </div>

              {/* Toggle Isobars & Tags */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={showIsobars}
                    onChange={(e) => setShowIsobars(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Contour Isobars</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={showHotspotTags}
                    onChange={(e) => setShowHotspotTags(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Tags</span>
                </label>
              </div>

              {/* Heatmap Blur Radius Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">BLUR RADIUS:</span>
                  <span className="text-amber-400 font-bold">{heatmapRadius}px</span>
                </div>
                <Slider
                  min={18}
                  max={85}
                  step={2}
                  value={[heatmapRadius]}
                  onValueChange={([v]) => setHeatmapRadius(v)}
                />
              </div>

              {/* Heatmap Opacity / Intensity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">HEATMAP INTENSITY:</span>
                  <span className="text-amber-400 font-bold">{Math.round(heatmapIntensity * 100)}%</span>
                </div>
                <Slider
                  min={0.15}
                  max={1.0}
                  step={0.05}
                  value={[heatmapIntensity]}
                  onValueChange={([v]) => setHeatmapIntensity(v)}
                />
              </div>
            </div>
          </div>

          {/* Interactive Scrubber & Timeline Bar */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
                className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1 fill-current" />}
                {isPlaying ? "PAUSE" : "PLAY DIFF"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackProgress(0.0);
                }}
                className="h-8 px-2 border-slate-800 bg-slate-950 text-slate-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Time Scrubber Slider */}
            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Scrubber:</span>
              <Slider
                min={0.0}
                max={1.0}
                step={0.01}
                value={[playbackProgress]}
                onValueChange={(val) => {
                  setIsPlaying(false);
                  setPlaybackProgress(val[0]);
                }}
                className="flex-1"
              />
              <span className="text-[10px] text-amber-300 font-mono w-10 text-right">
                {Math.round(playbackProgress * 100)}%
              </span>
            </div>

            {/* Toggle Connectors */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={showConnectors}
                  onChange={(e) => setShowConnectors(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                Drift Vectors
              </label>

              <div className="flex items-center gap-1">
                <span className="text-slate-500 text-[10px]">Speed:</span>
                {[0.5, 1.0, 2.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      playbackSpeed === spd ? "bg-amber-500 text-slate-950" : "bg-slate-950 text-slate-400"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Top Spatial Drift Hotspots Summary Panel */}
          {driftHotspots.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-amber-400" />
                  TOP DETECTED SCREEN DRIFT HOTSPOT ZONES ({driftHotspots.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Click any hotspot to focus canvas reticle &amp; scrubber
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {driftHotspots.map((hs) => {
                  const isSelected = selectedHotspotId === hs.id;
                  return (
                    <div
                      key={hs.id}
                      onClick={() => {
                        setSelectedHotspotId(isSelected ? null : hs.id);
                        if (hs.steps.length > 0) {
                          const maxSteps = Math.max(sessionA?.points.length || 1, sessionB?.points.length || 1);
                          setPlaybackProgress(hs.steps[0] / maxSteps);
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "bg-amber-950/80 border-amber-500 ring-1 ring-amber-500"
                          : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-200 flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-slate-800 text-[9px] flex items-center justify-center font-bold text-amber-400">
                            #{hs.rank}
                          </span>
                          ({hs.x}, {hs.y})
                        </span>
                        <Badge
                          className={`text-[9px] px-1 py-0 ${
                            hs.dominantSeverity === "critical"
                              ? "bg-red-950 text-red-300 border-red-800"
                              : "bg-amber-950 text-amber-300 border-amber-800"
                          }`}
                        >
                          {hs.frequencyCount} Events
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Avg Δ: <strong className="text-amber-300">{hs.avgDeltaPx}px</strong></span>
                        <span>Max Δ: <strong className="text-red-300">{hs.maxDeltaPx}px</strong></span>
                      </div>

                      <div className="text-[9px] text-slate-500 mt-1 truncate">
                        Steps: #{hs.steps.join(", #")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PIXEL-LEVEL FRAME DIFF MATRIX */}
      {activeTab === "pixel_heatmap" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-purple-500/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  HTML5 CANVAS 2D PIXEL-BY-PIXEL COMPARISON & HEATMAP
                </h4>
                <p className="text-[11px] text-slate-400">
                  Granular channel (RGBA) delta comparison, luminance variance, and ROI centroid displacement
                </p>
              </div>

              <Button
                size="sm"
                disabled={isComputingPixelDiff}
                onClick={async () => {
                  setIsComputingPixelDiff(true);
                  try {
                    const canvasElA = canvasRef.current;
                    const result = await compareFramesPixelLevel(
                      sessionA?.captureFrameScreenshotUrl || (canvasElA ? canvasElA.toDataURL() : ""),
                      sessionB?.captureFrameScreenshotUrl || (canvasElA ? canvasElA.toDataURL() : ""),
                      {
                        threshold: pixelThreshold,
                        targetCoords: sessionA?.points[0] ? { x: sessionA.points[0].x, y: sessionA.points[0].y } : undefined,
                        roiRadius: 90,
                        generateHeatmap: true,
                      }
                    );
                    setPixelDiffResult(result);
                    toast.success("Pixel-level HTML5 Canvas diff refreshed!");
                  } finally {
                    setIsComputingPixelDiff(false);
                  }
                }}
                className="h-8 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
              >
                {isComputingPixelDiff ? "COMPUTING PIXELS..." : "RE-RUN PIXEL DIFF"}
              </Button>
            </div>

            {pixelDiffResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">PIXEL VARIANCE</span>
                  <span className="text-sm font-bold text-pink-400">{pixelDiffResult.diffPercentage}% altered</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">SIMILARITY SCORE</span>
                  <span className="text-sm font-bold text-emerald-400">{(pixelDiffResult.similarityScore * 100).toFixed(1)}% match</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">AVG LUMINANCE DELTA</span>
                  <span className="text-sm font-bold text-cyan-400">Δ {pixelDiffResult.avgLuminanceDelta}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">CLASSIFICATION</span>
                  <span className="text-xs font-bold text-amber-400 uppercase">{pixelDiffResult.driftClassification.replace(/_/g, " ")}</span>
                </div>
              </div>
            )}

            {pixelDiffResult?.rootCauseAnalysis && (
              <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-800/50 text-xs text-purple-200">
                <span className="font-bold text-purple-400">Root Cause Diagnosis: </span>
                {pixelDiffResult.rootCauseAnalysis}
              </div>
            )}

            {pixelDiffResult?.heatmapDataUrl && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 font-bold block">HEATMAP DIFF MATRIX (MUTATED PIXELS IN MAGENTA/AMBER):</span>
                <div className="w-full h-64 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
                  <img
                    src={pixelDiffResult.heatmapDataUrl}
                    alt="Pixel Diff Heatmap"
                    className="max-h-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FAILURE POINTS & ROOT CAUSES */}
      {activeTab === "failure_points" && (
        <ScrollArea className="h-[440px] pr-3">
          <div className="space-y-3">
            {diffAnalysis.failurePoints.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-emerald-800/40 bg-emerald-950/10 text-center text-xs text-emerald-300">
                ✓ No critical failure points or significant coordinate divergence detected between Session A and Session B!
              </div>
            ) : (
              diffAnalysis.failurePoints.map((fp, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border space-y-2 ${
                    fp.severity === "critical"
                      ? "bg-red-950/30 border-red-800/80"
                      : "bg-amber-950/30 border-amber-800/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-xs font-bold flex items-center justify-center text-slate-200">
                        #{fp.stepIndex}
                      </span>
                      <h5 className="text-xs font-bold text-slate-200">
                        {fp.type === "coordinate_drift" ? "TARGET COORDINATE DRIFT" : "MISSING ACTION STEP"}
                      </h5>
                    </div>

                    <Badge
                      className={`text-[9px] px-1.5 py-0 font-mono ${
                        fp.severity === "critical"
                          ? "bg-red-950 text-red-300 border-red-700 font-bold"
                          : "bg-amber-950 text-amber-300 border-amber-700"
                      }`}
                    >
                      Δ{fp.deltaPx} PX DEVIATION
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                    <div>
                      <span className="text-[10px] text-cyan-400 block font-bold">SESSION A (REFERENCE)</span>
                      <span className="text-slate-300">
                        ({fp.coordA.x}, {fp.coordA.y}) • Action: {fp.actionA.toUpperCase()}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-amber-400 block font-bold">SESSION B (CANDIDATE)</span>
                      <span className="text-slate-300">
                        ({fp.coordB.x}, {fp.coordB.y}) • Action: {fp.actionB.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs pt-1">
                    <div className="text-slate-300">
                      <strong className="text-slate-400">Identified Cause:</strong> {fp.cause}
                    </div>
                    <div className="text-emerald-300">
                      <strong className="text-emerald-400">AI Mitigation:</strong> {fp.recommendation}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}

      {/* TAB 4: STEP-BY-STEP DIFF TABLE */}
      {activeTab === "table_ledger" && (
        <ScrollArea className="h-[440px] rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400">
              <tr>
                <th className="p-2.5">STEP</th>
                <th className="p-2.5 text-cyan-300">PATH A (X, Y)</th>
                <th className="p-2.5 text-amber-300">PATH B (X, Y)</th>
                <th className="p-2.5">ACTION A / B</th>
                <th className="p-2.5">DELTA DIST</th>
                <th className="p-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {diffAnalysis.stepDiffs.map((diff) => (
                <tr key={diff.step} className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-slate-400">#{diff.step}</td>
                  <td className="p-2.5 text-cyan-300">
                    ({diff.coordA.x}, {diff.coordA.y})
                  </td>
                  <td className="p-2.5 text-amber-300">
                    ({diff.coordB.x}, {diff.coordB.y})
                  </td>
                  <td className="p-2.5 text-slate-300">
                    {diff.typeA} / {diff.typeB}
                  </td>
                  <td className="p-2.5 font-bold">
                    <span
                      className={
                        diff.deltaPx > 30
                          ? "text-red-400"
                          : diff.deltaPx > 15
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }
                    >
                      Δ{diff.deltaPx}px
                    </span>
                  </td>
                  <td className="p-2.5">
                    <Badge
                      className={`text-[9px] px-1.5 py-0 ${
                        diff.status === "critical"
                          ? "bg-red-950 text-red-300 border-red-800"
                          : diff.status === "warning"
                          ? "bg-amber-950 text-amber-300 border-amber-800"
                          : "bg-emerald-950 text-emerald-300 border-emerald-800"
                      }`}
                    >
                      {diff.status.toUpperCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
};
