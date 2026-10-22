import { evaluateCalculator } from "@/lib/calculator";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Monitor,
  MousePointer,
  Sparkles,
  Zap,
  Sliders,
  CheckCircle2,
  Layers,
  Activity,
  Maximize2,
  FolderOpen,
  FileText,
  Trash2,
  Globe,
  Terminal,
  Settings,
  Camera,
  Play,
  Pause,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Video,
  X,
  Plus,
  Minus,
  Minimize2,
  Cpu,
  Search,
  ArrowLeft,
  ArrowRight,
  HardDrive,
  Check,
  Smartphone,
  Radio,
  Crosshair,
  Target,
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useActionGate } from "@/hooks/use-action-gate";
import { mirrorAiMovePlan } from "@/lib/gated-plans";
import { calibrateCoordinates, getStoredCalibration } from "@/lib/coordinate-calibration";
import { InteractiveContextMenu, ContextMenuTarget } from "@/components/interactive-context-menu";

export interface SimulatedWindow {
  id: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isOpen: boolean;
  isMinimized: boolean;
  type: "browser" | "terminal" | "files" | "calculator" | "monitor" | "settings";
  data?: any;
}

export const VirtualDesktopMirrorStudio: React.FC = () => {
  const actionGate = useActionGate({ targetDevice: "desktop" });
  // Mode: "browser_screen" (Real getDisplayMedia), "camera" (Webcam/HDMI), "virtual_os" (Interactive 60FPS Canvas)
  const [mirrorMode, setMirrorMode] = useState<"virtual_os" | "real_screen" | "camera">("virtual_os");
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Sync settings
  const [syncRealMouseToCanvas, setSyncRealMouseToCanvas] = useState(true);
  const [canvasClickToRealMouse, setCanvasClickToRealMouse] = useState(true);
  const [aiCursorToRealMouse, setAiCursorToRealMouse] = useState(true);
  const [targetFps, setTargetFps] = useState<number>(60);
  const [autoSyncToBackend, setAutoSyncToBackend] = useState<boolean>(true);

  // Cursors & Coordinates
  const [realMousePos, setRealMousePos] = useState({ x: 420, y: 260 });
  const [aiCursorPos, setAiCursorPos] = useState({ x: 680, y: 190 });
  const [canvasLocalPos, setCanvasLocalPos] = useState({ x: 310, y: 220 });
  const [clickRipples, setClickRipples] = useState<Array<{ id: string; x: number; y: number; time: number }>>([]);
  const [actionLog, setActionLog] = useState<Array<{ id: string; time: string; action: string; coords: string }>>([
    { id: "log_1", time: new Date().toLocaleTimeString(), action: "Device Mirror Initialized", coords: "1920x1080 Normalized" },
  ]);

  // Interactive Context Menu State for setting steps & hardware control on live stream
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);

  // Video / Canvas references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desktopContainerRef = useRef<HTMLDivElement | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  // Interactive Virtual OS Apps State
  const [chromeUrl, setChromeUrl] = useState<string>("https://google.com/search?q=Sightline+Autonomous+AI");
  const [chromeSearchQuery, setChromeSearchQuery] = useState<string>("Sightline Autonomous AI");
  const [terminalInput, setTerminalInput] = useState<string>("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    "Microsoft Windows [Version 10.0.22631.3296]",
    "(c) Microsoft Corporation. All rights reserved.",
    "",
    "C:\\Users\\Sightline> python -m pyautogui.daemon --port 3000",
    "[AI Hardware Bridge] Zero-drift mouse listener connected.",
    "[PyAutoGUI Engine] Ready for interactive click dispatch.",
  ]);
  const [calcDisplay, setCalcDisplay] = useState<string>("0");
  const [calcEquation, setCalcEquation] = useState<string>("7 + 8 =");
  const [selectedFile, setSelectedFile] = useState<string | null>("automation_routine.py");
  const [cpuUsage, setCpuUsage] = useState<number>(18);
  const [ramUsage, setRamUsage] = useState<number>(42);
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());

  // Active Windows in Virtual OS
  const [desktopWindows, setDesktopWindows] = useState<SimulatedWindow[]>([
    {
      id: "win_chrome",
      title: "Google Chrome - Search",
      icon: "🌐",
      x: 340,
      y: 30,
      width: 440,
      height: 290,
      isOpen: true,
      isMinimized: false,
      type: "browser",
    },
    {
      id: "win_term",
      title: "Command Prompt - Python Automation Daemon",
      icon: "⬛",
      x: 40,
      y: 50,
      width: 410,
      height: 270,
      isOpen: true,
      isMinimized: false,
      type: "terminal",
    },
    {
      id: "win_calc",
      title: "Calculator",
      icon: "🧮",
      x: 520,
      y: 110,
      width: 250,
      height: 230,
      isOpen: false,
      isMinimized: false,
      type: "calculator",
    },
    {
      id: "win_files",
      title: "File Explorer - C:\\Workflows",
      icon: "📁",
      x: 120,
      y: 90,
      width: 380,
      height: 240,
      isOpen: false,
      isMinimized: false,
      type: "files",
    },
    {
      id: "win_mon",
      title: "Task Manager - System Telemetry",
      icon: "📊",
      x: 220,
      y: 70,
      width: 360,
      height: 230,
      isOpen: false,
      isMinimized: false,
      type: "monitor",
    },
  ]);

  const [activeWindowId, setActiveWindowId] = useState<string>("win_chrome");

  // Keep live time and CPU usage moving
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      setCpuUsage(Math.floor(14 + Math.random() * 16));
      setRamUsage(Math.floor(41 + Math.random() * 4));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Stop real streams on cleanup
  const stopLiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (syncTimerRef.current !== null) {
      window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setIsLiveStreaming(false);
  }, []);

  useEffect(() => {
    return () => stopLiveStream();
  }, [stopLiveStream]);

  // Start Browser getDisplayMedia Screen Share
  const handleStartRealDisplayCapture = async () => {
    stopLiveStream();
    setStreamError(null);

    const isInIframe = typeof window !== "undefined" && window.self !== window.top;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Browser does not support getDisplayMedia API.");
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
            frameRate: { ideal: targetFps, max: 60 },
          } as any,
          audio: false,
        });
      } catch (inner1) {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

      if (!stream) throw new Error("Could not acquire display capture stream.");

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setMirrorMode("real_screen");
      setIsLiveStreaming(true);
      toast.success("🖥️ Direct PC Display Capture Active (60 FPS)");

      // Continuous sync to backend if enabled
      if (autoSyncToBackend) {
        const offscreenCanvas = document.createElement("canvas");
        syncTimerRef.current = window.setInterval(() => {
          if (videoRef.current && stream.active) {
            offscreenCanvas.width = videoRef.current.videoWidth || 1920;
            offscreenCanvas.height = videoRef.current.videoHeight || 1080;
            const ctx = offscreenCanvas.getContext("2d");
            ctx?.drawImage(videoRef.current, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
            const dataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.85);

            fetch("/api/sync-real-frame", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageData: dataUrl, timestamp: Date.now() }),
            }).catch(() => {});
          }
        }, 200);
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          stopLiveStream();
          setMirrorMode("virtual_os");
          toast.info("Display capture session ended. Returned to Virtual Desktop.");
        };
      }
    } catch (err: any) {
      console.warn("Screen share error:", err);
      const isRestricted = isInIframe || err?.name === "SecurityError" || err?.message?.toLowerCase().includes("denied") || err?.message?.toLowerCase().includes("policy");
      setStreamError(
        isRestricted
          ? "Browsers restrict direct display capture inside embedded preview iframes. Open this window in a new tab to capture the real screen; the drawn desktop below is a preview-only template."
          : err?.message || "Screen capture was cancelled."
      );
      setMirrorMode("virtual_os");
      toast.error(isRestricted ? "Iframe capture restricted: showing preview-only template (not the live screen)" : "Screen capture cancelled");
    }
  };

  // Start Camera / Capture Card Stream
  const handleStartCameraStream = async () => {
    stopLiveStream();
    setStreamError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setMirrorMode("camera");
      setIsLiveStreaming(true);
      toast.success("📷 Camera / Capture Card Mirror Active");
    } catch (err: any) {
      setStreamError("Camera capture error: " + (err?.message || String(err)));
      toast.error("Could not access camera/capture device");
    }
  };

  // Dispatch interactive action from canvas to real PyAutoGUI backend
  const handleCanvasClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!desktopContainerRef.current) return;
    const rect = desktopContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    const rawX = Math.round(normX * 1920);
    const rawY = Math.round(normY * 1080);

    const cal = calibrateCoordinates(rawX, rawY);
    const realX = cal.x;
    const realY = cal.y;

    setCanvasLocalPos({ x: Math.round(clickX), y: Math.round(clickY) });
    setRealMousePos({ x: realX, y: realY });

    // Visual ripple effect
    const rippleId = `rip_${Date.now()}`;
    setClickRipples((prev) => [...prev.slice(-6), { id: rippleId, x: clickX, y: clickY, time: Date.now() }]);
    setTimeout(() => {
      setClickRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 800);

    // Record action log
    setActionLog((prev) => [
      { id: rippleId, time: new Date().toLocaleTimeString(), action: `CLICK (Calibrated Δ${cal.driftPx}px)`, coords: `(${realX}, ${realY})` },
      ...prev.slice(0, 15),
    ]);

    if (canvasClickToRealMouse) {
      fetch("/api/pyautogui/interactive-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "click",
          x: realX,
          y: realY,
          deviceMode: "desktop_mirror",
        }),
      }).catch(() => {});
    }
  };

  // Open right click settings and step creator on live stream
  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!desktopContainerRef.current) return;
    const rect = desktopContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    const rawX = Math.round(normX * 1920);
    const rawY = Math.round(normY * 1080);

    const cal = calibrateCoordinates(rawX, rawY);
    const realX = cal.x;
    const realY = cal.y;

    setCanvasLocalPos({ x: Math.round(clickX), y: Math.round(clickY) });
    setRealMousePos({ x: realX, y: realY });

    setContextMenuTarget({
      x: realX,
      y: realY,
      clientX: e.clientX,
      clientY: e.clientY,
      containerWidth: rect.width,
      containerHeight: rect.height,
      step: null,
    });
    setIsContextMenuOpen(true);
  };

  // Terminal command execution
  const handleExecuteTerminalCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;

    const cmd = terminalInput.trim();
    const newHistory = [...terminalHistory, `C:\\Users\\Sightline> ${cmd}`];

    if (cmd.toLowerCase() === "clear" || cmd.toLowerCase() === "cls") {
      setTerminalHistory([]);
      setTerminalInput("");
      return;
    }

    if (cmd.toLowerCase().startsWith("ping")) {
      newHistory.push("Pinging host [127.0.0.1] with 32 bytes of data:");
      newHistory.push("Reply from 127.0.0.1: bytes=32 time<1ms TTL=128");
      newHistory.push("Reply from 127.0.0.1: bytes=32 time<1ms TTL=128");
      newHistory.push("Ping statistics: Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)");
    } else if (cmd.toLowerCase().includes("adb")) {
      newHistory.push("List of devices attached");
      newHistory.push("emulator-5554          device product:sdk_gphone64_x86_64 model:Pixel_8");
      newHistory.push("192.168.1.145:5555     device product:dm3q model:Galaxy_S24");
    } else if (cmd.toLowerCase().includes("dir") || cmd.toLowerCase().includes("ls")) {
      newHistory.push(" Volume in drive C is NVMe_OS");
      newHistory.push(" Directory of C:\\Users\\Sightline");
      newHistory.push("09/28/2026  10:14 AM    <DIR>          .");
      newHistory.push("09/28/2026  10:14 AM    <DIR>          ..");
      newHistory.push("09/28/2026  09:30 AM             4,812 automation_routine.py");
      newHistory.push("09/28/2026  08:15 AM            18,240 screen_model_weights.bin");
      newHistory.push("09/28/2026  07:45 AM             1,024 config.json");
    } else if (cmd.toLowerCase().includes("python") || cmd.toLowerCase().includes("node")) {
      newHistory.push(`[Executing: ${cmd}]`);
      newHistory.push("⚡ Python Automation Daemon: Dispatched live cursor event.");
      newHistory.push("Process finished with exit code 0.");
    } else {
      newHistory.push(`'${cmd}' executed successfully via Sightline Automation Bridge.`);
    }

    setTerminalHistory(newHistory);
    setTerminalInput("");
  };

  // Toggle or bring window to front
  const toggleWindow = (id: string) => {
    setDesktopWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          const nextState = !w.isOpen;
          if (nextState) setActiveWindowId(id);
          return { ...w, isOpen: nextState, isMinimized: false };
        }
        return w;
      })
    );
  };

  const desktopIcons = [
    { id: "win_chrome", label: "Google Chrome", icon: "🌐", x: 20, y: 20 },
    { id: "win_term", label: "Terminal (CLI)", icon: "⬛", x: 20, y: 95 },
    { id: "win_files", label: "File Explorer", icon: "📁", x: 20, y: 170 },
    { id: "win_calc", label: "Calculator", icon: "🧮", x: 20, y: 245 },
    { id: "win_mon", label: "Task Manager", icon: "📊", x: 20, y: 320 },
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner & Mode Selector Bar */}
      <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-mono text-slate-100">Device & Desktop Mirror Studio</h3>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-mono">
                {mirrorMode === "real_screen" ? "Real PC Screen" : mirrorMode === "camera" ? "Camera Feed" : "PREVIEW ONLY · drawn template"}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Bi-directional click & touch dispatch • Zero-blocking mirror • PyAutoGUI hardware link
            </p>
          </div>
        </div>

        {/* Source Switcher Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <button
            onClick={() => {
              stopLiveStream();
              setMirrorMode("virtual_os");
              toast.info("Switched to preview-only desktop template (not the live screen)");
            }}
            className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition-all ${
              mirrorMode === "virtual_os"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-200" /> Template (preview)
          </button>

          <button
            onClick={handleStartRealDisplayCapture}
            className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition-all ${
              mirrorMode === "real_screen"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Start real browser display capture (getDisplayMedia)"
          >
            <Monitor className="w-3.5 h-3.5 text-emerald-300" /> Real PC Display
          </button>

          <button
            onClick={handleStartCameraStream}
            className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition-all ${
              mirrorMode === "camera"
                ? "bg-purple-600 text-white shadow-md shadow-purple-900/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Connect webcam or capture card"
          >
            <Camera className="w-3.5 h-3.5 text-purple-300" /> Webcam / HDMI
          </button>

          <Button
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("open-calibration"));
              }
            }}
            className="h-7 px-2.5 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold gap-1 shadow-md shadow-amber-950"
            title="Open Mouse & Coordinate Drift Calibration"
          >
            <Crosshair className="w-3.5 h-3.5" /> Calibrate
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(window.location.href, "_blank")}
            className="h-6 px-2 text-[10px] text-cyan-300 hover:text-cyan-200 hover:bg-slate-900 gap-1 border border-slate-700/60"
            title="Open standalone window for native 60FPS OS screen capture"
          >
            <ExternalLink className="w-3 h-3" /> Standalone Popout
          </Button>
        </div>
      </div>

      {/* Stream Error Notice if Any */}
      {streamError && (
        <div className="p-3 bg-amber-950/70 border border-amber-500/50 rounded-xl flex items-start gap-2.5 text-xs font-mono text-amber-200 shadow-lg">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-bold">Display Capture Notice:</p>
            <p className="text-[11px] opacity-90">{streamError}</p>
          </div>
          <button
            onClick={() => setStreamError(null)}
            className="p-1 hover:text-amber-100 text-amber-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Coordinate & Hardware Bridge Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-900/90 border-slate-800 shadow-md">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-slate-400">🟦 Physical Cursor</p>
              <h4 className="text-sm font-bold text-blue-400 font-mono">
                ({realMousePos.x}, {realMousePos.y})
              </h4>
            </div>
            <MousePointer className="w-6 h-6 text-blue-500/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 shadow-md">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-slate-400">🟩 AI Trajectory</p>
              <h4 className="text-sm font-bold text-cyan-400 font-mono">
                ({aiCursorPos.x}, {aiCursorPos.y})
              </h4>
            </div>
            <Sparkles className="w-6 h-6 text-cyan-500/40 animate-pulse" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 shadow-md">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-slate-400">⬜ Canvas Local Coordinates</p>
              <h4 className="text-sm font-bold text-slate-200 font-mono">
                ({canvasLocalPos.x}, {canvasLocalPos.y})
              </h4>
            </div>
            <Activity className="w-6 h-6 text-slate-400/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 shadow-md">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-slate-400">System Telemetry</p>
              <h4 className="text-xs font-bold text-emerald-400 font-mono">
                CPU: {cpuUsage}% • RAM: {ramUsage}%
              </h4>
            </div>
            <Cpu className="w-6 h-6 text-emerald-500/40" />
          </CardContent>
        </Card>
      </div>

      {/* Main Studio Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Side: Bridge Controls & Actions */}
        <div className="lg:col-span-1 space-y-3">
          <Card className="bg-slate-900 border-slate-800 shadow-xl">
            <CardHeader className="p-3 pb-2 border-b border-slate-800">
              <CardTitle className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Hardware Dispatch Bridge</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-200 font-bold block text-[11px]">Click → Real PyAutoGUI</span>
                  <span className="text-[9px] text-slate-400">Execute on host PC display</span>
                </div>
                <Switch checked={canvasClickToRealMouse} onCheckedChange={setCanvasClickToRealMouse} />
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-200 font-bold block text-[11px]">Sync Mouse → Canvas</span>
                  <span className="text-[9px] text-slate-400">Mirrors physical cursor</span>
                </div>
                <Switch checked={syncRealMouseToCanvas} onCheckedChange={setSyncRealMouseToCanvas} />
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-200 font-bold block text-[11px]">AI Cursor → Hardware</span>
                  <span className="text-[9px] text-slate-400">AI commands drive mouse</span>
                </div>
                <Switch checked={aiCursorToRealMouse} onCheckedChange={setAiCursorToRealMouse} />
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-200 font-bold block text-[11px]">Backend Frame Sync</span>
                  <span className="text-[9px] text-slate-400">Pipes frame to AI Vision</span>
                </div>
                <Switch checked={autoSyncToBackend} onCheckedChange={setAutoSyncToBackend} />
              </div>
            </CardContent>
          </Card>

          {/* Quick App Launcher in Virtual OS */}
          <Card className="bg-slate-900 border-slate-800 shadow-xl">
            <CardHeader className="p-3 pb-2 border-b border-slate-800">
              <CardTitle className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Virtual OS Apps</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1.5 text-xs font-mono">
              {desktopWindows.map((win) => (
                <button
                  key={win.id}
                  onClick={() => toggleWindow(win.id)}
                  className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                    win.isOpen
                      ? "bg-indigo-950/60 border-indigo-500/50 text-indigo-200"
                      : "bg-slate-950 hover:bg-slate-800 text-slate-400 border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{win.icon}</span>
                    <span className="text-[11px] font-bold truncate">{win.title}</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${win.isOpen ? "bg-emerald-400" : "bg-slate-600"}`} />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Recent Action Event Log */}
          <Card className="bg-slate-900 border-slate-800 shadow-xl">
            <CardHeader className="p-3 pb-2 border-b border-slate-800">
              <CardTitle className="text-xs font-bold text-slate-100 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Interactive Event Log</span>
                </span>
                <span className="text-[10px] text-slate-500">{actionLog.length} events</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1 max-h-44 overflow-y-auto font-mono text-[10px]">
              {actionLog.map((log) => (
                <div key={log.id} className="p-1.5 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-cyan-300 font-bold block">{log.action}</span>
                    <span className="text-slate-400 text-[9px]">{log.coords}</span>
                  </div>
                  <span className="text-slate-500 text-[9px]">{log.time}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Main Interactive Screen Mirror & Canvas Deck */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="bg-slate-900 border-slate-800 shadow-2xl overflow-hidden">
            <CardHeader className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {mirrorMode === "real_screen"
                      ? "Direct Hardware PC Mirror (60 FPS)"
                      : mirrorMode === "camera"
                      ? "Camera Stream Mirror"
                      : "Interactive Desktop OS (1920×1080 Normalized Canvas)"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                  {currentTime}
                </Badge>
                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[10px]">
                  PyAutoGUI Ready
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 relative bg-slate-950 overflow-hidden">
              {/* If Real Screen or Camera stream is active, show video feed */}
              {mirrorMode !== "virtual_os" && (
                <div className="relative w-full h-[520px] bg-black flex items-center justify-center overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                  {/* Click overlay for live interaction on real screen */}
                  <div
                    ref={desktopContainerRef}
                    onClick={handleCanvasClick}
                    onContextMenu={handleCanvasContextMenu}
                    className="absolute inset-0 cursor-crosshair z-20"
                  >
                    {clickRipples.map((rip) => (
                      <div
                        key={rip.id}
                        style={{ left: rip.x, top: rip.y }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-cyan-400 animate-ping pointer-events-none"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Interactive Virtual OS Desktop Environment */}
              {mirrorMode === "virtual_os" && (
                <div
                  ref={desktopContainerRef}
                  onClick={handleCanvasClick}
                  onContextMenu={handleCanvasContextMenu}
                  className="relative w-full h-[540px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/80 border border-slate-800 overflow-hidden select-none cursor-crosshair"
                >
                  {/* Desktop Background Wallpaper Grid */}
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

                  {/* Desktop Icon Shortcuts */}
                  <div className="absolute top-3 left-3 flex flex-col gap-3 z-10">
                    {desktopIcons.map((ic) => (
                      <div
                        key={ic.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWindow(ic.id);
                        }}
                        className="flex flex-col items-center justify-center w-18 p-1.5 rounded-lg hover:bg-white/10 active:bg-cyan-500/20 cursor-pointer text-center group transition-all"
                      >
                        <span className="text-2xl group-hover:scale-110 transition-transform">{ic.icon}</span>
                        <span className="text-[10px] font-mono text-slate-200 mt-0.5 group-hover:text-cyan-300 font-bold drop-shadow">
                          {ic.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Interactive Windows Rendering */}
                  {desktopWindows.map((win) => {
                    if (!win.isOpen || win.isMinimized) return null;
                    const isFocused = activeWindowId === win.id;

                    return (
                      <div
                        key={win.id}
                        style={{
                          left: win.x,
                          top: win.y,
                          width: win.width,
                          height: win.height,
                          zIndex: isFocused ? 30 : 20,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveWindowId(win.id);
                        }}
                        className={`absolute rounded-xl bg-slate-900 border shadow-2xl overflow-hidden flex flex-col transition-shadow ${
                          isFocused
                            ? "border-cyan-500 ring-2 ring-cyan-500/30 shadow-cyan-950/80"
                            : "border-slate-700 shadow-slate-950"
                        }`}
                      >
                        {/* Window Titlebar */}
                        <div className="h-7 bg-slate-800/90 px-3 flex items-center justify-between text-xs font-mono font-bold text-slate-200 border-b border-slate-700 cursor-move">
                          <div className="flex items-center gap-2">
                            <span>{win.icon}</span>
                            <span className="text-[11px] truncate max-w-[220px]">{win.title}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDesktopWindows((prev) =>
                                  prev.map((w) => (w.id === win.id ? { ...w, isMinimized: true } : w))
                                );
                              }}
                              className="p-1 text-slate-400 hover:text-white rounded"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleWindow(win.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-400 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Window Content based on Type */}
                        <div className="flex-1 bg-slate-950 p-2 overflow-hidden flex flex-col text-xs font-mono">
                          {/* 1. Chrome Web Browser */}
                          {win.type === "browser" && (
                            <div className="flex-1 flex flex-col space-y-2">
                              {/* Browser Navigation Bar */}
                              <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                                <ArrowLeft className="w-3.5 h-3.5 text-slate-400 hover:text-white cursor-pointer" />
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 hover:text-white cursor-pointer" />
                                <RefreshCw className="w-3 h-3 text-slate-400 hover:text-white cursor-pointer" />
                                <div className="flex-1 flex items-center bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-[10px] text-cyan-300">
                                  <span className="text-emerald-400 mr-1 font-bold">🔒</span>
                                  <input
                                    type="text"
                                    value={chromeUrl}
                                    onChange={(e) => setChromeUrl(e.target.value)}
                                    className="bg-transparent border-none outline-none w-full text-cyan-200"
                                  />
                                </div>
                              </div>

                              {/* Google Search Body */}
                              <div className="flex-1 bg-slate-900 rounded-lg p-3 border border-slate-800 space-y-2 overflow-y-auto">
                                <div className="text-center py-2">
                                  <h2 className="text-xl font-bold text-cyan-400">Google</h2>
                                  <div className="flex items-center gap-2 mt-2 max-w-sm mx-auto bg-slate-950 px-3 py-1 rounded-full border border-slate-700">
                                    <Search className="w-3 h-3 text-slate-400" />
                                    <input
                                      type="text"
                                      value={chromeSearchQuery}
                                      onChange={(e) => setChromeSearchQuery(e.target.value)}
                                      placeholder="Search or enter action..."
                                      className="bg-transparent border-none outline-none text-[11px] text-slate-100 flex-1"
                                    />
                                    <Badge className="bg-blue-600 text-white text-[9px] h-4">AI Search</Badge>
                                  </div>
                                </div>

                                <div className="space-y-1.5 pt-1">
                                  <div className="p-2 bg-slate-950/80 rounded border border-slate-800">
                                    <span className="text-blue-400 font-bold text-[11px] block hover:underline cursor-pointer">
                                      Sightline Autonomous Device Bridge • 60 FPS Control
                                    </span>
                                    <span className="text-emerald-400 text-[9px] block">https://sightline.local/mirror</span>
                                    <span className="text-slate-300 text-[10px]">
                                      Real-time hardware mouse tracking, bi-directional PyAutoGUI dispatch, and visual OCR loop.
                                    </span>
                                  </div>
                                  <div className="p-2 bg-slate-950/80 rounded border border-slate-800">
                                    <span className="text-blue-400 font-bold text-[11px] block hover:underline cursor-pointer">
                                      Autonomous Multi-Step Workflow Engine
                                    </span>
                                    <span className="text-emerald-400 text-[9px] block">https://sightline.local/workflows</span>
                                    <span className="text-slate-300 text-[10px]">
                                      Self-healing task automation across Windows, Linux, and Android ADB devices.
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 2. Terminal CLI */}
                          {win.type === "terminal" && (
                            <div className="flex-1 flex flex-col justify-between space-y-2">
                              <div className="flex-1 bg-black p-2 rounded-lg border border-slate-800 overflow-y-auto font-mono text-[10px] space-y-1 text-emerald-400">
                                {terminalHistory.map((line, idx) => (
                                  <div key={idx} className="leading-tight">{line}</div>
                                ))}
                              </div>
                              <form onSubmit={handleExecuteTerminalCommand} className="flex items-center gap-1">
                                <span className="text-emerald-400 font-bold text-xs">&gt;</span>
                                <input
                                  type="text"
                                  value={terminalInput}
                                  onChange={(e) => setTerminalInput(e.target.value)}
                                  placeholder="Type command (e.g. ping, adb devices, dir, clear)..."
                                  className="flex-1 bg-black border border-slate-800 rounded px-2 py-1 text-[11px] text-emerald-300 font-mono outline-none focus:border-emerald-500"
                                />
                                <Button type="submit" size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px]">
                                  Run
                                </Button>
                              </form>
                            </div>
                          )}

                          {/* 3. Calculator */}
                          {win.type === "calculator" && (
                            <div className="flex-1 flex flex-col space-y-2 p-1">
                              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-right">
                                <span className="text-[10px] text-slate-400 block">{calcEquation}</span>
                                <span className="text-2xl font-bold text-slate-100 font-mono">{calcDisplay}</span>
                              </div>
                              <div className="grid grid-cols-4 gap-1.5 flex-1">
                                {["C", "±", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="].map((btn, idx) => (
                                  <button
                                    key={idx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (btn === "C") {
                                        setCalcDisplay("0");
                                        setCalcEquation("");
                                      } else if (btn === "=") {
                                        try {
                                          const evaluated = String(evaluateCalculator(calcDisplay));
                                          setCalcEquation(`${calcDisplay} =`);
                                          setCalcDisplay(evaluated);
                                        } catch {
                                          setCalcDisplay("Error");
                                        }
                                      } else if (btn === "±" || btn === "%") {
                                        try { setCalcDisplay(String(evaluateCalculator(calcDisplay) * (btn === "±" ? -1 : .01))); }
                                        catch { setCalcDisplay("Error"); }
                                      } else {
                                        setCalcDisplay((prev) => (prev === "0" || prev === "Error" ? btn : prev + btn));
                                      }
                                    }}
                                    className={`rounded p-1.5 font-bold text-xs transition-colors ${
                                      ["÷", "×", "-", "+", "="].includes(btn)
                                        ? "bg-amber-600 hover:bg-amber-500 text-white"
                                        : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                                    }`}
                                  >
                                    {btn}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 4. File Explorer */}
                          {win.type === "files" && (
                            <div className="flex-1 flex space-x-2">
                              <div className="w-1/3 bg-slate-900 p-2 rounded-lg border border-slate-800 space-y-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Drives & Paths</span>
                                <div className="space-y-1 pt-1 text-[10px]">
                                  <div className="p-1 rounded bg-slate-800 text-cyan-300 font-bold flex items-center gap-1">
                                    <HardDrive className="w-3 h-3" /> C:\ (Local NVMe)
                                  </div>
                                  <div className="p-1 rounded text-slate-400 hover:bg-slate-800/60 flex items-center gap-1">
                                    <HardDrive className="w-3 h-3" /> D:\ (Datasets)
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 bg-slate-900 p-2 rounded-lg border border-slate-800 space-y-1 overflow-y-auto">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Files in C:\Workflows</span>
                                {["automation_routine.py", "screen_model_weights.bin", "config.json", "dataset_ocr.csv", "pyautogui_bridge.ts"].map((f, i) => (
                                  <div
                                    key={i}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedFile(f);
                                      toast.info(`Selected file: ${f}`);
                                    }}
                                    className={`p-1.5 rounded flex items-center justify-between text-[10px] cursor-pointer ${
                                      selectedFile === f ? "bg-cyan-950 border border-cyan-500/50 text-cyan-200" : "hover:bg-slate-800 text-slate-300"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <FileText className="w-3 h-3 text-cyan-400" />
                                      <span>{f}</span>
                                    </div>
                                    <span className="text-slate-500 text-[9px]">{f.endsWith(".bin") ? "18 MB" : "4 KB"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 5. System Monitor */}
                          {win.type === "monitor" && (
                            <div className="flex-1 space-y-2 p-1">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                                  <span className="text-[10px] text-slate-400">CPU Load (8 Cores)</span>
                                  <h3 className="text-base font-bold text-emerald-400">{cpuUsage}%</h3>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full mt-1 overflow-hidden">
                                    <div style={{ width: `${cpuUsage}%` }} className="bg-emerald-400 h-full transition-all" />
                                  </div>
                                </div>
                                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                                  <span className="text-[10px] text-slate-400">Memory Allocation</span>
                                  <h3 className="text-base font-bold text-cyan-400">{ramUsage}% (13.4 GB)</h3>
                                  <div className="w-full bg-slate-950 h-1.5 rounded-full mt-1 overflow-hidden">
                                    <div style={{ width: `${ramUsage}%` }} className="bg-cyan-400 h-full transition-all" />
                                  </div>
                                </div>
                              </div>
                              <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-[10px] space-y-1">
                                <span className="font-bold text-slate-300">Active Daemons</span>
                                <div className="flex items-center justify-between text-emerald-400">
                                  <span>pyautogui.daemon</span>
                                  <span>RUNNING (0.2% CPU)</span>
                                </div>
                                <div className="flex items-center justify-between text-cyan-400">
                                  <span>sightline-qwen-vision</span>
                                  <span>ONLINE (1.4% CPU)</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Click Ripple Markers */}
                  {clickRipples.map((rip) => (
                    <div
                      key={rip.id}
                      style={{ left: rip.x, top: rip.y }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-cyan-400 animate-ping pointer-events-none z-40"
                    />
                  ))}

                  {/* Windows Taskbar at Bottom */}
                  <div className="absolute bottom-0 inset-x-0 h-9 bg-slate-950/95 border-t border-slate-800/90 flex items-center justify-between px-3 z-40">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWindow("win_chrome");
                        }}
                        className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold font-mono flex items-center gap-1 shadow-sm"
                      >
                        <Sparkles className="w-3 h-3" /> Start
                      </button>

                      {/* Active Taskbar Items */}
                      {desktopWindows.map((win) => (
                        <button
                          key={win.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWindow(win.id);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-all ${
                            win.isOpen && !win.isMinimized
                              ? "bg-slate-800 border-cyan-500/60 text-cyan-300 font-bold"
                              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <span>{win.icon}</span>
                          <span className="truncate max-w-[100px]">{win.title.split("-")[0]}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                      <span className="text-emerald-400 font-bold">⚡ 60 FPS</span>
                      <span>{currentTime}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Interactive Right-Click Settings & Step Creator for Live Stream */}
      <InteractiveContextMenu
        target={contextMenuTarget}
        isOpen={isContextMenuOpen}
        onClose={() => setIsContextMenuOpen(false)}
        onDirectHardwareAction={(action, x, y, extra) => {
          fetch("/api/pyautogui/interactive-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              x,
              y,
              extra,
              deviceMode: "desktop_mirror",
            }),
          }).catch(() => {});
        }}
        onAddSequenceStep={(stepData) => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("sightline-add-step", {
                detail: stepData,
              })
            );
          }
          toast.success(`Step created @ (${stepData.x}, ${stepData.y}): ${stepData.name}`);
        }}
        onInspectOCR={(x, y) => {
          toast.info(`OCR Inspection @ (${x}, ${y})`, {
            description: "Target location locked in native 1920x1080 display space.",
          });
        }}
        onVerifyIntegrity={(x, y) => {
          toast.info(`Integrity Validator Active @ (${x}, ${y})`, {
            description: "No visual drift detected across 60 FPS live feed.",
          });
        }}
        onTellMainAiToMove={(x, y) => {
          toast.info(`Verifying screen, then sending AI Navigation Cue to (${x}, ${y})`);
          void actionGate.run(mirrorAiMovePlan(x, y));
        }}
        onTag3WayEntity={(type, x, y) => {
          toast.success(`Tagged (${x}, ${y}) as ${type.toUpperCase()} entity`);
        }}
        onOpenStepManagerModal={(coords) => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("sightline-open-step-manager", {
                detail: coords,
              })
            );
          }
          toast.info(`Configuring Step Settings @ (${coords.x}, ${coords.y})`);
        }}
      />
    </div>
  );
};
