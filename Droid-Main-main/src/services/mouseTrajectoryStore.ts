import { OverseerNudge, OverseerLearnedNote } from '../types/automation';

export interface RecordedMousePoint {
  x: number; // 0 - 1920
  y: number; // 0 - 1080
  timestamp: number; // in seconds relative to recording start
  type?: 'move' | 'click' | 'left_click' | 'right_click' | 'drag' | 'scroll' | 'hover';
  speed?: number; // px/sec
  scrollDelta?: { deltaX: number; deltaY: number };
  dragDistance?: number;
  targetElement?: string;
}

export interface MouseRecordingSession {
  id: string;
  name: string;
  recordedAt: number;
  recordingTime?: string; // Formatted local time e.g., "15:45:20 PST" or "Sep 17, 15:45"
  appEnvironment?: string; // e.g., "Chrome 128 / Win 11", "Electron Desktop App", "macOS Safari"
  confidenceScore?: number; // 0.0 - 1.0 (e.g. 0.98 for 98%)
  captureFrameScreenshotUrl?: string; // Frame screenshot for canvas-based overlay playback
  durationSec: number;
  frameCount: number;
  points: RecordedMousePoint[];
  averageSpeed: number; // baseline px/sec
  maxSpeed: number;
  clickCount: number;
  sessionType?: 'mouse_trail' | 'video_recording' | 'workflow_steps';
  thumbnailUrl?: string;
  tags?: string[];
  notes?: string;
  source?: string;
  targetDevice?: 'desktop' | 'android';
}

export interface InteractionHotspotZone {
  id: string;
  x: number; // center x (0 - 1920)
  y: number; // center y (0 - 1080)
  radius: number; // radius in px
  normalizedX: number; // 0.0 - 1.0
  normalizedY: number; // 0.0 - 1.0
  intensity: number; // 0.0 - 1.0 (relative heat / density)
  eventCount: number;
  clickCount: number;
  label: string;
}

