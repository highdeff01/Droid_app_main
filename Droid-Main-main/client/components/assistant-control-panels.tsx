import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { safeFetchJson, safePostJson } from "@/lib/api-helper";
import {
  MONITOR_INTERVAL_MS,
  parseAssistantCommand,
  type AssistantCommand,
  type MonitorMode,
} from "@shared/assistant-control";

const HISTORY_URL = "/api/ai/action-history?limit=100";
const CSV_URL = "/api/ai/action-history.csv";
const MONITOR_URL = "/api/assistant/control/monitor";

interface ActionRecord {
  id: string;
  timestamp: number;
  title: string;
  detail: string;
  status: string;
  inputKind?: "mouse" | "keyboard";
  action?: string;
  x?: number;
  y?: number;
  input?: string;
  executed?: boolean;
  origin?: string;
  screenshotId?: string;
  screenshotError?: string;
}

interface MonitorStatus {
  mode: MonitorMode | "off";
  intervalMs: number | null;
  captures: number;
  failures: number;
  lastError: string | null;
}

interface ChatLine {
  role: "user" | "assistant";
  text: string;
  failed?: boolean;
}

async function fetchHistory(): Promise<ActionRecord[]> {
  const reply = await safeFetchJson<{ history?: ActionRecord[] }>(HISTORY_URL);
  if (!reply.success)
    throw new Error(reply.error || "Action history unavailable");
  return reply.history ?? [];
}

/** /use: the server resolves the target on the live screen and clicks it; failures name their stage. */
async function runUse(target: string): Promise<ChatLine> {
  const reply = await safePostJson<{
    stage?: string;
    element?: { name: string; center: { x: number; y: number } };
    candidates?: string[];
  }>("/api/assistant/control/use", { target });
  if (!reply.success) {
    const candidates = reply.candidates?.length
      ? ` On screen: ${reply.candidates.slice(0, 8).join(", ")}.`
      : "";
    return {
      role: "assistant",
      failed: true,
      text: `/use ${target} failed at ${reply.stage ?? "request"}: ${reply.error || reply.message || "unknown error"}.${candidates}`,
    };
  }
  const el = reply.element;
  return {
    role: "assistant",
    text: el
      ? `Clicked "${el.name}" at (${el.center.x}, ${el.center.y}).`
      : `Executed /use ${target}.`,
  };
}

async function runLog(): Promise<ChatLine> {
  const inputs = (await fetchHistory()).filter((r) => r.inputKind).slice(0, 10);
  if (!inputs.length)
    return {
      role: "assistant",
      text: "No mouse or keyboard actions logged yet.",
    };
  return { role: "assistant", text: inputs.map(describeAction).join("\n") };
}

async function runMonitor(mode: MonitorMode | "off"): Promise<ChatLine> {
  const reply = await safePostJson<{ monitor?: MonitorStatus }>(MONITOR_URL, {
    mode,
  });
  if (!reply.success)
    return {
      role: "assistant",
      failed: true,
      text: `Monitor change failed: ${reply.error || "unknown error"}`,
    };
  return {
    role: "assistant",
    text:
      mode === "off"
        ? "Monitor stopped."
        : `Monitor ${mode}: one screenshot every ${MONITOR_INTERVAL_MS[mode] / 1000} s.`,
  };
}

const COMMAND_HANDLERS: {
  [K in AssistantCommand["kind"]]: (
    command: Extract<AssistantCommand, { kind: K }>,
  ) => Promise<ChatLine>;
} = {
  use: (c) => runUse(c.target),
  log: () => runLog(),
  monitor: (c) => runMonitor(c.mode),
  usage_error: async (c) => ({
    role: "assistant",
    failed: true,
    text: c.message,
  }),
  text: async () => ({
    role: "assistant",
    failed: true,
    text: "Commands: /use <target>, /log, /monitor background | advanced | off",
  }),
};

function dispatchCommand(command: AssistantCommand): Promise<ChatLine> {
  const handler = COMMAND_HANDLERS[command.kind] as (
    c: AssistantCommand,
  ) => Promise<ChatLine>;
  return handler(command);
}

function describeAction(record: ActionRecord): string {
  const time = new Date(record.timestamp).toLocaleTimeString();
  const where =
    record.x !== undefined && record.y !== undefined
      ? ` at (${record.x}, ${record.y})`
      : "";
  const input = record.input ? ` "${record.input}"` : "";
  const state = record.executed === false ? " [not executed]" : "";
  return `${time} ${record.inputKind} ${record.action ?? record.title}${where}${input}${state}`;
}

