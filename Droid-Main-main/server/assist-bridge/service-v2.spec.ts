import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { AssistBridgeService } from "./service";
import type { FrameOutcome } from "./frames";

const LIVE_FRAME: FrameOutcome = { live: true, frame: { jpeg: "data:image/jpeg;base64,AAA", w: 2, h: 2, ts: 1 } };

const services: AssistBridgeService[] = [];

async function startBridge() {
  const service = new AssistBridgeService(
    { host: "127.0.0.1", port: 0, token: "", intervalMs: 500 },
    {
      readFrame: async () => LIVE_FRAME,
      execute: async () => ({ success: true, executed: true }),
      appState: async () => ({ ai: { status: "idle" } }),
      logNotice: () => {},
    },
  );
  await service.start();
  services.push(service);
  return { service, base: `http://127.0.0.1:${service.port}` };
}

afterEach(async () => {
  while (services.length) await services.pop()?.stop();
});

function firstMessageOfType(ws: WebSocket, type: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ws.on("message", (data) => {
      const envelope = JSON.parse(data.toString());
      if (envelope.type === type) resolve(envelope);
    });
    ws.once("error", reject);
  });
}

describe("bridgeV2EndToEnd", () => {
  it("POST /bridge/command with a user_request envelope returns 200 ok and lands in requests.inbox()", async () => {
    const { base, service } = await startBridge();
    const envelope = { type: "user_request", id: "req-1", ts: Date.now(), payload: { text: "what should I do next?" } };
    const res = await fetch(`${base}/bridge/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payload.ok).toBe(true);
    const inbox = service.requests.inbox();
    expect(inbox.some((item) => item.text === "what should I do next?")).toBe(true);
  });

  it("the WS hello envelope advertises protocol 2 and 'analyze_page' among requests", async () => {
    const { service } = await startBridge();
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`);
    try {
      const hello = await firstMessageOfType(ws, "hello");
      expect(hello.payload.protocol).toBe(2);
      expect(hello.payload.requests).toContain("analyze_page");
    } finally {
      ws.terminate();
    }
  });

  it("service.request('analyze_page', {}) delivers a 'request' envelope to a connected WS client, resolved by its request_result", async () => {
    const { service } = await startBridge();
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`);
    try {
      await firstMessageOfType(ws, "hello");
      const requestEnvelope = firstMessageOfType(ws, "request");
      const resultPromise = service.request("analyze_page", {});
      const delivered = await requestEnvelope;
      expect(delivered.payload.kind).toBe("analyze_page");
      const requestId = delivered.payload.requestId;
      const replyEnvelope = {
        type: "request_result",
        id: "reply-1",
        ts: Date.now(),
        payload: { requestId, ok: true, result: { summary: "page analyzed" } },
      };
      ws.send(JSON.stringify(replyEnvelope));
      const record = await resultPromise;
      expect(record.status).toBe("ok");
      expect(record.result).toEqual({ summary: "page analyzed" });
    } finally {
      ws.terminate();
    }
  });
});
