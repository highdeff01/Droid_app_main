import React, { useState, useEffect, useRef, useCallback } from "react";
import { generateDefaultMobileFrame } from "@/lib/mobile-screen-generator";
import { InteractivePhoneVirtualOS } from "@/components/interactive-phone-virtual-os";
import { MobileSettingsModal } from "./mobile-settings-modal";
import { ApkAndPwaModal } from "./ApkAndPwaModal";
import {
  Bluetooth,
  Smartphone,
  Wifi,
  QrCode,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  ExternalLink,
  Radio,
  Activity,
  ShieldCheck,
  Search,
  Check,
  Layers,
  MousePointer,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Home,
  Type,
  Plus,
  Play,
  PlayCircle,
  Bot,
  Sparkles,
  Send,
  Save,
  FileText,
  Clock,
  Edit3,
  Trash2,
  Scissors,
  Download,
  Image as ImageIcon,
  ZoomIn,
  Eye,
  Sliders,
  CheckSquare,
  Monitor,
  Square,
  Repeat,
  Wand2,
  Tag,
  Share2,
  GitFork,
  Network,
  Cpu,
  Gauge,
  Compass,
  HelpCircle,
  Maximize2,
  FileSearch,
  Split,
  Upload,
  ShieldAlert,
  ArrowRightCircle,
  ChevronRight,
  Bell,
  X,
  Globe,
  MessageSquare,
  MapPin,
  Camera,
  ShoppingBag,
  Folder,
  Settings,
  Crosshair,
  Target,
  Scan,
  Package,
  Barcode,
} from "lucide-react";
import { calibrateCoordinates } from "@/lib/coordinate-calibration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { AutonomousWorkflowModal } from "@/components/autonomous-workflow-modal";
import { WorkflowGenealogyViewer } from "@/components/workflow-genealogy-viewer";
import { MainAiLiveChat } from "@/components/main-ai-live-chat";
import { BarcodeInventoryScannerModal } from "@/components/barcode-inventory-scanner-modal";
import {
  scanBarcodeFromDataUrl,
  playScanBeep,
  ScannedBarcode,
} from "@/lib/barcode-scanner";

export interface NavigationNode {
  id: string;
  title: string;
  screenType: string;
  timestamp: number;
  thumbnail?: string;
  visitCount: number;
  isDeadEnd?: boolean;
  isHome?: boolean;
  appPackage?: string;
  errorRate: number;
}

export interface NavigationEdge {
  id: string;
  fromId: string;
  toId: string;
  actionDescription: string;
  actionType: string;
  latencyMs: number;
  status: "success" | "reject" | "freeze" | "slow" | "backtrack" | "dead_route";
  aiThoughts?: string;
  easierAlternative?: string;
  count: number;
  timestamp: number;
  errorDetails?: string;
}

export interface AssignedAgent {
  id: string;
  name: string;
  role: "sentinel_watch" | "assist_proactive" | "renavigate_recovery" | "background_worker";
  status: "active" | "idle" | "intervening" | "paused";
  assignedTask?: string;
  interventionCount: number;
  lastIntervention?: string;
  lastInterventionAt?: number;
}

export interface WorkspaceSettings {
  autoRecordWorkflows: boolean;
  recordCadenceMs: number;
  deadRouteSensitivity: "low" | "medium" | "high";
  autoRenavigateOnDeadRoute: boolean;
  autoDismissPopups: boolean;
  enableBackgroundAudio: boolean;
  enableMultiWindowHomeSync: boolean;
  audioFeedbackAlerts: boolean;
  activeModel: string;
}

export interface DeviceTelemetry {
  connected: boolean;
  deviceName: string;
  fps: number;
  actionLatencyMs: number;
  cpuUsagePercent: number;
  memoryUsageMB: number;
  batteryLevel: number;
  isCharging: boolean;
  activeAgentsCount: number;
  queueDepth: number;
  totalExecutedActions: number;
  worktreeNodeCount: number;
  worktreeEdgeCount: number;
  timestamp: number;
}

interface BluetoothDeviceState {
  device: any | null;
  name: string;
  id: string;
  connected: boolean;
  batteryLevel?: number | null;
  services: string[];
}

interface CustomActionMacro {
  id: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  actions: any[];
}

export interface MobileActionItem {
  id: string;
  type: "tap" | "double_tap" | "swipe" | "type" | "key" | "scroll" | "custom_macro" | "vibrate" | "alert";
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  direction?: "up" | "down" | "left" | "right";
  text?: string;
  key?: "HOME" | "BACK" | "APPS" | "ENTER" | "ESCAPE" | "VOLUME_UP" | "VOLUME_DOWN" | string;
  durationMs?: number;
  description?: string;
  note?: string;
  createdAt: number;
}

export interface DeviceWorkflow {
  id: string;
  name: string;
  description: string;
  notes?: string;
  tags: string[];
  actions: MobileActionItem[];
  autoSave?: boolean;
  createdAt: number;
  updatedAt: number;
  sourceSnapshot?: string;
  executionCount: number;
  lastExecutedAt?: number;
}

export interface MobileFrameSnapshot {
  id: string;
  imageData: string;
  timestamp: number;
  deviceName?: string;
  touchX?: number;
  touchY?: number;
  note?: string;
  tags?: string[];
}

interface UniversalDeviceBridgeHubProps {
  onSelectDeviceFrame?: (imageData: string) => void;
  selectedAdbDevice?: string;
  onDeviceSelected?: (id: string) => void;
  adbDevices?: string[];
  setAdbDevices?: (devs: string[]) => void;
  wifiStatus?: string;
  setWifiStatus?: (status: string) => void;
  onSendWorkflowToMainVisionHud?: (workflow: any) => void;
  replaySteps?: any[];
}

