import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { AssistBridgeService } from "./service";
import type { FrameOutcome } from "./frames";

const LIVE_FRAME: FrameOutcome = {
  live: true,
  frame: { jpeg: "data:image/jpeg;base64,AAA", w: 2, h: 2, ts: 1 },
};
const STANDBY_FRAME: FrameOutcome = { live: false, message: "no frame" };

const services: AssistBridgeService[] = [];

/** Builds and starts an AssistBridgeService on 127.0.0.1 port 0 with the given token/intervalMs/readFrame. */
async function startBridge(opts: { token?: string; intervalMs?: number; readFrame?: () => Promise<FrameOutcome> }) {
  const service = new AssistBridgeService(
    { host: "127.0.0.1", port: 0, token: opts.token ?? "", intervalMs: opts.intervalMs ?? 500 },
    {
      readFrame: opts.readFrame ?? (async () => LIVE_FRAME),
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

describe("endpointAuth", () => {
  it("rejects HTTP requests without a bearer token", async () => {
    const { base } = await startBridge({ token: "secret" });
    const res = await fetch(`${base}/bridge/frame`);
    expect(res.status).toBe(401);
  });

  it("rejects HTTP requests with the wrong bearer token", async () => {
    const { base } = await startBridge({ token: "secret" });
    const res = await fetch(`${base}/bridge/frame`, { headers: { Authorization: "Bearer wrong" } });
    expect(res.status).toBe(401);
  });

  it("accepts HTTP requests with the correct bearer token", async () => {
    const { base } = await startBridge({ token: "secret" });
    const res = await fetch(`${base}/bridge/frame`, { headers: { Authorization: "Bearer secret" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.frame).toBeDefined();
  });

  it("rejects a WS upgrade without a token", async () => {
    const { service } = await startBridge({ token: "secret" });
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.on("unexpected-response", (_req, res) => {
          expect(res.statusCode).toBe(401);
          resolve();
        });
        ws.on("error", () => resolve());
        ws.on("open", () => reject(new Error("should not open")));
      });
    } finally {
      ws.terminate();
    }
  });

  it("opens a WS with a bearer Authorization header and sends hello with all commands", async () => {
    const { service } = await startBridge({ token: "secret" });
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`, { headers: { Authorization: "Bearer secret" } });
    try {
      const hello = await firstMessage(ws);
      expect(hello.type).toBe("hello");
      expect(hello.payload.commands).toEqual(
        expect.arrayContaining(["request_fresh_frame", "report_state", "run_script", "intercept_notice"]),
      );
    } finally {
      ws.terminate();
    }
  });

  it("opens a WS using the bearer.<token> subprotocol with no header", async () => {
    const { service } = await startBridge({ token: "secret" });
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`, ["bearer.secret"]);
    try {
      const hello = await firstMessage(ws);
      expect(hello.type).toBe("hello");
    } finally {
      ws.terminate();
    }
  });

  it("rejects a request with a browser Origin when no token is set", async () => {
    const { base } = await startBridge({ token: "" });
    const res = await fetch(`${base}/bridge/frame`, { headers: { Origin: "http://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("accepts a request without an Origin when no token is set", async () => {
    const { base } = await startBridge({ token: "" });
    const res = await fetch(`${base}/bridge/frame`);
    expect(res.status).toBe(200);
  });
});

function firstMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    ws.once("error", reject);
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("frameStreaming", () => {
  it("streams at least two frame envelopes while live", async () => {
    const { service } = await startBridge({ intervalMs: 250, readFrame: async () => LIVE_FRAME });
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`);
    try {
      const frames: any[] = [];
      await new Promise<void>((resolve, reject) => {
        ws.on("message", (data) => {
          const envelope = JSON.parse(data.toString());
          if (envelope.type === "frame") {
            frames.push(envelope);
            if (frames.length >= 2) resolve();
          }
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timed out waiting for frames")), 1500);
      });
      expect(frames.length).toBeGreaterThanOrEqual(2);
      for (const envelope of frames) {
        expect(typeof envelope.id).toBe("string");
        expect(typeof envelope.ts).toBe("number");
        expect(envelope.payload).toMatchObject({ jpeg: expect.any(String), w: expect.any(Number), h: expect.any(Number), ts: expect.any(Number) });
      }
    } finally {
      ws.terminate();
    }
  });

  it("sends exactly one frame_standby and no frame while in standby", async () => {
    const { service } = await startBridge({ intervalMs: 250, readFrame: async () => STANDBY_FRAME });
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`);
    try {
      const types: string[] = [];
      ws.on("message", (data) => types.push(JSON.parse(data.toString()).type));
      await waitMs(800);
      const standbyCount = types.filter((t) => t === "frame_standby").length;
      expect(standbyCount).toBe(1);
      expect(types).not.toContain("frame");
    } finally {
      ws.terminate();
    }
  });

  it("returns 503 standby from GET /bridge/frame when readFrame reports standby", async () => {
    const { base } = await startBridge({ readFrame: async () => STANDBY_FRAME });
    const res = await fetch(`${base}/bridge/frame`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("standby");
  });

  it("reports waiting before any client connects, then connected while one is open", async () => {
    const { service } = await startBridge({});
    expect(service.status().state).toBe("waiting");
    const ws = new WebSocket(`ws://127.0.0.1:${service.port}/bridge`);
    try {
      await firstMessage(ws);
      const status = service.status();
      expect(status.state).toBe("connected");
      expect(status.peer).not.toBeNull();
    } finally {
      ws.terminate();
    }
  });
});

describe("httpPollingFallback", () => {
  it("answers report_state over POST /bridge/command", async () => {
    const { base } = await startBridge({});
    const envelope = { type: "report_state", id: "req-1", ts: Date.now(), payload: {} };
    const res = await fetch(`${base}/bridge/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payload.ok).toBe(true);
    expect(body.payload.replyTo).toBe("req-1");
    expect(body.payload.result.bridge.killSwitch).toBe(false);
  });

  it("rejects an unknown command type over POST /bridge/command", async () => {
    const { base } = await startBridge({});
    const envelope = { type: "shell_exec", id: "req-2", ts: Date.now(), payload: {} };
    const res = await fetch(`${base}/bridge/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.payload.ok).toBe(false);
  });

  it("returns pushed events from GET /bridge/events since a sequence", async () => {
    const { base, service } = await startBridge({});
    service.emit("error", { message: "x" });
    const res = await fetch(`${base}/bridge/events?since=0`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.map((e: any) => e.type)).toContain("error");
    expect(typeof body.next).toBe("number");
  });
});
