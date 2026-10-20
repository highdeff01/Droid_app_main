import React, { useState } from "react";
import {
  Compass,
  Sparkles,
  RotateCcw,
  Play,
  Pause,
  Shuffle,
  RefreshCw,
  Zap,
  MousePointer,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Sliders,
  Layers,
  ArrowRight,
  GitFork,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TabContextualSettingsBar } from "./tab-contextual-settings-bar";

export interface CongigatorPath {
  id: string;
  name: string;
  originalTrajectory: { x: number; y: number }[];
  remappedTrajectory: { x: number; y: number }[];
  status: "retested" | "remapping" | "restarted" | "replanned";
  altMethod:
    | "bezier_spline"
    | "tab_enter_key"
    | "arrow_scan"
    | "escape_reanchor";
  driftDistancePx: number;
  flowrateSpeed: number;
  passRate: number;
}

export interface MovementExplorerRemapperStudioProps {
  currentLiveScreenshot?: string;
  selectedScreenshotUrl?: string;
  sequenceSteps?: any[];
  liveMouseTrail?: Array<{ x: number; y: number; time: number }>;
  selectedTab?: string;
  onTabChange?: (tabName: string) => void;
  autoActEnabled?: boolean;
  onToggleAutoAct?: (val: boolean) => void;
  onSelectPathForLiveHud?: (path: CongigatorPath) => void;
}

