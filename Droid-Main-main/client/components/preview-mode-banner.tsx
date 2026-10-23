import { useState } from "react";
import { FlaskConical, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreviewEvents, usePreviewMode } from "@/hooks/use-preview-mode";
import { PREVIEW_BADGE } from "@/lib/preview-mode";

/** Compact "PREVIEW (simulated)" badge; renders nothing in real mode. */
export function PreviewModeBadge({ className }: { className?: string }) {
  const preview = usePreviewMode();
  if (!preview.active) return null;
  return (
    <span
      title={preview.reason ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-fuchsia-500 bg-fuchsia-950/90 px-2 py-0.5 font-mono text-[10px] font-bold text-fuchsia-100",
        className,
      )}
    >
      <FlaskConical className="h-3 w-3" />
      {PREVIEW_BADGE}
    </span>
  );
}

/** App-wide Preview Mode notice with the simulated-action event feed. */
export function PreviewModeBanner() {
  const preview = usePreviewMode();
  const events = usePreviewEvents();
  const [open, setOpen] = useState(false);
  if (!preview.active) return null;
  return (
    <div role="status" className="sticky top-0 z-50 border-b border-fuchsia-500 bg-fuchsia-950/95 px-4 py-2 text-xs text-fuchsia-100">
      <div className="flex items-center gap-3">
        <PreviewModeBadge />
        <p className="flex-1">
          Preview Mode — {preview.reason}. Clicks, typing and steps run on a simulated surface only; nothing is executed on a device.
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-fuchsia-200 hover:bg-fuchsia-900"
          aria-expanded={open}
        >
          Event feed ({events.length}) {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      {open && (
        <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-[10px] text-fuchsia-200/90">
          {events.length === 0 && <li>No simulated actions yet.</li>}
          {[...events].reverse().map((event) => (
            <li key={event.id}>
              {new Date(event.at).toLocaleTimeString()} {event.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
