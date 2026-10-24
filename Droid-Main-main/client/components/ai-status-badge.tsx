import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mirrors GET /api/ai/status (server/ai-status.ts). */
export interface AiStatus {
  state: "unknown" | "online" | "offline";
  endpoint: string;
  model: string;
  latencyMs: number | null;
  message: string;
  checkedAt: number | null;
}

const STATE_STYLES: Record<AiStatus["state"], { dot: string; text: string; label: string }> = {
  online: { dot: "bg-emerald-400", text: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", label: "AI online" },
  offline: { dot: "bg-rose-500", text: "text-rose-300 border-rose-500/30 bg-rose-500/10", label: "AI offline" },
  unknown: { dot: "bg-slate-400", text: "text-slate-300 border-slate-500/30 bg-slate-500/10", label: "AI not checked" },
};

async function fetchAiStatus(refresh: boolean): Promise<AiStatus> {
  const res = await fetch(refresh ? "/api/ai/status?refresh=1" : "/api/ai/status");
  const data = await res.json();
  if (!data?.status) throw new Error(data?.error || `Status request failed (${res.status})`);
  return data.status as AiStatus;
}

/**
 * Live AI endpoint status from the startup ping / last Ping Endpoint.
 * Clicking re-pings the endpoint; `refreshSignal` changes re-read the stored status.
 */
export function AiStatusBadge({ refreshSignal = 0, className }: { refreshSignal?: number; className?: string }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setPinging(refresh);
    try {
      setStatus(await fetchAiStatus(refresh));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPinging(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load, refreshSignal]);

  const style = STATE_STYLES[error ? "offline" : status?.state ?? "unknown"];
  const detail = error
    ? `Status unavailable: ${error}`
    : status
      ? `${status.endpoint} · ${status.model}${status.latencyMs != null ? ` · ${status.latencyMs}ms` : ""} — ${status.message}`
      : "Checking AI endpoint…";

  return (
    <button
      type="button"
      onClick={() => void load(true)}
      disabled={pinging}
      title={`${detail}\nClick to ping the AI endpoint`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        style.text,
        className,
      )}
    >
      {pinging ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", style.dot)} />}
      <span>{style.label}</span>
      {status?.state === "online" && status.latencyMs != null && !error && (
        <span className="opacity-70">{status.latencyMs}ms</span>
      )}
    </button>
  );
}
