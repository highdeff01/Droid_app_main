import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  User,
  Send,
  Loader2,
  Sparkles,
  Zap,
  Terminal,
  Play,
  RotateCcw,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Smartphone,
  Monitor,
  Layers,
  ArrowRight,
  RefreshCw,
  Code2,
  Clock,
  Settings,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolInvocations?: Array<{
    name: string;
    args: Record<string, any>;
    result?: Record<string, any>;
    status: "pending" | "success" | "error";
  }>;
  createdWorkflow?: {
    id: string;
    name: string;
    description: string;
    stepsCount: number;
    steps: any[];
  };
  navigationTarget?: string;
}

export interface MainAiLiveChatProps {
  currentScreenSnapshot?: string | null;
  currentTab?: string;
  targetDevice?: "desktop" | "android";
  onNavigateTab?: (tabId: string) => void;
  onRunWorkflow?: (workflow: any) => void;
  onExtendToScreen?: (workflow: any) => void;
  onSendToVisionHud?: (workflow: any) => void;
  onSaveWorkflow?: (workflow: any) => void;
  className?: string;
  compact?: boolean;
}

const DEFAULT_INITIAL_WELCOME: ChatMessage = {
  id: "welcome-init",
  role: "assistant",
  content:
    "👋 **Sightline Main AI Copilot & Automation Executive**\n\nConnected directly to your live phone stream, PyAutoGUI, ADB hardware engines, and workflow generator.\n\n**You can command:**\n- 📱 **Device Navigation:** *\"Open Chrome\"*, *\"Open Calculator\"*, *\"Minimize App\"*, *\"Press Home\"*\n- 🎯 **Direct Coordinates:** *\"Click (960, 540)\"*, *\"Swipe up on phone\"*\n- ✍️ **Hardware Typing:** *\"Type admin123 and press enter\"*\n- ⚡ **Autonomous Workflows:** *\"Create a 4-step workflow to login and verify status\"*\n- 🔀 **Tab Switching:** *\"Switch to Movement Tab\"*, *\"Open AI Monitor\"*",
  timestamp: Date.now(),
};

