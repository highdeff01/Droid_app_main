export interface MouseRecordingPoint {
  x: number;
  y: number;
  timestamp: number;
  type: "move" | "click" | "drag" | "hover" | string;
  speed?: number;
  targetElement?: any;
}

export type RecordedMousePoint = MouseRecordingPoint;

export interface MouseRecordingSession {
  id?: string;
  name: string;
  createdAt?: string;
  points: MouseRecordingPoint[];
  sessionType?: string;
  durationSec?: number;
  frameCount?: number;
  tags?: string[];
  notes?: string;
  source?: string;
  targetDevice?: string;
  [key: string]: any;
}

export class MouseTrajectoryStore {
  private static instance: MouseTrajectoryStore;
  private sessions: MouseRecordingSession[] = [];
  private readonly storageKey = "sightline_mouse_sessions_ledger";

  private constructor() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.sessions = JSON.parse(stored);
        }
      } catch {}
    }
  }

  static getInstance(): MouseTrajectoryStore {
    if (!MouseTrajectoryStore.instance) {
      MouseTrajectoryStore.instance = new MouseTrajectoryStore();
    }
    return MouseTrajectoryStore.instance;
  }

  private persist(): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.sessions));
      } catch {}
    }
  }

  saveSession(session: MouseRecordingSession): void {
    const newSession: MouseRecordingSession = {
      id: session.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: session.createdAt || new Date().toISOString(),
      sessionType: session.sessionType || "mouse_trail",
      ...session,
    };
    this.sessions.unshift(newSession);
    if (this.sessions.length > 100) {
      this.sessions = this.sessions.slice(0, 100);
    }
    this.persist();
  }

  getSessions(): MouseRecordingSession[] {
    return this.sessions;
  }

  getAllSessions(): MouseRecordingSession[] {
    return this.getSessions();
  }

  deleteSession(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.persist();
  }

  updateSession(id: string, updates: Partial<MouseRecordingSession>): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.sessions[idx] = { ...this.sessions[idx], ...updates };
      this.persist();
    }
  }

  clearAllSessions(): void {
    this.sessions = [];
    this.persist();
  }
}
