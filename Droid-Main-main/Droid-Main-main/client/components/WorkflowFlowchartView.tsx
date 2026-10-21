import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  GitBranch,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  MousePointer,
  Keyboard,
  Eye,
  Sliders,
  Maximize2,
  ShieldCheck,
  Compass,
  ArrowRight,
  Layers,
  FileText,
  Activity,
  Cpu,
  RefreshCw,
  Target,
  Zap,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Info,
  CornerDownRight,
  Move,
  Save,
  Download,
  Upload,
  BarChart3,
  Flame,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
  Cell,
} from "recharts";
import {
  MouseTrajectoryStore,
  MouseRecordingSession,
} from "../../src/services/mouseTrajectoryStore";
import { useWorkflowLayoutSync, DEFAULT_LAYOUT_STORAGE_KEY } from "../hooks/useWorkflowLayoutSync";

export interface FlowNode {
  id: string;
  type: "start" | "action" | "decision" | "recovery" | "end";
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: {
    stepIndex?: number;
    actionType?: "click" | "move" | "keypress" | "scroll" | "wait";
    target?: string;
    coords?: { x: number; y: number };
    condition?: string;
    recoveryMethod?: string;
    status?: "idle" | "running" | "success" | "drift" | "warning" | "error";
    confidence?: number;
    durationMs?: number;
    driftOffsetPx?: number;
    details?: string;
  };
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  variant?: "default" | "success" | "warning" | "recovery" | "active";
  animated?: boolean;
}

export const nodeAnimationVariants: Variants = {
  idle: {
    scale: 1,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)",
    borderColor: "rgba(51, 65, 85, 0.8)",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    transition: { type: "spring", stiffness: 350, damping: 25 },
  },
  running: {
    scale: [1, 1.04, 1],
    borderColor: ["#38bdf8", "#818cf8", "#38bdf8"],
    backgroundColor: [
      "rgba(8, 47, 73, 0.92)",
      "rgba(30, 27, 75, 0.95)",
      "rgba(8, 47, 73, 0.92)",
    ],
    boxShadow: [
      "0 0 0px rgba(56, 189, 248, 0)",
      "0 0 26px rgba(56, 189, 248, 0.85)",
      "0 0 4px rgba(56, 189, 248, 0.4)",
    ],
    transition: {
      repeat: Infinity,
      duration: 1.3,
      ease: "easeInOut",
    },
  },
  drift: {
    x: [-4, 4, -3, 3, -1, 1, 0],
    scale: [1, 1.03, 1],
    borderColor: ["#f59e0b", "#ef4444", "#f59e0b"],
    backgroundColor: [
      "rgba(69, 26, 3, 0.94)",
      "rgba(127, 29, 29, 0.9)",
      "rgba(69, 26, 3, 0.94)",
    ],
    boxShadow: [
      "0 0 0px rgba(245, 158, 11, 0)",
      "0 0 32px rgba(245, 158, 11, 0.95)",
      "0 0 8px rgba(239, 68, 68, 0.6)",
    ],
    transition: {
      repeat: Infinity,
      duration: 0.85,
      ease: "easeInOut",
    },
  },
  success: {
    scale: 1,
    borderColor: "#10b981",
    backgroundColor: "rgba(6, 78, 59, 0.85)",
    boxShadow: "0 0 18px rgba(16, 185, 129, 0.5)",
    transition: { duration: 0.3 },
  },
  warning: {
    scale: 1,
    borderColor: "#f59e0b",
    backgroundColor: "rgba(120, 53, 15, 0.65)",
    boxShadow: "0 0 16px rgba(245, 158, 11, 0.4)",
    transition: { duration: 0.3 },
  },
  error: {
    scale: [1, 1.02, 1],
    borderColor: "#ef4444",
    backgroundColor: "rgba(127, 29, 29, 0.9)",
    boxShadow: [
      "0 0 0px rgba(239, 68, 68, 0)",
      "0 0 25px rgba(239, 68, 68, 0.85)",
      "0 0 5px rgba(239, 68, 68, 0.5)",
    ],
    transition: { repeat: Infinity, duration: 1.0 },
  },
};

const STORAGE_KEY = DEFAULT_LAYOUT_STORAGE_KEY;

