import { describe, expect, it, vi } from "vitest";

import { ConversationStore, MAX_SESSION_MESSAGES } from "./ai-conversation";
import type { ChatFn } from "./ai-conversation";

function makeChat(result: Awaited<ReturnType<ChatFn>> | ((args: any) => Awaited<ReturnType<ChatFn>>)) {
  return vi.fn(async (messages, options) => {
    return typeof result === "function" ? (result as any)({ messages, options }) : result;
  });
}

describe("ConversationStore", () => {
  it("sends system, then the prior user/assistant pair, then the new message on the second turn", async () => {
    const chat = makeChat({ success: true, content: "second reply" });
    const store = new ConversationStore(chat);
    await store.send("s1", { role: "user", content: "first" }, { system: "sys" });
    chat.mockClear();

    await store.send("s1", { role: "user", content: "second" }, { system: "sys" });

    const [messages] = chat.mock.calls[0];
    expect(messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "first" },
      { role: "assistant", content: "second reply" },
      { role: "user", content: "second" },
    ]);
  });

  it("does not store images in history, only text", async () => {
    const chat = makeChat({ success: true, content: "reply" });
    const store = new ConversationStore(chat);

    await store.send("s1", { role: "user", content: "look", images: ["abc123"] });

    expect(store.history("s1")).toEqual([
      { role: "user", content: "look" },
      { role: "assistant", content: "reply" },
    ]);
  });

  it("does not store a failed turn", async () => {
    const chat = makeChat({ success: false, content: "", error: "down" });
    const store = new ConversationStore(chat);

    await store.send("s1", { role: "user", content: "hi" });

    expect(store.history("s1")).toEqual([]);
  });

  it("bounds stored history to MAX_SESSION_MESSAGES", async () => {
    const chat = makeChat({ success: true, content: "r" });
    const store = new ConversationStore(chat);

    for (let i = 0; i < MAX_SESSION_MESSAGES; i++) {
      await store.send("s1", { role: "user", content: `m${i}` });
    }

    expect(store.history("s1")).toHaveLength(MAX_SESSION_MESSAGES);
    expect(store.history("s1")[0]).toEqual({
      role: "user",
      content: `m${MAX_SESSION_MESSAGES / 2}`,
    });
  });

  it("keeps sessions isolated from one another", async () => {
    const chat = makeChat({ success: true, content: "r" });
    const store = new ConversationStore(chat);

    await store.send("s1", { role: "user", content: "a" });
    await store.send("s2", { role: "user", content: "b" });

    expect(store.history("s1")).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "r" },
    ]);
    expect(store.history("s2")).toEqual([
      { role: "user", content: "b" },
      { role: "assistant", content: "r" },
    ]);
  });

  it("empties a session's history on clear", async () => {
    const chat = makeChat({ success: true, content: "r" });
    const store = new ConversationStore(chat);
    await store.send("s1", { role: "user", content: "a" });

    store.clear("s1");

    expect(store.history("s1")).toEqual([]);
  });
});