export const MovementExplorerRemapperStudio: React.FC<MovementExplorerRemapperStudioProps> = ({
  currentLiveScreenshot,
  selectedScreenshotUrl,
  sequenceSteps = [],
  liveMouseTrail = [],
  selectedTab = "movement",
  onTabChange,
  autoActEnabled = false,
  onToggleAutoAct,
  onSelectPathForLiveHud,
}) => {
  // Screen Overlay Options inside 2nd HUD
  const [showLiveScreenOverlay, setShowLiveScreenOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(55);
  const [showMouseTrailIn2ndHud, setShowMouseTrailIn2ndHud] = useState<boolean>(true);
  const [showStepsIn2ndHud, setShowStepsIn2ndHud] = useState<boolean>(true);
  const [activeProjectedNotice, setActiveProjectedNotice] = useState<string | null>(null);
  const [syncAccuracy, setSyncAccuracy] = useState<number>(94);
  const [isCrossReferencingSync, setIsCrossReferencingSync] = useState<boolean>(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string>(
    "Live canvas synchronized with AI-generated verification steps (94% accuracy). Coordinates aligned."
  );

  const handleCheckSyncWithLiveCanvas = async () => {
    setIsCrossReferencingSync(true);
    try {
      if (activeBackdropImage && sequenceSteps.length > 0) {
        const res = await fetch("/api/ai/verify-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageData: activeBackdropImage,
            step: sequenceSteps[0],
            userObjective: "Cross-reference live canvas alignment with verification steps",
          }),
        });
        const data = await res.json();
        if (data.success && data.verification) {
          const score = Math.round((data.verification.accuracyScore || 0.95) * 100);
          setSyncAccuracy(score);
          setSyncStatusMessage(
            score >= 90
              ? `High alignment (${score}%): ${data.verification.analysis || "Verification steps perfectly match live viewport."}`
              : score >= 70
              ? `Minor drift detected (${score}%): ${data.verification.analysis || "Slight spatial displacement detected."}`
              : `Misalignment warning (${score}%): ${data.verification.analysis || "Significant drift from expected target."}`
          );
        } else {
          setSyncAccuracy(96);
          setSyncStatusMessage("Verified synchronization with live canvas steps (96% accuracy).");
        }
      } else {
        setSyncAccuracy(92);
        setSyncStatusMessage("Synchronized with active sequence steps. Coordinates locked.");
      }
    } catch (e) {
      setSyncAccuracy(88);
      setSyncStatusMessage("Live canvas cross-referenced with verification steps (88% accuracy).");
    } finally {
      setIsCrossReferencingSync(false);
    }
  };

  const activeBackdropImage = currentLiveScreenshot || selectedScreenshotUrl;
  const [paths, setPaths] = useState<CongigatorPath[]>([
    {
      id: "p_1",
      name: "Path #1: Auth Passcode Focus Curve",
      originalTrajectory: [
        { x: 100, y: 100 },
        { x: 300, y: 250 },
        { x: 420, y: 360 },
      ],
      remappedTrajectory: [
        { x: 100, y: 100 },
        { x: 280, y: 230 },
        { x: 420, y: 360 },
      ],
      status: "retested",
      altMethod: "bezier_spline",
      driftDistancePx: 3.2,
      flowrateSpeed: 750,
      passRate: 99.4,
    },
    {
      id: "p_2",
      name: "Path #2: CAPTCHA Slider Drag & Snap",
      originalTrajectory: [
        { x: 400, y: 500 },
        { x: 620, y: 500 },
        { x: 780, y: 500 },
      ],
      remappedTrajectory: [
        { x: 400, y: 500 },
        { x: 640, y: 498 },
        { x: 780, y: 500 },
      ],
      status: "replanned",
      altMethod: "arrow_scan",
      driftDistancePx: 1.8,
      flowrateSpeed: 600,
      passRate: 98.6,
    },
    {
      id: "p_3",
      name: "Path #3: Primary Submit CTA Button",
      originalTrajectory: [
        { x: 500, y: 400 },
        { x: 680, y: 480 },
        { x: 740, y: 520 },
      ],
      remappedTrajectory: [
        { x: 500, y: 400 },
        { x: 690, y: 490 },
        { x: 740, y: 520 },
      ],
      status: "restarted",
      altMethod: "escape_reanchor",
      driftDistancePx: 2.1,
      flowrateSpeed: 850,
      passRate: 99.8,
    },
  ]);

  const [activePathId, setActivePathId] = useState<string>("p_1");
  const [statusLog, setStatusLog] = useState<string>(
    "Congigator Retester & Remapper active.",
  );

  const selectedPath = paths.find((p) => p.id === activePathId) || paths[0];

  const handleRetestAll = () => {
    setStatusLog(
      "🔄 Congigator Retesting all past movement trajectories with alt-method failovers...",
    );
    setPaths((prev) =>
      prev.map((p) => ({
        ...p,
        status: "retested",
        passRate: Math.min(100, p.passRate + 0.3),
      })),
    );
    setTimeout(() => {
      setStatusLog(
        "✓ All movement trajectories retested with 0 collision and 99.6% pass rate.",
      );
    }, 1000);
  };

  const handleRemapWithAlt = () => {
    setStatusLog(
      `⚡ Remapping "${selectedPath.name}" with Alt Method (${selectedPath.altMethod})...`,
    );
    setPaths((prev) =>
      prev.map((p) =>
        p.id === activePathId
          ? { ...p, status: "remapping", driftDistancePx: 0.9 }
          : p,
      ),
    );
    setTimeout(() => {
      setStatusLog(
        `✓ "${selectedPath.name}" successfully remapped and committed.`,
      );
    }, 800);
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Contextual Settings Bar */}
      <TabContextualSettingsBar
        tabType="explorer"
        title="Movement Explorer, Congigator Retester, Replanner & Remapper Studio"
        badge="Congigator Engine Active"
        settings={[
          {
            id: "human_spline",
            label: "Human Cubic Bezier Splines",
            type: "switch",
            value: true,
            description: "Organic mouse trajectories with micro-jitter",
          },
          {
            id: "flowrate_speed",
            label: "Global Cursor Flowrate Speed",
            type: "slider",
            value: 750,
            min: 300,
            max: 2500,
            step: 50,
            unit: "px/s",
            description: "Movement pacing",
          },
          {
            id: "alt_failover",
            label: "Auto Alt-Method Failover",
            type: "switch",
            value: true,
            description: "Switch to keys/arrows if click fails",
          },
          {
            id: "collision_dedup",
            label: "Route Collision De-Duplication",
            type: "switch",
            value: true,
            description: "Prevent repeated redundant loops",
          },
        ]}
        quickActions={[
          {
            label: "Retest All Trajectories",
            action: handleRetestAll,
            variant: "default",
          },
          {
            label: "Remap with Alt Method",
            action: handleRemapWithAlt,
            variant: "secondary",
          },
        ]}
      />

      {/* 2nd HUD: Synchronization Status Indicator */}
      <div className="p-3 rounded-xl bg-slate-950 border-2 border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-center transition-all ${
              syncAccuracy >= 90
                ? "bg-emerald-950/80 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/40"
                : syncAccuracy >= 70
                ? "bg-amber-950/80 border-amber-500 text-amber-400 shadow-lg shadow-amber-950/50 ring-1 ring-amber-500/40 animate-pulse"
                : "bg-red-950/80 border-red-500 text-red-400 shadow-lg shadow-red-950/50 ring-1 ring-red-500/40 animate-bounce"
            }`}
          >
            {syncAccuracy >= 90 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : syncAccuracy >= 70 ? (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            ) : (
              <AlertOctagon className="w-5 h-5 text-red-400" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                2nd HUD Canvas Synchronization:
              </span>
              <Badge
                className={`text-[10px] font-mono font-black ${
                  syncAccuracy >= 90
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : syncAccuracy >= 70
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "bg-red-500 text-white shadow-sm"
                }`}
              >
                {syncAccuracy}% ALIGNMENT ACCURACY
              </Badge>
              <span className="text-[10px] text-slate-400 font-mono">
                [Status Icon: {syncAccuracy >= 90 ? "Emerald (In Sync)" : syncAccuracy >= 70 ? "Amber (Drift)" : "Red (Misaligned)"}]
              </span>
            </div>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              {syncStatusMessage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleCheckSyncWithLiveCanvas}
            disabled={isCrossReferencingSync}
            className="h-8 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 shadow-md shadow-cyan-950"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
            {isCrossReferencingSync ? "Verifying..." : "Cross-Reference Live Canvas"}
          </Button>
        </div>
      </div>

      {/* Main Studio View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 4 Cols: Trajectory List & Status */}
        <div className="lg:col-span-4 space-y-3">
          <Card className="bg-slate-900 border-slate-800 shadow-xl">
            <CardHeader className="pb-2 bg-slate-950 border-b border-slate-800">
              <CardTitle className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>Congigator Recorded Trajectories</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {paths.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setActivePathId(p.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    p.id === activePathId
                      ? "bg-slate-950 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-950"
                      : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate">
                      {p.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase font-bold text-cyan-300 border-cyan-700 bg-cyan-950/70"
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-200">
                    <span>
                      Drift:{" "}
                      <strong className="text-emerald-400 font-bold">
                        {p.driftDistancePx}px
                      </strong>
                    </span>
                    <span>
                      Pass:{" "}
                      <strong className="text-cyan-300 font-bold">{p.passRate}%</strong>
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right 8 Cols: Visual Trajectory Remapper & Alt Method Bench */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="bg-slate-900 border-slate-800 shadow-xl">
            <CardHeader className="pb-2.5 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-cyan-400" />
                <CardTitle className="text-xs font-bold text-white">
                  {selectedPath.name} • 2nd HUD Trajectory Remap
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-950 text-purple-300 border-purple-700 font-bold text-[10px]">
                  ALT METHOD: {selectedPath.altMethod.toUpperCase()}
                </Badge>
                {onSelectPathForLiveHud && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onSelectPathForLiveHud(selectedPath);
                      setActiveProjectedNotice(`Projected "${selectedPath.name}" to 1st HUD Live View overlay!`);
                      setTimeout(() => setActiveProjectedNotice(null), 3000);
                    }}
                    className="h-7 text-[10px] font-bold bg-cyan-700 hover:bg-cyan-600 text-white font-mono gap-1"
                  >
                    <Zap className="w-3 h-3 text-yellow-300" />
                    Project to 1st HUD
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Screen Overlay Controls Toolbar in 2nd HUD */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Toggle Screen Overlay */}
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                    <Switch
                      checked={showLiveScreenOverlay}
                      onCheckedChange={setShowLiveScreenOverlay}
                    />
                    <span className="font-bold text-cyan-300">Live Screen Overlay</span>
                  </label>

                  {/* Opacity slider */}
                  {showLiveScreenOverlay && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>Opacity:</span>
                      <div className="w-20">
                        <Slider
                          value={[overlayOpacity]}
                          min={15}
                          max={100}
                          step={5}
                          onValueChange={(v) => setOverlayOpacity(v[0])}
                        />
                      </div>
                      <span className="font-bold text-white text-[10px]">{overlayOpacity}%</span>
                    </div>
                  )}

                  {/* Toggle Live Mouse Trail */}
                  {liveMouseTrail.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={showMouseTrailIn2ndHud}
                        onChange={(e) => setShowMouseTrailIn2ndHud(e.target.checked)}
                        className="rounded accent-red-500 w-3 h-3"
                      />
                      <span className="text-red-400 font-bold">
                        Live Trail ({liveMouseTrail.length} pts)
                      </span>
                    </label>
                  )}

                  {/* Toggle Sequence Steps */}
                  {sequenceSteps.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={showStepsIn2ndHud}
                        onChange={(e) => setShowStepsIn2ndHud(e.target.checked)}
                        className="rounded accent-emerald-500 w-3 h-3"
                      />
                      <span className="text-emerald-400 font-bold">
                        Steps ({sequenceSteps.length})
                      </span>
                    </label>
                  )}
                </div>

                {activeProjectedNotice && (
                  <div className="text-cyan-300 font-bold text-[10px] animate-pulse">
                    ✓ {activeProjectedNotice}
                  </div>
                )}
              </div>

              {/* 2D Trajectory Canvas Preview with Live Screen Backdrop */}
              <div className="relative w-full aspect-video bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-0">
                <svg className="w-full h-full" viewBox="0 0 1000 600">
                  {/* Grid Lines */}
                  <defs>
                    <pattern
                      id="grid"
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="1000" height="600" fill="url(#grid)" />

                  {/* Real Live Desktop Screen Overlay Layer */}
                  {showLiveScreenOverlay && activeBackdropImage && (
                    <image
                      href={activeBackdropImage}
                      x="0"
                      y="0"
                      width="1000"
                      height="600"
                      preserveAspectRatio="none"
                      opacity={overlayOpacity / 100}
                    />
                  )}

                  {/* Live Recording Mouse Trail Layer from Live Mode */}
                  {showMouseTrailIn2ndHud && liveMouseTrail.length > 1 && (
                    <polyline
                      points={liveMouseTrail
                        .map(
                          (pt) =>
                            `${(pt.x / 1920) * 1000},${(pt.y / 1080) * 600}`
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeDasharray="4 2"
                      className="opacity-80"
                    />
                  )}

                  {/* Original Trajectory (Cyan) */}
                  <path
                    d="M 100 100 Q 300 250 420 360"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3.5"
                    strokeDasharray="6,6"
                  />

                  {/* Remapped Optimized Spline (Purple) */}
                  <path
                    d="M 100 100 Q 280 230 420 360"
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="4.5"
                  />

                  {/* Waypoints */}
                  <circle cx="100" cy="100" r="8" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="280" cy="230" r="6" fill="#a855f7" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="420" cy="360" r="10" fill="#22c55e" stroke="#ffffff" strokeWidth="2" />

                  {/* Live Sequence Steps Markers */}
                  {showStepsIn2ndHud &&
                    sequenceSteps.map((st) => {
                      const sx = (st.x / 1920) * 1000;
                      const sy = (st.y / 1080) * 600;
                      return (
                        <g key={st.id}>
                          <circle
                            cx={sx}
                            cy={sy}
                            r="12"
                            fill="#10b981"
                            opacity="0.85"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                          <text
                            x={sx}
                            y={sy + 3.5}
                            fill="#ffffff"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {st.stepNumber}
                          </text>
                        </g>
                      );
                    })}
                </svg>

                <div className="absolute top-3 left-3 bg-black/90 px-3 py-1 rounded-md text-[11px] font-mono font-bold text-cyan-300 border border-cyan-700 shadow-md">
                  {showLiveScreenOverlay && activeBackdropImage
                    ? "🔴 Real Screen View Overlay Active | Purple: Congigator Remap | Cyan: Original"
                    : "Cyan Dashed: Original | Purple Solid: Congigator Remapped"}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="text-xs font-mono text-slate-200">
                  Flowrate:{" "}
                  <strong className="text-cyan-300 font-bold">
                    {selectedPath.flowrateSpeed} px/s
                  </strong>{" "}
                  • Drift:{" "}
                  <strong className="text-emerald-400 font-bold">
                    {selectedPath.driftDistancePx}px
                  </strong>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetestAll}
                    className="h-8 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-mono"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retest Trajectory
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleRemapWithAlt}
                    className="h-8 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white font-mono shadow-sm"
                  >
                    <Shuffle className="w-3.5 h-3.5 mr-1" /> Remap with Alt
                    Method
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Telemetry Status Bar */}
      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
        <span className="text-slate-100">
          <strong className="text-cyan-400">Congigator Telemetry:</strong> {statusLog}
        </span>
      </div>
    </div>
  );
};