const DEFAULT_NODES: FlowNode[] = [
  {
    id: "start-1",
    type: "start",
    title: "Start Automation Pipeline",
    subtitle: "Trigger: User Gesture / Schedule",
    x: 60,
    y: 200,
    width: 220,
    height: 75,
    data: { status: "success", details: "Initial trigger from Live Screen HUD or Batch Pipeline", durationMs: 120 },
  },
  {
    id: "action-1",
    type: "action",
    title: "1. Navigate & Focus Window",
    subtitle: "Chrome Browser (1920x1080)",
    x: 340,
    y: 200,
    width: 240,
    height: 85,
    data: {
      stepIndex: 1,
      actionType: "move",
      target: "Browser Window Frame",
      coords: { x: 420, y: 180 },
      confidence: 0.99,
      status: "idle",
      durationMs: 340,
      details: "Set foreground window focus and verify viewport dimension anchors.",
    },
  },
  {
    id: "decision-1",
    type: "decision",
    title: "2. Verify Element Anchor",
    subtitle: "Screenshot Diff > 92% Match?",
    x: 640,
    y: 175,
    width: 240,
    height: 135,
    data: {
      stepIndex: 2,
      condition: "Pixel diff < 8% and OCR anchor confirmed",
      status: "idle",
      durationMs: 210,
      details: "Compares live capture frame against saved keyframe template.",
    },
  },
  {
    id: "action-2",
    type: "action",
    title: "3A. Target Click Action",
    subtitle: "Submit Button @ (960, 540)",
    x: 950,
    y: 100,
    width: 240,
    height: 85,
    data: {
      stepIndex: 3,
      actionType: "click",
      target: "Submit Transaction Button",
      coords: { x: 960, y: 540 },
      confidence: 0.98,
      status: "idle",
      durationMs: 450,
      details: "Direct hardware injection via PC automation daemon.",
    },
  },
  {
    id: "recovery-1",
    type: "recovery",
    title: "3B. Auto-Recovery Subroutine",
    subtitle: "OCR Landmark Recalibration",
    x: 950,
    y: 310,
    width: 260,
    height: 95,
    data: {
      stepIndex: 3,
      recoveryMethod: "Cubic Bezier Spline Morph + OCR Offset",
      status: "drift",
      driftOffsetPx: 18.4,
      durationMs: 580,
      details: "Compensates for +18px vertical scroll displacement automatically.",
    },
  },
  {
    id: "end-1",
    type: "end",
    title: "Verification & Complete",
    subtitle: "Telemetry logged to ledger",
    x: 1280,
    y: 200,
    width: 220,
    height: 75,
    data: { status: "idle", details: "All steps validated with zero unresolved drifts.", durationMs: 90 },
  },
];

const DEFAULT_EDGES: FlowEdge[] = [
  { id: "e1", from: "start-1", to: "action-1", variant: "success", animated: true },
  { id: "e2", from: "action-1", to: "decision-1", variant: "default" },
  { id: "e3", from: "decision-1", to: "action-2", label: "MATCH (>=92%)", variant: "success" },
  { id: "e4", from: "decision-1", to: "recovery-1", label: "DRIFT DETECTED", variant: "warning" },
  { id: "e5", from: "action-2", to: "end-1", variant: "default" },
  { id: "e6", from: "recovery-1", to: "end-1", label: "RE-ALIGNED", variant: "recovery" },
];

