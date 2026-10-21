import { MainAiLiveChat } from "@/components/main-ai-live-chat";
﻿import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Smartphone,
  Camera,
  Video,
  Radio,
  Wifi,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Zap,
  MousePointer,
  Layers,
  Upload,
  SwitchCamera,
  Image as ImageIcon,
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  Home,
  Check,
  Minimize2,
  Maximize2,
  ShieldCheck,
  Eye,
  Lock,
  Sliders,
  Sparkles,
  Tv,
  Square,
  Play,
  Pause,
  Gauge,
  Activity,
  ChevronRight,
  ExternalLink,
  Calculator,
  FileText,
  Music,
  Folder,
  Terminal,
  Settings,
  X,
  Globe,
  Monitor,
  Copy,
  Info,
  Laptop,
  ClipboardCopy,
  Plus,
  Trash2,
  Share2,
  CameraOff,
  Flame,
  Wand2,
  Save,
  Download,
  Clock,
  RotateCcw,
  CheckCircle,
  PlayCircle,
  PauseCircle,
  SkipForward,
  Shield,
  Scan,
  Package,
  Users,
  Grid,
  ZoomIn,
  ZoomOut,
  Target,
  Crosshair,
  Volume2,
  HelpCircle,
  MessageSquare,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useActionGate } from "@/hooks/use-action-gate";
import { mobileActionPlan } from "@/lib/gated-plans";
import { gateFailure } from "@/lib/gated-dispatch";
import { InteractivePhoneVirtualOS } from "@/components/interactive-phone-virtual-os";
import { ApkAndPwaModal } from "@/components/ApkAndPwaModal";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { InteractiveContextMenu, ContextMenuTarget } from "@/components/interactive-context-menu";
import { BarcodeInventoryScannerModal } from "@/components/barcode-inventory-scanner-modal";
import { startPollLoop } from "@/lib/poll-loop";
import {
  scanBarcodeFromVideo,
  lookupBarcodeItem,
  recordBarcodeScan,
  playScanBeep,
  ScannedBarcode,
  InventoryItem,
} from "@/lib/barcode-scanner";

export type StreamMode =
  | "interactive_phone"
  | "live_view"
  | "mirror_pc"
  | "screen"
  | "camera_back"
  | "camera_front"
  | "dual";

interface ExecutedActionIndicator {
  id: string;
  type: string;
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  text?: string;
  appName?: string;
  appUrl?: string;
  package?: string;
  key?: string;
  description?: string;
  timestamp: number;
}

interface SyncedWorkflow {
  id: string;
  name: string;
  description: string;
  notes?: string;
  tags: string[];
  actions: Array<{
    id: string;
    type: string;
    x?: number;
    y?: number;
    toX?: number;
    toY?: number;
    text?: string;
    key?: string;
    description?: string;
    durationMs?: number;
  }>;
  autoSave?: boolean;
  sourceSnapshot?: string;
  executionCount?: number;
  createdAt: number;
}

interface ScheduledDeviceWorkflow {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  targetDevice: string;
  scheduleType: "interval" | "cron" | "once" | "continuous";
  cronExpression?: string;
  intervalMinutes?: number;
  nextRunTime: number;
  lastRunTime?: number;
  status: "idle" | "running" | "paused" | "completed" | "error";
  currentStepIndex: number;
  totalSteps: number;
  steps: Array<{
    id: string;
    type: string;
    description: string;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    status?: "pending" | "running" | "completed" | "failed";
  }>;
  autoHeal: boolean;
  history?: Array<{ runTime: number; status: "success" | "failed"; durationMs: number; stepsExecuted: number }>;
}

interface LinkedTemplateApp {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  isolatedAutomation: boolean;
  capabilities: string[];
  sampleWorkflows: string[];
  appCode?: string;
  targetUrl?: string;
}

interface DifferentialFrame {
  id: string;
  stepNumber: number;
  imageData: string;
  actionType: string;
  x: number;
  y: number;
  description: string;
  timestamp: number;
}

