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
import {
  Smartphone,
  Download,
  Camera,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  MonitorPlay,
  Terminal,
  ExternalLink,
  Zap,
} from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { toast } from "sonner";

interface ApkAndPwaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMode?: (mode: "screen" | "camera_back" | "virtual_screen" | "mirror_pc") => void;
  initialReason?: string;
}

export const ApkAndPwaModal: React.FC<ApkAndPwaModalProps> = ({
  open,
  onOpenChange,
  onSelectMode,
  initialReason,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"quick" | "apk_build" | "guide">("quick");
  const [networkHost, setNetworkHost] = useState<string>(typeof window !== "undefined" ? window.location.host : "localhost:3000");
  const [lanIp, setLanIp] = useState<string>("");

  useEffect(() => {
    if (open) {
      fetch("/api/mobile/network-info")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.lanIp) {
            setLanIp(data.lanIp);
            const port = data.port || (typeof window !== "undefined" ? window.location.port || "3000" : "3000");
            const hostWithLan = `${data.lanIp}:${port}`;
            if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
              setNetworkHost(hostWithLan);
            }
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    toast.success("Copied command to clipboard!");
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleInstallPWA = async () => {
    if (isInstallable) {
      const installed = await install();
      if (installed) {
        toast.success("🎉 WebAPK / PWA installed successfully to your Android home screen!");
        onOpenChange(false);
      }
    } else {
      toast.info("Tap the 3 dots (⋮) in Chrome and select 'Install app' or 'Add to Home screen'");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-800 text-slate-100 p-0 shadow-2xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-sky-950 via-slate-900 to-indigo-950 p-6 border-b border-slate-800/80 relative">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shadow-inner">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  Android APK & Screen Share Hub
                  <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px] font-mono">
                    v2.4.0
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Solutions for browser restrictions, native WebAPK installation, and Android APK downloads.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Browser Restriction Notice */}
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-300/90 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-200">Why was screen share restricted? </span>
              Standard mobile web browsers (Android Chrome / iOS Safari) restrict web tabs from capturing the whole OS screen for privacy. Choose a native APK or live streaming alternative below:
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab("quick")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "quick"
                  ? "bg-sky-500 text-slate-950 font-bold shadow"
                  : "bg-slate-800/70 text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚡ 4 Instant Fixes
            </button>
            <button
              onClick={() => setActiveTab("apk_build")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "apk_build"
                  ? "bg-sky-500 text-slate-950 font-bold shadow"
                  : "bg-slate-800/70 text-slate-400 hover:text-slate-200"
              }`}
            >
              📦 Android APK Source
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "guide"
                  ? "bg-sky-500 text-slate-950 font-bold shadow"
                  : "bg-slate-800/70 text-slate-400 hover:text-slate-200"
              }`}
            >
              📖 Install Guide
            </button>
          </div>
        </div>

        {/* Tab 1: 4 Instant Fixes */}
        {activeTab === "quick" && (
          <div className="p-5 space-y-3.5">
            {/* Option 1: 1-Click WebAPK Install */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 hover:border-emerald-500/50 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                      Recommended (0-Second Setup)
                    </Badge>
                  </div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    📱 Install WebAPK on Android
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Installs a verified standalone Android app icon directly onto your phone screen. Bypasses browser address bar, stays awake, and runs full screen.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={handleInstallPWA}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-8 shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isInstalled ? "Already Installed (Open App)" : isInstallable ? "Install WebAPK Now" : "Install to Home Screen"}
                </Button>
                {isIOS && (
                  <span className="text-[11px] text-slate-400 self-center">
                    (iOS: Tap Share <span className="text-sky-400">⎋</span> → Add to Home Screen)
                  </span>
                )}
              </div>
            </div>

            {/* Option 2: Live Camera Stream */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-sky-500/30 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-sky-400" />
                    High-Res Live Camera Stream (100% Unrestricted)
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Point your rear camera or document stand at your device or workspace. Streams in real time up to 60 FPS directly into the Desktop Vision HUD without browser permission blockers.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Button
                  onClick={() => {
                    onSelectMode?.("camera_back");
                    onOpenChange(false);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-slate-800 hover:bg-slate-700 text-sky-300 border-sky-500/30 font-medium text-xs h-8 flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Launch Live Camera Stream
                </Button>
              </div>
            </div>

            {/* Option 3: Download Complete Android APK Bundle */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/30 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-indigo-400" />
                    Download Standalone Android APK Source (.zip)
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Full native Android Studio & Gradle project bundle including <code>MainActivity.java</code>, <code>AndroidManifest.xml</code>, Foreground MediaProjection service, and Wi-Fi cleartext network security config.
                  </p>
                </div>
              </div>

              {/* Server Host Override Input for LAN connectivity */}
              <div className="mt-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-medium">PC Server Host Address:</span>
                  {lanIp && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      (LAN IP detected: {lanIp})
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={networkHost}
                  onChange={(e) => setNetworkHost(e.target.value)}
                  className="w-full h-7 px-2 text-xs bg-slate-900 border border-slate-700 rounded text-sky-300 font-mono focus:border-indigo-400 focus:outline-none"
                  placeholder="e.g. 192.168.1.162:3000"
                />
                <p className="text-[10px] text-slate-500">
                  Phone requires your PC's Wi-Fi IP address instead of "localhost" to connect.
                </p>
              </div>

              <div className="mt-3 flex gap-2">
                <a
                  href={`/api/mobile/download-apk-bundle?host=${encodeURIComponent(networkHost)}`}
                  download="sightline-mobile-apk-project.zip"
                >
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs h-8 flex items-center gap-1.5 shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download APK Project (.zip)
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("apk_build")}
                  className="text-xs text-slate-400 hover:text-slate-200 h-8"
                >
                  View Build Commands →
                </Button>
              </div>
            </div>

            {/* Option 4: Interactive Virtual Phone OS */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/30 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-400" />
                    Interactive Virtual Phone OS / PC Mirror
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Simulate full touch interactions, launcher navigation, app switching, and dynamic calculator actions with real-time PyAutoGUI PC dispatch.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => {
                    onSelectMode?.("virtual_screen");
                    onOpenChange(false);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-slate-800 hover:bg-slate-700 text-purple-300 border-purple-500/30 font-medium text-xs h-8 flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Launch Virtual Phone OS
                </Button>
                <Button
                  onClick={() => {
                    onSelectMode?.("mirror_pc");
                    onOpenChange(false);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 font-medium text-xs h-8 flex items-center gap-1.5"
                >
                  <MonitorPlay className="w-3.5 h-3.5" />
                  Mirror PC Screen
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: APK Build Commands */}
        {activeTab === "apk_build" && (
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-400" />
                1-Command Native APK Generator (Bubblewrap / CLI)
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generate a signed Android <code>.apk</code> in seconds directly from the included Web Manifest:
              </p>
              <div className="relative group">
                <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-sky-300 font-mono text-xs overflow-x-auto">
                  {`npx @bubblewrap/cli init --manifest="http://${networkHost}/manifest.webmanifest"\nnpx @bubblewrap/cli build`}
                </pre>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `npx @bubblewrap/cli init --manifest="http://${networkHost}/manifest.webmanifest"\nnpx @bubblewrap/cli build`,
                      "bubblewrap"
                    )
                  }
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  {copiedCmd === "bubblewrap" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                Gradle / Android Studio Build
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extract the downloaded ZIP and compile with the Gradle wrapper:
              </p>
              <div className="relative group">
                <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-indigo-300 font-mono text-xs overflow-x-auto">
                  {`unzip sightline-mobile-apk-project.zip\ncd sightline-mobile-apk-project\n./gradlew assembleDebug\nadb install -r app/build/outputs/apk/debug/app-debug.apk`}
                </pre>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `unzip sightline-mobile-apk-project.zip\ncd sightline-mobile-apk-project\n./gradlew assembleDebug\nadb install -r app/build/outputs/apk/debug/app-debug.apk`,
                      "gradle"
                    )
                  }
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  {copiedCmd === "gradle" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <a href="/api/mobile/download-apk-bundle" download="sightline-mobile-apk-project.zip" className="w-full block">
                <Button className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs h-9 flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" />
                  Download Complete Android Project ZIP
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* Tab 3: Detailed Installation Guides */}
        {activeTab === "guide" && (
          <div className="p-5 space-y-4">
            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <h5 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Method 1: Android Chrome / Samsung Browser (Instant WebAPK)
                </h5>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                  <li>Open Chrome on your phone and browse to this page.</li>
                  <li>Tap the <strong>three dots (⋮)</strong> menu in the upper right.</li>
                  <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                  <li>Confirm installation. The app will launch as a standalone Android app with native performance!</li>
                </ol>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <h5 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400" />
                  Method 2: iOS Safari
                </h5>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                  <li>Open Safari on iPhone or iPad.</li>
                  <li>Tap the <strong>Share button (⎋)</strong> in the bottom toolbar.</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                  <li>Tap <strong>"Add"</strong> in the top right corner.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Zero external cloud dependencies • Local LAN & P2P sync
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
