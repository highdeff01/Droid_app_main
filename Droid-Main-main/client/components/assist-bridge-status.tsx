import { useCallback, useEffect, useState } from "react";
import type { AssistBridgeState, AssistBridgeStatus } from "@shared/assist-bridge";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

const STATE_STYLES: Record<AssistBridgeState, { dot: string; text: string; label: string }> = {
  waiting: { dot: "bg-amber-400", text: "text-amber-300 border-amber-500/30 bg-amber-500/10", label: "Waiting for assist" },
  connected: { dot: "bg-emerald-400", text: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", label: "Assist connected" },
  error: { dot: "bg-rose-500", text: "text-rose-300 border-rose-500/30 bg-rose-500/10", label: "Assist bridge error" },
};

export async function fetchAssistBridgeStatus(): Promise<AssistBridgeStatus> {
  const res = await fetch("/api/assist-bridge/status");
  const data = await res.json();
  if (!data?.status) throw new Error(data?.error || `Bridge status request failed (${res.status})`);
  return data.status as AssistBridgeStatus;
}

/** Polls GET /api/assist-bridge/status; a failed request is reported as an error, never as waiting. */
export function useAssistBridgeStatus(refreshSignal = 0) {
  const [status, setStatus] = useState<AssistBridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchAssistBridgeStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, refreshSignal]);

  return { status, error, setStatus, reload: load };
}

function describeStatus(status: AssistBridgeStatus | null, error: string | null): string {
  if (error) return `Status unavailable: ${error}`;
  if (!status) return "Checking assist bridge…";
  const parts = [status.url ?? "not listening", status.peer ? `peer ${status.peer}` : null, status.lastError ? `last error: ${status.lastError}` : null];
  return parts.filter(Boolean).join(" · ");
}

/** Bridge indicator: Waiting for assist / Connected / Error, with peer and last error. */
export function AssistBridgeBadge({ className, refreshSignal = 0 }: { className?: string; refreshSignal?: number }) {
  const { status, error } = useAssistBridgeStatus(refreshSignal);
  const style = STATE_STYLES[error ? "error" : status?.state ?? "waiting"];
  const detail = describeStatus(status, error);
  return (
    <span
      title={detail}
      className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium", style.text, className)}
    >
      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
      <span>{style.label}</span>
      {status?.peer && !error && <span className="opacity-70">{status.peer}</span>}
      {(error || status?.lastError) && <span className="max-w-[16rem] truncate opacity-70">{error ?? status?.lastError}</span>}
    </span>
  );
}
