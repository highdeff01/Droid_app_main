import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useBackendStatus } from "@/hooks/use-backend-status";
import { bannerText } from "@/lib/backend-status";

/** Persistent, dismissible notice shown while the startup probe finds no JSON API. */
export function BackendUnreachableBanner() {
  const status = useBackendStatus();
  const [dismissed, setDismissed] = useState(false);
  const text = bannerText(status);
  if (!text || dismissed) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-start gap-3 border-b border-amber-500 bg-amber-950/95 px-4 py-2 text-xs text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex-1">
        <p className="font-semibold">{text}</p>
        {status.detail && <p className="mt-0.5 font-mono text-amber-300/80">{status.detail}</p>}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 text-amber-300 hover:bg-amber-900 hover:text-white"
        aria-label="Dismiss backend warning"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