/** Assistant chat that accepts /use, /log and /monitor commands. */
export function AssistantCommandChat() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setLines((prev) => [...prev, { role: "user", text }]);
    const reply = await dispatchCommand(parseAssistantCommand(text)).catch(
      (err: unknown): ChatLine => ({
        role: "assistant",
        failed: true,
        text: err instanceof Error ? err.message : String(err),
      }),
    );
    setLines((prev) => [...prev, reply]);
    setBusy(false);
  };

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-medium text-slate-300">Assistant commands</p>
      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
        {lines.map((line, i) => (
          <p
            key={i}
            className={cn(
              "whitespace-pre-wrap leading-5",
              line.role === "user" ? "text-cyan-200" : "text-slate-300",
              line.failed && "text-rose-300",
            )}
          >
            {line.role === "user" ? "› " : ""}
            {line.text}
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="/use Submit button"
          aria-label="Assistant command"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-200"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}

/** Loads one action's screenshot on demand; a missing image is shown as missing. */
function ActionScreenshot({ id }: { id: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const reply = await safeFetchJson<{ imageData?: string }>(
      `/api/ai/action-history/screenshots/${encodeURIComponent(id)}`,
    );
    if (reply.success && reply.imageData) setImage(reply.imageData);
    else setError(reply.error || "Screenshot unavailable");
  };
  if (image)
    return (
      <img
        src={image}
        alt="Screen at the moment of this action"
        className="mt-1 w-full rounded border border-white/10"
      />
    );
  if (error) return <span className="text-rose-300">{error}</span>;
  return (
    <button type="button" onClick={load} className="text-cyan-300 underline">
      Show screenshot
    </button>
  );
}

/** Every logged mouse/keyboard action with its timestamp, screenshot and CSV export. */
export function ActionHistoryPanel() {
  const [records, setRecords] = useState<ActionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecords((await fetchHistory()).filter((r) => r.inputKind));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-300">Action history</p>
        <a href={CSV_URL} download className="text-xs text-cyan-300 underline">
          Export CSV
        </a>
      </div>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      {!error && records.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          No mouse or keyboard actions logged yet.
        </p>
      )}
      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto text-xs">
        {records.map((record) => (
          <li key={record.id} className="text-slate-300">
            <p className={cn(record.executed === false && "text-rose-300")}>
              {describeAction(record)}
            </p>
            <p className="text-slate-500">{record.origin}</p>
            {record.screenshotId ? (
              <ActionScreenshot id={record.screenshotId} />
            ) : (
              record.screenshotError && (
                <span className="text-amber-300">
                  No screenshot: {record.screenshotError}
                </span>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONITOR_MODES: (MonitorMode | "off")[] = [
  "off",
  "background",
  "advanced",
];

/** Background (1 s) / advanced (0.25 s) monitor control with the latest captured frame. */
export function ScreenMonitorPanel() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void safeFetchJson<{ monitor?: MonitorStatus }>(MONITOR_URL).then((r) =>
      r.success
        ? setStatus(r.monitor ?? null)
        : setError(r.error || "Monitor unavailable"),
    );
  }, []);

  useEffect(() => {
    if (!status?.intervalMs) return;
    const poll = async () => {
      const reply = await safeFetchJson<{
        monitor?: MonitorStatus;
        frames?: { imageData: string }[];
      }>(`${MONITOR_URL}/frames?limit=1`);
      if (!reply.success) return setError(reply.error || "Monitor unavailable");
      setFrame(reply.frames?.[0]?.imageData ?? null);
      if (reply.monitor) setStatus(reply.monitor);
    };
    const timer = setInterval(() => void poll(), status.intervalMs);
    return () => clearInterval(timer);
  }, [status?.intervalMs]);

  const choose = async (mode: MonitorMode | "off") => {
    const reply = await safePostJson<{ monitor?: MonitorStatus }>(MONITOR_URL, {
      mode,
    });
    if (!reply.success) return setError(reply.error || "Monitor change failed");
    setError(null);
    setStatus(reply.monitor ?? null);
    if (mode === "off") setFrame(null);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-medium text-slate-300">Screen monitor</p>
      <div className="mt-3 flex gap-2">
        {MONITOR_MODES.map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={(status?.mode ?? "off") === mode ? "default" : "outline"}
            onClick={() => void choose(mode)}
          >
            {mode === "off"
              ? "Off"
              : `${mode} (${MONITOR_INTERVAL_MS[mode] / 1000}s)`}
          </Button>
        ))}
      </div>
      {status && status.mode !== "off" && (
        <p className="mt-2 text-xs text-slate-500">
          {status.captures} captures · {status.failures} failures
          {status.lastError ? ` · ${status.lastError}` : ""}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      {frame && (
        <img
          src={frame}
          alt="Latest monitor screenshot"
          className="mt-2 w-full rounded border border-white/10"
        />
      )}
    </div>
  );
}