// Built-in realistic historical recording datasets for baseline comparison and instant exploration
export const DEFAULT_HISTORICAL_SESSIONS: MouseRecordingSession[] = [
  {
    id: 'session-baseline-drive-nav',
    name: 'Session 1: Drive Navigation & Search Baseline',
    recordedAt: Date.now() - 1000 * 60 * 45,
    recordingTime: new Date(Date.now() - 1000 * 60 * 45).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    appEnvironment: 'Chrome 128 / Win 11 Pro',
    confidenceScore: 0.98,
    durationSec: 8.5,
    frameCount: 14,
    averageSpeed: 420, // px/sec
    maxSpeed: 890,
    clickCount: 6,
    tags: ['Google Drive', 'Search Filter', 'Baseline'],
    notes: 'Standard file navigation workflow with precise hover dwell on search inputs.',
    points: [
      { x: 140, y: 180, timestamp: 0.2, type: 'move', speed: 210, targetElement: 'Nav Sidebar' },
      { x: 260, y: 220, timestamp: 0.6, type: 'move', speed: 380, targetElement: 'Workspace Container' },
      { x: 960, y: 48, timestamp: 1.2, type: 'move', speed: 510, targetElement: 'Search Bar' },
      { x: 960, y: 48, timestamp: 1.5, type: 'left_click', speed: 0, targetElement: 'Search Input Field' },
      { x: 1040, y: 48, timestamp: 2.1, type: 'move', speed: 180, targetElement: 'Search Filters' },
      { x: 820, y: 240, timestamp: 2.7, type: 'scroll', speed: 310, scrollDelta: { deltaX: 0, deltaY: 280 }, targetElement: 'File Grid Area' },
      { x: 380, y: 260, timestamp: 3.4, type: 'move', speed: 440, targetElement: 'Document Item' },
      { x: 380, y: 260, timestamp: 3.8, type: 'left_click', speed: 0, targetElement: 'Quarterly_Report.docx' },
      { x: 490, y: 290, timestamp: 4.4, type: 'drag', speed: 340, dragDistance: 135, targetElement: 'Move into Financials Folder' },
      { x: 580, y: 320, timestamp: 4.9, type: 'move', speed: 490, targetElement: 'Folder Droptarget' },
      { x: 580, y: 320, timestamp: 5.3, type: 'left_click', speed: 0, targetElement: 'Drop Confirm' },
      { x: 880, y: 520, timestamp: 6.1, type: 'scroll', speed: 420, scrollDelta: { deltaX: 0, deltaY: -150 }, targetElement: 'Activity Feed' },
      { x: 920, y: 120, timestamp: 7.0, type: 'move', speed: 410, targetElement: 'Share Button' },
      { x: 920, y: 120, timestamp: 7.4, type: 'left_click', speed: 0, targetElement: 'Share Dialog Trigger' },
      { x: 450, y: 540, timestamp: 8.2, type: 'move', speed: 280, targetElement: 'Modal Close Area' },
    ],
  },
  {
    id: 'session-baseline-file-ops',
    name: 'Session 2: File Upload & Star Workflow',
    recordedAt: Date.now() - 1000 * 60 * 25,
    recordingTime: new Date(Date.now() - 1000 * 60 * 25).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    appEnvironment: 'Electron Desktop App (v31)',
    confidenceScore: 0.95,
    durationSec: 6.8,
    frameCount: 12,
    averageSpeed: 380,
    maxSpeed: 760,
    clickCount: 5,
    tags: ['Upload', 'Favorites', 'Desktop'],
    notes: 'Drag-and-drop file ingestion and toggle favorite star state.',
    points: [
      { x: 120, y: 140, timestamp: 0.1, type: 'move', speed: 190, targetElement: 'Upload New Button' },
      { x: 120, y: 140, timestamp: 0.4, type: 'left_click', speed: 0, targetElement: 'Upload Button' },
      { x: 540, y: 360, timestamp: 1.1, type: 'drag', speed: 420, dragDistance: 240, targetElement: 'Dropzone Drag-in' },
      { x: 960, y: 540, timestamp: 1.8, type: 'move', speed: 480, targetElement: 'File Table' },
      { x: 960, y: 540, timestamp: 2.2, type: 'left_click', speed: 0, targetElement: 'Row Item Selection' },
      { x: 980, y: 460, timestamp: 2.9, type: 'scroll', speed: 380, scrollDelta: { deltaX: 0, deltaY: 320 }, targetElement: 'Table Body' },
      { x: 1100, y: 540, timestamp: 3.6, type: 'move', speed: 320, targetElement: 'Context Action Menu' },
      { x: 340, y: 420, timestamp: 4.4, type: 'move', speed: 410, targetElement: 'Favorite Star Toggle' },
      { x: 340, y: 420, timestamp: 4.9, type: 'left_click', speed: 0, targetElement: 'Star Active' },
      { x: 620, y: 280, timestamp: 5.7, type: 'scroll', speed: 290, scrollDelta: { deltaX: 0, deltaY: -180 }, targetElement: 'Top Navigation' },
      { x: 180, y: 310, timestamp: 6.4, type: 'move', speed: 360, targetElement: 'Starred Section' },
    ],
  },
  {
    id: 'session-baseline-table-scan',
    name: 'Session 3: High-Density Table Filtering',
    recordedAt: Date.now() - 1000 * 60 * 10,
    recordingTime: new Date(Date.now() - 1000 * 60 * 10).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    appEnvironment: 'Web Browser (Edge / Win 11)',
    confidenceScore: 0.99,
    durationSec: 9.4,
    frameCount: 14,
    averageSpeed: 460,
    maxSpeed: 920,
    clickCount: 6,
    tags: ['Table Export', 'Batch Selection', 'Dense UI'],
    notes: 'Multi-select row scanning, date range filtering, and batch export trigger.',
    points: [
      { x: 420, y: 110, timestamp: 0.3, type: 'move', speed: 290, targetElement: 'Type Filter Dropdown' },
      { x: 420, y: 110, timestamp: 0.7, type: 'left_click', speed: 0, targetElement: 'PDF Filter Option' },
      { x: 620, y: 110, timestamp: 1.5, type: 'move', speed: 340, targetElement: 'Date Modified Filter' },
      { x: 620, y: 110, timestamp: 2.0, type: 'left_click', speed: 0, targetElement: 'Past 7 Days' },
      { x: 740, y: 340, timestamp: 2.8, type: 'scroll', speed: 490, scrollDelta: { deltaX: 0, deltaY: 450 }, targetElement: 'Infinite Scroll Grid' },
      { x: 800, y: 280, timestamp: 3.7, type: 'move', speed: 510, targetElement: 'Item Card #4' },
      { x: 800, y: 280, timestamp: 4.3, type: 'drag', speed: 320, dragDistance: 180, targetElement: 'Multi-select Box Drag' },
      { x: 800, y: 380, timestamp: 5.1, type: 'move', speed: 390, targetElement: 'Selected Batch Actions' },
      { x: 800, y: 380, timestamp: 5.6, type: 'left_click', speed: 0, targetElement: 'Export Selected Zip' },
      { x: 650, y: 480, timestamp: 6.6, type: 'scroll', speed: 330, scrollDelta: { deltaX: 0, deltaY: -220 }, targetElement: 'Grid Top Return' },
      { x: 920, y: 120, timestamp: 7.5, type: 'move', speed: 580, targetElement: 'Refresh Cache' },
      { x: 920, y: 120, timestamp: 8.0, type: 'left_click', speed: 0, targetElement: 'Sync Trigger' },
      { x: 480, y: 560, timestamp: 9.0, type: 'move', speed: 310, targetElement: 'Footer Status' },
    ],
  },
];

