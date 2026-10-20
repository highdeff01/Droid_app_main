import React, { useState, useEffect, useRef } from "react";
import {
  MousePointer,
  MousePointerClick,
  Plus,
  Crosshair,
  Copy,
  Terminal,
  Clock,
  Sparkles,
  ShieldCheck,
  Tag,
  Play,
  Edit,
  Trash2,
  CopyPlus,
  Camera,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Move,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { audioSynthesizer } from "@/lib/audio-synthesizer";

export interface ContextMenuTarget {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  containerWidth: number;
  containerHeight: number;
  step?: {
    id: string;
    stepNumber: number;
    name: string;
    action: string;
    x: number;
    y: number;
    toX?: number;
    toY?: number;
    text?: string;
    keyPayload?: string;
    delayMs?: number;
    status?: string;
  } | null;
  ocrElement?: {
    text: string;
    confidence: number;
    bounds?: { x: number; y: number; width: number; height: number };
  } | null;
}

export interface InteractiveContextMenuProps {
  target: ContextMenuTarget | null;
  isOpen: boolean;
  onClose: () => void;
  // Hardware Action Handlers
  onDirectHardwareAction?: (
    action: "click" | "right_click" | "double_click" | "move" | "type" | "press_key" | "swipe_up" | "swipe_down" | "swipe_left" | "swipe_right",
    x: number,
    y: number,
    extra?: any
  ) => void;
  // Sequence Action Handlers
  onAddSequenceStep?: (step: {
    action: string;
    x: number;
    y: number;
    toX?: number;
    toY?: number;
    name: string;
    text?: string;
    keyPayload?: string;
    delayMs?: number;
  }) => void;
  // Step Node Action Handlers (if right-clicking existing step)
  onExecuteStepOnPC?: (stepId: string) => void;
  onEditStep?: (stepId: string) => void;
  onDuplicateStep?: (stepId: string) => void;
  onDeleteStep?: (stepId: string) => void;
  onRetakeStepScreenshot?: (stepId: string) => void;
  // AI & Vision Handlers
  onInspectOCR?: (x: number, y: number) => void;
  onVerifyIntegrity?: (x: number, y: number) => void;
  onTellMainAiToMove?: (x: number, y: number) => void;
  onTag3WayEntity?: (type: "goal" | "context" | "distractor", x: number, y: number) => void;
  onOpenStepManagerModal?: (coords: { x: number; y: number }) => void;
  onOpenDiffFrameTester?: (coords: { x: number; y: number }) => void;
}

export const InteractiveContextMenu: React.FC<InteractiveContextMenuProps> = ({
  target,
  isOpen,
  onClose,
  onDirectHardwareAction,
  onAddSequenceStep,
  onExecuteStepOnPC,
  onEditStep,
  onDuplicateStep,
  onDeleteStep,
  onRetakeStepScreenshot,
  onInspectOCR,
  onVerifyIntegrity,
  onTellMainAiToMove,
  onTag3WayEntity,
  onOpenStepManagerModal,
  onOpenDiffFrameTester,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"quick_steps" | "direct_pc" | "ai_vision">("quick_steps");

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const { x, y, clientX, clientY, step } = target;

  // Position calculation to stay within screen viewport bounds
  const menuWidth = 280;
  const menuHeight = step ? 420 : 510;
  let posX = clientX;
  let posY = clientY;

  if (typeof window !== "undefined") {
    if (posX + menuWidth > window.innerWidth - 16) {
      posX = window.innerWidth - menuWidth - 16;
    }
    if (posY + menuHeight > window.innerHeight - 16) {
      posY = Math.max(16, window.innerHeight - menuHeight - 16);
    }
  }

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${x}, ${y}`);
    try {
      audioSynthesizer?.playLaserShot?.();
    } catch {}
    toast.success(`Copied coordinates: (${x}, ${y})`, {
      description: "Native 1920x1080 screen space",
    });
    onClose();
  };

  const handlePromptTypeText = (asStep = true) => {
    const input = prompt(`Enter text to type at (${x}, ${y}):`);
    if (input !== null && input.trim()) {
      if (asStep && onAddSequenceStep) {
        onAddSequenceStep({
          action: "type_text",
          x,
          y,
          name: `Type "${input.slice(0, 15)}"`,
          text: input,
          delayMs: 500,
        });
        toast.success(`Added Type Step: "${input}" @ (${x}, ${y})`);
      } else if (onDirectHardwareAction) {
        onDirectHardwareAction("type", x, y, { text: input });
        toast.success(`Dispatched Type: "${input}"`);
      }
    }
    onClose();
  };

  const handleAddDelayStep = (delayMs: number) => {
    onAddSequenceStep?.({
      action: "wait",
      x,
      y,
      name: `Wait ${delayMs >= 1000 ? `${delayMs / 1000}s` : `${delayMs}ms`}`,
      delayMs,
    });
    try {
      audioSynthesizer?.playSuccessChime?.();
    } catch {}
    toast.success(`Added Wait ${delayMs}ms step to sequence`);
    onClose();
  };

  const handleAddKeyStep = (key: string, label: string) => {
    onAddSequenceStep?.({
      action: "press_key",
      x,
      y,
      name: `Press [${label}]`,
      keyPayload: key,
      delayMs: 300,
    });
    try {
      audioSynthesizer?.playSuccessChime?.();
    } catch {}
    toast.success(`Added Key [${label}] step @ (${x}, ${y})`);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      id="screen-interactive-context-menu"
      style={{
        position: "fixed",
        left: `${posX}px`,
        top: `${posY}px`,
        zIndex: 99999,
      }}
      className="w-72 bg-slate-950/95 backdrop-blur-md border border-cyan-500/50 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85),0_0_25px_rgba(6,182,212,0.3)] text-slate-200 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 font-sans"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header with Coordinates and Target Title */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/90 px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-cyan-950 border border-cyan-400/60 flex items-center justify-center shrink-0">
            <Crosshair className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold font-mono text-cyan-300 truncate">
              {step ? `Step #${step.stepNumber}: ${step.name}` : `Live Stream (${x}, ${y})`}
            </div>
            <div className="text-[9px] font-mono text-slate-400 flex items-center gap-1.5">
              <span>1920×1080 Native</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">Right-Click Settings</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors ml-1"
          title="Close context menu [Esc]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs navigation for Screen / Live stream targeting */}
      {!step && (
        <div className="grid grid-cols-3 bg-slate-900/90 border-b border-slate-800 text-[10px] font-mono font-bold">
          <button
            onClick={() => setActiveTab("quick_steps")}
            className={`py-1.5 text-center transition-colors border-b-2 flex items-center justify-center gap-1 ${
              activeTab === "quick_steps"
                ? "border-emerald-400 text-emerald-300 bg-emerald-950/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Plus className="w-3 h-3 text-emerald-400" />
            <span>Set Steps</span>
          </button>
          <button
            onClick={() => setActiveTab("direct_pc")}
            className={`py-1.5 text-center transition-colors border-b-2 flex items-center justify-center gap-1 ${
              activeTab === "direct_pc"
                ? "border-cyan-400 text-cyan-300 bg-cyan-950/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <MousePointerClick className="w-3 h-3 text-cyan-400" />
            <span>Direct PC</span>
          </button>
          <button
            onClick={() => setActiveTab("ai_vision")}
            className={`py-1.5 text-center transition-colors border-b-2 flex items-center justify-center gap-1 ${
              activeTab === "ai_vision"
                ? "border-purple-400 text-purple-300 bg-purple-950/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>AI Vision</span>
          </button>
        </div>
      )}

      <div className="p-2 space-y-1.5 text-xs max-h-[460px] overflow-y-auto">
        {/* IF TARGETING AN EXISTING STEP PIN */}
        {step ? (
          <>
            <div className="px-2 py-0.5 text-[9px] font-mono font-bold text-amber-400 tracking-wider">
              STEP SETTINGS & EXECUTION
            </div>

            <button
              onClick={() => {
                onExecuteStepOnPC?.(step.id);
                try {
                  audioSynthesizer?.playActionCue?.();
                } catch {}
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-emerald-300 bg-emerald-950/30 hover:bg-emerald-950/70 hover:text-emerald-200 text-left transition-colors font-semibold border border-emerald-800/40"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
              <span>⚡ Execute Step #{step.stepNumber} on Device</span>
            </button>

            <button
              onClick={() => {
                onEditStep?.(step.id);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-cyan-300 text-left transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>⚙️ Step Settings & Coordinates</span>
            </button>

            <button
              onClick={() => {
                onOpenDiffFrameTester?.({ x: step.x, y: step.y });
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-200 text-left transition-colors font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>🧪 Test Step on Diff Frames...</span>
            </button>

            <button
              onClick={() => {
                onRetakeStepScreenshot?.(step.id);
                try {
                  audioSynthesizer?.playShutterSound?.();
                } catch {}
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-amber-300 text-left transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>📸 Retake Reference Frame</span>
            </button>

            <button
              onClick={() => {
                onDuplicateStep?.(step.id);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-cyan-300 text-left transition-colors"
            >
              <CopyPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Duplicate Step Node</span>
            </button>

            <div className="my-1 border-t border-slate-800" />

            <button
              onClick={() => {
                onDeleteStep?.(step.id);
                try {
                  audioSynthesizer?.playAlarmSound?.();
                } catch {}
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-950/60 hover:text-red-300 text-left transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Step #{step.stepNumber}</span>
            </button>
          </>
        ) : (
          /* IF TARGETING SCREEN CANVAS / LIVE STREAM */
          <>
            {/* TAB 1: QUICK STEP CREATION & SETTINGS */}
            {activeTab === "quick_steps" && (
              <div className="space-y-1">
                <div className="px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-400 tracking-wider">
                  CREATE STEP AT ({x}, {y})
                </div>

                <button
                  onClick={() => {
                    onAddSequenceStep?.({
                      action: "click",
                      x,
                      y,
                      name: `Click @ (${x}, ${y})`,
                      delayMs: 500,
                    });
                    try {
                      audioSynthesizer?.playSuccessChime?.();
                    } catch {}
                    toast.success(`Added Left-Click Step @ (${x}, ${y})`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-emerald-950/50 hover:text-emerald-300 text-left transition-colors font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>➕ Add Left-Click Step</span>
                </button>

                <button
                  onClick={() => {
                    onAddSequenceStep?.({
                      action: "right_click",
                      x,
                      y,
                      name: `Right Click @ (${x}, ${y})`,
                      delayMs: 500,
                    });
                    try {
                      audioSynthesizer?.playSuccessChime?.();
                    } catch {}
                    toast.success(`Added Right-Click Step @ (${x}, ${y})`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-amber-950/50 hover:text-amber-300 text-left transition-colors font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>🖱️ Add Right-Click Step</span>
                </button>

                <button
                  onClick={() => {
                    onAddSequenceStep?.({
                      action: "double_click",
                      x,
                      y,
                      name: `Double Click @ (${x}, ${y})`,
                      delayMs: 500,
                    });
                    try {
                      audioSynthesizer?.playSuccessChime?.();
                    } catch {}
                    toast.success(`Added Double-Click Step @ (${x}, ${y})`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-cyan-950/50 hover:text-cyan-300 text-left transition-colors"
                >
                  <MousePointerClick className="w-3.5 h-3.5 text-cyan-400" />
                  <span>👆 Add Double-Click Step</span>
                </button>

                <button
                  onClick={() => handlePromptTypeText(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-purple-950/50 hover:text-purple-300 text-left transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span>⌨️ Add Type Text Step...</span>
                </button>

                {/* Quick Hotkey Steps */}
                <div className="px-2 pt-1 text-[9px] font-mono font-bold text-slate-400 tracking-wider">
                  HOTKEY / KEYBOARD STEPS
                </div>
                <div className="grid grid-cols-3 gap-1 px-1">
                  {[
                    { key: "Enter", label: "Enter ↵" },
                    { key: "Tab", label: "Tab ⇥" },
                    { key: "Escape", label: "Esc" },
                    { key: "Space", label: "Space" },
                    { key: "Backspace", label: "Backspace" },
                    { key: "ArrowDown", label: "Down ↓" },
                  ].map((k) => (
                    <button
                      key={k.key}
                      onClick={() => handleAddKeyStep(k.key, k.label)}
                      className="px-1.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-mono font-bold border border-slate-700 hover:border-cyan-400 text-center transition-colors truncate"
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {/* Quick Delay Steps */}
                <div className="px-2 pt-1 text-[9px] font-mono font-bold text-slate-400 tracking-wider">
                  WAIT / DELAY STEPS
                </div>
                <div className="grid grid-cols-3 gap-1 px-1">
                  {[500, 1000, 2000].map((ms) => (
                    <button
                      key={ms}
                      onClick={() => handleAddDelayStep(ms)}
                      className="px-1.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 text-[10px] font-mono font-bold border border-slate-700 hover:border-amber-400 text-center transition-colors"
                    >
                      ⏳ {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                    </button>
                  ))}
                </div>

                <div className="my-1 border-t border-slate-800" />

                <button
                  onClick={() => {
                    onOpenStepManagerModal?.({ x, y });
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 bg-cyan-950/40 hover:bg-cyan-950/80 hover:text-cyan-200 text-left transition-colors font-bold border border-cyan-800/50"
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>⚙️ Full Step Settings & Config...</span>
                </button>
              </div>
            )}

            {/* TAB 2: DIRECT PC / HARDWARE DISPATCH */}
            {activeTab === "direct_pc" && (
              <div className="space-y-1">
                <div className="px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-400 tracking-wider">
                  DIRECT HARDWARE DISPATCH
                </div>

                <button
                  onClick={() => {
                    onDirectHardwareAction?.("click", x, y);
                    try {
                      audioSynthesizer?.playActionCue?.();
                    } catch {}
                    toast.success(`Dispatched Left-Click at (${x}, ${y})`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-emerald-300 hover:bg-emerald-950/60 hover:text-emerald-200 text-left transition-colors font-semibold"
                >
                  <MousePointerClick className="w-3.5 h-3.5 text-emerald-400" />
                  <span>⚡ Direct Left-Click</span>
                </button>

                <button
                  onClick={() => {
                    onDirectHardwareAction?.("right_click", x, y);
                    try {
                      audioSynthesizer?.playActionCue?.();
                    } catch {}
                    toast.success(`Dispatched Right-Click at (${x}, ${y})`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-300 hover:bg-amber-950/60 hover:text-amber-200 text-left transition-colors font-semibold"
                >
                  <MousePointer className="w-3.5 h-3.5 text-amber-400" />
                  <span>🖱️ Direct Right-Click</span>
                </button>

                <button
                  onClick={() => {
                    onDirectHardwareAction?.("double_click", x, y);
                    try {
                      audioSynthesizer?.playActionCue?.();
                    } catch {}
                    toast.success(`Dispatched Double-Click at (${x}, ${y})`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-200 text-left transition-colors font-semibold"
                >
                  <MousePointerClick className="w-3.5 h-3.5 text-cyan-400" />
                  <span>👆 Direct Double-Click</span>
                </button>

                {/* Direct Swipe Actions Group */}
                <div className="px-2 pt-1 text-[9px] font-mono font-bold text-indigo-400 tracking-wider">
                  TOUCH & GESTURE SWIPES
                </div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    onClick={() => {
                      onDirectHardwareAction?.("swipe_up", x, y);
                      try { audioSynthesizer?.playLaserShot?.(); } catch {}
                      toast.success(`Dispatched Swipe Up ⬆️`);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-800/60"
                  >
                    <ArrowUp className="w-3 h-3 text-indigo-400" />
                    <span>Swipe Up</span>
                  </button>
                  <button
                    onClick={() => {
                      onDirectHardwareAction?.("swipe_down", x, y);
                      try { audioSynthesizer?.playLaserShot?.(); } catch {}
                      toast.success(`Dispatched Swipe Down ⬇️`);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-800/60"
                  >
                    <ArrowDown className="w-3 h-3 text-indigo-400" />
                    <span>Swipe Down</span>
                  </button>
                  <button
                    onClick={() => {
                      onDirectHardwareAction?.("swipe_left", x, y);
                      try { audioSynthesizer?.playLaserShot?.(); } catch {}
                      toast.success(`Dispatched Swipe Left ⬅️`);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-800/60"
                  >
                    <ArrowLeft className="w-3 h-3 text-indigo-400" />
                    <span>Swipe Left</span>
                  </button>
                  <button
                    onClick={() => {
                      onDirectHardwareAction?.("swipe_right", x, y);
                      try { audioSynthesizer?.playLaserShot?.(); } catch {}
                      toast.success(`Dispatched Swipe Right ➡️`);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-800/60"
                  >
                    <ArrowRight className="w-3 h-3 text-indigo-400" />
                    <span>Swipe Right</span>
                  </button>
                </div>

                <button
                  onClick={() => handlePromptTypeText(false)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-cyan-300 text-left transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span>Type Text Instantly on PC...</span>
                </button>
              </div>
            )}

            {/* TAB 3: AI VISION & CROSS-REFERENCE */}
            {activeTab === "ai_vision" && (
              <div className="space-y-1">
                <div className="px-2 py-0.5 text-[9px] font-mono font-bold text-purple-400 tracking-wider">
                  AI VISION & OCR REASONING
                </div>

                <button
                  onClick={() => {
                    onTellMainAiToMove?.(x, y);
                    try {
                      audioSynthesizer?.playLaserShot?.();
                    } catch {}
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-pink-300 text-left transition-colors"
                >
                  <Move className="w-3.5 h-3.5 text-pink-400" />
                  <span>🤖 Tell Main AI to Focus Here</span>
                </button>

                <button
                  onClick={() => {
                    onInspectOCR?.(x, y);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-cyan-300 text-left transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Inspect OCR & Elements at Point</span>
                </button>

                <button
                  onClick={() => {
                    onVerifyIntegrity?.(x, y);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-900 hover:text-amber-300 text-left transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Verify Live Frame Integrity</span>
                </button>

                <button
                  onClick={() => {
                    onOpenDiffFrameTester?.({ x, y });
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-200 text-left transition-colors font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>🧪 Test on Diff Frames / Screenshots...</span>
                </button>

                {/* 3-Way Cross Reference Tagging Sub-Group */}
                <div className="px-2 pt-1 text-[9px] font-mono font-bold text-slate-400 tracking-wider">
                  ENTITY TAGGING
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      onTag3WayEntity?.("goal", x, y);
                      try {
                        audioSynthesizer?.playSuccessChime?.();
                      } catch {}
                      toast.success(`Tagged as 🎯 Goal Entity @ (${x}, ${y})`);
                      onClose();
                    }}
                    className="flex-1 text-[10px] font-mono font-bold bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 py-1 rounded text-center transition-colors"
                    title="Tag as Goal-Accepted Entity (>90%)"
                  >
                    🟢 Goal
                  </button>
                  <button
                    onClick={() => {
                      onTag3WayEntity?.("context", x, y);
                      toast.info(`Tagged as 🗂️ Context Entity @ (${x}, ${y})`);
                      onClose();
                    }}
                    className="flex-1 text-[10px] font-mono font-bold bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-700/60 py-1 rounded text-center transition-colors"
                    title="Tag as Workflow Context Entity"
                  >
                    🟣 Context
                  </button>
                  <button
                    onClick={() => {
                      onTag3WayEntity?.("distractor", x, y);
                      toast.warning(`Tagged as 🛑 Distractor Entity @ (${x}, ${y})`);
                      onClose();
                    }}
                    className="flex-1 text-[10px] font-mono font-bold bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-700/60 py-1 rounded text-center transition-colors"
                    title="Tag as Distractor Entity (Exclude)"
                  >
                    🔴 Distractor
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="my-1 border-t border-slate-800" />

        {/* Copy Coordinates Action */}
        <button
          onClick={handleCopyCoords}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-900 hover:text-white text-left transition-colors font-mono text-[11px]"
        >
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copy Coordinates</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-bold">
            {x}, {y}
          </span>
        </button>
      </div>
    </div>
  );
};
