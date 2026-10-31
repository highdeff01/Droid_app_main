import type { StoreDeltaEntry } from "../../shared/assist-bridge";
import { DurableStore, type StorageOptions } from "../durable-store";

/** One dispatch-blocking avoid rule, mirroring the shape droid-new learns and syncs. */
export interface AvoidRule {
  id: string;
  action: string;
  target: string;
  /** The blocked point, normalised 0..1; null for a non-pointer action (the action on the target anywhere). */
  x: number | null;
  y: number | null;
  source: "habit" | "test" | "dismissal";
  reason: string;
  strikes: number;
  firstAt: number;
  lastAt: number;
  expiresAt: number;
}

/** Fresh failures a (non-dismissal) rule needs before it blocks, matching droid-new. */
export const RELEARN_STRIKES = 2;
/** A rule covers points within this normalised distance of its own (3% of the screen). */
export const AVOID_RADIUS = 0.03;
export const AVOID_RULE_LIMIT = 100;

const COLLECTION = "avoidRules";

/** A rule is well-formed when it carries an identity, an action/target, coords (or nulls) and times. */
export function isAvoidRule(v: unknown): v is AvoidRule {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const num = (k: string) => typeof r[k] === "number" && Number.isFinite(r[k]);
  const coord = (k: string) => r[k] === null || num(k);
  return (
    typeof r.id === "string" &&
    typeof r.action === "string" &&
    typeof r.target === "string" &&
    !!r.target.trim() &&
    ["habit", "test", "dismissal"].includes(r.source as string) &&
    typeof r.reason === "string" &&
    coord("x") &&
    coord("y") &&
    num("strikes") &&
    num("firstAt") &&
    num("lastAt") &&
    num("expiresAt")
  );
}

/** Whether a live rule blocks: a dismissal cooldown always, any other once it has RELEARN_STRIKES. */
export const isBlocking = (r: AvoidRule, now = Date.now()): boolean =>
  r.expiresAt > now && (r.source === "dismissal" || r.strikes >= RELEARN_STRIKES);

const fold = (s: string) => s.toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
/** The same target: equal names, case/quote/space-insensitive (never a shared word). */
const sameTarget = (a: string, b: string) => fold(a) === fold(b);

/** The pointer actions whose coordinates must fall inside a rule's vicinity to be blocked. */
const POINTER_ACTIONS = new Set(["click", "double_click", "move", "drag", "scroll", "tap", "double_tap", "swipe"]);

const near = (r: AvoidRule, p: { x: number; y: number } | null): boolean =>
  r.x === null || r.y === null || !p ? r.x === null && !p : Math.hypot(r.x - p.x, r.y - p.y) <= AVOID_RADIUS;

/** Whether `r` is about this action: same action, same target, and (pointer actions) point within AVOID_RADIUS. */
export function ruleCovers(r: AvoidRule, action: string, target: string, point: { x: number; y: number } | null): boolean {
  if (r.action !== action) return false;
  if (!sameTarget(r.target, target)) return false;
  return near(r, POINTER_ACTIONS.has(action) ? point : null);
}

/**
 * Durable store of avoid rules learned in either app, and the enforcement point: an action whose
 * scope matches a live rule is refused before it runs, so a blacklist entry learned in droid-new
 * blocks the same action in droid-main too.
 */
export class AvoidRuleStore {
  private readonly store: DurableStore;

  constructor(options: StorageOptions = {}) {
    this.store = new DurableStore(options);
  }

  /** Every stored rule, most recent first. */
  list(): AvoidRule[] {
    return this.store.readCollection<AvoidRule>(COLLECTION).filter(isAvoidRule);
  }

  /** The rules still alive at `now`. */
  live(now = Date.now()): AvoidRule[] {
    return this.list().filter((r) => r.expiresAt > now);
  }

  /**
   * Merges inbound rules by id, keeping the most recent observation (newest `lastAt` wins; a tie keeps
   * the local one so nothing is dropped). Returns how many were added or updated.
   */
  merge(incoming: readonly AvoidRule[], now = Date.now()): number {
    const current = this.list();
    const byId = new Map(current.map((r) => [r.id, r]));
    let changed = 0;
    for (const rule of incoming) {
      if (!isAvoidRule(rule)) continue;
      const existing = byId.get(rule.id);
      if (existing && existing.lastAt >= rule.lastAt) continue;
      byId.set(rule.id, rule);
      changed += 1;
    }
    if (!changed) return 0;
    const merged = [...byId.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, AVOID_RULE_LIMIT);
    this.store.writeCollection(COLLECTION, merged);
    return changed;
  }

  /** The blocking rule for this action, or null. */
  blocking(action: string, target: string, point: { x: number; y: number } | null, now = Date.now()): AvoidRule | null {
    return this.live(now).find((r) => isBlocking(r, now) && ruleCovers(r, action, target, point)) ?? null;
  }

  /** The entries this store contributes to an outbound delta. */
  entries(): StoreDeltaEntry[] {
    return this.list().map((r) => ({ store: "avoidRules" as const, key: r.id, at: r.lastAt, value: r as unknown as Record<string, unknown> }));
  }
}

export const avoidRuleStore = new AvoidRuleStore();

/** The log line for a blocked action, naming the rule that stopped it. */
export const blockedLine = (r: AvoidRule): string =>
  `blocked — blacklisted: ${r.action} "${r.target}"${r.x !== null && r.y !== null ? ` near (${Math.round(r.x * 100)}%, ${Math.round(r.y * 100)}%)` : ""} — ${r.reason}`;
