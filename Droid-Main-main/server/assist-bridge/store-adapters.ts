/**
 * Adapters between droid-main's learned knowledge and the flat sync-entry form
 * `{store, key, at, value}` the assist bridge carries. droid-main's knowledge lives in different
 * structures than droid-new's flat `droid-assist.*` keys, so the sync maps through here rather than
 * writing either side's storage directly.
 *
 * Inbound entries land in two places: `avoidRules` are merged into the enforcing AvoidRuleStore (so a
 * blacklist entry learned in droid-new blocks actions here), and everything else is kept in a durable
 * `syncedKnowledge` cache so droid-main's own deltas can echo what it has learned from the peer.
 */
import type { StoreDeltaEntry, SyncStore } from "../../shared/assist-bridge";
import { DurableStore, type StorageOptions } from "../durable-store";
import { methodLearningSystem } from "../method-learning";
import { bestFlowRepository } from "../best-flow-store";
import { avoidRuleStore, isAvoidRule, type AvoidRule } from "./avoid-rules";

/** The last time each store was observed here, per entry key; the base of the next delta. */
export type StoreWatermarks = Partial<Record<SyncStore, Record<string, number>>>;

/** One entry as it travels; the same shape droid-new sends and accepts. */
export interface SyncEntry {
  store: SyncStore;
  key: string;
  /** Last verified observation, ms since epoch. */
  at: number;
  value: Record<string, unknown>;
}

/** What a merge changed, for the log line and the store writes. */
export interface MergeResult {
  /** Entries this side did not have, or had older. */
  added: SyncEntry[];
  /** Entries this side already had at the same or a newer time (kept). */
  kept: number;
  /** Entries dropped because the delta repeated a key already taken from it. */
  duplicates: number;
}

const SYNCED = "syncedKnowledge";

/** The delta this side should send: every entry observed after the watermark for its store. */
export function outgoingDelta(entries: readonly SyncEntry[], watermarks: StoreWatermarks): SyncEntry[] {
  return entries.filter((e) => {
    const mark = watermarks[e.store]?.[e.key];
    return mark === undefined || e.at > mark;
  });
}

/**
 * Merges a peer's delta over the entries this side holds. A key seen before keeps the most recent
 * observation; equal timestamps keep the local one and count the peer's as kept, so nothing is dropped.
 * A key repeated inside the delta itself is sent to `added` once.
 */
export function mergeDelta(local: readonly SyncEntry[], incoming: readonly SyncEntry[]): MergeResult {
  const id = (e: SyncEntry) => `${e.store}\u0000${e.key}`;
  const byStoreKey = new Map(local.map((e) => [id(e), e]));
  const added = new Map<string, SyncEntry>();
  let kept = 0;
  let duplicates = 0;
  for (const entry of incoming) {
    const key = id(entry);
    const current = byStoreKey.get(key);
    if (current && current.at >= entry.at) {
      kept += 1;
      continue;
    }
    const pending = added.get(key);
    if (pending) {
      duplicates += 1;
      if (entry.at > pending.at) added.set(key, entry);
      continue;
    }
    added.set(key, entry);
  }
  return { added: [...added.values()], kept, duplicates };
}

/** Watermarks advanced by `entries`: each store remembers the newest time it has seen per key. */
export function advanceWatermarks(watermarks: StoreWatermarks, entries: readonly SyncEntry[]): StoreWatermarks {
  const next: StoreWatermarks = { ...watermarks };
  for (const e of entries) {
    const store = { ...(next[e.store] ?? {}) };
    store[e.key] = Math.max(store[e.key] ?? 0, e.at);
    next[e.store] = store;
  }
  return next;
}

/** The entries of a validated wire delta. */
export const fromPayload = (entries: readonly StoreDeltaEntry[]): SyncEntry[] =>
  entries.map((e) => ({ store: e.store, key: e.key, at: e.at, value: e.value }));

/** The wire entries of a delta. */
export const toPayload = (entries: readonly SyncEntry[]): StoreDeltaEntry[] =>
  entries.map((e) => ({ store: e.store, key: e.key, at: e.at, value: e.value }));

/** A one-line summary of a merge, for the log. */
export const mergeLine = (from: string, result: MergeResult): string =>
  `Store sync from ${from}: learned ${result.added.length} (${[...new Set(result.added.map((e) => e.store))].join(", ") || "none"}), kept ${result.kept} local${result.duplicates ? `, ${result.duplicates} repeated in the delta` : ""}`;