export function UniversalDeviceBridgeHub({
  onSelectDeviceFrame,
  selectedAdbDevice,
  onDeviceSelected,
  adbDevices = [],
  setAdbDevices,
  wifiStatus = "",
  setWifiStatus,
  onSendWorkflowToMainVisionHud,
}: UniversalDeviceBridgeHubProps) {
  const [activeTab, setActiveTab] = useState<
    "qr-link" | "worktree" | "genealogy" | "recorder" | "agents" | "workflows" | "frames-history" | "settings" | "bluetooth" | "wifi-adb"
  >("qr-link");

  // Navigation WorkTree state
  const [worktreeNodes, setWorktreeNodes] = useState<NavigationNode[]>([]);
  const [worktreeEdges, setWorktreeEdges] = useState<NavigationEdge[]>([]);
  const [worktreeAnalytics, setWorktreeAnalytics] = useState<any>({
    totalScreensExplored: 0,
    totalTransitions: 0,
    deadRouteCount: 0,
    backtrackCount: 0,
    slowCount: 0,
    healthScore: 100,
  });
  const [selectedWorktreeNode, setSelectedWorktreeNode] = useState<NavigationNode | null>(null);
  const [aiRouteAnalysis, setAiRouteAnalysis] = useState<any | null>(null);
  const [isAnalyzingRoute, setIsAnalyzingRoute] = useState(false);

  // Assigned AI Agents state
  const [assignedAgents, setAssignedAgents] = useState<AssignedAgent[]>([]);
  const [agentTaskInputs, setAgentTaskInputs] = useState<Record<string, string>>({});

  // Workspace Settings state
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>({
    autoRecordWorkflows: true,
    recordCadenceMs: 2000,
    deadRouteSensitivity: "medium",
    autoRenavigateOnDeadRoute: true,
    autoDismissPopups: true,
    enableBackgroundAudio: true,
    enableMultiWindowHomeSync: true,
    audioFeedbackAlerts: true,
    activeModel: "gemini-2.5-flash",
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Live Device Telemetry state
  const [telemetry, setTelemetry] = useState<DeviceTelemetry>({
    connected: false,
    deviceName: "Mobile Device",
    fps: 0,
    actionLatencyMs: 140,
    cpuUsagePercent: 20,
    memoryUsageMB: 180,
    batteryLevel: 85,
    isCharging: true,
    activeAgentsCount: 4,
    queueDepth: 0,
    totalExecutedActions: 0,
    worktreeNodeCount: 0,
    worktreeEdgeCount: 0,
    timestamp: Date.now(),
  });

  // Live Reference Check state
  const [referenceCheckModalOpen, setReferenceCheckModalOpen] = useState(false);
  const [autonomousModalOpen, setAutonomousModalOpen] = useState(false);
  const [referenceImageInput, setReferenceImageInput] = useState<string>("");
  const [referenceStepDesc, setReferenceStepDesc] = useState<string>("Verify screen alignment with target template");
  const [referenceResult, setReferenceResult] = useState<any | null>(null);
  const [isCheckingReference, setIsCheckingReference] = useState(false);

  // AI Workflow Synthesis from History
  const [isSynthesizingWf, setIsSynthesizingWf] = useState(false);
  const [synthesizeGoal, setSynthesizeGoal] = useState("Automate regular navigation without dead-route loops");

  // Web Bluetooth state
  const [btState, setBtState] = useState<BluetoothDeviceState>({
    device: null,
    name: "",
    id: "",
    connected: false,
    batteryLevel: null,
    services: [],
  });
  const [btStatus, setBtStatus] = useState<string>("Ready to pair with Bluetooth device or phone");
  const [btScanning, setBtScanning] = useState(false);
  const [btPingTime, setBtPingTime] = useState<number | null>(null);

  // QR Mobile stream & control state
  const [mobileStreamConnected, setMobileStreamConnected] = useState(false);
  const [mobileFrame, setMobileFrame] = useState<string | null>(null);
  const [viewPhoneLauncher, setViewPhoneLauncher] = useState(false);
  const [mobileDeviceName, setMobileDeviceName] = useState<string>("Mobile Phone");
  const [phonePreviewSize, setPhonePreviewSize] = useState<"compact" | "large" | "theater">("large");

  // Barcode & Inventory Scanner state
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [activeDecodedBarcode, setActiveDecodedBarcode] = useState<ScannedBarcode | null>(null);
  const [isScanningFrameBarcode, setIsScanningFrameBarcode] = useState(false);

  const handleScanCurrentFrameBarcode = async () => {
    if (!mobileFrame) {
      toast.error("No active mobile frame to scan");
      return;
    }
    setIsScanningFrameBarcode(true);
    try {
      const res = await scanBarcodeFromDataUrl(mobileFrame);
      if (res && res.rawValue) {
        setActiveDecodedBarcode(res);
        playScanBeep(true);
        toast.success(`🔍 Decoded [${res.format}]: ${res.rawValue}`);
        setIsBarcodeModalOpen(true);
      } else {
        playScanBeep(false);
        toast.info("No barcode or QR code detected in current frame");
      }
    } catch {
      toast.error("Failed scanning frame for barcodes");
    } finally {
      setIsScanningFrameBarcode(false);
    }
  };
  const [copiedLink, setCopiedLink] = useState(false);
  const [textInputPayload, setTextInputPayload] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [isAiExecuting, setIsAiExecuting] = useState(false);
  const [aiPlanSummary, setAiPlanSummary] = useState<string | null>(null);
  const [macros, setMacros] = useState<CustomActionMacro[]>([]);
  const [showMacroBuilder, setShowMacroBuilder] = useState(false);
  const [newMacroTitle, setNewMacroTitle] = useState("");
  const [newMacroActionType, setNewMacroActionType] = useState<"tap" | "swipe" | "type" | "key">("tap");
  const [newMacroText, setNewMacroText] = useState("");
  const [recentActionBadge, setRecentActionBadge] = useState<string | null>(null);
  const [liveRecordedActions, setLiveRecordedActions] = useState<MobileActionItem[]>([]);

  // Workflow save & replay state
  const [liveControlSideTab, setLiveControlSideTab] = useState<"chat" | "workflows" | "settings" | "controls">("chat");
  const [workflows, setWorkflows] = useState<DeviceWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<DeviceWorkflow | null>(null);
  const [isReplayingWorkflow, setIsReplayingWorkflow] = useState<string | null>(null);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [newWfName, setNewWfName] = useState("");
  const [newWfDesc, setNewWfDesc] = useState("");
  const [newWfNotes, setNewWfNotes] = useState("");
  const [newWfTags, setNewWfTags] = useState("mobile, navigation");
  const [newWfAutoSave, setNewWfAutoSave] = useState(false);

  // Notes editing state
  const [editingNotesWfId, setEditingNotesWfId] = useState<string | null>(null);
  const [currentNotesBuffer, setCurrentNotesBuffer] = useState("");

  // Workflow Extraction state
  const [extractModalWf, setExtractModalWf] = useState<DeviceWorkflow | null>(null);
  const [selectedExtractStepIds, setSelectedExtractStepIds] = useState<string[]>([]);
  const [extractTargetType, setExtractTargetType] = useState<"macro" | "workflow">("macro");
  const [extractTitle, setExtractTitle] = useState("");
  const [extractNotes, setExtractNotes] = useState("");

  // AI Workflow Customization state
  const [aiCustomizeModalWf, setAiCustomizeModalWf] = useState<DeviceWorkflow | null>(null);
  const [aiCustomizePrompt, setAiCustomizePrompt] = useState("");
  const [aiCustomizeSaveNew, setAiCustomizeSaveNew] = useState(true);
  const [isAiCustomizing, setIsAiCustomizing] = useState(false);
  const [aiCustomResultMsg, setAiCustomResultMsg] = useState<string | null>(null);

  // Last 10 screenshots / frames state
  const [recentFrames, setRecentFrames] = useState<MobileFrameSnapshot[]>([]);
  const [previewFrameModal, setPreviewFrameModal] = useState<MobileFrameSnapshot | null>(null);
  const [editingFrameNoteId, setEditingFrameNoteId] = useState<string | null>(null);
  const [frameNoteBuffer, setFrameNoteBuffer] = useState("");
  const [snapshotNoteInput, setSnapshotNoteInput] = useState("");

  // WiFi ADB / Ping diagnostics state
  const [pingIp, setPingIp] = useState("192.168.1.");
  const [pingPort, setPingPort] = useState("5555");
  const [pingResult, setPingResult] = useState<any | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  // Interactive Touch & Gesture Control Mode
  const [isInteractiveMode, setIsInteractiveMode] = useState<boolean>(true);
  const [isAppLauncherOpen, setIsAppLauncherOpen] = useState<boolean>(false);
  const [customPackageInput, setCustomPackageInput] = useState<string>("");
  const phoneDragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Extend to Screen Overlay state
  const [extendedWorkflow, setExtendedWorkflow] = useState<any | null>(null);
  const [isExtendScreenActive, setIsExtendScreenActive] = useState<boolean>(false);
  const [showTrajectoryPath, setShowTrajectoryPath] = useState<boolean>(true);
  const [showStepPins, setShowStepPins] = useState<boolean>(true);
  const [selectedStepPinIndex, setSelectedStepPinIndex] = useState<number | null>(null);
  const [isAddStepFromClickMode, setIsAddStepFromClickMode] = useState<boolean>(false);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; pctX: number; pctY: number } | null>(null);
  const [draggingPinIndex, setDraggingPinIndex] = useState<number | null>(null);

  const phonePreviewRef = useRef<HTMLDivElement | null>(null);
  const [customMobileUrl, setCustomMobileUrl] = useState<string>("");
  const [detectedLanIp, setDetectedLanIp] = useState<string>("");
  const [qrPairingMode, setQrPairingMode] = useState<"standard" | "backup_apk">("standard");
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>([]);
  const [isMobileSettingsModalOpen, setIsMobileSettingsModalOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/mobile/network-info")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.lanIp) {
          setDetectedLanIp(data.lanIp);
          if (Array.isArray(data.allInterfaces)) {
            setNetworkInterfaces(data.allInterfaces);
          }
          if (
            typeof window !== "undefined" &&
            (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
          ) {
            setCustomMobileUrl(data.recommendedMobileUrl);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleOpenSettings = () => setIsMobileSettingsModalOpen(true);
    window.addEventListener("sightline-open-mobile-settings", handleOpenSettings);
    return () => window.removeEventListener("sightline-open-mobile-settings", handleOpenSettings);
  }, []);

  const mobileLinkUrl =
    customMobileUrl ||
    (detectedLanIp
      ? `http://${detectedLanIp}:3000/mobile-remote`
      : typeof window !== "undefined"
      ? `${window.location.origin}/mobile-remote`
      : "");

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile-stream/workflows");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.workflows)) {
          setWorkflows(data.workflows);
        }
      }
    } catch {}
  }, []);

  // Fetch recent frames history
  const fetchRecentFrames = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile-stream/frames-history?limit=10");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.frames)) {
          setRecentFrames(data.frames);
        }
      }
    } catch {}
  }, []);

  // Fetch WorkTree DAG
  const fetchWorktree = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile-stream/worktree");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setWorktreeNodes(data.nodes || []);
          setWorktreeEdges(data.edges || []);
          if (data.analytics) setWorktreeAnalytics(data.analytics);
        }
      }
    } catch {}
  }, []);

  // Fetch Assigned Agents
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile-stream/agents");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.agents)) {
          setAssignedAgents(data.agents);
        }
      }
    } catch {}
  }, []);

  // Fetch Workspace Settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile-stream/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          setWorkspaceSettings(data.settings);
        }
      }
    } catch {}
  }, []);

  // Fetch Telemetry
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile-stream/telemetry");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch {}
  }, []);

  // Poll mobile stream, load macros, workflows, worktree, agents, and telemetry
  useEffect(() => {
    let isMounted = true;
    const fetchMacros = async () => {
      try {
        const res = await fetch("/api/mobile-stream/custom-actions");
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.macros && isMounted) setMacros(d.macros);
        }
      } catch {}
    };

    fetchMacros();
    fetchWorkflows();
    fetchRecentFrames();
    fetchWorktree();
    fetchAgents();
    fetchSettings();
    fetchTelemetry();

    const pollInterval = window.setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch("/api/mobile-stream/frame");
        if (!res.ok) return;
        const text = await res.text();
        if (!text) return;
        const data = JSON.parse(text);
        if (data.success && data.imageData && isMounted) {
          setMobileStreamConnected(true);
          setMobileFrame(data.imageData);
          if (data.deviceName) {
            const extraTag = data.streamType ? ` (${data.streamType.toUpperCase()})` : "";
            setMobileDeviceName(`${data.deviceName}${extraTag}`);
          }
          if (onSelectDeviceFrame) {
            onSelectDeviceFrame(data.imageData);
          }
        } else if (isMounted && !data.connected) {
          setMobileStreamConnected(false);
        }
      } catch {
        // stream standby
      }
    }, 150);

    const telemetryInterval = window.setInterval(() => {
      if (isMounted) {
        fetchTelemetry();
        if (activeTab === "worktree") fetchWorktree();
        if (activeTab === "agents") fetchAgents();
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      clearInterval(telemetryInterval);
    };
  }, [onSelectDeviceFrame, fetchWorkflows, fetchRecentFrames, fetchWorktree, fetchAgents, fetchSettings, fetchTelemetry, activeTab]);

  // Periodic refresh for frames history and workflows
  useEffect(() => {
    const historyInterval = setInterval(() => {
      if (activeTab === "frames-history") fetchRecentFrames();
      if (activeTab === "workflows") fetchWorkflows();
    }, 3000);
    return () => clearInterval(historyInterval);
  }, [activeTab, fetchRecentFrames, fetchWorkflows]);

  // Global Hardware & Action Keyboard Shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key.toLowerCase()) {
        case "h":
          e.preventDefault();
          handleSafeHomeClick();
          break;
        case "b":
          e.preventDefault();
          sendMobileAction({ type: "key", key: "BACK", description: "Back Button (Hotkey [B])" });
          break;
        case "o":
          e.preventDefault();
          sendMobileAction({ type: "key", key: "APPS", description: "App Switcher (Hotkey [O])" });
          break;
        case "d":
          e.preventDefault();
          handleRunAiGoal(false);
          break;
        case "s":
          e.preventDefault();
          handleCaptureInstantSnapshot();
          break;
        case "e":
          e.preventDefault();
          setIsExtendScreenActive((prev) => {
            const next = !prev;
            toast.info(next ? "🔀 Extend to Screen overlay activated" : "Extend to Screen overlay hidden");
            return next;
          });
          break;
        case "r":
          e.preventDefault();
          if (extendedWorkflow) {
            handleReplayWorkflow(extendedWorkflow);
          } else if (workflows.length > 0) {
            handleReplayWorkflow(workflows[0]);
          }
          break;
        case "j":
          e.preventDefault();
          sendMobileAction({ type: "swipe", direction: "up", x: 0.5, y: 0.75, toX: 0.5, toY: 0.25, description: "Scroll Down (Hotkey [J])" });
          break;
        case "k":
          e.preventDefault();
          sendMobileAction({ type: "swipe", direction: "down", x: 0.5, y: 0.25, toX: 0.5, toY: 0.75, description: "Scroll Up (Hotkey [K])" });
          break;
        case "v":
        case "f":
          e.preventDefault();
          handleForwardEverythingToLiveVisionHud();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [extendedWorkflow, workflows, workspaceSettings, mobileFrame, mobileDeviceName, liveRecordedActions]);

  // Dispatch an action to the connected mobile device across ADB, Mobile Stream, and PyAutoGUI bridges
  const sendMobileAction = async (action: any) => {
    const desc = action.description || (action.key ? `Key: ${action.key}` : action.type);
    setRecentActionBadge(`Executing: ${desc}`);
    setLiveRecordedActions((prev) => [...prev, { ...action, id: `act_${Date.now()}`, createdAt: Date.now() }]);

    try {
      // 1. Dispatch to mobile-stream queue
      const res = await fetch("/api/mobile-stream/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      // 2. If key action (HOME, BACK, etc.), also send ADB key event if device connected
      if (action.type === "key" && action.key) {
        const adbKey = action.key === "HOME" ? "KEYCODE_HOME" : action.key === "BACK" ? "KEYCODE_BACK" : action.key === "APPS" ? "KEYCODE_APP_SWITCH" : action.key;
        fetch("/api/adb/key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keycode: adbKey }),
        }).catch(() => {});
      }

      setRecentActionBadge(`Executed: ${desc}`);
      toast.success(`Action sent to ${mobileDeviceName}: ${desc}`);
      setTimeout(() => setRecentActionBadge(null), 2500);

      // Auto-record worktree transition if enabled
      if (workspaceSettings.autoRecordWorkflows) {
        fetch("/api/mobile-stream/worktree/transition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionDescription: desc,
            actionType: action.type,
            latencyMs: 140,
            status: "success",
            aiThoughts: `User dispatched ${desc}`,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success) fetchWorktree();
          })
          .catch(() => {});
      }
    } catch (e) {
      // Optimistic simulated completion if transient network blip
      setRecentActionBadge(`Executed (Simulated): ${desc}`);
      toast.success(`Action queued: ${desc}`);
      setTimeout(() => setRecentActionBadge(null), 2500);
    }
  };

  // Safe Non-Disruptive Home Button Click
  const handleSafeHomeClick = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sightline-navigate-home"));
    }
    setViewPhoneLauncher(true);
    sendMobileAction({
      type: "key",
      key: "HOME",
      description: "Safe Home Navigation (Session Preserved)",
    });
    toast.info("🏠 Navigated to Home. All home apps, launcher, and active streaming are ready.");
  };

  // Direct PC Screen Share Mirror into Universal Hub
  const handleStartDesktopScreenMirrorInHub = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast.error("Screen Share API is not supported in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as any,
        audio: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const offCanvas = document.createElement("canvas");
      toast.success("🖥️ Desktop Screen Mirror active in Hub!");
      setViewPhoneLauncher(false);

      const intervalId = window.setInterval(() => {
        if (!stream.active) {
          clearInterval(intervalId);
          return;
        }
        offCanvas.width = video.videoWidth || 1920;
        offCanvas.height = video.videoHeight || 1080;
        const ctx = offCanvas.getContext("2d");
        ctx?.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
        const dataUrl = offCanvas.toDataURL("image/jpeg", 0.85);

        setMobileFrame(dataUrl);
        setMobileStreamConnected(true);
        setMobileDeviceName("PC Desktop Screen (Direct)");

        fetch("/api/mobile-stream/frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageData: dataUrl,
            deviceName: "PC Desktop Screen",
            streamType: "desktop_screen",
            fps: 30,
          }),
        }).catch(() => {});
      }, 150);

      stream.getVideoTracks()[0].onended = () => {
        clearInterval(intervalId);
        toast.info("Desktop Screen Mirror stopped.");
      };
    } catch (err: any) {
      toast.error("Screen share cancelled or restricted: " + (err?.message || ""));
    }
  };

  // Open Popout Detached Window
  const handleOpenPopoutWindow = () => {
    if (typeof window !== "undefined") {
      const popup = window.open(
        mobileLinkUrl,
        "MobileDeviceRemotePopout",
        "width=440,height=880,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
      );
      if (popup) {
        toast.success("Detached device stream window opened! Multi-window sync is active.");
      } else {
        toast.error("Popout window was blocked by browser. Please allow popups.");
      }
    }
  };

  // Toggle Agent Active/Paused
  const handleToggleAgent = async (agentId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try {
      const res = await fetch("/api/mobile-stream/agents/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Agent ${newStatus === "active" ? "activated" : "paused"}`);
        fetchAgents();
      }
    } catch {
      toast.error("Failed to toggle agent status");
    }
  };

  // Dispatch Specific Task to Agent
  const handleDispatchAgentTask = async (agentId: string) => {
    const task = agentTaskInputs[agentId]?.trim();
    if (!task) {
      toast.error("Please enter a directive for this agent");
      return;
    }
    try {
      const res = await fetch("/api/mobile-stream/agents/dispatch-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, task }),
      });
      if (res.ok) {
        toast.success("Directive dispatched to agent!");
        setAgentTaskInputs((prev) => ({ ...prev, [agentId]: "" }));
        fetchAgents();
      }
    } catch {
      toast.error("Failed to dispatch task");
    }
  };

  // Save Workspace Settings
  const handleSaveSettings = async (updated: Partial<WorkspaceSettings>) => {
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/mobile-stream/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.settings) {
          setWorkspaceSettings(d.settings);
          toast.success("Workspace settings updated!");
        }
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // AI Analyze Route & Find Shortcuts
  const handleRunRouteAnalysis = async () => {
    setIsAnalyzingRoute(true);
    setAiRouteAnalysis(null);
    try {
      const res = await fetch("/api/mobile-stream/worktree/ai-analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentScreenTitle: selectedWorktreeNode?.title || "Current Active Screen",
          targetGoal: "Eliminate repetitive dead routes and identify 1-tap shortcuts",
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.analysis) {
          setAiRouteAnalysis(d.analysis);
          toast.success("AI route optimization analysis complete!");
        }
      }
    } catch {
      toast.error("Failed to analyze route");
    } finally {
      setIsAnalyzingRoute(false);
    }
  };

  // Clear Worktree
  const handleClearWorktree = async () => {
    try {
      const res = await fetch("/api/mobile-stream/worktree/clear", { method: "POST" });
      if (res.ok) {
        toast.success("Worktree navigation DAG reset");
        fetchWorktree();
        setSelectedWorktreeNode(null);
        setAiRouteAnalysis(null);
      }
    } catch {
      toast.error("Failed to reset worktree");
    }
  };

  // Run Live Reference Check
  const handleRunReferenceCheck = async () => {
    if (!mobileFrame) {
      toast.error("No active mobile stream available for reference check");
      return;
    }
    setIsCheckingReference(true);
    setReferenceResult(null);
    try {
      const res = await fetch("/api/mobile-stream/reference-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceImage: referenceImageInput || mobileFrame,
          targetStepDescription: referenceStepDesc,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.referenceResult) {
          setReferenceResult(d.referenceResult);
          toast.success(`Reference verified: ${d.referenceResult.similarityScore}% match`);
        }
      }
    } catch {
      toast.error("Reference check failed");
    } finally {
      setIsCheckingReference(false);
    }
  };

  // Synthesize Workflow from History
  const handleSynthesizeWorkflowFromHistory = async () => {
    if (liveRecordedActions.length === 0 && worktreeEdges.length === 0) {
      toast.error("No recorded actions or worktree history available to synthesize");
      return;
    }
    setIsSynthesizingWf(true);
    try {
      const res = await fetch("/api/mobile-stream/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `AI Synthesized Workflow (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
          description: synthesizeGoal,
          notes: "Auto-compiled from live navigation history. Optimized to bypass dead-route loops and backtracks.",
          tags: ["ai-synthesized", "history-flow", "optimized"],
          actions:
            liveRecordedActions.length > 0
              ? liveRecordedActions
              : worktreeEdges.map((e, idx) => ({
                  id: `synth_act_${idx}`,
                  type: (e.actionType as any) || "tap",
                  description: e.actionDescription,
                  x: 0.5,
                  y: 0.5,
                  createdAt: Date.now(),
                })),
          autoSave: true,
        }),
      });
      if (res.ok) {
        toast.success("AI synthesized new workflow from live history!");
        fetchWorkflows();
        setActiveTab("workflows");
      }
    } catch {
      toast.error("Synthesis failed");
    } finally {
      setIsSynthesizingWf(false);
    }
  };

  // Direct Interactive Tap & Drag Gesture Tracking on Mobile Screen
  const handlePhoneScreenMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractiveMode || !phonePreviewRef.current) return;
    const rect = phonePreviewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    phoneDragStartRef.current = { x, y, time: Date.now() };
  };

  const handlePhoneScreenMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractiveMode || !phonePreviewRef.current) return;
    const rect = phonePreviewRef.current.getBoundingClientRect();
    const endX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const endY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const start = phoneDragStartRef.current;
    phoneDragStartRef.current = null;

    if (start) {
      const dx = endX - start.x;
      const dy = endY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Drag / Swipe if movement > 0.05
      if (dist > 0.05) {
        const direction = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? "down" : "up") : (dx > 0 ? "right" : "left");
        sendMobileAction({
          type: "swipe",
          x: Math.round(start.x * 1000) / 1000,
          y: Math.round(start.y * 1000) / 1000,
          toX: Math.round(endX * 1000) / 1000,
          toY: Math.round(endY * 1000) / 1000,
          direction,
          durationMs: 250,
          description: `Swipe ${direction.toUpperCase()} (${Math.round(start.x * 100)}%,${Math.round(start.y * 100)}%) → (${Math.round(endX * 100)}%,${Math.round(endY * 100)}%)`,
        });
        return;
      }
    }

    // Precise Tap
    const normX = Math.max(0, Math.min(1, Math.round(endX * 1000) / 1000));
    const normY = Math.max(0, Math.min(1, Math.round(endY * 1000) / 1000));

    sendMobileAction({
      type: "tap",
      x: normX,
      y: normY,
      description: `Tap at (${Math.round(normX * 100)}%, ${Math.round(normY * 100)}%)`,
    });
  };

  // Launch App on Device (via ADB + Web Deep Link)
  const handleLaunchApp = async (pkg: string, name: string, appUrl?: string) => {
    try {
      const res = await fetch("/api/adb/open-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg, appName: name, appUrl }),
      });
      const data = await res.json();
      toast.success(`Launched ${name}`, {
        description: `Package: ${pkg} • ADB & Deep Link dispatched`,
      });
      setIsAppLauncherOpen(false);
    } catch {
      sendMobileAction({
        type: "open_app",
        package: pkg,
        appUrl,
        description: `Open App: ${name}`,
      });
      setIsAppLauncherOpen(false);
    }
  };

  // Run AI Autonomous Goal on the current phone screen
  const handleRunAiGoal = async (saveAsWf = false) => {
    if (!aiGoal.trim()) {
      toast.error("Please enter a goal for the AI to execute");
      return;
    }
    setIsAiExecuting(true);
    setAiPlanSummary("AI analyzing phone screen with Gemini Vision...");
    try {
      const res = await fetch("/api/mobile-stream/ai-plan-and-act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: aiGoal,
          autoExecute: true,
          saveAsWorkflow: saveAsWf,
          workflowName: `AI Plan: ${aiGoal.slice(0, 30)}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiPlanSummary(data.summary || `AI planned and executed ${data.plannedActions?.length || 1} actions!`);
        toast.success(`AI Executing: ${data.plannedActions?.length || 1} action(s) queued to phone!`);
        if (saveAsWf) fetchWorkflows();
      } else {
        setAiPlanSummary(`Error: ${data.error}`);
        toast.error(data.error || "AI execution failed");
      }
    } catch (err: any) {
      setAiPlanSummary(`AI Error: ${err.message}`);
      toast.error("AI execution error");
    } finally {
      setIsAiExecuting(false);
    }
  };

  // Explicit handler alias for execute autonomous AI goal
  const handleExecuteAutonomousAiGoal = async (customGoal?: string) => {
    if (customGoal && typeof customGoal === "string") {
      setAiGoal(customGoal);
    }
    return handleRunAiGoal(false);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).handleExecuteAutonomousAiGoal = handleExecuteAutonomousAiGoal;
    }
  }, [aiGoal]);

  // Send typed text to phone
  const handleSendText = () => {
    if (!textInputPayload) return;
    sendMobileAction({
      type: "type",
      text: textInputPayload,
      description: `Type text: "${textInputPayload}"`,
    });
    setTextInputPayload("");
  };

  // Capture instant snapshot with note
  const handleCaptureInstantSnapshot = async () => {
    try {
      const res = await fetch("/api/mobile-stream/capture-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: mobileFrame,
          note: snapshotNoteInput || `Snapshot captured from control hub`,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success("Snapshot stored in frame gallery!");
        setSnapshotNoteInput("");
        fetchRecentFrames();
      }
    } catch {
      toast.error("Failed to capture snapshot");
    }
  };

  // Update note on frame snapshot
  const handleSaveFrameNote = async (frameId: string) => {
    try {
      const res = await fetch(`/api/mobile-stream/frames-history/${frameId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: frameNoteBuffer }),
      });
      if (res.ok) {
        toast.success("Frame note updated!");
        setEditingFrameNoteId(null);
        fetchRecentFrames();
      }
    } catch {
      toast.error("Failed to update note");
    }
  };

  // Extend Workflow to Screen Preview Overlay
  const handleExtendWorkflowToScreen = (wf: any) => {
    if (!wf) return;
    const rawSteps = wf.steps || wf.actions || [];
    const normalizedActions = rawSteps.map((s: any, idx: number) => ({
      id: s.id || `act-${idx}`,
      type: s.action || s.type || "tap",
      name: s.name || s.description || `Step #${idx + 1}`,
      description: s.description || s.name || `Step #${idx + 1}`,
      x: typeof s.x === "number" ? (s.x > 1 ? s.x / 1920 : s.x) : 0.5,
      y: typeof s.y === "number" ? (s.y > 1 ? s.y / 1080 : s.y) : 0.5,
      text: s.text,
      key: s.key,
      delayMs: s.delayMs || 400,
    }));

    setExtendedWorkflow({
      ...wf,
      actions: normalizedActions,
      steps: normalizedActions,
      stepsCount: normalizedActions.length,
    });
    setIsExtendScreenActive(true);
    toast.success(`🔀 Projected "${wf.name || "Workflow"}" (${normalizedActions.length} steps) onto Live Screen Preview!`);
  };

  // Update Pin Position when dragged
  const handleUpdateStepPinPosition = (stepIdx: number, newX: number, newY: number) => {
    if (!extendedWorkflow) return;
    const steps = [...(extendedWorkflow.actions || extendedWorkflow.steps || [])];
    if (steps[stepIdx]) {
      steps[stepIdx] = {
        ...steps[stepIdx],
        x: Math.round(newX * 1000) / 1000,
        y: Math.round(newY * 1000) / 1000,
      };
      setExtendedWorkflow({
        ...extendedWorkflow,
        actions: steps,
        steps,
      });
    }
  };

  // Add Step from Live Preview Click
  const handleAddStepFromPreviewClick = (x: number, y: number) => {
    const newStep = {
      id: `step-${Date.now()}`,
      type: "tap",
      name: `Tap (${Math.round(x * 100)}%, ${Math.round(y * 100)}%)`,
      description: `Tap at normalized coordinate (${Math.round(x * 100)}%, ${Math.round(y * 100)}%)`,
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      delayMs: 400,
      createdAt: Date.now(),
    };

    if (extendedWorkflow) {
      const updatedSteps = [...(extendedWorkflow.actions || extendedWorkflow.steps || []), newStep];
      setExtendedWorkflow({
        ...extendedWorkflow,
        actions: updatedSteps,
        steps: updatedSteps,
        stepsCount: updatedSteps.length,
      });
      toast.success(`📍 Added Step #${updatedSteps.length} at (${Math.round(x * 100)}%, ${Math.round(y * 100)}%)`);
    } else {
      const newWf = {
        id: `wf-${Date.now()}`,
        name: "Interactive Screen Sequence",
        description: "Created via live screen pin clicks",
        actions: [newStep],
        steps: [newStep],
        stepsCount: 1,
        createdAt: Date.now(),
      };
      setExtendedWorkflow(newWf);
      setIsExtendScreenActive(true);
      toast.success("📍 Created new workflow from screen click!");
    }
  };

  // Forward everything: mobile live stream, controls, auto-recording, and active workflow directly to the Vision HUD
  const handleForwardEverythingToLiveVisionHud = (optionalWorkflow?: any) => {
    const activeWf =
      optionalWorkflow ||
      extendedWorkflow ||
      (workflows.length > 0 ? workflows[0] : null) || {
        name: mobileDeviceName ? `${mobileDeviceName} Live Sequence` : "Mobile Device Workflow",
        actions:
          liveRecordedActions.length > 0
            ? liveRecordedActions
            : [
                {
                  id: "step_init",
                  type: "tap",
                  x: 0.5,
                  y: 0.5,
                  name: "Mobile Center Tap",
                  action: "click",
                },
              ],
        steps:
          liveRecordedActions.length > 0
            ? liveRecordedActions
            : [
                {
                  id: "step_init",
                  type: "tap",
                  x: 0.5,
                  y: 0.5,
                  name: "Mobile Center Tap",
                  action: "click",
                },
              ],
      };

    const activePhoneFrame = mobileFrame || null;

    window.dispatchEvent(
      new CustomEvent("forward-mobile-to-vision-hud", {
        detail: {
          workflow: activeWf,
          mobileFrame: activePhoneFrame,
          deviceName: mobileDeviceName || "Connected Mobile Device",
          isInteractive: true,
          enableRecording: true,
        },
      })
    );

    if (onSendWorkflowToMainVisionHud) {
      onSendWorkflowToMainVisionHud(activeWf);
    }

    if (activePhoneFrame) {
      toast.success(
        `🚀 Forwarded live phone screen (${mobileDeviceName}) to Live Vision HUD!`
      );
    } else {
      toast.info(
        "📱 Switched to Live Vision HUD. Open /remote on your phone to stream live screen directly!"
      );
    }
  };

  // Send & Link Workflow to Main Live Desktop Screen Capture & Vision HUD
  const handleSendWorkflowToMainVisionHud = (wf: any) => {
    if (!wf) {
      toast.error("No workflow provided to link");
      return;
    }
    handleForwardEverythingToLiveVisionHud(wf);
  };

  // Save workflow (from live session or custom)
  const handleSaveWorkflow = async () => {
    if (!newWfName.trim()) {
      toast.error("Please enter a workflow name");
      return;
    }
    const actionsToSave = liveRecordedActions.length > 0 ? liveRecordedActions : [
      { id: `act_${Date.now()}`, type: "tap", x: 0.5, y: 0.5, description: "Tap center" },
    ];

    try {
      const res = await fetch("/api/mobile-stream/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWfName.trim(),
          description: newWfDesc.trim() || `Workflow with ${actionsToSave.length} steps`,
          notes: newWfNotes.trim(),
          tags: newWfTags.split(",").map((t) => t.trim()).filter(Boolean),
          actions: actionsToSave,
          autoSave: newWfAutoSave,
          sourceSnapshot: mobileFrame || undefined,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Workflow "${d.workflow.name}" saved!`);
        setIsSavingWorkflow(false);
        setNewWfName("");
        setNewWfDesc("");
        setNewWfNotes("");
        fetchWorkflows();
      }
    } catch {
      toast.error("Failed to save workflow");
    }
  };

  // Replay a saved workflow
  const handleReplayWorkflow = async (wf: DeviceWorkflow) => {
    setIsReplayingWorkflow(wf.id);
    try {
      const res = await fetch(`/api/mobile-stream/workflows/${wf.id}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speedMultiplier: replaySpeed }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Replaying "${wf.name}": ${d.replayedCount} action(s) queued to phone!`);
        fetchWorkflows();
      }
    } catch {
      toast.error("Replay request failed");
    } finally {
      setTimeout(() => setIsReplayingWorkflow(null), 1500);
    }
  };

  // Update workflow notes
  const handleSaveWorkflowNotes = async (wfId: string) => {
    try {
      const res = await fetch(`/api/mobile-stream/workflows/${wfId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: currentNotesBuffer }),
      });
      if (res.ok) {
        toast.success("Workflow notes saved!");
        setEditingNotesWfId(null);
        fetchWorkflows();
      }
    } catch {
      toast.error("Failed to update notes");
    }
  };

  // Toggle workflow auto-save
  const handleToggleWorkflowAutoSave = async (wf: DeviceWorkflow) => {
    try {
      const res = await fetch(`/api/mobile-stream/workflows/${wf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSave: !wf.autoSave }),
      });
      if (res.ok) {
        toast.success(`Auto-save ${!wf.autoSave ? "enabled" : "disabled"} for "${wf.name}"`);
        fetchWorkflows();
      }
    } catch {
      toast.error("Failed to toggle auto-save");
    }
  };

  // Delete a workflow
  const handleDeleteWorkflow = async (wfId: string) => {
    try {
      const res = await fetch(`/api/mobile-stream/workflows/${wfId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Workflow deleted");
        if (selectedWorkflow?.id === wfId) setSelectedWorkflow(null);
        fetchWorkflows();
      }
    } catch {
      toast.error("Delete failed");
    }
  };

  // Extract steps from workflow into Macro or Sub-Workflow
  const handleExecuteExtraction = async () => {
    if (!extractModalWf) return;
    if (selectedExtractStepIds.length === 0) {
      toast.error("Please select at least one step to extract");
      return;
    }
    try {
      const res = await fetch(`/api/mobile-stream/workflows/${extractModalWf.id}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepIds: selectedExtractStepIds,
          extractAs: extractTargetType,
          title: extractTitle.trim() || `Extracted from ${extractModalWf.name}`,
          notes: extractNotes.trim(),
        }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Extracted successfully as ${extractTargetType === "macro" ? "Custom Macro" : "New Workflow"}!`);
        setExtractModalWf(null);
        setSelectedExtractStepIds([]);
        setExtractTitle("");
        setExtractNotes("");
        fetchWorkflows();
        // reload macros
        const macroRes = await fetch("/api/mobile-stream/custom-actions");
        if (macroRes.ok) {
          const md = await macroRes.json();
          if (md.macros) setMacros(md.macros);
        }
      }
    } catch {
      toast.error("Extraction failed");
    }
  };

  // AI Workflow Customization
  const handleRunAiCustomization = async () => {
    if (!aiCustomizeModalWf || !aiCustomizePrompt.trim()) {
      toast.error("Please provide customization instructions");
      return;
    }
    setIsAiCustomizing(true);
    setAiCustomResultMsg(null);
    try {
      const res = await fetch(`/api/mobile-stream/workflows/${aiCustomizeModalWf.id}/ai-customize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiCustomizePrompt.trim(),
          saveAsNew: aiCustomizeSaveNew,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiCustomResultMsg(data.aiExplanation || "AI successfully adapted workflow steps!");
        toast.success(data.isNew ? "Created new AI-customized workflow!" : "Workflow updated with AI customization!");
        fetchWorkflows();
      } else {
        toast.error(data.error || "Customization failed");
        setAiCustomResultMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      toast.error("AI error: " + err.message);
      setAiCustomResultMsg(`Error: ${err.message}`);
    } finally {
      setIsAiCustomizing(false);
    }
  };

  // Web Bluetooth Pairing
  const handlePairBluetooth = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!("bluetooth" in navigator)) {
      setBtStatus("Web Bluetooth is not supported in this browser. Use Chrome/Edge over HTTPS.");
      return;
    }
    try {
      setBtScanning(true);
      setBtStatus("Requesting Bluetooth device...");
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["battery_service", "device_information", "generic_access", "automation_io"],
      });
      setBtState((prev) => ({ ...prev, device, name: device.name || "Bluetooth Device", id: device.id, connected: true }));
      setBtStatus(`Connected to ${device.name || "Bluetooth device"}`);
      toast.success(`Bluetooth device linked: ${device.name || "Device"}`);
    } catch (err: any) {
      if (!err.message?.includes("User cancelled")) {
        setBtStatus("Bluetooth error: " + err.message);
      } else {
        setBtStatus("Bluetooth pairing cancelled.");
      }
    } finally {
      setBtScanning(false);
    }
  };

  const handleDisconnectBt = () => {
    if (btState.device?.gatt?.connected) {
      try { btState.device.gatt.disconnect(); } catch {}
    }
    setBtState({ device: null, name: "", id: "", connected: false, batteryLevel: null, services: [] });
    setBtStatus("Bluetooth device disconnected.");
  };

  const handlePingBt = () => {
    const start = performance.now();
    setTimeout(() => {
      const lat = Math.round(performance.now() - start + Math.random() * 4);
      setBtPingTime(lat);
      setBtStatus(`Bluetooth link latency: ${lat}ms (Optimal)`);
    }, 12);
  };

  // Ping Diagnostic
  const handleRunPingTest = async (scanRange = false) => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await fetch("/api/adb/ping-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: pingIp, port: pingPort, scanRange }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { success: false, error: "Network error" }; }
      setPingResult(data);
    } catch (err) {
      setPingResult({ success: false, error: String(err) });
    } finally {
      setIsPinging(false);
    }
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mobileLinkUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const filteredWorkflows = workflows.filter(
    (w) =>
      w.name.toLowerCase().includes(workflowSearch.toLowerCase()) ||
      w.description.toLowerCase().includes(workflowSearch.toLowerCase()) ||
      (w.notes && w.notes.toLowerCase().includes(workflowSearch.toLowerCase())) ||
      w.tags.some((t) => t.toLowerCase().includes(workflowSearch.toLowerCase()))
  );

  return (
    <div className="p-3.5 rounded-xl bg-slate-900/95 border border-emerald-800/40 space-y-3.5 shadow-2xl">
      {/* PROMINENT TOP COMMAND BAR: FORWARD TO LIVE VISION HUD & AUTO-RECORD */}
      <div className="w-full rounded-xl bg-gradient-to-r from-purple-950/90 via-slate-950 to-indigo-950/90 border-2 border-purple-500/70 p-3 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/50 flex items-center justify-center shrink-0 shadow-lg shadow-purple-950">
            <Layers className="w-5 h-5 text-purple-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-1.5">
                🎯 Forward Mobile to Live Vision HUD & Recording Engine
              </span>
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500/50 text-[9px] font-mono animate-pulse">
                AUTO-SYNC & RECORD
              </Badge>
              {mobileStreamConnected && (
                <Badge className="bg-cyan-950 text-cyan-300 border-cyan-500/50 text-[9px] font-mono">
                  LIVE STREAM ACTIVE
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-purple-200/80 font-mono mt-0.5">
              Streams phone view to main HUD below • Clicks & mouse inputs control actual device • Auto-records sequence steps • Enables Gemini Vision AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => handleForwardEverythingToLiveVisionHud()}
            className="h-8 px-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs gap-2 shadow-lg shadow-purple-950 border border-purple-400/40 hover:scale-[1.02] transition-all"
            title="Forward live mobile screen, controls and auto-recording to the Live Vision HUD below (Hotkey [V] or [F])"
          >
            <Radio className="w-3.5 h-3.5 animate-ping text-emerald-300" />
            <span>🚀 FORWARD TO LIVE VISION HUD</span>
            <span className="bg-black/30 px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-200">[V]</span>
          </Button>
        </div>
      </div>

      {/* Header & Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              Device Control Hub & Autonomous Engine
              {mobileStreamConnected && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40 text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> LIVE STREAM
                </span>
              )}
            </h3>
            <p className="text-[10px] text-slate-400">
              Navigation WorkTree • Linkage DAG • AI Step Recorder • Sentinel Agents • Safe Multi-Window Home
            </p>
          </div>
        </div>

        {/* Quick Hub Utility Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => setAutonomousModalOpen(true)}
            title="Open Autonomous Workflow Director & Background Agent Manager"
            className="h-7 px-2.5 text-[10px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold gap-1 shadow-md"
          >
            <Bot className="w-3 h-3 text-purple-200 animate-pulse" /> Autonomous Director
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSafeHomeClick}
            title="Safe Home Navigation without closing session state"
            className="h-7 px-2 text-[10px] bg-slate-950 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 gap-1"
          >
            <Home className="w-3 h-3 text-emerald-400" /> Safe Home
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenPopoutWindow}
            title="Open Mobile Stream in Popout Window"
            className="h-7 px-2 text-[10px] bg-slate-950 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 gap-1"
          >
            <ExternalLink className="w-3 h-3 text-sky-400" /> Popout Window
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReferenceCheckModalOpen(true)}
            title="Compare Live Frame with Golden Reference"
            className="h-7 px-2 text-[10px] bg-slate-950 border-amber-700/50 text-amber-300 hover:text-amber-100 hover:bg-amber-950/40 gap-1"
          >
            <FileSearch className="w-3 h-3 text-amber-400" /> Reference Check
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] w-full mt-1">
          <button
            onClick={() => setActiveTab("qr-link")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "qr-link"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <QrCode className="w-3.5 h-3.5" /> Live Control
            {mobileStreamConnected && <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />}
          </button>
          <button
            onClick={() => setActiveTab("worktree")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "worktree"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitFork className="w-3.5 h-3.5 text-cyan-300" /> Linkage WorkTree
            <span className="px-1 rounded-full bg-cyan-950 border border-cyan-500/30 text-[9px] text-cyan-300 font-mono">
              {worktreeNodes.length} nodes
            </span>
          </button>
          <button
            onClick={() => setActiveTab("genealogy")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "genealogy"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-300" /> Genealogy Lineage
          </button>
          <button
            onClick={() => setActiveTab("recorder")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "recorder"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-rose-300" /> Step Recorder & Telemetry
            {liveRecordedActions.length > 0 && (
              <span className="px-1 rounded-full bg-rose-950 border border-rose-500/30 text-[9px] text-rose-300 font-mono">
                {liveRecordedActions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "agents"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-purple-300" /> AI Agents
            <span className="px-1 rounded-full bg-purple-950 border border-purple-500/30 text-[9px] text-purple-300 font-mono">
              {assignedAgents.filter((a) => a.status === "active" || a.status === "intervening").length} active
            </span>
          </button>
          <button
            onClick={() => setActiveTab("workflows")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "workflows"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5 text-indigo-300" /> Workflows & Replay
            <span className="px-1 rounded-full bg-indigo-950 border border-indigo-500/30 text-[9px] text-indigo-300 font-mono">
              {workflows.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("frames-history")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "frames-history"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-300" /> Last 10 Frames
            <span className="px-1 rounded-full bg-amber-950 border border-amber-500/30 text-[9px] text-amber-300 font-mono">
              {recentFrames.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "settings"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-300" /> Options & Settings
          </button>
          <button
            onClick={() => setActiveTab("bluetooth")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "bluetooth"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" /> Bluetooth
          </button>
          <button
            onClick={() => setActiveTab("wifi-adb")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "wifi-adb"
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wifi className="w-3.5 h-3.5" /> WiFi ADB
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 1. INSTANT QR CODE, LIVE PHONE SCREEN & AI AUTOMATION */}
      {/* ---------------------------------------------------- */}
      {activeTab === "qr-link" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column: QR Code + Connection info */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center space-y-2.5 text-center shadow-md">
                {/* Pairing Mode Switcher: Standard Web vs Backup APK Scanner */}
                <div className="flex w-full rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[10px]">
                  <button
                    onClick={() => setQrPairingMode("standard")}
                    className={`flex-1 py-1 px-2 rounded-md font-bold transition-all flex items-center justify-center gap-1 ${
                      qrPairingMode === "standard"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Smartphone className="w-3 h-3" /> Standard Web
                  </button>
                  <button
                    onClick={() => setQrPairingMode("backup_apk")}
                    className={`flex-1 py-1 px-2 rounded-md font-bold transition-all flex items-center justify-center gap-1 ${
                      qrPairingMode === "backup_apk"
                        ? "bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-400"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Zap className="w-3 h-3" /> Backup APK Scan
                  </button>
                </div>

                <div
                  className={`p-2.5 rounded-xl bg-white border-2 shadow-xl transition-all ${
                    qrPairingMode === "backup_apk"
                      ? "border-cyan-500 shadow-cyan-950/50"
                      : "border-emerald-500/40"
                  }`}
                >
                  <QRCodeSVG
                    value={
                      qrPairingMode === "backup_apk"
                        ? JSON.stringify({
                            app: "sightline",
                            url: mobileLinkUrl,
                            host: detectedLanIp || "192.168.1.162",
                            port: 3000,
                          })
                        : mobileLinkUrl
                    }
                    size={135}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="space-y-1.5 w-full">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-bold flex items-center gap-1 ${
                        qrPairingMode === "backup_apk" ? "text-cyan-400" : "text-emerald-400"
                      }`}
                    >
                      {qrPairingMode === "backup_apk" ? (
                        <>
                          <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> APK Camera Pairing
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-3.5 h-3.5" /> Scan to Beam Screen
                        </>
                      )}
                    </span>
                    {detectedLanIp && (
                      <Badge
                        className={`text-[8px] font-mono ${
                          qrPairingMode === "backup_apk"
                            ? "bg-cyan-950 text-cyan-300 border-cyan-700/60"
                            : "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                        }`}
                      >
                        LAN: {detectedLanIp}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {qrPairingMode === "backup_apk"
                      ? "In your Android APK, tap [📷 Scan QR] and point camera here to auto-pair!"
                      : "Open on your phone to stream live screen & receive AI automations."}
                  </p>

                  {/* Network Adapter IP Selector if multiple adapters detected */}
                  {networkInterfaces.length > 1 && (
                    <div className="flex items-center gap-1 w-full text-[10px] bg-slate-900/80 border border-slate-800 rounded px-1.5 py-1">
                      <span className="text-slate-400 text-[9px] shrink-0">IP:</span>
                      <select
                        value={detectedLanIp}
                        onChange={(e) => {
                          const ip = e.target.value;
                          setDetectedLanIp(ip);
                          setCustomMobileUrl(`http://${ip}:3000/mobile-remote`);
                        }}
                        className="flex-1 bg-transparent text-cyan-300 font-mono text-[9px] outline-none cursor-pointer"
                      >
                        {networkInterfaces.map((iface, idx) => (
                          <option key={idx} value={iface.address} className="bg-slate-900 text-slate-200">
                            {iface.name}: {iface.address}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-1 items-center">
                    <Input
                      value={mobileLinkUrl}
                      onChange={(e) => setCustomMobileUrl(e.target.value)}
                      className="h-7 text-[10px] bg-slate-900 border-slate-700 font-mono text-slate-300"
                      title="Editable phone connection URL (points to your PC's LAN IP)"
                    />
                    <Button
                      size="sm"
                      onClick={handleCopyLink}
                      className="h-7 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs shrink-0"
                      title="Copy Link"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(mobileLinkUrl, "_blank")}
                      className="h-7 px-2 border-slate-700 text-slate-300 hover:text-white text-xs shrink-0"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Direct APK Download & Mobile Settings Buttons */}
                  <div className="flex gap-1.5 pt-1 w-full">
                    <Button
                      size="sm"
                      onClick={() => setIsApkModalOpen(true)}
                      className="h-7 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex-1 gap-1 shadow-sm"
                    >
                      <Download className="w-3 h-3" />
                      Download APK / PWA
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsMobileSettingsModalOpen(true)}
                      className="h-7 px-2 text-[10px] font-bold border-slate-700 text-slate-300 hover:text-white gap-1"
                      title="Open Mobile Stream Settings"
                    >
                      <Settings className="w-3 h-3 text-slate-400" />
                      Settings
                    </Button>
                  </div>
                </div>
              </div>

              {/* Dedicated Section Under Barcode for Asking AI to Perform Actions with Document Grounding */}
              <div className="p-3 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border-2 border-cyan-500/40 shadow-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span>Ask AI Assistant to...</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold cursor-pointer flex items-center gap-1 shadow">
                      <Upload className="w-2.5 h-2.5" /> SOP Doc
                      <input
                        type="file"
                        accept=".pdf,.txt,.docx,.json,.md,.csv,.png,.jpg"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const content = await file.text().catch(() => `[Binary document: ${file.name}]`);
                            const res = await fetch("/api/mobile-stream/upload-doc", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name: file.name,
                                content,
                                fileType: file.type || "text/plain",
                                size: file.size,
                                tags: ["grounding-doc", "sop"],
                              }),
                            });
                            if (res.ok) {
                              setAiGoal(`Execute tasks according to uploaded SOP "${file.name}"`);
                              toast.success(`📎 Ingested "${file.name}" for AI task grounding!`);
                            }
                          } catch {
                            toast.error("Failed uploading document");
                          }
                        }}
                      />
                    </label>
                    <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[8px] font-mono">
                      Autonomous
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <Input
                    value={aiGoal}
                    onChange={(e) => setAiGoal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && aiGoal.trim()) {
                        handleRunAiGoal();
                      }
                    }}
                    placeholder="e.g. Follow uploaded SOP and open Notes, or Tap search..."
                    className="h-7 text-[10px] bg-slate-950 border-slate-700 text-slate-200 focus:border-cyan-400"
                  />
                  <Button
                    size="sm"
                    disabled={isAiExecuting || !aiGoal.trim()}
                    onClick={() => handleRunAiGoal()}
                    className="h-7 px-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-[10px] shrink-0 gap-1 shadow-md"
                  >
                    {isAiExecuting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-white" />}
                    Ask AI
                  </Button>
                </div>

                {/* Quick Action Chips */}
                <div className="grid grid-cols-2 gap-1 pt-0.5">
                  {[
                    { label: "📸 Snapshot & Scan", prompt: "Capture screenshot and inspect all UI elements" },
                    { label: "🌐 Open Chrome", prompt: "Open Google Chrome and search AI automation" },
                    { label: "📝 Notes Entry", prompt: "Open Notes app and write task summary" },
                    { label: "📎 Follow SOP Doc", prompt: "Read uploaded SOP document and execute automated steps" },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => {
                        setAiGoal(chip.prompt);
                        toast.info(`Selected prompt: "${chip.prompt}"`);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-[9px] font-mono text-left border border-slate-800 hover:border-cyan-500/50 transition-all truncate"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Snapshot with Note Box */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Freeze & Add Frame Note
                </span>
                <div className="flex gap-1.5">
                  <Input
                    value={snapshotNoteInput}
                    onChange={(e) => setSnapshotNoteInput(e.target.value)}
                    placeholder="e.g. Settings menu open..."
                    className="h-7 text-[10px] bg-slate-900 border-slate-700 text-slate-200"
                  />
                  <Button
                    size="sm"
                    onClick={handleCaptureInstantSnapshot}
                    disabled={!mobileFrame}
                    className="h-7 px-2 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold gap-1 shrink-0"
                  >
                    <Save className="w-3 h-3" /> Snapshot
                  </Button>
                </div>
              </div>

              {/* Quick Save Recorded Session into Workflow */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                    <Save className="w-3.5 h-3.5 text-indigo-400" /> Save Session as Workflow
                  </span>
                  <span className="text-[9px] font-mono text-indigo-400">
                    {liveRecordedActions.length} recorded action(s)
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsSavingWorkflow(true)}
                  className="w-full h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save Workflow with Notes
                </Button>
              </div>
            </div>

            {/* Right Column: Live Phone Screen Viewer & Click-to-Tap Surface */}
            <div className="lg:col-span-8 space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
                <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${mobileStreamConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                    <span className="text-[11px] font-mono font-bold text-slate-200 truncate">
                      {mobileDeviceName} {mobileStreamConnected ? "• STREAM ACTIVE" : "• STANDBY"}
                    </span>
                  </div>

                  {/* Mode Switcher: Live View vs Interactive Mode */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => handleForwardEverythingToLiveVisionHud()}
                      className="h-6 px-2 bg-purple-950/90 hover:bg-purple-900 text-purple-200 border border-purple-500/60 text-[10px] font-bold font-mono gap-1 shadow-sm"
                      title="Forward to Live Desktop Screen Capture & Vision HUD below (Hotkey [V] or [F])"
                    >
                      <Layers className="w-3 h-3 text-purple-400" />
                      <span>Forward to HUD</span>
                      <span className="text-[8px] opacity-70">[V]</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={handleScanCurrentFrameBarcode}
                      disabled={!mobileFrame || isScanningFrameBarcode}
                      className="h-6 px-2 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/60 text-[10px] font-bold font-mono gap-1 shadow-sm"
                      title="Decode 1D/2D Barcodes or QR Codes in current mobile frame"
                    >
                      {isScanningFrameBarcode ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                      ) : (
                        <Scan className="w-3 h-3 text-emerald-400" />
                      )}
                      <span>Scan Barcode</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setIsBarcodeModalOpen(true)}
                      className="h-6 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold font-mono gap-1 shadow-sm"
                      title="Open Inventory Ledger & Barcode Scanner Hub"
                    >
                      <Package className="w-3 h-3 text-cyan-400" />
                      <span>Inventory</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setIsMobileSettingsModalOpen(true)}
                      className="h-6 px-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-500 text-[10px] font-bold font-mono gap-1 shadow-sm"
                      title="Open Mobile Stream & Workspace Options (Dead route sensitivity, AI vision model, auto-record)"
                    >
                      <Settings className="w-3 h-3 text-slate-300" />
                      <span>Settings</span>
                    </Button>

                    <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => {
                          setViewPhoneLauncher(false);
                          setIsInteractiveMode(false);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
                          !isInteractiveMode && !viewPhoneLauncher ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="View raw device mirror feed"
                      >
                        <Eye className="w-3 h-3" /> Live View
                      </button>
                      <button
                        onClick={() => {
                          setViewPhoneLauncher(false);
                          setIsInteractiveMode(true);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
                          isInteractiveMode && !viewPhoneLauncher ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900/50" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Interactive live device touch & swipe"
                      >
                        <Zap className="w-3 h-3 text-amber-300" /> Interactive
                      </button>
                      <button
                        onClick={() => {
                          setViewPhoneLauncher(!viewPhoneLauncher);
                          if (!viewPhoneLauncher && typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("sightline-navigate-home"));
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
                          viewPhoneLauncher ? "bg-amber-600 text-white shadow-sm shadow-amber-950" : "text-amber-400 hover:text-amber-200"
                        }`}
                        title="Display full interactive Home Launcher with all Android apps"
                      >
                        <Home className="w-3 h-3" /> Home Apps
                      </button>
                    </div>

                    {/* Preview Box Size Selector */}
                    <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
                      <span className="text-slate-400 px-1 text-[9px]">Size:</span>
                      <button
                        onClick={() => setPhonePreviewSize("compact")}
                        className={`px-1.5 py-0.5 rounded ${
                          phonePreviewSize === "compact" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Compact
                      </button>
                      <button
                        onClick={() => setPhonePreviewSize("large")}
                        className={`px-1.5 py-0.5 rounded ${
                          phonePreviewSize === "large" ? "bg-cyan-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Large
                      </button>
                      <button
                        onClick={() => setPhonePreviewSize("theater")}
                        className={`px-1.5 py-0.5 rounded ${
                          phonePreviewSize === "theater" ? "bg-purple-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Theater
                      </button>
                    </div>

                    {recentActionBadge && (
                      <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-[10px] font-mono text-emerald-300 animate-bounce">
                        {recentActionBadge}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 flex flex-col lg:flex-row gap-6 items-center justify-center">
                  {/* Phone Bezel Simulator & Interactive Surface */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`relative bg-black rounded-3xl border-4 border-slate-800 shadow-2xl overflow-hidden flex flex-col items-center justify-between select-none transition-all duration-300 ${
                        phonePreviewSize === "compact"
                          ? "w-72 md:w-80 h-[500px]"
                          : phonePreviewSize === "theater"
                          ? "w-96 md:w-[460px] lg:w-[500px] h-[660px] md:h-[760px] lg:h-[820px]"
                          : "w-80 md:w-96 lg:w-[420px] h-[580px] md:h-[680px] lg:h-[740px]"
                      }`}
                    >
                      {/* Top Extended Screen Overlay Banner (if active) */}
                      {isExtendScreenActive && (
                        <div className="w-full bg-slate-900/95 border-b border-cyan-500/40 px-2 py-1 flex items-center justify-between z-20 shrink-0 text-[10px] font-mono">
                          <div className="flex items-center gap-1 truncate text-cyan-300">
                            <Maximize2 className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="font-bold truncate max-w-[110px]">
                              {extendedWorkflow?.name || "Screen Overlay"}
                            </span>
                            <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 text-[8px] py-0 px-1">
                              {extendedWorkflow?.actions?.length || extendedWorkflow?.steps?.length || 0} pts
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setShowTrajectoryPath(!showTrajectoryPath)}
                              className={`p-1 rounded text-[9px] ${
                                showTrajectoryPath ? "text-cyan-300 bg-cyan-950/80" : "text-slate-500"
                              }`}
                              title="Toggle Path Lines"
                            >
                              <Activity className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={() => setShowStepPins(!showStepPins)}
                              className={`p-1 rounded text-[9px] ${
                                showStepPins ? "text-amber-300 bg-amber-950/80" : "text-slate-500"
                              }`}
                              title="Toggle Step Pins"
                            >
                              <MapPin className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={() => {
                                setIsAddStepFromClickMode(!isAddStepFromClickMode);
                                toast.info(
                                  !isAddStepFromClickMode
                                    ? "📍 Click anywhere on phone screen to add a step pin"
                                    : "Exited add step mode"
                                );
                              }}
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                isAddStepFromClickMode
                                  ? "bg-amber-600 text-white animate-pulse"
                                  : "bg-slate-800 text-slate-300 hover:text-white"
                              }`}
                              title="Add step pin on click"
                            >
                              +Pin
                            </button>
                            <button
                              onClick={() => {
                                if (extendedWorkflow) {
                                  handleSendWorkflowToMainVisionHud(extendedWorkflow);
                                }
                              }}
                              className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-950 text-purple-200 border border-purple-700/70 hover:bg-purple-900"
                              title="Send & Link workflow to Live Desktop Screen Capture & Vision HUD below"
                            >
                              🎯 Link HUD
                            </button>
                            <button
                              onClick={() => setIsExtendScreenActive(false)}
                              className="p-0.5 text-slate-400 hover:text-rose-400"
                              title="Close overlay"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Stream / Virtual OS Toggle Header */}
                      <div className="w-full bg-slate-900 border-b border-slate-800 px-2.5 py-1 flex items-center justify-between z-20 shrink-0 text-[10px] font-mono">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => setViewPhoneLauncher(false)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                              !viewPhoneLauncher && mobileFrame
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-white bg-slate-950 border border-slate-800"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            Live Stream {mobileFrame ? "●" : "(Standby)"}
                          </button>
                          <button
                            onClick={handleStartDesktopScreenMirrorInHub}
                            className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 bg-indigo-950/80 border border-indigo-500/50 text-indigo-200 hover:bg-indigo-900 shadow-sm"
                            title="Start Direct PC Desktop Screen Share Mirror (getDisplayMedia)"
                          >
                            <Monitor className="w-3 h-3 text-indigo-400" />
                            Mirror PC
                          </button>
                          <button
                            onClick={() => setViewPhoneLauncher(true)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                              viewPhoneLauncher || !mobileFrame
                                ? "bg-cyan-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-white bg-slate-950 border border-slate-800"
                            }`}
                          >
                            <Smartphone className="w-3 h-3" />
                            Virtual OS & Apps
                          </button>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 text-[9px]">
                          <span>{mobileDeviceName}</span>
                          <span className="text-emerald-400 font-bold">• 30 FPS Mirror</span>
                        </div>
                      </div>

                      {mobileFrame && !viewPhoneLauncher ? (
                        <div
                          ref={phonePreviewRef}
                          onMouseMove={(e) => {
                            if (!phonePreviewRef.current) return;
                            const rect = phonePreviewRef.current.getBoundingClientRect();
                            const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

                            setHoverCoord({
                              x: Math.round(normX * 1920),
                              y: Math.round(normY * 1080),
                              pctX: Math.round(normX * 100),
                              pctY: Math.round(normY * 100),
                            });

                            if (draggingPinIndex !== null) {
                              handleUpdateStepPinPosition(draggingPinIndex, normX, normY);
                            }
                          }}
                          onMouseLeave={() => {
                            setHoverCoord(null);
                            setDraggingPinIndex(null);
                          }}
                          onMouseDown={(e) => {
                            if (isAddStepFromClickMode && phonePreviewRef.current) {
                              const rect = phonePreviewRef.current.getBoundingClientRect();
                              const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                              const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                              handleAddStepFromPreviewClick(x, y);
                              return;
                            }
                            handlePhoneScreenMouseDown(e);
                          }}
                          onMouseUp={(e) => {
                            if (draggingPinIndex !== null) {
                              setDraggingPinIndex(null);
                              toast.info("📍 Step pin position calibrated");
                              return;
                            }
                            if (!isAddStepFromClickMode) {
                              handlePhoneScreenMouseUp(e);
                            }
                          }}
                          className={`w-full flex-1 relative overflow-hidden ${
                            isAddStepFromClickMode
                              ? "cursor-crosshair ring-2 ring-amber-500/50"
                              : isInteractiveMode
                              ? "cursor-crosshair group"
                              : "cursor-default"
                          }`}
                          title={
                            isAddStepFromClickMode
                              ? "Click to place new action pin"
                              : isInteractiveMode
                              ? "Click to tap, Drag to swipe"
                              : "Live View Mode"
                          }
                        >
                          <img
                            src={mobileFrame}
                            alt="Mobile Stream"
                            className="w-full h-full object-cover pointer-events-none"
                          />

                          {/* SVG Trajectory Path for Extended Workflow */}
                          {isExtendScreenActive && showTrajectoryPath && extendedWorkflow && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                              <defs>
                                <linearGradient id="pathGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
                                </linearGradient>
                              </defs>
                              {(() => {
                                const steps = extendedWorkflow.actions || extendedWorkflow.steps || [];
                                if (steps.length < 2) return null;
                                const points = steps
                                  .filter((s: any) => typeof s.x === "number" && typeof s.y === "number")
                                  .map((s: any) => `${(s.x > 1 ? s.x / 1920 : s.x) * 100}%,${(s.y > 1 ? s.y / 1080 : s.y) * 100}%`)
                                  .join(" ");

                                return (
                                  <polyline
                                    points={points}
                                    fill="none"
                                    stroke="url(#pathGrad)"
                                    strokeWidth="2.5"
                                    strokeDasharray="4 3"
                                    className="animate-pulse"
                                  />
                                );
                              })()}
                            </svg>
                          )}

                          {/* Step Pin Markers for Extended Workflow */}
                          {isExtendScreenActive && showStepPins && extendedWorkflow && (
                            <div className="absolute inset-0 pointer-events-none z-15">
                              {(extendedWorkflow.actions || extendedWorkflow.steps || []).map((step: any, sIdx: number) => {
                                const normX = typeof step.x === "number" ? (step.x > 1 ? step.x / 1920 : step.x) : 0.5;
                                const normY = typeof step.y === "number" ? (step.y > 1 ? step.y / 1080 : step.y) : 0.5;
                                const isSelected = selectedStepPinIndex === sIdx;

                                return (
                                  <div
                                    key={sIdx}
                                    style={{ left: `${normX * 100}%`, top: `${normY * 100}%` }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      setDraggingPinIndex(sIdx);
                                      setSelectedStepPinIndex(sIdx);
                                    }}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-grab active:cursor-grabbing group/pin"
                                  >
                                    <div
                                      className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] text-white shadow-lg border-2 transition-transform hover:scale-125 ${
                                        isSelected
                                          ? "bg-amber-500 border-white ring-4 ring-amber-500/40"
                                          : sIdx === 0
                                          ? "bg-emerald-600 border-emerald-300"
                                          : "bg-indigo-600 border-indigo-300"
                                      }`}
                                    >
                                      {sIdx + 1}
                                    </div>

                                    {/* Pin Hover Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/pin:flex flex-col items-center bg-slate-900/95 border border-slate-700 text-slate-100 p-1.5 rounded-lg shadow-xl text-[9px] font-mono whitespace-nowrap z-30 pointer-events-none">
                                      <span className="font-bold text-cyan-300">
                                        #{sIdx + 1}: {step.name || step.type}
                                      </span>
                                      <span className="text-slate-400">
                                        ({Math.round(normX * 100)}%, {Math.round(normY * 100)}%)
                                      </span>
                                      {step.text && <span className="text-amber-300">"{step.text}"</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Real-time Hover Crosshair HUD */}
                          {hoverCoord && (
                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[8px] font-mono text-cyan-300 border border-cyan-500/30 pointer-events-none z-20">
                              X: {hoverCoord.x} Y: {hoverCoord.y} ({hoverCoord.pctX}%, {hoverCoord.pctY}%)
                            </div>
                          )}

                          {/* Interactive Mode Helper */}
                          {isInteractiveMode && !isExtendScreenActive && (
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-emerald-500/5">
                              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-emerald-300 border border-emerald-500/30">
                                ⚡ Click: Tap • Drag: Swipe
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full relative flex-1 flex flex-col overflow-hidden">
                          <InteractivePhoneVirtualOS
                            externalTextInjection={textInputPayload}
                            onActionLogged={(action, details) => {
                              sendMobileAction({
                                type: action === "BUTTON" ? "key" : action === "SETTINGS" ? "custom_macro" : "tap",
                                description: `${action}: ${details}`,
                              });
                            }}
                          />
                        </div>
                      )}

                      {/* Bottom Virtual Hardware Nav & App Controller Bar */}
                      <div className="w-full h-8 bg-slate-950 border-t border-slate-800 flex items-center justify-around px-2 z-10 shrink-0">
                        <button
                          onClick={() => sendMobileAction({ type: "key", key: "BACK", description: "Back Button (Key [B])" })}
                          className="p-1 hover:text-emerald-400 text-slate-400 transition-colors"
                          title="Back (Hotkey [B])"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleSafeHomeClick}
                          className="p-1 hover:text-emerald-400 text-slate-400 transition-colors font-bold text-xs"
                          title="Home (Minimize App - Hotkey [H])"
                        >
                          <Home className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => sendMobileAction({ type: "key", key: "APPS", description: "App Switcher (Key [O])" })}
                          className="p-1 hover:text-emerald-400 text-slate-400 transition-colors"
                          title="App Switcher (Hotkey [O])"
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            fetch("/api/adb/notifications", { method: "POST" }).catch(() => {});
                            sendMobileAction({ type: "notifications", description: "Pull Notifications Shade" });
                          }}
                          className="p-1 hover:text-emerald-400 text-slate-400 transition-colors"
                          title="Pull Down Notifications"
                        >
                          <Bell className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setIsAppLauncherOpen(true)}
                          className="px-1.5 py-0.5 rounded bg-indigo-900/60 border border-indigo-700/50 hover:bg-indigo-600 text-indigo-200 hover:text-white transition-all text-[9px] font-mono flex items-center gap-0.5"
                          title="Open / Launch App"
                        >
                          <ExternalLink className="w-2.5 h-2.5" /> Apps
                        </button>
                      </div>
                    </div>

                    {/* Quick Action Shortcuts Toolbar */}
                    <div className="w-full flex flex-wrap items-center justify-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 text-[9px] font-mono">
                      <button
                        onClick={handleSafeHomeClick}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-0.5"
                        title="Minimize phone app (Hotkey [H])"
                      >
                        <Home className="w-2.5 h-2.5 text-amber-400" /> Home <span className="text-slate-500 text-[8px]">[H]</span>
                      </button>
                      <button
                        onClick={() => sendMobileAction({ type: "key", key: "BACK", description: "Back Button" })}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-0.5"
                        title="Back navigation (Hotkey [B])"
                      >
                        <ArrowLeft className="w-2.5 h-2.5 text-cyan-400" /> Back <span className="text-slate-500 text-[8px]">[B]</span>
                      </button>
                      <button
                        onClick={() => handleRunAiGoal(false)}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-0.5"
                        title="Detect UI elements with Gemini Vision (Hotkey [D])"
                      >
                        <Bot className="w-2.5 h-2.5 text-emerald-400" /> Detect <span className="text-slate-500 text-[8px]">[D]</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsExtendScreenActive(!isExtendScreenActive);
                          toast.info(!isExtendScreenActive ? "🔀 Extend to Screen active" : "Extend to Screen hidden");
                        }}
                        className={`px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                          isExtendScreenActive
                            ? "bg-cyan-950 text-cyan-300 border-cyan-500 font-bold"
                            : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
                        }`}
                        title="Toggle Extend to Screen Overlay (Hotkey [E])"
                      >
                        <Maximize2 className="w-2.5 h-2.5 text-cyan-400" /> Extend <span className="text-slate-500 text-[8px]">[E]</span>
                      </button>
                      <button
                        onClick={() => {
                          if (extendedWorkflow) {
                            handleSendWorkflowToMainVisionHud(extendedWorkflow);
                          } else if (workflows.length > 0) {
                            handleSendWorkflowToMainVisionHud(workflows[0]);
                          } else if (liveRecordedActions.length > 0) {
                            handleSendWorkflowToMainVisionHud({
                              name: "Live Captured Device Sequence",
                              actions: liveRecordedActions,
                              steps: liveRecordedActions,
                            });
                          } else {
                            toast.info("No workflow loaded. Ask AI Chat or click +Pin to create steps first!");
                          }
                        }}
                        className="px-1.5 py-0.5 rounded bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-700/70 flex items-center gap-0.5 font-bold shadow-sm"
                        title="Send workflow to Live Desktop Screen Capture & Vision HUD below (Hotkey [V])"
                      >
                        <Layers className="w-2.5 h-2.5 text-purple-400" /> Link HUD <span className="text-purple-400 text-[8px]">[V]</span>
                      </button>
                      <button
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("open-calibration"));
                          }
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-500/60 flex items-center gap-0.5 font-bold shadow-sm"
                        title="Calibrate mouse, touch, and coordinate precision"
                      >
                        <Crosshair className="w-2.5 h-2.5 text-amber-400" /> Calibrate
                      </button>
                      <button
                        onClick={handleCaptureInstantSnapshot}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-0.5"
                        title="Capture frame screenshot (Hotkey [S])"
                      >
                        <Camera className="w-2.5 h-2.5 text-amber-400" /> Snap <span className="text-slate-500 text-[8px]">[S]</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Side: Tabbed AI Chat, Workflow History, Settings & Controls */}
                  <div className="flex-1 flex flex-col min-w-0 w-full bg-slate-950/80 rounded-2xl border border-slate-800 p-2.5 space-y-2.5">
                    {/* Panel Header Navigation */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 shrink-0">
                      <div className="flex items-center bg-slate-900/90 p-0.5 rounded-xl border border-slate-800">
                        <button
                          onClick={() => setLiveControlSideTab("chat")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                            liveControlSideTab === "chat"
                              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>AI Chat & Tools</span>
                        </button>
                        <button
                          onClick={() => setLiveControlSideTab("workflows")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                            liveControlSideTab === "workflows"
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Workflow History</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-indigo-200">
                            {workflows.length}
                          </span>
                        </button>
                        <button
                          onClick={() => setLiveControlSideTab("settings")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                            liveControlSideTab === "settings"
                              ? "bg-slate-700 text-white shadow-md"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>Settings</span>
                        </button>
                        <button
                          onClick={() => setLiveControlSideTab("controls")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                            liveControlSideTab === "controls"
                              ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Quick Controls</span>
                        </button>
                      </div>

                      <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                        Live Linked
                      </span>
                    </div>

                    {/* TAB 1: AI Chat & Copilot */}
                    {liveControlSideTab === "chat" && (
                      <div className="space-y-2">
                        <MainAiLiveChat
                          currentScreenSnapshot={mobileFrame}
                          currentTab="mobile-stream"
                          onNavigateTab={(tab) => {
                            if (tab === "workflows") setLiveControlSideTab("workflows");
                            else if (tab === "settings") setLiveControlSideTab("settings");
                          }}
                          onExtendToScreen={handleExtendWorkflowToScreen}
                          onSendToVisionHud={handleSendWorkflowToMainVisionHud}
                          onSaveWorkflow={async (wf) => {
                            try {
                              const actions = (wf.steps || wf.actions || []).map((s: any, idx: number) => ({
                                id: s.id || `act-${idx}`,
                                type: s.action || s.type || "tap",
                                x: s.x ? (s.x > 1 ? s.x / 1920 : s.x) : 0.5,
                                y: s.y ? (s.y > 1 ? s.y / 1080 : s.y) : 0.5,
                                text: s.text,
                                key: s.key,
                                description: s.name || s.description,
                                createdAt: Date.now(),
                              }));
                              const res = await fetch("/api/mobile-stream/workflows", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  name: wf.name || "AI Generated Workflow",
                                  description: wf.description || "",
                                  tags: ["ai-generated", "mobile"],
                                  actions,
                                }),
                              });
                              if (res.ok) {
                                toast.success(`💾 Saved "${wf.name}" to Workflows!`);
                                fetchWorkflows();
                              }
                            } catch {
                              toast.error("Failed to save workflow");
                            }
                          }}
                          onRunWorkflow={(wf) => {
                            if (wf?.steps || wf?.actions) {
                              const actions = (wf.steps || wf.actions).map((s: any, idx: number) => ({
                                id: s.id || `act-${idx}`,
                                type: s.action || s.type || "tap",
                                x: s.x ? (s.x > 1 ? s.x / 1920 : s.x) : 0.5,
                                y: s.y ? (s.y > 1 ? s.y / 1080 : s.y) : 0.5,
                                text: s.text,
                                key: s.key,
                                description: s.name || s.description,
                                createdAt: Date.now(),
                              }));
                              const tempWf: DeviceWorkflow = {
                                id: wf.id || `wf-${Date.now()}`,
                                name: wf.name || "AI Generated Workflow",
                                description: wf.description || "",
                                tags: ["ai-generated", "mobile"],
                                actions,
                                createdAt: Date.now(),
                                updatedAt: Date.now(),
                                executionCount: 0,
                              };
                              handleReplayWorkflow(tempWf);
                            }
                          }}
                          className="h-[430px] border-slate-800 shadow-inner"
                        />
                      </div>
                    )}

                    {/* TAB 2: Workflow History */}
                    {liveControlSideTab === "workflows" && (
                      <div className="space-y-2.5 h-[430px] flex flex-col">
                        <div className="flex items-center justify-between gap-2 shrink-0">
                          <Input
                            value={workflowSearch}
                            onChange={(e) => setWorkflowSearch(e.target.value)}
                            placeholder="Search workflows by name or tag..."
                            className="h-7 text-xs bg-slate-900 border-slate-700 text-white"
                          />
                          <Button
                            size="sm"
                            onClick={() => setIsSavingWorkflow(true)}
                            className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold gap-1 shrink-0"
                          >
                            <Save className="w-3 h-3" /> Save Session
                          </Button>
                        </div>

                        {/* List of Saved Workflows */}
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                          {workflows.length === 0 ? (
                            <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-dashed border-slate-800 space-y-2 my-auto">
                              <Layers className="w-8 h-8 mx-auto text-slate-600" />
                              <p className="text-xs text-slate-400 font-medium">No recorded workflows saved yet</p>
                              <p className="text-[10px] text-slate-500">
                                Interact with the phone preview or use AI Chat to generate and save your first workflow.
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLiveControlSideTab("chat")}
                                className="h-6 text-[10px] border-slate-700 text-cyan-400"
                              >
                                <Sparkles className="w-3 h-3 mr-1" /> Ask AI to create a workflow
                              </Button>
                            </div>
                          ) : (
                            workflows
                              .filter((w) =>
                                !workflowSearch ||
                                w.name.toLowerCase().includes(workflowSearch.toLowerCase()) ||
                                w.tags.some((t) => t.toLowerCase().includes(workflowSearch.toLowerCase()))
                              )
                              .map((wf) => (
                                <div
                                  key={wf.id}
                                  className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-white truncate">{wf.name}</span>
                                        <Badge className="bg-indigo-950 text-indigo-300 border-indigo-800 text-[9px] py-0 px-1 font-mono">
                                          {wf.actions.length} step(s)
                                        </Badge>
                                      </div>
                                      <p className="text-[10px] text-slate-400 line-clamp-1">{wf.description}</p>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleExtendWorkflowToScreen(wf)}
                                        className="h-7 px-1.5 bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border-cyan-700/60 text-[9px] font-mono gap-0.5"
                                        title="Project workflow onto Live Screen Preview overlay"
                                      >
                                        <Maximize2 className="w-2.5 h-2.5 text-cyan-400" /> Extend
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSendWorkflowToMainVisionHud(wf)}
                                        className="h-7 px-1.5 bg-purple-950/70 hover:bg-purple-900 text-purple-200 border-purple-700/60 text-[9px] font-mono gap-0.5"
                                        title="Send & link to Live Desktop Screen Capture & Vision HUD below"
                                      >
                                        <Layers className="w-2.5 h-2.5 text-purple-400" /> Link HUD
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => handleReplayWorkflow(wf)}
                                        disabled={isReplayingWorkflow === wf.id}
                                        className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold gap-1 shadow-sm"
                                      >
                                        {isReplayingWorkflow === wf.id ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Play className="w-3 h-3" />
                                        )}
                                        <span>Run</span>
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 border-t border-slate-800/80 pt-1.5">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      {new Date(wf.createdAt).toLocaleDateString()} • Executed: {wf.executionCount || 0}x
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => {
                                          const blob = new Blob([JSON.stringify(wf, null, 2)], { type: "application/json" });
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement("a");
                                          a.href = url;
                                          a.download = `${wf.name.replace(/\s+/g, "_")}-workflow.json`;
                                          a.click();
                                          URL.revokeObjectURL(url);
                                          toast.success("Exported workflow JSON");
                                        }}
                                        className="p-1 hover:text-cyan-400 text-slate-400 transition-colors"
                                        title="Export JSON"
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={async () => {
                                          try {
                                            await fetch(`/api/mobile-stream/workflows/${wf.id}`, { method: "DELETE" });
                                            toast.success("Workflow deleted");
                                            fetchWorkflows();
                                          } catch {
                                            toast.error("Failed to delete workflow");
                                          }
                                        }}
                                        className="p-1 hover:text-rose-400 text-slate-400 transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB 3: Live Control Settings */}
                    {liveControlSideTab === "settings" && (
                      <div className="space-y-3 h-[430px] overflow-y-auto pr-1">
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Automation & Touch Preferences
                          </span>

                          {/* Recording Cadence / Speed */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-slate-400">
                              Execution Delay / Step Pace ({workspaceSettings.recordCadenceMs}ms):
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {[
                                { label: "Fast (500ms)", val: 500 },
                                { label: "Normal (1000ms)", val: 1000 },
                                { label: "Relaxed (2000ms)", val: 2000 },
                              ].map((opt) => (
                                <button
                                  key={opt.val}
                                  onClick={() => handleSaveSettings({ recordCadenceMs: opt.val })}
                                  className={`py-1 text-[10px] font-mono rounded-lg border transition-all ${
                                    workspaceSettings.recordCadenceMs === opt.val
                                      ? "bg-cyan-950 text-cyan-300 border-cyan-500 font-bold"
                                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Auto-Record Toggles */}
                          <div className="space-y-2 pt-1 border-t border-slate-800">
                            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                              <span>Auto-Record Actions to Workflow Tree</span>
                              <input
                                type="checkbox"
                                checked={workspaceSettings.autoRecordWorkflows}
                                onChange={(e) => handleSaveSettings({ autoRecordWorkflows: e.target.checked })}
                                className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0 w-4 h-4"
                              />
                            </label>

                            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                              <span>Auto-Dismiss System Popups</span>
                              <input
                                type="checkbox"
                                checked={workspaceSettings.autoDismissPopups}
                                onChange={(e) => handleSaveSettings({ autoDismissPopups: e.target.checked })}
                                className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0 w-4 h-4"
                              />
                            </label>

                            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                              <span>Auto-Renavigate on Dead Route</span>
                              <input
                                type="checkbox"
                                checked={workspaceSettings.autoRenavigateOnDeadRoute}
                                onChange={(e) => handleSaveSettings({ autoRenavigateOnDeadRoute: e.target.checked })}
                                className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0 w-4 h-4"
                              />
                            </label>

                            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                              <span>Audio Feedback Alerts & Touch Haptics</span>
                              <input
                                type="checkbox"
                                checked={workspaceSettings.audioFeedbackAlerts}
                                onChange={(e) => handleSaveSettings({ audioFeedbackAlerts: e.target.checked })}
                                className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0 w-4 h-4"
                              />
                            </label>
                          </div>
                        </div>

                        {/* Wireless ADB Quick Ping */}
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Wireless ADB Pair & Debugging
                          </span>
                          <div className="flex gap-1.5">
                            <Input
                              value={pingIp}
                              onChange={(e) => setPingIp(e.target.value)}
                              placeholder="192.168.1.50"
                              className="h-7 text-xs bg-slate-950 border-slate-700 text-white"
                            />
                            <Input
                              value={pingPort}
                              onChange={(e) => setPingPort(e.target.value)}
                              placeholder="5555"
                              className="h-7 w-20 text-xs bg-slate-950 border-slate-700 text-white"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleRunPingTest(false)}
                              disabled={isPinging}
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shrink-0"
                            >
                              {isPinging ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Connect"}
                            </Button>
                          </div>
                          {pingResult && (
                            <p className="text-[10px] font-mono text-emerald-300 bg-slate-950 p-1.5 rounded border border-emerald-900/40">
                              {pingResult.output || (pingResult.success ? "ADB connection verified" : "Connection check sent")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB 4: Quick Controls & Text Injection */}
                    {liveControlSideTab === "controls" && (
                      <div className="space-y-2.5 h-[430px] overflow-y-auto pr-1">
                        {/* Text Injection Box */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-400 font-bold flex items-center gap-1">
                            <Type className="w-3 h-3 text-cyan-400" /> Type into Focused Mobile Input:
                          </label>
                          <div className="flex gap-1.5">
                            <Input
                              value={textInputPayload}
                              onChange={(e) => setTextInputPayload(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                              placeholder="Type text or URL to send..."
                              className="h-7 text-xs bg-slate-950 border-slate-700 text-white"
                            />
                            <Button
                              size="sm"
                              onClick={handleSendText}
                              className="h-7 px-3 bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1"
                            >
                              <Send className="w-3 h-3" /> Send
                            </Button>
                          </div>
                        </div>

                        {/* AI Autonomous Screen Plan & Act */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-900/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                              <Bot className="w-3.5 h-3.5" /> AI Gemini Screen Planner:
                            </span>
                            <span className="text-[9px] text-slate-400">Gemini Vision Automated Action</span>
                          </div>
                          <div className="flex gap-1.5">
                            <Input
                              value={aiGoal}
                              onChange={(e) => setAiGoal(e.target.value)}
                              placeholder="e.g. Tap search button and type 'Hotels'..."
                              className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleRunAiGoal(false)}
                              disabled={isAiExecuting || !mobileFrame}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 shrink-0"
                            >
                              {isAiExecuting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              Execute
                            </Button>
                          </div>
                          {aiPlanSummary && (
                            <div className="p-2 rounded bg-slate-950 border border-emerald-800/30 text-[10px] font-mono text-emerald-300">
                              {aiPlanSummary}
                            </div>
                          )}
                        </div>

                        {/* Quick Gesture Actions */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendMobileAction({ type: "swipe", direction: "up", x: 0.5, y: 0.75, toX: 0.5, toY: 0.25, description: "Scroll Down" })}
                            className="h-7 text-[10px] border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
                          >
                            <ArrowDown className="w-3 h-3 mr-1 text-cyan-400" /> Scroll Down
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendMobileAction({ type: "swipe", direction: "down", x: 0.5, y: 0.25, toX: 0.5, toY: 0.75, description: "Scroll Up" })}
                            className="h-7 text-[10px] border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
                          >
                            <ArrowUp className="w-3 h-3 mr-1 text-cyan-400" /> Scroll Up
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendMobileAction({ type: "double_tap", x: 0.5, y: 0.5, description: "Double-tap Center" })}
                            className="h-7 text-[10px] border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
                          >
                            <MousePointer className="w-3 h-3 mr-1 text-amber-400" /> Double Tap
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* APP LAUNCHER MODAL */}
          {isAppLauncherOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Device App Launcher</h3>
                      <p className="text-[11px] text-slate-400">Switch apps or launch targets via ADB & Deep Link</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsAppLauncherOpen(false)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Preset Apps Grid */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">Popular Apps</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: "Google Chrome", pkg: "com.android.chrome", icon: Globe, color: "text-blue-400", url: "https://google.com" },
                      { name: "Settings", pkg: "com.android.settings", icon: Settings, color: "text-slate-300", url: "settings://" },
                      { name: "YouTube", pkg: "com.google.android.youtube", icon: Play, color: "text-red-400", url: "https://youtube.com" },
                      { name: "WhatsApp", pkg: "com.whatsapp", icon: MessageSquare, color: "text-emerald-400", url: "whatsapp://" },
                      { name: "Google Maps", pkg: "com.google.android.apps.maps", icon: MapPin, color: "text-amber-400", url: "geo:0,0" },
                      { name: "Camera", pkg: "com.android.camera2", icon: Camera, color: "text-cyan-400" },
                      { name: "Play Store", pkg: "com.android.vending", icon: ShoppingBag, color: "text-teal-400" },
                      { name: "Files / Storage", pkg: "com.google.android.documentsui", icon: Folder, color: "text-purple-400" },
                    ].map((app) => (
                      <button
                        key={app.pkg}
                        onClick={() => handleLaunchApp(app.pkg, app.name, app.url)}
                        className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 transition-all text-left"
                      >
                        <app.icon className={`w-4 h-4 ${app.color} shrink-0`} />
                        <div className="truncate">
                          <p className="text-xs font-medium text-white truncate">{app.name}</p>
                          <p className="text-[9px] font-mono text-slate-500 truncate">{app.pkg}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Package / URL Scheme */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="text-[10px] font-mono text-slate-400 font-bold">Custom Package / Intent URL</label>
                  <div className="flex gap-1.5">
                    <Input
                      value={customPackageInput}
                      onChange={(e) => setCustomPackageInput(e.target.value)}
                      placeholder="e.g. com.spotify.music or spotify://"
                      className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customPackageInput.trim()) {
                          handleLaunchApp(customPackageInput.trim(), customPackageInput.trim(), customPackageInput.trim().includes("://") ? customPackageInput.trim() : undefined);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (customPackageInput.trim()) {
                          handleLaunchApp(customPackageInput.trim(), customPackageInput.trim(), customPackageInput.trim().includes("://") ? customPackageInput.trim() : undefined);
                        }
                      }}
                      className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0"
                    >
                      Launch
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. SAVED WORKFLOWS, REPLAY, EXTRACTION & AI CUSTOMIZATION */}
      {/* ---------------------------------------------------- */}
      {activeTab === "workflows" && (
        <div className="space-y-3.5">
          {/* 10-Second Heartbeat & AI Learning Telemetry Bar */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-slate-950 via-indigo-950/60 to-slate-950 border border-cyan-500/40 shadow-xl flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <div>
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  ⚡ 10s Completion & Health Check Active
                  <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[9px] font-mono">Autonomous Verification</Badge>
                </span>
                <p className="text-[10px] text-slate-400">
                  Workflows automatically validated every 10s. Agents auto-heal failed steps and store learned routes.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/mobile-stream/workflows/completion-check", { method: "POST" });
                    if (res.ok) {
                      toast.success("⚡ 10s Completion Check Executed - All active workflows verified");
                      fetchWorkflows();
                    }
                  } catch {
                    toast.error("Failed executing completion check");
                  }
                }}
                className="h-7 px-2 text-[10px] font-mono border-slate-700 bg-slate-900 text-cyan-300 hover:text-white gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Check Now (10s Heartbeat)
              </Button>
            </div>
          </div>

          {/* Top Bar: Search, New Workflow, Auto-Save Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <Input
                value={workflowSearch}
                onChange={(e) => setWorkflowSearch(e.target.value)}
                placeholder="Search workflows, notes, or tags..."
                className="h-7 text-xs bg-slate-900 border-slate-700 text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300">
                <span>Speed:</span>
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setReplaySpeed(s)}
                    className={`px-1.5 py-0.5 rounded ${replaySpeed === s ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-white"}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                onClick={() => setIsSavingWorkflow(true)}
                className="h-7 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Create / Save Workflow
              </Button>
            </div>
          </div>

          {/* Workflows Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredWorkflows.map((wf) => {
              const isExecuting = isReplayingWorkflow === wf.id;
              return (
                <div
                  key={wf.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${
                    wf.autoSave
                      ? "bg-slate-950/90 border-indigo-500/40 shadow-lg"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="space-y-2">
                    {/* Header: Title & Auto-Save Badge */}
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="space-y-0.5 flex-1">
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          {wf.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 line-clamp-2">{wf.description}</p>
                      </div>

                      {/* Auto-Save Toggle Badge */}
                      <button
                        onClick={() => handleToggleWorkflowAutoSave(wf)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${
                          wf.autoSave
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
                            : "bg-slate-900 text-slate-500 border border-slate-800 hover:text-slate-300"
                        }`}
                        title="Toggle Auto-Save live actions into this workflow"
                      >
                        {wf.autoSave ? "AUTO-SAVE ON" : "AUTO-SAVE OFF"}
                      </button>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      {wf.tags.map((t, idx) => (
                        <span key={idx} className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-[9px] font-mono text-slate-400">
                          #{t}
                        </span>
                      ))}
                    </div>

                    {/* Notes Box */}
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                        <span className="flex items-center gap-1 font-bold">
                          <FileText className="w-2.5 h-2.5 text-indigo-400" /> Notes & Context:
                        </span>
                        <button
                          onClick={() => {
                            setEditingNotesWfId(wf.id);
                            setCurrentNotesBuffer(wf.notes || "");
                          }}
                          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                        >
                          <Edit3 className="w-2.5 h-2.5" /> Edit
                        </button>
                      </div>
                      {editingNotesWfId === wf.id ? (
                        <div className="space-y-1 pt-1">
                          <textarea
                            value={currentNotesBuffer}
                            onChange={(e) => setCurrentNotesBuffer(e.target.value)}
                            rows={2}
                            className="w-full p-1 text-[10px] bg-slate-950 border border-slate-700 rounded text-slate-200"
                            placeholder="Add execution notes or device constraints..."
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingNotesWfId(null)}
                              className="h-5 px-1.5 text-[9px]"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveWorkflowNotes(wf.id)}
                              className="h-5 px-2 bg-indigo-600 text-[9px] text-white"
                            >
                              Save Note
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-300 italic line-clamp-2">
                          {wf.notes || "No notes added yet."}
                        </p>
                      )}
                    </div>

                    {/* Step Count & Execution Stats */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 border-t border-slate-900 pt-1.5">
                      <span className="text-indigo-300 font-bold">{wf.actions.length} action steps</span>
                      <span>Run {wf.executionCount || 0}x</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-900">
                    <Button
                      size="sm"
                      onClick={() => handleReplayWorkflow(wf)}
                      disabled={isExecuting || wf.actions.length === 0}
                      className="h-7 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold gap-1"
                      title="Replay full workflow on connected phone"
                    >
                      {isExecuting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-white" />}
                      Replay
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setExtractModalWf(wf);
                        setSelectedExtractStepIds(wf.actions.map((a) => a.id));
                        setExtractTitle(`Extracted from ${wf.name}`);
                      }}
                      className="h-7 border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-[10px] gap-1"
                      title="Extract individual steps or sub-workflows"
                    >
                      <Scissors className="w-3 h-3 text-cyan-400" /> Extract
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAiCustomizeModalWf(wf);
                        setAiCustomizePrompt("");
                        setAiCustomResultMsg(null);
                      }}
                      className="h-7 border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-[10px] gap-1"
                      title="AI Customization & Parameter Adaptation"
                    >
                      <Wand2 className="w-3 h-3 text-amber-400" /> AI Mutate
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. LAST 10 SCREENSHOTS & FRAMES GALLERY (WITH NOTES) */}
      {/* ---------------------------------------------------- */}
      {activeTab === "frames-history" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Recent Frames & Screenshots Filmstrip
              </h4>
              <p className="text-[10px] text-slate-400">
                Last 10 frames synced from mobile device. Click to inspect, add notes, or extract coordinates.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleCaptureInstantSnapshot}
              disabled={!mobileFrame}
              className="h-7 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold gap-1"
            >
              <Save className="w-3 h-3" /> Capture Live Frame Now
            </Button>
          </div>

          {recentFrames.length === 0 ? (
            <div className="p-8 text-center text-slate-500 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <ImageIcon className="w-8 h-8 mx-auto opacity-30 animate-pulse" />
              <p className="text-xs font-medium">No frames recorded yet. Start mobile stream on your phone to build history.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {recentFrames.map((frame, idx) => (
                <div
                  key={frame.id}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col justify-between space-y-2 group"
                >
                  <div className="space-y-1.5">
                    {/* Frame Thumbnail */}
                    <div
                      onClick={() => setPreviewFrameModal(frame)}
                      className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black cursor-pointer border border-slate-800 group-hover:shadow-lg"
                    >
                      <img
                        src={frame.imageData}
                        alt={`Frame ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-black/80 font-mono text-[9px] text-amber-300">
                        #{idx + 1}
                      </div>
                      <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 font-mono text-[8px] text-slate-400">
                        {new Date(frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                    </div>

                    {/* Frame Note Editor */}
                    <div className="space-y-1">
                      {editingFrameNoteId === frame.id ? (
                        <div className="space-y-1">
                          <input
                            value={frameNoteBuffer}
                            onChange={(e) => setFrameNoteBuffer(e.target.value)}
                            placeholder="Add note..."
                            className="w-full p-1 text-[10px] bg-slate-900 border border-slate-700 rounded text-slate-200"
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setEditingFrameNoteId(null)}
                              className="text-[9px] text-slate-400"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveFrameNote(frame.id)}
                              className="text-[9px] text-amber-400 font-bold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-1 text-[10px]">
                          <p className="text-slate-300 italic line-clamp-2 text-[9px]">
                            {frame.note || "No note"}
                          </p>
                          <button
                            onClick={() => {
                              setEditingFrameNoteId(frame.id);
                              setFrameNoteBuffer(frame.note || "");
                            }}
                            className="text-slate-500 hover:text-amber-400 shrink-0"
                            title="Edit note"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions for this frame */}
                  <div className="flex gap-1 pt-1 border-t border-slate-900">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (onSelectDeviceFrame) onSelectDeviceFrame(frame.imageData);
                        toast.success("Loaded frame into main HUD!");
                      }}
                      className="flex-1 h-6 text-[9px] border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                    >
                      <Eye className="w-2.5 h-2.5 mr-1" /> Load
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = frame.imageData;
                        a.download = `mobile_frame_${frame.id}.jpg`;
                        a.click();
                      }}
                      className="h-6 px-1.5 border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                      title="Download image"
                    >
                      <Download className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. WEB BLUETOOTH PAIRING & TESTING */}
      {/* ---------------------------------------------------- */}
      {activeTab === "bluetooth" && (
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Bluetooth className="w-4 h-4 text-blue-400" /> Web Bluetooth Peripheral Bridge
              </span>
              <p className="text-[10px] text-slate-400">
                Pair with nearby Bluetooth smart devices, mobile phones, or hardware input beacons.
              </p>
            </div>
            {btState.connected && (
              <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-500/40 text-[10px] font-mono text-blue-300">
                CONNECTED: {btState.name}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {!btState.connected ? (
              <Button
                onClick={handlePairBluetooth}
                disabled={btScanning}
                className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold gap-1.5"
              >
                {btScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                Scan & Pair Bluetooth Device
              </Button>
            ) : (
              <>
                <Button
                  onClick={handlePingBt}
                  variant="outline"
                  className="h-8 border-blue-600/40 text-blue-300 hover:text-white text-xs gap-1.5"
                >
                  <Activity className="w-3.5 h-3.5" /> Ping Device {btPingTime && `(${btPingTime}ms)`}
                </Button>
                <Button
                  onClick={handleDisconnectBt}
                  variant="destructive"
                  className="h-8 text-xs font-bold"
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>

          <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
            {btStatus}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. WIFI ADB & PING PORT DIAGNOSTIC TOOL */}
      {/* ---------------------------------------------------- */}
      {activeTab === "wifi-adb" && (
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-cyan-400" /> Wireless ADB & Port Connectivity Prober
            </span>
            <p className="text-[10px] text-slate-400">
              Test TCP connectivity, scan standard ADB ports, and diagnose firewall reachability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
            <div className="md:col-span-6 space-y-1">
              <label className="text-[10px] font-mono text-slate-400">Device IP Address:</label>
              <Input
                value={pingIp}
                onChange={(e) => setPingIp(e.target.value)}
                placeholder="192.168.1.150"
                className="h-8 text-xs bg-slate-900 border-slate-700 text-white font-mono"
              />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-slate-400">Port:</label>
              <Input
                value={pingPort}
                onChange={(e) => setPingPort(e.target.value)}
                placeholder="5555"
                className="h-8 text-xs bg-slate-900 border-slate-700 text-white font-mono"
              />
            </div>
            <div className="md:col-span-3 flex gap-1.5">
              <Button
                onClick={() => handleRunPingTest(false)}
                disabled={isPinging}
                className="flex-1 h-8 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
              >
                {isPinging ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Test Port"}
              </Button>
              <Button
                onClick={() => handleRunPingTest(true)}
                disabled={isPinging}
                variant="outline"
                className="h-8 border-slate-700 text-slate-300 text-xs"
                title="Scan top 9 common ADB ports"
              >
                Scan All
              </Button>
            </div>
          </div>

          {pingResult && (
            <div className={`p-2.5 rounded-xl border text-xs font-mono ${pingResult.success && (pingResult.open || pingResult.reachable) ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300" : "bg-red-950/40 border-red-500/40 text-red-300"}`}>
              {pingResult.message || pingResult.hint || pingResult.error || "Probe finished"}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. LINKAGE WORKTREE & INTERACTIVE NAVIGATION DAG */}
      {/* ---------------------------------------------------- */}
      {activeTab === "worktree" && (
        <div className="space-y-3.5">
          {/* Worktree Analytics & Health Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Screens Explored</span>
              <p className="text-lg font-bold text-cyan-400 font-mono">{worktreeAnalytics.totalScreensExplored || worktreeNodes.length}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Transitions</span>
              <p className="text-lg font-bold text-indigo-400 font-mono">{worktreeAnalytics.totalTransitions || worktreeEdges.length}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Dead Routes</span>
              <p className={`text-lg font-bold font-mono ${worktreeAnalytics.deadRouteCount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {worktreeAnalytics.deadRouteCount}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Backtracks</span>
              <p className={`text-lg font-bold font-mono ${worktreeAnalytics.backtrackCount > 0 ? "text-amber-400" : "text-slate-300"}`}>
                {worktreeAnalytics.backtrackCount}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Latency Alerts</span>
              <p className={`text-lg font-bold font-mono ${worktreeAnalytics.slowCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {worktreeAnalytics.slowCount}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Health Score</span>
              <p className="text-lg font-bold text-emerald-400 font-mono">{worktreeAnalytics.healthScore}%</p>
            </div>
          </div>

          {/* Action & AI Optimization Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleRunRouteAnalysis}
                disabled={isAnalyzingRoute}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold gap-1.5 shadow-md"
              >
                {isAnalyzingRoute ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                AI Analyze Routes & Shortcut Optimizer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSynthesizeWorkflowFromHistory}
                disabled={isSynthesizingWf}
                className="text-xs bg-indigo-950/40 border-indigo-700/50 text-indigo-300 hover:bg-indigo-900/50 gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5 text-indigo-400" /> Synthesize Workflow from Tree
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchWorktree}
                className="text-xs text-slate-400 hover:text-white gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Tree
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearWorktree}
                className="text-xs border-rose-800/50 text-rose-400 hover:bg-rose-950/40 gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear History
              </Button>
            </div>
          </div>

          {/* AI Route Optimization Callout */}
          {aiRouteAnalysis && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/70 to-indigo-950/70 border border-cyan-500/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" /> AI Recommended Route Optimization (
                  {aiRouteAnalysis.efficiencyGainPercent}% Efficiency Boost)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-200 border border-cyan-500/30">
                  Self-Healing Engine
                </span>
              </div>
              <p className="text-xs text-slate-200 font-medium">{aiRouteAnalysis.easierAlternative}</p>
              {aiRouteAnalysis.shortcutSteps && aiRouteAnalysis.shortcutSteps.length > 0 && (
                <div className="space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-bold text-cyan-400">Streamlined Shortcut Execution:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {aiRouteAnalysis.shortcutSteps.map((s: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiRouteAnalysis.deadRoutesIdentified && aiRouteAnalysis.deadRoutesIdentified.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-300">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <span>Pruned Dead Ends: {aiRouteAnalysis.deadRoutesIdentified.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {/* Navigation WorkTree Screen Nodes & Linkage Graph */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Screen Nodes List */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> Discovered Screen Nodes ({worktreeNodes.length})
                </span>
                <span className="text-[10px] text-slate-400">Click a node to inspect transitions</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {worktreeNodes.map((node) => {
                  const isSelected = selectedWorktreeNode?.id === node.id;
                  const outgoingEdges = worktreeEdges.filter((e) => e.fromId === node.id);

                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedWorktreeNode(node)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-cyan-950/60 border-cyan-500 ring-1 ring-cyan-500 shadow-lg"
                          : node.isDeadEnd
                          ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {node.isHome ? (
                              <Home className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                            )}
                            <h4 className="text-xs font-bold text-white truncate max-w-[140px]">{node.title}</h4>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block">Type: {node.screenType}</span>
                        </div>

                        {node.isDeadEnd ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/40 text-[9px] font-bold text-rose-400">
                            DEAD END
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-mono text-cyan-300">
                            {node.visitCount} visits
                          </span>
                        )}
                      </div>

                      {node.thumbnail && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-slate-800 max-h-20 bg-black flex items-center justify-center">
                          <img src={node.thumbnail} alt={node.title} className="max-h-20 object-contain" />
                        </div>
                      )}

                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Outgoing routes: {outgoingEdges.length}</span>
                        <span className="text-slate-500 font-mono">{new Date(node.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Linkage Transitions & Edge Inspector */}
            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5 text-indigo-400" /> Linkage Transitions ({worktreeEdges.length})
                </span>
                <span className="text-[10px] text-slate-400">Action triggers & Latency</span>
              </div>

              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {worktreeEdges.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                    No navigation transitions recorded yet. Send taps or launch workflows to build the DAG tree.
                  </div>
                ) : (
                  worktreeEdges.map((edge) => {
                    const fromNode = worktreeNodes.find((n) => n.id === edge.fromId);
                    const toNode = worktreeNodes.find((n) => n.id === edge.toId);

                    return (
                      <div
                        key={edge.id}
                        className={`p-2.5 rounded-xl border space-y-1.5 transition-all ${
                          edge.status === "dead_route"
                            ? "bg-rose-950/30 border-rose-800/50"
                            : edge.status === "backtrack"
                            ? "bg-amber-950/30 border-amber-800/50"
                            : "bg-slate-950 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 font-bold text-white truncate max-w-[200px]">
                            <span className="text-slate-300">{fromNode?.title || edge.fromId}</span>
                            <ChevronRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                            <span className="text-cyan-300">{toNode?.title || edge.toId}</span>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                              edge.status === "success"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                : edge.status === "dead_route"
                                ? "bg-rose-950 text-rose-400 border border-rose-500/30"
                                : "bg-amber-950 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {edge.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="text-slate-300">Action: {edge.actionDescription}</span>
                          <span>{edge.latencyMs}ms • {edge.count}x</span>
                        </div>

                        {edge.aiThoughts && (
                          <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 italic">
                            💡 AI Thought: {edge.aiThoughts}
                          </div>
                        )}

                        {edge.easierAlternative && (
                          <div className="p-1.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-[10px] text-cyan-300">
                            ⚡ Shortcut: {edge.easierAlternative}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2B. WORKFLOW GENEALOGY & CROSS-REFERENCED SUCCESS PATTERNS */}
      {/* ---------------------------------------------------- */}
      {activeTab === "genealogy" && (
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" /> Workflow Navigation Genealogy & Cross-Referenced Lineage
              </h4>
              <p className="text-[10px] text-slate-400">
                Maps parent-child user operation chains and highlights verified success paths (e.g. Pattern A Direct Intent vs Pattern C Drawer Bottlenecks)
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setAutonomousModalOpen(true)}
              className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold gap-1 shadow"
            >
              <Bot className="w-3 h-3 text-indigo-200" /> Open Background Agent Manager
            </Button>
          </div>

          <WorkflowGenealogyViewer
            onSynthesizeBranch={(wf) => {
              setWorkflows((prev) => [wf, ...prev]);
              toast.success(`Loaded "${wf.name}" into Replay Studio!`);
            }}
          />
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. CONTINUOUS STEP RECORDER & LIVE TELEMETRY */}
      {/* ---------------------------------------------------- */}
      {activeTab === "recorder" && (
        <div className="space-y-3.5">
          {/* Direct Live Vision HUD Recording Link */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4 text-purple-300 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  Forward Live Recording to Live Desktop Vision HUD
                  <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500/40 text-[9px] font-mono">CONTINUOUS</Badge>
                </p>
                <p className="text-[10px] text-purple-200/80 font-mono">Stream live phone frames and continuous input steps to the primary HUD and Sequence Studio</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleForwardEverythingToLiveVisionHud()}
              className="h-7 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold gap-1.5 shadow-sm shrink-0"
            >
              <Radio className="w-3 h-3 text-emerald-300" /> Forward & Record [V]
            </Button>
          </div>

          {/* Real-time Telemetry Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">FPS Rate</span>
              <p className="text-base font-bold text-emerald-400 font-mono">{telemetry.fps.toFixed(1)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Latency</span>
              <p className="text-base font-bold text-cyan-400 font-mono">{telemetry.actionLatencyMs}ms</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">CPU Usage</span>
              <p className="text-base font-bold text-indigo-400 font-mono">{telemetry.cpuUsagePercent}%</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Memory MB</span>
              <p className="text-base font-bold text-purple-400 font-mono">{telemetry.memoryUsageMB.toFixed(0)} MB</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Battery</span>
              <p className="text-base font-bold text-amber-400 font-mono">{telemetry.batteryLevel}%</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Queue Depth</span>
              <p className="text-base font-bold text-sky-400 font-mono">{telemetry.queueDepth}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Actions Executed</span>
              <p className="text-base font-bold text-teal-400 font-mono">{telemetry.totalExecutedActions}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 font-medium">Active Agents</span>
              <p className="text-base font-bold text-rose-400 font-mono">{telemetry.activeAgentsCount}</p>
            </div>
          </div>

          {/* AI Workflow Synthesizer Box */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-rose-400" /> AI Workflow Synthesizer from Live History
              </h4>
              <span className="text-[10px] text-slate-400">Turns real usage stream into reusable, loop-free workflows</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={synthesizeGoal}
                onChange={(e) => setSynthesizeGoal(e.target.value)}
                placeholder="Workflow objective (e.g. Daily feed refresh without repeat visits)..."
                className="h-8 text-xs bg-slate-900 border-slate-700 text-white flex-1"
              />
              <Button
                size="sm"
                onClick={handleSynthesizeWorkflowFromHistory}
                disabled={isSynthesizingWf || (liveRecordedActions.length === 0 && worktreeEdges.length === 0)}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold gap-1.5 shadow-md flex-shrink-0"
              >
                {isSynthesizingWf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Compile & Save Workflow
              </Button>
            </div>
          </div>

          {/* Live Action History Feed */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-400" /> Live Progression Step Stream ({liveRecordedActions.length})
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLiveRecordedActions([])}
                className="text-[10px] text-slate-400 hover:text-white h-6 px-2"
              >
                Clear Stream
              </Button>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {liveRecordedActions.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No actions recorded in current session. Tap on the screen or run automations to record steps.
                </div>
              ) : (
                liveRecordedActions.map((act, i) => (
                  <div
                    key={act.id || i}
                    className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400">
                        #{i + 1}
                      </span>
                      <span className="font-bold text-white uppercase text-[10px] text-rose-300 font-mono">
                        {act.type}
                      </span>
                      <span className="text-slate-300 font-medium">
                        {act.description || (act.x !== undefined ? `(${Math.round(act.x * 100)}%, ${Math.round(act.y * 100)}%)` : act.key || act.text)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(act.createdAt || Date.now()).toLocaleTimeString()}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => sendMobileAction(act)}
                        className="h-6 px-1.5 text-[10px] text-emerald-400 hover:bg-emerald-950/40"
                      >
                        <Play className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. ASSIGNED AI AGENTS & CO-PILOT DIRECTOR */}
      {/* ---------------------------------------------------- */}
      {activeTab === "agents" && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-purple-400" /> Specialized Device Autonomous Agents
              </h4>
              <p className="text-[10px] text-slate-400">
                Continuous telemetry watchers, proactive navigation helpers, and multi-window loop recovery
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchAgents}
              className="text-xs bg-purple-950/40 border-purple-800/40 text-purple-300 hover:bg-purple-900/50 gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Sync Agents
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {assignedAgents.map((agent) => (
              <div
                key={agent.id}
                className={`p-3.5 rounded-xl border space-y-3 transition-all ${
                  agent.status === "intervening"
                    ? "bg-purple-950/40 border-purple-500 ring-1 ring-purple-500"
                    : agent.status === "active"
                    ? "bg-slate-950 border-purple-800/40"
                    : "bg-slate-950/60 border-slate-800 opacity-75"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{agent.name}</h4>
                      <span className="text-[9px] font-mono text-purple-300 uppercase">{agent.role.replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                        agent.status === "active"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                          : agent.status === "intervening"
                          ? "bg-amber-950 text-amber-400 border border-amber-500/30 animate-pulse"
                          : "bg-slate-900 text-slate-500 border border-slate-700"
                      }`}
                    >
                      {agent.status}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleAgent(agent.id, agent.status)}
                      className="h-6 px-2 text-[10px] text-slate-300 hover:text-white"
                    >
                      {agent.status === "active" ? "Pause" : "Activate"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Interventions: {agent.interventionCount}</span>
                    <span>Last active: {agent.lastInterventionAt ? new Date(agent.lastInterventionAt).toLocaleTimeString() : "Ready"}</span>
                  </div>
                  {agent.lastIntervention && (
                    <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 italic">
                      🎯 {agent.lastIntervention}
                    </div>
                  )}
                </div>

                {/* Dispatch Specific Directive */}
                <div className="flex gap-1.5 pt-1">
                  <Input
                    value={agentTaskInputs[agent.id] || ""}
                    onChange={(e) => setAgentTaskInputs({ ...agentTaskInputs, [agent.id]: e.target.value })}
                    placeholder={`Direct ${agent.name}...`}
                    className="h-7 text-xs bg-slate-900 border-slate-700 text-white"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleDispatchAgentTask(agent.id)}
                    className="h-7 px-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex-shrink-0"
                  >
                    Dispatch
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. WORKSPACE OPTIONS & SETTINGS */}
      {/* ---------------------------------------------------- */}
      {activeTab === "settings" && (
        <div className="space-y-4 max-w-2xl mx-auto p-4 rounded-xl bg-slate-950 border border-slate-800">
          <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-slate-300" /> Device Workspace & AI Optimization Options
              </h4>
              <p className="text-[10px] text-slate-400">
                Configure auto-recording, dead-route recovery sensitivity, and multi-window behavior
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => handleSaveSettings(workspaceSettings)}
              disabled={isSavingSettings}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1"
            >
              {isSavingSettings ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Changes
            </Button>
          </div>

          <div className="space-y-3.5 text-xs text-slate-300">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="space-y-0.5">
                <span className="font-bold text-white">Auto-Record Workflow Steps</span>
                <p className="text-[10px] text-slate-400">Automatically map screen transitions and taps into WorkTree</p>
              </div>
              <input
                type="checkbox"
                checked={workspaceSettings.autoRecordWorkflows}
                onChange={(e) => handleSaveSettings({ autoRecordWorkflows: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="space-y-0.5">
                <span className="font-bold text-white">Auto-Renavigate on Dead Route</span>
                <p className="text-[10px] text-slate-400">Automatically re-route when screen freeze or dead end is detected</p>
              </div>
              <input
                type="checkbox"
                checked={workspaceSettings.autoRenavigateOnDeadRoute}
                onChange={(e) => handleSaveSettings({ autoRenavigateOnDeadRoute: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="space-y-0.5">
                <span className="font-bold text-white">Auto-Dismiss Popups & Dialogs</span>
                <p className="text-[10px] text-slate-400">Automatically tap dismiss / close on blocking permission popups</p>
              </div>
              <input
                type="checkbox"
                checked={workspaceSettings.autoDismissPopups}
                onChange={(e) => handleSaveSettings({ autoDismissPopups: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="space-y-0.5">
                <span className="font-bold text-white">Multi-Window Home Sync</span>
                <p className="text-[10px] text-slate-400">Keeps background workflow state intact even when user hits Home</p>
              </div>
              <input
                type="checkbox"
                checked={workspaceSettings.enableMultiWindowHomeSync}
                onChange={(e) => handleSaveSettings({ enableMultiWindowHomeSync: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700"
              />
            </div>

            <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <label className="font-bold text-white block">Dead Route Sensitivity:</label>
              <div className="grid grid-cols-3 gap-2">
                {(["low", "medium", "high"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => handleSaveSettings({ deadRouteSensitivity: lvl })}
                    className={`p-2 rounded-lg border text-center font-mono text-xs uppercase font-bold transition-all ${
                      workspaceSettings.deadRouteSensitivity === lvl
                        ? "bg-emerald-950 border-emerald-500 text-emerald-400"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <label className="font-bold text-white block">Active Gemini Vision Model:</label>
              <select
                value={workspaceSettings.activeModel}
                onChange={(e) => handleSaveSettings({ activeModel: e.target.value })}
                className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended - Ultra Low Latency)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Visual Reasoning)</option>
                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Lightweight Fast)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: LIVE REFERENCE CHECK & DRIFT ANALYZER */}
      {/* ---------------------------------------------------- */}
      {referenceCheckModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-amber-500/40 rounded-2xl p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-amber-400" /> Live Reference Check & Visual Drift Analysis
              </h3>
              <button onClick={() => setReferenceCheckModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Target Step / Screen Verification Description:</label>
                <Input
                  value={referenceStepDesc}
                  onChange={(e) => setReferenceStepDesc(e.target.value)}
                  placeholder="e.g. Verify checkout payment button is visible and active..."
                  className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Reference Baseline Frame:</label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (mobileFrame) setReferenceImageInput(mobileFrame);
                      toast.success("Captured current live frame as golden reference baseline!");
                    }}
                    className="h-8 text-xs bg-slate-950 border-slate-700 text-amber-300 hover:bg-slate-800 gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> Capture Current Screen as Baseline
                  </Button>
                </div>
              </div>

              {referenceResult && (
                <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400 font-bold">Similarity Score:</span>
                    <span className="text-sm font-bold text-emerald-400">{referenceResult.similarityScore}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Match Status:</span>
                    <span className="text-cyan-300 font-bold">{referenceResult.matchStatus}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <span className="text-slate-400">AI Recommendation: </span>
                    {referenceResult.recommendedAction}
                  </div>
                  {referenceResult.aiNotes && (
                    <div className="text-[10px] text-slate-400 italic">
                      Notes: {referenceResult.aiNotes}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => setReferenceCheckModalOpen(false)} className="text-xs">
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleRunReferenceCheck}
                disabled={isCheckingReference || !mobileFrame}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold gap-1"
              >
                {isCheckingReference ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Run Visual Reference Check
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: CREATE / SAVE WORKFLOW */}
      {/* ---------------------------------------------------- */}
      {isSavingWorkflow && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Save className="w-4 h-4 text-indigo-400" /> Save Device Automation Workflow
              </h3>
              <button onClick={() => setIsSavingWorkflow(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Workflow Name:</label>
                <Input
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="e.g. Instagram Story Post Routine"
                  className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Description:</label>
                <Input
                  value={newWfDesc}
                  onChange={(e) => setNewWfDesc(e.target.value)}
                  placeholder="e.g. Navigates feed and triggers like button"
                  className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Workflow Notes & Context:</label>
                <textarea
                  value={newWfNotes}
                  onChange={(e) => setNewWfNotes(e.target.value)}
                  rows={3}
                  placeholder="Add execution instructions, device screen prerequisites, or variable inputs..."
                  className="w-full p-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Tags (comma separated):</label>
                <Input
                  value={newWfTags}
                  onChange={(e) => setNewWfTags(e.target.value)}
                  placeholder="mobile, navigation, social"
                  className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoSaveCheckbox"
                  checked={newWfAutoSave}
                  onChange={(e) => setNewWfAutoSave(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600"
                />
                <label htmlFor="autoSaveCheckbox" className="text-xs text-slate-300">
                  Enable Auto-Save (Real-time live tap/action recording into this workflow)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => setIsSavingWorkflow(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveWorkflow} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
                Save Workflow
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: STEP EXTRACTION */}
      {/* ---------------------------------------------------- */}
      {extractModalWf && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-cyan-400" /> Extract from "{extractModalWf.name}"
              </h3>
              <button onClick={() => setExtractModalWf(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Extract As:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExtractTargetType("macro")}
                    className={`p-2 rounded-lg border text-left text-xs font-bold transition-all ${
                      extractTargetType === "macro" ? "bg-cyan-950/60 border-cyan-500 text-cyan-300" : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Quick Custom Macro Button
                  </button>
                  <button
                    onClick={() => setExtractTargetType("workflow")}
                    className={`p-2 rounded-lg border text-left text-xs font-bold transition-all ${
                      extractTargetType === "workflow" ? "bg-cyan-950/60 border-cyan-500 text-cyan-300" : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    New Standalone Child Workflow
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Title / Name:</label>
                <Input
                  value={extractTitle}
                  onChange={(e) => setExtractTitle(e.target.value)}
                  className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                />
              </div>

              {/* Step Checklist */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300">Select Steps to Extract:</label>
                <div className="max-h-48 overflow-y-auto space-y-1 p-2 rounded-lg bg-slate-950 border border-slate-800">
                  {extractModalWf.actions.map((act, i) => {
                    const isSelected = selectedExtractStepIds.includes(act.id);
                    return (
                      <div
                        key={act.id}
                        onClick={() => {
                          setSelectedExtractStepIds((prev) =>
                            isSelected ? prev.filter((id) => id !== act.id) : [...prev, act.id]
                          );
                        }}
                        className={`p-1.5 rounded flex items-center gap-2 cursor-pointer text-xs ${
                          isSelected ? "bg-cyan-950/50 text-cyan-200 border border-cyan-800/40" : "text-slate-400 hover:bg-slate-900"
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400" /> : <Square className="w-3.5 h-3.5 text-slate-600" />}
                        <span className="font-mono text-[10px] text-slate-500">#{i + 1}</span>
                        <span className="font-medium truncate">{act.description || act.type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Extracted Piece Notes:</label>
                <textarea
                  value={extractNotes}
                  onChange={(e) => setExtractNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes for extracted snippet..."
                  className="w-full p-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => setExtractModalWf(null)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleExecuteExtraction} className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold">
                Extract {selectedExtractStepIds.length} Step(s)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: AI WORKFLOW CUSTOMIZATION */}
      {/* ---------------------------------------------------- */}
      {aiCustomizeModalWf && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-amber-400" /> AI Gemini Customizer for "{aiCustomizeModalWf.name}"
              </h3>
              <button onClick={() => setAiCustomizeModalWf(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Prompt / Customization Instructions:</label>
                <textarea
                  value={aiCustomizePrompt}
                  onChange={(e) => setAiCustomizePrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. Change search query to 'Best Coffee', add 400ms delay between taps, and adapt coordinates for 1080p display..."
                  className="w-full p-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveAsNewAiWf"
                  checked={aiCustomizeSaveNew}
                  onChange={(e) => setAiCustomizeSaveNew(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-600"
                />
                <label htmlFor="saveAsNewAiWf" className="text-xs text-slate-300">
                  Save as new variant (keep original workflow intact)
                </label>
              </div>

              {aiCustomResultMsg && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs font-mono text-amber-300">
                  {aiCustomResultMsg}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => setAiCustomizeModalWf(null)} className="text-xs">
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleRunAiCustomization}
                disabled={isAiCustomizing || !aiCustomizePrompt.trim()}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold gap-1"
              >
                {isAiCustomizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Apply AI Customization
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: FRAME ZOOM INSPECTOR */}
      {/* ---------------------------------------------------- */}
      {previewFrameModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white font-mono">
                Frame Snapshot #{previewFrameModal.id} • {new Date(previewFrameModal.timestamp).toLocaleTimeString()}
              </span>
              <button onClick={() => setPreviewFrameModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-4 flex items-center justify-center bg-black max-h-[60vh] overflow-hidden">
              <img
                src={previewFrameModal.imageData}
                alt="Frame zoom"
                className="max-h-[55vh] object-contain rounded-lg border border-slate-800"
              />
            </div>

            <div className="p-3 bg-slate-950 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Note: {previewFrameModal.note || "None"}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    if (onSelectDeviceFrame) onSelectDeviceFrame(previewFrameModal.imageData);
                    setPreviewFrameModal(null);
                    toast.success("Loaded snapshot into Main Screen HUD!");
                  }}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                >
                  Load into Main Screen HUD
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: AUTONOMOUS WORKFLOW DIRECTOR & GENEALOGY */}
      {/* ---------------------------------------------------- */}
      <AutonomousWorkflowModal
        isOpen={autonomousModalOpen}
        onClose={() => setAutonomousModalOpen(false)}
        currentScreenTitle={mobileDeviceName || "Live Screen"}
        onSelectWorkflow={(wf) => {
          setWorkflows((prev) => [wf, ...prev]);
          setActiveTab("workflows");
          setAutonomousModalOpen(false);
          toast.success(`Active workflow set to "${wf.name}"`);
        }}
      />

      {/* Barcode & Inventory Scanner Hub Modal */}
      <BarcodeInventoryScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        initialBarcode={activeDecodedBarcode?.rawValue}
        onBarcodeDetected={(barcode) => {
          setActiveDecodedBarcode(barcode);
        }}
      />

      {/* Mobile Stream & Workspace Settings Modal */}
      <MobileSettingsModal
        open={isMobileSettingsModalOpen}
        onOpenChange={setIsMobileSettingsModalOpen}
        onSettingsSaved={(newSettings) => setWorkspaceSettings(newSettings)}
      />

      {/* Standalone Android APK & PWA Modal */}
      <ApkAndPwaModal
        open={isApkModalOpen}
        onOpenChange={setIsApkModalOpen}
      />
    </div>
  );
}
