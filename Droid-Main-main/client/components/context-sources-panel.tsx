import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Check, FileImage, ListChecks, RefreshCw, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContextSourceItem {
  label: string;
  detail: string;
  /** True only when the source currently provides real context. */
  active: boolean;
  icon: ComponentType<{ className?: string }>;
}

export type FetchJson = (url: string) => Promise<any>;

/** GETs a JSON endpoint and throws the server's error when it did not succeed. */
export const fetchJson: FetchJson = async (url) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function countSource(
  load: () => Promise<number>,
  noun: string,
  emptyText: string,
): Promise<Pick<ContextSourceItem, "detail" | "active">> {
  try {
    const count = await load();
    return count > 0
      ? { detail: plural(count, noun), active: true }
      : { detail: emptyText, active: false };
  } catch (error) {
    return { detail: `Unavailable: ${reason(error)}`, active: false };
  }
}

async function screenSource(
  get: FetchJson,
): Promise<Pick<ContextSourceItem, "detail" | "active">> {
  try {
    const { sources = [] } = await get("/api/assistant/sources");
    const connected = sources.find(
      (source: any) => source.connectionState === "connected",
    );
    return connected
      ? { detail: `${connected.name} connected`, active: true }
      : { detail: "No capture source connected", active: false };
  } catch (error) {
    return { detail: `Unavailable: ${reason(error)}`, active: false };
  }
}

/** Reads the real capture sources, companion notes and saved goal flows. */
export async function loadContextSources(
  get: FetchJson = fetchJson,
): Promise<ContextSourceItem[]> {
  const [screen, notes, goals] = await Promise.all([
    screenSource(get),
    countSource(
      async () => (await get("/api/companion/notes")).notes?.length ?? 0,
      "note",
      "No notes yet",
    ),
    countSource(
      async () => (await get("/api/goal-workflows/flows")).flows?.length ?? 0,
      "saved goal flow",
      "No saved goal flows yet",
    ),
  ]);
  return [
    { label: "Current screen", icon: FileImage, ...screen },
    { label: "Session notes", icon: ListChecks, ...notes },
    { label: "Project goals", icon: Target, ...goals },
  ];
}

export function ContextSourceList({ items }: { items: ContextSourceItem[] }) {
  return (
    <div className="space-y-2">
      {items.map(({ label, detail, active, icon: Icon }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
        >
          <Icon className="h-4 w-4 text-slate-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-300">{label}</p>
            <p
              className={cn(
                "text-[11px]",
                active ? "text-slate-500" : "text-amber-300/80",
              )}
            >
              {detail}
            </p>
          </div>
          {active && (
            <Check
              className="h-3.5 w-3.5 text-emerald-400"
              aria-label="Available"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Context sources the assistant can draw on, loaded from the live endpoints. */
export function ContextSourcesPanel() {
  const [items, setItems] = useState<ContextSourceItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadContextSources());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-300">Context sources</p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>
      {items ? (
        <ContextSourceList items={items} />
      ) : (
        <p className="text-[11px] text-slate-500">Loading context sources…</p>
      )}
    </div>
  );
}
