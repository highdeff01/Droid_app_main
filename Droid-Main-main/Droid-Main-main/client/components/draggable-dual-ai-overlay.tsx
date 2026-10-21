import React, { useState, useRef, useEffect } from "react";
import {
  Move,
  Minimize2,
  Maximize2,
  Compass,
  Crosshair,
  Zap,
  Layers,
  Eye,
  Sliders,
  CheckCircle2,
  Navigation,
  X,
  Play,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface NavigationWaypoint {
  x: number;
  y: number;
  label?: string;
  action?: string;
  speed?: number;
}

export interface DraggableDualAiOverlayProps {
  currentNavigationPath?: {
    id: string;
    name: string;
    waypoints: NavigationWaypoint[];
    confidence?: number;
    aiPlannerNotes?: string;
  };
  screenshotUrl?: string;
  onDispatchPath?: (path: NavigationWaypoint[]) => void;
  onClose?: () => void;
  className?: string;
}

export function DraggableDualAiOverlay({
  currentNavigationPath = {
    id: "dual_ai_live_path",
    name: "Autonomous Path: Primary Target Route",
    waypoints: [
      { x: 240, y: 180, label: "Origin Focus", action: "move" },
      { x: 540, y: 360, label: "Transit Spline", action: "move" },
      { x: 960, y: 540, label: "Target Element Lock", action: "click" },
    ],
    confidence: 0.94,
    aiPlannerNotes: "Trajectory optimized for natural human micro-jitter and sub-pixel accuracy",
  },
  screenshotUrl,
  onDispatchPath,
  onClose,
  className = "",
}: DraggableDualAiOverlayProps) {
  // Draggable window state
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 40, y: 80 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(90);
  const [showBackdrop, setShowBackdrop] = useState<boolean>(true);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag when clicking the header bar
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 380, e.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 300, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Animate waypoints preview
  useEffect(() => {
    const waypoints = currentNavigationPath.waypoints;
    if (waypoints.length <= 1) return;
    const interval = setInterval(() => {
      setActiveWaypointIndex((prev) => (prev + 1) % waypoints.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [currentNavigationPath.waypoints]);

  const waypoints = currentNavigationPath.waypoints || [];
  const targetWp = waypoints[waypoints.length - 1] || { x: 960, y: 540 };

  return (
    <div
      ref={containerRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        opacity: overlayOpacity / 100,
      }}
      className={`fixed z-50 w-96 rounded-xl border border-cyan-500/50 bg-slate-950/95 shadow-2xl shadow-cyan-950/80 backdrop-blur-md select-none transition-opacity ${className}`}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between p-2.5 bg-gradient-to-r from-slate-900 via-cyan-950/70 to-slate-900 border-b border-cyan-800/40 rounded-t-xl cursor-move active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <Move className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-slate-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            Dual-AI Navigation Overlay
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            title={isMinimized ? "Maximize" : "Minimize"}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800"
              title="Close Overlay"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body Content */}
      {!isMinimized && (
        <div className="p-3 space-y-3">
          {/* Path Header Info */}
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-cyan-300 font-bold truncate max-w-[200px]">
              {currentNavigationPath.name}
            </span>
            <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 text-[10px]">
              {waypoints.length} Waypoints ({(currentNavigationPath.confidence! * 100).toFixed(0)}% Conf)
            </Badge>
          </div>

          {/* SVG Navigation Path Stage */}
          <div className="relative aspect-video rounded-lg overflow-hidden border border-cyan-900/60 bg-black/90">
            {showBackdrop && screenshotUrl && (
              <img
                src={screenshotUrl}
                alt="Backdrop"
                className="w-full h-full object-cover opacity-40 filter contrast-125"
              />
            )}

            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 1920 1080"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="dualAiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
                <filter id="glowPath" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Navigation Spline Path */}
              {waypoints.length > 1 && (
                <polyline
                  points={waypoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="url(#dualAiGrad)"
                  strokeWidth="8"
                  strokeDasharray="16 8"
                  filter="url(#glowPath)"
                  className="animate-[dash_8s_linear_infinite]"
                />
              )}

              {/* Waypoint Markers */}
              {waypoints.map((wp, idx) => (
                <g key={idx} className="transition-all duration-300">
                  <circle
                    cx={wp.x}
                    cy={wp.y}
                    r={idx === waypoints.length - 1 ? 24 : 16}
                    fill={idx === waypoints.length - 1 ? "#22c55e" : "#06b6d4"}
                    stroke="#ffffff"
                    strokeWidth="4"
                    className={idx === activeWaypointIndex ? "animate-ping" : ""}
                  />
                  <circle
                    cx={wp.x}
                    cy={wp.y}
                    r={idx === waypoints.length - 1 ? 24 : 16}
                    fill={idx === waypoints.length - 1 ? "#22c55e" : "#06b6d4"}
                    stroke="#ffffff"
                    strokeWidth="4"
                  />
                  <text
                    x={wp.x + 30}
                    y={wp.y + 10}
                    fill="#ffffff"
                    fontSize="32"
                    fontWeight="bold"
                    fontFamily="monospace"
                    className="drop-shadow-[0_4px_8px_rgba(0,0,0,1)]"
                  >
                    #{idx + 1} {wp.label || `(${wp.x}, ${wp.y})`}
                  </text>
                </g>
              ))}

              {/* Real-time Aiming Crosshair at Active Target */}
              <g
                transform={`translate(${waypoints[activeWaypointIndex]?.x || targetWp.x}, ${
                  waypoints[activeWaypointIndex]?.y || targetWp.y
                })`}
              >
                <circle r="40" fill="none" stroke="#f43f5e" strokeWidth="4" strokeDasharray="8 4" />
                <line x1="-50" y1="0" x2="50" y2="0" stroke="#f43f5e" strokeWidth="4" />
                <line x1="0" y1="-50" x2="0" y2="50" stroke="#f43f5e" strokeWidth="4" />
              </g>
            </svg>

            {/* Live HUD Coordinate Overlay Badge */}
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/80 border border-slate-700 text-[10px] font-mono text-cyan-300">
              AIM: X={targetWp.x} Y={targetWp.y} ({targetWp.action || "click"})
            </div>
          </div>

          {/* AI Planner Notes */}
          {currentNavigationPath.aiPlannerNotes && (
            <p className="text-[10px] text-slate-400 font-mono italic bg-slate-900/60 p-2 rounded border border-slate-800">
              💡 {currentNavigationPath.aiPlannerNotes}
            </p>
          )}

          {/* Controls: Opacity, Backdrop Toggle & PyAutoGUI Dispatch */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBackdrop(!showBackdrop)}
                className={`text-[10px] font-mono px-2 py-1 rounded border ${
                  showBackdrop
                    ? "bg-cyan-950 text-cyan-300 border-cyan-800"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}
              >
                Backdrop: {showBackdrop ? "ON" : "OFF"}
              </button>
            </div>

            <Button
              size="sm"
              onClick={() => onDispatchPath?.(waypoints)}
              className="h-7 text-xs font-mono font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white gap-1 shadow-md shadow-cyan-950"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              Dispatch Along Path
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
