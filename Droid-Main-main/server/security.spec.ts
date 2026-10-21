import type { AddressInfo } from "net";
import type { Server } from "http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  createApiRateLimiter,
  createCorsMiddleware,
  requireApiAccess,
  validateAdbEndpoint,
} from "./security";

describe("production security boundaries", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("requires the configured API key and accepts bearer tokens", async () => {
    process.env.NODE_ENV = "production";
    process.env.ASSISTANT_API_KEY = "test-secret";
    const unauthorized = response();
    requireApiAccess(request(), unauthorized.res, () => undefined);
    expect(unauthorized.status).toBe(401);
    const authorized = response();
    requireApiAccess(
      request({ authorization: "Bearer test-secret" }),
      authorized.res,
      () => undefined,
    );
    expect(authorized.status).toBe(200);
  });

  it("rejects unconfigured access outside local development", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ASSISTANT_API_KEY;
    const result = response();
    requireApiAccess(request(), result.res, () => undefined);
    expect(result.status).toBe(401);
  });

  it("lets the public health/demo paths through without a key", () => {
    process.env.NODE_ENV = "production";
    process.env.ASSISTANT_API_KEY = "test-secret";
    for (const path of ["/ping", "/health", "/demo"]) {
      let passed = false;
      const result = response();
      requireApiAccess({ ...(request() as object), path } as never, result.res, () => {
        passed = true;
      });
      expect(passed).toBe(true);
    }
  });

  it("validates ADB endpoints", () => {
    expect(validateAdbEndpoint("192.168.1.20", 5555)).toBe("192.168.1.20:5555");
    expect(() => validateAdbEndpoint("not-an-ip", 5555)).toThrow();
    expect(() => validateAdbEndpoint("192.168.1.20", 0)).toThrow();
  });

  it("enforces a bounded request rate", async () => {
    const limiter = createApiRateLimiter(60_000, 1);
    const first = response();
    limiter(request(), first.res, () => undefined);
    expect(first.status).toBe(200);
    const second = response();
    limiter(request(), second.res, () => undefined);
    expect(second.status).toBe(429);
  });

  it("defaults to a 1000 requests/minute safety ceiling", () => {
    const limiter = createApiRateLimiter();
    const statuses: number[] = [];
    for (let i = 0; i < 1001; i++) {
      const result = response();
      limiter({ ...(request() as object), originalUrl: "/api/goal-workflows" } as never, result.res, () => undefined);
      statuses.push(result.status);
    }
    expect(statuses.slice(0, 1000).every((s) => s === 200)).toBe(true);
    expect(statuses[1000]).toBe(429);
  });

  it("never limits the streaming/polling whitelist", () => {
    const limiter = createApiRateLimiter();
    for (const path of ["/api/mobile-stream/frame", "/api/screen", "/api/health"]) {
      let passed = 0;
      for (let i = 0; i < 1100; i++) {
        limiter({ ...(request() as object), originalUrl: path } as never, response().res, () => {
          passed += 1;
        });
      }
      expect(passed).toBe(1100);
    }
  });
});

describe("CORS allowlist", () => {
  const original = { ...process.env };
  let server: Server | undefined;

  afterEach(async () => {
    process.env = { ...original };
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function corsRequest(origin: string | undefined, method = "GET") {
    const app = express();
    app.use(createCorsMiddleware());
    app.get("/api/ping", (_req, res) => {
      res.json({ ok: true });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const headers: Record<string, string> = origin ? { Origin: origin } : {};
    if (method === "OPTIONS") headers["Access-Control-Request-Method"] = "GET";
    return fetch(`http://127.0.0.1:${port}/api/ping`, { method, headers });
  }

  it("echoes an exactly matching configured origin with credentials", async () => {
    process.env.CORS_ORIGINS = " https://a.com , https://b.com ";
    const res = await corsRequest("https://b.com");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://b.com");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it.each(["https://evil.com", "https://a.com.evil.com", "https://a.com/"])(
    "rejects non-matching origin %s when an allowlist is configured",
    async (origin) => {
      process.env.CORS_ORIGINS = "https://a.com";
      for (const method of ["GET", "OPTIONS"]) {
        const res = await corsRequest(origin, method);
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
      }
    },
  );

  it.each([undefined, "", ",, "])("denies every cross-origin request when CORS_ORIGINS is %j", async (value) => {
    if (value === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = value;
    const res = await corsRequest("https://evil.com");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("still serves same-origin requests that send no Origin header", async () => {
    delete process.env.CORS_ORIGINS;
    const res = await corsRequest(undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

function request(headers: Record<string, string> = {}) {
  return {
    ip: "127.0.0.1",
    headers,
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
  } as never;
}

function response() {
  const result = { status: 200 };
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json() {
      return res;
    },
    setHeader() {
      return res;
    },
  } as never;
  return {
    res,
    ...result,
    get status() {
      return result.status;
    },
  };
}
