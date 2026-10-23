import { useEffect, useState } from "react";
import { Monitor, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackendStatus } from "@/hooks/use-backend-status";
import { BACKEND_UNREACHABLE_MESSAGE } from "@/lib/backend-status";
import {
  describeEmptyState,
  readCaptureStandby,
  type BridgeStatus,
  type CaptureStandby,
} from "@/lib/hud-frame-status";

export interface HudEmptyStateProps {
  /** Screen-share request error, shown above the standby reason. */
  shareError?: { title: string; message: string } | null;
  isRequestingShare: boolean;
  onStartShare: () => void;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Polls the real capture endpoint and the bridge so the empty state names the actual cause. */
function useCaptureDiagnostics(intervalMs = 5000) {
  const [standby, setStandby] = useState<CaptureStandby | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);

  const backendUnreachable = useBackendStatus().state === "unreachable";

  useEffect(() => {
    if (backendUnreachable) {
      // Startup probe found no JSON API: back off until it succeeds.
      setStandby({ error: BACKEND_UNREACHABLE_MESSAGE });
      setBridge({ online: false, error: BACKEND_UNREACHABLE_MESSAGE });
      return;
    }
    let disposed = false;
    const probe = async () => {
      const capture = await fetch("/api/capture-screen")
        .then(readCaptureStandby)
        .catch((error) => ({ error: `Capture endpoint unreachable: ${errorText(error)}` }));
      const health = await fetch("/api/pyautogui/health")
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          return { online: body?.online === true, error: body?.error ?? (body ? null : `HTTP ${r.status}`) };
        })
        .catch((error) => ({ online: false, error: errorText(error) }));
      if (disposed) return;
      setStandby(capture);
      setBridge(health);
    };
    void probe();
    const timer = window.setInterval(() => void probe(), intervalMs);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [intervalMs, backendUnreachable]);

  return { standby, bridge };
}

/** Actionable "no live screen" panel: real cause, bridge status and setup steps; never a drawn desktop. */
export function HudEmptyState({ shareError, isRequestingShare, onStartShare }: HudEmptyStateProps) {
  const { standby, bridge } = useCaptureDiagnostics();
  const inIframe = typeof window !== "undefined" && window.self !== window.top;
  const state = describeEmptyState(standby, bridge, inIframe);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full h-full overflow-y-auto flex items-center justify-center bg-slate-950 p-4 text-center select-none"
    >
      <div className="max-w-md w-full space-y-3 font-mono">
        <div className="flex items-center justify-center gap-2 text-slate-100 font-bold text-sm">
          <Monitor className="w-5 h-5 text-cyan-400" />
          {state.title}
        </div>
        {shareError && (
          <div role="alert" className="rounded border border-amber-600/70 bg-amber-950/50 p-2 text-[11px] text-amber-200">
            <div className="font-bold">{shareError.title}</div>
            <div>{shareError.message}</div>
          </div>
        )}
        <p className="text-[11px] text-slate-300">{state.detail}</p>
        <div className={bridge?.online ? "text-[11px] text-emerald-300" : "text-[11px] text-amber-300"}>
          {state.bridgeLabel}
        </div>
        <ol className="text-left text-[11px] text-slate-400 list-decimal pl-5 space-y-1">
          {state.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            disabled={isRequestingShare}
            onClick={onStartShare}
            className="h-8 text-xs font-bold bg-cyan-700 hover:bg-cyan-600 text-white gap-1.5"
          >
            {shareError ? <RefreshCw className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isRequestingShare ? "Connecting…" : shareError ? "Retry Share" : "Start Real Desktop Stream"}
          </Button>
          {inIframe && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(window.location.href, "_blank")}
              className="h-8 text-xs bg-slate-900 border-slate-700 text-cyan-300"
            >
              Open in New Tab ↗
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
