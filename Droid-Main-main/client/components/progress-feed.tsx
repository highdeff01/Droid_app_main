import React from "react";
import type { ProgressEvent, ProgressLevel } from "@shared/progress";
import { useProgressStream } from "@/hooks/use-progress-stream";
import type { ProgressState } from "@/lib/progress-client";
import { cn } from "@/lib/utils";

const LEVEL_CLASS: Record<ProgressLevel, string> = {
  info: "border-sky-500/40 text-sky-200",
  success: "border-emerald-500/40 text-emerald-200",
  warning: "border-amber-500/40 text-amber-200",
  error: "border-red-500/40 text-red-200",
};

export interface ProgressFeedViewProps {
  state: ProgressState;
  title?: string;
  /** Newest events shown. */
  limit?: number;
  className?: string;
}

function ProgressItem({ event }: { event: ProgressEvent }) {
  return (
    <li className={cn("rounded border-l-2 bg-black/30 px-2 py-1", LEVEL_CLASS[event.level])} data-kind={event.kind}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{event.title}</span>
        <span className="text-[10px] opacity-60">{new Date(event.at).toLocaleTimeString()}</span>
      </div>
      {event.detail && <p className="text-[11px] opacity-80">{event.detail}</p>}
      {event.status && <span className="text-[10px] uppercase opacity-70">{event.status}</span>}
      {event.logs.length > 0 && (
        <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap text-[10px] opacity-70">{event.logs.join("\n")}</pre>
      )}
      {event.screenshot && <img src={event.screenshot} alt={`Screenshot: ${event.title}`} className="mt-1 max-h-24 rounded" />}
    </li>
  );
}

/** Renders the shared progress stream: newest first, failures shown as failures. */
export function ProgressFeedView({ state, title = "Live progress", limit = 8, className }: ProgressFeedViewProps) {
  const newest = state.events.slice(-limit).reverse();
  return (
    <section className={cn("space-y-1 text-xs", className)} aria-label={title}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{title}</h3>
      {state.error && <p className="text-red-300">Progress unavailable: {state.error}</p>}
      {!state.error && newest.length === 0 && <p className="opacity-60">No activity yet.</p>}
      <ul className="space-y-1">
        {newest.map((event) => (
          <ProgressItem key={event.seq} event={event} />
        ))}
      </ul>
    </section>
  );
}

/** The live progress feed every tab mounts; all of them share one poller. */
export function ProgressFeed(props: Omit<ProgressFeedViewProps, "state">) {
  return <ProgressFeedView state={useProgressStream()} {...props} />;
}