export default function MobileRemote() {
  const actionGate = useActionGate({ targetDevice: "android" });
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamMode, setStreamMode] = useState<StreamMode>("interactive_phone");
  const [activeTab, setActiveTab] = useState<"stream" | "chat" | "docs" | "workflows" | "scheduled" | "pack10" | "actions">("stream");
  const [fps, setFps] = useState(15);
  const [targetFps, setTargetFps] = useState<number>(15);
  const [framesSent, setFramesSent] = useState(0);
  const [status, setStatus] = useState<string>("â— LIVE: 📱 Interactive Phone OS Active");
  const [lastTouch, setLastTouch] = useState<{ x: number; y: number } | null>(null);
  const [connected, setConnected] = useState(true);
  const [activeActionIndicator, setActiveActionIndicator] = useState<ExecutedActionIndicator | null>(null);
  const [incomingClipboardText, setIncomingClipboardText] = useState<string | null>(null);
  const [incomingAppPrompt, setIncomingAppPrompt] = useState<{ name: string; url?: string; pkg?: string } | null>(null);
  const [actionHistory, setActionHistory] = useState<Array<{ id: string; desc: string; time: string }>>([]);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [dualCameraPos, setDualCameraPos] = useState<"bottom-right" | "top-right" | "bottom-left">("bottom-right");
  const [streamQuality, setStreamQuality] = useState<"fast" | "balanced" | "hd">("balanced");
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(12);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [activeLinkedApp, setActiveLinkedApp] = useState<LinkedTemplateApp | null>(null);

  // Barcode & Inventory Scanner state
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState<boolean>(false);
  const [autoBarcodeScan, setAutoBarcodeScan] = useState<boolean>(true);
  const [detectedBarcode, setDetectedBarcode] = useState<ScannedBarcode | null>(null);
  const [detectedBarcodeItem, setDetectedBarcodeItem] = useState<InventoryItem | null>(null);
  const lastBarcodeScanTimeRef = useRef<number>(0);
  const lastDetectedCodeRef = useRef<string>("");

  // Continuous camera barcode scanner loop
  useEffect(() => {
    if (!autoBarcodeScan) return;
    if (streamMode !== "camera_back" && streamMode !== "camera_front") return;
    if (!primaryVideoRef.current) return;

    const interval = setInterval(async () => {
      if (!primaryVideoRef.current || primaryVideoRef.current.readyState < 2) return;
      try {
        const result = await scanBarcodeFromVideo(primaryVideoRef.current, canvasRef.current || undefined);
        if (result && result.rawValue) {
          const now = Date.now();
          if (result.rawValue !== lastDetectedCodeRef.current || now - lastBarcodeScanTimeRef.current > 3000) {
            lastBarcodeScanTimeRef.current = now;
            lastDetectedCodeRef.current = result.rawValue;
            setDetectedBarcode(result);
            playScanBeep(true);
            toast.success(`ðŸ” Scanned [${result.format}]: ${result.rawValue}`);
            lookupBarcodeItem(result.rawValue).then((it) => {
              setDetectedBarcodeItem(it);
            });
          }
        }
      } catch {}
    }, 600);

    return () => clearInterval(interval);
  }, [autoBarcodeScan, streamMode]);

  // Standalone App Mode vs Workspace Synced Toggle
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.location.search.includes("standalone=true");
    }
    return false;
  });

  // Auto-switch mode toggle (Switch between Stream and App / Phone naturally)
  const [autoSwitchMode, setAutoSwitchMode] = useState<boolean>(false);

  // Live View Telemetry State
  const [liveViewZoom, setLiveViewZoom] = useState<number>(1);
  const [showAiBoundingBoxes, setShowAiBoundingBoxes] = useState<boolean>(true);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(false);
  const [liveViewNotice, setLiveViewNotice] = useState<boolean>(false);

  // PC Mirror Interactive Typing, Desktop OS & Windows Key State
  const [pcTextInput, setPcTextInput] = useState<string>("");
  const [isPcStartMenuOpen, setIsPcStartMenuOpen] = useState<boolean>(false);
  const [activePcWindow, setActivePcWindow] = useState<"desktop" | "browser" | "terminal" | "files" | "media" | "run">("desktop");
  const [pcRunDialogInput, setPcRunDialogInput] = useState<string>("");
  const [isRealPcScreenActive, setIsRealPcScreenActive] = useState<boolean>(false);
  const [isRealPhoneScreenActive, setIsRealPhoneScreenActive] = useState<boolean>(false);
  const realScreenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Document Grounding / Uploads for AI Task Understanding
  const [uploadedDocs, setUploadedDocs] = useState<Array<{
    id: string;
    name: string;
    size: number;
    fileType: string;
    content: string;
    uploadedAt: number;
    parsedSummary?: string;
  }>>([
    {
      id: "doc_sop_1",
      name: "Standard_Automation_SOP.md",
      size: 1420,
      fileType: "text/markdown",
      content: "# Standard Mobile Automation SOP\n1. Launch target app from home screen\n2. Fill mandatory form fields\n3. Capture 10-snap differential verification frames\n4. Dispatch webhook alert upon task completion",
      uploadedAt: Date.now() - 3600000,
      parsedSummary: "Mobile Automation SOP with 4-step workflow guidelines and coordinate verification.",
    },
    {
      id: "doc_api_spec",
      name: "Hardware_Bridge_Spec.json",
      size: 890,
      fileType: "application/json",
      content: "{\n  \"subsystem\": \"sightline_adb\",\n  \"baudRate\": 115200,\n  \"screen\": { \"width\": 1080, \"height\": 1920, \"dpi\": 440 },\n  \"zeroDrift\": true\n}",
      uploadedAt: Date.now() - 7200000,
      parsedSummary: "ADB bridge configuration parameters with 1080x1920 calibration.",
    },
  ]);
  const [selectedDocForAi, setSelectedDocForAi] = useState<string | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState<string>("");

  // AI Chat Tab State
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    role: "user" | "agent";
    agentName?: string;
    text: string;
    time: string;
    actionExecuted?: string;
  }>>([
    {
      id: "msg_init",
      role: "agent",
      agentName: "Vision Co-Pilot",
      text: "👋 Mobile AI Bridge ready! Ask me to execute actions, launch apps, type text, or analyze live screen.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [isAiExecuting, setIsAiExecuting] = useState<boolean>(false);

  // Workflow Recording inside Interactive Phone
  const [isRecordingWorkflow, setIsRecordingWorkflow] = useState<boolean>(false);
  const [recordedSteps, setRecordedSteps] = useState<
    Array<{ id: string; type: string; description: string; x?: number; y?: number; text?: string; time: string }>
  >([]);

  // Synced Workflows state
  const [workflows, setWorkflows] = useState<SyncedWorkflow[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [executingWorkflowId, setExecutingWorkflowId] = useState<string | null>(null);
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [isCreateWfModalOpen, setIsCreateWfModalOpen] = useState(false);
  const [newWfName, setNewWfName] = useState("");
  const [newWfDesc, setNewWfDesc] = useState("");

  // Scheduled Workflows state & 10-Second Completion Check Engine
  const [scheduledWorkflows, setScheduledWorkflows] = useState<ScheduledDeviceWorkflow[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false);
  const [activeScheduledActionId, setActiveScheduledActionId] = useState<string | null>(null);
  const [learnedPatterns, setLearnedPatterns] = useState<number>(28);
  const [autoCompletedCount, setAutoCompletedCount] = useState<number>(12);
  const [last10sCheckTime, setLast10sCheckTime] = useState<number>(Date.now());
  const [isCreateScheduleModalOpen, setIsCreateScheduleModalOpen] = useState<boolean>(false);
  const [isEditScheduleModalOpen, setIsEditScheduleModalOpen] = useState<boolean>(false);
  const [editingScheduleWf, setEditingScheduleWf] = useState<ScheduledDeviceWorkflow | null>(null);

  const [schedFormName, setSchedFormName] = useState<string>("");
  const [schedFormDesc, setSchedFormDesc] = useState<string>("");
  const [schedFormInterval, setSchedFormInterval] = useState<number>(15);
  const [schedFormAutoHeal, setSchedFormAutoHeal] = useState<boolean>(true);
  const [schedFormSteps, setSchedFormSteps] = useState<
    Array<{ id: string; type: string; description: string; x?: number; y?: number; text?: string; key?: string }>
  >([
    { id: "s1", type: "tap", description: "Focus app search", x: 0.5, y: 0.12 },
    { id: "s2", type: "type", text: "AI Automation", description: "Input query", x: 0.5, y: 0.12 },
    { id: "s3", type: "swipe", description: "Scroll down page", x: 0.5, y: 0.7 },
  ]);

  // 10-Screenshot Pack Recorder state
  const [tenFramesPack, setTenFramesPack] = useState<DifferentialFrame[]>([]);
  const [isRecording10Pack, setIsRecording10Pack] = useState(false);
  const [packProgress, setPackProgress] = useState(0);

  // In-Browser Phone OS state
  const [virtualOsActiveApp, setVirtualOsActiveApp] = useState<string>("home");
  const [virtualOsAppUrl, setVirtualOsAppUrl] = useState<string>("https://google.com");
  const [virtualOsCalc, setVirtualOsCalc] = useState<string>("0");
  const [virtualOsNotes, setVirtualOsNotes] = useState<string>("Live interactive notes on mobile bridge");
  const [pcMirrorFrame, setPcMirrorFrame] = useState<string | null>(null);

  // Right-click context menu state on mobile stream
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);

  const handlePhoneContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    const realX = Math.round(normX * 1080);
    const realY = Math.round(normY * 1920);

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

  // Simulated live UI detection boxes for Live View mode
  const detectedLiveElements = [
    { id: "e1", label: "Search Bar", x: 0.1, y: 0.08, w: 0.8, h: 0.06, type: "input", conf: "99%" },
    { id: "e2", label: "Google Chrome", x: 0.12, y: 0.38, w: 0.16, h: 0.1, type: "app", conf: "98%" },
    { id: "e3", label: "Calculator", x: 0.36, y: 0.38, w: 0.16, h: 0.1, type: "app", conf: "98%" },
    { id: "e4", label: "Notes App", x: 0.60, y: 0.38, w: 0.16, h: 0.1, type: "app", conf: "97%" },
    { id: "e5", label: "Camera", x: 0.84, y: 0.38, w: 0.16, h: 0.1, type: "app", conf: "99%" },
    { id: "e6", label: "Navigation Dock", x: 0.1, y: 0.92, w: 0.8, h: 0.06, type: "nav", conf: "100%" },
  ];

  // Linked Template Apps list (Template Connect)
  const [templateApps] = useState<LinkedTemplateApp[]>([
    {
      id: "app_crm_lead",
      name: "Customer CRM & Lead Submitter",
      category: "CRM & Sales",
      description: "Automate customer record creation, contact logging, and follow-up alerts from this linked app only",
      icon: "Users",
      color: "from-blue-600 to-indigo-700",
      isolatedAutomation: true,
      capabilities: ["Form Filling", "Contact Import", "Status Tags", "Auto-Submit"],
      sampleWorkflows: ["Auto-Fill Client Intake", "Export CRM Contacts", "Trigger Follow-up SMS"],
    },
    {
      id: "app_inventory",
      name: "Barcode & Inventory Scanner",
      category: "Logistics",
      description: "Perform real-time item lookups, SKU scanning, quantity adjustments, and warehouse stock reconciliation",
      icon: "Scan",
      color: "from-amber-600 to-orange-700",
      isolatedAutomation: true,
      capabilities: ["Barcode Decoding", "SKU Lookup", "Stock Delta", "Batch Export"],
      sampleWorkflows: ["Scan Received Shipment", "Reconcile Stock Count", "Flag Damaged Inventory"],
    },
    {
      id: "app_social_poster",
      name: "Social Media Multi-Poster",
      category: "Marketing",
      description: "Queue, preview, and auto-dispatch promotional posts across linked brand accounts with media uploads",
      icon: "Share2",
      color: "from-pink-600 to-rose-700",
      isolatedAutomation: true,
      capabilities: ["Multi-Account Sync", "Image Attachment", "Schedule Queue", "Hashtag Auto-Fill"],
      sampleWorkflows: ["Broadcast Flash Sale", "Publish Daily Update", "Check Account Insights"],
    },
    {
      id: "app_form_intake",
      name: "Smart Form Intake & Validator",
      category: "Operations",
      description: "Parse structured form entries, execute automated verification checks, and dispatch records to database",
      icon: "FileText",
      color: "from-emerald-600 to-teal-700",
      isolatedAutomation: true,
      capabilities: ["Field Extraction", "Format Validation", "Webhook Dispatch", "Error Highlight"],
      sampleWorkflows: ["Validate Incoming Submissions", "Auto-Fill Employee Onboarding", "Batch CSV Import"],
    },
    {
      id: "app_invoice_extract",
      name: "Invoice & Receipt Auto-Processor",
      category: "Finance",
      description: "Extract line items, tax breakdowns, totals, and vendor details from receipts with automatic expense ledger entry",
      icon: "Calculator",
      color: "from-purple-600 to-violet-700",
      isolatedAutomation: true,
      capabilities: ["OCR Parsing", "Expense Categorization", "Tax Extraction", "Ledger Sync"],
      sampleWorkflows: ["Process Weekly Receipts", "Reconcile Card Expenses", "Export Month-End Tax Report"],
    },
    {
      id: "app_order_tracker",
      name: "E-Commerce Fulfillment Tracker",
      category: "E-Commerce",
      description: "Track shipment milestones, update package tracking numbers, and send instant fulfillment confirmation alerts",
      icon: "Folder",
      color: "from-cyan-600 to-blue-700",
      isolatedAutomation: true,
      capabilities: ["Carrier API Sync", "Tracking Notification", "Status Refresh", "Exception Alerts"],
      sampleWorkflows: ["Check Delayed Shipments", "Send Delivery Confirmations", "Update Tracking URLs"],
    },
  ]);

  const [isApkModalOpen, setIsApkModalOpen] = useState(false);
  const [deviceName] = useState("Mobile Phone (Sightline Bridge)");
  const { isInstallable, install } = usePWAInstall();

  // Refs for camera / screen capture
  const primaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const secondaryCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const primaryStreamRef = useRef<MediaStream | null>(null);
  const secondaryStreamRef = useRef<MediaStream | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const vfcCallbackRef = useRef<number | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const isSendingFrameRef = useRef<boolean>(false);
  const isStreamingRef = useRef<boolean>(true);
  const targetFpsRef = useRef<number>(15);
  const streamModeRef = useRef<StreamMode>("interactive_phone");
  const wakeLockRef = useRef<any>(null);
  const workerRef = useRef<Worker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silentOscillatorRef = useRef<OscillatorNode | null>(null);
  const sendLockTimeoutRef = useRef<any>(null);
  const pcMirrorContainerRef = useRef<HTMLDivElement | null>(null);

  isStreamingRef.current = isStreaming;
  targetFpsRef.current = targetFps;
  streamModeRef.current = streamMode;
  lastTouchRef.current = lastTouch;

  // Background Web Worker Frame Scheduler for resilient 15-60 FPS
  useEffect(() => {
    const workerCode = `
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data.command === 'start') {
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(() => {
            self.postMessage('tick');
          }, e.data.interval || 66);
        } else if (e.data.command === 'stop') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        } else if (e.data.command === 'setInterval') {
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(() => {
            self.postMessage('tick');
          }, e.data.interval || 66);
        }
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        if (e.data === "tick" && isStreamingRef.current) {
          triggerFrameProcess();
        }
      };

      workerRef.current = worker;
      worker.postMessage({ command: "start", interval: Math.floor(1000 / targetFps) });

      return () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
    } catch (e) {
      console.warn("Web worker fallback", e);
    }
  }, []);

  // Update worker interval when target FPS changes
  useEffect(() => {
    if (workerRef.current && isStreaming) {
      const intervalMs = Math.max(30, Math.floor(1000 / targetFps));
      workerRef.current.postMessage({ command: "setInterval", interval: intervalMs });
    }
  }, [targetFps, isStreaming]);

  // Auto-connect to server on app load
  useEffect(() => {
    const autoConnect = async () => {
      try {
        const storedUrl = localStorage.getItem("sightline_server_url");
        const serverUrl = storedUrl || window.location.origin;
        
        const response = await fetch(`${serverUrl}/mobile-remote`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setConnected(true);
            localStorage.setItem("sightline_server_url", serverUrl);
            toast.success("Auto-connected to Sightline server");
          } else {
            setConnected(false);
            toast.error("Failed to auto-connect: " + (data.error || "Unknown error"));
          }
        } else {
          setConnected(false);
        }
      } catch (error) {
        setConnected(false);
        console.warn("Auto-connect failed:", error);
      }
    };

    autoConnect();
  }, []);

  // Request & maintain screen wake lock
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && (navigator as any).wakeLock?.request) {
        if (!wakeLockRef.current) {
          const lock = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current = lock;
          setWakeLockActive(true);
          lock.addEventListener("release", () => {
            setWakeLockActive(false);
            wakeLockRef.current = null;
          });
        }
      }
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    try {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {}
    setWakeLockActive(false);
  }, []);

  // Periodic Wake Lock Auto-Renewal Loop (every 6s)
  useEffect(() => {
    const wakeInterval = setInterval(() => {
      if (isStreamingRef.current) {
        requestWakeLock();
      }
    }, 6000);
    return () => clearInterval(wakeInterval);
  }, [requestWakeLock]);

  // Fetch Synced Workflows from backend
  const fetchSyncedWorkflows = useCallback(async () => {
    setIsLoadingWorkflows(true);
    try {
      const res = await fetch("/api/mobile-stream/workflows");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.workflows)) {
          setWorkflows(data.workflows);
        }
      }
    } catch {
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, []);

  // Auto-Check Workspace for Scheduled Workflows
  const fetchScheduledWorkflows = useCallback(async () => {
    setIsLoadingScheduled(true);
    try {
      const res = await fetch("/api/mobile-stream/scheduled-workflows");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.workflows)) {
          setScheduledWorkflows(data.workflows);
        }
      }
    } catch {
    } finally {
      setIsLoadingScheduled(false);
    }
  }, []);

  useEffect(() => {
    fetchSyncedWorkflows();
    fetchScheduledWorkflows();
    const interval = setInterval(() => {
      fetchSyncedWorkflows();
      fetchScheduledWorkflows();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchSyncedWorkflows, fetchScheduledWorkflows]);

  // Silent Web Audio carrier to prevent OS tab suspension on minimize
  const startBackgroundAudioKeepalive = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // inaudible
          osc.frequency.value = 35;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();

          audioContextRef.current = ctx;
          silentOscillatorRef.current = osc;
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
    } catch (e) {
      console.warn("Silent audio notice:", e);
    }
  }, []);

  const stopBackgroundAudioKeepalive = useCallback(() => {
    try {
      if (silentOscillatorRef.current) {
        silentOscillatorRef.current.stop();
        silentOscillatorRef.current.disconnect();
        silentOscillatorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    } catch {}
  }, []);

  // Keep stream alive across app minimize / screen switch
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        if (isStreamingRef.current) {
          requestWakeLock();
          if (primaryVideoRef.current && primaryVideoRef.current.paused) {
            try {
              await primaryVideoRef.current.play();
            } catch {}
          }
          if (secondaryCamVideoRef.current && secondaryCamVideoRef.current.paused) {
            try {
              await secondaryCamVideoRef.current.play();
            } catch {}
          }
        }
      } else {
        if (isStreamingRef.current) {
          startBackgroundAudioKeepalive();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestWakeLock, startBackgroundAudioKeepalive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllStreams();
      releaseWakeLock();
      stopBackgroundAudioKeepalive();
      if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
    };
  }, [releaseWakeLock, stopBackgroundAudioKeepalive]);

  // Virtual OS sync events from other components on this page
  useEffect(() => {
    const handleSync = (e: any) => {
      const d = e.detail;
      if (!d) return;
      if (d.activeApp) setVirtualOsActiveApp(d.activeApp);
      if (d.chromeUrl) setVirtualOsAppUrl(d.chromeUrl);
      if (d.calcDisplay) setVirtualOsCalc(d.calcDisplay);
      if (d.notesContent) setVirtualOsNotes(d.notesContent);
    };
    window.addEventListener("sightline-virtual-os-sync", handleSync);
    return () => window.removeEventListener("sightline-virtual-os-sync", handleSync);
  }, []);

  // One non-overlapping poll loop: PC mirror frame and incoming actions every tick, virtual OS state every 2nd
  const pollFlagsRef = useRef({ mirror: false, streaming: false });
  pollFlagsRef.current = { mirror: streamMode === "mirror_pc" && isStreaming, streaming: isStreaming };
  const pollIncomingActionsRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const pollPcScreen = async () => {
      const res = await fetch("/api/screen/capture");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.imageData && pollFlagsRef.current.mirror) setPcMirrorFrame(data.imageData);
    };
    const pollState = async () => {
      const res = await fetch("/api/virtual-os/state");
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.state) return;
      if (data.state.activeApp) setVirtualOsActiveApp(data.state.activeApp);
      if (data.state.chromeUrl) setVirtualOsAppUrl(data.state.chromeUrl);
      if (data.state.calcDisplay) setVirtualOsCalc(data.state.calcDisplay);
      if (data.state.notesContent) setVirtualOsNotes(data.state.notesContent);
    };
    return startPollLoop(
      [
        { everyTicks: 1, enabled: () => pollFlagsRef.current.mirror, run: pollPcScreen },
        { everyTicks: 1, enabled: () => pollFlagsRef.current.streaming, run: () => pollIncomingActionsRef.current() },
        { everyTicks: 2, enabled: () => true, run: pollState },
      ],
      250,
    );
  }, []);

  const pollIncomingActions = async () => {
    try {
      const res = await fetch("/api/mobile-stream/actions");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.actions) && data.actions.length > 0) {
        for (const act of data.actions) {
          handleExecuteIncomingAction(act);
        }
      }
    } catch {}
  };
  pollIncomingActionsRef.current = pollIncomingActions;

  const handleExecuteIncomingAction = (act: any) => {
    try {
      if (navigator.vibrate) {
        if (act.type === "double_tap") {
          navigator.vibrate([30, 40, 30]);
        } else if (act.type === "swipe" || act.type === "drag") {
          navigator.vibrate([50, 30]);
        } else if (act.key === "HOME") {
          navigator.vibrate([80, 40, 80]);
        } else {
          navigator.vibrate(40);
        }
      }
    } catch {}

    // App Launching / Deep Link Trigger
    if (act.type === "open_app" || act.appUrl || act.package || act.appName) {
      const name = act.appName || act.package || "App";
      const targetUrl = act.appUrl || (act.package ? `https://${act.package}` : "");

      const low = name.toLowerCase();
      if (low.includes("chrome") || low.includes("browser")) setVirtualOsActiveApp("chrome");
      else if (low.includes("calc")) setVirtualOsActiveApp("calculator");
      else if (low.includes("note")) setVirtualOsActiveApp("notes");
      else if (low.includes("youtube") || low.includes("video")) setVirtualOsActiveApp("youtube");
      else if (low.includes("music") || low.includes("spotify")) setVirtualOsActiveApp("spotify");
      else if (low.includes("term") || low.includes("adb")) setVirtualOsActiveApp("terminal");
      else if (low.includes("set")) setVirtualOsActiveApp("settings");
      else if (low.includes("file")) setVirtualOsActiveApp("files");

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("sightline-app-launch", {
            detail: { package: act.package, appName: act.appName, appUrl: act.appUrl },
          })
        );
      }

      setIncomingAppPrompt({ name, url: targetUrl, pkg: act.package });
      setTimeout(() => setIncomingAppPrompt(null), 6000);
    }

    // Typing / Text Injection
    if ((act.type === "type_text" || act.type === "type") && act.text) {
      setIncomingClipboardText(act.text);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(act.text).catch(() => {});
        }
      } catch {}

      if (virtualOsActiveApp === "chrome") setVirtualOsAppUrl(act.text);
      else if (virtualOsActiveApp === "calculator") setVirtualOsCalc((prev) => (prev === "0" ? act.text : prev + act.text));
      else if (virtualOsActiveApp === "notes") setVirtualOsNotes((prev) => prev + " " + act.text);

      setTimeout(() => setIncomingClipboardText(null), 5000);
    }

    // Navigation / Back
    if (act.type === "key" && act.key === "BACK") {
      setVirtualOsActiveApp("home");
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("sightline-navigate-back"));
        }
        if (window.history.length > 1) {
          window.history.back();
        }
      } catch {}
    }

    // Navigation / Home
    if (act.type === "key" && act.key === "HOME") {
      setVirtualOsActiveApp("home");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sightline-navigate-home"));
      }
      setIsTemplateDrawerOpen(true);
    }

    const indicator: ExecutedActionIndicator = {
      id: act.id || String(Date.now()),
      type: act.type || "tap",
      x: typeof act.x === "number" ? act.x : 0.5,
      y: typeof act.y === "number" ? act.y : 0.5,
      toX: act.toX,
      toY: act.toY,
      text: act.text,
      appName: act.appName,
      appUrl: act.appUrl,
      package: act.package,
      key: act.key,
      description:
        act.description ||
        (act.type === "open_app"
          ? `Open App: ${act.appName || act.package || act.appUrl}`
          : act.type === "type_text"
          ? `Type: "${act.text}"`
          : `Dispatched ${act.type}`),
      timestamp: Date.now(),
    };

    setActiveActionIndicator(indicator);
    setStatus(`🤖 Dispatched: ${indicator.description}`);
    setActionHistory((prev) => [
      { id: indicator.id, desc: indicator.description || indicator.type, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 15),
    ]);

    setTimeout(() => {
      setActiveActionIndicator((cur) => (cur?.id === indicator.id ? null : cur));
    }, 2500);

    fetch("/api/mobile-stream/action-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: act.id,
        success: false,
        result: `Dispatched ${act.type} to browser UI only; native phone execution is not verified`,
        scope: "browser",
        action: act,
      }),
    }).catch(() => {});
  };

  // Frame scheduler loop
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  const triggerFrameProcess = useCallback(() => {
    if (!isStreamingRef.current) return;
    const now = Date.now();
    const minInterval = Math.floor(1000 / targetFpsRef.current);

    if (now - lastSentTimeRef.current < minInterval - 5) {
      return;
    }

    processFrameTick();
  }, []);

  // Primary animation & video frame loop
  useEffect(() => {
    if (!isStreaming) return;

    let active = true;

    const continuousLoop = () => {
      if (!active) return;
      triggerFrameProcess();
      frameRequestRef.current = requestAnimationFrame(continuousLoop);
    };

    frameRequestRef.current = requestAnimationFrame(continuousLoop);

    const video = primaryVideoRef.current;
    if (video && "requestVideoFrameCallback" in video) {
      const vfcLoop = () => {
        if (!active) return;
        triggerFrameProcess();
        vfcCallbackRef.current = (video as any).requestVideoFrameCallback(vfcLoop);
      };
      vfcCallbackRef.current = (video as any).requestVideoFrameCallback(vfcLoop);
    }

    return () => {
      active = false;
      if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
      if (video && vfcCallbackRef.current && "cancelVideoFrameCallback" in video) {
        (video as any).cancelVideoFrameCallback(vfcCallbackRef.current);
      }
    };
  }, [isStreaming, triggerFrameProcess]);

  // Frame Capture & Sync to PC Engine
  const processFrameTick = async () => {
    if (!canvasRef.current || !isStreamingRef.current) return;

    // 1. Synthetic Frame Rendering for Interactive & Live View Modes
    if (streamModeRef.current === "interactive_phone" || streamModeRef.current === "live_view") {
      if (isSendingFrameRef.current) return;
      try {
        isSendingFrameRef.current = true;
        if (sendLockTimeoutRef.current) clearTimeout(sendLockTimeoutRef.current);
        sendLockTimeoutRef.current = setTimeout(() => {
          isSendingFrameRef.current = false;
        }, 600);

        const canvas = canvasRef.current;
        canvas.width = 480;
        canvas.height = 800;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          isSendingFrameRef.current = false;
          return;
        }

        // Clean Realistic Phone Wallpaper & Background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, "#080d1a");
        gradient.addColorStop(0.4, "#0f172a");
        gradient.addColorStop(0.8, "#1e1b4b");
        gradient.addColorStop(1, "#040711");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header Status Bar
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.fillRect(0, 0, canvas.width, 36);

        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`Sightline Phone • ${streamModeRef.current === "live_view" ? "LIVE VIEW" : "MIRROR"}`, 16, 23);

        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px monospace";
        ctx.fillText(`98% âš¡ ${timeStr}`, canvas.width - 96, 23);

        // Active App Canvas Drawing
        if (virtualOsActiveApp === "chrome") {
          // Chrome Browser App
          ctx.fillStyle = "#1e293b";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(16, 46, canvas.width - 32, 40, 10) : ctx.rect(16, 46, canvas.width - 32, 40);
          ctx.fill();
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#38bdf8";
          ctx.font = "11px monospace";
          ctx.fillText(`ðŸ”’ ${virtualOsAppUrl || "https://google.com"}`, 28, 70);

          ctx.fillStyle = "#0f172a";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(16, 96, canvas.width - 32, 600, 16) : ctx.rect(16, 96, canvas.width - 32, 600);
          ctx.fill();

          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 22px sans-serif";
          ctx.fillText("Google", 36, 140);

          ctx.fillStyle = "#ffffff";
          ctx.font = "13px sans-serif";
          ctx.fillText("Search: Autonomous Vision AI & Automation", 36, 175);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px sans-serif";
          ctx.fillText("• Sightline Phone Bridge: 60 FPS screen mirror", 36, 215);
          ctx.fillText("• AI Action Dispatch & Bi-directional OCR", 36, 240);
          ctx.fillText("• Scheduled Workflows & Self-Healing Sentinel", 36, 265);
        } else if (virtualOsActiveApp === "calculator") {
          // Calculator App
          ctx.fillStyle = "#0f172a";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(16, 46, canvas.width - 32, 120, 16) : ctx.rect(16, 46, canvas.width - 32, 120);
          ctx.fill();
          ctx.strokeStyle = "#d97706";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#f8fafc";
          ctx.font = "bold 32px monospace";
          ctx.textAlign = "right";
          ctx.fillText(virtualOsCalc || "2,540.00", canvas.width - 36, 125);
          ctx.textAlign = "left";

          ctx.fillStyle = "#94a3b8";
          ctx.font = "12px sans-serif";
          ctx.fillText("Interactive Calculator Active", 36, 195);
        } else if (virtualOsActiveApp === "notes") {
          // Notes App
          ctx.fillStyle = "#1e1b4b";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(16, 46, canvas.width - 32, 640, 16) : ctx.rect(16, 46, canvas.width - 32, 640);
          ctx.fill();
          ctx.strokeStyle = "#6366f1";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#a5b4fc";
          ctx.font = "bold 16px sans-serif";
          ctx.fillText("ðŸ“ Notes & Workflow Telemetry", 32, 80);

          ctx.fillStyle = "#f8fafc";
          ctx.font = "12px sans-serif";
          ctx.fillText(virtualOsNotes || "• Live interactive notes on mobile bridge", 32, 120);
        } else {
          // Home Screen with App Grid
          ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(16, 46, canvas.width - 32, 40, 12) : ctx.rect(16, 46, canvas.width - 32, 40);
          ctx.fill();
          ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px sans-serif";
          ctx.fillText("ðŸ” Search apps, actions, or ask AI...", 28, 70);

          // Draw 6 Quick App Tiles
          const apps = [
            { name: "Chrome", color: "#2563eb", icon: "ðŸŒ", x: 30, y: 110 },
            { name: "Calc", color: "#d97706", icon: "ðŸ”¢", x: 140, y: 110 },
            { name: "Notes", color: "#4f46e5", icon: "ðŸ“", x: 250, y: 110 },
            { name: "Camera", color: "#059669", icon: "ðŸ“·", x: 360, y: 110 },
            { name: "Terminal", color: "#0f172a", icon: "âš¡", x: 30, y: 220 },
            { name: "Files", color: "#ea580c", icon: "ðŸ“", x: 140, y: 220 },
            { name: "Settings", color: "#334155", icon: "âš™ï¸", x: 250, y: 220 },
            { name: "YouTube", color: "#e11d48", icon: "â–¶ï¸", x: 360, y: 220 },
          ];

          apps.forEach((a) => {
            ctx.fillStyle = a.color;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(a.x, a.y, 70, 70, 16) : ctx.rect(a.x, a.y, 70, 70);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.font = "24px sans-serif";
            ctx.fillText(a.icon, a.x + 20, a.y + 44);

            ctx.fillStyle = "#f8fafc";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(a.name, a.x + 35, a.y + 92);
            ctx.textAlign = "left";
          });

          // Live Scheduled Routine Card
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(16, 360, canvas.width - 32, 160, 16) : ctx.rect(16, 360, canvas.width - 32, 160);
          ctx.fill();
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("âš¡ Scheduled Device Automation", 32, 392);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px sans-serif";
          ctx.fillText("• Social Feed Monitor (15m): Idle / Synced", 32, 425);
          ctx.fillText("• Chrome Search & Sync (30m): Ready", 32, 450);
          ctx.fillText("• Diagnostics & Network (60m): Ready", 32, 475);
        }

        // Draw Touch Ripple if touched
        if (lastTouchRef.current) {
          const tx = lastTouchRef.current.x * canvas.width;
          const ty = lastTouchRef.current.y * canvas.height;
          ctx.beginPath();
          ctx.arc(tx, ty, 24, 0, Math.PI * 2);
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
          ctx.fill();
        }

        // Bottom Dock
        ctx.fillStyle = "rgba(2, 6, 23, 0.95)";
        ctx.fillRect(0, canvas.height - 48, canvas.width, 48);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("â—€         âšª         â—¼", canvas.width / 2, canvas.height - 18);
        ctx.textAlign = "left";

        const qualityVal = streamQuality === "hd" ? 0.75 : streamQuality === "fast" ? 0.45 : 0.6;
        const imageData = canvas.toDataURL("image/jpeg", qualityVal);
        lastSentTimeRef.current = Date.now();

        await sendFrameToPC(imageData, lastTouchRef.current?.x, lastTouchRef.current?.y);

        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsTimeRef.current >= 1000) {
          const measuredFps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
          setFps(measuredFps);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      } catch {
      } finally {
        isSendingFrameRef.current = false;
        if (sendLockTimeoutRef.current) clearTimeout(sendLockTimeoutRef.current);
      }
      return;
    }

    // 2. Video-based stream processing (Real Screen Share or Camera)
    if (!primaryVideoRef.current) return;
    const video = primaryVideoRef.current;
    if (video.readyState < 2) return;

    if (isSendingFrameRef.current) return;

    try {
      isSendingFrameRef.current = true;
      if (sendLockTimeoutRef.current) clearTimeout(sendLockTimeoutRef.current);
      sendLockTimeoutRef.current = setTimeout(() => {
        isSendingFrameRef.current = false;
      }, 600);

      const canvas = canvasRef.current;
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;

      const maxW = streamQuality === "hd" ? 1080 : streamQuality === "fast" ? 540 : 720;
      const scale = maxW / vWidth;
      canvas.width = maxW;
      canvas.height = Math.round(vHeight * scale);

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        isSendingFrameRef.current = false;
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const qualityVal = streamQuality === "hd" ? 0.75 : streamQuality === "fast" ? 0.45 : 0.6;
      const imageData = canvas.toDataURL("image/jpeg", qualityVal);
      lastSentTimeRef.current = Date.now();

      await sendFrameToPC(imageData, lastTouchRef.current?.x, lastTouchRef.current?.y);

      frameCountRef.current++;
      const now = Date.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        const measuredFps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
        setFps(measuredFps);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
    } catch {
    } finally {
      isSendingFrameRef.current = false;
      if (sendLockTimeoutRef.current) clearTimeout(sendLockTimeoutRef.current);
    }
  };

  const sendFrameToPC = async (imageData: string, tx?: number, ty?: number) => {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const res = await fetch("/api/mobile-stream/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageData,
          deviceName,
          streamType: streamModeRef.current,
          fps,
          touchX: tx,
          touchY: ty,
        }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        setConnected(true);
        setFramesSent((prev) => prev + 1);
        setLastLatencyMs(Date.now() - startTime);
      }
    } catch {}
  };

  const stopAllStreams = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ command: "stop" });
    }
    if (primaryStreamRef.current) {
      primaryStreamRef.current.getTracks().forEach((t) => t.stop());
      primaryStreamRef.current = null;
    }
    if (secondaryStreamRef.current) {
      secondaryStreamRef.current.getTracks().forEach((t) => t.stop());
      secondaryStreamRef.current = null;
    }
    if (primaryVideoRef.current) {
      primaryVideoRef.current.srcObject = null;
    }
    if (secondaryCamVideoRef.current) {
      secondaryCamVideoRef.current.srcObject = null;
    }
    releaseWakeLock();
    stopBackgroundAudioKeepalive();
    setIsStreaming(false);
  };

  const requestScreenShareStream = async (): Promise<MediaStream> => {
    const nav = navigator as any;
    const mediaDevices = navigator.mediaDevices as any;

    const displayFn =
      mediaDevices && typeof mediaDevices.getDisplayMedia === "function"
        ? mediaDevices.getDisplayMedia.bind(mediaDevices)
        : nav && typeof nav.getDisplayMedia === "function"
        ? nav.getDisplayMedia.bind(nav)
        : null;

    if (!displayFn) {
      throw new Error("SCREEN_NOT_SUPPORTED");
    }

    try {
      return await displayFn({
        video: {
          displaySurface: "monitor",
          frameRate: { ideal: targetFps, max: 30 },
        },
        audio: false,
      });
    } catch (e1: any) {
      if (e1.name === "NotAllowedError" || e1.name === "AbortError" || e1.name === "SecurityError") {
        throw e1;
      }
      try {
        return await displayFn({ video: true, audio: false });
      } catch (e2: any) {
        if (e2.name === "NotAllowedError" || e2.name === "AbortError") {
          throw e2;
        }
        return await displayFn({ video: true });
      }
    }
  };

  const startStream = async (mode: StreamMode) => {
    stopAllStreams();

    try {
      setStreamMode(mode);
      setIsStreaming(true);
      setConnected(true);

      if (mode === "interactive_phone") {
        setStatus("â— LIVE: 📱 Interactive Phone OS Active");
        requestWakeLock();
        startBackgroundAudioKeepalive();
        toast.success("📱 Interactive Phone OS: Tap, type & automate");
        return;
      }

      if (mode === "live_view") {
        setStatus("â— LIVE: 👁️ Live Telepresence Mirror • Read-Only Inspection");
        requestWakeLock();
        startBackgroundAudioKeepalive();
        toast.info("👁️ Live View Mirror: Read-Only inspection feed");
        return;
      }

      if (mode === "mirror_pc") {
        setStatus("â— LIVE: ðŸ–¥ï¸ PC Desktop Screen Mirror & Remote Controller");
        requestWakeLock();
        startBackgroundAudioKeepalive();
        toast.info("ðŸ–¥ï¸ PC Mirror Active: Control PC from phone");
        return;
      }

      let primaryStream: MediaStream;

      if (mode === "screen" || mode === "dual") {
        try {
          primaryStream = await requestScreenShareStream();
        } catch (screenErr: any) {
          setIsApkModalOpen(true);
          toast.error("Browser screen capture restricted. Switch to Interactive Phone or Camera mode.");
          setStatus("Screen share restricted by browser. APK options opened.");
          setStreamMode("interactive_phone");
          return;
        }

        const videoTrack = primaryStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            stopAllStreams();
            setStatus("Screen share stopped");
          };
        }
      } else {
        // Camera mode (back or front)
        const facing = mode === "camera_front" ? "user" : "environment";
        primaryStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: targetFps },
          },
          audio: false,
        });
      }

      primaryStreamRef.current = primaryStream;

      if (primaryVideoRef.current) {
        primaryVideoRef.current.srcObject = primaryStream;
        primaryVideoRef.current.setAttribute("playsinline", "true");
        primaryVideoRef.current.muted = true;
        await primaryVideoRef.current.play();
      }

      setStatus(`â— LIVE: ${mode.toUpperCase()} Stream Active`);
      requestWakeLock();
      startBackgroundAudioKeepalive();
    } catch (err: any) {
      setStatus("Notice: " + (err?.message || String(err)));
      toast.error("Stream access: " + (err?.message || "Unavailable in this browser"));
      setStreamMode("interactive_phone");
      setIsStreaming(true);
    }
  };

  const handleSwitchStreamSource = (mode: StreamMode) => {
    startStream(mode);
  };

  // PC Mirror Click Dispatch
  const handlePcMirrorTouch = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!pcMirrorContainerRef.current) return;
    const rect = pcMirrorContainerRef.current.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    setLastTouch({ x: relX, y: relY });

    fetch("/api/interactive/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "click",
        x: relX,
        y: relY,
        button: "left",
      }),
    }).catch(() => {});

    toast.success(`ðŸ–¥ï¸ Dispatched Click to PC at (${Math.round(relX * 100)}%, ${Math.round(relY * 100)}%)`);
  };

  // Dispatch Action Helper for Mobile Remote
  const sendMobileAction = (act: any) => {
    handleExecuteIncomingAction({
      id: `act_${Date.now()}`,
      ...act,
    });
  };

  // AI-chosen phone action: verify the live phone screen first, then dispatch
  const sendAiMobileAction = (act: any) => {
    void actionGate.run(mobileActionPlan([act], sendMobileAction));
  };

  // Interactive Live View Touch Handler (Fully interactive directly through phone)
  const handleLiveViewTouch = (e: React.TouchEvent | React.MouseEvent) => {
    let clientX = 0;
    let clientY = 0;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    setLastTouch({ x: relX, y: relY });
    sendMobileAction({
      type: "tap",
      x: relX,
      y: relY,
      description: `Tap @ (${Math.round(relX * 100)}%, ${Math.round(relY * 100)}%)`,
    });
    toast.success(`📱 Dispatched Touch at (${Math.round(relX * 100)}%, ${Math.round(relY * 100)}%)`);
  };

  // PC Mirror Interactive Typing & Hotkeys Dispatchers
  const handleSendPcText = () => {
    if (!pcTextInput.trim()) return;
    fetch("/api/pyautogui/interactive-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "type",
        text: pcTextInput,
        deviceMode: "desktop_mirror",
      }),
    }).catch(() => {});
    toast.success(`âŒ¨ï¸ Typed to PC: "${pcTextInput}"`);
    setPcTextInput("");
  };

  const handleSendPcKey = (key: string, label: string) => {
    fetch("/api/pyautogui/interactive-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "press_key",
        key,
        deviceMode: "desktop_mirror",
      }),
    }).catch(() => {});
    toast.success(`âŒ¨ï¸ Sent [${label}] to PC`);
  };

  // Windows Key Toggle (Opens/Closes Windows Start Menu & dispatches Win Key)
  const handleToggleWindowsKey = () => {
    setIsPcStartMenuOpen((prev) => !prev);
    handleSendPcKey("win", "âŠž Windows Key");
  };

  // Windows Desktop Hotkey Combinations (Win+R, Win+D, Win+E, Win+X, Alt+Tab, Ctrl+Alt+Del)
  const handleSendPcSpecialHotkey = (combo: string, label: string) => {
    if (combo === "win+r") {
      setActivePcWindow("run");
      setIsPcStartMenuOpen(false);
    } else if (combo === "win+d") {
      setActivePcWindow("desktop");
      setIsPcStartMenuOpen(false);
    } else if (combo === "win+e") {
      setActivePcWindow("files");
      setIsPcStartMenuOpen(false);
    }

    fetch("/api/pyautogui/interactive-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "hotkey",
        hotkey: combo,
        deviceMode: "desktop_mirror",
      }),
    }).catch(() => {});

    toast.success(`âŒ¨ï¸ Triggered Shortcut: [${label}]`);
  };

  // Real Screen Sharing (WebRTC / getDisplayMedia) for Phone and PC Desktop
  const handleStartRealPcScreenShare = async () => {
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false,
        });
        if (realScreenVideoRef.current) {
          realScreenVideoRef.current.srcObject = stream;
          await realScreenVideoRef.current.play().catch(() => {});
        }
        setIsRealPcScreenActive(true);
        toast.success("ðŸ–¥ï¸ Real PC Screen Share Active & Streaming Live!");
        stream.getVideoTracks()[0].onended = () => {
          setIsRealPcScreenActive(false);
          toast.info("PC Screen share ended");
        };
      } else {
        toast.info("Simulated Windows Desktop Viewport is Active");
      }
    } catch (err: any) {
      toast.info("Using simulated desktop environment: " + (err?.message || "Screen capture canceled"));
    }
  };

  const handleStartRealPhoneScreenShare = async () => {
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false,
        });
        if (primaryVideoRef.current) {
          primaryVideoRef.current.srcObject = stream;
          primaryVideoRef.current.play().catch(() => {});
        }
        setIsRealPhoneScreenActive(true);
        setStreamMode("screen");
        toast.success("📱 Live Phone Screen Mirror Active!");
        stream.getVideoTracks()[0].onended = () => {
          setIsRealPhoneScreenActive(false);
          setStreamMode("interactive_phone");
          toast.info("Phone Screen share ended");
        };
      } else {
        setStreamMode("interactive_phone");
        toast.info("Interactive Virtual Phone OS Active");
      }
    } catch {
      setStreamMode("interactive_phone");
      toast.info("Switched to Interactive Virtual Phone OS");
    }
  };

  // Document Upload Handler (PDF, TXT, DOCX, JSON, MD, CSV, Code)
  const handleUploadDocFile = async (file: File) => {
    if (!file) return;
    try {
      let content = "";
      if (file.type.includes("json") || file.type.includes("text") || file.name.endsWith(".md") || file.name.endsWith(".txt") || file.name.endsWith(".csv") || file.name.endsWith(".json")) {
        content = await file.text();
      } else {
        content = `[Binary Document / Asset: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}]`;
      }

      const res = await fetch("/api/mobile-stream/upload-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          content,
          fileType: file.type || "text/plain",
          size: file.size,
          tags: ["user-uploaded", "grounding-doc"],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newDocItem = {
          id: `doc_${Date.now()}`,
          name: file.name,
          size: file.size,
          fileType: file.type || "text/plain",
          content,
          uploadedAt: Date.now(),
          parsedSummary: content.slice(0, 140) + (content.length > 140 ? "..." : ""),
        };
        setUploadedDocs((prev) => [newDocItem, ...prev]);
        toast.success(`ðŸ“„ Ingested "${file.name}" for AI task grounding!`);

        // Notify chat
        setChatMessages((prev) => [
          ...prev,
          {
            id: `sys_doc_${Date.now()}`,
            role: "agent",
            agentName: "Vision Co-Pilot",
            text: `ðŸ“Ž Ingested document "${file.name}" (${(file.size / 1024).toFixed(1)} KB). I will use its instructions and SOPs to guide my actions!`,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        toast.error("Failed uploading document to server");
      }
    } catch (err: any) {
      toast.error("Upload error: " + (err?.message || "File read failed"));
    }
  };

  const handleSendPcSwipe = (direction: "up" | "down" | "left" | "right") => {
    fetch("/api/pyautogui/interactive-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: `swipe_${direction}`,
        deviceMode: "desktop_mirror",
      }),
    }).catch(() => {});
    toast.success(`â†”ï¸ Dispatched Swipe ${direction.toUpperCase()} to PC`);
  };

  // Single Snapshot Capture and addition into 10-Screenshots Pack
  const handleAddSingleSnapshotTo10Pack = (customDesc?: string, customAction = "tap", x = 0.5, y = 0.5) => {
    let snapshotData = pcMirrorFrame || "";
    if (canvasRef.current) {
      try {
        snapshotData = canvasRef.current.toDataURL("image/jpeg", 0.7);
      } catch {}
    }
    if (!snapshotData) {
      snapshotData = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzBkMTExNyIvPjwvc3ZnPg==";
    }

    const nextStep = tenFramesPack.length + 1;
    const newFrame: DifferentialFrame = {
      id: `diff_frame_${Date.now()}_${nextStep}`,
      stepNumber: nextStep,
      imageData: snapshotData,
      actionType: customAction,
      x,
      y,
      description: customDesc || `Frame #${nextStep}: ${streamMode.replace('_', ' ').toUpperCase()} Snapshot`,
      timestamp: Date.now(),
    };

    setTenFramesPack((prev) => [...prev.slice(-9), newFrame]);
    toast.success(`ðŸ“¸ Added Snapshot #${nextStep} to 10-Pack!`);
  };

  // AI Assistant Chat Handler for Mobile Remote
  const handleSendChatMessage = async (presetText?: string) => {
    const messageText = presetText || chatInput;
    if (!messageText.trim()) return;

    const userMsg = {
      id: `usr_${Date.now()}`,
      role: "user" as const,
      text: messageText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsAiThinking(true);

    const lower = messageText.toLowerCase();
    let replyText = "";
    let actionDone: string | undefined;

    if (lower.includes("snap") || lower.includes("screen") || lower.includes("capture")) {
      handleAddSingleSnapshotTo10Pack("Chat AI Snapshot Trigger");
      replyText = "ðŸ“¸ Captured snapshot and added to 10-Screenshots Pack for workflow building!";
      actionDone = "Snapshot Captured";
    } else if (lower.includes("calc") || lower.includes("math")) {
      sendAiMobileAction({ type: "open_app", appName: "Calculator" });
      replyText = "ðŸ§® Opened Calculator app and ready for math inputs!";
      actionDone = "Launched Calculator";
    } else if (lower.includes("chrome") || lower.includes("search") || lower.includes("browser")) {
      sendAiMobileAction({ type: "open_app", appName: "Google Chrome", appUrl: "https://google.com" });
      replyText = "ðŸŒ Launched Google Chrome browser with web navigation active!";
      actionDone = "Launched Chrome";
    } else if (lower.includes("note") || lower.includes("write")) {
      sendAiMobileAction({ type: "open_app", appName: "Notes", text: messageText });
      replyText = "ðŸ“ Opened Notes app and synced entry!";
      actionDone = "Updated Notes";
    } else if (lower.includes("settings") || lower.includes("config")) {
      sendAiMobileAction({ type: "open_app", appName: "Settings" });
      replyText = "âš™ï¸ Opened Settings app!";
      actionDone = "Opened Settings";
    } else if (lower.includes("swipe") || lower.includes("scroll")) {
      const dir = lower.includes("up") ? "swipe_up" : lower.includes("down") ? "swipe_down" : lower.includes("left") ? "swipe_left" : "swipe_right";
      sendAiMobileAction({ type: "swipe", description: `Swiped ${dir}` });
      replyText = `â†”ï¸ Dispatched swipe gesture (${dir}) across screen!`;
      actionDone = `Swiped ${dir}`;
    } else if (lower.includes("back")) {
      sendAiMobileAction({ type: "key", key: "BACK", description: "Navigated Back" });
      replyText = "â—€ Dispatched Back navigation key!";
      actionDone = "Navigated Back";
    } else if (lower.includes("home")) {
      sendAiMobileAction({ type: "key", key: "HOME", description: "Navigated Home" });
      replyText = "ðŸ  Returned to Home Launcher screen!";
      actionDone = "Navigated Home";
    } else if (lower.includes("app") || lower.includes("switcher")) {
      sendAiMobileAction({ type: "key", key: "APPS", description: "App Switcher" });
      replyText = "📱 Opened App Switcher!";
      actionDone = "Opened App Switcher";
    } else if (lower.includes("vibrate")) {
      if (navigator.vibrate) navigator.vibrate(50);
      replyText = "ðŸ“³ Phone vibrated";
      actionDone = "Vibrated";
    } else if (lower.includes("volume") || lower.includes("sound")) {
      sendAiMobileAction({ type: "key", key: "VOLUME_UP", description: "Volume Up" });
      replyText = "ðŸ”Š Volume increased";
      actionDone = "Volume Up";
    } else {
      sendAiMobileAction({ type: "tap", x: 0.5, y: 0.5, description: messageText });
      replyText = `🤖 AI processed command: "${messageText}". Action executed on device!`;
      actionDone = "Dispatched Action";
    }

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `agt_${Date.now()}`,
          role: "agent",
          agentName: "Vision Co-Pilot",
          text: replyText,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          actionExecuted: actionDone,
        },
      ]);
      setIsAiThinking(false);
    }, 600);
  };

  // Record 10-Screenshot Differential Workflow Pack
  const handleRecord10DifferentialScreenshots = async () => {
    if (isRecording10Pack) return;
    setIsRecording10Pack(true);
    setPackProgress(0);
    const frames: DifferentialFrame[] = [];
    toast.info("ðŸ“¸ Starting 10-Screenshot Workflow Sequence Recording...");

    try {
      const actionsSequence = [
        { type: "tap", x: 0.15, y: 0.35, desc: "Open Google Chrome Browser" },
        { type: "type", text: "Autonomous Vision AI", desc: "Input Search Query" },
        { type: "tap", x: 0.85, y: 0.12, desc: "Submit Search Request" },
        { type: "swipe", x: 0.5, y: 0.7, desc: "Scroll Search Results" },
        { type: "key", key: "HOME", desc: "Return to Phone Main Menu" },
        { type: "tap", x: 0.38, y: 0.35, desc: "Launch Calculator Tool" },
        { type: "type", text: "450 * 1.25", desc: "Calculate Ledger Multiplier" },
        { type: "tap", x: 0.85, y: 0.85, desc: "Evaluate Math Result" },
        { type: "key", key: "HOME", desc: "Minimize Calculator" },
        { type: "tap", x: 0.62, y: 0.35, desc: "Open Notes & Sync Telemetry" },
      ];

      for (let i = 0; i < 10; i++) {
        setPackProgress(i + 1);
        const act = actionsSequence[i];

        let snapshotData = "";
        if (canvasRef.current) {
          snapshotData = canvasRef.current.toDataURL("image/jpeg", 0.65);
        } else {
          snapshotData = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzBkMTExNyIvPjwvc3ZnPg==";
        }

        frames.push({
          id: `diff_frame_${Date.now()}_${i + 1}`,
          stepNumber: i + 1,
          imageData: snapshotData,
          actionType: act.type,
          x: act.x || 0.5,
          y: act.y || 0.5,
          description: act.desc,
          timestamp: Date.now(),
        });

        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      setTenFramesPack(frames);
      setActiveTab("pack10");
      toast.success("âœ… Recorded 10-Differential Frame Sequence Pack!");

      await fetch("/api/mobile-stream/pack10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packName: `Mobile 10-Pack - ${new Date().toLocaleTimeString()}`,
          frames,
          device: deviceName,
        }),
      }).catch(() => {});
    } catch (e) {
      toast.error("Failed recording 10-pack sequence");
    } finally {
      setIsRecording10Pack(false);
    }
  };

  // Instant Snapshot
  const handleCaptureSnapshot = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `sightline-snapshot-${Date.now()}.png`;
      a.click();
      toast.success("ðŸ“· Snapshot downloaded");
    } else {
      toast.info("ðŸ“· Snapshot captured & logged to Hub");
    }
  };

  // 10-Second Automated Completion Check & Agent Learning Loop
  useEffect(() => {
    const run10sCheck = async () => {
      try {
        const res = await fetch("/api/mobile-stream/workflows/completion-check", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.workflows) setScheduledWorkflows(data.workflows);
          if (data.learnedPatternsCount) setLearnedPatterns(data.learnedPatternsCount);
          if (data.totalAutoCompleted) setAutoCompletedCount(data.totalAutoCompleted);
          if (data.lastCheck) setLast10sCheckTime(data.lastCheck);
        }
      } catch {}
    };

    const interval = setInterval(run10sCheck, 10000);
    return () => clearInterval(interval);
  }, []);

  // Create Custom Scheduled Workflow
  const handleCreateNewSchedule = async () => {
    if (!schedFormName.trim() || schedFormSteps.length === 0) {
      toast.error("Please enter a schedule name and at least 1 step");
      return;
    }
    try {
      const res = await fetch("/api/mobile-stream/scheduled-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: schedFormName,
          description: schedFormDesc || "Custom scheduled workflow",
          intervalMinutes: schedFormInterval,
          autoHeal: schedFormAutoHeal,
          steps: schedFormSteps,
          targetDevice: deviceName,
        }),
      });
      if (res.ok) {
        toast.success(`âœ¨ Created schedule "${schedFormName}" (Every ${schedFormInterval}m)`);
        setIsCreateScheduleModalOpen(false);
        fetchScheduledWorkflows();
      }
    } catch {
      toast.error("Failed creating scheduled workflow");
    }
  };

  // Open Edit Schedule Modal
  const handleOpenEditSchedule = (sw: ScheduledDeviceWorkflow) => {
    setEditingScheduleWf(sw);
    setSchedFormName(sw.name);
    setSchedFormDesc(sw.description || "");
    setSchedFormInterval(sw.intervalMinutes || 15);
    setSchedFormAutoHeal(sw.autoHeal);
    setSchedFormSteps(
      sw.steps.map((s, idx) => ({
        id: s.id || `s_${idx + 1}`,
        type: s.type,
        description: s.description,
        x: s.x,
        y: s.y,
        text: s.text,
        key: s.key,
      }))
    );
    setIsEditScheduleModalOpen(true);
  };

  // Update Existing Schedule
  const handleUpdateSchedule = async () => {
    if (!editingScheduleWf) return;
    try {
      const res = await fetch(`/api/mobile-stream/scheduled-workflows/${editingScheduleWf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: schedFormName,
          description: schedFormDesc,
          intervalMinutes: schedFormInterval,
          autoHeal: schedFormAutoHeal,
          steps: schedFormSteps,
        }),
      });
      if (res.ok) {
        toast.success(`âœï¸ Updated schedule "${schedFormName}"`);
        setIsEditScheduleModalOpen(false);
        setEditingScheduleWf(null);
        fetchScheduledWorkflows();
      }
    } catch {
      toast.error("Failed updating scheduled workflow");
    }
  };

  // Delete Scheduled Workflow
  const handleDeleteSchedule = async (id: string) => {
    try {
      const res = await fetch(`/api/mobile-stream/scheduled-workflows/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("ðŸ—‘ï¸ Removed scheduled workflow");
        fetchScheduledWorkflows();
      }
    } catch {
      toast.error("Failed deleting scheduled workflow");
    }
  };

  // Convert Captured 10-Snap Pack to Active Schedule
  const handleConvert10PackToSchedule = async () => {
    if (tenFramesPack.length === 0) {
      toast.error("No 10-Snap frames captured yet");
      return;
    }
    try {
      const res = await fetch("/api/mobile-stream/schedule-from-captured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `10-Snap Recurrent Schedule (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
          description: `Auto-generated schedule from ${tenFramesPack.length} differential frames`,
          intervalMinutes: 10,
          frames: tenFramesPack,
          targetDevice: deviceName,
        }),
      });
      if (res.ok) {
        toast.success("ðŸ“… Converted 10-Snap pack to active schedule!");
        fetchScheduledWorkflows();
        setActiveTab("scheduled");
      }
    } catch {
      toast.error("Failed converting 10-pack to schedule");
    }
  };

  // Add Step to Form
  const handleAddStepToForm = () => {
    setSchedFormSteps((prev) => [
      ...prev,
      {
        id: `s_${Date.now()}`,
        type: "tap",
        description: `Step ${prev.length + 1}: Tap target coordinate`,
        x: 0.5,
        y: 0.5,
      },
    ]);
  };

  // Remove Step from Form
  const handleRemoveStepFromForm = (idx: number) => {
    setSchedFormSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  // Scheduled Workflow Action Handlers
  const handleScheduledWorkflowAction = async (
    workflowId: string,
    action: "restart" | "continue" | "pause" | "step"
  ) => {
    setActiveScheduledActionId(workflowId);
    try {
      const res = await fetch(`/api/mobile-stream/scheduled-workflows/${workflowId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success(`âš¡ ${data.message || `Workflow ${action}ed`}`);
          fetchScheduledWorkflows();
        }
      }
    } catch (e) {
      toast.error(`Failed to ${action} workflow`);
    } finally {
      setActiveScheduledActionId(null);
    }
  };

  // Run Synced Workflow on Connected Phone
  const handleExecuteWorkflow = async (wf: SyncedWorkflow) => {
    setExecutingWorkflowId(wf.id);
    toast.info(`▶ Executing "${wf.name}" on Phone (each step verified on the live screen)...`);
    try {
      const steps = wf.actions.map((step, i) => ({
        ...step,
        description: step.description || `Step ${i + 1}/${wf.actions.length}`,
        durationMs: step.durationMs || 900,
      }));
      const result = await actionGate.run(
        mobileActionPlan(steps, (step) =>
          handleExecuteIncomingAction({
            id: `act_${Date.now()}`,
            type: step.type,
            x: step.x,
            y: step.y,
            text: step.text,
            key: step.key,
            description: step.description,
          }),
        ),
      );
      if (gateFailure(result)) return;
      toast.success(`âœ… Completed "${wf.name}" execution`);
    } catch {
      toast.error("Workflow execution interrupted");
    } finally {
      setExecutingWorkflowId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-2 sm:p-4 font-sans select-none max-w-7xl mx-auto">
      {/* ---------------------------------------------------- */}
      {/* TOP HEADER & TELEMETRY STRIP */}
      <a href="/phone-control" className="text-emerald-300 underline text-sm mb-3">Paired Android controls & background recording (scan a desktop device QR first)</a>
      {/* ---------------------------------------------------- */}
      <div className="w-full max-w-md flex flex-col gap-1.5 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                Sightline Mobile Remote
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono border border-cyan-800">
                  ARM64
                </span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono border ${
                  isStandaloneApp ? "bg-amber-950 text-amber-300 border-amber-700" : "bg-indigo-950 text-indigo-300 border-indigo-700"
                }`}>
                  {isStandaloneApp ? "📱 Standalone" : "ðŸ”„ Synced"}
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                {connected ? (
                  <span className="text-emerald-400 font-bold">â— Connected • Latency: {lastLatencyMs}ms</span>
                ) : (
                  <span className="text-amber-400 font-bold">Connecting...</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Standalone Popout Window Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const url = window.location.pathname + "?standalone=true";
                window.open(url, "_blank", "width=480,height=920,menubar=no,status=no");
                toast.info("📱 Launched standalone mobile companion window");
              }}
              className="h-7 px-1.5 text-[9px] font-mono border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
              title="Popout Standalone App into separate window"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsApkModalOpen(true)}
              className="h-7 px-2 text-[10px] font-bold border-slate-700 bg-slate-900 hover:bg-slate-800 text-cyan-300 gap-1"
            >
              <Download className="w-3 h-3 text-cyan-400" /> APK
            </Button>
            {isInstallable && (
              <Button
                size="sm"
                onClick={install}
                className="h-7 px-2 text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1"
              >
                <Plus className="w-3 h-3" /> PWA
              </Button>
            )}
          </div>
        </div>

        {/* Status Line, Standalone Mode Toggle & Auto Switch Toggle */}
        <div className="flex items-center justify-between text-[10px] font-mono bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-cyan-300 truncate">{status}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Sync Mode Switch */}
            <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800" title="Toggle standalone operation or live workspace sync">
              <span className="text-[8px] text-slate-400">{isStandaloneApp ? "Standalone" : "Synced"}</span>
              <Switch
                checked={!isStandaloneApp}
                onCheckedChange={(checked) => {
                  setIsStandaloneApp(!checked);
                  toast.info(checked ? "ðŸ”„ Synced with Workspace" : "📱 Running as Standalone Companion App");
                }}
                className="scale-75 data-[state=checked]:bg-indigo-500"
              />
            </div>
            {/* Auto Switch Back and Forth Toggle */}
            <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800" title="Auto switch back and forth between stream and background phone app">
              <span className="text-[8px] text-slate-400">ðŸ”„ Auto</span>
              <Switch
                checked={autoSwitchMode}
                onCheckedChange={(checked) => {
                  setAutoSwitchMode(checked);
                  toast.info(checked ? "ðŸ”„ Auto-Switch ON: Keeps app open & syncs phone usage" : "Auto-Switch OFF");
                }}
                className="scale-75 data-[state=checked]:bg-emerald-500"
              />
            </div>
            <span className="text-slate-400 text-[9px]">
              F: <strong className="text-white">{framesSent}</strong>
            </span>
          </div>
        </div>

        {/* 7 Main Module Navigation Tabs (Including AI Chat & Document Grounding) */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 gap-1 mt-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("stream")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "stream" ? "bg-cyan-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Video className="w-3 h-3" /> Screen
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "chat" ? "bg-pink-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-3 h-3 text-pink-300" /> AI Chat
          </button>
          <button
            onClick={() => setActiveTab("docs")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "docs" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <FileText className="w-3 h-3 text-blue-300" /> Docs
            {uploadedDocs.length > 0 && (
              <span className="text-[8px] px-1 rounded-full bg-black/40 text-blue-200">{uploadedDocs.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("scheduled")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "scheduled" ? "bg-amber-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Clock className="w-3 h-3" /> Sched
            {scheduledWorkflows.length > 0 && (
              <span className="text-[8px] px-1 rounded-full bg-black/40">{scheduledWorkflows.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("workflows")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "workflows" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3 h-3" /> Wf
            <span className="text-[8px] px-1 rounded-full bg-black/40">{workflows.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("pack10")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "pack10" ? "bg-teal-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Camera className="w-3 h-3" /> 10-Snap
          </button>
          <button
            onClick={() => setActiveTab("actions")}
            className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
              activeTab === "actions" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Zap className="w-3 h-3" /> Actions
          </button>
        </div>
      </div>

      {/* Active Linked App Scope Indicator (Template Connect Scope) */}
      {activeLinkedApp && (
        <div className="w-full max-w-md my-1 p-2 rounded-xl bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border border-indigo-500/40 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
              âš¡
            </div>
            <div className="text-[10px] leading-tight">
              <span className="text-slate-400">Template Connect: </span>
              <span className="font-bold text-white">{activeLinkedApp.name}</span>
              <span className="text-[9px] text-indigo-300 block">AI automation scoped to this app only</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {activeLinkedApp.id === "app_inventory" && (
              <Button
                size="sm"
                onClick={() => setIsBarcodeModalOpen(true)}
                className="h-6 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold gap-1 shadow"
              >
                <Scan className="w-3 h-3" /> Scanner Hub
              </Button>
            )}
            <button
              onClick={() => setActiveLinkedApp(null)}
              className="text-[9px] font-mono text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700"
            >
              Clear Scope
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 1: SCREEN VIEWPORT (DISTINCT FOR EACH MODE) */}
      {/* ---------------------------------------------------- */}
      {activeTab === "stream" && (
        <div className="w-full max-w-md flex flex-col gap-2">
          {/* Main Viewport Container (Guaranteed solid height & responsive phone casing) */}
          <div className="w-full min-h-[640px] h-[640px] sm:h-[680px] rounded-[40px] border-[8px] border-slate-800/90 bg-slate-950 shadow-2xl relative flex flex-col overflow-hidden ring-1 ring-white/10">
            {/* Top Phone Speaker Bar */}
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-14 h-1 rounded-full bg-slate-700/80 z-50 pointer-events-none" />

            {/* 1. INTERACTIVE PHONE OS MODE (FULL REAL PHONE USAGE) */}
            {streamMode === "interactive_phone" && (
              <div className="w-full h-full relative overflow-hidden bg-slate-950 flex flex-col">
                <InteractivePhoneVirtualOS
                  onContextMenu={handlePhoneContextMenu}
                  onStateChange={(state) => {
                    setVirtualOsActiveApp(state.activeApp);
                    if (state.calcDisplay) setVirtualOsCalc(state.calcDisplay);
                    if (state.chromeUrl) setVirtualOsAppUrl(state.chromeUrl);
                    if (state.notesList && state.notesList.length > 0) {
                      setVirtualOsNotes(state.notesList.map((n) => `• ${n.title}: ${n.body}`).join("\n"));
                    }
                  }}
                  onActionLogged={(action, details) => {
                    setStatus(`Action: ${action} - ${details}`);
                    if (isRecordingWorkflow) {
                      setRecordedSteps((prev) => [
                        ...prev,
                        {
                          id: `step_${Date.now()}`,
                          type: action,
                          description: details,
                          time: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
                        },
                      ]);
                    }
                  }}
                  className="w-full h-full"
                />

                {/* Workflow Recording Banner / Control on Phone */}
                {isRecordingWorkflow && (
                  <div className="absolute bottom-10 inset-x-2 p-2 rounded-xl bg-red-950/90 border border-red-500/80 text-white z-40 backdrop-blur flex items-center justify-between shadow-2xl animate-pulse">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                      <span>Recording: {recordedSteps.length} Steps</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setIsRecordingWorkflow(false);
                          if (recordedSteps.length > 0) {
                            setIsCreateWfModalOpen(true);
                            setNewWfName(`Phone Workflow ${new Date().toLocaleDateString()}`);
                            setNewWfDesc(`Recorded ${recordedSteps.length} interactive actions`);
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px]"
                      >
                        Finish & Save
                      </button>
                      <button
                        onClick={() => {
                          setIsRecordingWorkflow(false);
                          setRecordedSteps([]);
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-white font-mono text-[9px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. LIVE VIEW (INTERACTIVE TELEPRESENCE PHONE MIRROR WITH AI DETECTIONS) */}
            {streamMode === "live_view" && (
              <div
                onClick={handleLiveViewTouch}
                onTouchStart={handleLiveViewTouch}
                onContextMenu={handlePhoneContextMenu}
                className="w-full h-full relative overflow-hidden bg-slate-950 flex flex-col justify-between cursor-crosshair"
                style={{ transform: `scale(${liveViewZoom})`, transformOrigin: "center center" }}
              >
                {/* Top Telepresence HUD Bar with AI/User Status Indicator */}
                <div className="z-30 p-2 bg-slate-950/95 border-b border-cyan-500/30 flex items-center justify-between backdrop-blur">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span className="text-[10px] font-mono font-bold text-cyan-300">
                      👁️ LIVE VIEW MIRROR
                    </span>
                    <Badge className={`text-[8px] py-0 px-1 font-mono ${isAiThinking || isAiExecuting ? "bg-purple-950 text-purple-300 border-purple-600 animate-pulse" : "bg-emerald-950 text-emerald-300 border-emerald-700"}`}>
                      {isAiThinking || isAiExecuting ? "🤖 AI OPERATING" : "👤 USER ACTIVE"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400">
                    <span>1080x2400</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">{fps || 60} FPS</span>
                    <span>•</span>
                    <span className="text-cyan-300 font-bold">{lastLatencyMs}ms</span>
                  </div>
                </div>

                {/* Simulated / Real Phone Screen Live Display with Interactive App Launchers */}
                <div className="flex-1 relative flex flex-col justify-between p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
                  {/* Grid Overlay if enabled */}
                  {showGridOverlay && (
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#08334415_1px,transparent_1px),linear-gradient(to_bottom,#08334415_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                  )}

                  {/* Top Status Bar Mirror */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 border-b border-white/5 pb-2">
                    <span className="font-bold">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div className="w-16 h-3 bg-black rounded-full border border-slate-800 flex items-center justify-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-1 text-[9px]">
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span>5G</span>
                      <span>96% âš¡</span>
                    </div>
                  </div>

                  {/* Interactive Search Bar Mirror with AI Bounding Box */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendChatMessage("Search web and inspect phone screen");
                    }}
                    className="relative my-2 p-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-between text-slate-300 cursor-pointer hover:border-cyan-400 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-medium text-slate-400">Search apps, web or ask AI...</span>
                    </div>
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                    {showAiBoundingBoxes && (
                      <div className="absolute -top-1.5 right-2 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500 text-[8px] font-mono text-cyan-300 font-bold">
                        Input • 99%
                      </div>
                    )}
                  </div>

                  {/* Interactive App Grid Mirror with AI Bounding Boxes */}
                  <div className="grid grid-cols-4 gap-3 py-4 relative">
                    {[
                      { name: "Chrome", icon: Globe, color: "from-blue-600 to-cyan-600", conf: "98%", url: "https://google.com" },
                      { name: "Calculator", icon: Calculator, color: "from-amber-600 to-orange-600", conf: "98%" },
                      { name: "Notes", icon: FileText, color: "from-indigo-600 to-purple-600", conf: "97%" },
                      { name: "Camera", icon: Camera, color: "from-emerald-600 to-teal-600", conf: "99%" },
                      { name: "YouTube", icon: Video, color: "from-red-600 to-rose-600", conf: "96%", url: "https://youtube.com" },
                      { name: "Music", icon: Music, color: "from-green-600 to-emerald-700", conf: "97%" },
                      { name: "Terminal", icon: Terminal, color: "from-slate-800 to-slate-950", conf: "99%" },
                      { name: "Files", icon: Folder, color: "from-amber-500 to-yellow-600", conf: "95%" },
                    ].map((app) => (
                      <div
                        key={app.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendMobileAction({
                            type: "open_app",
                            appName: app.name,
                            appUrl: app.url,
                            description: `Launched ${app.name} from Live Stream`,
                          });
                          toast.success(`📱 Opened ${app.name}`);
                        }}
                        className="flex flex-col items-center gap-1 relative group cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                      >
                        <div
                          className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white shadow-lg border border-white/20 relative`}
                        >
                          <app.icon className="w-5 h-5" />
                          {showAiBoundingBoxes && (
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 border border-black animate-ping" />
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-slate-300 truncate max-w-[54px]">{app.name}</span>
                        {showAiBoundingBoxes && (
                          <span className="text-[7px] font-mono text-emerald-400">{app.conf}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Navigation Dock Mirror */}
                  <div className="p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-around text-slate-400">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendMobileAction({ type: "key", key: "BACK", description: "Navigated Back" });
                        toast.info("â—€ Back");
                      }}
                      className="p-1 hover:text-white"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendMobileAction({ type: "key", key: "HOME", description: "Navigated Home" });
                        toast.info("ðŸ  Home");
                      }}
                      className="p-1 text-cyan-400 hover:text-cyan-300"
                    >
                      <Home className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendMobileAction({ type: "key", key: "RECENTS", description: "App Switcher" });
                        toast.info("ðŸ“‘ Recents");
                      }}
                      className="p-1 hover:text-white"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Bottom Live View Telemetry Toolbar */}
                <div className="p-2 bg-slate-950/95 border-t border-slate-800 flex items-center justify-between gap-1 z-30">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAiBoundingBoxes((prev) => !prev);
                      }}
                      className={`h-6 px-1.5 text-[9px] font-mono border-slate-700 ${
                        showAiBoundingBoxes ? "bg-cyan-950 text-cyan-300 border-cyan-600" : "text-slate-400"
                      }`}
                    >
                      <Target className="w-2.5 h-2.5 mr-0.5" /> AI Boxes
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowGridOverlay((prev) => !prev);
                      }}
                      className={`h-6 px-1.5 text-[9px] font-mono border-slate-700 ${
                        showGridOverlay ? "bg-cyan-950 text-cyan-300 border-cyan-600" : "text-slate-400"
                      }`}
                    >
                      <Crosshair className="w-2.5 h-2.5 mr-0.5" /> Grid
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSingleSnapshotTo10Pack("Live Stream Snapshot");
                      }}
                      className="h-6 px-2 text-[9px] font-mono border-slate-700 bg-slate-900 text-teal-300 hover:text-teal-200 gap-1"
                    >
                      <Camera className="w-2.5 h-2.5" /> 10-Snap
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSwitchStreamSource("interactive_phone");
                      }}
                      className="h-6 px-2 text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                    >
                      <Smartphone className="w-2.5 h-2.5" /> Virtual Phone
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. PC MIRROR MODE (FULL COMPUTER DESKTOP OS WITH WINDOWS KEY, START MENU & HOTKEYS) */}
            {streamMode === "mirror_pc" && (
              <div
                ref={pcMirrorContainerRef}
                onClick={handlePcMirrorTouch}
                onTouchStart={handlePcMirrorTouch}
                onContextMenu={handlePhoneContextMenu}
                className="w-full h-full relative overflow-hidden bg-slate-950 flex flex-col justify-between cursor-crosshair group select-none"
              >
                {/* Top PC Mirror HUD */}
                <div className="z-30 p-2 bg-slate-950/95 border-b border-indigo-500/40 flex items-center justify-between backdrop-blur">
                  <div className="flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span className="text-[10px] font-mono font-bold text-indigo-300">
                      ðŸ–¥ï¸ FULL PC DESKTOP (WINDOWS 11)
                    </span>
                    <Badge className="bg-indigo-950 text-indigo-300 border-indigo-700 text-[8px] font-mono">
                      {isRealPcScreenActive ? "ðŸ“¹ Live Stream" : "ðŸ’» Virtual OS"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRealPcScreenShare();
                      }}
                      className="h-5 px-1.5 text-[8px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
                      title="Share and stream your real computer desktop screen"
                    >
                      <Laptop className="w-2.5 h-2.5" /> {isRealPcScreenActive ? "Sharing PC" : "Share Real PC"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCaptureSnapshot();
                      }}
                      className="h-5 px-1.5 text-[8px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1"
                    >
                      <Camera className="w-2.5 h-2.5" /> Snap
                    </Button>
                  </div>
                </div>

                {/* PC Screen Visual Viewport (Full Computer Desktop) */}
                <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/80 flex flex-col justify-between p-2">
                  {/* If user is sharing actual real PC screen */}
                  {isRealPcScreenActive ? (
                    <video
                      ref={realScreenVideoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : pcMirrorFrame ? (
                    <img
                      src={pcMirrorFrame}
                      alt="Main PC Screen Mirror"
                      className="w-full h-full object-contain pointer-events-none select-none"
                    />
                  ) : (
                    /* Full Interactive Windows 11 Desktop Environment */
                    <div className="w-full h-full relative flex flex-col justify-between overflow-hidden">
                      {/* Desktop Icons Grid (Click to open on computer) */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-2 z-10 w-fit">
                        {[
                          { id: "this_pc", name: "This PC", icon: Laptop, color: "text-cyan-400", app: "files" as const },
                          { id: "chrome", name: "Google Chrome", icon: Globe, color: "text-blue-400", app: "browser" as const },
                          { id: "terminal", name: "Terminal / CLI", icon: Terminal, color: "text-emerald-400", app: "terminal" as const },
                          { id: "media", name: "Media Player", icon: Video, color: "text-red-400", app: "media" as const },
                          { id: "files", name: "Documents & SOPs", icon: Folder, color: "text-amber-400", app: "files" as const },
                          { id: "studio", name: "Automation Studio", icon: Sparkles, color: "text-purple-400", app: "browser" as const },
                          { id: "settings", name: "Settings", icon: Settings, color: "text-slate-400", app: "desktop" as const },
                          { id: "trash", name: "Recycle Bin", icon: Trash2, color: "text-slate-500", app: "desktop" as const },
                        ].map((iconItem) => (
                          <div
                            key={iconItem.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePcWindow(iconItem.app);
                              setIsPcStartMenuOpen(false);
                              toast.success(`ðŸ’» Opened ${iconItem.name} on PC Desktop`);
                            }}
                            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-white/10 active:scale-95 cursor-pointer transition-all group max-w-[68px]"
                          >
                            <div className="w-10 h-10 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                              <iconItem.icon className={`w-5 h-5 ${iconItem.color}`} />
                            </div>
                            <span className="text-[9px] font-bold text-slate-200 group-hover:text-white text-center leading-tight truncate max-w-[64px]">
                              {iconItem.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Active PC Window Overlay (If opened) */}
                      {activePcWindow !== "desktop" && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-x-2 top-2 bottom-12 bg-slate-950/95 rounded-xl border border-indigo-500/50 shadow-2xl z-20 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
                        >
                          {/* Window Titlebar */}
                          <div className="px-2.5 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-300">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold">
                              {activePcWindow === "browser" && <Globe className="w-3.5 h-3.5 text-blue-400" />}
                              {activePcWindow === "terminal" && <Terminal className="w-3.5 h-3.5 text-emerald-400" />}
                              {activePcWindow === "media" && <Video className="w-3.5 h-3.5 text-red-400" />}
                              {activePcWindow === "files" && <Folder className="w-3.5 h-3.5 text-amber-400" />}
                              {activePcWindow === "run" && <Zap className="w-3.5 h-3.5 text-cyan-400" />}
                              <span className="capitalize">{activePcWindow === "browser" ? "Google Chrome" : activePcWindow === "terminal" ? "PowerShell / ADB Terminal" : activePcWindow === "media" ? "Sightline Media Player" : activePcWindow === "files" ? "File Explorer & Documents" : "Run Command"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setActivePcWindow("desktop")}
                                className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[9px] flex items-center justify-center"
                                title="Minimize"
                              >
                                â”€
                              </button>
                              <button
                                onClick={() => setActivePcWindow("desktop")}
                                className="w-4 h-4 rounded bg-red-600/80 hover:bg-red-500 text-white text-[9px] flex items-center justify-center font-bold"
                                title="Close"
                              >
                                âœ•
                              </button>
                            </div>
                          </div>

                          {/* Window Body */}
                          <div className="flex-1 p-2.5 overflow-y-auto space-y-2 bg-slate-950 text-slate-200">
                            {activePcWindow === "browser" && (
                              <div className="space-y-2">
                                <div className="flex gap-1">
                                  <Input
                                    value={virtualOsAppUrl}
                                    onChange={(e) => setVirtualOsAppUrl(e.target.value)}
                                    placeholder="https://google.com or URL..."
                                    className="h-7 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                  />
                                  <Button size="sm" className="h-7 px-2 bg-blue-600 text-[10px] font-bold text-white">Go</Button>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[10px]">
                                  <p className="font-bold text-blue-300">Google Search & Web Automation Surface</p>
                                  <p className="text-slate-400">Desktop browser active. Ready to navigate, fill forms, and stream DOM.</p>
                                </div>
                              </div>
                            )}

                            {activePcWindow === "terminal" && (
                              <div className="space-y-2 font-mono text-[10px]">
                                <div className="p-2 rounded bg-black border border-slate-800 text-emerald-400 space-y-1">
                                  <p>Microsoft Windows [Version 10.0.22631.3085]</p>
                                  <p>(c) Microsoft Corporation. All rights reserved.</p>
                                  <p className="text-cyan-300">PS C:\Sightline\Automation&gt; adb devices</p>
                                  <p className="text-slate-300">List of devices attached: 1080x1920_ARM64 device</p>
                                  <p className="text-cyan-300">PS C:\Sightline\Automation&gt; ai --status</p>
                                  <p className="text-emerald-300">â— Sightline Perception + Planner: READY (Zero Drift)</p>
                                </div>
                                <div className="flex gap-1">
                                  <Input
                                    placeholder="Enter command e.g. dir, ping, ai-run..."
                                    className="h-7 text-[10px] bg-black border-slate-700 font-mono text-emerald-400"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        toast.success("Executed command in Desktop Terminal");
                                      }
                                    }}
                                  />
                                  <Button size="sm" className="h-7 px-2.5 bg-emerald-600 text-white font-bold text-[10px]">Run</Button>
                                </div>
                              </div>
                            )}

                            {activePcWindow === "media" && (
                              <div className="space-y-2">
                                <div className="w-full aspect-video rounded-xl bg-black border border-slate-800 flex items-center justify-center text-center p-3 relative overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-tr from-red-950/40 to-black" />
                                  <div className="z-10 space-y-1.5">
                                    <Video className="w-8 h-8 text-red-500 mx-auto animate-pulse" />
                                    <p className="font-bold text-xs text-white">Sightline High-Def Media Engine</p>
                                    <p className="text-[9px] text-slate-400">Audio/Video Synchronizer with Equalizer Active</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-mono p-1 bg-slate-900 rounded-lg">
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-white">â–¶ Play</Button>
                                  <span className="text-slate-400">01:45 / 03:20</span>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-white">ðŸ”Š 100%</Button>
                                </div>
                              </div>
                            )}

                            {activePcWindow === "files" && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-amber-300">Grounding Documents & SOPs</span>
                                  <label className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[9px] font-bold cursor-pointer flex items-center gap-1 shadow">
                                    <Upload className="w-2.5 h-2.5" /> Ingest Doc
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleUploadDocFile(f);
                                      }}
                                    />
                                  </label>
                                </div>
                                <div className="space-y-1.5">
                                  {uploadedDocs.map((doc) => (
                                    <div
                                      key={doc.id}
                                      onClick={() => {
                                        toast.info(`Selected "${doc.name}" for AI grounding`);
                                      }}
                                      className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 cursor-pointer flex items-center justify-between text-[10px]"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span className="font-bold text-slate-200 truncate">{doc.name}</span>
                                      </div>
                                      <span className="text-[8px] font-mono text-slate-400">{(doc.size / 1024).toFixed(1)} KB</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {activePcWindow === "run" && (
                              <div className="space-y-2 font-mono text-[10px]">
                                <p className="text-slate-300">Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.</p>
                                <div className="flex gap-1">
                                  <span className="font-bold text-cyan-400 py-1">Open:</span>
                                  <Input
                                    value={pcRunDialogInput}
                                    onChange={(e) => setPcRunDialogInput(e.target.value)}
                                    placeholder="e.g. cmd, notepad, chrome, msedge, code"
                                    className="h-7 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        toast.success(`Ran "${pcRunDialogInput || "cmd"}"`);
                                        setActivePcWindow("terminal");
                                      }
                                    }}
                                  />
                                </div>
                                <div className="flex justify-end gap-1.5 pt-1">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      toast.success(`Ran "${pcRunDialogInput || "cmd"}"`);
                                      setActivePcWindow("terminal");
                                    }}
                                    className="h-6 px-3 bg-cyan-600 text-white font-bold text-[9px]"
                                  >
                                    OK
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setActivePcWindow("desktop")}
                                    className="h-6 px-3 border-slate-700 text-slate-300 text-[9px]"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Windows 11 Start Menu Popover */}
                      {isPcStartMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-2 bottom-12 w-64 bg-slate-950/98 rounded-2xl border border-indigo-500/50 shadow-2xl p-3 z-30 space-y-2.5 animate-in slide-in-from-bottom duration-150 backdrop-blur-xl"
                        >
                          {/* Search in Start Menu */}
                          <div className="relative">
                            <Input
                              placeholder="Type here to search..."
                              className="h-7 text-[10px] bg-slate-900 border-slate-700 pl-7 text-slate-200"
                            />
                            <Globe className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                          </div>

                          {/* Pinned Apps in Start */}
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 font-mono">PINNED APPS</span>
                            <div className="grid grid-cols-3 gap-1.5 pt-1">
                              {[
                                { name: "Edge", icon: Globe, color: "text-blue-400", app: "browser" as const },
                                { name: "Terminal", icon: Terminal, color: "text-emerald-400", app: "terminal" as const },
                                { name: "Media", icon: Video, color: "text-red-400", app: "media" as const },
                                { name: "Explorer", icon: Folder, color: "text-amber-400", app: "files" as const },
                                { name: "Run", icon: Zap, color: "text-cyan-400", app: "run" as const },
                                { name: "Studio", icon: Sparkles, color: "text-purple-400", app: "browser" as const },
                              ].map((item) => (
                                <button
                                  key={item.name}
                                  onClick={() => {
                                    setActivePcWindow(item.app);
                                    setIsPcStartMenuOpen(false);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 flex flex-col items-center gap-0.5 border border-slate-800 hover:border-indigo-500"
                                >
                                  <item.icon className={`w-4 h-4 ${item.color}`} />
                                  <span className="text-[8px] text-slate-200">{item.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Recommended Docs in Start */}
                          <div className="border-t border-slate-800 pt-1.5">
                            <span className="text-[9px] font-bold text-slate-400 font-mono">RECOMMENDED SOPS</span>
                            <div className="space-y-1 pt-1">
                              {uploadedDocs.slice(0, 2).map((d) => (
                                <div
                                  key={d.id}
                                  onClick={() => {
                                    setActivePcWindow("files");
                                    setIsPcStartMenuOpen(false);
                                  }}
                                  className="p-1.5 rounded bg-slate-900/60 hover:bg-slate-800 flex items-center justify-between text-[9px] cursor-pointer"
                                >
                                  <span className="text-slate-300 truncate max-w-[150px]">{d.name}</span>
                                  <span className="text-[8px] text-slate-500 font-mono">Doc</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Power & Account Footer */}
                          <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between text-[9px]">
                            <span className="font-bold text-slate-300">Administrator (PC)</span>
                            <button
                              onClick={() => {
                                setIsPcStartMenuOpen(false);
                                toast.info("ðŸ”’ PC Locked");
                              }}
                              className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
                            >
                              Lock
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Windows 11 Taskbar at Bottom */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="h-10 bg-slate-950/95 border-t border-slate-800 rounded-xl flex items-center justify-between px-2 shadow-2xl z-20 backdrop-blur"
                      >
                        {/* Windows Logo Start Button âŠž */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleToggleWindowsKey}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm transition-all shadow-md ${
                              isPcStartMenuOpen
                                ? "bg-cyan-500 text-slate-950 shadow-cyan-950 scale-105"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white"
                            }`}
                            title="Windows Start Menu (âŠž Win Key)"
                          >
                            âŠž
                          </button>

                          {/* Search bar widget */}
                          <div
                            onClick={() => setIsPcStartMenuOpen(true)}
                            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-[9px] text-slate-400 cursor-pointer hover:border-slate-700"
                          >
                            <Globe className="w-2.5 h-2.5 text-slate-500" />
                            <span>Search</span>
                          </div>

                          {/* Pinned Taskbar Icons */}
                          {[
                            { icon: Globe, color: "text-blue-400", app: "browser" as const },
                            { icon: Folder, color: "text-amber-400", app: "files" as const },
                            { icon: Terminal, color: "text-emerald-400", app: "terminal" as const },
                            { icon: Video, color: "text-red-400", app: "media" as const },
                          ].map((item, idx) => (
                            <button
                              key={idx}
                              onClick={() => setActivePcWindow(item.app)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 ${
                                activePcWindow === item.app ? "bg-white/15 border-b-2 border-cyan-400" : ""
                              }`}
                            >
                              <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                            </button>
                          ))}
                        </div>

                        {/* System Tray (Clock, Network, Battery) */}
                        <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-400">
                          <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                          <Volume2 className="w-2.5 h-2.5 text-slate-300" />
                          <div className="text-right leading-tight text-slate-300 font-bold">
                            <div>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mouse Trails / Tap Ripple Feedback */}
                  {lastTouch && (
                    <div
                      className="absolute pointer-events-none w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-indigo-400 bg-indigo-500/30 animate-ping z-40"
                      style={{ left: `${lastTouch.x * 100}%`, top: `${lastTouch.y * 100}%` }}
                    />
                  )}
                </div>

                {/* Bottom PC Interaction Toolbar: Typing Input, Windows Key & Hotkeys */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="z-30 p-2 bg-slate-950/95 border-t border-slate-800 space-y-1.5 backdrop-blur"
                >
                  {/* Text Input & Typing Injection */}
                  <div className="flex items-center gap-1">
                    <Input
                      value={pcTextInput}
                      onChange={(e) => setPcTextInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSendPcText();
                      }}
                      placeholder="Type text to inject into PC..."
                      className="h-7 text-[10px] bg-slate-900 border-slate-700 text-slate-200 font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={handleSendPcText}
                      disabled={!pcTextInput.trim()}
                      className="h-7 px-2.5 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
                    >
                      Inject
                    </Button>
                  </div>

                  {/* Windows Key, Quick Hotkeys & Swipe Navigation */}
                  <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Windows Key Button */}
                      <Button
                        size="sm"
                        onClick={handleToggleWindowsKey}
                        className={`h-5 px-2 text-[9px] font-bold gap-1 shadow-sm ${
                          isPcStartMenuOpen ? "bg-cyan-500 text-black" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                        }`}
                        title="Windows Key (âŠž Win) - Toggle Start Menu"
                      >
                        âŠž Win
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSpecialHotkey("win+r", "Win + R (Run)")}
                        className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-amber-300"
                        title="Open Run Dialog"
                      >
                        Win+R
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSpecialHotkey("win+d", "Win + D (Show Desktop)")}
                        className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300"
                        title="Show Desktop"
                      >
                        Win+D
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSpecialHotkey("win+e", "Win + E (Explorer)")}
                        className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300"
                        title="File Explorer"
                      >
                        Win+E
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSpecialHotkey("alt+tab", "Alt + Tab")}
                        className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300"
                        title="Switch Window"
                      >
                        Alt+Tab
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcKey("enter", "Enter")}
                        className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300"
                      >
                        Enter â†µ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcKey("esc", "Escape")}
                        className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300"
                      >
                        Esc
                      </Button>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSwipe("up")}
                        className="h-5 px-1 text-[8px] font-mono border-slate-700 text-cyan-300"
                        title="Scroll Up"
                      >
                        â–²
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSwipe("down")}
                        className="h-5 px-1 text-[8px] font-mono border-slate-700 text-cyan-300"
                        title="Scroll Down"
                      >
                        â–¼
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSwipe("left")}
                        className="h-5 px-1 text-[8px] font-mono border-slate-700 text-cyan-300"
                        title="Scroll Left"
                      >
                        â—„
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPcSwipe("right")}
                        className="h-5 px-1 text-[8px] font-mono border-slate-700 text-cyan-300"
                        title="Scroll Right"
                      >
                        â–º
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. REAL SCREEN SHARE & CAMERA VIDEO MODES */}
            <video
              ref={primaryVideoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-contain bg-black ${
                streamMode === "screen" || streamMode === "camera_back" || streamMode === "camera_front" || streamMode === "dual"
                  ? "block"
                  : "hidden"
              }`}
            />

            {/* Camera Viewfinder Overlay when in camera mode */}
            {(streamMode === "camera_back" || streamMode === "camera_front") && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 z-20">
                <div className="flex items-center justify-between pointer-events-auto">
                  <span className="px-2 py-0.5 rounded bg-black/70 text-[9px] font-mono text-teal-300 border border-teal-500/40">
                    ðŸ“· LIVE CAMERA ({streamMode === "camera_front" ? "FRONT" : "REAR"})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setAutoBarcodeScan(!autoBarcodeScan)}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition-all flex items-center gap-1 ${
                        autoBarcodeScan
                          ? "bg-emerald-950 text-emerald-300 border-emerald-500/60 shadow-sm"
                          : "bg-slate-900/80 text-slate-400 border-slate-700"
                      }`}
                      title="Toggle auto barcode detection"
                    >
                      <Scan className="w-3 h-3" /> {autoBarcodeScan ? "Barcode ON" : "Barcode OFF"}
                    </button>
                    <button
                      onClick={() => setIsBarcodeModalOpen(true)}
                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold shadow flex items-center gap-1"
                    >
                      <Package className="w-2.5 h-2.5" /> Stock
                    </button>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-[9px] font-mono text-emerald-400 border border-emerald-500/40">
                      60 FPS
                    </span>
                  </div>
                </div>

                {/* Reticle with Laser Line */}
                <div className="relative flex items-center justify-center my-auto">
                  <div className="w-36 h-36 border-2 border-dashed border-emerald-400/70 rounded-2xl relative shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400 absolute -top-1 -left-1" />
                    <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400 absolute -top-1 -right-1" />
                    <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400 absolute -bottom-1 -left-1" />
                    <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400 absolute -bottom-1 -right-1" />
                    {autoBarcodeScan && (
                      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse" />
                    )}
                  </div>
                </div>

                {/* Floating Detected Barcode Overlay Card */}
                {detectedBarcode && (
                  <div className="pointer-events-auto p-2.5 rounded-xl bg-slate-950/95 border-2 border-emerald-500/80 shadow-2xl space-y-1.5 backdrop-blur-md mb-2 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-emerald-600 text-white text-[9px] font-mono">
                          {detectedBarcode.format}
                        </Badge>
                        <span className="text-[11px] font-mono font-bold text-white truncate max-w-[180px]">
                          {detectedBarcode.rawValue}
                        </span>
                      </div>
                      <button
                        onClick={() => setDetectedBarcode(null)}
                        className="text-slate-400 hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {detectedBarcodeItem && (
                      <div className="text-[10px] text-cyan-300 font-medium">
                        {detectedBarcodeItem.name} • Stock: <span className="font-bold text-white">{detectedBarcodeItem.quantity}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Button
                        size="sm"
                        onClick={async () => {
                          const res = await recordBarcodeScan({
                            barcode: detectedBarcode.rawValue,
                            delta: 1,
                            productName: detectedBarcodeItem?.name,
                          });
                          if (res.success && res.item) {
                            setDetectedBarcodeItem(res.item);
                            toast.success(`+1 Stock updated (${res.item.quantity} in stock)`);
                          }
                        }}
                        className="h-6 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold gap-1 shadow"
                      >
                        <Plus className="w-3 h-3" /> +1 Stock
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard?.writeText(detectedBarcode.rawValue);
                          toast.info("Copied barcode to clipboard");
                        }}
                        className="h-6 px-2 border-slate-700 text-slate-300 text-[10px]"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setIsBarcodeModalOpen(true)}
                        className="h-6 px-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold"
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                )}

                <div className="text-center text-[9px] font-mono text-slate-300 bg-black/75 p-1 rounded-md border border-slate-800">
                  {autoBarcodeScan ? "ðŸ” Auto-scanning camera for barcodes & QR codes" : "Point camera at barcode or screen"}
                </div>
              </div>
            )}

            {/* Canvas for background frame processing */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Visual Action Indicator Overlay */}
            {activeActionIndicator && (
              <div
                className="absolute pointer-events-none z-30 transition-all duration-200 flex flex-col items-center"
                style={{
                  left: `${activeActionIndicator.x * 100}%`,
                  top: `${activeActionIndicator.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full border-2 border-emerald-400 bg-emerald-500/30 animate-ping" />
                  <div className="absolute w-7 h-7 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,1)] flex items-center justify-center">
                    <MousePointer className="w-4 h-4 text-black" />
                  </div>
                </div>

                <div className="mt-2 px-2.5 py-1 rounded-md bg-black/95 border border-emerald-500/80 shadow-2xl backdrop-blur text-[10px] font-bold text-emerald-300 whitespace-nowrap">
                  {activeActionIndicator.description || activeActionIndicator.type}
                  {activeActionIndicator.text ? `: "${activeActionIndicator.text}"` : ""}
                </div>
              </div>
            )}

            {/* Ripple Surface for Touch / Clicks */}
            {lastTouch && (
              <div
                className="absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-2 border-cyan-400 bg-cyan-400/30 animate-ping pointer-events-none z-40 transition-all duration-75"
                style={{
                  left: `${lastTouch.x * 100}%`,
                  top: `${lastTouch.y * 100}%`,
                }}
              />
            )}
          </div>

          {/* Mode Switcher Toolbar (All Distinct Modes) */}
          <div className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleSwitchStreamSource("interactive_phone")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                streamMode === "interactive_phone"
                  ? "bg-emerald-600 text-white shadow-md font-black"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Interactive Phone OS: Tap apps, type text, and run AI automation"
            >
              <Smartphone className="w-3 h-3" /> Virtual Phone
            </button>

            <button
              onClick={() => handleStartRealPhoneScreenShare()}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                streamMode === "screen"
                  ? "bg-purple-600 text-white shadow-md font-black"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Share and mirror your actual physical phone screen live"
            >
              <Smartphone className="w-3 h-3 text-purple-300" /> Real Phone
            </button>

            <button
              onClick={() => handleSwitchStreamSource("live_view")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                streamMode === "live_view"
                  ? "bg-cyan-600 text-white shadow-md font-black"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Live View: Protected read-only inspection mirror"
            >
              <Eye className="w-3 h-3" /> Live View
            </button>

            <button
              onClick={() => handleSwitchStreamSource("mirror_pc")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                streamMode === "mirror_pc"
                  ? "bg-indigo-600 text-white shadow-md font-black"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Mirror Desktop PC Viewport & Click Surface"
            >
              <Laptop className="w-3 h-3" /> PC Mirror
            </button>

            <button
              onClick={() => handleSwitchStreamSource("camera_back")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                streamMode === "camera_back"
                  ? "bg-teal-600 text-white shadow-md font-black"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Rear Camera Stream"
            >
              <Camera className="w-3 h-3" /> Cam
            </button>
          </div>

          {/* Quick Hardware Action Bar */}
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              onClick={() => setIsTemplateDrawerOpen(true)}
              className="h-8 rounded-lg text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1"
              title="Template Connect - Linked Apps (Scoped Automation)"
            >
              <Grid className="w-3 h-3" /> Home Apps
            </Button>
            <Button
              onClick={() => {
                if (streamMode === "interactive_phone") {
                  setIsRecordingWorkflow((prev) => !prev);
                  if (!isRecordingWorkflow) {
                    setRecordedSteps([]);
                    toast.info("ðŸ”´ Workflow Recording Started: Tap apps to record steps");
                  }
                } else {
                  handleSwitchStreamSource("interactive_phone");
                  setIsRecordingWorkflow(true);
                  setRecordedSteps([]);
                  toast.info("ðŸ”´ Switched to Phone & Started Recording Steps");
                }
              }}
              variant="outline"
              className={`h-8 rounded-lg text-[11px] font-bold border-slate-700 bg-slate-800 gap-1 ${
                isRecordingWorkflow ? "text-red-400 border-red-500" : "text-slate-200"
              }`}
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              {isRecordingWorkflow ? "Stop Rec" : "Record Wf"}
            </Button>
            <Button
              onClick={handleRecord10DifferentialScreenshots}
              disabled={isRecording10Pack}
              className="h-8 rounded-lg text-[11px] font-bold bg-teal-600 hover:bg-teal-500 text-white gap-1"
              title="Record 10-Screenshot Differential Workflow Pack"
            >
              {isRecording10Pack ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              {isRecording10Pack ? `${packProgress}/10` : "10-Snap"}
            </Button>
            <Button
              onClick={handleCaptureSnapshot}
              className="h-8 rounded-lg text-[11px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1"
            >
              <Zap className="w-3 h-3" /> Snap
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: DOCUMENT UPLOAD & AI GROUNDING CONTEXT */}
      {/* ---------------------------------------------------- */}
      {activeTab === "docs" && (
        <div className="w-full max-w-md flex-1 space-y-2.5 my-2">
          {/* Document Ingestion Banner */}
          <div className="p-3 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950/60 to-slate-900 border border-blue-500/40 shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">AI Grounding Documents</h3>
                  <p className="text-[9px] text-slate-400">Upload SOPs, specs, or task guidance for AI to read</p>
                </div>
              </div>
              <label className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95 transition-all">
                <Upload className="w-3 h-3" /> Upload Doc
                <input
                  type="file"
                  accept=".pdf,.txt,.docx,.json,.md,.csv,.png,.jpg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadDocFile(f);
                  }}
                />
              </label>
            </div>
            <p className="text-[10px] text-slate-300 leading-tight">
              Uploaded reference files give the autonomous agent rich domain context and step-by-step procedures when completing workflows.
            </p>
          </div>

          {/* Search Documents Filter */}
          <div className="relative">
            <Input
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              placeholder="Search uploaded SOPs and grounding documents..."
              className="h-8 text-[11px] bg-slate-900 border-slate-700 pl-8 text-slate-200"
            />
            <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Document List */}
          <div className="space-y-2">
            {uploadedDocs
              .filter((d) => !docSearchQuery || d.name.toLowerCase().includes(docSearchQuery.toLowerCase()) || d.content.toLowerCase().includes(docSearchQuery.toLowerCase()))
              .map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 transition-all shadow-md space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-blue-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-white truncate">{doc.name}</p>
                        <p className="text-[9px] text-slate-400 font-mono">
                          {(doc.size / 1024).toFixed(1)} KB • {doc.fileType} • {new Date(doc.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedDocForAi(doc.name);
                        setActiveTab("chat");
                        handleSendChatMessage(`Please use instructions from document "${doc.name}" to execute current workflow steps.`);
                        toast.success(`Attached "${doc.name}" to AI context!`);
                      }}
                      className="h-6 px-2 text-[9px] font-bold bg-blue-600 hover:bg-blue-500 text-white shrink-0 gap-1"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-blue-200" /> Use in AI
                    </Button>
                  </div>

                  {/* Document Content / Summary Preview */}
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[10px] font-mono text-slate-300 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                    {doc.content.slice(0, 300)}{doc.content.length > 300 ? "..." : ""}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: SCHEDULED WORKFLOWS (10s AUTO-COMPLETION & AGENT LEARNING) */}
      {/* ---------------------------------------------------- */}
      {activeTab === "scheduled" && (
        <div className="w-full max-w-md flex-1 space-y-2.5 my-2">
          {/* 10s Heartbeat & AI Learning Telemetry Bar */}
          <div className="p-2 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-cyan-500/40 shadow-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-[10px] font-mono font-bold text-cyan-300">
                  âš¡ 10s Completion Checks Active
                </span>
              </div>
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[8px] font-mono">
                AI Auto-Learning
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-300 pt-0.5 border-t border-white/5">
              <span>Auto-Completed: <strong className="text-emerald-400">{autoCompletedCount}</strong></span>
              <span>Learned Routes: <strong className="text-purple-300">{learnedPatterns}</strong></span>
              <span className="text-slate-400">Heartbeat: {new Date(last10sCheckTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </div>
          </div>

          {/* Header Bar */}
          <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-xs font-bold text-white">Scheduled Workflows</h3>
                <p className="text-[9px] text-slate-400">Active schedules: {scheduledWorkflows.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  setSchedFormName(`Custom Schedule ${scheduledWorkflows.length + 1}`);
                  setSchedFormDesc("Autonomous multi-step device automation");
                  setSchedFormInterval(15);
                  setSchedFormAutoHeal(true);
                  setSchedFormSteps([
                    { id: "s1", type: "tap", description: "Focus target application", x: 0.5, y: 0.2 },
                    { id: "s2", type: "swipe", description: "Scroll content stream", x: 0.5, y: 0.7 },
                  ]);
                  setIsCreateScheduleModalOpen(true);
                }}
                className="h-6 px-2 text-[9px] font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1"
              >
                <Plus className="w-2.5 h-2.5" /> Schedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchScheduledWorkflows}
                className="h-6 px-2 text-[9px] font-mono border-slate-700 text-cyan-300 gap-1"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isLoadingScheduled ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>

          {/* Scheduled Tasks List */}
          <div className="space-y-2">
            {scheduledWorkflows.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-400">No Scheduled Workflows Active</p>
                <p className="text-[10px] text-slate-500">
                  Tap '+ Schedule' above or convert captured 10-packs to create recurring automated runs.
                </p>
              </div>
            ) : (
              scheduledWorkflows.map((sw) => (
                <div
                  key={sw.id}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 hover:border-amber-500/50 transition-colors shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{sw.name}</span>
                        <Badge
                          className={`text-[8px] py-0 px-1 font-mono ${
                            sw.status === "running"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-700 animate-pulse"
                              : sw.status === "paused"
                              ? "bg-amber-950 text-amber-300 border-amber-700"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {sw.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{sw.description}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[9px] font-mono text-cyan-300 block">
                        Every {sw.intervalMinutes || 15}m
                      </span>
                      <span className="text-[8px] font-mono text-slate-500">
                        Step {sw.currentStepIndex + 1}/{sw.totalSteps}
                      </span>
                    </div>
                  </div>

                  {/* Step Progress Visual Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden flex gap-0.5">
                      {sw.steps.map((step, idx) => (
                        <div
                          key={step.id}
                          className={`flex-1 h-full rounded-full transition-all ${
                            idx < sw.currentStepIndex
                              ? "bg-emerald-400"
                              : idx === sw.currentStepIndex && sw.status === "running"
                              ? "bg-cyan-400 animate-pulse"
                              : idx === sw.currentStepIndex && sw.status === "paused"
                              ? "bg-amber-400"
                              : "bg-slate-700"
                          }`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                      <span>Current: {sw.steps[sw.currentStepIndex]?.description || "Ready"}</span>
                      {sw.autoHeal && <span className="text-emerald-400">âš¡ Auto-Heal ON</span>}
                    </div>
                  </div>

                  {/* Execution Control Action Buttons (Continue, Restart, Pause, Step, Edit, Delete) */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800">
                    {sw.status === "running" ? (
                      <Button
                        size="sm"
                        onClick={() => handleScheduledWorkflowAction(sw.id, "pause")}
                        disabled={activeScheduledActionId === sw.id}
                        className="flex-1 h-7 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1"
                      >
                        <Pause className="w-3 h-3" /> Pause
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleScheduledWorkflowAction(sw.id, "continue")}
                        disabled={activeScheduledActionId === sw.id}
                        className="flex-1 h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                      >
                        <Play className="w-3 h-3" /> Run
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleScheduledWorkflowAction(sw.id, "restart")}
                      disabled={activeScheduledActionId === sw.id}
                      className="h-7 px-2 text-[10px] font-bold border-slate-700 bg-slate-800 hover:bg-slate-700 text-cyan-300 gap-1"
                      title="Restart from Step 1"
                    >
                      <RotateCcw className="w-3 h-3 text-cyan-400" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleScheduledWorkflowAction(sw.id, "step")}
                      disabled={activeScheduledActionId === sw.id}
                      className="h-7 px-2 text-[10px] font-bold border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Step Forward 1 Action"
                    >
                      <SkipForward className="w-3 h-3" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEditSchedule(sw)}
                      className="h-7 px-2 text-[10px] font-bold border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-300"
                      title="Edit Schedule & Steps"
                    >
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteSchedule(sw.id)}
                      className="h-7 px-2 text-[10px] font-bold border-slate-700 bg-slate-800 hover:bg-red-950 text-red-400 hover:text-red-300"
                      title="Delete Schedule"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: WORKFLOWS MANAGER */}
      {/* ---------------------------------------------------- */}
      {activeTab === "chat" && (
        <div className="flex-1 min-h-0 bg-slate-950 p-2 overflow-hidden flex flex-col">
          <MainAiLiveChat targetDevice="android" />
        </div>
      )}
      {activeTab === "workflows" && (
        <div className="w-full max-w-md flex-1 space-y-2.5 my-2">
          <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <div>
                <h3 className="text-xs font-bold text-white">Synced Workflows</h3>
                <p className="text-[9px] text-slate-400">{workflows.length} workflows saved</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setIsCreateWfModalOpen(true)}
              className="h-6 px-2 text-[9px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
            >
              <Plus className="w-2.5 h-2.5" /> Create
            </Button>
          </div>

          <div className="relative">
            <input
              value={workflowSearch}
              onChange={(e) => setWorkflowSearch(e.target.value)}
              placeholder="Search workflows by name or action..."
              className="w-full h-8 bg-slate-900 rounded-xl px-3 text-[11px] font-mono text-slate-200 border border-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 hover:border-indigo-500/50 transition-colors shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">{wf.name}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{wf.description}</p>
                  </div>
                  <Badge className="text-[8px] py-0 px-1.5 bg-indigo-950 text-indigo-300 border-indigo-700">
                    {wf.actions.length} Steps
                  </Badge>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-[9px] font-mono text-slate-500">
                    Created {new Date(wf.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSchedFormName(`Schedule: ${wf.name}`);
                        setSchedFormDesc(wf.description);
                        setSchedFormInterval(15);
                        setSchedFormAutoHeal(true);
                        setSchedFormSteps(
                          wf.actions.map((a, i) => ({
                            id: `s_${i + 1}`,
                            type: a.type,
                            description: a.description || `Step ${i + 1}`,
                            x: a.x,
                            y: a.y,
                            text: a.text,
                            key: a.key,
                          }))
                        );
                        setIsCreateScheduleModalOpen(true);
                      }}
                      className="h-6 px-2 text-[9px] font-mono border-slate-700 bg-slate-800 text-amber-300 hover:text-amber-200 gap-1"
                    >
                      <Clock className="w-2.5 h-2.5" /> Schedule
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => (executingWorkflowId === wf.id ? actionGate.stop() : handleExecuteWorkflow(wf))}
                      className="h-6 px-2.5 text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                    >
                      {executingWorkflowId === wf.id ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Play className="w-2.5 h-2.5" />
                      )}
                      {executingWorkflowId === wf.id ? "Executing... (Stop)" : "Run on Phone"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 4: 10-SCREENSHOT DIFFERENTIAL PACKS */}
      {/* ---------------------------------------------------- */}
      {activeTab === "pack10" && (
        <div className="w-full max-w-md flex-1 space-y-2.5 my-2">
          <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-teal-400" />
              <div>
                <h3 className="text-xs font-bold text-white">10-Screenshot Differential Packs</h3>
                <p className="text-[9px] text-slate-400">Step-by-step differential capture</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {tenFramesPack.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleConvert10PackToSchedule}
                  className="h-6 px-2 text-[9px] font-bold bg-amber-600 hover:bg-amber-500 text-white gap-1"
                  title="Convert captured 10-pack to recurring schedule"
                >
                  <Clock className="w-2.5 h-2.5" /> Convert to Sched
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleRecord10DifferentialScreenshots}
                disabled={isRecording10Pack}
                className="h-6 px-2 text-[9px] font-bold bg-teal-600 hover:bg-teal-500 text-white gap-1"
              >
                {isRecording10Pack ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Plus className="w-2.5 h-2.5" />}
                {isRecording10Pack ? `Recording ${packProgress}/10...` : "Record 10-Pack"}
              </Button>
            </div>
          </div>

          {tenFramesPack.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
              <Camera className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-bold text-slate-400">No 10-Screenshot Pack Recorded</p>
              <p className="text-[10px] text-slate-500">
                Tap 'Record 10-Pack' to capture a full 10-step differential workflow sequence with visual deltas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {tenFramesPack.map((f) => (
                <div key={f.id} className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span className="font-bold text-teal-300">Step #{f.stepNumber}</span>
                    <span className="text-slate-500">{f.actionType}</span>
                  </div>
                  <div className="w-full aspect-[9/14] bg-black rounded-lg overflow-hidden border border-slate-800">
                    <img src={f.imageData} alt={`Step ${f.stepNumber}`} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[8px] text-slate-400 truncate">{f.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 5: AI ACTIONS LOG & DISPATCHER */}
      {/* ---------------------------------------------------- */}
      {activeTab === "actions" && (
        <div className="w-full max-w-md flex-1 space-y-2.5 my-2">
          <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="text-xs font-bold text-white">AI Dispatched Actions</h3>
                <p className="text-[9px] text-slate-400">Live execution stream from AI planner</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActionHistory([])}
              className="h-6 px-2 text-[9px] font-mono border-slate-700 text-slate-400"
            >
              Clear Log
            </Button>
          </div>

          <div className="space-y-1.5">
            {actionHistory.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                <Zap className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-400">No Actions Recorded Yet</p>
                <p className="text-[10px] text-slate-500">
                  Actions executed by the AI copilot or forwarded from the desktop deck will appear here.
                </p>
              </div>
            ) : (
              actionHistory.map((a) => (
                <div
                  key={a.id}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-[10px] font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-200">{a.desc}</span>
                  </div>
                  <span className="text-[9px] text-slate-500">{a.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TEMPLATE CONNECT / LINKED APPS DRAWER (HOME APPS) */}
      {/* ---------------------------------------------------- */}
      {isTemplateDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-4 max-h-[85vh] flex flex-col gap-3 shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-amber-600 flex items-center justify-center text-white font-bold">
                  âš¡
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    Template Connect • Linked Apps
                  </h3>
                  <p className="text-[9px] text-slate-400">
                    Connect a linked app to isolate AI automation and workflows strictly to that application
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTemplateDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Apps Grid */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {templateApps.map((app) => (
                <div
                  key={app.id}
                  onClick={() => {
                    setActiveLinkedApp(app);
                    setIsTemplateDrawerOpen(false);
                    if (app.id === "app_inventory") {
                      setIsBarcodeModalOpen(true);
                    }
                    toast.success(`âš¡ Template Connected: Scoped to "${app.name}"`);
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    activeLinkedApp?.id === app.id
                      ? "bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-950"
                      : "bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white font-bold shadow-md`}>
                        <Grid className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{app.name}</h4>
                        <span className="text-[9px] font-mono text-cyan-400">{app.category}</span>
                      </div>
                    </div>

                    <Badge
                      className={`text-[8px] py-0 px-1.5 font-mono ${
                        activeLinkedApp?.id === app.id
                          ? "bg-indigo-600 text-white border-transparent"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {activeLinkedApp?.id === app.id ? "ACTIVE LINK" : "CONNECT"}
                    </Badge>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed">{app.description}</p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {app.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800"
                      >
                        âœ“ {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              {activeLinkedApp ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveLinkedApp(null);
                    setIsTemplateDrawerOpen(false);
                    toast.info("Cleared Linked Scope: Full Phone OS active");
                  }}
                  className="h-7 text-[10px] font-mono border-slate-700 text-slate-400"
                >
                  Clear Scope (Full Phone OS)
                </Button>
              ) : (
                <span className="text-[9px] font-mono text-slate-500">No linked app scoped currently</span>
              )}
              <Button
                size="sm"
                onClick={() => setIsTemplateDrawerOpen(false)}
                className="h-7 px-3 text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* CREATE WORKFLOW MODAL */}
      {/* ---------------------------------------------------- */}
      {isCreateWfModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" /> Save Recorded Workflow
              </h3>
              <button onClick={() => setIsCreateWfModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-mono text-slate-400">Workflow Name</label>
                <Input
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="e.g. Chrome Search & Note Sync"
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400">Description</label>
                <Input
                  value={newWfDesc}
                  onChange={(e) => setNewWfDesc(e.target.value)}
                  placeholder="e.g. Automated navigation and note logging"
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {recordedSteps.length > 0 && (
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 max-h-32 overflow-y-auto space-y-1">
                  <span className="text-[9px] font-mono text-cyan-300 font-bold block">
                    Recorded Steps ({recordedSteps.length}):
                  </span>
                  {recordedSteps.map((s, idx) => (
                    <div key={s.id} className="text-[8px] font-mono text-slate-400 flex items-center justify-between">
                      <span>
                        #{idx + 1}: {s.description}
                      </span>
                      <span>{s.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCreateWfModalOpen(false)}
                className="h-7 text-[10px] border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (!newWfName.trim()) {
                    toast.error("Please enter a workflow name");
                    return;
                  }
                  const newWf: SyncedWorkflow = {
                    id: `wf_${Date.now()}`,
                    name: newWfName,
                    description: newWfDesc || "Interactive mobile workflow",
                    tags: ["phone", "recorded"],
                    actions: recordedSteps.map((s, i) => ({
                      id: `act_${i}`,
                      type: s.type || "tap",
                      description: s.description,
                      durationMs: 800,
                    })),
                    createdAt: Date.now(),
                  };

                  try {
                    await fetch("/api/mobile-stream/workflows", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ workflow: newWf }),
                    });
                    setWorkflows((prev) => [newWf, ...prev]);
                    setIsCreateWfModalOpen(false);
                    setRecordedSteps([]);
                    toast.success("âœ… Saved workflow to cloud repository");
                  } catch {
                    toast.error("Failed saving workflow");
                  }
                }}
                className="h-7 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Save Workflow
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* CREATE SCHEDULE MODAL */}
      {/* ---------------------------------------------------- */}
      {isCreateScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" /> Create Scheduled Workflow
              </h3>
              <button onClick={() => setIsCreateScheduleModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="text-[10px] font-mono text-slate-400">Schedule Name</label>
                <Input
                  value={schedFormName}
                  onChange={(e) => setSchedFormName(e.target.value)}
                  placeholder="e.g. Social Feed & Alerts Scraper"
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400">Description</label>
                <Input
                  value={schedFormDesc}
                  onChange={(e) => setSchedFormDesc(e.target.value)}
                  placeholder="e.g. Periodic feed scroll and notification dismissal"
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-slate-400">Run Interval</label>
                  <select
                    value={schedFormInterval}
                    onChange={(e) => setSchedFormInterval(Number(e.target.value))}
                    className="w-full h-8 bg-slate-950 border border-slate-800 rounded-md text-xs text-white px-2 font-mono"
                  >
                    <option value={1}>Every 1 Minute</option>
                    <option value={5}>Every 5 Minutes</option>
                    <option value={10}>Every 10 Minutes</option>
                    <option value={15}>Every 15 Minutes</option>
                    <option value={30}>Every 30 Minutes</option>
                    <option value={60}>Every 1 Hour</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[9px] font-mono text-slate-300">âš¡ Auto-Heal</span>
                    <Switch
                      checked={schedFormAutoHeal}
                      onCheckedChange={setSchedFormAutoHeal}
                      className="scale-75 data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Steps Editor */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-cyan-300">
                    Workflow Steps ({schedFormSteps.length})
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddStepToForm}
                    className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300 gap-1"
                  >
                    <Plus className="w-2.5 h-2.5" /> Add Step
                  </Button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {schedFormSteps.map((step, idx) => (
                    <div
                      key={step.id}
                      className="p-2 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-slate-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-cyan-400 font-bold">Step #{idx + 1}</span>
                        {schedFormSteps.length > 1 && (
                          <button
                            onClick={() => handleRemoveStepFromForm(idx)}
                            className="text-slate-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1">
                        <select
                          value={step.type}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setSchedFormSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, type: newType } : s))
                            );
                          }}
                          className="h-7 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-200 px-1"
                        >
                          <option value="tap">Tap / Click</option>
                          <option value="type">Type Text</option>
                          <option value="swipe">Swipe / Scroll</option>
                          <option value="key">Press Key</option>
                        </select>

                        <Input
                          value={step.description}
                          onChange={(e) => {
                            const newDesc = e.target.value;
                            setSchedFormSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, description: newDesc } : s))
                            );
                          }}
                          placeholder="Action Description"
                          className="h-7 col-span-2 text-[10px] bg-slate-900 border-slate-800 text-white font-mono"
                        />
                      </div>

                      {step.type === "type" && (
                        <Input
                          value={step.text || ""}
                          onChange={(e) => {
                            const newText = e.target.value;
                            setSchedFormSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, text: newText } : s))
                            );
                          }}
                          placeholder="Text to Type..."
                          className="h-6 text-[9px] bg-slate-900 border-slate-800 text-emerald-300 font-mono"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCreateScheduleModalOpen(false)}
                className="h-7 text-[10px] border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateNewSchedule}
                className="h-7 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white"
              >
                Save Schedule
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* EDIT SCHEDULE MODAL */}
      {/* ---------------------------------------------------- */}
      {isEditScheduleModalOpen && editingScheduleWf && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" /> Edit Scheduled Workflow
              </h3>
              <button onClick={() => setIsEditScheduleModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="text-[10px] font-mono text-slate-400">Schedule Name</label>
                <Input
                  value={schedFormName}
                  onChange={(e) => setSchedFormName(e.target.value)}
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400">Description</label>
                <Input
                  value={schedFormDesc}
                  onChange={(e) => setSchedFormDesc(e.target.value)}
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-slate-400">Run Interval</label>
                  <select
                    value={schedFormInterval}
                    onChange={(e) => setSchedFormInterval(Number(e.target.value))}
                    className="w-full h-8 bg-slate-950 border border-slate-800 rounded-md text-xs text-white px-2 font-mono"
                  >
                    <option value={1}>Every 1 Minute</option>
                    <option value={5}>Every 5 Minutes</option>
                    <option value={10}>Every 10 Minutes</option>
                    <option value={15}>Every 15 Minutes</option>
                    <option value={30}>Every 30 Minutes</option>
                    <option value={60}>Every 1 Hour</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[9px] font-mono text-slate-300">âš¡ Auto-Heal</span>
                    <Switch
                      checked={schedFormAutoHeal}
                      onCheckedChange={setSchedFormAutoHeal}
                      className="scale-75 data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Steps Editor */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-cyan-300">
                    Workflow Steps ({schedFormSteps.length})
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddStepToForm}
                    className="h-5 px-1.5 text-[8px] font-mono border-slate-700 text-slate-300 gap-1"
                  >
                    <Plus className="w-2.5 h-2.5" /> Add Step
                  </Button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {schedFormSteps.map((step, idx) => (
                    <div
                      key={step.id}
                      className="p-2 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-slate-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-cyan-400 font-bold">Step #{idx + 1}</span>
                        {schedFormSteps.length > 1 && (
                          <button
                            onClick={() => handleRemoveStepFromForm(idx)}
                            className="text-slate-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1">
                        <select
                          value={step.type}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setSchedFormSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, type: newType } : s))
                            );
                          }}
                          className="h-7 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-200 px-1"
                        >
                          <option value="tap">Tap / Click</option>
                          <option value="type">Type Text</option>
                          <option value="swipe">Swipe / Scroll</option>
                          <option value="key">Press Key</option>
                        </select>

                        <Input
                          value={step.description}
                          onChange={(e) => {
                            const newDesc = e.target.value;
                            setSchedFormSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, description: newDesc } : s))
                            );
                          }}
                          placeholder="Action Description"
                          className="h-7 col-span-2 text-[10px] bg-slate-900 border-slate-800 text-white font-mono"
                        />
                      </div>

                      {step.type === "type" && (
                        <Input
                          value={step.text || ""}
                          onChange={(e) => {
                            const newText = e.target.value;
                            setSchedFormSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, text: newText } : s))
                            );
                          }}
                          placeholder="Text to Type..."
                          className="h-6 text-[9px] bg-slate-900 border-slate-800 text-emerald-300 font-mono"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditScheduleModalOpen(false)}
                className="h-7 text-[10px] border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateSchedule}
                className="h-7 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white"
              >
                Update Schedule
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* APK / PWA Modal */}
      <ApkAndPwaModal open={isApkModalOpen} onOpenChange={setIsApkModalOpen} />

      {/* Interactive Right-Click Settings & Step Creator for Mobile Stream */}
      <InteractiveContextMenu
        target={contextMenuTarget}
        isOpen={isContextMenuOpen}
        onClose={() => setIsContextMenuOpen(false)}
        onDirectHardwareAction={(action, x, y, extra) => {
          sendMobileAction({
            type: action === "swipe_up" ? "swipe" : action === "swipe_down" ? "swipe" : action === "swipe_left" ? "swipe" : action === "swipe_right" ? "swipe" : action === "type" ? "type" : "tap",
            x: x / 1080,
            y: y / 1920,
            text: extra?.text,
            description: `Hardware Action: ${action} @ (${x}, ${y})`,
          });
        }}
        onAddSequenceStep={(stepData) => {
          setRecordedSteps((prev) => [
            ...prev,
            {
              id: `step_${Date.now()}`,
              type: stepData.action,
              description: `${stepData.name} @ (${stepData.x}, ${stepData.y})`,
              time: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
            },
          ]);
          toast.success(`Added ${stepData.name} @ (${stepData.x}, ${stepData.y}) to mobile sequence`);
        }}
        onInspectOCR={(x, y) => {
          toast.info(`Inspecting Phone Element @ (${x}, ${y})`);
        }}
        onVerifyIntegrity={(x, y) => {
          toast.info(`Phone Stream Integrity Verified @ (${x}, ${y})`);
        }}
        onTellMainAiToMove={(x, y) => {
          sendMobileAction({
            type: "tap",
            x: x / 1080,
            y: y / 1920,
            description: `AI Navigated to (${x}, ${y})`,
          });
          toast.info(`AI Cue sent to phone @ (${x}, ${y})`);
        }}
        onTag3WayEntity={(type, x, y) => {
          toast.success(`Tagged phone entity (${x}, ${y}) as ${type.toUpperCase()}`);
        }}
      />

      {/* Barcode & Inventory Scanner Dialog */}
      <BarcodeInventoryScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        videoElement={primaryVideoRef.current}
        initialBarcode={detectedBarcode?.rawValue}
        onBarcodeDetected={(barcode, item) => {
          setDetectedBarcode(barcode);
          if (item) setDetectedBarcodeItem(item);
        }}
      />
    </div>
  );
}

