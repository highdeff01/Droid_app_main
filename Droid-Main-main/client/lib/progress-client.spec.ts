import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgressEvent } from "@shared/progress";
import { currentProgress, mergeProgress, subscribeProgress, type ProgressState } from "./progress-client";

function event(seq: number, title = `event ${seq}`): ProgressEvent {
  return { seq, kind: "run", level: "info", title, detail: "", logs: [], at: seq };
}

const EMPTY: ProgressState = { events: [], cursor: 0, error: null };

describe("mergeProgress", () => {
  it("appends only events newer than the known cursor and advances it", () => {
    const first = mergeProgress(EMPTY, { events: [event(1), event(2)], cursor: 2 });
    const second = mergeProgress(first, { events: [event(2), event(3)], cursor: 3 });
    expect(second.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(second.cursor).toBe(3);
  });

  it("keeps only the newest events and clears a previous error", () => {
    const merged = mergeProgress({ ...EMPTY, error: "down" }, { events: [event(1), event(2), event(3)], cursor: 3 }, 2);
    expect(merged.events.map((e) => e.seq)).toEqual([2, 3]);
    expect(merged.error).toBeNull();
  });
});

describe("subscribeProgress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares one poller across subscribers and polls by cursor", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const since = Number(new URL(url, "http://x").searchParams.get("since"));
      const events = since === 0 ? [event(1, "Replay started")] : [];
      return new Response(JSON.stringify({ success: true, events, cursor: since === 0 ? 1 : since }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const seenA: ProgressState[] = [];
    const seenB: ProgressState[] = [];
    const stopA = subscribeProgress((s) => seenA.push(s));
    const stopB = subscribeProgress((s) => seenB.push(s));
    await vi.waitFor(() => expect(seenB.length).toBeGreaterThan(0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/progress?since=0");
    expect(seenA.at(-1)?.events[0].title).toBe("Replay started");
    expect(seenB.at(-1)).toBe(seenA.at(-1));
    stopA();
    stopB();
  });

  it("surfaces a failed poll as an error instead of hiding it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 })));
    const seen: ProgressState[] = [];
    const stop = subscribeProgress((s) => seen.push(s));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(currentProgress().error).toBe("Unauthorized");
    stop();
  });
});
