import {
  DELAY_MULTIPLIER_MAX,
  DELAY_MULTIPLIER_MIN,
  type ClickZone,
  type GateStats,
  type LearningOutcome,
  type UserHabitProfile,
} from "../shared/learning";

/** Clicks within this many px share a zone. */
const ZONE_RADIUS_PX = 50;
const RECENT_WINDOW = 8;
const OUTCOME_WINDOW = 50;
const MULTIPLIER_STEP = 0.1;
/** Consecutive verified/completed outcomes that lower a learned delay multiplier. */
const SUCCESS_STREAK = 5;

interface RecordedAction {
  type: string;
  x?: number;
  y?: number;
  text?: string;
  success?: boolean;
  time: number;
}

const clampMultiplier = (value: number) =>
  Math.round(Math.min(DELAY_MULTIPLIER_MAX, Math.max(DELAY_MULTIPLIER_MIN, value)) * 100) / 100;

/** Group points into zones of ZONE_RADIUS_PX, most-used first. */
export function clusterZones(points: Array<{ x: number; y: number; label?: string }>, limit = 4): ClickZone[] {
  const zones: Array<ClickZone & { sumX: number; sumY: number }> = [];
  for (const p of points) {
    const zone = zones.find(
      (z) => Math.hypot(z.x - p.x, z.y - p.y) <= ZONE_RADIUS_PX,
    );
    if (zone) {
      zone.count++;
      zone.sumX += p.x;
      zone.sumY += p.y;
      zone.x = Math.round(zone.sumX / zone.count);
      zone.y = Math.round(zone.sumY / zone.count);
    } else {
      zones.push({ x: p.x, y: p.y, count: 1, label: p.label || "action", sumX: p.x, sumY: p.y });
    }
  }
  return zones
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ x, y, count, label }) => ({ x, y, count, label }));
}

/** Habit + outcome learning; every number in the profile is computed from recorded data. */
export class HabitTracker {
  private totalActions = 0;
  private appUsage = new Map<string, number>();
  private clickPositions: Array<{ x: number; y: number; label?: string }> = [];
  private recentActions: RecordedAction[] = [];
  private outcomes: LearningOutcome[] = [];
  private successZones: Array<{ x: number; y: number; label?: string }> = [];
  private delayMultiplier = DELAY_MULTIPLIER_MIN;
  private userAdjusted = false;
  private successStreak = 0;

  recordAction(action: Omit<RecordedAction, "time"> & { app?: string }): void {
    this.totalActions++;
    if (action.app) this.appUsage.set(action.app, (this.appUsage.get(action.app) ?? 0) + 1);
    if (action.x !== undefined && action.y !== undefined) {
      this.clickPositions.push({ x: action.x, y: action.y, label: action.type });
      if (this.clickPositions.length > 50) this.clickPositions.shift();
    }
    this.recentActions.push({ ...action, time: Date.now() });
    if (this.recentActions.length > 20) this.recentActions.shift();
  }

  /** Feed one verified-run outcome back; failures slow movement down, success streaks speed it up. */
  recordOutcome(outcome: LearningOutcome): void {
    this.outcomes.push(outcome);
    if (this.outcomes.length > OUTCOME_WINDOW) this.outcomes.shift();
    const hasPoint = outcome.x !== undefined && outcome.y !== undefined;
    if (outcome.kind === "step_completed" && hasPoint) {
      this.successZones.push({ x: outcome.x!, y: outcome.y!, label: outcome.label });
      if (this.successZones.length > OUTCOME_WINDOW) this.successZones.shift();
    }
    this.adaptDelay(outcome);
  }

  private adaptDelay(outcome: LearningOutcome): void {
    const failed = outcome.kind === "step_failed" || outcome.kind === "target_not_found";
    const succeeded = outcome.kind === "step_completed" || outcome.kind === "gate_verified";
    if (failed) this.successStreak = 0;
    else if (succeeded) this.successStreak++;
    if (this.userAdjusted) return;
    if (failed) {
      this.delayMultiplier = clampMultiplier(this.delayMultiplier + MULTIPLIER_STEP);
    } else if (this.successStreak >= SUCCESS_STREAK) {
      this.successStreak = 0;
      this.delayMultiplier = clampMultiplier(this.delayMultiplier - MULTIPLIER_STEP);
    }
  }

  /** User setting from the HUD; null hands control back to learning. */
  setDelayMultiplier(value: number | null): void {
    if (value === null) {
      this.userAdjusted = false;
      return;
    }
    this.delayMultiplier = clampMultiplier(value);
    this.userAdjusted = true;
  }

  private gateStats(): GateStats {
    const count = (kind: LearningOutcome["kind"]) => this.outcomes.filter((o) => o.kind === kind).length;
    const verified = count("gate_verified");
    const blocked = count("gate_blocked");
    const targetNotFound = count("target_not_found");
    const overrides = count("user_override");
    const attempts = verified + blocked + targetNotFound + overrides;
    return {
      attempts,
      verified,
      blocked,
      targetNotFound,
      overrides,
      successRate: attempts ? verified / attempts : null,
    };
  }

  private corrections(): UserHabitProfile["corrections"] {
    const list = this.outcomes.filter((o) => o.kind === "coordinate_correction");
    const mean = (key: "dx" | "dy") =>
      list.length ? list.reduce((sum, o) => sum + (o[key] ?? 0), 0) / list.length : null;
    return { count: list.length, meanDx: mean("dx"), meanDy: mean("dy") };
  }

  private repetition() {
    const recent = this.recentActions.slice(-RECENT_WINDOW);
    if (recent.length < 3) return { detected: false, count: 0, rate: null, pattern: undefined };
    const lastType = recent[recent.length - 1].type;
    const matching = recent.filter((r) => r.type === lastType);
    const detected = matching.length >= 3;
    const last = matching[matching.length - 1];
    const pattern = detected
      ? {
          actionType: lastType,
          count: matching.length,
          coordinates: last.x !== undefined && last.y !== undefined ? { x: last.x, y: last.y } : undefined,
          suggestedAutomation: `Automate repetitive ${lastType.toUpperCase()} routine across multiple cycles`,
        }
      : undefined;
    return { detected, count: detected ? matching.length : 0, rate: matching.length / recent.length, pattern };
  }

  profile(learnedWorkflowsCount: number): UserHabitProfile {
    const repetition = this.repetition();
    return {
      totalActionsRecorded: this.totalActions,
      appUsageFrequencies: Object.fromEntries(this.appUsage),
      topClickZones: clusterZones(this.clickPositions),
      repetitiveActionDetected: repetition.detected,
      repetitiveActionCount: repetition.count,
      habitDetectionRate: repetition.rate,
      repeatedPattern: repetition.pattern,
      preferredDevice: "desktop",
      learnedWorkflowsCount,
      gateStats: this.gateStats(),
      corrections: this.corrections(),
      movement: {
        delayMultiplier: this.delayMultiplier,
        userAdjusted: this.userAdjusted,
        preferredZones: clusterZones(this.successZones, 3),
      },
    };
  }
}
