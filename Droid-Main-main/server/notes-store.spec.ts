import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DurableStore } from "./durable-store";
import { NotesStore, keywords } from "./notes-store";

describe("NotesStore", () => {
  let store: DurableStore;
  let notes: NotesStore;

  beforeEach(() => {
    store = new DurableStore({ inMemory: true });
    notes = new NotesStore(store);
  });

  it("add() stores category, title, content, lowercases and dedupes tags, and stamps id/createdAt", () => {
    const note = notes.add({
      category: "observation",
      title: "Watching login",
      content: "User tried twice",
      tags: ["Login", "login", "Retry"],
    });
    expect(note.category).toBe("observation");
    expect(note.title).toBe("Watching login");
    expect(note.content).toBe("User tried twice");
    expect(note.tags).toEqual(["login", "retry"]);
    expect(note.id).toMatch(/note_/);
    expect(() => new Date(note.createdAt).toISOString()).not.toThrow();
  });

  it("add() rejects an empty title", () => {
    expect(() => notes.add({ category: "observation", title: "  " })).toThrow();
  });

  it("add() rejects a screenshot that is not a data:image/png|jpeg;base64 URL", () => {
    expect(() =>
      notes.add({ category: "observation", title: "Bad shot", screenshot: "http://example.com/x.png" }),
    ).toThrow();
  });

  it("recordEvent() stores an event note with the kind, tags, and screenshot", () => {
    const note = notes.recordEvent(
      "workflow_completed",
      "Login done",
      "All steps",
      "data:image/png;base64,AAAA",
      ["Login"],
    );
    expect(note.category).toBe("event");
    expect(note.event).toBe("workflow_completed");
    expect(note.tags).toEqual(["workflow_completed", "login"]);
    expect(note.screenshot).toBe("data:image/png;base64,AAAA");
  });

  describe("list()", () => {
    afterEach(() => vi.useRealTimers());

    it("returns notes newest first", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      notes.add({ category: "observation", title: "first" });
      vi.setSystemTime(new Date("2024-01-01T00:01:00.000Z"));
      notes.add({ category: "observation", title: "second" });
      const [newest, oldest] = notes.list();
      expect(newest.title).toBe("second");
      expect(oldest.title).toBe("first");
    });

    it("filters by tag", () => {
      notes.add({ category: "observation", title: "a", tags: ["login"] });
      notes.add({ category: "observation", title: "b", tags: ["other"] });
      const result = notes.list({ tag: "login" });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("a");
    });

    it("filters to only notes carrying a screenshot", () => {
      notes.add({ category: "observation", title: "no shot" });
      notes.add({ category: "observation", title: "has shot", screenshot: "data:image/png;base64,AAAA" });
      const result = notes.list({ withScreenshot: true });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("has shot");
    });
  });

  describe("searchScreenshots()", () => {
    it("returns the login-failure screenshot ahead of unrelated screenshot notes", () => {
      notes.recordEvent("error", "Login failed", "timeout", "data:image/png;base64,LOGIN");
      notes.recordEvent("workflow_completed", "Checkout done", "all good", "data:image/png;base64,CHECKOUT");
      const [top] = notes.searchScreenshots("show me the screenshot when the login failed");
      expect(top.screenshot).toBe("data:image/png;base64,LOGIN");
    });

    it("ignores notes without a screenshot", () => {
      notes.add({ category: "observation", title: "Login failed note, no screenshot" });
      expect(notes.searchScreenshots("login failed")).toHaveLength(0);
    });

    it("returns an empty array when the query has no usable keywords", () => {
      expect(notes.searchScreenshots("show me the screenshot")).toEqual([]);
    });
  });

  it("keywords() strips filler words and lowercases", () => {
    expect(keywords("Show me when the Login failed")).toEqual(["login", "failed"]);
  });

  it("a second NotesStore on the same DurableStore sees the same notes", () => {
    notes.add({ category: "observation", title: "shared" });
    const notes2 = new NotesStore(store);
    expect(notes2.list().map((n) => n.title)).toContain("shared");
  });

  it("remove() deletes a note and returns false for an unknown id", () => {
    const note = notes.add({ category: "observation", title: "to remove" });
    expect(notes.remove(note.id)).toBe(true);
    expect(notes.get(note.id)).toBeUndefined();
    expect(notes.remove("missing")).toBe(false);
  });
});
