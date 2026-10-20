import { evaluateCalculator } from "@/lib/calculator";
import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Globe,
  Camera,
  Settings,
  Calculator,
  FileText,
  Video,
  Music,
  Bell,
  ArrowLeft,
  Home,
  Layers,
  Volume2,
  Volume1,
  Lock,
  Wifi,
  Battery,
  Sparkles,
  Check,
  Plus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Shield,
  Smartphone,
  Terminal,
  Folder,
  Image as ImageIcon,
  Send,
  Sliders,
  Scan,
  Barcode,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { recordBarcodeScan, lookupBarcodeItem, playScanBeep } from "@/lib/barcode-scanner";

export interface VirtualPhoneState {
  activeApp:
    | "home"
    | "chrome"
    | "calculator"
    | "settings"
    | "notes"
    | "camera"
    | "youtube"
    | "spotify"
    | "terminal"
    | "files"
    | "overview"
    | "scanner";
  isNotificationsOpen: boolean;
  chromeUrl: string;
  chromeSearch: string;
  calcDisplay: string;
  calcHistory: string[];
  notesList: Array<{ id: string; title: string; body: string; time: string }>;
  activeNoteId: string | null;
  settings: {
    wifi: boolean;
    bluetooth: boolean;
    darkMode: boolean;
    aiCopilot: boolean;
    autoRecord: boolean;
    volume: number;
    brightness: number;
  };
  cameraSnapped: boolean;
  batteryLevel: number;
  currentTime: string;
}

interface InteractivePhoneVirtualOSProps {
  onStateChange?: (state: VirtualPhoneState) => void;
  onActionLogged?: (action: string, details: string) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  externalTextInjection?: string;
  currentStepAction?: {
    id?: string;
    action?: string;
    x?: number;
    y?: number;
    text?: string;
    name?: string;
    targetApp?: string;
  } | null;
  forwardTrigger?: number;
  className?: string;
}

