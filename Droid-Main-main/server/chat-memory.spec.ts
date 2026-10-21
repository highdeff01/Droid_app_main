import { describe, expect, it, vi } from "vitest";
import { DurableStore } from "./durable-store";
import { ChatMemory, composeChatMessages, parseCompanionReply } from "./chat-memory";
import { CompanionService, type ChatSender } from "./companion-service";
import type { CompanionNote } from "@shared/companion";

describe("ChatMemory", () => {
  it("appends and returns history per sessionId, isolating other sessions", () => {
    const store = new DurableStore({ inMemory: true });
    const memory = new ChatMemory(store);
    memory.append("s1", "user", "hi");
    memory.append("s2", "user", "hello from s2");
    const s1History = memory.history("s1");
    expect(s1History).toHaveLength(1);
    expect(s1History[0].content).toBe("hi");
  });

  it("history(limit) returns only the last N turns, in order", () => {
    const store = new DurableStore({ inMemory: true });
    const memory = new ChatMemory(store);
    memory.append("s1", "user", "one");
    memory.append("s1", "assistant", "two");
    memory.append("s1", "user", "three");
    const result = memory.history("s1", 2);
    expect(result.map((t) => t.content)).toEqual(["two", "three"]);
  });

  it("a second ChatMemory on the same store sees previously appended turns", () => {
    const store = new DurableStore({ inMemory: true });
    const memory = new ChatMemory(store);
    memory.append("s1", "user", "persisted");
    const memory2 = new ChatMemory(store);
    expect(memory2.history("s1").map((t) => t.content)).toContain("persisted");
  });
});

