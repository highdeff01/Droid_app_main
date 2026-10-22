import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContextSourceList,
  loadContextSources,
  type FetchJson,
} from "./context-sources-panel";

function fakeGet(responses: Record<string, unknown | Error>): FetchJson {
  return async (url) => {
    const value = responses[url];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error(`unexpected ${url}`);
    return value;
  };
}

const render = async (get: FetchJson) =>
  renderToStaticMarkup(
    React.createElement(ContextSourceList, { items: await loadContextSources(get) }),
  );

describe("loadContextSources", () => {
  it("shows honest empty states when nothing is connected or saved", async () => {
    const items = await loadContextSources(
      fakeGet({
        "/api/assistant/sources": { success: true, sources: [{ id: "desktop", name: "Desktop", connectionState: "disconnected" }] },
        "/api/companion/notes": { success: true, notes: [] },
        "/api/goal-workflows/flows": { success: true, flows: [] },
      }),
    );

    expect(items.map((i) => i.detail)).toEqual([
      "No capture source connected",
      "No notes yet",
      "No saved goal flows yet",
    ]);
    expect(items.every((i) => !i.active)).toBe(true);
  });

  it("reports the real counts and connected source", async () => {
    const items = await loadContextSources(
      fakeGet({
        "/api/assistant/sources": { success: true, sources: [{ id: "android", name: "Pixel 7", connectionState: "connected" }] },
        "/api/companion/notes": { success: true, notes: [{ id: "n1" }] },
        "/api/goal-workflows/flows": { success: true, flows: [{ id: "f1" }, { id: "f2" }, { id: "f3" }, { id: "f4" }] },
      }),
    );

    expect(items.map((i) => i.detail)).toEqual([
      "Pixel 7 connected",
      "1 note",
      "4 saved goal flows",
    ]);
    expect(items.every((i) => i.active)).toBe(true);
  });

  it("labels a failed endpoint as unavailable with its reason", async () => {
    const items = await loadContextSources(
      fakeGet({
        "/api/assistant/sources": new Error("Unable to list sources"),
        "/api/companion/notes": new Error("Companion offline"),
        "/api/goal-workflows/flows": { success: true, flows: [] },
      }),
    );

    expect(items[0].detail).toBe("Unavailable: Unable to list sources");
    expect(items[1].detail).toBe("Unavailable: Companion offline");
    expect(items[0].active).toBe(false);
  });
});

describe("ContextSourceList", () => {
  it("never renders the old hardcoded counts or a live-preview check without a connected source", async () => {
    const html = await render(
      fakeGet({
        "/api/assistant/sources": { success: true, sources: [] },
        "/api/companion/notes": { success: true, notes: [] },
        "/api/goal-workflows/flows": { success: true, flows: [] },
      }),
    );

    expect(html).not.toContain("3 notes");
    expect(html).not.toContain("2 goals");
    expect(html).not.toContain("Live preview");
    expect(html).not.toContain('aria-label="Available"');
  });

  it("marks only active sources as available", async () => {
    const html = await render(
      fakeGet({
        "/api/assistant/sources": { success: true, sources: [] },
        "/api/companion/notes": { success: true, notes: [{ id: "n1" }, { id: "n2" }] },
        "/api/goal-workflows/flows": { success: true, flows: [] },
      }),
    );

    expect(html).toContain("2 notes");
    expect(html.match(/aria-label="Available"/g)).toHaveLength(1);
  });
});
