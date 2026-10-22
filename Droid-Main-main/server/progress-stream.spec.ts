import { describe, expect, it, vi } from "vitest";
import { ProgressStream, safeScreenshot } from "./progress-stream";

describe("ProgressStream", () => {
  it("cursor polling: since() returns only events after the cursor, with increasing seq", () => {
    const stream = new ProgressStream();
    stream.publish({ kind: "run", title: "a", detail: "a" });
    stream.publish({ kind: "run", title: "b", detail: "b" });
    stream.publish({ kind: "run", title: "c", detail: "c" });

    const page = stream.since(0);
    expect(page.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(page.cursor).toBe(3);

    const afterTwo = stream.since(2);
    expect(afterTwo.events.map((e) => e.title)).toEqual(["c"]);

    expect(stream.since(page.cursor).events).toEqual([]);
  });

  it("keeps only the newest events once the limit is exceeded", () => {
    const stream = new ProgressStream(5);
    for (let i = 0; i < 8; i++) stream.publish({ kind: "run", title: `${i}`, detail: `${i}` });
    const page = stream.since(0, 100);
    expect(page.events).toHaveLength(5);
    expect(page.events.map((e) => e.title)).toEqual(["3", "4", "5", "6", "7"]);
  });

  it("safeScreenshot strips an unsafe URL and keeps a PNG data URL", () => {
    expect(safeScreenshot("javascript:alert(1)")).toBeUndefined();
    expect(safeScreenshot("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
  });

  it("publish() applies the same screenshot rule through safeScreenshot", () => {
    const stream = new ProgressStream();
    const unsafe = stream.publish({ kind: "run", title: "a", detail: "a", screenshot: "javascript:alert(1)" });
    expect(unsafe.screenshot).toBeUndefined();
    const safe = stream.publish({ kind: "run", title: "b", detail: "b", screenshot: "data:image/png;base64,AAA" });
    expect(safe.screenshot).toBe("data:image/png;base64,AAA");
  });

  it("drops non-string logs and keeps at most 20", () => {
    const stream = new ProgressStream();
    const logs = [...Array.from({ length: 25 }, (_, i) => `line${i}`), 42, null];
    const event = stream.publish({ kind: "run", title: "a", detail: "a", logs: logs as unknown as string[] });
    expect(event.logs).toHaveLength(20);
    expect(event.logs.every((line) => typeof line === "string")).toBe(true);
  });

  it("subscribe() receives events until unsubscribed, and a throwing subscriber does not stop others", () => {
    const stream = new ProgressStream();
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    stream.subscribe(bad);
    const unsubscribe = stream.subscribe(good);

    stream.publish({ kind: "run", title: "a", detail: "a" });
    expect(good).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);

    unsubscribe();
    stream.publish({ kind: "run", title: "b", detail: "b" });
    expect(good).toHaveBeenCalledTimes(1);
  });
});
