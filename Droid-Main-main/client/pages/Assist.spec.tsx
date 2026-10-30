import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Assist, { ASSIST_TAB_GROUPS } from "./Assist";
import { fromDraft } from "./AssistSettings";
import { buildStep } from "@/components/assist/action-panels";
import { askAi, assistBridgeApi, getRemoteSettings } from "@/lib/assist-bridge-api";

const jsonReply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonReply(status, body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof mockFetch>) => JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

afterEach(() => vi.unstubAllGlobals());

describe("Assist page", () => {
  it("renders every tab in its group, with the chat tab open", () => {
    const markup = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(Assist)),
    );
    for (const group of ASSIST_TAB_GROUPS) {
      expect(markup).toContain(`aria-label="${group.label}"`);
      for (const tab of group.tabs) expect(markup).toContain(tab.title);
    }
    expect(markup).toContain('aria-label="Message"');
    expect(markup).toContain("droid-new settings");
  });

  it("covers chat, swarm, workflow, coordinates, screenshot and verify tabs", () => {
    const values = ASSIST_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.value));
    expect(values).toEqual(expect.arrayContaining(["chat", "swarm", "workflow", "coordinates", "screenshot", "verify"]));
  });
});

describe("assist chat over the main app's own AI", () => {
  it("posts the question to /api/ai/help and returns the answer", async () => {
    const fetchMock = mockFetch(200, { success: true, answer: "Click Save", usedFrame: true });
    await expect(askAi("what now?", { sessionId: "assist-chat" })).resolves.toEqual({ answer: "Click Save", usedFrame: true });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/help");
    expect(sentBody(fetchMock)).toEqual({ question: "what now?", sessionId: "assist-chat" });
  });

  it("surfaces a 502 from an unreachable AI as an error, never an answer", async () => {
    mockFetch(502, { success: false, error: "Qwen HTTP 503: Service Unavailable" });
    await expect(askAi("hello")).rejects.toThrow("Qwen HTTP 503");
  });
});

describe("assist bridge client", () => {
  it("sends requests to droid-new as {kind, params}", async () => {
    const record = { requestId: "r1", kind: "verify_target", status: "ok", result: { visible: true } };
    const fetchMock = mockFetch(200, { success: true, request: record });
    await expect(assistBridgeApi.request("verify_target", { target: "Save" })).resolves.toEqual(record);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assist-bridge/requests");
    expect(sentBody(fetchMock)).toEqual({ kind: "verify_target", params: { target: "Save" } });
  });

  it("reports a request droid-new failed with its error", async () => {
    mockFetch(502, { success: false, request: { status: "failed" }, error: "Timed out waiting for droid-new" });
    await expect(getRemoteSettings()).rejects.toThrow("Timed out waiting for droid-new");
  });
});

describe("workflow and coordinate steps", () => {
  it("builds bounded script steps from form fields", () => {
    expect(buildStep("click", { x: "10", y: "20", value: "" })).toEqual({ op: "click", x: 10, y: 20 });
    expect(buildStep("type", { x: "", y: "", value: "hi" })).toEqual({ op: "type", text: "hi" });
    expect(buildStep("key", { x: "5", y: "6", value: "Enter" })).toEqual({ op: "key", key: "Enter", x: 5, y: 6 });
    expect(buildStep("wait", { x: "", y: "", value: "250" })).toEqual({ op: "wait", ms: 250 });
  });

  it("refuses a click without coordinates", () => {
    expect(() => buildStep("click", { x: "1", y: "", value: "" })).toThrow("x and y");
    expect(() => buildStep("click", { x: "1.5", y: "2", value: "" })).toThrow("whole number");
  });
});

describe("remote settings draft", () => {
  it("sends only filled fields, numbers as numbers, plus agent toggles", () => {
    const settings = fromDraft({ "bridge.port": "3010", "ai.model": "qwen3.5:2b", "monitor.mode": "" }, true, { watcher: false });
    expect(settings).toEqual({ bridge: { port: 3010, enabled: true }, ai: { model: "qwen3.5:2b" }, agents: { watcher: false } });
  });
});
