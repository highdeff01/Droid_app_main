import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchBridgeStatus, type BridgeStatusView } from "@/lib/bridge-status";

const POLL_MS = 15000;

/**
 * Persistent, dismissible chip showing the real Python / pyautogui bridge state from
 * GET /api/pyautogui/health, with the exact setup fix when something is missing.
 */
export const PythonBridgeStatusChip: React.FC<{ className?: string }> = ({ className }) => {
  const [status, setStatus] = useState<BridgeStatusView | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void fetchBridgeStatus(controller.signal).then((view) => {
      if (!controller.signal.aborted) setStatus(view);
    });
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  if (dismissed || !status) return null;
  return <BridgeStatusChipView status={status} onDismiss={() => setDismissed(true)} className={className} />;
};

/** Presentational chip: the bridge label, and the fix when something is missing. */
export const BridgeStatusChipView: React.FC<{
  status: BridgeStatusView;
  onDismiss: () => void;
  className?: string;
}> = ({ status, onDismiss, className }) => {
  const ok = status.fix === null;

  return (
    <div
      role="status"
      title={`Interpreter: ${status.interpreter}`}
      className={cn(
        "flex items-start gap-2 rounded-md border px-2.5 py-1 text-[11px] font-mono shadow-sm",
        ok ? "border-emerald-600/60 bg-emerald-950/70 text-emerald-200" : "border-amber-500/70 bg-amber-950/80 text-amber-100",
        className,
      )}
    >
      <div className="flex flex-col">
        <span className="font-semibold">{status.control}</span>
        <span>{status.label}</span>
        {status.fix && <span className="text-amber-300/90">Fix: {status.fix}</span>}
      </div>
      <button
        type="button"
        aria-label="Dismiss Python bridge status"
        onClick={onDismiss}
        className="ml-1 rounded p-0.5 hover:bg-white/10"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
