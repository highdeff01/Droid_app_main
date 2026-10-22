import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** createApiRateLimiter's default ceiling, which createServer uses unchanged. */
const LIMIT = 1_000;
const original = { ...process.env };
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  // Production with a key: unauthenticated requests reach the limiter and then get a 401.
  process.env.NODE_ENV = "production";
  process.env.ASSISTANT_API_KEY = "rate-limit-test-key";
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

async function statusOf(path: string, init: RequestInit = {}): Promise<number> {
  const res = await fetch(`${baseUrl}${path}`, init);
  await res.arrayBuffer();
  return res.status;
}

describe("createServer /api rate limiter", () => {
  it("does not let whitelisted streaming/polling calls use up the budget", async () => {
    for (let i = 0; i < LIMIT + 5; i++) {
      expect(await statusOf("/api/health")).toBe(200);
    }
  });

  it("counts each request once: the first 429 comes after the full limit, not half of it", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LIMIT + 1; i++) {
      statuses.push(await statusOf("/api/logs"));
    }
    expect(statuses.slice(0, LIMIT).every((status) => status === 401)).toBe(true);
    expect(statuses[LIMIT]).toBe(429);
  });

  it("rejects a limited request before parsing its body", async () => {
    const status = await statusOf("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(status).toBe(429);
  });

  it("keeps whitelisted routes open once the client is limited", async () => {
    expect(await statusOf("/api/health")).toBe(200);
    expect(await statusOf("/api/ping")).toBe(200);
  });
});
