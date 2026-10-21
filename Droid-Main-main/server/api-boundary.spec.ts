import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const API_KEY = "boundary-test-key";
const original = { ...process.env };
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  // Production: loopback is not trusted, so the test client must authenticate like a remote one.
  process.env.NODE_ENV = "production";
  process.env.ASSISTANT_API_KEY = API_KEY;
  delete process.env.CORS_ORIGINS;
  const { createServer } = await import("./index");
  server = createServer().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.env = { ...original };
});

function call(method: string, path: string, init: { auth?: boolean; body?: unknown; headers?: Record<string, string> } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(init.auth ? { "X-API-Key": API_KEY } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("API authentication boundary", () => {
  it.each([
    ["GET", "/api/capture-screen"],
    ["GET", "/api/screen/capture"],
    ["GET", "/api/screen-capture"],
    ["POST", "/api/sync-real-frame"],
    ["POST", "/api/execute-task"],
    ["POST", "/api/pyautogui/bridge"],
    ["POST", "/api/pyautogui/execute"],
    ["GET", "/api/pyautogui/status"],
    ["GET", "/api/replay/runs"],
    ["GET", "/api/adb/devices"],
    ["POST", "/api/adb/connect"],
    ["POST", "/api/ai/describe-screen"],
    ["GET", "/api/ai/settings"],
    ["GET", "/api/logs"],
    ["GET", "/api/assistant/sessions"],
    ["GET", "/api/mobile-stream/frame"],
    ["GET", "/api/method-learning"],
  ])("rejects unauthenticated %s %s with 401", async (method, path) => {
    const res = await call(method, path, { body: method === "GET" ? undefined : {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("rejects a wrong API key", async () => {
    const res = await call("GET", "/api/logs", { headers: { "X-API-Key": "nope-nope-nope-nope" } });
    expect(res.status).toBe(401);
  });

  it.each([["/api/ping"], ["/api/health"], ["/api/demo"]])(
    "keeps public route %s open without credentials",
    async (path) => {
      const res = await call("GET", path);
      expect(res.status).toBe(200);
    },
  );

  it("lets an authenticated request through to the handler", async () => {
    const res = await call("GET", "/api/logs", { auth: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });

  it("accepts a bearer token", async () => {
    const res = await call("GET", "/api/logs", { headers: { Authorization: `Bearer ${API_KEY}` } });
    expect(res.status).toBe(200);
  });
});

describe("CORS fails closed", () => {
  it("sends no allow-origin header for a cross-origin request when the allowlist is empty", async () => {
    const res = await call("GET", "/api/health", { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("unified capture routes", () => {
  it("serve the same freshly synced HUD frame from every capture route", async () => {
    const imageData = `data:image/png;base64,${Date.now().toString(36)}`;
    const sync = await call("POST", "/api/sync-real-frame", { auth: true, body: { imageData } });
    expect(sync.status).toBe(200);

    for (const path of ["/api/capture-screen", "/api/screen/capture", "/api/screen-capture"]) {
      const res = await call("GET", path, { auth: true });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        success: true,
        status: "live",
        source: "live_hud_sync",
        imageData,
      });
    }
  });
});
