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
  [key: string]: any;
}

export interface AiMonitorStatus {
  status: string;
  currentAction?: string | null;
  timestamp?: number;
  [key: string]: any;
}

export interface AiMonitorBrowserElement {
  id: string;
  name: string;
  type: string;
  selector?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  tag?: string;
  role?: string;
  attributes?: Record<string, string>;
  childrenCount?: number;
  [key: string]: any;
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
  elements: AiMonitorBrowserElement[];
}

class AiMonitorStore {
  private history: AiActionRecord[] = [];
  private currentStatus: AiMonitorStatus = {
    status: "idle",
    currentAction: null,
    timestamp: Date.now(),
  };
  private browserContext: AiMonitorBrowserContext | null = null;
  private readonly maxEntries = 1000;

  setStatus(status: Partial<AiMonitorStatus>) {
    this.currentStatus = {
      ...this.currentStatus,
      ...status,
      timestamp: Date.now(),
    };
  }

  getStatus(): AiMonitorStatus {
    return this.currentStatus;
  }

  record(entry: Partial<AiActionRecord>): AiActionRecord {
    const record: AiActionRecord = {
      id: entry.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: entry.timestamp || Date.now(),
      timeStr: entry.timeStr || new Date().toLocaleTimeString(),
      phase: entry.phase || "system",
      title: entry.title || "Action",
      detail: entry.detail || "",
      status: entry.status || "completed",
      target: entry.target,
      confidence: entry.confidence,
      source: entry.source || "ai_engine",
      ...entry,
    };

    this.history.unshift(record);
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
    }
    return record;
  }

  getActionHistory(limit = 100): AiActionRecord[] {
    return this.history.slice(0, limit);
  }

  clearActionHistory() {
    this.history = [];
  }

  setBrowserContext(ctx: AiMonitorBrowserContext) {
    this.browserContext = ctx;
  }

  getBrowserContext(): AiMonitorBrowserContext | null {
    return this.browserContext;
  }

  exportCsv(): string {
    const headers = [
      "ID",
      "Timestamp",
      "Time",
      "Phase",
      "Title",
      "Status",
      "Detail",
      "Confidence",
      "Source",
    ];
    const rows = this.history.map((r) => [
      r.id,
      r.timestamp,
      `"${r.timeStr}"`,
      r.phase,
      `"${(r.title || "").replace(/"/g, '""')}"`,
      r.status,
      `"${(r.detail || "").replace(/"/g, '""')}"`,
      r.confidence !== undefined ? r.confidence : "",
      r.source || "",
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }
}

export const aiMonitorStore = new AiMonitorStore();
