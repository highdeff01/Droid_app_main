import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Settings,
  Globe,
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Shield,
  Monitor,
  Smartphone,
  Server,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

export const DEFAULT_MODEL_URL = "https://quantumclaw.net/ollama/api/chat";
export const DEFAULT_MODEL_NAME = "qwen3.5:2b";

export interface GlobalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: {
    modelUrl: string;
    model: string;
    driftPx: number;
    antiLoop: boolean;
    speedMs: number;
    targetDevice: "desktop" | "android";
  }) => void;
}

export function GlobalSettingsModal({
  open,
  onOpenChange,
  onSettingsSaved,
}: GlobalSettingsModalProps) {
  const [modelUrl, setModelUrl] = useState<string>(DEFAULT_MODEL_URL);
  const [modelName, setModelName] = useState<string>(DEFAULT_MODEL_NAME);
  const [targetDevice, setTargetDevice] = useState<"desktop" | "android">("desktop");
  const [driftPx, setDriftPx] = useState<number>(0);
  const [antiLoop, setAntiLoop] = useState<boolean>(true);
  const [speedMs, setSpeedMs] = useState<number>(400);
  const [autoHeal, setAutoHeal] = useState<boolean>(true);

  // Testing status
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem("ai_model_url");
    const savedModel = localStorage.getItem("ai_model_name");
    const savedDrift = localStorage.getItem("ai_drift_px");
    const savedSpeed = localStorage.getItem("ai_speed_ms");

    if (savedUrl) setModelUrl(savedUrl);
    else setModelUrl(DEFAULT_MODEL_URL);

    if (savedModel) setModelName(savedModel);
    if (savedDrift) setDriftPx(Number(savedDrift));
    if (savedSpeed) setSpeedMs(Number(savedSpeed));

    // Also fetch current server settings
    fetch("/api/ai/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings?.modelUrl) {
          setModelUrl(data.settings.modelUrl);
          if (data.settings.model) setModelName(data.settings.model);
        }
      })
      .catch(() => {
        // Fallback to local
      });
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/test-endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: modelUrl.trim() || DEFAULT_MODEL_URL,
          model: modelName.trim() || DEFAULT_MODEL_NAME,
        }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        latencyMs: data.latencyMs,
        message: data.message || (data.success ? "Endpoint reachable & responsive" : "Connection failed"),
      });
      if (data.success) {
        toast.success(`Model URL verified! Latency: ${data.latencyMs}ms`);
      } else {
        toast.error(`Endpoint check: ${data.message || "Unreachable"}`);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Failed to connect to model endpoint");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const cleanUrl = modelUrl.trim() || DEFAULT_MODEL_URL;
    const cleanModel = modelName.trim() || DEFAULT_MODEL_NAME;

    localStorage.setItem("ai_model_url", cleanUrl);
    localStorage.setItem("ai_model_name", cleanModel);
    localStorage.setItem("ai_drift_px", String(driftPx));
    localStorage.setItem("ai_speed_ms", String(speedMs));

    try {
      await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelUrl: cleanUrl,
          model: cleanModel,
          driftPx,
          antiLoop,
          speedMs,
          targetDevice,
          autoHeal,
        }),
      });
    } catch {
      // Ignored
    }

    onSettingsSaved?.({
      modelUrl: cleanUrl,
      model: cleanModel,
      driftPx,
      antiLoop,
      speedMs,
      targetDevice,
    });

    toast.success("Settings applied and model URL saved successfully!");
    onOpenChange(false);
  };

  const handleResetDefaults = () => {
    setModelUrl(DEFAULT_MODEL_URL);
    setModelName(DEFAULT_MODEL_NAME);
    setDriftPx(0);
    setAntiLoop(true);
    setSpeedMs(400);
    setAutoHeal(true);
    setTestResult(null);
    toast.info("Reset to default configuration");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-950 border-cyan-500/50 text-white font-sans shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500 flex items-center justify-center text-cyan-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                System & AI Model Settings
                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[10px] font-mono font-bold">
                  ACTIVE
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Configure primary AI model endpoint URL, perception engines & execution parameters.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 font-mono text-xs">
          {/* Section 1: AI Model URL & Endpoint */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-300 font-bold">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>Primary AI Model URL & Endpoint</span>
              </div>
              <Badge className="bg-cyan-950 text-cyan-200 border-cyan-800 text-[10px]">
                Ollama / Qwen Compatible
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs font-mono">Model Chat / Generate Endpoint URL</Label>
              <div className="flex gap-2">
                <Input
                  value={modelUrl}
                  onChange={(e) => setModelUrl(e.target.value)}
                  placeholder="https://quantumclaw.net/ollama/api/chat"
                  className="bg-slate-950 border-slate-700 text-white font-mono text-xs h-9 focus-visible:ring-cyan-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="h-9 px-3 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-600 shrink-0 font-bold gap-1.5"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing...
                    </>
                  ) : (
                    <>
                      <Activity className="w-3.5 h-3.5" /> Ping Endpoint
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Quick Endpoint Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setModelUrl("https://quantumclaw.net/ollama/api/chat")}
                  className={`text-[11px] px-2.5 py-1 rounded-md border font-bold transition-all ${
                    modelUrl === "https://quantumclaw.net/ollama/api/chat"
                      ? "bg-cyan-950 text-cyan-300 border-cyan-500 shadow-sm"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  ⚡ QuantumClaw Remote (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setModelUrl("http://localhost:11434/api/chat")}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                    modelUrl === "http://localhost:11434/api/chat"
                      ? "bg-cyan-950 text-cyan-300 border-cyan-500"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  💻 Local Ollama (:11434)
                </button>
                <button
                  type="button"
                  onClick={() => setModelUrl("http://127.0.0.1:11434/api/chat")}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                    modelUrl === "http://127.0.0.1:11434/api/chat"
                      ? "bg-cyan-950 text-cyan-300 border-cyan-500"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  🔌 127.0.0.1 Daemon
                </button>
              </div>
            </div>

            {/* Test Result Indicator */}
            {testResult && (
              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                  testResult.success
                    ? "bg-emerald-950/70 border-emerald-700 text-emerald-300"
                    : "bg-amber-950/70 border-amber-700 text-amber-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.latencyMs !== undefined && testResult.latencyMs > 0 && (
                  <Badge className="bg-slate-950 text-cyan-300 border-cyan-800 text-[10px]">
                    {testResult.latencyMs} ms
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Model & Perception Architecture */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300 font-bold">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>Active AI Perception & Reasoning Model</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { id: "qwen3.5:2b", label: "Qwen 3.5 2B (Vision + Act)", tag: "Fast / Default" },
                { id: "qwen2.5-vl:7b", label: "Qwen 2.5-VL 7B Instruct", tag: "High Accuracy" },
                { id: "deepseek-r1:8b", label: "DeepSeek R1 Distill", tag: "Deep Reasoning" },
                { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash Cloud", tag: "Cloud Grounded" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelName(m.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                    modelName === m.id
                      ? "bg-purple-950/70 border-purple-500 text-white shadow-sm"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div>
                    <p className="font-bold text-[11px] text-slate-100">{m.label}</p>
                    <p className="text-[10px] text-slate-400">{m.id}</p>
                  </div>
                  <Badge className="text-[9px] bg-slate-900 text-purple-300 border-purple-800">
                    {m.tag}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Execution & Device Hardware Controls */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-inner">
            <div className="flex items-center gap-2 text-emerald-300 font-bold">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Hardware Execution & Anti-Loop Safeguards</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Target Device */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-200">Default Target Device</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={targetDevice === "desktop" ? "default" : "outline"}
                    onClick={() => setTargetDevice("desktop")}
                    className={`h-7 text-xs flex-1 gap-1.5 ${
                      targetDevice === "desktop" ? "bg-cyan-600 text-white font-bold" : "border-slate-800 text-slate-400"
                    }`}
                  >
                    <Monitor className="w-3 h-3" /> Desktop
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={targetDevice === "android" ? "default" : "outline"}
                    onClick={() => setTargetDevice("android")}
                    className={`h-7 text-xs flex-1 gap-1.5 ${
                      targetDevice === "android" ? "bg-emerald-600 text-white font-bold" : "border-slate-800 text-slate-400"
                    }`}
                  >
                    <Smartphone className="w-3 h-3" /> Android
                  </Button>
                </div>
              </div>

              {/* Anti-Loop Guard */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-[11px] text-slate-200">Anti-Loop Deadlock Guard</p>
                  <p className="text-[10px] text-slate-400">Prevents repetitive stuck loops</p>
                </div>
                <Switch checked={antiLoop} onCheckedChange={setAntiLoop} />
              </div>

              {/* Auto-Heal */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-[11px] text-slate-200">Autonomous Auto-Heal</p>
                  <p className="text-[10px] text-slate-400">Self-corrects drifted bounding boxes</p>
                </div>
                <Switch checked={autoHeal} onCheckedChange={setAutoHeal} />
              </div>

              {/* Drift PX */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[11px] text-slate-200">Mouse Drift Sensitivity</span>
                  <span className="text-[10px] font-bold text-cyan-300">{driftPx} px</span>
                </div>
                <Slider
                  value={[driftPx]}
                  min={0}
                  max={20}
                  step={1}
                  onValueChange={([v]) => setDriftPx(v)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs font-mono text-slate-400 hover:text-white gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs font-mono border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="text-xs font-mono bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 shadow-md shadow-cyan-500/20"
            >
              Save & Apply Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
