import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RequestBroker } from "./requests";

describe("requestBroker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("throws for an unknown request kind", () => {
    const broker = new RequestBroker({ send: vi.fn(), isConnected: () => true });
    expect(() => broker.send("not_a_kind" as any, {})).toThrow('Unknown request kind "not_a_kind"');
  });

  it("throws for invalid params", () => {
    const broker = new RequestBroker({ send: vi.fn(), isConnected: () => true });
    expect(() => broker.send("verify_target", {})).toThrow(/Invalid verify_target params/);
  });

  it("throws 'not connected' when isConnected() is false", () => {
    const broker = new RequestBroker({ send: vi.fn(), isConnected: () => false });
    expect(() => broker.send("analyze_page", {})).toThrow("not connected");
  });

  it("calls deps.send with requestId, kind and params", () => {
    const send = vi.fn();
    const broker = new RequestBroker({ send, isConnected: () => true });
    broker.send("analyze_page", { question: "what is this?" }).catch(() => {});
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent).toMatchObject({ kind: "analyze_page", params: { question: "what is this?" } });
    expect(typeof sent.requestId).toBe("string");
  });

  it("settle(ok:true) resolves with status 'ok' and the result", async () => {
    const send = vi.fn();
    const broker = new RequestBroker({ send, isConnected: () => true });
    const promise = broker.send("analyze_page", {});
    const requestId = send.mock.calls[0][0].requestId;
    broker.settle({ requestId, ok: true, result: { summary: "fine" } });
    const record = await promise;
    expect(record.status).toBe("ok");
    expect(record.result).toEqual({ summary: "fine" });
  });

  it("settle(ok:false) resolves with status 'failed' and the error", async () => {
    const send = vi.fn();
    const broker = new RequestBroker({ send, isConnected: () => true });
    const promise = broker.send("analyze_page", {});
    const requestId = send.mock.calls[0][0].requestId;
    broker.settle({ requestId, ok: false, error: "no vision" });
    const record = await promise;
    expect(record.status).toBe("failed");
    expect(record.error).toBe("no vision");
  });

  it("resolves 'failed' with 'Timed out' after timeoutMs when never settled", async () => {
    const send = vi.fn();
    const broker = new RequestBroker({ send, isConnected: () => true, timeoutMs: 1000 });
    const promise = broker.send("analyze_page", {});
    await vi.advanceTimersByTimeAsync(1000);
    const record = await promise;
    expect(record.status).toBe("failed");
    expect(record.error).toContain("Timed out");
  });

  it("throws when settling an unknown request id", () => {
    const broker = new RequestBroker({ send: vi.fn(), isConnected: () => true });
    expect(() => broker.settle({ requestId: "ghost", ok: true })).toThrow('No pending request "ghost"');
  });

  it("receiveUserRequest adds to inbox() newest first, defaulting source to 'droid-new'", () => {
    const broker = new RequestBroker({ send: vi.fn(), isConnected: () => true });
    broker.receiveUserRequest({ text: "first" });
    broker.receiveUserRequest({ text: "second", source: "user" });
    const inbox = broker.inbox();
    expect(inbox[0]).toMatchObject({ text: "second", source: "user" });
    expect(inbox[1]).toMatchObject({ text: "first", source: "droid-new" });
  });
});
