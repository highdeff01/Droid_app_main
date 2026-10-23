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
import { useBackendStatus } from "@/hooks/use-backend-status";
import { BACKEND_UNREACHABLE_MESSAGE } from "@/lib/backend-status";
import {
  fetchBridgeHealth,
  runQuickReconnect,
  runTogglePause,
  syncBridgeCoordinates,
} from "@/lib/bridge-control";

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
  /** No JSON API answered (transport failure, non-JSON body, or the startup probe found no backend). */
  unreachable?: boolean;
}

/** Badge text: paused, online, unreachable (no API answered) or offline (the bridge itself reported down). */
export function bridgeStatusLabel(health: Pick<BridgeHealthState, "online" | "paused" | "latencyMs" | "unreachable">): string {
  if (health.paused) return "PAUSED (MANUAL INTERVENTION)";
  if (health.online) return `ONLINE (${health.latencyMs}ms latency)`;
  if (health.unreachable) return "UNREACHABLE";
  return "DISCONNECTED / OFFLINE";
}

export const BridgeHealthMonitorFooter: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [health, setHealth] = useState<BridgeHealthState>({
    online: false,
    paused: false,
    latencyMs: 0,
    lastHeartbeat: Date.now(),
    pythonVersion: undefined,
    pyautoguiAvailable: false,
    screenResolution: undefined,
    activeProcesses: [],
    coordSync: undefined,
  });
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);
  const backend = useBackendStatus();
  const backendUnreachable = backend.state === "unreachable";

  const markOffline = useCallback((error: string, unreachable: boolean) => {
    setConsecutiveFailures((prev) => {
      const next = prev + 1;
      // An unreachable API is definitive and reported at once; a transient bridge error after two misses.
      if (unreachable || next >= 2) {
        setHealth((h) => ({ ...h, online: false, unreachable, error }));
        window.dispatchEvent(
          new CustomEvent("pyautogui-bridge-health-update", {
            detail: { online: false, paused: false, error },
          })
        );
      }
      return next;
    });
  }, []);

  const checkHealth = useCallback(async () => {
    const startTime = performance.now();
    const result = await fetchBridgeHealth();
    const latency = Math.round(performance.now() - startTime);
    if (!result.ok) {
      markOffline(result.error ?? "Bridge health check failed", result.unreachable === true);
      return;
    }
    const data = result.value;
    const coordData = await syncBridgeCoordinates();
    setHealth((prev) => ({
      online: data.online,
      paused: data.paused,
      latencyMs: data.latencyMs ?? latency,
      lastHeartbeat: Date.now(),
      pythonVersion: data.pythonVersion,
      pyautoguiAvailable: data.pyautoguiAvailable,
      screenResolution: data.screenResolution,
      activeProcesses: data.activeProcesses,
      coordSync: coordData || prev.coordSync,
      error: data.error,
      unreachable: false,
    }));
    setConsecutiveFailures(0);
    window.dispatchEvent(
      new CustomEvent("pyautogui-bridge-health-update", {
        detail: { online: data.online, paused: data.paused, latencyMs: latency, coordSync: coordData, error: data.error },
      })
    );
  }, [markOffline]);

  // Background poll every 4.5 seconds; backs off while the startup probe finds no backend.
  useEffect(() => {
    if (backendUnreachable) {
      markOffline(BACKEND_UNREACHABLE_MESSAGE, true);
      return;
    }
    checkHealth();
    const interval = setInterval(checkHealth, 4500);
    return () => clearInterval(interval);
  }, [checkHealth, backendUnreachable, markOffline]);

  // Quick Reconnect Trigger: success only when the bridge is verified online.
  const handleQuickReconnect = async () => {
    setIsReconnecting(true);
    try {
      await runQuickReconnect();
      await checkHealth();
    } finally {
      setIsReconnecting(false);
    }
  };

  // Toggle Pause/Resume directly from Health Monitor
  const handleTogglePause = async () => {
    const paused = await runTogglePause(health.paused);
    if (paused === null) return;
    setHealth((prev) => ({ ...prev, paused }));
    window.dispatchEvent(
      new CustomEvent("pyautogui-bridge-pause-toggle", {
        detail: { paused },
      })
    );
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
              <span className="text-cyan-300 font-bold">{health.pythonVersion ? `Python ${health.pythonVersion}` : "Unavailable"}</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between text-[11px]">
              <span>PyAutoGUI Module:</span>
              <span className={health.pyautoguiAvailable ? "text-emerald-400" : "text-amber-400"}>
                {health.pyautoguiAvailable ? "Loaded & Ready" : "Unavailable – actions will not execute"}
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
                {health.screenResolution ? `${health.screenResolution.width}x${health.screenResolution.height}` : "Unknown"}
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
              <span className="text-cyan-300 font-bold">{health.coordSync ? `${health.coordSync.latencyMs}ms` : "n/a"}</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between text-[11px]">
              <span>Reported Position:</span>
              <span className="text-emerald-400">
                {health.coordSync
                  ? `(${health.coordSync.bridgeX}, ${health.coordSync.bridgeY}) Δ ${health.coordSync.driftPx}px`
                  : "Not measured"}
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
              title={health.online ? undefined : health.error}
            >
              {bridgeStatusLabel(health)}
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
              <span className={`font-bold ${health.coordSync && health.coordSync.latencyMs < 25 ? "text-emerald-400" : "text-amber-400"}`}>
                {health.coordSync ? `${health.coordSync.latencyMs}ms` : "n/a"}
              </span>
              <span className="text-slate-500 font-mono text-[10px]">
                {health.coordSync ? `(Δ ${health.coordSync.driftPx}px)` : ""}
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