/**
 * Entries droid-main derives on each read but does not persist with a time of its own carry `at: 0`.
 * A real observation from the peer then supersedes them, and the watermark stops them being re-sent
 * every cycle (a fresh `Date.now()` would look newer than the last send each time).
 */
const DERIVED_AT = 0;

/**
 * Reads droid-main's learned knowledge as sync entries: habits (click zones, delay multiplier, app
 * usage), familiar methods, working templates, verified flows, avoid rules and repeated patterns.
 */
export function loadSyncEntries(): SyncEntry[] {
  const entries: SyncEntry[] = [];
  const profile = methodLearningSystem.getUserHabitProfile();

  entries.push({ store: "habits", key: "delayMultiplier", at: DERIVED_AT, value: { delayMultiplier: profile.movement.delayMultiplier, userAdjusted: profile.movement.userAdjusted } });
  for (const zone of profile.topClickZones) {
    entries.push({ store: "habits", key: `zone:${zone.label ?? "action"}@${zone.x},${zone.y}`, at: DERIVED_AT, value: zone as unknown as Record<string, unknown> });
  }
  for (const [app, count] of Object.entries(profile.appUsageFrequencies)) {
    entries.push({ store: "habits", key: `app:${app}`, at: DERIVED_AT, value: { app, count } });
  }

  for (const method of methodLearningSystem.getAllMethods()) {
    entries.push({ store: "familiar", key: method.id, at: Date.parse(method.lastUsedAt) || DERIVED_AT, value: method as unknown as Record<string, unknown> });
  }
  for (const template of methodLearningSystem.getWorkingTemplates()) {
    entries.push({ store: "elementMap", key: template.id, at: DERIVED_AT, value: template as unknown as Record<string, unknown> });
  }
  for (const flow of bestFlowRepository.list()) {
    entries.push({ store: "accessPaths", key: flow.id, at: flow.updatedAt ?? DERIVED_AT, value: flow as unknown as Record<string, unknown> });
  }
  entries.push(...avoidRuleStore.entries());
  if (profile.repeatedPattern) {
    entries.push({ store: "patterns", key: `pattern:${profile.repeatedPattern.actionType}`, at: DERIVED_AT, value: profile.repeatedPattern as unknown as Record<string, unknown> });
  }
  return entries;
}

/** The durable cache of inbound entries that have no writable home in droid-main's own stores. */
class SyncedKnowledge {
  private readonly store: DurableStore;

  constructor(options: StorageOptions = {}) {
    this.store = new DurableStore(options);
  }

  list(): SyncEntry[] {
    return this.store.readCollection<SyncEntry>(SYNCED).filter((e) => !!e && typeof e.store === "string" && typeof e.key === "string");
  }

  write(entries: readonly SyncEntry[]): void {
    const byKey = new Map(this.list().map((e) => [`${e.store}\u0000${e.key}`, e]));
    for (const entry of entries) byKey.set(`${entry.store}\u0000${entry.key}`, entry);
    this.store.writeCollection(SYNCED, [...byKey.values()]);
  }
}

export const syncedKnowledge = new SyncedKnowledge();

/** The AvoidRule an inbound `avoidRules` entry carries, or null when it is malformed. */
export function avoidRuleFromEntry(entry: SyncEntry): AvoidRule | null {
  const candidate = { ...entry.value, id: typeof entry.value.id === "string" ? entry.value.id : entry.key };
  return isAvoidRule(candidate) ? candidate : null;
}

/**
 * Applies a peer's delta to droid-main: avoid rules go into the enforcing store, everything else into
 * the durable synced-knowledge cache. Returns the merge summary.
 */
export function applySyncEntries(incoming: readonly SyncEntry[], now = Date.now()): MergeResult {
  const local = [...syncedKnowledge.list(), ...loadSyncEntries()];
  const result = mergeDelta(local, incoming);
  if (!result.added.length) return result;
  const rules = result.added.map(avoidRuleFromEntry).filter((r): r is AvoidRule => r !== null);
  if (rules.length) avoidRuleStore.merge(rules, now);
  const rest = result.added.filter((e) => e.store !== "avoidRules");
  if (rest.length) syncedKnowledge.write(rest);
  return result;
}
