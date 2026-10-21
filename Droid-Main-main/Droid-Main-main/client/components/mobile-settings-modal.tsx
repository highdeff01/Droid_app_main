import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Settings,
  Save,
  RefreshCw,
  Sliders,
  Wifi,
  Brain,
  Shield,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

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

interface MobileSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: (settings: WorkspaceSettings) => void;
}

export const MobileSettingsModal: React.FC<MobileSettingsModalProps> = ({
  open,
  onOpenChange,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<WorkspaceSettings>({
    autoRecordWorkflows: true,
    recordCadenceMs: 500,
    deadRouteSensitivity: "medium",
    autoRenavigateOnDeadRoute: true,
    autoDismissPopups: true,
    enableBackgroundAudio: false,
    enableMultiWindowHomeSync: false,
    audioFeedbackAlerts: false,
    activeModel: "gemini-2.5-flash",
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [networkInfo, setNetworkInfo] = useState<{
    lanIp: string;
    port: number;
    recommendedMobileUrl: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      loadSettings();
      loadNetworkInfo();
    }
  }, [open]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/mobile-stream/settings");
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.settings) {
          setSettings(d.settings);
        }
      }
    } catch {
      // Keep defaults
    } finally {
      setIsLoading(false);
    }
  };

  const loadNetworkInfo = async () => {
    try {
      const res = await fetch("/api/mobile/network-info");
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setNetworkInfo({
            lanIp: d.lanIp,
            port: d.port,
            recommendedMobileUrl: d.recommendedMobileUrl,
          });
        }
      }
    } catch {}
  };

  const handleSave = async (partialUpdate?: Partial<WorkspaceSettings>) => {
    const updated = { ...settings, ...(partialUpdate || {}) };
    setSettings(updated);
    setIsSaving(true);
    try {
      const res = await fetch("/api/mobile-stream/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.settings) {
          setSettings(d.settings);
          onSettingsSaved?.(d.settings);
        }
        toast.success("Mobile workspace settings saved!");
      } else {
        toast.error("Failed to update settings");
      }
    } catch {
      toast.error("Network error while saving settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 text-slate-100 p-0 shadow-2xl font-sans">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/80 p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-200 shadow-inner">
              <Settings className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                Mobile Stream & Workspace Settings
                <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px] font-mono">
                  Live Sync
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Configure auto-recording, dead-route recovery, AI vision model, and mobile device bridge.
              </DialogDescription>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1.5 shadow-md shadow-emerald-950/50"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </div>

        <div className="p-5 space-y-4">
          {/* Network & APK Host Diagnostics Card */}
          {networkInfo && (
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  Local LAN Host for Mobile APK & Remote
                </span>
                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[9px] font-mono">
                  LAN IP: {networkInfo.lanIp}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                Mobile APKs and phones require connecting to your PC's LAN IP instead of <code className="text-amber-300">localhost</code>.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={networkInfo.recommendedMobileUrl}
                  className="h-7 text-xs bg-slate-950 border-slate-700 font-mono text-cyan-200"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(networkInfo.recommendedMobileUrl);
                    setCopiedUrl(true);
                    toast.success("Copied mobile LAN link to clipboard!");
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="h-7 px-2.5 border-slate-700 hover:border-slate-500 text-xs shrink-0"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          )}

          {/* Toggle Switches */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition">
              <div className="space-y-0.5 pr-2">
                <span className="font-bold text-white block">Auto-Record Workflow Steps</span>
                <p className="text-[11px] text-slate-400">
                  Automatically records physical taps, screen transitions, and navigation nodes into WorkTree.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoRecordWorkflows}
                onChange={(e) => handleSave({ autoRecordWorkflows: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition">
              <div className="space-y-0.5 pr-2">
                <span className="font-bold text-white block">Auto-Renavigate on Dead Route</span>
                <p className="text-[11px] text-slate-400">
                  Automatically triggers autonomous backtracking or alternative recovery when screen freeze is detected.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoRenavigateOnDeadRoute}
                onChange={(e) => handleSave({ autoRenavigateOnDeadRoute: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition">
              <div className="space-y-0.5 pr-2">
                <span className="font-bold text-white block">Auto-Dismiss Popups & Dialogs</span>
                <p className="text-[11px] text-slate-400">
                  Automatically detects and taps 'Cancel', 'Dismiss', or 'Close' on interrupting permission modals.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoDismissPopups}
                onChange={(e) => handleSave({ autoDismissPopups: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition">
              <div className="space-y-0.5 pr-2">
                <span className="font-bold text-white block">Multi-Window Home Sync</span>
                <p className="text-[11px] text-slate-400">
                  Preserves background task queue and execution state even when returning to the device Home screen.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableMultiWindowHomeSync}
                onChange={(e) => handleSave({ enableMultiWindowHomeSync: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Dead Route Sensitivity */}
          <div className="space-y-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
            <label className="font-bold text-white text-xs block">Dead Route Sensitivity:</label>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => handleSave({ deadRouteSensitivity: lvl })}
                  className={`p-2 rounded-lg border text-center font-mono text-xs uppercase font-bold transition-all ${
                    settings.deadRouteSensitivity === lvl
                      ? "bg-emerald-950 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Active Gemini Vision Model */}
          <div className="space-y-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
            <label className="font-bold text-white text-xs block flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              Active Vision AI Perception & Planner Model:
            </label>
            <select
              value={settings.activeModel}
              onChange={(e) => handleSave({ activeModel: e.target.value })}
              className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended - Ultra Low Latency)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Visual Reasoning)</option>
              <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Lightweight Fast)</option>
            </select>
          </div>

          {/* Quick Actions Footer */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("sightline-reset-app-state"));
                }
                toast.success("🔄 Baseline State Reset dispatched");
              }}
              className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-950/40 gap-1.5"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              Reset Baseline State
            </Button>

            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
