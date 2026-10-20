import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Crosshair,
  Target,
  CheckCircle2,
  Sparkles,
  Zap,
  RotateCcw,
  Save,
  MousePointer,
  Activity,
  Sliders,
  Maximize2,
  Cpu,
  Monitor,
  Smartphone,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  CoordinateCalibrationProfile,
  DEFAULT_CALIBRATION_PROFILE,
  getStoredCalibration,
  saveStoredCalibration,
  calibrateCoordinates,
} from "@/lib/coordinate-calibration";

interface CoordinateCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CalibrationTarget {
  id: number;
  label: string;
  expectedNormX: number;
  expectedNormY: number;
  clickedNormX?: number;
  clickedNormY?: number;
  driftPx?: number;
}

export const CoordinateCalibrationModal: React.FC<CoordinateCalibrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [profile, setProfile] = useState<CoordinateCalibrationProfile>(getStoredCalibration);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isGuidedMode, setIsGuidedMode] = useState<boolean>(true);
  const [hardwareTestActive, setHardwareTestActive] = useState<boolean>(true);

  // Calibration test targets (5 Points: TL, TR, Center, BL, BR)
  const [targets, setTargets] = useState<CalibrationTarget[]>([
    { id: 1, label: "Top-Left (10%, 10%)", expectedNormX: 0.1, expectedNormY: 0.1 },
    { id: 2, label: "Top-Right (90%, 10%)", expectedNormX: 0.9, expectedNormY: 0.1 },
    { id: 3, label: "Center (50%, 50%)", expectedNormX: 0.5, expectedNormY: 0.5 },
    { id: 4, label: "Bottom-Left (10%, 90%)", expectedNormX: 0.1, expectedNormY: 0.9 },
    { id: 5, label: "Bottom-Right (90%, 90%)", expectedNormX: 0.9, expectedNormY: 0.9 },
  ]);

  const [testClicks, setTestClicks] = useState<
    Array<{ id: string; rawX: number; rawY: number; calX: number; calY: number; drift: number }>
  >([]);

  const arenaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProfile(getStoredCalibration());
      setActiveStepIndex(0);
      setTestClicks([]);
    }
  }, [isOpen]);

  // Handle click on calibration arena
  const handleArenaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    const raw1080X = Math.round(normX * 1920);
    const raw1080Y = Math.round(normY * 1080);

    const cal = calibrateCoordinates(raw1080X, raw1080Y, profile);

    // If in guided 5-point calibration mode
    if (isGuidedMode && activeStepIndex < targets.length) {
      const currentTarget = targets[activeStepIndex];
      const targetScreenX = currentTarget.expectedNormX * 1920;
      const targetScreenY = currentTarget.expectedNormY * 1080;

      const deltaX = raw1080X - targetScreenX;
      const deltaY = raw1080Y - targetScreenY;
      const drift = Math.round(Math.sqrt(deltaX * deltaX + deltaY * deltaY) * 10) / 10;

      const updatedTargets = [...targets];
      updatedTargets[activeStepIndex] = {
        ...currentTarget,
        clickedNormX: normX,
        clickedNormY: normY,
        driftPx: drift,
      };
      setTargets(updatedTargets);

      // Auto-compute average drift compensation
      if (activeStepIndex === targets.length - 1) {
        // Final point clicked: compute average offsets
        const completed = updatedTargets.filter((t) => t.clickedNormX !== undefined);
        const avgDeltaX = completed.reduce((acc, t) => acc + ((t.clickedNormX! - t.expectedNormX) * 1920), 0) / completed.length;
        const avgDeltaY = completed.reduce((acc, t) => acc + ((t.clickedNormY! - t.expectedNormY) * 1080), 0) / completed.length;

        const newProfile = {
          ...profile,
          offsetX: -Math.round(avgDeltaX),
          offsetY: -Math.round(avgDeltaY),
        };
        setProfile(newProfile);
        saveStoredCalibration(newProfile);
        toast.success(`🎯 5-Point Calibration Complete! Drift compensated by Δ(${newProfile.offsetX}px, ${newProfile.offsetY}px)`);
        setActiveStepIndex(targets.length);
      } else {
        setActiveStepIndex((prev) => prev + 1);
        toast.info(`Point #${activeStepIndex + 1} recorded. Click Point #${activeStepIndex + 2}`);
      }
    }

    // Record test click
    const clickItem = {
      id: `clk_${Date.now()}`,
      rawX: raw1080X,
      rawY: raw1080Y,
      calX: cal.x,
      calY: cal.y,
      drift: cal.driftPx,
    };
    setTestClicks((prev) => [clickItem, ...prev.slice(0, 7)]);

    // Optional PyAutoGUI hardware test ping
    if (hardwareTestActive) {
      fetch("/api/pyautogui/interactive-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "click",
          x: cal.x,
          y: cal.y,
          deviceMode: "calibration_test",
        }),
      }).catch(() => {});
    }
  };

  // Auto-Calibrate 1-Click
  const handleAutoCalibrate = () => {
    const dpi = window.devicePixelRatio || 1.0;
    const autoProfile: CoordinateCalibrationProfile = {
      offsetX: 0,
      offsetY: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      dpiScale: dpi,
      jitterDamping: 1.2,
      aspectRatioMode: "16:9",
      screenWidth: window.screen.width || 1920,
      screenHeight: window.screen.height || 1080,
      lastCalibratedAt: Date.now(),
    };
    setProfile(autoProfile);
    saveStoredCalibration(autoProfile);
    toast.success(`⚡ Auto-Calibrated to display resolution ${autoProfile.screenWidth}×${autoProfile.screenHeight} @ ${dpi}x DPI!`);
  };

  // Save changes
  const handleSaveProfile = () => {
    saveStoredCalibration(profile);
    toast.success("✅ Mouse & Coordinate Calibration Profile Saved!");
    onClose();
  };

  // Reset to default
  const handleResetProfile = () => {
    setProfile(DEFAULT_CALIBRATION_PROFILE);
    saveStoredCalibration(DEFAULT_CALIBRATION_PROFILE);
    setActiveStepIndex(0);
    setTargets(targets.map((t) => ({ ...t, clickedNormX: undefined, clickedNormY: undefined, driftPx: undefined })));
    toast.info("Calibration reset to factory default (1920×1080 1:1)");
  };

  const currentTarget = activeStepIndex < targets.length ? targets[activeStepIndex] : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl bg-slate-950 border-slate-800 text-slate-100 font-mono shadow-2xl p-6">
        <DialogHeader className="pb-3 border-b border-slate-800 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-base font-bold text-cyan-400 flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-cyan-400" />
              <span>Mouse & Coordinate Drift Calibration</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-1">
              Precision alignment for PyAutoGUI, Android ADB touch, AI Vision clickpoints, and HiDPI scaling
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAutoCalibrate}
              className="h-8 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 shadow-md shadow-cyan-950"
            >
              <Sparkles className="w-3.5 h-3.5" /> 1-Click Auto Calibrate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetProfile}
              className="h-8 text-xs font-mono bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-300 gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          {/* Left 2 Cols: Interactive Calibration Target Arena */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-200">Interactive Target Arena</span>
                <Badge className="bg-slate-800 text-cyan-300 border-slate-700 text-[10px]">
                  {isGuidedMode && activeStepIndex < targets.length
                    ? `Click Point #${activeStepIndex + 1} (${currentTarget?.label})`
                    : "Live Test Mode Active"}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">Guided 5-Point:</span>
                <Switch checked={isGuidedMode} onCheckedChange={setIsGuidedMode} />
              </div>
            </div>

            {/* Clickable Canvas Arena */}
            <div
              ref={arenaRef}
              onClick={handleArenaClick}
              className="relative w-full h-80 bg-slate-900/90 rounded-xl border-2 border-slate-700 overflow-hidden cursor-crosshair select-none shadow-inner group"
            >
              {/* Background Cross Grid */}
              <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#38bdf8_1px,transparent_1px),linear-gradient(to_bottom,#38bdf8_1px,transparent_1px)] [background-size:40px_40px] pointer-events-none" />

              {/* Center Axes Lines */}
              <div className="absolute top-1/2 inset-x-0 h-px bg-cyan-500/30 pointer-events-none" />
              <div className="absolute left-1/2 inset-y-0 w-px bg-cyan-500/30 pointer-events-none" />

              {/* 5 Guided Target Crosshairs */}
              {targets.map((tgt, idx) => {
                const isCurrent = isGuidedMode && activeStepIndex === idx;
                const isDone = tgt.clickedNormX !== undefined;

                return (
                  <div
                    key={tgt.id}
                    style={{ left: `${tgt.expectedNormX * 100}%`, top: `${tgt.expectedNormY * 100}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center transition-all ${
                      isCurrent ? "scale-125 animate-pulse z-30" : "z-20"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shadow-lg ${
                        isDone
                          ? "bg-emerald-600 border-emerald-300 text-white"
                          : isCurrent
                          ? "bg-amber-500 border-white text-black ring-4 ring-amber-500/50"
                          : "bg-slate-800/80 border-slate-600 text-slate-300"
                      }`}
                    >
                      {isDone ? "✓" : tgt.id}
                    </div>
                    <span className="text-[9px] font-mono text-slate-300 bg-black/80 px-1 rounded mt-0.5 whitespace-nowrap">
                      {isDone && tgt.driftPx !== undefined ? `Δ ${tgt.driftPx}px` : tgt.label.split(" ")[0]}
                    </span>
                  </div>
                );
              })}

              {/* Recent Test Click Ripples */}
              {testClicks.map((clk) => {
                const normX = clk.rawX / 1920;
                const normY = clk.rawY / 1080;
                return (
                  <div
                    key={clk.id}
                    style={{ left: `${normX * 100}%`, top: `${normY * 100}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1 z-40"
                  >
                    <div className="w-4 h-4 rounded-full border-2 border-cyan-400 bg-cyan-500/40 animate-ping" />
                  </div>
                );
              })}

              {/* Arena Info Overlay */}
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/80 text-[10px] text-slate-300 border border-slate-800 pointer-events-none">
                Resolution: 1920×1080 | Offset: ({profile.offsetX}px, {profile.offsetY}px) | Scale: ({profile.scaleX}x, {profile.scaleY}x)
              </div>
            </div>

            {/* Test Clicks History Table */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-bold text-slate-300 text-[11px]">
                <span className="flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Real-Time Click Alignment Ledger</span>
                </span>
                <span className="text-emerald-400 text-[10px]">
                  {testClicks.length > 0
                    ? `Latest Drift: ${testClicks[0].drift}px (${testClicks[0].drift < 3 ? "PERFECT" : "ALIGNED"})`
                    : "Click arena above to test"}
                </span>
              </div>

              {testClicks.length === 0 ? (
                <p className="text-[10px] text-slate-500 py-1">
                  Click on the 5 calibration targets or anywhere on the arena to measure and compensate for mouse drift.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {testClicks.slice(0, 4).map((c) => (
                    <div key={c.id} className="p-1.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Raw: ({c.rawX}, {c.rawY})</span>
                      <span className="text-cyan-300 font-bold">→ Cal: ({c.calX}, {c.calY})</span>
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[9px] h-4">
                        Δ {c.drift}px
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Fine-Tuning & Multipliers */}
          <div className="space-y-4">
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Drift & Scale Modifiers</span>
                </span>
              </div>

              {/* Offset X Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Offset X (Horizontal):</span>
                  <span className="text-cyan-400 font-bold">{profile.offsetX} px</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setProfile((p) => ({ ...p, offsetX: p.offsetX - 1 }))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    -1
                  </button>
                  <Slider
                    value={[profile.offsetX]}
                    min={-50}
                    max={50}
                    step={1}
                    onValueChange={([val]) => setProfile((p) => ({ ...p, offsetX: val }))}
                    className="flex-1"
                  />
                  <button
                    onClick={() => setProfile((p) => ({ ...p, offsetX: p.offsetX + 1 }))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    +1
                  </button>
                </div>
              </div>

              {/* Offset Y Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Offset Y (Vertical):</span>
                  <span className="text-cyan-400 font-bold">{profile.offsetY} px</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setProfile((p) => ({ ...p, offsetY: p.offsetY - 1 }))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    -1
                  </button>
                  <Slider
                    value={[profile.offsetY]}
                    min={-50}
                    max={50}
                    step={1}
                    onValueChange={([val]) => setProfile((p) => ({ ...p, offsetY: val }))}
                    className="flex-1"
                  />
                  <button
                    onClick={() => setProfile((p) => ({ ...p, offsetY: p.offsetY + 1 }))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    +1
                  </button>
                </div>
              </div>

              {/* Scale Multiplier */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Scale Multiplier (X / Y):</span>
                  <span className="text-cyan-400 font-bold">{profile.scaleX.toFixed(2)}x</span>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[profile.scaleX * 100]}
                    min={80}
                    max={120}
                    step={1}
                    onValueChange={([val]) => setProfile((p) => ({ ...p, scaleX: val / 100, scaleY: val / 100 }))}
                  />
                </div>
              </div>

              {/* Display DPI Multiplier Preset Buttons */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-slate-300 font-bold block">Display DPI Scaling</span>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: "1.0x", val: 1.0 },
                    { label: "1.25x", val: 1.25 },
                    { label: "1.5x", val: 1.5 },
                    { label: "2.0x", val: 2.0 },
                  ].map((dpi) => (
                    <button
                      key={dpi.label}
                      onClick={() => setProfile((p) => ({ ...p, dpiScale: dpi.val }))}
                      className={`py-1 rounded text-[10px] font-bold border transition-all ${
                        profile.dpiScale === dpi.val
                          ? "bg-cyan-600 text-white border-cyan-400"
                          : "bg-slate-950 text-slate-400 hover:text-white border-slate-800"
                      }`}
                    >
                      {dpi.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hardware Test dispatch toggle */}
              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-200 font-bold block">PyAutoGUI Test Click</span>
                  <span className="text-[9px] text-slate-400">Ping hardware on calibration click</span>
                </div>
                <Switch checked={hardwareTestActive} onCheckedChange={setHardwareTestActive} />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSaveProfile}
                className="w-full h-10 text-xs font-mono font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-xl shadow-emerald-950 border border-emerald-400/40 gap-2"
              >
                <Save className="w-4 h-4" /> Save & Apply Calibration
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full h-8 text-xs font-mono bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-300"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