export const InteractivePhoneVirtualOS: React.FC<InteractivePhoneVirtualOSProps> = ({
  onStateChange,
  onActionLogged,
  onContextMenu,
  externalTextInjection,
  currentStepAction,
  forwardTrigger = 0,
  className = "",
}) => {
  const [activeApp, setActiveApp] = useState<VirtualPhoneState["activeApp"]>("home");
  const [navStack, setNavStack] = useState<Array<VirtualPhoneState["activeApp"]>>(["home"]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [touchRipples, setTouchRipples] = useState<Array<{ id: string; x: number; y: number }>>([]);

  // Multi-Level Navigation History States
  const [chromeUrl, setChromeUrl] = useState("https://google.com");
  const [chromeSearch, setChromeSearch] = useState("AI Automation Agents");
  const [chromeHistoryStack, setChromeHistoryStack] = useState<string[]>(["https://google.com"]);
  const [notesViewMode, setNotesViewMode] = useState<"list" | "detail">("detail");
  const [activeSettingsSubPage, setActiveSettingsSubPage] = useState<string | null>(null);

  // App specific states
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcHistory, setCalcHistory] = useState<string[]>([]);
  const [notesList, setNotesList] = useState([
    { id: "note-1", title: "Automation Checklist", body: "1. Calibrate coordinates\n2. Verify input response\n3. Run self-healing test", time: "10:45 AM" },
    { id: "note-2", title: "API Configuration", body: "Ollama Qwen 3.5 2B @ https://quantumclaw.net/ollama/api/chat", time: "11:12 AM" },
  ]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>("note-1");
  const [activeNoteBody, setActiveNoteBody] = useState("");

  // YouTube / Media state
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytSearch, setYtSearch] = useState("Sightline Vision AI Demo");

  // Music state
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [activeTrack, setActiveTrack] = useState("Synthetic Cognition - Synthwave");

  // Terminal state
  const [termInput, setTermInput] = useState("");
  const [termLogs, setTermLogs] = useState<string[]>([
    "adb shell input keyevent KEYCODE_HOME",
    "android:sightline_os v2.6.4 (ARM64_V8A) initialized",
    "Display: 1080x1920 @ 60Hz calibrated",
    "Type command e.g. 'pm list', 'getprop', 'ping'...",
  ]);

  const [settings, setSettings] = useState({
    wifi: true,
    bluetooth: true,
    darkMode: true,
    aiCopilot: true,
    autoRecord: true,
    volume: 80,
    brightness: 90,
  });
  const [cameraSnapped, setCameraSnapped] = useState(false);
  const [currentTime, setCurrentTime] = useState("10:42");

  // Barcode Scanner state in virtual phone
  const [phoneScannedBarcode, setPhoneScannedBarcode] = useState<string | null>("8901030865412");
  const [phoneScannedItem, setPhoneScannedItem] = useState<{
    name: string;
    sku: string;
    quantity: number;
    category: string;
    price: number;
  } | null>({
    name: "Industrial 2D Barcode Scanner Zebra DS2208",
    sku: "SKU-ZEBRA-2208",
    quantity: 18,
    category: "Hardware",
    price: 189.5,
  });
  const [phoneBarcodeHistory, setPhoneBarcodeHistory] = useState<Array<{ code: string; name: string; time: string }>>([
    { code: "8901030865412", name: "Zebra DS2208 Scanner", time: "12:40 PM" },
    { code: "012345678905", name: "Logitech MX Master 3S", time: "11:15 AM" },
    { code: "PKG-99201-US", name: "Thermal Paper Rolls", time: "10:32 AM" },
  ]);

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Emit state changes to parent controller, backend & window events for bidirectional sync
  useEffect(() => {
    const currentState = {
      activeApp,
      isNotificationsOpen,
      chromeUrl,
      chromeSearch,
      calcDisplay,
      calcHistory,
      notesList,
      activeNoteId,
      settings,
      cameraSnapped,
      batteryLevel: 98,
      currentTime,
    };

    if (onStateChange) {
      onStateChange(currentState);
    }

    // Broadcast locally so other components/tabs reflect instantly
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("sightline-virtual-os-sync", {
          detail: {
            activeApp,
            chromeUrl,
            chromeQuery: chromeSearch,
            calcDisplay,
            notesContent: notesList.map((n) => `• ${n.title}: ${n.body}`).join("\n"),
            settingsWifi: settings.wifi,
            settingsBluetooth: settings.bluetooth,
          },
        })
      );
    }

    // Sync to backend shared state
    fetch("/api/virtual-os/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeApp,
        chromeUrl,
        chromeQuery: chromeSearch,
        calcDisplay,
        notesContent: notesList.map((n) => `• ${n.title}: ${n.body}`).join("\n"),
        settingsWifi: settings.wifi,
        settingsBluetooth: settings.bluetooth,
      }),
    }).catch(() => {});
  }, [
    activeApp,
    isNotificationsOpen,
    chromeUrl,
    chromeSearch,
    calcDisplay,
    calcHistory,
    notesList,
    activeNoteId,
    settings,
    cameraSnapped,
    currentTime,
    onStateChange,
  ]);

  // Listen for external sync from MobileRemote or other components
  useEffect(() => {
    const handleExternalSync = (e: any) => {
      const d = e.detail;
      if (!d) return;
      if (d.activeApp && d.activeApp !== activeApp) {
        setActiveApp(d.activeApp);
      }
      if (d.chromeUrl && d.chromeUrl !== chromeUrl) {
        setChromeUrl(d.chromeUrl);
      }
      if (d.chromeQuery && d.chromeQuery !== chromeSearch) {
        setChromeSearch(d.chromeQuery);
      }
      if (d.calcDisplay && d.calcDisplay !== calcDisplay) {
        setCalcDisplay(d.calcDisplay);
      }
    };

    window.addEventListener("sightline-virtual-os-sync", handleExternalSync);

    // Fast polling backend for multi-client / mobile remote updates
    const pollInterval = window.setInterval(async () => {
      try {
        const res = await fetch("/api/virtual-os/state");
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.state) {
            const st = json.state;
            if (st.activeApp && st.activeApp !== activeApp) {
              setActiveApp(st.activeApp);
            }
            if (st.chromeUrl && st.chromeUrl !== chromeUrl) {
              setChromeUrl(st.chromeUrl);
            }
            if (st.chromeQuery && st.chromeQuery !== chromeSearch) {
              setChromeSearch(st.chromeQuery);
            }
            if (st.calcDisplay && st.calcDisplay !== calcDisplay) {
              setCalcDisplay(st.calcDisplay);
            }
          }
        }
      } catch {}
    }, 400);

    return () => {
      window.removeEventListener("sightline-virtual-os-sync", handleExternalSync);
      clearInterval(pollInterval);
    };
  }, [activeApp, chromeUrl, chromeSearch, calcDisplay]);

  const handleHome = () => {
    setIsNotificationsOpen(false);
    setActiveSettingsSubPage(null);
    setNotesViewMode("list");
    setActiveApp("home");
    setNavStack(["home"]);
    onActionLogged?.("BUTTON", "Pressed Home (Returned to Main Menu / Launcher)");
    toast.success("🏠 Main Menu / Home Launcher Active");
  };

  // Listen for global navigate home and reset app state events
  useEffect(() => {
    const handleGlobalHome = () => {
      handleHome();
    };
    window.addEventListener("sightline-navigate-home", handleGlobalHome);
    return () => window.removeEventListener("sightline-navigate-home", handleGlobalHome);
  }, []);

  // React to Step Forwarding and Current Sequence Actions to visibly mutate template
  useEffect(() => {
    if (!currentStepAction && !forwardTrigger) return;
    const actionText = (currentStepAction?.name || currentStepAction?.text || "").toLowerCase();
    const actionType = (currentStepAction?.action || "").toLowerCase();

    // 1. Home / Main Menu Navigation
    if (
      actionText.includes("home") ||
      actionText.includes("main menu") ||
      actionText.includes("launcher") ||
      actionText.includes("minimize") ||
      actionType === "home" ||
      actionType === "main_menu"
    ) {
      handleHome();
      onActionLogged?.("NAVIGATE_HOME", "AI Navigated to Phone Main Menu / Home Launcher");
      return;
    }

    // 2. Back Navigation (Page Back, Menu Back, History Back)
    if (
      actionText.includes("back") ||
      actionText.includes("previous") ||
      actionText.includes("return") ||
      actionText.includes("page back") ||
      actionType === "back" ||
      actionType === "navigate_back"
    ) {
      handleBack();
      onActionLogged?.("NAVIGATE_BACK", "AI Triggered Back Navigation");
      return;
    }

    // 3. Calculator actions
    if (actionText.includes("calc") || actionText.includes("math")) {
      setActiveApp("calculator");
      if (currentStepAction?.text) {
        handleCalcInput(currentStepAction.text);
      }
      onActionLogged?.("STEP_FORWARD", `Forwarded to Calculator: ${currentStepAction?.text || "Open"}`);
    }
    // 4. Chrome / Search actions
    else if (actionText.includes("chrome") || actionText.includes("search") || actionText.includes("browser") || actionText.includes("web") || actionText.includes("url")) {
      setActiveApp("chrome");
      if (currentStepAction?.text) {
        setChromeSearch(currentStepAction.text);
        const newUrl = `https://google.com/search?q=${encodeURIComponent(currentStepAction.text)}`;
        setChromeUrl(newUrl);
        setChromeHistoryStack((prev) => [...prev, newUrl]);
      }
      onActionLogged?.("STEP_FORWARD", `Forwarded to Chrome: ${currentStepAction?.text || "Open"}`);
    }
    // 5. Notes actions
    else if (actionText.includes("note") || actionText.includes("write") || actionText.includes("text editor")) {
      setActiveApp("notes");
      if (currentStepAction?.text) {
        setActiveNoteBody((prev) => (prev ? prev + "\n" + currentStepAction.text : currentStepAction.text!));
      }
      onActionLogged?.("STEP_FORWARD", `Forwarded to Notes: ${currentStepAction?.text || "Open"}`);
    }
    // 6. Settings actions
    else if (actionText.includes("setting") || actionText.includes("wifi") || actionText.includes("bluetooth") || actionText.includes("copilot")) {
      setActiveApp("settings");
      if (actionText.includes("wifi")) {
        setSettings((prev) => ({ ...prev, wifi: !prev.wifi }));
      } else if (actionText.includes("bluetooth")) {
        setSettings((prev) => ({ ...prev, bluetooth: !prev.bluetooth }));
      }
      onActionLogged?.("STEP_FORWARD", "Forwarded to Settings");
    }
    // 7. Camera actions
    else if (actionText.includes("camera") || actionText.includes("photo") || actionText.includes("snap")) {
      setActiveApp("camera");
      setCameraSnapped(true);
      onActionLogged?.("STEP_FORWARD", "Forwarded to Camera & Snapped Photo");
    }
    // 8. YouTube actions
    else if (actionText.includes("youtube") || actionText.includes("video")) {
      setActiveApp("youtube");
      setYtPlaying(true);
      onActionLogged?.("STEP_FORWARD", "Forwarded to YouTube Video Player");
    }
    // 9. Music / Spotify actions
    else if (actionText.includes("music") || actionText.includes("spotify") || actionText.includes("audio")) {
      setActiveApp("spotify");
      setMusicPlaying(true);
      onActionLogged?.("STEP_FORWARD", "Forwarded to Music Player");
    }
    // 10. Terminal actions
    else if (actionText.includes("terminal") || actionText.includes("shell") || actionText.includes("command")) {
      setActiveApp("terminal");
      if (currentStepAction?.text) {
        setTermLogs((prev) => [...prev, `$ ${currentStepAction.text}`, "Command executed successfully."]);
      }
      onActionLogged?.("STEP_FORWARD", "Forwarded to Terminal");
    }
    // 11. Generic Typing into active app
    else if (currentStepAction?.text && (actionType === "type" || actionType === "type_text" || actionType === "clear_and_type")) {
      if (activeApp === "chrome") {
        setChromeSearch(currentStepAction.text);
      } else if (activeApp === "notes") {
        setActiveNoteBody((prev) => (prev ? prev + " " + currentStepAction.text : currentStepAction.text!));
      } else if (activeApp === "calculator") {
        handleCalcInput(currentStepAction.text);
      } else if (activeApp === "terminal") {
        setTermLogs((prev) => [...prev, `$ ${currentStepAction.text}`, "Execution confirmed."]);
      }
      onActionLogged?.("STEP_FORWARD", `Typed "${currentStepAction.text}" into active ${activeApp}`);
    }
  }, [currentStepAction, forwardTrigger]);

  // Listen for reset app state event to provide clean baseline for test mode & AI CoT
  useEffect(() => {
    const handleReset = () => {
      setActiveApp("home");
      setNavStack(["home"]);
      setIsNotificationsOpen(false);
      setCalcDisplay("0");
      setCalcHistory([]);
      setChromeSearch("AI Automation Agents");
      setChromeUrl("https://google.com");
      setChromeHistoryStack(["https://google.com"]);
      setNotesViewMode("list");
      setActiveSettingsSubPage(null);
      setActiveNoteBody("");
      setCameraSnapped(false);
      onActionLogged?.("TEST_MODE", "Reset Virtual Phone OS to baseline clean state");
      toast.info("📱 Phone OS state reset to clean baseline (Home Launcher)");
    };
    window.addEventListener("sightline-reset-app-state", handleReset);
    return () => window.removeEventListener("sightline-reset-app-state", handleReset);
  }, []);

  // Listen for external hardware / typing actions dispatched from HUD or Deck
  useEffect(() => {
    if (!externalTextInjection) return;
    if (activeApp === "chrome") {
      setChromeSearch((prev) => prev + externalTextInjection);
    } else if (activeApp === "notes") {
      setActiveNoteBody((prev) => prev + externalTextInjection);
    } else if (activeApp === "calculator") {
      handleCalcInput(externalTextInjection);
    } else if (activeApp === "terminal") {
      setTermLogs((prev) => [...prev, `$ ${externalTextInjection}`, "Output acknowledged."]);
    }
  }, [externalTextInjection]);

  // Sync state upward
  useEffect(() => {
    onStateChange?.({
      activeApp,
      isNotificationsOpen,
      chromeUrl,
      chromeSearch,
      calcDisplay,
      calcHistory,
      notesList,
      activeNoteId,
      settings,
      cameraSnapped,
      batteryLevel: 96,
      currentTime,
    });
  }, [activeApp, isNotificationsOpen, chromeUrl, chromeSearch, calcDisplay, notesList, settings, cameraSnapped, currentTime]);

  // Touch Ripple Animation Trigger
  const triggerTouchFeedback = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = `touch_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    setTouchRipples((prev) => [...prev.slice(-6), { id, x, y }]);
    setTimeout(() => {
      setTouchRipples((prev) => prev.filter((r) => r.id !== id));
    }, 500);
  };

  // Navigation Helpers
  const openApp = (app: VirtualPhoneState["activeApp"], label: string) => {
    setActiveApp(app);
    setNavStack((prev) => [...prev, app]);
    setIsNotificationsOpen(false);
    onActionLogged?.("APP_LAUNCH", `Opened ${label}`);
    toast.success(`📱 Opened ${label}`);
  };

  const handleBack = () => {
    // Level 1: Close Notifications
    if (isNotificationsOpen) {
      setIsNotificationsOpen(false);
      onActionLogged?.("NAVIGATE", "Closed Notifications Shade");
      return;
    }

    // Level 2: Inside Chrome Browser history back
    if (activeApp === "chrome") {
      if (chromeHistoryStack.length > 1) {
        const updatedHistory = [...chromeHistoryStack];
        updatedHistory.pop();
        const prevUrl = updatedHistory[updatedHistory.length - 1];
        setChromeHistoryStack(updatedHistory);
        setChromeUrl(prevUrl);
        setChromeSearch(prevUrl.includes("?q=") ? decodeURIComponent(prevUrl.split("?q=")[1]) : "AI Automation Agents");
        onActionLogged?.("BROWSER_BACK", `Navigated Back in Chrome to: ${prevUrl}`);
        toast.info("◀ Chrome Browser: Navigated Back a Page");
        return;
      }
    }

    // Level 3: Inside Notes detail view -> return to Notes list
    if (activeApp === "notes" && notesViewMode === "detail") {
      setNotesViewMode("list");
      onActionLogged?.("NAVIGATE", "Returned to Notes List (Main Notes Menu)");
      toast.info("◀ Returned to Notes List");
      return;
    }

    // Level 4: Inside Settings sub-page -> return to Main Settings Category Menu
    if (activeApp === "settings" && activeSettingsSubPage !== null) {
      setActiveSettingsSubPage(null);
      onActionLogged?.("NAVIGATE", "Returned to Main Settings Menu");
      toast.info("◀ Returned to Settings Menu");
      return;
    }

    // Level 5: Nav Stack Pop -> previous app or Home
    if (navStack.length > 1) {
      const newStack = [...navStack];
      newStack.pop();
      const prevApp = newStack[newStack.length - 1];
      setNavStack(newStack);
      setActiveApp(prevApp);
      onActionLogged?.("BUTTON", `Navigated Back to ${prevApp.toUpperCase()}`);
      toast.info(`◀ Navigated Back to ${prevApp.toUpperCase()}`);
    } else {
      setActiveApp("home");
      onActionLogged?.("BUTTON", "Navigated to Main Menu / Home Launcher");
      toast.info("🏠 Returned to Main Menu (Home Launcher)");
    }
  };

  const handleOverview = () => {
    setIsNotificationsOpen(false);
    setActiveApp((prev) => (prev === "overview" ? "home" : "overview"));
    onActionLogged?.("BUTTON", "Toggled App Switcher / Overview");
  };

  // Calculator Engine
  const handleCalcInput = (char: string) => {
    if (char === "C") {
      setCalcDisplay("0");
    } else if (char === "=") {
      try {
        const result = evaluateCalculator(calcDisplay);
        const resStr = String(Math.round(result * 10000) / 10000);
        setCalcHistory((prev) => [`${calcDisplay} = ${resStr}`, ...prev].slice(0, 5));
        setCalcDisplay(resStr);
        onActionLogged?.("CALCULATOR", `Calculated: ${calcDisplay} = ${resStr}`);
      } catch {
        setCalcDisplay("Error");
      }
    } else if (char === "±") {
      if (calcDisplay.startsWith("-")) {
        setCalcDisplay(calcDisplay.substring(1));
      } else if (calcDisplay !== "0") {
        setCalcDisplay("-" + calcDisplay);
      }
    } else if (char === "%") {
      try { setCalcDisplay(String(evaluateCalculator(calcDisplay) / 100)); }
      catch { setCalcDisplay("Error"); }
    } else {
      setCalcDisplay((prev) => (prev === "0" || prev === "Error" ? char : prev + char));
    }
  };

  return (
    <div
      onClick={triggerTouchFeedback}
      onContextMenu={onContextMenu}
      className={`w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none relative overflow-hidden font-sans border-0 ${className}`}
    >
      {/* Dynamic Animated Touch Ripples */}
      {touchRipples.map((r) => (
        <span
          key={r.id}
          style={{ left: r.x, top: r.y }}
          className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-cyan-400/40 border border-cyan-300 pointer-events-none animate-ping z-50"
        />
      ))}

      {/* Top Status Bar (Time, Camera Notch, WiFi, Battery) */}
      <div
        onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
        className="w-full h-7 bg-black/80 backdrop-blur-md px-4 flex items-center justify-between z-40 shrink-0 text-[10px] font-mono cursor-pointer hover:bg-black/90 transition-colors border-b border-white/5"
        title="Click / Swipe down to open Notification Shade"
      >
        <span className="font-bold text-slate-200">{currentTime}</span>

        {/* Central Camera / Dynamic Island Pill */}
        <div className="w-16 h-3.5 bg-black rounded-full border border-slate-800 flex items-center justify-center gap-1.5 px-2 shadow-inner">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/80 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
        </div>

        <div className="flex items-center gap-1.5 text-slate-300">
          <Wifi className="w-3 h-3 text-emerald-400" />
          <span className="text-[9px] font-bold">5G</span>
          <div className="flex items-center gap-0.5">
            <span className="text-[9px] font-bold">96%</span>
            <Battery className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
          </div>
        </div>
      </div>

      {/* Notification Shade Overlay */}
      {isNotificationsOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 top-7 bottom-8 bg-slate-950/95 backdrop-blur-xl z-40 p-4 flex flex-col gap-3 animate-in slide-in-from-top duration-200 border-b border-slate-800"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-400" />
              <span className="font-bold text-xs text-slate-200">Control Center & Notifications</span>
            </div>
            <button
              onClick={() => setIsNotificationsOpen(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700"
            >
              Close
            </button>
          </div>

          {/* Quick Settings Toggles */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Wi-Fi", icon: Wifi, active: settings.wifi, key: "wifi" },
              { label: "Bluetooth", icon: Sparkles, active: settings.bluetooth, key: "bluetooth" },
              { label: "AI Copilot", icon: Shield, active: settings.aiCopilot, key: "aiCopilot" },
              { label: "Auto-Rec", icon: Video, active: settings.autoRecord, key: "autoRecord" },
            ].map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  setSettings((prev) => ({ ...prev, [t.key]: !prev[t.key as keyof typeof settings] }));
                  onActionLogged?.("SETTINGS", `Toggled ${t.label}: ${!settings[t.key as keyof typeof settings]}`);
                }}
                className={`p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 font-bold text-[10px] transition-all border ${
                  t.active
                    ? "bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-950"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Notification Banners */}
          <div className="space-y-2 mt-2">
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-purple-500/30 flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-purple-300">Qwen 3.5 AI Copilot</span>
                  <span className="text-[9px] text-slate-500">Just now</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
                  Live phone state linked. Tap any app or type to execute automation workflow.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-emerald-300">Vision HUD Synchronized</span>
                  <span className="text-[9px] text-slate-500">2m ago</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
                  1080x1920 interactive viewport calibrated with 0px drift.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN SCREEN CANVAS AREA */}
      <div className="w-full flex-1 relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col">
        {/* VIEW 1: HOME LAUNCHER & APPS GRID */}
        {activeApp === "home" && (
          <div className="p-4 flex-1 flex flex-col justify-between">
            {/* Top Search Widget */}
            <div
              onClick={() => openApp("chrome", "Google Chrome")}
              className="w-full p-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-lg flex items-center justify-between text-slate-300 cursor-pointer hover:border-cyan-500 transition-all"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-slate-400">Search apps, web or ask AI...</span>
              </div>
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            </div>

            {/* Central Clock & AI Status Widget */}
            <div className="my-auto text-center py-4 space-y-1">
              <div className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
                {currentTime}
              </div>
              <div className="text-xs text-slate-400 font-mono flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Sightline Virtual Phone OS • Ready</span>
              </div>
            </div>

            {/* Comprehensive Apps Grid */}
            <div className="grid grid-cols-4 gap-3 pt-2">
              {[
                { id: "chrome", name: "Chrome", icon: Globe, color: "from-blue-600 to-cyan-600" },
                { id: "calculator", name: "Calculator", icon: Calculator, color: "from-amber-600 to-orange-600" },
                { id: "notes", name: "Notes", icon: FileText, color: "from-indigo-600 to-purple-600" },
                { id: "camera", name: "Camera", icon: Camera, color: "from-emerald-600 to-teal-600" },
                { id: "scanner", name: "Scanner", icon: Scan, color: "from-teal-600 to-emerald-600" },
                { id: "youtube", name: "YouTube", icon: Video, color: "from-red-600 to-rose-600" },
                { id: "spotify", name: "Music", icon: Music, color: "from-green-600 to-emerald-700" },
                { id: "terminal", name: "Terminal", icon: Terminal, color: "from-slate-800 to-slate-950" },
                { id: "files", name: "Files", icon: Folder, color: "from-amber-500 to-yellow-600" },
                { id: "settings", name: "Settings", icon: Settings, color: "from-slate-700 to-slate-800" },
                { id: "overview", name: "Switcher", icon: Layers, color: "from-violet-600 to-purple-700" },
              ].map((app) => (
                <button
                  key={app.id}
                  onClick={() => openApp(app.id as any, app.name)}
                  className="flex flex-col items-center gap-1 group cursor-pointer"
                >
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform border border-white/20`}>
                    <app.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[9px] font-bold text-slate-300 group-hover:text-white truncate max-w-[54px]">
                    {app.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 2: GOOGLE CHROME BROWSER */}
        {activeApp === "chrome" && (
          <div className="flex-1 flex flex-col bg-slate-900">
            {/* Chrome URL Address & Navigation Bar */}
            <div className="p-2 bg-slate-950 border-b border-slate-800 flex items-center gap-1.5">
              <button
                onClick={handleBack}
                className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
                title="Navigate Back a Page (History Back / Menu)"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleHome}
                className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
                title="Go to Main Menu / Home Launcher"
              >
                <Home className="w-4 h-4" />
              </button>
              <div className="flex-1 relative flex items-center">
                <Globe className="w-3 h-3 text-cyan-400 absolute left-2 pointer-events-none" />
                <input
                  value={chromeSearch}
                  onChange={(e) => setChromeSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const newUrl = `https://google.com/search?q=${encodeURIComponent(chromeSearch)}`;
                      setChromeUrl(newUrl);
                      setChromeHistoryStack((prev) => [...prev, newUrl]);
                      onActionLogged?.("CHROME", `Searched: "${chromeSearch}"`);
                      toast.success(`🔍 Navigated to "${chromeSearch}"`);
                    }
                  }}
                  className="w-full h-7 bg-slate-900 rounded-lg pl-7 pr-12 text-[11px] font-mono text-slate-200 border border-slate-700 focus:outline-none focus:border-cyan-500"
                  placeholder="Search or type URL..."
                />
                <button
                  onClick={() => {
                    const newUrl = `https://google.com/search?q=${encodeURIComponent(chromeSearch)}`;
                    setChromeUrl(newUrl);
                    setChromeHistoryStack((prev) => [...prev, newUrl]);
                    toast.success(`🔍 Navigated: "${chromeSearch}"`);
                  }}
                  className="absolute right-1 px-1.5 py-0.5 rounded bg-cyan-600 text-white font-bold text-[9px]"
                >
                  Go
                </button>
              </div>
            </div>

            {/* Simulated Web Page Content */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-950 font-sans">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Search Results: "{chromeSearch}"</span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono">Page 1 of {chromeHistoryStack.length}</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div
                    onClick={() => {
                      const articleUrl = `https://sightline.io/docs/vision-agent-v2`;
                      setChromeSearch("Sightline Autonomous Vision Copilot 2026 Documentation");
                      setChromeUrl(articleUrl);
                      setChromeHistoryStack((prev) => [...prev, articleUrl]);
                      toast.success("📄 Opened Article Page (Click Back to return)");
                    }}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 cursor-pointer"
                  >
                    <p className="font-bold text-cyan-300">Sightline Autonomous Vision Copilot 2026</p>
                    <p className="text-[10px] text-slate-400">High-speed GUI automation with Qwen 3.5 2B visual feedback positioning.</p>
                  </div>
                  <div
                    onClick={() => {
                      const adbUrl = `https://sightline.io/docs/adb-hardware-bridge`;
                      setChromeSearch("Android ADB & PyAutoGUI Native Subsystem Manual");
                      setChromeUrl(adbUrl);
                      setChromeHistoryStack((prev) => [...prev, adbUrl]);
                      toast.success("📄 Opened Sub-Page (Click Back to return)");
                    }}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 cursor-pointer"
                  >
                    <p className="font-bold text-cyan-300">Android ADB & PyAutoGUI Native Subsystem</p>
                    <p className="text-[10px] text-slate-400">Universal hardware interaction bridge with zero coordinate drift.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: WORKING CALCULATOR */}
        {activeApp === "calculator" && (
          <div className="flex-1 flex flex-col justify-between p-3 bg-slate-950">
            {/* Header with Back and Main Menu */}
            <div className="flex items-center justify-between pb-1 text-slate-400">
              <button onClick={handleBack} className="p-1 hover:text-white" title="Back to Previous App">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-bold text-amber-400 font-mono">CALCULATOR</span>
              <button onClick={handleHome} className="p-1 hover:text-white" title="Main Menu (Home)">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Display */}
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-right space-y-1">
              <div className="text-[10px] font-mono text-slate-400 h-4 truncate">
                {calcHistory[0] || "Standard Calculator"}
              </div>
              <div className="text-3xl font-extrabold font-mono text-cyan-300 truncate">
                {calcDisplay}
              </div>
            </div>

            {/* Keypad Grid */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              {["C", "±", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="].map((btn) => (
                <button
                  key={btn}
                  onClick={() => handleCalcInput(btn)}
                  className={`p-3 rounded-xl font-bold font-mono text-sm transition-all active:scale-95 shadow-md ${
                    btn === "="
                      ? "col-span-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-950"
                      : ["÷", "×", "-", "+"].includes(btn)
                      ? "bg-amber-600 hover:bg-amber-500 text-white"
                      : ["C", "±", "%"].includes(btn)
                      ? "bg-slate-800 hover:bg-slate-700 text-cyan-400"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800"
                  }`}
                >
                  {btn}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: NOTES APP */}
        {activeApp === "notes" && (
          <div className="flex-1 flex flex-col bg-slate-900 p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleBack}
                  className="p-1 text-slate-300 hover:text-purple-300"
                  title="Back (Return to Notes List or Main Menu)"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-xs text-purple-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  {notesViewMode === "detail" ? "Note Editor" : "All Notes"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white" title="Main Menu (Home)">
                  <Home className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const newNote = {
                      id: `note-${Date.now()}`,
                      title: `New Note #${notesList.length + 1}`,
                      body: "Type text using keyboard or HUD input deck...",
                      time: currentTime,
                    };
                    setNotesList([newNote, ...notesList]);
                    setActiveNoteId(newNote.id);
                    setActiveNoteBody(newNote.body);
                    setNotesViewMode("detail");
                    toast.success("Created new note");
                  }}
                  className="px-2 py-0.5 rounded bg-purple-600 text-white font-bold text-[10px] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex gap-1 overflow-x-auto pb-1">
                {notesList.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setActiveNoteId(n.id);
                      setActiveNoteBody(n.body);
                      setNotesViewMode("detail");
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                      activeNoteId === n.id
                        ? "bg-purple-600 text-white shadow-md"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    {n.title}
                  </button>
                ))}
              </div>

              {notesViewMode === "detail" ? (
                <textarea
                  value={activeNoteBody || (notesList.find((n) => n.id === activeNoteId)?.body || "")}
                  onChange={(e) => {
                    setActiveNoteBody(e.target.value);
                    setNotesList((prev) =>
                      prev.map((n) => (n.id === activeNoteId ? { ...n, body: e.target.value } : n))
                    );
                  }}
                  placeholder="Type your notes here..."
                  className="flex-1 w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
                />
              ) : (
                <div className="space-y-2 overflow-y-auto flex-1">
                  {notesList.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setActiveNoteId(n.id);
                        setActiveNoteBody(n.body);
                        setNotesViewMode("detail");
                      }}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500 cursor-pointer"
                    >
                      <p className="font-bold text-xs text-purple-300">{n.title}</p>
                      <p className="text-[10px] text-slate-400 truncate">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 5: CAMERA VIEWFINDER */}
        {activeApp === "camera" && (
          <div className="flex-1 flex flex-col justify-between p-3 bg-black relative">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 z-10">
              <button onClick={handleBack} className="p-1 hover:text-white flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <span className="text-emerald-400">📷 4K 60FPS HDR</span>
              <button onClick={handleHome} className="p-1 hover:text-white">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Viewfinder Reticle */}
            <div className="my-auto mx-auto w-40 h-40 border-2 border-dashed border-cyan-400/70 rounded-2xl flex items-center justify-center relative">
              <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400 absolute -top-1 -left-1" />
              <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400 absolute -top-1 -right-1" />
              <div className="w-4 h-4 border-b-2 border-l-2 border-cyan-400 absolute -bottom-1 -left-1" />
              <div className="w-4 h-4 border-b-2 border-r-2 border-cyan-400 absolute -bottom-1 -right-1" />
              <span className="text-[10px] font-mono text-cyan-300">AUTO-FOCUS LOCK</span>
            </div>

            {/* Shutter & Barcode Switch Buttons */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={() => {
                  openApp("scanner", "Barcode Scanner");
                  onActionLogged?.("APP_LAUNCH", "Switched from Camera to Barcode Scanner");
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold flex items-center gap-1 hover:bg-slate-800 shadow"
                title="Switch to Barcode Scanner"
              >
                <Scan className="w-3.5 h-3.5" /> Barcode
              </button>

              <button
                onClick={() => {
                  setCameraSnapped(true);
                  onActionLogged?.("CAMERA", "Captured snapshot frame");
                  toast.success("📸 Photo Captured!");
                  setTimeout(() => setCameraSnapped(false), 300);
                }}
                className={`w-14 h-14 rounded-full border-4 border-white flex items-center justify-center transition-all ${
                  cameraSnapped ? "bg-red-500 scale-90" : "bg-white/20 hover:bg-white/40"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW: BARCODE & INVENTORY SCANNER */}
        {activeApp === "scanner" && (
          <div className="flex-1 flex flex-col justify-between p-3 bg-slate-950 relative overflow-y-auto">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 z-10 border-b border-slate-800 pb-1.5">
              <button onClick={handleBack} className="p-1 hover:text-white flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Scan className="w-3.5 h-3.5" /> BARCODE SCANNER
              </span>
              <button onClick={handleHome} className="p-1 hover:text-white">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Target Reticle Viewfinder with Laser */}
            <div className="my-2 mx-auto w-48 h-36 border-2 border-emerald-500/60 rounded-2xl flex flex-col items-center justify-center relative bg-black shadow-inner overflow-hidden">
              <div className="absolute w-4 h-4 border-t-2 border-l-2 border-emerald-400 top-2 left-2" />
              <div className="absolute w-4 h-4 border-t-2 border-r-2 border-emerald-400 top-2 right-2" />
              <div className="absolute w-4 h-4 border-b-2 border-l-2 border-emerald-400 bottom-2 left-2" />
              <div className="absolute w-4 h-4 border-b-2 border-r-2 border-emerald-400 bottom-2 right-2" />
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse" />
              <Scan className="w-6 h-6 text-emerald-400/80 mb-1" />
              <span className="text-[9px] font-mono text-emerald-300 font-bold">ALIGN BARCODE IN FRAME</span>
            </div>

            {/* Quick Test Barcodes Trigger */}
            <div className="space-y-1 py-1">
              <span className="text-[9px] font-mono text-slate-400">Quick Test Samples:</span>
              <div className="grid grid-cols-2 gap-1 text-[9px]">
                {[
                  { code: "8901030865412", name: "Zebra DS2208 2D", fmt: "EAN-13" },
                  { code: "012345678905", name: "Logitech MX Master 3S", fmt: "UPC-A" },
                  { code: "PKG-99201-US", name: "Thermal Receipt Rolls", fmt: "Code-128" },
                  { code: "https://sightline.io/asset/DEV-0428", name: "Vision Controller QR", fmt: "QR" },
                ].map((item) => (
                  <button
                    key={item.code}
                    onClick={async () => {
                      setPhoneScannedBarcode(item.code);
                      playScanBeep(true);
                      onActionLogged?.("BARCODE_SCAN", `Scanned ${item.code} (${item.name})`);
                      const res = await lookupBarcodeItem(item.code);
                      if (res) {
                        setPhoneScannedItem(res);
                      }
                      setPhoneBarcodeHistory((prev) => [
                        { code: item.code, name: item.name, time: new Date().toLocaleTimeString() },
                        ...prev.slice(0, 5),
                      ]);
                      toast.success(`Scanned: ${item.name}`);
                    }}
                    className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-left transition-all truncate"
                  >
                    <div className="text-white font-bold truncate">{item.name}</div>
                    <div className="text-slate-400 font-mono text-[8px] truncate">{item.code}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Detected Product & Stock Counter Card */}
            {phoneScannedBarcode && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/50 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-mono text-emerald-300 font-bold break-all">
                    {phoneScannedBarcode}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                    MATCHED
                  </span>
                </div>
                {phoneScannedItem && (
                  <div>
                    <div className="text-xs font-bold text-white">{phoneScannedItem.name}</div>
                    <div className="text-[9px] text-cyan-400 font-mono">
                      SKU: {phoneScannedItem.sku} • {phoneScannedItem.category} • ${phoneScannedItem.price?.toFixed(2)}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-[9px] text-slate-400">Inventory Stock:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        const res = await recordBarcodeScan({ barcode: phoneScannedBarcode, delta: -1 });
                        if (res.success && res.item) {
                          setPhoneScannedItem(res.item);
                          onActionLogged?.("INVENTORY_UPDATE", `Stock -1 for ${res.item.name}`);
                          toast.success(`Stock updated: ${res.item.quantity}`);
                        }
                      }}
                      className="w-5 h-5 rounded bg-slate-800 hover:bg-rose-900 text-white flex items-center justify-center text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="font-mono font-bold text-xs text-white px-1">
                      {phoneScannedItem?.quantity ?? 0}
                    </span>
                    <button
                      onClick={async () => {
                        const res = await recordBarcodeScan({ barcode: phoneScannedBarcode, delta: 1 });
                        if (res.success && res.item) {
                          setPhoneScannedItem(res.item);
                          onActionLogged?.("INVENTORY_UPDATE", `Stock +1 for ${res.item.name}`);
                          toast.success(`Stock updated: ${res.item.quantity}`);
                        }
                      }}
                      className="w-5 h-5 rounded bg-slate-800 hover:bg-emerald-900 text-white flex items-center justify-center text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 6: YOUTUBE VIDEO PLAYER */}
        {activeApp === "youtube" && (
          <div className="flex-1 flex flex-col bg-slate-950 p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <button onClick={handleBack} className="p-1 hover:text-rose-400 text-slate-300">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-xs text-rose-500 flex items-center gap-1">
                  <Video className="w-3.5 h-3.5" /> YouTube
                </span>
              </div>
              <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white" title="Main Menu">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player Box */}
            <div className="w-full aspect-video rounded-xl bg-slate-900 border border-slate-800 relative flex items-center justify-center overflow-hidden shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-tr from-rose-950/40 via-slate-900 to-slate-950" />
              <div className="z-10 text-center space-y-2">
                <button
                  onClick={() => {
                    setYtPlaying(!ytPlaying);
                    toast.info(ytPlaying ? "⏸ Video Paused" : "▶ Video Playing");
                  }}
                  className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-rose-950 transition-transform active:scale-95"
                >
                  {ytPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <p className="text-[11px] font-bold text-white px-2 truncate max-w-[200px]">{ytSearch}</p>
              </div>
            </div>

            {/* Recommended Feed */}
            <div className="space-y-1.5 overflow-y-auto flex-1">
              {[
                { title: "Sightline AI Vision Engine 2026 Full Walkthrough", views: "142K views", length: "8:24" },
                { title: "Zero Drift ADB Android Automation Masterclass", views: "89K views", length: "12:10" },
                { title: "Qwen 3.5 2B Visual Reasoning Benchmarks", views: "205K views", length: "15:40" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setYtSearch(item.title);
                    setYtPlaying(true);
                    toast.success(`Playing: ${item.title}`);
                  }}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500 cursor-pointer flex gap-2"
                >
                  <div className="w-14 h-10 rounded bg-slate-950 flex items-center justify-center shrink-0 border border-slate-800 text-[9px] font-mono text-slate-500">
                    {item.length}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[10px] text-slate-200 truncate">{item.title}</p>
                    <p className="text-[9px] text-slate-400">{item.views}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 6: YOUTUBE / MEDIA PLAYER */}
        {activeApp === "youtube" && (
          <div className="flex-1 flex flex-col bg-slate-950 p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <button onClick={handleBack} className="p-1 hover:text-red-400 text-slate-300">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <Video className="w-3.5 h-3.5 text-red-500" />
                <span className="font-bold text-xs text-red-400">Sightline Media Player</span>
              </div>
              <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player Display */}
            <div className="relative aspect-video bg-black rounded-xl border border-slate-800 overflow-hidden flex flex-col justify-between p-2 shadow-2xl group">
              <div className="flex items-center justify-between z-10 text-[9px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded">
                <span>{ytSearch}</span>
                <span className="text-red-400">● LIVE 1080p</span>
              </div>

              {/* Video Graphic / Animation */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-red-950/40">
                <div className={`w-14 h-14 rounded-full bg-red-600/30 border border-red-500 flex items-center justify-center ${ytPlaying ? "animate-pulse" : ""}`}>
                  <Video className="w-7 h-7 text-red-400" />
                </div>
              </div>

              {/* Bottom Video Controls & Scrubber */}
              <div className="z-10 space-y-1 bg-black/80 p-1.5 rounded-lg backdrop-blur">
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full bg-red-500 rounded-full ${ytPlaying ? "w-3/5" : "w-1/4"}`} />
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-300">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setYtPlaying(!ytPlaying);
                        toast.info(ytPlaying ? "Video Paused" : "Video Playing");
                      }}
                      className="p-1 hover:text-white text-red-400 font-bold"
                    >
                      {ytPlaying ? <Pause className="w-3 h-3 fill-red-400" /> : <Play className="w-3 h-3 fill-red-400" />}
                    </button>
                    <span>01:45 / 03:20</span>
                  </div>
                  <button
                    onClick={() => {
                      toast.success("📷 Captured video snapshot frame");
                      onActionLogged?.("MEDIA", "Captured media snapshot");
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] hover:text-cyan-300 border border-slate-700"
                  >
                    Snap Frame
                  </button>
                </div>
              </div>
            </div>

            {/* Media Stream Selector & Search */}
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              <span className="text-[9px] font-mono text-slate-400 font-bold">Featured Streams & Walkthroughs:</span>
              {[
                { title: "Sightline Vision AI Demo (Full Pipeline)", duration: "03:20", views: "14.2k" },
                { title: "Android ADB & Hardware Mirroring Setup", duration: "05:45", views: "9.8k" },
                { title: "Autonomous 10-Second Self-Healing Loop", duration: "02:10", views: "22.1k" },
              ].map((v, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setYtSearch(v.title);
                    setYtPlaying(true);
                    toast.success(`Playing: ${v.title}`);
                  }}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/60 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-400">
                      <Play className="w-3 h-3 ml-0.5 fill-red-400" />
                    </div>
                    <div>
                      <p className="font-bold text-[10px] text-white truncate max-w-[160px]">{v.title}</p>
                      <p className="text-[8px] text-slate-400">{v.views} views • {v.duration}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 7: MUSIC / SPOTIFY PLAYER */}
        {activeApp === "spotify" && (
          <div className="flex-1 flex flex-col justify-between p-3 bg-gradient-to-b from-emerald-950/60 via-slate-950 to-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <button onClick={handleBack} className="p-1 hover:text-emerald-400 text-slate-300">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-xs text-emerald-400 flex items-center gap-1">
                  <Music className="w-3.5 h-3.5" /> Music Player
                </span>
              </div>
              <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white" title="Main Menu">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Album Art & Track Info */}
            <div className="my-auto text-center space-y-3">
              <div className="w-32 h-32 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-800 p-1 shadow-2xl shadow-emerald-950 border border-emerald-400/30 flex items-center justify-center">
                <Music className="w-12 h-12 text-white/80 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">{activeTrack}</h3>
                <p className="text-[11px] text-emerald-400 font-mono">Sightline Chillwave Automation</p>
              </div>

              {/* Progress Scrubber */}
              <div className="w-full space-y-1">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="w-2/3 h-full bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>02:14</span>
                  <span>03:45</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  onClick={() => {
                    setMusicPlaying(!musicPlaying);
                    toast.info(musicPlaying ? "Paused" : "Playing");
                  }}
                  className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-950 transition-transform active:scale-95"
                >
                  {musicPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 ml-0.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 8: TERMINAL / ADB SHELL (CONNECTED TO REAL BACKEND EXECUTION) */}
        {activeApp === "terminal" && (
          <div className="flex-1 flex flex-col bg-black p-2.5 font-mono text-[10px] space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400">
              <div className="flex items-center gap-1.5">
                <button onClick={handleBack} className="p-1 hover:text-emerald-400 text-slate-300">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Terminal & ADB Shell</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTermLogs(["Terminal cleared. Type 'help' for commands."])}
                  className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[8px] text-slate-400"
                >
                  Clear
                </button>
                <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white">
                  <Home className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-900 text-slate-300 select-text">
              {termLogs.map((line, idx) => (
                <div key={idx} className={line.startsWith("$") ? "text-cyan-400 font-bold" : "text-slate-300 whitespace-pre-wrap leading-relaxed"}>
                  {line}
                </div>
              ))}
            </div>

            {/* Quick Command Chips */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {["help", "pm list", "getprop", "ping google.com", "ai status", "workflow list", "docs"].map((c) => (
                <button
                  key={c}
                  onClick={async () => {
                    setTermLogs((prev) => [...prev, `$ ${c}`]);
                    try {
                      const res = await fetch("/api/mobile-stream/terminal/exec", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: c }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setTermLogs((prev) => [...prev, data.output || "[OK]"]);
                      }
                    } catch {
                      setTermLogs((prev) => [...prev, "Command execution error"]);
                    }
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[8px] font-mono text-emerald-400 shrink-0"
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Command Input Bar */}
            <div className="flex gap-1.5 pt-0.5">
              <input
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && termInput.trim()) {
                    const cmd = termInput.trim();
                    setTermInput("");
                    setTermLogs((prev) => [...prev, `$ ${cmd}`]);
                    onActionLogged?.("TERMINAL", `Ran: "${cmd}"`);
                    try {
                      const res = await fetch("/api/mobile-stream/terminal/exec", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: cmd }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setTermLogs((prev) => [...prev, data.output || "[OK]"]);
                      }
                    } catch {
                      setTermLogs((prev) => [...prev, "Command execution error"]);
                    }
                  }
                }}
                placeholder="Enter command e.g. pm list, ping, help..."
                className="flex-1 h-7 bg-slate-900 border border-slate-700 rounded px-2 text-slate-100 text-[10px] focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button
                onClick={async () => {
                  if (termInput.trim()) {
                    const cmd = termInput.trim();
                    setTermInput("");
                    setTermLogs((prev) => [...prev, `$ ${cmd}`]);
                    try {
                      const res = await fetch("/api/mobile-stream/terminal/exec", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: cmd }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setTermLogs((prev) => [...prev, data.output || "[OK]"]);
                      }
                    } catch {
                      setTermLogs((prev) => [...prev, "Command execution error"]);
                    }
                  }
                }}
                className="px-2.5 h-7 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold"
              >
                Run
              </button>
            </div>
          </div>
        )}

        {/* VIEW 9: FILE MANAGER & DOCUMENT GROUNDING REPOSITORY */}
        {activeApp === "files" && (
          <div className="flex-1 flex flex-col bg-slate-950 p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <button onClick={handleBack} className="p-1 hover:text-amber-400 text-slate-300">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold text-xs text-amber-300">Files & Document Grounding</span>
              </div>
              <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {/* Document Upload Button */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-cyan-500/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-cyan-300 font-mono">📎 Ingest Reference Doc for AI</span>
                <label className="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[9px] font-bold cursor-pointer flex items-center gap-1 shadow-md">
                  <Plus className="w-2.5 h-2.5" /> Upload File
                  <input
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text().catch(() => "Binary/Media document");
                      try {
                        const res = await fetch("/api/mobile-stream/upload-doc", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: file.name,
                            content: text,
                            fileType: file.type || "text/plain",
                            size: file.size,
                          }),
                        });
                        if (res.ok) {
                          toast.success(`✅ Uploaded "${file.name}" to AI grounding context!`);
                        }
                      } catch {
                        toast.error("Failed uploading document");
                      }
                    }}
                  />
                </label>
              </div>
              <p className="text-[8px] text-slate-400">
                Upload SOPs, workflows, or guidance documents so the AI understands instructions.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1">
              {[
                { name: "Camera Photos", count: "48 items", icon: ImageIcon, color: "text-emerald-400" },
                { name: "AI Grounding Docs", count: "SOP & Guidance", icon: FileText, color: "text-purple-400" },
                { name: "Downloads", count: "12 files", icon: Folder, color: "text-blue-400" },
                { name: "Workflows Export", count: "18 JSON", icon: Sparkles, color: "text-amber-400" },
              ].map((f, i) => (
                <div
                  key={i}
                  onClick={() => toast.info(`Opened ${f.name}`)}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-400 cursor-pointer flex flex-col gap-1.5"
                >
                  <f.icon className={`w-6 h-6 ${f.color}`} />
                  <div>
                    <p className="font-bold text-xs text-slate-200">{f.name}</p>
                    <p className="text-[9px] text-slate-400">{f.count}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 10: SETTINGS */}
        {activeApp === "settings" && (
          <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-slate-950 font-sans">
            <div className="font-bold text-xs text-slate-200 border-b border-slate-800 pb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button onClick={handleBack} className="p-1 hover:text-cyan-300 text-slate-300">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>{activeSettingsSubPage ? `${activeSettingsSubPage.toUpperCase()} Settings` : "Settings & Preferences"}</span>
              </div>
              <button onClick={handleHome} className="p-1 text-slate-400 hover:text-white" title="Main Menu">
                <Home className="w-4 h-4" />
              </button>
            </div>

            {activeSettingsSubPage ? (
              <div className="space-y-3 p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                <p className="font-bold text-xs text-cyan-300">{activeSettingsSubPage.toUpperCase()} Detailed Configuration</p>
                <p className="text-[10px] text-slate-400">Configured parameters for {activeSettingsSubPage}. Click Back above or press [B] to return to Main Settings menu.</p>
                <button onClick={handleBack} className="h-7 text-xs bg-slate-800 text-cyan-300 hover:bg-slate-700 w-full rounded-lg font-bold flex items-center justify-center gap-1 border border-slate-700">
                  <ArrowLeft className="w-3 h-3" /> Back to Settings Menu
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "Wi-Fi Network", val: settings.wifi ? "Connected (Sightline_5G)" : "Disconnected", key: "wifi" },
                  { label: "Bluetooth 5.3", val: settings.bluetooth ? "Active" : "Off", key: "bluetooth" },
                  { label: "Qwen 3.5 AI Copilot", val: settings.aiCopilot ? "Enabled (quantumclaw.net)" : "Disabled", key: "aiCopilot" },
                  { label: "Dark Theme UI", val: settings.darkMode ? "On" : "Off", key: "darkMode" },
                  { label: "Auto-Record Actions", val: settings.autoRecord ? "Active" : "Off", key: "autoRecord" },
                ].map((item) => (
                  <div
                    key={item.label}
                    onClick={() => {
                      setActiveSettingsSubPage(item.key);
                      onActionLogged?.("SETTINGS", `Opened ${item.label} Sub-Page`);
                    }}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500 flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div>
                      <p className="font-bold text-slate-200 text-[11px]">{item.label}</p>
                      <p className="text-[10px] text-slate-400">{item.val}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 11: APP SWITCHER / OVERVIEW CAROUSEL */}
        {activeApp === "overview" && (
          <div className="flex-1 p-4 flex flex-col justify-center gap-3 bg-slate-950">
            <div className="text-center text-xs font-bold text-slate-300">
              Active Background Apps (Click to switch)
            </div>
            <div className="flex gap-3 overflow-x-auto py-2 px-1">
              {[
                { id: "chrome", name: "Google Chrome", icon: Globe, color: "border-blue-500" },
                { id: "calculator", name: "Calculator", icon: Calculator, color: "border-amber-500" },
                { id: "notes", name: "Notes", icon: FileText, color: "border-purple-500" },
                { id: "settings", name: "Settings", icon: Settings, color: "border-cyan-500" },
                { id: "youtube", name: "YouTube", icon: Video, color: "border-rose-500" },
                { id: "terminal", name: "Terminal", icon: Terminal, color: "border-emerald-500" },
              ].map((c) => (
                <div
                  key={c.id}
                  onClick={() => openApp(c.id as any, c.name)}
                  className={`w-36 h-48 rounded-2xl bg-slate-900 border-2 ${c.color} p-3 flex flex-col justify-between cursor-pointer hover:scale-105 transition-all shadow-xl shrink-0`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                    <c.icon className="w-4 h-4" />
                    <span className="truncate">{c.name}</span>
                  </div>
                  <div className="text-center text-[10px] text-slate-400 font-mono">Tap to switch</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* VIRTUAL HARDWARE NAVIGATION BAR (Back, Home, Overview) */}
      <div className="w-full h-8 bg-black/90 border-t border-slate-800 flex items-center justify-around px-4 z-40 shrink-0">
        <button
          onClick={handleBack}
          className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
          title="Back (Hotkey [B])"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={handleHome}
          className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
          title="Home Launcher (Hotkey [H])"
        >
          <Home className="w-4 h-4" />
        </button>
        <button
          onClick={handleOverview}
          className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
          title="Overview / App Switcher (Hotkey [O])"
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
