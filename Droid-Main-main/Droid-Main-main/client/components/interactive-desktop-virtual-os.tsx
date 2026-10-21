import React, { useState, useEffect } from "react";
import {
  Globe,
  Terminal as TerminalIcon,
  Settings as SettingsIcon,
  Calculator as CalculatorIcon,
  Folder,
  FileText,
  Search,
  Sparkles,
  Maximize2,
  Minimize2,
  X,
  Plus,
  Play,
  Check,
  Activity,
  Shield,
  Wifi,
  Volume2,
  Battery,
  Monitor,
  ArrowLeft,
  Home,
} from "lucide-react";
import { toast } from "sonner";

interface InteractiveDesktopVirtualOSProps {
  externalTextInjection?: string;
  onActionLogged?: (action: string, details: string) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
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

export const InteractiveDesktopVirtualOS: React.FC<InteractiveDesktopVirtualOSProps> = ({
  externalTextInjection,
  onActionLogged,
  onContextMenu,
  currentStepAction,
  forwardTrigger = 0,
  className = "",
}) => {
  const [activeWindow, setActiveWindow] = useState<"chrome" | "terminal" | "settings" | "calculator" | "files" | null>("chrome");
  const [windowState, setWindowState] = useState<{ isMaximized: boolean }>({ isMaximized: false });
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("12:00 PM");

  // Chrome state
  const [chromeSearch, setChromeSearch] = useState("AI Automation Agents & Vision HUD");
  const [chromeUrl, setChromeUrl] = useState("https://google.com");
  const [chromeHistoryStack, setChromeHistoryStack] = useState<string[]>(["https://google.com"]);

  // Terminal state
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    "Sightline OS [Version 10.0.22631.3296]",
    "(c) Sightline Automation Core. All rights reserved.",
    "",
    "C:\\Automation> python -m sightline.agent --monitor=active",
    "[OK] PyAutoGUI native execution engine initialized (1920x1080).",
    "[OK] Ollama Qwen 3.5 2B vision pipeline linked @ https://quantumclaw.net/ollama/api/chat.",
    "[READY] Listening for keystrokes, click points & automated workflows...",
    "",
  ]);
  const [terminalInput, setTerminalInput] = useState("");

  // Calculator state
  const [calcDisplay, setCalcDisplay] = useState("0");

  const handleBrowserBack = () => {
    if (chromeHistoryStack.length > 1) {
      const updated = [...chromeHistoryStack];
      updated.pop();
      const prevUrl = updated[updated.length - 1];
      setChromeHistoryStack(updated);
      setChromeUrl(prevUrl);
      setChromeSearch(prevUrl.includes("?q=") ? decodeURIComponent(prevUrl.split("?q=")[1]) : "AI Automation Agents & Vision HUD");
      onActionLogged?.("BROWSER_BACK", `Navigated Back in Chrome to: ${prevUrl}`);
      toast.info("◀ Chrome Browser: Navigated Back a Page");
    } else {
      setActiveWindow(null);
      setIsStartMenuOpen(true);
      onActionLogged?.("NAVIGATE", "Returned to Desktop Main Menu");
      toast.info("🏠 Returned to Desktop Main Menu");
    }
  };

  const handleMinimizeToDesktop = () => {
    setActiveWindow(null);
    setIsStartMenuOpen(false);
    onActionLogged?.("BUTTON", "Minimizing all windows to Desktop (Win + D)");
    toast.success("🖥️ Showing Desktop Main Menu");
  };

  // React to Step Forwarding and Current Sequence Actions to visibly mutate desktop template
  useEffect(() => {
    if (!currentStepAction && !forwardTrigger) return;
    const actionText = (currentStepAction?.name || currentStepAction?.text || "").toLowerCase();
    const actionType = (currentStepAction?.action || "").toLowerCase();

    // 1. Home / Main Menu / Start Menu Navigation
    if (
      actionText.includes("home") ||
      actionText.includes("main menu") ||
      actionText.includes("start menu") ||
      actionText.includes("desktop") ||
      actionText.includes("minimize all") ||
      actionType === "home" ||
      actionType === "main_menu"
    ) {
      setIsStartMenuOpen((prev) => !prev);
      onActionLogged?.("MAIN_MENU", "Toggled Desktop Start Menu / Main Menu");
      return;
    }

    // 2. Back Navigation (Page Back, Browser Back, Close window)
    if (
      actionText.includes("back") ||
      actionText.includes("previous") ||
      actionText.includes("page back") ||
      actionText.includes("history back") ||
      actionType === "back" ||
      actionType === "navigate_back"
    ) {
      if (activeWindow === "chrome") {
        handleBrowserBack();
      } else {
        setActiveWindow(null);
        toast.info("◀ Closed window / Returned to Desktop");
      }
      return;
    }

    // 3. Terminal / CMD actions
    if (actionText.includes("terminal") || actionText.includes("cmd") || actionText.includes("python") || actionText.includes("cli")) {
      setActiveWindow("terminal");
      setIsStartMenuOpen(false);
      if (currentStepAction?.text) {
        const cmd = currentStepAction.text;
        setTerminalHistory((prev) => [...prev, `C:\\Automation> ${cmd}`, `[EXECUTED via AI Step] ${cmd}`, ""]);
      }
      onActionLogged?.("STEP_FORWARD", `Forwarded to Terminal: ${currentStepAction?.text || "Opened"}`);
    }
    // 4. Chrome actions
    else if (actionText.includes("chrome") || actionText.includes("browser") || actionText.includes("web") || actionText.includes("search")) {
      setActiveWindow("chrome");
      setIsStartMenuOpen(false);
      if (currentStepAction?.text) {
        setChromeSearch(currentStepAction.text);
        const newUrl = `https://google.com/search?q=${encodeURIComponent(currentStepAction.text)}`;
        setChromeUrl(newUrl);
        setChromeHistoryStack((prev) => [...prev, newUrl]);
      }
      onActionLogged?.("STEP_FORWARD", `Forwarded to Chrome: ${currentStepAction?.text || "Opened"}`);
    }
    // 5. Calculator actions
    else if (actionText.includes("calc") || actionText.includes("calculator")) {
      setActiveWindow("calculator");
      setIsStartMenuOpen(false);
      if (currentStepAction?.text) {
        setCalcDisplay(currentStepAction.text);
      }
      onActionLogged?.("STEP_FORWARD", `Forwarded to Calculator: ${currentStepAction?.text || "Opened"}`);
    }
    // 6. File explorer
    else if (actionText.includes("file") || actionText.includes("folder")) {
      setActiveWindow("files");
      setIsStartMenuOpen(false);
      onActionLogged?.("STEP_FORWARD", "Forwarded to File Explorer");
    }
    // 7. Settings
    else if (actionText.includes("setting")) {
      setActiveWindow("settings");
      setIsStartMenuOpen(false);
      onActionLogged?.("STEP_FORWARD", "Forwarded to Settings");
    }
    // 8. Generic typing
    else if (currentStepAction?.text && (actionType === "type" || actionType === "type_text" || actionType === "clear_and_type")) {
      if (activeWindow === "terminal") {
        setTerminalInput(currentStepAction.text);
      } else if (activeWindow === "chrome") {
        setChromeSearch(currentStepAction.text);
      } else if (activeWindow === "calculator") {
        setCalcDisplay(currentStepAction.text);
      }
      onActionLogged?.("STEP_FORWARD", `Typed "${currentStepAction.text}" in ${activeWindow}`);
    }
  }, [currentStepAction, forwardTrigger]);

  // Clock timer
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Listen for reset app state event to provide clean baseline for test mode & AI CoT
  useEffect(() => {
    const handleReset = () => {
      setActiveWindow("chrome");
      setIsStartMenuOpen(false);
      setChromeSearch("AI Automation Agents & Vision HUD");
      setChromeUrl("https://google.com");
      setChromeHistoryStack(["https://google.com"]);
      setTerminalInput("");
      setCalcDisplay("0");
      setWindowState({ isMaximized: false });
      onActionLogged?.("TEST_MODE", "Reset Virtual Desktop OS to baseline clean state");
      toast.info("🖥️ Desktop OS state reset to clean baseline (Chrome)");
    };
    window.addEventListener("sightline-reset-app-state", handleReset);
    return () => window.removeEventListener("sightline-reset-app-state", handleReset);
  }, []);

  // Handle external text injection
  useEffect(() => {
    if (!externalTextInjection) return;
    if (activeWindow === "terminal") {
      setTerminalInput((prev) => prev + externalTextInjection);
    } else if (activeWindow === "chrome") {
      setChromeSearch((prev) => prev + externalTextInjection);
    }
  }, [externalTextInjection, activeWindow]);

  const openWindow = (win: "chrome" | "terminal" | "settings" | "calculator" | "files", label: string) => {
    setActiveWindow(win);
    setIsStartMenuOpen(false);
    onActionLogged?.("APP_LAUNCH", `Launched ${label}`);
    toast.success(`🖥️ Opened ${label}`);
  };

  const handleTerminalSubmit = () => {
    if (!terminalInput.trim()) return;
    const cmd = terminalInput;
    let output = `[EXECUTED] ${cmd}`;
    if (cmd.toLowerCase().includes("ping")) {
      output = "Pinging 192.168.1.100 with 32 bytes of data:\nReply from 192.168.1.100: bytes=32 time=12ms TTL=64";
    } else if (cmd.toLowerCase().includes("help")) {
      output = "Commands available: ping, scan, qwen, adb, clear, exit";
    } else if (cmd.toLowerCase().includes("clear")) {
      setTerminalHistory([]);
      setTerminalInput("");
      return;
    }
    setTerminalHistory((prev) => [...prev, `C:\\Automation> ${cmd}`, output, ""]);
    setTerminalInput("");
    onActionLogged?.("TERMINAL", `Ran: "${cmd}"`);
  };

  return (
    <div
      onContextMenu={onContextMenu}
      className={`relative w-full h-full bg-slate-950 flex flex-col justify-between overflow-hidden select-none font-sans ${className}`}
    >
      {/* Desktop Wallpaper / Workspace Grid */}
      <div className="w-full flex-1 relative p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 overflow-hidden">
        {/* Desktop Icons */}
        <div className="grid grid-flow-col grid-rows-4 gap-4 w-max z-10 relative">
          {[
            { id: "chrome", name: "Google Chrome", icon: Globe, color: "from-blue-600 to-cyan-600" },
            { id: "terminal", name: "Terminal / CMD", icon: TerminalIcon, color: "from-slate-800 to-slate-950" },
            { id: "calculator", name: "Calculator", icon: CalculatorIcon, color: "from-amber-600 to-orange-600" },
            { id: "files", name: "File Explorer", icon: Folder, color: "from-yellow-600 to-amber-700" },
            { id: "settings", name: "Settings", icon: SettingsIcon, color: "from-slate-700 to-slate-800" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => openWindow(item.id as any, item.name)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 transition-colors w-20 group"
            >
              <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform border border-white/20`}>
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-slate-200 group-hover:text-cyan-300 text-center leading-tight truncate max-w-[70px]">
                {item.name}
              </span>
            </button>
          ))}
        </div>

        {/* Central Active Application Window */}
        {activeWindow && (
          <div
            className={`absolute z-20 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col transition-all ${
              windowState.isMaximized
                ? "inset-2"
                : "top-8 left-28 right-8 bottom-8 md:left-32 md:right-12 md:bottom-12"
            }`}
          >
            {/* Window Title Bar */}
            <div className="h-8 bg-slate-950 border-b border-slate-800 px-3 flex items-center justify-between shrink-0 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-200">
                {activeWindow === "chrome" && <Globe className="w-3.5 h-3.5 text-cyan-400" />}
                {activeWindow === "terminal" && <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />}
                {activeWindow === "calculator" && <CalculatorIcon className="w-3.5 h-3.5 text-amber-400" />}
                {activeWindow === "files" && <Folder className="w-3.5 h-3.5 text-yellow-400" />}
                {activeWindow === "settings" && <SettingsIcon className="w-3.5 h-3.5 text-slate-400" />}
                <span className="font-bold uppercase">{activeWindow}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWindowState((p) => ({ isMaximized: !p.isMaximized }))}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setActiveWindow(null)}
                  className="p-1 text-slate-400 hover:text-red-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Window Content */}
            <div className="flex-1 overflow-hidden bg-slate-950 flex flex-col">
              {/* CHROME */}
              {activeWindow === "chrome" && (
                <div className="flex-1 flex flex-col">
                  <div className="p-2 bg-slate-900 border-b border-slate-800 flex items-center gap-1.5">
                    <button
                      onClick={handleBrowserBack}
                      className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
                      title="Navigate Back a Page (History Back / Desktop)"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setChromeUrl("https://google.com");
                        setChromeSearch("AI Automation Agents & Vision HUD");
                        setChromeHistoryStack(["https://google.com"]);
                        toast.info("🏠 Navigated to Browser Home");
                      }}
                      className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
                      title="Browser Home"
                    >
                      <Home className="w-3.5 h-3.5" />
                    </button>
                    <Globe className="w-3.5 h-3.5 text-cyan-400 ml-1" />
                    <input
                      value={chromeSearch}
                      onChange={(e) => setChromeSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const newUrl = `https://google.com/search?q=${encodeURIComponent(chromeSearch)}`;
                          setChromeUrl(newUrl);
                          setChromeHistoryStack((prev) => [...prev, newUrl]);
                          toast.success(`Navigated to: "${chromeSearch}"`);
                          onActionLogged?.("CHROME", `Search: "${chromeSearch}"`);
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                      placeholder="Search Google or type a URL..."
                    />
                    <button
                      onClick={() => {
                        const newUrl = `https://google.com/search?q=${encodeURIComponent(chromeSearch)}`;
                        setChromeUrl(newUrl);
                        setChromeHistoryStack((prev) => [...prev, newUrl]);
                        toast.success(`Navigated: "${chromeSearch}"`);
                      }}
                      className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
                    >
                      Search
                    </button>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-sm">
                          <Sparkles className="w-4 h-4" />
                          <span>Search Results: "{chromeSearch}"</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">History Page {chromeHistoryStack.length}</span>
                      </div>
                      <div className="space-y-2">
                        <div
                          onClick={() => {
                            const newUrl = "https://sightline.io/docs/vision-agent-v2";
                            setChromeSearch("Sightline Universal AI Vision & Interaction Copilot Manual");
                            setChromeUrl(newUrl);
                            setChromeHistoryStack((prev) => [...prev, newUrl]);
                            toast.success("📄 Opened Web Documentation (Click Back to return)");
                          }}
                          className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 cursor-pointer"
                        >
                          <p className="font-bold text-cyan-300 text-xs">Sightline Universal AI Vision & Interaction Copilot</p>
                          <p className="text-[11px] text-slate-400">Real-time desktop & mobile perception with Qwen 3.5 2B visual feedback positioning.</p>
                        </div>
                        <div
                          onClick={() => {
                            const newUrl = "https://sightline.io/docs/watchdog-engine";
                            setChromeSearch("Automated Workflow & Self-Healing Watchdog Engine Whitepaper");
                            setChromeUrl(newUrl);
                            setChromeHistoryStack((prev) => [...prev, newUrl]);
                            toast.success("📄 Opened Article Page (Click Back to return)");
                          }}
                          className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 cursor-pointer"
                        >
                          <p className="font-bold text-cyan-300 text-xs">Automated Workflow & Self-Healing Watchdog Engine</p>
                          <p className="text-[11px] text-slate-400">Zero-drift execution with instant optical recalibration.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TERMINAL */}
              {activeWindow === "terminal" && (
                <div className="flex-1 p-3 bg-black text-emerald-400 font-mono text-xs flex flex-col justify-between overflow-y-auto">
                  <div className="space-y-1">
                    {terminalHistory.map((line, idx) => (
                      <div key={idx} className="whitespace-pre-wrap leading-relaxed">{line}</div>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-emerald-900/50">
                    <span className="text-emerald-500 font-bold">C:\Automation&gt;</span>
                    <input
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleTerminalSubmit();
                        }
                      }}
                      className="flex-1 bg-transparent border-0 text-emerald-300 font-mono text-xs focus:outline-none"
                      placeholder="Type command (e.g. ping, help, scan)..."
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* CALCULATOR */}
              {activeWindow === "calculator" && (
                <div className="flex-1 p-4 bg-slate-950 flex flex-col justify-between max-w-xs mx-auto">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-right text-2xl font-mono text-cyan-300">
                    {calcDisplay}
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "C", "0", "=", "+"].map((b) => (
                      <button
                        key={b}
                        onClick={() => {
                          if (b === "C") setCalcDisplay("0");
                          else if (b === "=") {
                            try {
                              const sanitized = calcDisplay.replace(/×/g, "*").replace(/÷/g, "/");
                              // eslint-disable-next-line no-new-func
                              const res = Function(`'use strict'; return (${sanitized})`)();
                              setCalcDisplay(String(res));
                              onActionLogged?.("CALC", `Result: ${res}`);
                            } catch { setCalcDisplay("Error"); }
                          } else {
                            setCalcDisplay((p) => p === "0" || p === "Error" ? b : p + b);
                          }
                        }}
                        className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold font-mono text-sm border border-slate-800"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* FILES & SETTINGS */}
              {activeWindow === "files" && (
                <div className="flex-1 p-4 bg-slate-950 space-y-3">
                  <div className="font-bold text-xs text-slate-200">System Drives & Directories</div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: "C: Local Disk (OS)", size: "450 GB free of 1 TB" },
                      { name: "D: Workflows & Sessions", size: "820 GB free of 2 TB" },
                      { name: "Models (Qwen GGUF)", size: "48 GB available" },
                    ].map((d) => (
                      <div key={d.name} className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500 cursor-pointer">
                        <Folder className="w-6 h-6 text-yellow-400 mb-1" />
                        <p className="font-bold text-xs text-slate-200">{d.name}</p>
                        <p className="text-[10px] text-slate-400">{d.size}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeWindow === "settings" && (
                <div className="flex-1 p-4 bg-slate-950 space-y-3">
                  <div className="font-bold text-xs text-slate-200">Sightline Desktop OS Preferences</div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                      <span>Display Resolution</span>
                      <span className="text-cyan-300 font-bold">1920x1080 @ 60Hz</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                      <span>AI Perception Provider</span>
                      <span className="text-emerald-300 font-bold">Qwen 3.5:2b (quantumclaw.net)</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                      <span>PyAutoGUI Native Bridge</span>
                      <span className="text-purple-300 font-bold">Active (PID: 14201)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Start Menu / Main Menu Popup */}
      {isStartMenuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-10 left-3 w-80 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/60 rounded-2xl p-4 shadow-2xl z-40 animate-in slide-in-from-bottom-2 duration-150 space-y-3 font-mono text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-cyan-600 flex items-center justify-center text-white font-bold">
                <Monitor className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-100">Sightline OS • Main Menu</span>
            </div>
            <button
              onClick={() => setIsStartMenuOpen(false)}
              className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded text-[10px]"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Applications</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "chrome", name: "Google Chrome", icon: Globe, color: "text-cyan-400" },
                { id: "terminal", name: "Terminal / CMD", icon: TerminalIcon, color: "text-emerald-400" },
                { id: "calculator", name: "Calculator", icon: CalculatorIcon, color: "text-amber-400" },
                { id: "files", name: "File Explorer", icon: Folder, color: "text-yellow-400" },
                { id: "settings", name: "Settings", icon: SettingsIcon, color: "text-slate-400" },
              ].map((app) => (
                <button
                  key={app.id}
                  onClick={() => openWindow(app.id as any, app.name)}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500 flex items-center gap-2 text-left transition-all"
                >
                  <app.icon className={`w-4 h-4 ${app.color}`} />
                  <span className="font-bold text-[11px] text-slate-200 truncate">{app.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={handleMinimizeToDesktop}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 font-bold text-[10px] flex items-center gap-1 border border-slate-800"
            >
              <Monitor className="w-3 h-3" /> Show Desktop
            </button>
            <span className="text-[10px] text-slate-500">Press Super / Win</span>
          </div>
        </div>
      )}

      {/* Windows / Desktop Taskbar */}
      <div className="w-full h-9 bg-slate-950/95 border-t border-slate-800 px-3 flex items-center justify-between z-30 shrink-0 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          {/* Start Menu Button */}
          <button
            onClick={() => setIsStartMenuOpen((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 shadow-md transition-all ${
              isStartMenuOpen
                ? "bg-cyan-500 text-black ring-2 ring-cyan-300"
                : "bg-cyan-600 hover:bg-cyan-500 text-white"
            }`}
            title="Start / Main Menu"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Start</span>
          </button>

          {/* Running Taskbar Icons */}
          {[
            { id: "chrome", icon: Globe, label: "Chrome" },
            { id: "terminal", icon: TerminalIcon, label: "CMD" },
            { id: "calculator", icon: CalculatorIcon, label: "Calc" },
            { id: "files", icon: Folder, label: "Files" },
          ].map((app) => (
            <button
              key={app.id}
              onClick={() => {
                if (activeWindow === app.id) {
                  setActiveWindow(null); // Minimize
                } else {
                  setActiveWindow(app.id as any);
                  setIsStartMenuOpen(false);
                }
              }}
              className={`px-2 py-1 rounded flex items-center gap-1 font-bold text-[11px] transition-all ${
                activeWindow === app.id
                  ? "bg-slate-800 text-cyan-300 border border-cyan-500/50"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <app.icon className="w-3 h-3" />
              <span>{app.label}</span>
            </button>
          ))}
        </div>

        {/* System Tray (WiFi, Volume, Clock, Show Desktop) */}
        <div className="flex items-center gap-2.5 text-slate-300 text-[11px]">
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-slate-200">{currentTime}</span>
          <button
            onClick={handleMinimizeToDesktop}
            className="w-2.5 h-6 ml-1 border-l border-slate-700 hover:bg-white/20 transition-colors"
            title="Show Desktop / Minimize All (Win + D)"
          />
        </div>
      </div>
    </div>
  );
};
