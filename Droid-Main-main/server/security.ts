import type { NextFunction, Request, RequestHandler, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import net from "net";

function isLoopback(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const address = req.ip?.replace(/^::ffff:/, "");
  return address === "127.0.0.1" || address === "::1";
}

function configuredApiKey(): string | undefined {
  const key = process.env.ASSISTANT_API_KEY?.trim();
  return key || undefined;
}

function hasValidApiKey(req: Request, expected: string): boolean {
  const supplied =
    req.header("x-api-key") ??
    req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export const requireApiAccess: RequestHandler = (req, res, next) => {
  const reqPath = req.path || req.url || "";
  if (reqPath === "/ping" || reqPath === "/demo" || reqPath === "/health") return next();
  const expected = configuredApiKey();
  if (expected) {
    if (isLoopback(req) || hasValidApiKey(req, expected)) return next();
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  // In production outside local loopback, reject unconfigured access
  if (process.env.NODE_ENV === "production" && !isLoopback(req)) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  // Without configured API key, allow access for web studio interface
  return next();
};

export function createCorsMiddleware(): RequestHandler {
  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return cors({
      origin: (origin, callback) => {
        if (!origin || configuredOrigins.includes(origin))
          return callback(null, true);
        return callback(null, true);
      },
      credentials: true,
    });
  }

  return cors({
    origin: true,
    credentials: true,
  });
}

export function createApiRateLimiter(
  windowMs = 60_000,
  maxRequests = 100_000,
): RequestHandler {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    // Whitelist high-frequency streaming and polling routes
    const reqPath = req.path || req.url || "";
    if (
      reqPath.startsWith("/api/mobile-stream") ||
      reqPath.startsWith("/api/screen") ||
      reqPath.startsWith("/api/capture-screen") ||
      reqPath.startsWith("/api/sync-real-frame") ||
      reqPath.startsWith("/api/pyautogui") ||
      reqPath.startsWith("/api/assistant/live") ||
      reqPath.startsWith("/api/health") ||
      reqPath.startsWith("/api/ping")
    ) {
      return next();
    }

    const now = Date.now();
    const key = req.ip ?? "unknown";
    const current = requests.get(key);
    if (!current || current.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > maxRequests) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Content-Type", "application/json");
      return res
        .status(429)
        .json({ success: false, error: "Rate limit exceeded. Please retry shortly." });
    }
    return next();
  };
}

export function validateAdbEndpoint(ip: unknown, port: unknown): string {
  if (typeof ip !== "string" || net.isIP(ip) !== 4) {
    throw new Error("A valid IPv4 address is required");
  }
  const numericPort = Number(port);
  if (
    !Number.isInteger(numericPort) ||
    numericPort < 1 ||
    numericPort > 65535
  ) {
    throw new Error("A valid port is required");
  }
  return `${ip}:${numericPort}`;
}

export function redactSensitive(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) =>
      /password|token|secret|api[-_]?key|authorization|code/i.test(key)
        ? [key, "[REDACTED]"]
        : [key, redactSensitive(child)],
    ),
  );
}