export function MainAiLiveChat({
  currentScreenSnapshot,
  currentTab = "screen",
  targetDevice: targetDeviceProp = "desktop",
  onNavigateTab,
  onRunWorkflow,
  onExtendToScreen,
  onSendToVisionHud,
  onSaveWorkflow,
  className = "",
  compact = false,
}: MainAiLiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_INITIAL_WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt: number }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState("main-live-session");
  const [attachLiveScreen, setAttachLiveScreen] = useState(true);
  const [targetDevice, setTargetDevice] = useState<"desktop" | "android">(targetDeviceProp);
  const [expandedWorkflowIds, setExpandedWorkflowIds] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync prop changes for targetDevice
  useEffect(() => {
    if (targetDeviceProp) {
      setTargetDevice(targetDeviceProp);
    }
  }, [targetDeviceProp]);

  // Load session messages on mount or session change
  useEffect(() => {
    fetchSession(currentSessionId);
    fetchSessionsList();
  }, [currentSessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const fetchSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai/main-chat/session/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session?.messages && data.session.messages.length > 0) {
          setMessages(data.session.messages);
        }
      }
    } catch (e) {
      console.error("Failed to load chat session:", e);
    }
  };

  const fetchSessionsList = async () => {
    try {
      const res = await fetch("/api/ai/main-chat/sessions");
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessions(data.sessions);
        }
      }
    } catch (e) {
      console.error("Failed to list sessions:", e);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend !== undefined ? textToSend : input).trim();
    if (!query || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (textToSend === undefined) setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/main-chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          sessionId: currentSessionId,
          currentScreenSnapshot: attachLiveScreen ? currentScreenSnapshot : undefined,
          currentTab,
          targetDevice,
        }),
      });

      const data = await res.json();

      if (data.success && data.message) {
        setMessages((prev) => [...prev, data.message]);

        // If AI triggered tab navigation
        if (data.navigationTarget && onNavigateTab) {
          toast.info(`Switched view to "${data.navigationTarget}"`);
          onNavigateTab(data.navigationTarget);
        }

        // If AI created a workflow
        if (data.createdWorkflow) {
          toast.success(`⚡ Workflow "${data.createdWorkflow.name}" (${data.createdWorkflow.stepsCount} steps) ready.`);
        }
      } else {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Failed to process command: ${data.error || "Unknown server response."}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      console.error("Error calling main AI chat:", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `⚠️ Network error: ${err.message || "Failed to contact AI service"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      fetchSessionsList();
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch(`/api/ai/main-chat/session/${currentSessionId}`, { method: "DELETE" });
      fetchSession(currentSessionId);
      toast.info("Conversation history reset.");
    } catch (e) {
      console.error("Failed to clear chat history:", e);
    }
  };

  const handleExportChat = () => {
    const content = messages
      .map((m) => `### ${m.role.toUpperCase()} (${new Date(m.timestamp).toLocaleTimeString()})\n${m.content}\n`)
      .join("\n---\n\n");

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-chat-history-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat history downloaded as Markdown.");
  };

  const quickPrompts = [
    { label: "⚡ Create Login Workflow", prompt: "Create a 4-step workflow to focus username, type credentials, and click login." },
    { label: "📱 Create Search Macro", prompt: "Create a 3-step workflow to tap search box, type query, and tap search button." },
    { label: "📜 Create Auto-Scroll Routine", prompt: "Create a 5-step workflow to scroll down feed, pause for 1 second, and tap the first article." },
    { label: "🔍 Detect Screen Elements", prompt: "Analyze the current screen and detect all interactive buttons and inputs." },
    { label: "📱 Minimize App (Home)", prompt: "Press the Home button to minimize the phone app." },
    { label: "🎯 Click Center (960, 540)", prompt: "Click on coordinate (960, 540) on the screen." },
    { label: "✍️ Type 'admin123'", prompt: "Type text 'admin123' and press Enter." },
    { label: "🌐 Open Chrome", prompt: "Open Google Chrome app." },
    { label: "🔀 Switch to Movement Tab", prompt: "Switch to the Movement Mode tab." },
  ];

  return (
    <div
      className={`flex flex-col bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
        isExpanded ? "h-[560px]" : "h-14"
      } ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold font-mono text-slate-100">Main AI Copilot & Tool Executive</span>
              <Badge variant="outline" className="bg-cyan-950/60 text-cyan-300 border-cyan-700/50 text-[9px] py-0 px-1.5 font-mono">
                Gemini 2.5 Flash + Tools
              </Badge>
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate">
              Direct device control, PyAutoGUI, ADB & Workflow creation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Target device selector */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-md border border-slate-800 text-[10px] font-mono">
            <button
              onClick={() => setTargetDevice("desktop")}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                targetDevice === "desktop" ? "bg-cyan-900 text-cyan-100 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Monitor className="w-2.5 h-2.5" /> Desktop
            </button>
            <button
              onClick={() => setTargetDevice("android")}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                targetDevice === "android" ? "bg-emerald-900 text-emerald-100 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Smartphone className="w-2.5 h-2.5" /> Mobile
            </button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleExportChat}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
            title="Export chat history"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearHistory}
            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
            title="Clear conversation history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Main expanded content */}
      {isExpanded && (
        <>
          {/* Chat Messages Log */}
          <div className="flex-1 overflow-hidden bg-slate-950/60 p-3">
            <ScrollArea className="h-full pr-3">
              <div className="space-y-3.5">
                {messages.map((msg, idx) => {
                  const isUser = msg.role === "user";
                  const isLastAssistant =
                    msg.role === "assistant" &&
                    idx === messages.length - 1 &&
                    messages.some((m) => m.role === "user");

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in`}
                    >
                      <div
                        className={`flex items-start max-w-[90%] md:max-w-[85%] p-3 rounded-2xl shadow-md border ${
                          isUser
                            ? "bg-cyan-950/80 border-cyan-800/60 text-slate-100 rounded-tr-none"
                            : "bg-slate-900 border-slate-800 text-slate-200 rounded-tl-none"
                        }`}
                      >
                        {!isUser && (
                          <div className="p-1 rounded-md bg-cyan-950/80 text-cyan-400 mr-2.5 mt-0.5 shrink-0 border border-cyan-800/50">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}
                        {isUser && (
                          <div className="p-1 rounded-md bg-slate-800 text-slate-300 mr-2 mt-0.5 shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <div className="space-y-2 flex-1 overflow-hidden">
                          <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                            {msg.content}
                          </div>

                          {/* Tool Invocation Badges */}
                          {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                              <span className="text-[10px] font-mono text-cyan-400 font-bold flex items-center gap-1">
                                <Terminal className="w-3 h-3" /> Executed Tool Actions ({msg.toolInvocations.length})
                              </span>
                              <div className="grid grid-cols-1 gap-1.5">
                                {msg.toolInvocations.map((inv, invIdx) => (
                                  <div
                                    key={invIdx}
                                    className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[10px] font-mono"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      {inv.status === "success" ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      ) : (
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                      )}
                                      <span className="font-bold text-slate-200">{inv.name}</span>
                                      <span className="text-slate-400 truncate">
                                        {JSON.stringify(inv.args).slice(0, 45)}
                                      </span>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] py-0 px-1 font-mono ${
                                        inv.status === "success"
                                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                          : "bg-rose-950 text-rose-300 border-rose-800"
                                      }`}
                                    >
                                      {inv.status}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Created Workflow Card */}
                          {msg.createdWorkflow && (
                            <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-cyan-950/40 border border-indigo-500/50 shadow-lg space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 truncate">
                                  <div className="p-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                                    <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                  </div>
                                  <span className="text-xs font-bold text-white truncate">
                                    {msg.createdWorkflow.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Badge className="bg-indigo-900 text-indigo-200 border-indigo-700 text-[9px] font-mono">
                                    {msg.createdWorkflow.stepsCount || msg.createdWorkflow.steps?.length || 0} Steps
                                  </Badge>
                                </div>
                              </div>

                              <p className="text-[10px] text-slate-300 leading-normal">
                                {msg.createdWorkflow.description}
                              </p>

                              {/* Expandable Steps Preview List */}
                              {msg.createdWorkflow.steps && msg.createdWorkflow.steps.length > 0 && (
                                <div className="space-y-1.5 pt-1">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-indigo-300 font-semibold">
                                    <span>Compiled Workflow Actions:</span>
                                    <button
                                      onClick={() => {
                                        const wfId = msg.createdWorkflow!.id;
                                        setExpandedWorkflowIds((prev) => ({ ...prev, [wfId]: !prev[wfId] }));
                                      }}
                                      className="text-cyan-400 hover:text-cyan-300 underline text-[9px]"
                                    >
                                      {expandedWorkflowIds[msg.createdWorkflow.id] ? "Collapse Steps" : `View All ${msg.createdWorkflow.steps.length} Steps`}
                                    </button>
                                  </div>

                                  <div className="space-y-1 max-h-36 overflow-y-auto no-scrollbar rounded-lg p-1 bg-slate-950/90 border border-slate-800">
                                    {msg.createdWorkflow.steps
                                      .slice(0, expandedWorkflowIds[msg.createdWorkflow.id] ? undefined : 3)
                                      .map((step: any, sIdx: number) => (
                                        <div
                                          key={sIdx}
                                          className="flex items-center justify-between p-1.5 rounded bg-slate-900/90 border border-slate-800/80 text-[10px] font-mono"
                                        >
                                          <div className="flex items-center gap-1.5 truncate">
                                            <span className="w-4 h-4 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 flex items-center justify-center font-bold text-[9px] shrink-0">
                                              {sIdx + 1}
                                            </span>
                                            <span className="font-bold text-slate-200 truncate">{step.name || `Step #${sIdx + 1}`}</span>
                                            {step.action && (
                                              <span className="px-1 py-0.2 rounded bg-slate-800 text-[8px] text-cyan-300 font-bold uppercase">
                                                {step.action}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5 text-slate-400 text-[9px] shrink-0">
                                            {step.x !== undefined && step.y !== undefined && (
                                              <span className="text-amber-300/80">({step.x}, {step.y})</span>
                                            )}
                                            {step.delayMs && (
                                              <span className="text-slate-500">{step.delayMs}ms</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    {!expandedWorkflowIds[msg.createdWorkflow.id] && msg.createdWorkflow.steps.length > 3 && (
                                      <div className="text-center py-0.5 text-[9px] font-mono text-slate-500 italic">
                                        + {msg.createdWorkflow.steps.length - 3} more steps in sequence
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons: Run, Extend to Screen, Save, Library */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-indigo-900/60">
                                {onRunWorkflow && (
                                  <Button
                                    size="sm"
                                    onClick={() => onRunWorkflow(msg.createdWorkflow)}
                                    className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold gap-1 shadow-md"
                                  >
                                    <Play className="w-3 h-3 fill-white" /> Run on Device
                                  </Button>
                                )}

                                {onExtendToScreen && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      onExtendToScreen(msg.createdWorkflow);
                                      toast.success(`🔀 Projected "${msg.createdWorkflow?.name}" onto Live Preview overlay!`);
                                    }}
                                    className="h-7 px-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border-cyan-700/60 text-[10px] font-mono gap-1"
                                    title="Display step coordinates & trajectory overlay directly on the live screen preview"
                                  >
                                    <Maximize2 className="w-3 h-3 text-cyan-400" /> Extend to Screen
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (onSendToVisionHud) {
                                      onSendToVisionHud(msg.createdWorkflow);
                                    } else {
                                      window.dispatchEvent(
                                        new CustomEvent("link-workflow-to-vision-hud", {
                                          detail: msg.createdWorkflow,
                                        })
                                      );
                                    }
                                  }}
                                  className="h-7 px-2 bg-purple-950/80 hover:bg-purple-900 text-purple-200 border-purple-700/60 text-[10px] font-mono gap-1 shadow-sm font-semibold"
                                  title="Send and link this workflow directly into the Live Desktop Screen Capture & Vision HUD below for advanced step controls, calibrated execution & replay"
                                >
                                  <Layers className="w-3 h-3 text-purple-400" /> Link to Vision HUD
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if (onSaveWorkflow) {
                                      onSaveWorkflow(msg.createdWorkflow);
                                    } else {
                                      try {
                                        const res = await fetch("/api/mobile-stream/workflows", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            name: msg.createdWorkflow?.name || "AI Workflow",
                                            description: msg.createdWorkflow?.description || "",
                                            category: "AI Created",
                                            actions: (msg.createdWorkflow?.steps || []).map((s: any, idx: number) => ({
                                              id: s.id || `act-${idx}`,
                                              type: s.action || "tap",
                                              x: s.x ? s.x / 1920 : 0.5,
                                              y: s.y ? s.y / 1080 : 0.5,
                                              text: s.text,
                                              key: s.key,
                                              description: s.name,
                                              createdAt: Date.now(),
                                            })),
                                          }),
                                        });
                                        if (res.ok) {
                                          toast.success(`💾 Saved "${msg.createdWorkflow?.name}" to Workflow Library!`);
                                        }
                                      } catch {
                                        toast.error("Failed to save workflow to server.");
                                      }
                                    }
                                  }}
                                  className="h-7 px-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 text-[10px] font-mono gap-1"
                                >
                                  <Layers className="w-3 h-3 text-indigo-400" /> Save to Library
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-1 px-1 text-[9px] font-mono text-slate-400">
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        {isLastAssistant && (
                          <button
                            onClick={() => {
                              const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                              if (lastUserMsg) handleSendMessage(lastUserMsg.content);
                            }}
                            className="hover:text-cyan-400 transition-colors flex items-center gap-0.5"
                          >
                            <RotateCcw className="w-2.5 h-2.5" /> Retry
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="flex items-center gap-2 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl max-w-sm text-xs font-mono text-cyan-300">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>AI Reasoning & Executing Tools...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-3 py-1.5 bg-slate-900/90 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase shrink-0">
              Quick:
            </span>
            {quickPrompts.map((qp, qpIdx) => (
              <button
                key={qpIdx}
                onClick={() => handleSendMessage(qp.prompt)}
                disabled={isLoading}
                className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 hover:border-cyan-500 hover:bg-slate-900 text-[10px] font-mono text-slate-300 hover:text-cyan-300 whitespace-nowrap transition-all shadow-sm shrink-0"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-2.5 bg-slate-950 border-t border-slate-800 flex flex-col gap-1.5 shrink-0"
          >
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Give command (e.g. 'Click submit', 'Minimize phone app', 'Create workflow to login')..."
                className="h-9 text-xs bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus-visible:ring-cyan-500"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !input.trim()}
                className="h-9 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold gap-1.5 shadow-lg shadow-cyan-950 shrink-0"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send</span>
              </Button>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={attachLiveScreen}
                  onChange={(e) => setAttachLiveScreen(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-0 w-3 h-3"
                />
                <span>Attach Live Screen Snapshot Context</span>
              </label>

              <span className="text-slate-400">
                Active View: <strong className="text-slate-300">{currentTab}</strong>
              </span>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
