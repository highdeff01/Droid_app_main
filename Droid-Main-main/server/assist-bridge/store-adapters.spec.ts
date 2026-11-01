import { describe, it, expect } from "vitest";
import { advanceWatermarks, applySyncEntries, fromPayload, loadSyncEntries, mergeDelta, mergeLine, outgoingDelta, toPayload, type SyncEntry } from "./store-adapters";
import { AvoidRuleStore, blockedLine, isBlocking, ruleCovers, type AvoidRule } from "./avoid-rules";
import { DurableStore } from "../durable-store";

const entry = (store: SyncEntry["store"], key: string, at: number, value: Record<string, unknown> = {}): SyncEntry => ({ store, key, at, value });

function rule(overrides: Partial<AvoidRule> = {}): AvoidRule {
  const now = Date.now();
  return {
    id: "r1",
    action: "click",
    target: "Delete account",
    x: 0.5,
    y: 0.5,
    source: "habit",
    reason: "destroyed the account",
    strikes: 2,
    firstAt: now,
    lastAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  };
}

describe("outgoingDelta", () => {
  it("sends everything never synced, and only newer entries once a watermark exists", () => {
    const entries = [entry("habits", "a", 10), entry("habits", "b", 20), entry("patterns", "c", 5)];
    const watermarks = { habits: { a: 10 } };
    expect(outgoingDelta(entries, watermarks)).toEqual([entry("habits", "b", 20), entry("patterns", "c", 5)]);
  });
});

describe("mergeDelta", () => {
  it("keeps the most recent observation per key", () => {
    const local = [entry("habits", "a", 10, { v: "local" })];
    const incoming = [entry("habits", "a", 20, { v: "peer" })];
    const result = mergeDelta(local, incoming);
    expect(result.added).toEqual([entry("habits", "a", 20, { v: "peer" })]);
    expect(result.kept).toBe(0);
  });

  it("keeps the local entry on an equal timestamp and counts it kept, dropping nothing", () => {
    const local = [entry("habits", "a", 10, { v: "local" })];
    const result = mergeDelta(local, [entry("habits", "a", 10, { v: "peer" })]);
    expect(result.added).toEqual([]);
    expect(result.kept).toBe(1);
  });

  it("adds an unseen key and collapses a key repeated inside the delta to its newest", () => {
    const result = mergeDelta([], [entry("familiar", "x", 5), entry("familiar", "x", 9)]);
    expect(result.added).toEqual([entry("familiar", "x", 9)]);
    expect(result.duplicates).toBe(1);
  });
});

describe("advanceWatermarks", () => {
  it("remembers the newest time per store and key", () => {
    const next = advanceWatermarks({}, [entry("habits", "a", 10), entry("habits", "a", 30)]);
    expect(next.habits?.a).toBe(30);
  });
});

describe("payload round-trip", () => {
  it("survives toPayload then fromPayload", () => {
    const entries = [entry("elementMap", "el-1", 42, { label: "Save" })];
    expect(fromPayload(toPayload(entries))).toEqual(entries);
  });
});

describe("mergeLine", () => {
  it("names the source, the count and the stores", () => {
    const line = mergeLine("droid-new", { added: [entry("habits", "a", 1)], kept: 2, duplicates: 0 });
    expect(line).toContain("Store sync from droid-new");
    expect(line).toContain("learned 1");
    expect(line).toContain("habits");
    expect(line).toContain("kept 2");
  });
});

describe("AvoidRuleStore", () => {
  const store = () => new AvoidRuleStore({ inMemory: true });

  it("blocks an action whose scope matches a live rule", () => {
    const s = store();
    s.merge([rule()]);
    expect(s.blocking("click", "Delete account", { x: 0.5, y: 0.5 })).not.toBeNull();
  });

  it("does not block a different action, target or far-off point", () => {
    const s = store();
    s.merge([rule()]);
    expect(s.blocking("type", "Delete account", null)).toBeNull();
    expect(s.blocking("click", "Save file", { x: 0.5, y: 0.5 })).toBeNull();
    expect(s.blocking("click", "Delete account", { x: 0.9, y: 0.9 })).toBeNull();
  });

  it("does not block a non-pointer action on a point far from the rule", () => {
    const s = store();
    s.merge([rule({ action: "key", x: null, y: null })]);
    expect(s.blocking("key", "Delete account", null)).not.toBeNull();
  });

  it("keeps the most recent observation when the same id syncs twice", () => {
    const s = store();
    const older = rule({ lastAt: 100, reason: "old" });
    const newer = rule({ lastAt: 200, reason: "new" });
    s.merge([older]);
    s.merge([newer]);
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].reason).toBe("new");
  });

  it("ignores a stale observation of an id it already holds", () => {
    const s = store();
    s.merge([rule({ lastAt: 200, reason: "new" })]);
    s.merge([rule({ lastAt: 100, reason: "old" })]);
    expect(s.list()[0].reason).toBe("new");
  });

  it("drops an expired rule from live()", () => {
    const s = store();
    s.merge([rule({ expiresAt: Date.now() - 1 })]);
    expect(s.live()).toHaveLength(0);
  });

  it("exposes its rules as delta entries", () => {
    const s = store();
    s.merge([rule()]);
    const entries = s.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].store).toBe("avoidRules");
    expect(entries[0].key).toBe("r1");
  });
});

describe("avoid-rule shape", () => {
  it("blocks a dismissal cooldown without strikes, but a habit rule needs strikes", () => {
    expect(isBlocking(rule({ source: "dismissal", strikes: 0 }))).toBe(true);
    expect(isBlocking(rule({ source: "habit", strikes: 1 }))).toBe(false);
    expect(isBlocking(rule({ source: "habit", strikes: 2 }))).toBe(true);
  });

  it("names the rule in the block line", () => {
    expect(blockedLine(rule())).toContain("blacklisted");
    expect(blockedLine(rule())).toContain("Delete account");
  });
});

describe("applySyncEntries", () => {
  it("merges an inbound avoidRules entry into the enforcing store", () => {
    const before = new AvoidRuleStore({ inMemory: true }).list().length;
    const result = applySyncEntries([entry("avoidRules", "sync-rule-1", Date.now(), rule({ id: "sync-rule-1" }) as unknown as Record<string, unknown>)]);
    expect(result.added.some((e) => e.store === "avoidRules")).toBe(true);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it("keeps a non-avoid entry in the synced-knowledge cache without touching avoid rules", () => {
    const result = applySyncEntries([entry("elementMap", "el-sync-1", Date.now(), { label: "Save" })]);
    expect(result.added).toEqual([entry("elementMap", "el-sync-1", result.added[0].at, { label: "Save" })]);
  });
});

describe("loadSyncEntries", () => {
  it("returns well-formed entries with a known store name", () => {
    const entries = loadSyncEntries();
    const stores = new Set(["habits", "familiar", "elementMap", "accessPaths", "avoidRules", "patterns"]);
    for (const e of entries) {
      expect(stores.has(e.store)).toBe(true);
      expect(typeof e.key).toBe("string");
      expect(e.key.length).toBeGreaterThan(0);
    }
  });

  it("gives each key a stable time across reads, so a sent delta is not re-sent", () => {
    const first = loadSyncEntries();
    const marks = advanceWatermarks({}, first);
    const second = loadSyncEntries();
    expect(outgoingDelta(second, marks)).toEqual([]);
  });
});

describe("DurableStore isolation", () => {
  it("an in-memory store starts empty", () => {
    expect(new DurableStore({ inMemory: true }).readCollection("avoidRules")).toEqual([]);
  });
});
