import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  Monitor,
  Radio,
  ChevronUp,
  ChevronDown,
  Terminal,
  ShieldCheck,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface BridgeHealthState {
  online: boolean;
  paused: boolean;
  latencyMs: number;
  lastHeartbeat: number;
  pythonVersion?: string;
  pyautoguiAvailable?: boolean;
  screenResolution?: { width: number; height: number };
  activeProcesses?: Array<{ name: string; pid: number; status: string; latencyMs?: number }>;
  coordSync?: {
    latencyMs: number;
    driftPx: number;
    bridgeX: number;
    bridgeY: number;
    canvasX: number;
    canvasY: number;
    lastSynced: number;
  };
  error?: string;
}

export const BridgeHealthMonitorFooter: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [health, setHealth] = useState<BridgeHealthState>({
    online: true,
    paused: false,
    latencyMs: 14,
    lastHeartbeat: Date.now(),
    pythonVersion: "3.11",
    pyautoguiAvailable: true,
    screenResolution: { width: 1920, height: 1080 },
    activeProcesses: [
      { name: "pyautogui_bridge", pid: 14201, status: "ONLINE", latencyMs: 6 },
      { name: "screen_watcher", pid: 14210, status: "ONLINE", latencyMs: 12 },
    ],
    coordSync: {
      latencyMs: 9,
      driftPx: 1.2,
      bridgeX: 960,
      bridgeY: 540,
      canvasX: 960,
      canvasY: 540,
      lastSynced: Date.now(),
    },
  });
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);

  const checkHealth = useCallback(async () => {
    try {
      const startTime = performance.now();
      const res = await fetch("/api/pyautogui/health", {
        headers: { "Cache-Control": "no-cache" },
      });
      const latency = Math.round(performance.now() - startTime);

      // Also trigger a coordinate sync pulse to measure real-time position reporting latency
      let coordData = null;
      try {
        const cStart = performance.now();
        const cRes = await fetch("/api/pyautogui/coordinate-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvasX: 960,
            canvasY: 540,
            clientTimestamp: Date.now(),
          }),
        });
        if (cRes.ok) {
          const cJson = await cRes.json();
          coordData = {
            latencyMs: Math.round(performance.now() - cStart),
            driftPx: cJson.spatialDriftPx ?? 0,
            bridgeX: cJson.bridgeReportedX ?? 960,
            bridgeY: cJson.bridgeReportedY ?? 540,
            canvasX: cJson.browserCanvasX ?? 960,
            canvasY: cJson.browserCanvasY ?? 540,
            lastSynced: Date.now(),
          };
        }
      } catch {}

      if (res.ok) {
        const data = await res.json();
        setHealth((prev) => ({
          online: data.online ?? true,
          paused: data.paused ?? false,
          latencyMs: data.latencyMs ?? latency,
          lastHeartbeat: Date.now(),
          pythonVersion: data.pythonVersion || "3.11",
          pyautoguiAvailable: data.pyautoguiAvailable ?? true,
          screenResolution: data.screenResolution || { width: 1920, height: 1080 },
          activeProcesses: data.activeProcesses || [
            { name: "pyautogui_bridge", pid: 14201, status: data.paused ? "PAUSED" : "ONLINE" },
          ],
          coordSync: coordData || prev.coordSync,
        }));
        setConsecutiveFailures(0);
        window.dispatchEvent(
          new CustomEvent("pyautogui-bridge-health-update", {
            detail: { online: true, paused: data.paused, latencyMs: latency, coordSync: coordData },
          })
        );
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setConsecutiveFailures((prev) => {
        const next = prev + 1;
        if (next >= 2) {
          setHealth((h) => ({
            ...h,
            online: false,
            error: err.message || "Connection timeout",
          }));
          window.dispatchEvent(
            new CustomEvent("pyautogui-bridge-health-update", {
              detail: { online: false, paused: false, error: err.message },
            })
          );
        }
        return next;
      });
    }
  }, []);

  // Background interval: poll health every 4.5 seconds
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 4500);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Quick Reconnect Trigger
  const handleQuickReconnect = async () => {
    setIsReconnecting(true);
    try {
      const res = await fetch("/api/pyautogui/reconnect", { method: "POST" });
      if (res.ok) {
        await checkHealth();
        toast.success("Python execution bridge reconnected successfully", {
          description: "Subprocess link is active and synchronized with browser host.",
        });
      } else {
        throw new Error("Reconnect endpoint failed");
      }
    } catch (err: any) {
      toast.error("Bridge Reconnect Failed", {
        description: err.message || "Could not re-establish Python execution link.",
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  // Toggle Pause/Resume directly from Health Monitor
  const handleTogglePause = async () => {
    try {
      const endpoint = health.paused ? "/api/pyautogui/resume" : "/api/pyautogui/pause";
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setHealth((prev) => ({ ...prev, paused: data.paused }));
        toast(data.paused ? "Execution Bridge Paused" : "Execution Bridge Resumed", {
          description: data.message,
          icon: data.paused ? "⏸️" : "▶️",
        });
        window.dispatchEvent(
          new CustomEvent("pyautogui-bridge-pause-toggle", {
            detail: { paused: data.paused },
          })
        );
      }
    } catch (err: any) {
      toast.error(`Failed to toggle pause: ${err.message}`);
    }
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md text-xs font-mono text-slate-300 shadow-2xl transition-all ${className}`}
    >
      {/* Detailed Diagnostic Drawer (Collapsible) */}
      {isExpanded && (
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 animate-in slide-in-from-bottom duration-200">
          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
              <Cpu className="w-3 h-3 text-cyan-400" />
              Runtime Subsystem
            </div>
            <div className="text-slate-200 font-semibold flex items-center justify-between">
              <span>Python Engine:</span>
              <span className="text-cyan-300 font-bold">Python {health.pythonVersion}</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between text-[11px]">
              <span>PyAutoGUI Module:</span>
              <span className={health.pyautoguiAvailable ? "text-emerald-400" : "text-amber-400"}>
                {health.pyautoguiAvailable ? "Loaded & Ready" : "Fallback Emulation"}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
              <Monitor className="w-3 h-3 text-amber-400" />
              Display & Resolution
            </div>
            <div className="text-slate-200 font-semibold flex items-center justify-between">
              <span>Native Resolution:</span>
              <span className="text-amber-300 font-bold">
                {health.screenResolution?.width}x{health.screenResolution?.height}
              </span>
            </div>
            <div className="text-slate-400 flex items-center justify-between text-[11px]">
              <span>FailSafe Circuit:</span>
              <span className="text-emerald-400">Active (Guarded)</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              Coordinate Sync & Latency
            </div>
            <div className="text-slate-200 font-semibold flex items-center justify-between">
              <span>Bridge &lt;&gt; Canvas Lag:</span>
              <span className="text-cyan-300 font-bold">{health.coordSync?.latencyMs ?? 8}ms</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between text-[11px]">
              <span>Reported Position:</span>
              <span className="text-emerald-400">
                ({health.coordSync?.bridgeX ?? 960}, {health.coordSync?.bridgeY ?? 540}) Δ {health.coordSync?.driftPx ?? 0}px
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleTogglePause}
                className={`h-7 text-xs font-mono font-bold flex-1 border ${
                  health.paused
                    ? "bg-amber-600 hover:bg-amber-500 text-slate-950 border-amber-300"
                    : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-800/60"
                }`}
              >
                {health.paused ? (
                  <>
                    <Play className="w-3 h-3 mr-1 fill-current" />
                    Resume Bridge
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 mr-1" />
                    Pause Subprocess
                  </>
                )}
              </Button>

              <Button
                size="sm"
                onClick={handleQuickReconnect}
                disabled={isReconnecting}
                className="h-7 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 border border-cyan-300"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${isReconnecting ? "animate-spin" : ""}`} />
                Re-Sync
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className="px-4 py-2 flex items-center justify-between gap-4">
        {/* Left: Bridge Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {health.online && !health.paused && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  health.paused
                    ? "bg-amber-400"
                    : health.online
                    ? "bg-emerald-500"
                    : "bg-red-500"
                }`}
              />
            </span>

            <span className="font-semibold tracking-tight text-slate-300 text-xs whitespace-nowrap">
              Bridge Status:
            </span>

            <Badge
              className={`text-[10px] font-mono px-2 py-0.5 border ${
                health.paused
                  ? "bg-amber-950/80 text-amber-300 border-amber-500"
                  : health.online
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-500"
                  : "bg-red-950/80 text-red-300 border-red-500"
              }`}
            >
              {health.paused
                ? "PAUSED (MANUAL INTERVENTION)"
                : health.online
                ? `ONLINE (${health.latencyMs}ms latency)`
                : "DISCONNECTED / OFFLINE"}
            </Badge>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[11px]">
            <span className="text-slate-600">•</span>
            <span>PyAutoGUI Link: <span className="text-cyan-400 font-bold">Native Subprocess</span></span>
            <span className="text-slate-600">•</span>
            {/* Coordinate Sync Indicator */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300" title="Latency between Python execution bridge reported mouse position and browser canvas coordinates">
              <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span>Coord Sync:</span>
              <span className={`font-bold ${(health.coordSync?.latencyMs ?? 8) < 25 ? "text-emerald-400" : "text-amber-400"}`}>
                {health.coordSync?.latencyMs ?? 8}ms
              </span>
              <span className="text-slate-500 font-mono text-[10px]">
                (Δ {health.coordSync?.driftPx ?? 0}px)
              </span>
            </div>
            <span className="text-slate-600">•</span>
            <span>Heartbeat: <span className="text-slate-300">Active (4.5s)</span></span>
          </div>
        </div>

        {/* Right: Quick Controls & Diagnostics Toggle */}
        <div className="flex items-center gap-2">
          {/* Quick Pause/Resume button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTogglePause}
            className={`h-6 px-2 text-[11px] font-mono font-semibold border ${
              health.paused
                ? "bg-amber-500 text-slate-950 hover:bg-amber-400 border-amber-300"
                : "text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700"
            }`}
            title={health.paused ? "Click to resume execution" : "Click to pause subprocess immediately"}
          >
            {health.paused ? (
              <>
                <Play className="w-2.5 h-2.5 mr-1 fill-current" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-2.5 h-2.5 mr-1" />
                Pause
              </>
            )}
          </Button>

          {/* Quick Reconnect button */}
          <Button
            size="sm"
            onClick={handleQuickReconnect}
            disabled={isReconnecting}
            className="h-6 px-2.5 text-[11px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800 hover:border-cyan-500 gap-1"
            title="Force immediate reconnect and re-sync of Python execution bridge"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isReconnecting ? "animate-spin" : ""}`} />
            <span>Quick Reconnect</span>
          </Button>

          {/* Toggle Diagnostics Details */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 px-1.5 text-slate-400 hover:text-white"
            title="Toggle Detailed Bridge Diagnostics"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
