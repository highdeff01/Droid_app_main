import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { safeFetchJson, safePostJson } from "@/lib/api-helper";

export interface AiActionRecord {
  id: string;
  timestamp: number;
  timeStr: string;
  phase:
    | "perception"
    | "planning"
    | "execution"
    | "verification"
    | "recovery"
    | "browser"
    | "system";
  title: string;
  detail: string;
  status: "started" | "completed" | "failed" | "info";
  target?: { name?: string; x?: number; y?: number };
  confidence?: number;
  source?: string;
}

export interface AiMonitorBrowserContext {
  updatedAt: number;
  source: "cdp" | "extension";
  activeTab?: { id?: string; title?: string; url?: string };
  tabs: Array<{ id?: string; title?: string; url?: string; active?: boolean }>;
  page?: {
    title?: string;
    url?: string;
    viewport?: { width: number; height: number };
  };
  elements: Array<{
    id: string;
    name: string;
    type: string;
    selector?: string;
    x: number;
    y: number;
  }>;
}

export interface AiMonitorState {
  status:
    | "idle"
    | "perceiving"
    | "planning"
    | "executing"
    | "verifying"
    | "recovering";
  objective: string;
  currentAction: string | null;
  activeGoals: Array<{ title: string; status: string }>;
  browser: AiMonitorBrowserContext | null;
  lastUpdate: number;
}

const STATUS_STYLES: Record<string, string> = {
  idle: "bg-slate-800 text-slate-300 border-slate-700",
  perceiving: "bg-cyan-950 text-cyan-300 border-cyan-700",
  planning: "bg-purple-950 text-purple-300 border-purple-700",
  executing: "bg-amber-950 text-amber-300 border-amber-700",
  verifying: "bg-blue-950 text-blue-300 border-blue-700",
  recovering: "bg-orange-950 text-orange-300 border-orange-700",
};

const PHASE_STYLES: Record<string, string> = {
  perception: "text-cyan-300",
  planning: "text-purple-300",
  execution: "text-amber-300",
  verification: "text-blue-300",
  recovery: "text-orange-300",
  browser: "text-emerald-300",
  system: "text-slate-300",
};

interface AiMonitorPanelProps {
  /** Compact rendering for embedding as a Dashboard tab. */
  compact?: boolean;
}

export function AiMonitorPanel({ compact = false }: AiMonitorPanelProps) {
  const [state, setState] = useState<AiMonitorState | null>(null);
  const [history, setHistory] = useState<AiActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await safeFetchJson<{
        state: AiMonitorState;
        history: AiActionRecord[];
      }>(`/api/ai-monitor?limit=${compact ? 15 : 40}`);
      if (data.success) {
        if (data.state) setState(data.state);
        setHistory(data.history || []);
      }
    } catch {
      // Monitor polling is best-effort; a failed poll should not disturb the UI.
    } finally {
      setLoading(false);
    }
  }, [compact]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const inspectBrowser = async () => {
    setInspecting(true);
    try {
      const data = await safePostJson<{
        context: { elements: any[] };
      }>("/api/browser/inspect", {});
      if (data.success && data.context) {
        toast.success(
          `Read ${data.context.elements?.length || 0} page element(s) from the active tab`,
        );
        await refresh();
      } else {
        toast.error(data.error || "Could not read the browser tab");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to inspect browser tab");
    } finally {
      setInspecting(false);
    }
  };

  const clearHistory = async () => {
    await safeFetchJson("/api/ai/action-history", { method: "DELETE" });
    toast.success("Action history cleared");
    refresh();
  };

  const browser = state?.browser || null;
  const busy = state ? state.status !== "idle" : false;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            AI Status
            <Badge
              variant="outline"
              className={`ml-2 text-[10px] uppercase ${STATUS_STYLES[state?.status || "idle"]}`}
            >
              {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {state?.status || "idle"}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            {state?.currentAction
              ? state.currentAction
              : "No action in progress"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-cyan-300">Objective</span>
              <p className="text-slate-300 break-words">
                {state?.objective || "No active objective"}
              </p>
            </div>
            <div className="p-3 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-purple-300">Active goals</span>
              <p className="text-slate-300">
                {state?.activeGoals?.length
                  ? state.activeGoals
                      .map((g) => `${g.title} (${g.status})`)
                      .join(" • ")
                  : "None"}
              </p>
            </div>
            <div className="p-3 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-emerald-300">Actions logged</span>
              <p className="text-slate-300">
                {history.length} recent
                {state?.lastUpdate
                  ? ` • updated ${new Date(state.lastUpdate).toLocaleTimeString()}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={refresh}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={inspectBrowser}
              disabled={inspecting}
            >
              {inspecting ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Globe className="w-3 h-3 mr-1" />
              )}
              Read active browser tab
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              asChild
            >
              <a href="/api/ai/action-history.csv" download>
                <Download className="w-3 h-3 mr-1" /> Export CSV
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={clearHistory}
            >
              <Trash2 className="w-3 h-3 mr-1" /> Clear
            </Button>
          </div>

          <div className="p-3 rounded bg-slate-950 border border-slate-800 text-xs">
            <span className="font-bold text-emerald-300 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Browser context
            </span>
            {browser ? (
              <div className="mt-1 space-y-1 text-slate-300">
                <p>
                  <span className="text-slate-500">Tab:</span>{" "}
                  {browser.page?.title || browser.activeTab?.title || "unknown"}
                </p>
                <p className="break-all">
                  <span className="text-slate-500">URL:</span>{" "}
                  {browser.page?.url || browser.activeTab?.url || "unknown"}
                </p>
                <p>
                  <span className="text-slate-500">Elements:</span>{" "}
                  {browser.elements.length} • <span className="text-slate-500">Source:</span>{" "}
                  {browser.source === "cdp" ? "DevTools protocol" : "browser extension"}{" "}
                  • <span className="text-slate-500">Open tabs:</span>{" "}
                  {browser.tabs.length}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-slate-400">
                No browser context yet — click “Read active browser tab”, or let
                the extension report the page.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            Recent tasks performed
          </CardTitle>
          <CardDescription className="text-xs">
            Every perception, plan, execution and verification the AI has run.
            Export the CSV and import it into Google Sheets to keep the record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-slate-400">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400">
              No AI actions recorded yet.
            </p>
          ) : (
            <ScrollArea className={compact ? "h-64" : "h-[420px]"}>
              <div className="space-y-1 pr-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 p-2 rounded bg-slate-950 border border-slate-800 text-xs"
                  >
                    {entry.status === "failed" ? (
                      <XCircle className="w-3.5 h-3.5 mt-0.5 text-red-400 shrink-0" />
                    ) : entry.status === "started" ? (
                      <Loader2 className="w-3.5 h-3.5 mt-0.5 text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold ${PHASE_STYLES[entry.phase]}`}>
                          {entry.phase}
                        </span>
                        <span className="text-slate-200 break-words">
                          {entry.title}
                        </span>
                        <span className="text-slate-500">{entry.timeStr}</span>
                        {entry.confidence !== undefined && (
                          <span className="text-slate-500">
                            conf {(entry.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {entry.detail && (
                        <p className="text-slate-400 break-words">
                          {entry.detail}
                        </p>
                      )}
                      {entry.target?.name && (
                        <p className="text-slate-500">
                          target {entry.target.name}
                          {entry.target.x !== undefined
                            ? ` (${entry.target.x}, ${entry.target.y})`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AiMonitorPanel;