export const WorkflowFlowchartView: React.FC<{ className?: string }> = ({ className = "" }) => {
  const store = MouseTrajectoryStore.getInstance();
  const [sessions, setSessions] = useState<MouseRecordingSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"flowchart" | "recharts-sequence">("flowchart");

  // Synchronized Layout State Hook with debounced persistence and cross-tab sync
  const {
    nodes,
    setNodes,
    edges,
    setEdges,
    isLoaded,
    isDirty,
    lastSavedTimestamp,
    isAutoSyncEnabled,
    setIsAutoSyncEnabled,
    saveLayout,
    resetLayout,
    updateNodePosition,
    updateNodeData,
    exportLayoutJson,
    importLayoutJson,
  } = useWorkflowLayoutSync(DEFAULT_NODES, DEFAULT_EDGES, {
    storageKey: STORAGE_KEY,
    autoSyncDebounceMs: 500,
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("decision-1");

  // Canvas Pan / Zoom State
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 40 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Dragging State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Execution Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  // Save manual button handler
  const handleManualSave = () => {
    saveLayout(nodes, edges, true);
  };

  // Load Sessions
  useEffect(() => {
    const list = store.getAllSessions();
    setSessions(list);
  }, []);

  // Generate Flowchart dynamically from selected session
  const generateFromSession = (session: MouseRecordingSession) => {
    const newNodes: FlowNode[] = [];
    const newEdges: FlowEdge[] = [];

    // Start Node
    newNodes.push({
      id: `node-start`,
      type: "start",
      title: `Start "${session.name.slice(0, 22)}"`,
      subtitle: `${session.points.length} waypoints recorded`,
      x: 60,
      y: 200,
      width: 220,
      height: 75,
      data: {
        status: "success",
        durationMs: 150,
        details: `Session created on ${new Date(session.recordedAt).toLocaleTimeString()}`,
      },
    });

    let prevNodeId = `node-start`;
    const sampledPoints = session.points
      .filter((_, idx) => idx % Math.max(1, Math.floor(session.points.length / 4)) === 0)
      .slice(0, 4);

    sampledPoints.forEach((pt, idx) => {
      const stepNum = idx + 1;
      const isClick = pt.type === "click";
      const nodeId = `node-action-${stepNum}`;
      const posX = 340 + idx * 270;
      const posY = isClick ? 140 : 200;
      const hasDrift = idx === 1 || Math.random() > 0.6;
      const driftOffset = hasDrift ? parseFloat((12 + Math.random() * 14).toFixed(1)) : 0;

      newNodes.push({
        id: nodeId,
        type: isClick ? "action" : "action",
        title: `Step ${stepNum}: ${isClick ? "Click Action" : "Cursor Waypoint"}`,
        subtitle: `Target @ (${pt.x}, ${pt.y})`,
        x: posX,
        y: posY,
        width: 240,
        height: 85,
        data: {
          stepIndex: stepNum,
          actionType: isClick ? "click" : "move",
          coords: { x: pt.x, y: pt.y },
          confidence: parseFloat((0.95 + Math.random() * 0.04).toFixed(2)),
          durationMs: Math.round(200 + Math.random() * 400),
          driftOffsetPx: driftOffset,
          status: hasDrift ? "drift" : "idle",
          details: `Interpolated movement speed ${pt.speed || 1.0}x with visual anchor verification.`,
        },
      });

      newEdges.push({
        id: `edge-${prevNodeId}-${nodeId}`,
        from: prevNodeId,
        to: nodeId,
        variant: isClick ? "success" : "default",
      });

      prevNodeId = nodeId;
    });

    // Add End Node
    const endX = 340 + sampledPoints.length * 270;
    newNodes.push({
      id: "node-end",
      type: "end",
      title: "Flow Verified & Complete",
      subtitle: `${session.points.length} Actions Committed`,
      x: endX,
      y: 200,
      width: 220,
      height: 75,
      data: { status: "idle", durationMs: 100, details: "Workflow executed with zero unresolved drifts." },
    });

    newEdges.push({
      id: `edge-${prevNodeId}-node-end`,
      from: prevNodeId,
      to: "node-end",
      variant: "success",
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId("node-start");
    saveLayout(newNodes, newEdges, true);
    toast.success(`Generated and saved interactive flowchart from "${session.name}"`);
  };

  // Run Step-by-Step Simulation with motion feedback
  const runSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      setActiveStepIndex(i);

      // Transition to running state
      setNodes((prev) =>
        prev.map((n, idx) => (idx === i ? { ...n, data: { ...n.data, status: "running" } } : n))
      );

      await new Promise((res) => setTimeout(res, 550));

      // If it's a recovery or drift node, simulate a brief drift event
      const isDriftStep = node.type === "recovery" || (node.data.driftOffsetPx && node.data.driftOffsetPx > 10);

      if (isDriftStep) {
        setNodes((prev) =>
          prev.map((n, idx) => (idx === i ? { ...n, data: { ...n.data, status: "drift" } } : n))
        );
        await new Promise((res) => setTimeout(res, 600));
      }

      setNodes((prev) =>
        prev.map((n, idx) => (idx === i ? { ...n, data: { ...n.data, status: "success" } } : n))
      );
    }

    setActiveStepIndex(null);
    setIsSimulating(false);
    toast.success("Workflow simulation verified with 100% path coverage!");
  };

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  // Recharts Sequence Metrics
  const rechartsData = useMemo(() => {
    return nodes.map((node, idx) => ({
      name: node.title.length > 18 ? node.title.slice(0, 16) + "..." : node.title,
      durationMs: node.data.durationMs || 250,
      confidence: Math.round((node.data.confidence || 0.95) * 100),
      driftPx: node.data.driftOffsetPx || 0,
      type: node.type,
      status: node.data.status || "idle",
    }));
  }, [nodes]);

  // Canvas Pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".flow-node")) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (draggingNodeId) {
      // Reposition dragged node
      const mouseX = (e.clientX - pan.x) / zoom;
      const mouseY = (e.clientY - pan.y) / zoom;

      setNodes((prev) => {
        const next = prev.map((n) =>
          n.id === draggingNodeId
            ? { ...n, x: Math.max(20, Math.round(mouseX - nodeDragOffset.x)), y: Math.max(20, Math.round(mouseY - nodeDragOffset.y)) }
            : n
        );
        return next;
      });
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggingNodeId) {
      saveLayout(nodes, edges, true);
    }
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setDraggingNodeId(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const mouseX = (e.clientX - pan.x) / zoom;
      const mouseY = (e.clientY - pan.y) / zoom;
      setNodeDragOffset({
        x: mouseX - node.x,
        y: mouseY - node.y,
      });
    }
  };

  return (
    <div className={`flex flex-col gap-4 rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 p-6 font-mono shadow-2xl ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                WORKFLOW FLOWCHART & AUTOMATION SEQUENCE VISUALIZER
                <Badge variant="outline" className="text-[10px] bg-purple-950/60 border-purple-500/50 text-purple-300">
                  MOTION ANIMATED
                </Badge>
              </h3>
              <p className="text-xs text-slate-400">
                Visual action sequences, decision forks, and auto-recovery branches with interactive Framer Motion feedback & Recharts analytics
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
            <button
              onClick={() => setActiveTab("flowchart")}
              className={`px-2.5 py-1 text-xs rounded font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "flowchart"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Interactive Canvas
            </button>
            <button
              onClick={() => setActiveTab("recharts-sequence")}
              className={`px-2.5 py-1 text-xs rounded font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "recharts-sequence"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Recharts Timeline
            </button>
          </div>

          {/* Session Switcher */}
          <select
            value={selectedSessionId}
            onChange={(e) => {
              setSelectedSessionId(e.target.value);
              const found = sessions.find((s) => s.id === e.target.value);
              if (found) generateFromSession(found);
            }}
            className="h-8 px-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-400"
          >
            <option value="">-- Load from Session --</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.points.length} pts)
              </option>
            ))}
          </select>

          <Button
            onClick={runSimulation}
            disabled={isSimulating}
            className="h-8 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs gap-1.5 shadow-lg shadow-purple-950/50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isSimulating ? "TESTING PATH..." : "SIMULATE FLOW"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            className="h-8 px-2.5 border-slate-700 bg-slate-900 text-emerald-300 hover:bg-emerald-950/50 hover:text-emerald-200 gap-1"
            title="Save layout and custom node coordinates to localStorage"
          >
            <Save className="w-3.5 h-3.5" />
            SAVE
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={resetLayout}
            className="h-8 px-2 border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
            title="Reset topology to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main View Modes */}
      {activeTab === "flowchart" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Canvas Visualizer Area (9 Cols) */}
          <div className="lg:col-span-9 relative h-[520px] rounded-xl overflow-hidden border border-slate-800 bg-[#070a13] shadow-inner select-none cursor-grab active:cursor-grabbing">
            {/* Zoom / Pan Controls Overlay */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 shadow-xl backdrop-blur-sm">
              <button
                onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 px-1">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setZoom(0.9);
                  setPan({ x: 30, y: 40 });
                }}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 text-[10px]"
                title="Reset View"
              >
                Reset
              </button>
            </div>

            {/* Instruction Tip */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800/80 text-[10px] text-slate-400">
              <Move className="w-3 h-3 text-purple-400" />
              <span>Drag canvas to pan • Drag node cards to reposition (auto-saved)</span>
            </div>

            {/* Minimap Overlay (Bottom Left) */}
            <div className="absolute bottom-3 left-3 z-20 w-36 h-24 rounded-lg bg-slate-950/85 border border-slate-800/80 p-2 shadow-xl backdrop-blur-sm pointer-events-none">
              <div className="text-[9px] text-slate-500 font-bold mb-1">TOPOLOGY MINIMAP</div>
              <div className="relative w-full h-14 bg-slate-900/60 rounded border border-slate-800 overflow-hidden">
                {nodes.map((n) => (
                  <div
                    key={n.id}
                    className={`absolute rounded-sm ${
                      n.type === "decision"
                        ? "bg-amber-400"
                        : n.type === "recovery"
                        ? "bg-rose-400"
                        : n.type === "start" || n.type === "end"
                        ? "bg-emerald-400"
                        : "bg-cyan-400"
                    }`}
                    style={{
                      left: `${(n.x / 1600) * 100}%`,
                      top: `${(n.y / 500) * 100}%`,
                      width: "8px",
                      height: "4px",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Interactive Flow Container */}
            <div
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              className="w-full h-full relative overflow-hidden"
            >
              {/* Background Grid Pattern */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern id="flow-grid-motion" width="30" height="30" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#64748b" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#flow-grid-motion)" />
              </svg>

              {/* Transform Container (Pan & Zoom) */}
              <div
                className="absolute inset-0 origin-top-left transition-transform duration-75 ease-out"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {/* SVG Edges Layer */}
                <svg className="absolute inset-0 w-[2400px] h-[1200px] pointer-events-none">
                  <defs>
                    <marker
                      id="arrow-default"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 8 5 L 0 9 z" fill="#64748b" />
                    </marker>
                    <marker
                      id="arrow-success"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 8 5 L 0 9 z" fill="#10b981" />
                    </marker>
                    <marker
                      id="arrow-warning"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 8 5 L 0 9 z" fill="#f59e0b" />
                    </marker>
                    <marker
                      id="arrow-recovery"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 8 5 L 0 9 z" fill="#ec4899" />
                    </marker>
                  </defs>

                  {edges.map((edge) => {
                    const source = nodes.find((n) => n.id === edge.from);
                    const target = nodes.find((n) => n.id === edge.to);
                    if (!source || !target) return null;

                    const startX = source.x + source.width;
                    const startY = source.y + source.height / 2;
                    const endX = target.x;
                    const endY = target.y + target.height / 2;
                    const midX = (startX + endX) / 2;

                    const pathD = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

                    const strokeColor =
                      edge.variant === "success"
                        ? "#10b981"
                        : edge.variant === "warning"
                        ? "#f59e0b"
                        : edge.variant === "recovery"
                        ? "#ec4899"
                        : "#475569";

                    return (
                      <g key={edge.id}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="2"
                          strokeDasharray={edge.variant === "warning" ? "5 3" : "none"}
                          markerEnd={`url(#arrow-${edge.variant || "default"})`}
                        />

                        {/* Edge Label Pill */}
                        {edge.label && (
                          <g transform={`translate(${midX}, ${(startY + endY) / 2})`}>
                            <rect
                              x="-50"
                              y="-10"
                              width="100"
                              height="20"
                              rx="10"
                              fill="#0f172a"
                              stroke={strokeColor}
                              strokeWidth="1"
                            />
                            <text
                              x="0"
                              y="3"
                              textAnchor="middle"
                              fill={strokeColor}
                              fontSize="9"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              {edge.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Framer Motion Animated Nodes Layer with Variant Pulses */}
                {nodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const currentStatus = node.data.status || "idle";
                  const isRunning = currentStatus === "running";
                  const isDrift = currentStatus === "drift";
                  const isSuccess = currentStatus === "success";

                  return (
                    <motion.div
                      key={node.id}
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      whileHover={{ scale: 1.025, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      variants={nodeAnimationVariants}
                      initial="idle"
                      animate={currentStatus}
                      className={`flow-node absolute rounded-xl p-3 border transition-colors cursor-move select-none shadow-xl ${
                        isSelected
                          ? "ring-2 ring-purple-400 border-purple-400 bg-slate-900 z-10"
                          : isRunning
                          ? "border-cyan-400 bg-cyan-950/50 z-10 ring-2 ring-cyan-400/80"
                          : isDrift
                          ? "border-amber-400 bg-amber-950/60 z-10 ring-2 ring-amber-500/90"
                          : node.type === "decision"
                          ? "border-amber-500/60 bg-amber-950/20 hover:border-amber-400"
                          : node.type === "recovery"
                          ? "border-pink-500/60 bg-pink-950/20 hover:border-pink-400"
                          : node.type === "start" || node.type === "end"
                          ? "border-emerald-500/60 bg-emerald-950/20 hover:border-emerald-400"
                          : "border-slate-800 bg-slate-900/90 hover:border-cyan-400"
                      }`}
                      style={{
                        left: `${node.x}px`,
                        top: `${node.y}px`,
                        width: `${node.width}px`,
                        minHeight: `${node.height}px`,
                      }}
                    >
                      {/* Node Header Row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {node.type === "start" || node.type === "end" ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : node.type === "decision" ? (
                            <Target className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : node.type === "recovery" ? (
                            <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
                          ) : (
                            <MousePointer className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <h4 className="text-xs font-bold text-slate-100 truncate">{node.title}</h4>
                        </div>

                        {/* Status indicator with beacon */}
                        <div className="flex items-center gap-1">
                          {isDrift && (
                            <motion.span
                              animate={{ scale: [1, 1.35, 1], opacity: [0.8, 1, 0.8] }}
                              transition={{ repeat: Infinity, duration: 0.7 }}
                              className="text-[9px] text-amber-300 font-bold bg-amber-950 border border-amber-500 px-1 rounded flex items-center gap-0.5"
                            >
                              <Flame className="w-2.5 h-2.5 text-amber-400" />
                              DRIFT
                            </motion.span>
                          )}
                          {isRunning && (
                            <motion.span
                              animate={{ opacity: [0.7, 1, 0.7] }}
                              transition={{ repeat: Infinity, duration: 0.8 }}
                              className="text-[9px] text-cyan-300 font-mono bg-cyan-950 border border-cyan-500 px-1 rounded flex items-center gap-0.5"
                            >
                              <Zap className="w-2.5 h-2.5 text-cyan-400" />
                              EXEC
                            </motion.span>
                          )}
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isRunning
                                ? "bg-cyan-400 animate-ping"
                                : isDrift
                                ? "bg-amber-400 animate-bounce"
                                : isSuccess
                                ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
                                : "bg-slate-600"
                            }`}
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400 mt-1 truncate">{node.subtitle}</p>

                      {/* Metadata Sub-chips */}
                      <div className="mt-2 flex items-center justify-between text-[9px]">
                        {node.data.coords ? (
                          <div className="text-cyan-300 font-mono flex items-center gap-1">
                            <Crosshair className="w-3 h-3" />
                            <span>({node.data.coords.x}, {node.data.coords.y})</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono">FLOW NODE</span>
                        )}

                        {node.data.durationMs && (
                          <span className="text-slate-400 font-mono">{node.data.durationMs}ms</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Node Properties Inspector (3 Cols) */}
          <div className="lg:col-span-3 rounded-xl bg-slate-900/60 border border-slate-800/80 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                <Info className="w-4 h-4" />
                NODE INSPECTOR
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">{selectedNode ? selectedNode.id : "None"}</span>
            </div>

            {selectedNode ? (
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500">NODE TITLE:</span>
                  <div className="font-bold text-slate-200">{selectedNode.title}</div>
                  <div className="text-[11px] text-slate-400">{selectedNode.subtitle}</div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500">NODE TYPE & STATUS:</span>
                  <div className="flex items-center gap-1.5">
                    <Badge className="font-mono text-[10px] uppercase bg-slate-950 text-purple-300 border-purple-800/50">
                      {selectedNode.type}
                    </Badge>
                    <Badge
                      className={`font-mono text-[10px] uppercase ${
                        selectedNode.data.status === "drift"
                          ? "bg-amber-950 text-amber-300 border-amber-700"
                          : selectedNode.data.status === "success"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                          : "bg-slate-950 text-slate-400 border-slate-800"
                      }`}
                    >
                      {selectedNode.data.status || "idle"}
                    </Badge>
                  </div>
                </div>

                {selectedNode.data.coords && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500">COORDINATE ANCHOR:</span>
                    <div className="text-cyan-300 font-mono bg-slate-950 p-1.5 rounded border border-slate-800 text-[11px]">
                      X: {selectedNode.data.coords.x}px | Y: {selectedNode.data.coords.y}px
                    </div>
                  </div>
                )}

                {selectedNode.data.driftOffsetPx !== undefined && selectedNode.data.driftOffsetPx > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      INTER-FRAME DRIFT OFFSET:
                    </span>
                    <div className="text-amber-300 font-mono bg-amber-950/30 p-2 rounded border border-amber-800/50 text-[11px]">
                      Δ {selectedNode.data.driftOffsetPx}px displacement recorded
                    </div>
                  </div>
                )}

                {selectedNode.data.condition && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500">DECISION FORK CRITERIA:</span>
                    <div className="text-amber-300 bg-amber-950/20 p-2 rounded border border-amber-800/40 text-[11px]">
                      {selectedNode.data.condition}
                    </div>
                  </div>
                )}

                {selectedNode.data.recoveryMethod && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500">AUTO-RECOVERY ROUTE:</span>
                    <div className="text-pink-300 bg-pink-950/20 p-2 rounded border border-pink-800/40 text-[11px]">
                      {selectedNode.data.recoveryMethod}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500">EXECUTION DETAILS:</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950 p-2 rounded border border-slate-800">
                    {selectedNode.data.details || "No custom parameter overrides."}
                  </p>
                </div>

                {/* Framer Motion Interactive Variant Tester Controls */}
                <div className="pt-2 space-y-1.5 border-t border-slate-800">
                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider block">
                    MOTION VARIANT TESTER:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => {
                        updateNodeData(selectedNode.id, { status: "running" });
                        toast.info(`Triggered 'running' neon pulse on ${selectedNode.title}`);
                      }}
                      className="h-7 text-[10px] bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 gap-1 justify-center"
                    >
                      <Zap className="w-3 h-3 text-cyan-400" />
                      Active Pulse
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        updateNodeData(selectedNode.id, { status: "drift", driftOffsetPx: 19.2 });
                        toast.warning(`Triggered 'drift' shake & amber flash on ${selectedNode.title}`);
                      }}
                      className="h-7 text-[10px] bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-700/60 gap-1 justify-center"
                    >
                      <Flame className="w-3 h-3 text-amber-400" />
                      Drift Shake
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        updateNodeData(selectedNode.id, { status: "success", driftOffsetPx: 0 });
                        toast.success(`Marked 'success' lock-in on ${selectedNode.title}`);
                      }}
                      className="h-7 text-[10px] bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 gap-1 justify-center"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Success
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        updateNodeData(selectedNode.id, { status: "idle", driftOffsetPx: 0 });
                        toast(`Reset ${selectedNode.title} to idle`);
                      }}
                      className="h-7 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 gap-1 justify-center"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-400" />
                      Reset Idle
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Click any flowchart node on the canvas to inspect its parameters.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Recharts Sequence & Timeline Visualization Tab */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step Latency Chart */}
            <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-2">
              <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                AUTOMATION STEP EXECUTION DURATION (MS)
              </h4>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", fontSize: 11 }}
                    />
                    <Bar dataKey="durationMs" fill="#38bdf8" radius={[4, 4, 0, 0]}>
                      {rechartsData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.status === "drift" ? "#f59e0b" : entry.status === "success" ? "#10b981" : "#38bdf8"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Confidence & Drift Offset Area Chart */}
            <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-2">
              <h4 className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4" />
                CONFIDENCE SCORE (%) & FRAME DRIFT (PX)
              </h4>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", fontSize: 11 }}
                    />
                    <Area type="monotone" dataKey="confidence" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} name="Confidence %" />
                    <Area type="monotone" dataKey="driftPx" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Drift Offset (px)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Sequential Step Matrix List */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-400" />
              TOPOLOGICAL STEP SEQUENCE MATRIX
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {nodes.map((n, idx) => (
                <div
                  key={n.id}
                  onClick={() => {
                    setSelectedNodeId(n.id);
                    setActiveTab("flowchart");
                  }}
                  className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500 cursor-pointer transition-all space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500 font-mono">#{idx + 1}</span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-slate-700 text-slate-300">
                      {n.type}
                    </Badge>
                  </div>
                  <div className="text-xs font-bold text-slate-200 truncate">{n.title}</div>
                  <div className="text-[10px] text-slate-400 truncate">{n.subtitle}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
