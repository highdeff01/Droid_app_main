export interface MouseRecordingPoint {
  x: number;
  y: number;
  timestamp: number;
  type: "move" | "click" | "drag" | "hover" | string;
  speed?: number;
  targetElement?: any;
}

export type RecordedMousePoint = MouseRecordingPoint;

/** A frame captured while recording: a downscaled data URL and when it was taken. */
export interface SessionThumbnail {
  imageData: string;
  timestamp: number;
}

export interface MouseRecordingSession {
  id?: string;
  name: string;
  createdAt?: string;
  points: MouseRecordingPoint[];
  sessionType?: string;
  durationSec?: number;
  /** Recording length in ms (last point time − first point time). */
  durationMs?: number;
  /** Recorded steps: the clicks of the trail. */
  stepCount?: number;
  frameCount?: number;
  thumbnails?: SessionThumbnail[];
  tags?: string[];
  notes?: string;
  source?: string;
  targetDevice?: string;
  [key: string]: any;
}

/** The ring buffer holds at most this many sessions; the oldest is evicted first. */
export const MAX_RECORDING_SESSIONS = 100;
/** Thumbnails kept per session. */
export const MAX_SESSION_THUMBNAILS = 8;

const CLICK_TYPES = new Set(["click", "left_click", "right_click", "double_click"]);

/** Minimal storage the store persists to (localStorage in the browser). */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): SessionStorageLike | null {
  return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
}

let idCounter = 0;
/** A session id that is unique even for two sessions created in the same millisecond. */
export function newSessionId(now = Date.now()): string {
  idCounter += 1;
  return `sess_${now}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface RecordedTrailInput {
  points: MouseRecordingPoint[];
  thumbnails?: SessionThumbnail[];
  name?: string;
  targetDevice?: string;
  now?: number;
}

/** A complete new session from one Record press: fresh id and metadata measured from the points. */
export function buildRecordedSession(input: RecordedTrailInput): MouseRecordingSession {
  const now = input.now ?? Date.now();
  const points = input.points;
  const first = points[0]?.timestamp ?? now;
  const last = points[points.length - 1]?.timestamp ?? first;
  const durationMs = Math.max(0, last - first);
  const thumbnails = (input.thumbnails ?? []).slice(0, MAX_SESSION_THUMBNAILS);
  return {
    id: newSessionId(now),
    name: input.name ?? `Recording ${new Date(now).toLocaleString()} (${points.length} pts)`,
    createdAt: new Date(now).toISOString(),
    recordedAt: now,
    points,
    sessionType: "mouse_trail",
    durationMs,
    durationSec: durationMs / 1000,
    stepCount: points.filter((p) => CLICK_TYPES.has(p.type)).length,
    frameCount: thumbnails.length,
    thumbnails,
    source: "live_hud",
    targetDevice: input.targetDevice ?? "desktop",
  };
}

export class MouseTrajectoryStore {
  private static instance: MouseTrajectoryStore;
  private sessions: MouseRecordingSession[] = [];
  private readonly storageKey = "sightline_mouse_sessions_ledger";

  constructor(private readonly storage: SessionStorageLike | null = browserStorage()) {
    try {
      const stored = this.storage?.getItem(this.storageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      this.sessions = Array.isArray(parsed) ? parsed.slice(0, MAX_RECORDING_SESSIONS) : [];
    } catch {
      this.sessions = [];
    }
  }

  static getInstance(): MouseTrajectoryStore {
    if (!MouseTrajectoryStore.instance) {
      MouseTrajectoryStore.instance = new MouseTrajectoryStore();
    }
    return MouseTrajectoryStore.instance;
  }

  /** Persists the ledger; when storage is full the oldest sessions are dropped until it fits. */
  private persist(): void {
    if (!this.storage) return;
    while (this.sessions.length > 0) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(this.sessions));
        return;
      } catch {
        this.sessions = this.sessions.slice(0, -1);
      }
    }
  }

  /**
   * Adds a session as a NEW entry at the front (never merged into an existing one): an id
   * already in the ledger is replaced by a fresh one. The oldest session beyond 100 is evicted.
   */
  saveSession(session: MouseRecordingSession): MouseRecordingSession {
    const taken = session.id && this.sessions.some((s) => s.id === session.id);
    const newSession: MouseRecordingSession = {
      ...session,
      id: session.id && !taken ? session.id : newSessionId(),
      createdAt: session.createdAt || new Date().toISOString(),
      sessionType: session.sessionType || "mouse_trail",
    };
    this.sessions = [newSession, ...this.sessions].slice(0, MAX_RECORDING_SESSIONS);
    this.persist();
    return newSession;
  }

  /** Saves one Record press as its own session. */
  saveRecording(input: RecordedTrailInput): MouseRecordingSession {
    return this.saveSession(buildRecordedSession(input));
  }

  getSessions(): MouseRecordingSession[] {
    return this.sessions;
  }

  getAllSessions(): MouseRecordingSession[] {
    return this.getSessions();
  }

  getSession(id: string): MouseRecordingSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  deleteSession(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.persist();
  }

  updateSession(id: string, updates: Partial<MouseRecordingSession>): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.sessions[idx] = { ...this.sessions[idx], ...updates, id };
      this.persist();
    }
  }

  clearAllSessions(): void {
    this.sessions = [];
    this.persist();
  }
}
