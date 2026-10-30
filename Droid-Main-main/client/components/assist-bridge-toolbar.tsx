import { useState } from "react";
import { Link } from "react-router-dom";
import type { AssistBridgeStatus } from "@shared/assist-bridge";
import { Button } from "@/components/ui/button";
import { AssistBridgeBadge } from "@/components/assist-bridge-status";
import { safePostJson } from "@/lib/api-helper";
import { errorText } from "@/lib/assist-bridge-api";

/** Restarts the bridge listener with its current settings so droid-new can (re)connect. */
async function restartListener(): Promise<AssistBridgeStatus> {
  const reply = await safePostJson<{ status: AssistBridgeStatus }>("/api/assist-bridge/settings", {});
  if (!reply.success || !reply.status) throw new Error(reply.error || "Bridge restart failed");
  return reply.status;
}

function describe(status: AssistBridgeStatus): string {
  if (status.state === "connected") return `Connected to ${status.peer ?? "droid-new"}`;
  if (status.listening) return `Listening on ${status.url} — waiting for droid-new`;
  return status.lastError ? `Not listening: ${status.lastError}` : "Not listening";
}

/** Compact Dashboard toolbar: bridge status, one-click connect, and links to Assist and droid-new settings. */
export function AssistBridgeToolbar() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  const connect = async () => {
    setBusy(true);
    try {
      setMessage({ ok: true, text: describe(await restartListener()) });
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  };

  return (
    <div role="toolbar" aria-label="droid-new bridge" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase text-slate-500">droid-new</span>
      <AssistBridgeBadge refreshSignal={refresh} />
      <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void connect()}>
        {busy ? "Connecting…" : "Connect"}
      </Button>
      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
        <Link to="/assist">Open Assist</Link>
      </Button>
      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
        <Link to="/assist/settings">droid-new settings</Link>
      </Button>
      {message && <span className={message.ok ? "text-[11px] text-slate-400" : "text-[11px] text-red-300"}>{message.text}</span>}
    </div>
  );
}