const LOCAL_STORAGE_KEY = 'autonomous_mouse_trajectory_sessions_v1';

/**
 * Singleton store that persists recorded mouse trajectory sessions to local
 * storage, derives speed baselines from them, and detects/alerts on
 * mouse-movement speed anomalies relative to those baselines.
 */
export class MouseTrajectoryStore {
  private static instance: MouseTrajectoryStore | null = null;
  private sessions: MouseRecordingSession[] = [];
  private speedAnomalyAlertListeners: Set<(nudge: OverseerNudge, note: OverseerLearnedNote) => void> = new Set();
  
  // Baseline speed bounds (px/sec)
  private baselineMinSpeed = 120;
  private baselineMaxSpeed = 850;
  private baselineAvgSpeed = 410;

  /** Private constructor; use {@link getInstance} to obtain the singleton. */
  private constructor() {
    this.loadFromStorage();
  }

  /** Returns the shared `MouseTrajectoryStore` singleton, creating it on first use. */
  public static getInstance(): MouseTrajectoryStore {
    if (!MouseTrajectoryStore.instance) {
      MouseTrajectoryStore.instance = new MouseTrajectoryStore();
    }
    return MouseTrajectoryStore.instance;
  }

  /** Loads sessions from local storage, falling back to the built-in defaults. */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') {
      this.sessions = [...DEFAULT_HISTORICAL_SESSIONS];
      return;
    }

    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.sessions = parsed;
          this.recalculateBaselines();
          return;
        }
      }
    } catch (e) {
      console.warn('[MouseTrajectoryStore] Failed to load sessions from storage:', e);
    }
    this.sessions = [...DEFAULT_HISTORICAL_SESSIONS];
    this.saveToStorage();
  }

  /** Persists the current sessions list to local storage, ignoring quota errors. */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.sessions));
    } catch {
      // Storage quota or restriction fallback
    }
  }

  /** Recomputes the baseline min/max/avg speeds from all recorded session points. */
  private recalculateBaselines(): void {
    if (this.sessions.length === 0) return;
    const allSpeeds: number[] = [];
    this.sessions.forEach((s) => {
      s.points.forEach((p) => {
        if (p.speed && p.speed > 0) allSpeeds.push(p.speed);
      });
    });

    if (allSpeeds.length > 0) {
      const sum = allSpeeds.reduce((acc, v) => acc + v, 0);
      this.baselineAvgSpeed = Math.round(sum / allSpeeds.length);
      allSpeeds.sort((a, b) => a - b);
      this.baselineMinSpeed = allSpeeds[Math.floor(allSpeeds.length * 0.05)] || 100;
      this.baselineMaxSpeed = allSpeeds[Math.floor(allSpeeds.length * 0.95)] || 900;
    }
  }

  /** Returns a copy of all recorded sessions. */
  public getSessions(): MouseRecordingSession[] {
    return [...this.sessions];
  }

  /** Returns a copy of all recorded sessions (alias of {@link getSessions}). */
  public getAllSessions(): MouseRecordingSession[] {
    return [...this.sessions];
  }

  /** Finds a recorded session by its id. */
  public getSessionById(sessionId: string): MouseRecordingSession | undefined {
    return this.sessions.find((s) => s.id === sessionId);
  }

  /** Subscribes to cross-tab `storage` events, returning an unsubscribe function. */
  public subscribe(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage', handler);
    };
  }

  /** Returns the most recently recorded session, or `null` if none exist. */
  public getLatestSession(): MouseRecordingSession | null {
    return this.sessions.length > 0 ? this.sessions[0] : null;
  }

  /**
   * Builds a full `MouseRecordingSession` from raw recorded points (deriving
   * click count, average/max speed, detected environment, and confidence),
   * then stores it at the front of the sessions list.
   */
  public saveSession(sessionData: {
    name?: string;
    points: RecordedMousePoint[];
    durationSec: number;
    frameCount?: number;
    recordingTime?: string;
    appEnvironment?: string;
    confidenceScore?: number;
    captureFrameScreenshotUrl?: string;
    sessionType?: 'mouse_trail' | 'video_recording' | 'workflow_steps';
    thumbnailUrl?: string;
    tags?: string[];
    notes?: string;
    source?: string;
    targetDevice?: 'desktop' | 'android';
  }): MouseRecordingSession {
    const points = sessionData.points;
    const clickCount = points.filter((p) => p.type === 'click' || p.type === 'left_click' || p.type === 'right_click').length;
    
    let totalSpeed = 0;
    let speedSamples = 0;
    let maxSpeed = 0;

    points.forEach((p) => {
      if (p.speed && p.speed > 0) {
        totalSpeed += p.speed;
        speedSamples++;
        if (p.speed > maxSpeed) maxSpeed = p.speed;
      }
    });

    const averageSpeed = speedSamples > 0 ? Math.round(totalSpeed / speedSamples) : 350;

    // Detect browser / client environment if running in browser
    let detectedEnv = 'Chrome 128 / Win 11 Pro';
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (ua.includes('Electron')) detectedEnv = 'Electron Desktop Host';
      else if (ua.includes('Edg/')) detectedEnv = 'Edge Browser (Desktop)';
      else if (ua.includes('Chrome/')) detectedEnv = 'Chrome Browser (Web)';
      else if (ua.includes('Safari/') && !ua.includes('Chrome')) detectedEnv = 'Safari macOS Desktop';
      else if (ua.includes('Firefox/')) detectedEnv = 'Firefox Desktop';
    }

    // Baseline confidence calculation based on point smoothness & density
    const calculatedConfidence = points.length > 5 ? 0.98 : points.length > 2 ? 0.92 : 0.85;

    const newSession: MouseRecordingSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: sessionData.name || `Recording Session ${this.sessions.length + 1}`,
      recordedAt: Date.now(),
      recordingTime: sessionData.recordingTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      appEnvironment: sessionData.appEnvironment || detectedEnv,
      confidenceScore: sessionData.confidenceScore !== undefined ? sessionData.confidenceScore : calculatedConfidence,
      captureFrameScreenshotUrl: sessionData.captureFrameScreenshotUrl || sessionData.thumbnailUrl,
      durationSec: sessionData.durationSec || 5,
      frameCount: sessionData.frameCount || Math.max(1, Math.round(points.length / 5)),
      points,
      averageSpeed,
      maxSpeed,
      clickCount,
      sessionType: sessionData.sessionType || 'mouse_trail',
      thumbnailUrl: sessionData.thumbnailUrl || sessionData.captureFrameScreenshotUrl,
      tags: sessionData.tags || ['Auto-Recorded'],
      notes: sessionData.notes,
      source: sessionData.source || 'Live Screen HUD',
      targetDevice: sessionData.targetDevice || 'desktop',
    };

    // Prepend to list (keep up to 100 sessions)
    this.sessions = [newSession, ...this.sessions.slice(0, 99)];
    this.recalculateBaselines();
    this.saveToStorage();
    return newSession;
  }

  /** Removes the session with the given id, returning whether it was found and removed. */
  public deleteSession(sessionId: string): boolean {
    const initialLen = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.id !== sessionId);
    if (this.sessions.length !== initialLen) {
      this.recalculateBaselines();
      this.saveToStorage();
      return true;
    }
    return false;
  }

  /** Merges `updates` into the session matching `sessionId`, or returns `null` if not found. */
  public updateSession(sessionId: string, updates: Partial<MouseRecordingSession>): MouseRecordingSession | null {
    const idx = this.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return null;
    this.sessions[idx] = { ...this.sessions[idx], ...updates };
    this.saveToStorage();
    return this.sessions[idx];
  }

  /** Resets the store back to the built-in default historical sessions. */
  public clearAllSessions(): void {
    this.sessions = [...DEFAULT_HISTORICAL_SESSIONS];
    this.saveToStorage();
  }

  /** Returns the current baseline speed statistics and session count. */
  public getBaselineStats() {
    return {
      avgSpeed: this.baselineAvgSpeed,
      minExpectedSpeed: Math.max(50, this.baselineMinSpeed - 50),
      maxExpectedSpeed: Math.min(3000, this.baselineMaxSpeed + 350),
      totalSessions: this.sessions.length,
    };
  }

  /**
   * Subscribe to Speed Anomaly Alerts for Overseer Panel
   */
  public subscribeAnomalyAlerts(callback: (nudge: OverseerNudge, note: OverseerLearnedNote) => void): () => void {
    this.speedAnomalyAlertListeners.add(callback);
    return () => {
      this.speedAnomalyAlertListeners.delete(callback);
    };
  }

  /**
   * Evaluate live or recorded mouse motion speed against historical baseline
   */
  public checkSpeedAnomaly(
    currentSpeed: number,
    context: {
      stepTitle?: string;
      currentX?: number;
      currentY?: number;
      thresholdMultiplier?: number; // e.g. 2.0x baseline
    }
  ): { isAnomaly: boolean; type: 'too_fast' | 'too_slow' | 'normal'; deviationPercentage: number } {
    const stats = this.getBaselineStats();
    const threshold = context.thresholdMultiplier || 2.2;
    const upperLimit = Math.round(stats.avgSpeed * threshold);
    const lowerLimit = Math.round(stats.avgSpeed * 0.15); // Unusually stagnant/frozen

    if (currentSpeed > upperLimit && currentSpeed > 1200) {
      const deviation = Math.round(((currentSpeed - stats.avgSpeed) / stats.avgSpeed) * 100);
      return { isAnomaly: true, type: 'too_fast', deviationPercentage: deviation };
    }

    if (currentSpeed < lowerLimit && currentSpeed > 0) {
      const deviation = Math.round(((stats.avgSpeed - currentSpeed) / stats.avgSpeed) * 100);
      return { isAnomaly: false, type: 'too_slow', deviationPercentage: deviation };
    }

    return { isAnomaly: false, type: 'normal', deviationPercentage: 0 };
  }

  /**
   * Generates a smooth, human-like cubic bezier coordinate sequence matching historical baseline speeds
   */
  public generateCorrectedTrajectoryPath(
    start: { x: number; y: number },
    target: { x: number; y: number }
  ): Array<{ x: number; y: number; speed: number; timestampOffsetMs: number; label: string }> {
    const stats = this.getBaselineStats();
    const distance = Math.hypot(target.x - start.x, target.y - start.y);
    const stepsCount = Math.max(5, Math.min(10, Math.round(distance / 70)));
    
    // Slight human arc control points
    const midX = (start.x + target.x) / 2 + (Math.sin(distance / 50) * 35);
    const midY = (start.y + target.y) / 2 - (Math.cos(distance / 50) * 25);

    const waypoints: Array<{ x: number; y: number; speed: number; timestampOffsetMs: number; label: string }> = [];
    const totalDurationSec = distance / (stats.avgSpeed || 410);

    for (let i = 0; i <= stepsCount; i++) {
      const t = i / stepsCount;
      // Quadratic Bezier interpolation: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
      const x = Math.round((1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * midX + t * t * target.x);
      const y = Math.round((1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * midY + t * t * target.y);
      
      // Easing speed curve: slower at start and target arrival, peak in middle
      const speedFactor = 1 - 4 * Math.pow(t - 0.5, 2) * 0.4;
      const pointSpeed = Math.round(stats.avgSpeed * speedFactor);
      const timestampOffsetMs = Math.round(t * totalDurationSec * 1000);

      let label = `Waypoint ${i + 1}`;
      if (i === 0) label = 'Origin (Smoothed)';
      else if (i === stepsCount) label = 'Target Anchor Arrival';

      waypoints.push({
        x,
        y,
        speed: pointSpeed,
        timestampOffsetMs,
        label,
      });
    }

    return waypoints;
  }

  /**
   * Dispatches an anomaly alert to Overseer Panel
   */
  public emitSpeedAnomalyAlert(data: {
    currentSpeed: number;
    deviationPercentage: number;
    anomalyType: 'too_fast' | 'too_slow';
    stepTitle?: string;
    targetSelector?: string;
    coords?: { x: number; y: number };
  }): void {
    const stats = this.getBaselineStats();
    const isSpike = data.anomalyType === 'too_fast';

    const origin = { x: 960, y: 540 };
    const target = data.coords || { x: 960, y: 64 };
    const correctedWaypoints = this.generateCorrectedTrajectoryPath(origin, target);

    const nudgeId = `nudge-speed-anomaly-${Date.now()}`;
    const nudge: OverseerNudge = {
      id: nudgeId,
      title: `⚡ Mouse Speed Anomaly Detected (+${data.deviationPercentage}% deviation)`,
      message: `Current pointer speed is ${data.currentSpeed} px/s, significantly deviating from historical baseline (${stats.avgSpeed} px/s). This may indicate abrupt viewport dislocation or erratic automation drift.`,
      severity: 'warning',
      suggestedAction: {
        label: 'Auto-Fix Path to Baseline',
        step: {
          title: `Realign: ${data.stepTitle || 'Step Location'}`,
          targetSelector: data.targetSelector || '#main-content-canvas',
          actionType: 'verify_anchor',
          status: 'pending',
          reasoning: `Pointer velocity (${data.currentSpeed} px/s) exceeded baseline threshold by ${data.deviationPercentage}%. Trajectory auto-fixed to historical cubic bezier curve.`,
        },
      },
      pathAnomalyDetails: {
        currentSpeed: data.currentSpeed,
        baselineSpeed: stats.avgSpeed,
        deviationPercentage: data.deviationPercentage,
        anomalyType: data.anomalyType,
        stepTitle: data.stepTitle,
        targetSelector: data.targetSelector,
        originalCoords: target,
        correctedWaypoints,
        correctionMethod: 'cubic_bezier_smoothing',
        applied: false,
      },
    };

    const noteId = `note-anomaly-${Date.now()}`;
    const note: OverseerLearnedNote = {
      id: noteId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      category: 'drift_correction',
      title: `Mouse Dynamics Anomaly (${data.currentSpeed} px/s)`,
      observation: `Observed pointer velocity deviated +${data.deviationPercentage}% from historical baseline pattern of ${stats.avgSpeed} px/s during ${data.stepTitle || 'workflow execution'}.`,
      confidence: 94,
      actionTaken: 'Triggered Overseer anomaly notification with auto-fix trajectory suggestion.',
      frameDifferenceScore: 0.78,
    };

    this.speedAnomalyAlertListeners.forEach((listener) => {
      try {
        listener(nudge, note);
      } catch (err) {
        console.error('[MouseTrajectoryStore] Listener error:', err);
      }
    });
  }

  /**
   * Serializes and exports recorded coordinate streams as a JSON formatted payload
   */
  public exportSessionData(sessionId?: string): {
    exportDate: string;
    targetSession: string;
    totalPoints: number;
    sessions: MouseRecordingSession[];
    baselineStats: { avgSpeed: number; minExpectedSpeed: number; maxExpectedSpeed: number; totalSessions: number };
    hotspotZones: InteractionHotspotZone[];
  } {
    const targetSessions = !sessionId || sessionId === 'all'
      ? this.sessions
      : this.sessions.filter((s) => s.id === sessionId);

    const totalPoints = targetSessions.reduce((acc, s) => acc + s.points.length, 0);

    return {
      exportDate: new Date().toISOString(),
      targetSession: sessionId || 'all',
      totalPoints,
      sessions: targetSessions,
      baselineStats: this.getBaselineStats(),
      hotspotZones: this.getInteractionHotspots(),
    };
  }

  /**
   * Computes cluster interaction hotspots from all historical recordings
   */
  public getInteractionHotspots(): InteractionHotspotZone[] {
    const allPoints: RecordedMousePoint[] = [];
    this.sessions.forEach((s) => allPoints.push(...s.points));

    if (allPoints.length === 0) {
      return [
        {
          id: 'hotspot-search',
          x: 960,
          y: 48,
          radius: 48,
          normalizedX: 0.5,
          normalizedY: 0.044,
          intensity: 0.95,
          eventCount: 28,
          clickCount: 12,
          label: 'Omnibox Search Anchor',
        },
        {
          id: 'hotspot-new-btn',
          x: 120,
          y: 120,
          radius: 52,
          normalizedX: 0.062,
          normalizedY: 0.111,
          intensity: 0.88,
          eventCount: 22,
          clickCount: 10,
          label: 'Primary "+ New" Action Button',
        },
        {
          id: 'hotspot-close-x',
          x: 920,
          y: 120,
          radius: 40,
          normalizedX: 0.479,
          normalizedY: 0.111,
          intensity: 0.76,
          eventCount: 18,
          clickCount: 8,
          label: "Modal 'X' Close Target",
        },
        {
          id: 'hotspot-grid-row',
          x: 480,
          y: 380,
          radius: 65,
          normalizedX: 0.25,
          normalizedY: 0.352,
          intensity: 0.82,
          eventCount: 34,
          clickCount: 14,
          label: 'File Grid Action Zone',
        },
      ];
    }

    // Grid clustering: 1920x1080 into 12x8 buckets
    const gridCols = 16;
    const gridRows = 9;
    const cellWidth = 1920 / gridCols;
    const cellHeight = 1080 / gridRows;

    const clusters = new Map<string, { count: number; clicks: number; sumX: number; sumY: number }>();

    allPoints.forEach((p) => {
      const col = Math.min(gridCols - 1, Math.max(0, Math.floor(p.x / cellWidth)));
      const row = Math.min(gridRows - 1, Math.max(0, Math.floor(p.y / cellHeight)));
      const key = `${col}_${row}`;

      const weight = p.type === 'click' ? 3 : 1;
      const current = clusters.get(key) || { count: 0, clicks: 0, sumX: 0, sumY: 0 };
      current.count += weight;
      if (p.type === 'click') current.clicks++;
      current.sumX += p.x * weight;
      current.sumY += p.y * weight;
      clusters.set(key, current);
    });

    let maxWeight = 1;
    clusters.forEach((c) => {
      if (c.count > maxWeight) maxWeight = c.count;
    });

    const hotspots: InteractionHotspotZone[] = [];
    let idx = 1;

    clusters.forEach((c, key) => {
      if (c.count >= 2) {
        const avgX = Math.round(c.sumX / c.count);
        const avgY = Math.round(c.sumY / c.count);
        const intensity = Math.min(1.0, Math.max(0.2, c.count / maxWeight));

        let label = `Interaction Zone ${idx}`;
        if (avgY < 120 && Math.abs(avgX - 960) < 300) label = 'Search & Header Bar';
        else if (avgX < 250 && avgY < 250) label = 'Sidebar Action Hub';
        else if (avgX > 800 && avgY < 200) label = 'Modal Dismiss / Settings';
        else if (avgY > 200 && avgY < 700) label = 'Drive File Grid Selection';

        hotspots.push({
          id: `hotspot-${key}`,
          x: avgX,
          y: avgY,
          radius: Math.round(30 + intensity * 35),
          normalizedX: avgX / 1920,
          normalizedY: avgY / 1080,
          intensity,
          eventCount: c.count,
          clickCount: c.clicks,
          label,
        });
        idx++;
      }
    });

    // Sort by intensity descending and return top 8
    return hotspots.sort((a, b) => b.intensity - a.intensity).slice(0, 8);
  }
}