function note(overrides: Partial<CompanionNote>): CompanionNote {
  return {
    id: "note_1",
    category: "observation",
    title: "note",
    content: "",
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("composeChatMessages", () => {
  it("builds a system message with current state, memory, saved workflows and event ids", () => {
    const eventNote = note({
      id: "evt1",
      category: "event",
      event: "error",
      title: "Login failed",
      tags: ["error"],
      screenshot: "data:image/png;base64,EVT1",
    });
    const result = composeChatMessages({
      request: {
        sessionId: "s",
        message: "what happened with login?",
        currentTab: "screen",
        screenSummary: "Login page",
        screenshot: "data:image/png;base64,CURR",
        workflowHistory: [{ name: "Login flow", status: "failed", error: "Target not found" }],
      },
      history: [
        { id: "t1", sessionId: "s", role: "user", content: "hi", createdAt: new Date().toISOString() },
        { id: "t2", sessionId: "s", role: "assistant", content: "hey", createdAt: new Date().toISOString() },
      ],
      notes: [note({ id: "n1", title: "User wants daily login" })],
      screenshots: [eventNote],
      savedWorkflows: [{ id: "wf1", name: "Login" }],
    });

    const system = result[0];
    expect(system.role).toBe("system");
    expect(system.content).toContain("CURRENT TAB: screen");
    expect(system.content).toContain("Login page");
    expect(system.content).toContain("User wants daily login");
    expect(system.content).toContain("Login flow: failed");
    expect(system.content).toContain("Target not found");
    expect(system.content).toContain("wf1: Login");
    expect(system.content).toContain(eventNote.id);
  });

  it("places history turns in order, then the new user message with event and current screenshots as images", () => {
    const eventNote = note({
      id: "evt1",
      category: "event",
      title: "Login failed",
      screenshot: "data:image/png;base64,EVT1",
    });
    const result = composeChatMessages({
      request: {
        sessionId: "s",
        message: "what happened with login?",
        screenshot: "data:image/png;base64,CURR",
      },
      history: [
        { id: "t1", sessionId: "s", role: "user", content: "hi", createdAt: new Date().toISOString() },
        { id: "t2", sessionId: "s", role: "assistant", content: "hey", createdAt: new Date().toISOString() },
      ],
      notes: [],
      screenshots: [eventNote],
      savedWorkflows: [],
    });

    expect(result[1]).toMatchObject({ role: "user", content: "hi" });
    expect(result[2]).toMatchObject({ role: "assistant", content: "hey" });
    const last = result[result.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("what happened with login?");
    expect(last.images).toEqual(["EVT1", "CURR"]);
  });

  it("omits images on the new user message when there are no screenshots at all", () => {
    const result = composeChatMessages({
      request: { sessionId: "s", message: "hello" },
      history: [],
      notes: [],
      screenshots: [],
      savedWorkflows: [],
    });
    const last = result[result.length - 1];
    expect(last).not.toHaveProperty("images");
  });
});

describe("parseCompanionReply", () => {
  it("parses JSON reply, keeping only recognized action kinds", () => {
    const result = parseCompanionReply(
      '{"reply":"Sure","actions":[{"kind":"navigate_tab","tab":"screen"},{"kind":"rm_rf"}]}',
    );
    expect(result.reply).toBe("Sure");
    expect(result.actions).toEqual([{ kind: "navigate_tab", tab: "screen" }]);
  });

  it("falls back to the raw text as the reply when it is not JSON", () => {
    const result = parseCompanionReply("just text");
    expect(result.reply).toBe("just text");
    expect(result.actions).toEqual([]);
  });

  it("strips a <think> block from a non-JSON reply", () => {
    const result = parseCompanionReply("<think>x</think>hello");
    expect(result.reply).toBe("hello");
  });
});

describe("CompanionService.converse", () => {
  function buildService() {
    const chat = vi.fn<ChatSender>(async () => ({
      success: true,
      content: '{"reply":"I remember","actions":[]}',
    }));
    const service = new CompanionService({
      storage: { inMemory: true },
      chat,
      listWorkflows: () => [{ id: "wf1", name: "Login" }],
      proposer: vi.fn(),
    });
    return { service, chat };
  }

  it("answers with the memory-backed reply and the matching event screenshot", async () => {
    const { service, chat } = buildService();
    service.notes.recordEvent("error", "Login failed", "x", "data:image/png;base64,ERR");

    const response = await service.converse({
      sessionId: "s1",
      message: "show me the screenshot when login failed",
    });

    expect(response.success).toBe(true);
    expect(response.reply?.content).toBe("I remember");
    expect(response.screenshots?.some((s) => s.screenshot === "data:image/png;base64,ERR")).toBe(true);
    const lastMessage = chat.mock.calls[0][0].at(-1);
    expect(lastMessage.images).toContain("ERR");
  });

  it("persists the user then assistant turn in chat memory", async () => {
    const { service } = buildService();
    service.notes.recordEvent("error", "Login failed", "x", "data:image/png;base64,ERR");
    await service.converse({ sessionId: "s1", message: "show me the screenshot when login failed" });
    const history = service.chatMemory.history("s1");
    expect(history.map((t) => t.role)).toEqual(["user", "assistant"]);
  });

  it("passes the previous turns as history on a second converse call", async () => {
    const { service, chat } = buildService();
    service.notes.recordEvent("error", "Login failed", "x", "data:image/png;base64,ERR");
    await service.converse({ sessionId: "s1", message: "show me the screenshot when login failed" });
    await service.converse({ sessionId: "s1", message: "anything else?" });
    const secondCallMessages = chat.mock.calls[1][0];
    expect(secondCallMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "show me the screenshot when login failed" }),
        expect.objectContaining({ role: "assistant", content: "I remember" }),
      ]),
    );
  });

  it("returns failure and stores no turns when the chat backend fails", async () => {
    const chat = vi.fn<ChatSender>(async () => ({ success: false, content: "", error: "down" }));
    const service = new CompanionService({
      storage: { inMemory: true },
      chat,
      listWorkflows: () => [],
      proposer: vi.fn(),
    });
    const response = await service.converse({ sessionId: "s1", message: "hi" });
    expect(response.success).toBe(false);
    expect(response.error).toBe("down");
    expect(service.chatMemory.history("s1")).toHaveLength(0);
  });
});
