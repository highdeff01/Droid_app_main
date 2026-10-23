import { describe, expect, it } from "vitest";
import {
  MAX_RECORDING_SESSIONS,
  MAX_SESSION_THUMBNAILS,
  MouseTrajectoryStore,
  buildRecordedSession,
  type MouseRecordingPoint,
  type SessionStorageLike,
} from "./mouse-trajectory-store";

function memoryStorage(): SessionStorageLike {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      value = v;
    },
  };
}

function limitedStorage(maxChars: number): SessionStorageLike {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      if (v.length > maxChars) throw new Error("storage quota exceeded");
      value = v;
    },
  };
}

function point(overrides: Partial<MouseRecordingPoint> = {}): MouseRecordingPoint {
  return { x: 0, y: 0, timestamp: 0, type: "move", ...overrides };
}

describe("MouseTrajectoryStore", () => {
  it("keeps exactly 100 sessions after 105 saves, newest first, evicting the first 5 by name", () => {
    const store = new MouseTrajectoryStore(memoryStorage());
    for (let i = 0; i < 105; i++) {
      store.saveRecording({ points: [point({ timestamp: i })], name: `name-${i}`, now: i });
    }
    const sessions = store.getSessions();
    expect(sessions.length).toBe(MAX_RECORDING_SESSIONS);
    expect(sessions[0].name).toBe("name-104");
    expect(sessions[sessions.length - 1].name).toBe("name-5");
    const names = sessions.map((s) => s.name);
    for (let i = 0; i < 5; i++) {
      expect(names).not.toContain(`name-${i}`);
    }
  });

  it("creates a new session with a distinct id on every saveRecording call, even with identical points and now", () => {
    const store = new MouseTrajectoryStore(memoryStorage());
    const points = [point({ timestamp: 10 }), point({ timestamp: 20 })];
    const first = store.saveRecording({ points, now: 5000 });
    const second = store.saveRecording({ points, now: 5000 });
    expect(first.id).toBeDefined();
    expect(second.id).toBeDefined();
    expect(first.id).not.toBe(second.id);
    expect(store.getSessions().length).toBe(2);
  });

  it("gives saveSession a new id and keeps both sessions when the given id is already in the ledger", () => {
    const store = new MouseTrajectoryStore(memoryStorage());
    const original = store.saveSession({ id: "dup", name: "first", points: [] });
    const second = store.saveSession({ id: "dup", name: "second", points: [] });
    expect(second.id).not.toBe("dup");
    expect(second.id).not.toBe(original.id);
    expect(store.getSessions().length).toBe(2);
    expect(store.getSession(original.id as string)?.name).toBe("first");
  });

  it("computes buildRecordedSession metadata from the points and now", () => {
    const points = [
      point({ timestamp: 1000, type: "move" }),
      point({ timestamp: 1200, type: "click" }),
      point({ timestamp: 1400, type: "move" }),
      point({ timestamp: 1600, type: "click" }),
    ];
    const thumbnails = Array.from({ length: MAX_SESSION_THUMBNAILS + 3 }, (_, i) => ({
      imageData: `data:${i}`,
      timestamp: 1000 + i,
    }));
    const now = 1700;
    const session = buildRecordedSession({ points, thumbnails, now });

    expect(session.durationMs).toBe(600);
    expect(session.stepCount).toBe(2);
    expect(session.thumbnails?.length).toBe(MAX_SESSION_THUMBNAILS);
    expect(session.frameCount).toBe(session.thumbnails?.length);
    expect(session.createdAt).toBe(new Date(now).toISOString());
  });

  it("reads sessions back when a second store is constructed on the same storage", () => {
    const storage = memoryStorage();
    const store1 = new MouseTrajectoryStore(storage);
    store1.saveRecording({ points: [point()], name: "persisted" });

    const store2 = new MouseTrajectoryStore(storage);
    expect(store2.getSessions().length).toBe(1);
    expect(store2.getSessions()[0].name).toBe("persisted");
  });

  it("drops the oldest sessions until the persisted JSON fits when setItem throws over a size limit", () => {
    const storage = limitedStorage(400);
    const store = new MouseTrajectoryStore(storage);
    for (let i = 0; i < 10; i++) {
      store.saveSession({ name: String(i), points: [] });
    }
    const sessions = store.getSessions();
    expect(sessions.length).toBeLessThan(10);
    expect(sessions.length).toBeGreaterThan(0);
    sessions.forEach((s, i) => {
      expect(s.name).toBe(String(9 - i));
    });
    const persisted = storage.getItem("sightline_mouse_sessions_ledger");
    expect(persisted).not.toBeNull();
    expect((persisted as string).length).toBeLessThanOrEqual(400);
    expect(JSON.parse(persisted as string).length).toBe(sessions.length);
  });

  it("starts empty when storage contains corrupt JSON", () => {
    const storage: SessionStorageLike = {
      getItem: () => "{not valid json",
      setItem: () => {},
    };
    const store = new MouseTrajectoryStore(storage);
    expect(store.getSessions()).toEqual([]);
  });
});
