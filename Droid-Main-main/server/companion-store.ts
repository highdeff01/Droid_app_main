import type { DurableStore } from "./durable-store";

export const createCompanionId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const nowIso = () => new Date().toISOString();

/**
 * One DurableStore collection of records keyed by id, re-read before each
 * operation and bounded to `limit` entries (oldest dropped first).
 */
export class CompanionCollection<T extends { id: string }> {
  constructor(
    private readonly store: DurableStore,
    private readonly name: string,
    private readonly limit = 2000,
  ) {}

  all(): T[] {
    return this.store.readCollection<T>(this.name);
  }

  get(id: string): T | undefined {
    return this.all().find((item) => item.id === id);
  }

  insert(item: T): T {
    const items = this.store.readCollectionForWrite<T>(this.name);
    items.push(item);
    this.store.writeCollection(this.name, items.slice(-this.limit));
    return item;
  }

  update(id: string, changes: Partial<T>): T | undefined {
    const items = this.store.readCollectionForWrite<T>(this.name);
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    items[index] = { ...items[index], ...changes, id };
    this.store.writeCollection(this.name, items);
    return items[index];
  }

  remove(id: string): boolean {
    const items = this.store.readCollectionForWrite<T>(this.name);
    const kept = items.filter((item) => item.id !== id);
    if (kept.length === items.length) return false;
    this.store.writeCollection(this.name, kept);
    return true;
  }
}
