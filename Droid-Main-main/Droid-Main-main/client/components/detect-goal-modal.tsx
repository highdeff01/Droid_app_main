import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Bot,
  Sparkles,
  Zap,
  Target,
  Search,
  Sliders,
  CheckCircle2,
  ArrowRight,
  Eye,
  Layers,
  Terminal,
  Play,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface DetectGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunGoal: (goalPrompt: string, config: { model: string; confidence: number; autoExecute: boolean; targetArea: string }) => void;
  currentScreenTitle?: string;
}

export const DetectGoalModal: React.FC<DetectGoalModalProps> = ({
  isOpen,
  onClose,
  onRunGoal,
  currentScreenTitle = "Live Screen",
}) => {
  const [goalInput, setGoalInput] = useState<string>("Detect all interactive buttons and formulate goal workflow");
  const [confidence, setConfidence] = useState<number>(90);
  const [autoExecute, setAutoExecute] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>("qwen3.5:2b");
  const [targetArea, setTargetArea] = useState<string>("full_screen");

  const goalPresets = [
    { label: "Find & Click Primary Action", prompt: "Locate primary submit / action button and execute click with zero drift" },
    { label: "Search & Type Query", prompt: "Find search input bar, click and type search query" },
    { label: "Calculator Math Flow", prompt: "Open calculator, click 125 * 8, assert 1000 result" },
    { label: "Extract UI Bounding Boxes", prompt: "Detect all text fields, icons, buttons and output normalized coordinate boxes" },
    { label: "Self-Healing App Navigation", prompt: "Navigate through menus, recover from layout shift or dialogs, and assert final screen" },
  ];

  const handleStartDetection = () => {
    if (!goalInput.trim()) {
      toast.error("Please enter an autonomous goal prompt");
      return;
    }

    onRunGoal(goalInput.trim(), {
      model: selectedModel,
      confidence: confidence / 100,
      autoExecute,
      targetArea,
    });
    toast.success(`🎯 Goal set: "${goalInput.slice(0, 30)}..." - Starting AI perception`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-100 font-mono shadow-2xl p-6">
        <DialogHeader className="pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-emerald-400 flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-400" />
              <span>AI Vision Goal & UI Element Detector</span>
            </DialogTitle>
            <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[10px]">
              {currentScreenTitle}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Formulate high-level automation goals, configure perception models, and trigger instant detection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Goal Input Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-cyan-400" />
              <span>Autonomous Goal Directive:</span>
            </label>
            <Input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Describe what the AI should detect, click, or automate..."
              className="bg-slate-900 border-slate-700 text-xs text-cyan-200 focus:border-cyan-400"
            />
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-slate-400 font-bold block">Quick Goal Templates:</span>
            <div className="flex flex-wrap gap-1.5">
              {goalPresets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => setGoalInput(preset.prompt)}
                  className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-[10px] text-slate-300 hover:text-cyan-300 transition-all text-left"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Perception Parameters */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs">
            {/* Model Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300">Vision Perception Model:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-cyan-300 outline-none"
              >
                <option value="qwen3.5:2b">Qwen 3.5 2B (QuantumClaw Fast - Default)</option>
                <option value="qwen2.5-vl:7b">Qwen 2.5 VL 7B (High-Precision OCR)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Cloud Vision Grounding)</option>
                <option value="deepseek-r1:8b">DeepSeek R1 8B (Deep Reasoning)</option>
              </select>
            </div>

            {/* Target Area */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300">Inspection Focus Area:</label>
              <select
                value={targetArea}
                onChange={(e) => setTargetArea(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="full_screen">Full Screen (1920×1080 Normalized)</option>
                <option value="top_header">Top Navigation & Status Bar</option>
                <option value="center_content">Center Work Area / Window</option>
                <option value="bottom_dock">Bottom Taskbar / Actions</option>
              </select>
            </div>

            {/* Confidence Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Minimum Confidence:</span>
                <span className="text-emerald-400 font-bold">{confidence}%</span>
              </div>
              <Slider
                value={[confidence]}
                min={50}
                max={99}
                step={1}
                onValueChange={([v]) => setConfidence(v)}
              />
            </div>

            {/* Auto Execute Toggle */}
            <div className="flex items-center justify-between p-1.5 bg-slate-950 rounded border border-slate-800">
              <div>
                <span className="text-slate-200 font-bold block text-[11px]">Auto-Execute Steps</span>
                <span className="text-[9px] text-slate-400">Execute detected actions immediately</span>
              </div>
              <Switch checked={autoExecute} onCheckedChange={setAutoExecute} />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-9 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartDetection}
              className="h-9 px-5 text-xs font-mono font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-xl shadow-emerald-950 border border-emerald-400/40 gap-2"
            >
              <Sparkles className="w-4 h-4" /> Start AI Detection & Goal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
