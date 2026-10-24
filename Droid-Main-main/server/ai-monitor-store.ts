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
  /** Set on real mouse/keyboard actions only. */
  inputKind?: "mouse" | "keyboard";
  action?: string;
  x?: number;
  y?: number;
  /** Typed text or key chord of a keyboard action. */
  input?: string;
  executed?: boolean;
  origin?: string;
  /** Id of the screenshot taken at the moment of the action (see getScreenshot). */
  screenshotId?: string;
  screenshotError?: string;
  [key: string]: any;
}

export interface StoredScreenshot {
  id: string;
  imageData: string;
  capturedAt: number;
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
  private screenshots = new Map<string, StoredScreenshot>();
  private readonly maxScreenshots = 200;

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
      ...entry,
      id: entry.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: entry.timestamp || Date.now(),
      timeStr: entry.timeStr || new Date().toLocaleTimeString(),
      phase: entry.phase || "system",
      title: entry.title || "Action",
      detail: entry.detail || "",
      status: entry.status || "completed",
      source: entry.source || "ai_engine",
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
    this.screenshots.clear();
  }

  setBrowserContext(ctx: AiMonitorBrowserContext) {
    this.browserContext = ctx;
  }

  getBrowserContext(): AiMonitorBrowserContext | null {
    return this.browserContext;
  }

  /** Keeps a screenshot for an action record; the oldest is evicted past the cap. */
  storeScreenshot(imageData: string, capturedAt = Date.now()): StoredScreenshot {
    const shot = {
      id: `shot_${capturedAt}_${Math.random().toString(36).substring(2, 7)}`,
      imageData,
      capturedAt,
    };
    this.screenshots.set(shot.id, shot);
    if (this.screenshots.size > this.maxScreenshots)
      this.screenshots.delete(this.screenshots.keys().next().value!);
    return shot;
  }

  getScreenshot(id: string): StoredScreenshot | undefined {
    return this.screenshots.get(id);
  }

  exportCsv(): string {
    const headers = [
      "ID",
      "Timestamp",
      "Time",
      "ISO Time",
      "Phase",
      "Title",
      "Status",
      "Detail",
      "Confidence",
      "Source",
      "Input Kind",
      "Action",
      "X",
      "Y",
      "Input",
      "Executed",
      "Origin",
      "Screenshot ID",
    ];
    const rows = this.history.map((r) => [
      r.id,
      r.timestamp,
      csvText(r.timeStr),
      new Date(r.timestamp).toISOString(),
      r.phase,
      csvText(r.title),
      r.status,
      csvText(r.detail),
      r.confidence ?? "",
      csvText(r.source),
      r.inputKind ?? "",
      r.action ?? "",
      r.x ?? "",
      r.y ?? "",
      csvText(r.input),
      r.executed === undefined ? "" : String(r.executed),
      r.origin ?? "",
      r.screenshotId ?? "",
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }
}

function csvText(value: string | undefined): string {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

export const aiMonitorStore = new AiMonitorStore();
