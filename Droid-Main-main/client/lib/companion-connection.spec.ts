import { describe, expect, it, vi } from "vitest";
import {
  MAX_AUTO_RETRIES,
  connectCompanion,
  describeConnectionFailure,
  httpFailure,
  retryDelayMs,
} from "./companion-connection";

describe("companion-connection", () => {
  describe("connectCompanion", () => {
    it("connects with the session id and its history", async () => {
      const loadHistory = vi.fn().mockResolvedValue([{ id: "t1" }]);
      const result = await connectCompanion({ ensureSession: async () => "s9", loadHistory }, 0);
      expect(result).toEqual({ connection: { status: "connected", sessionId: "s9" }, history: [{ id: "t1" }] });
      expect(loadHistory).toHaveBeenCalledWith("s9");
    });

    it("reports a session-stage failure with the server's reason", async () => {
      const loadHistory = vi.fn();
      const result = await connectCompanion(
        { ensureSession: async () => Promise.reject(new Error("Authentication required")), loadHistory },
        2,
      );
      expect(result.connection).toMatchObject({ status: "error", stage: "session", attempt: 2 });
      expect(result.connection.status === "error" && result.connection.reason).toContain("Authentication required");
      expect(loadHistory).not.toHaveBeenCalled();
    });

    it("reports a history-stage failure after the session resolved", async () => {
      const result = await connectCompanion(
        { ensureSession: async () => "s1", loadHistory: async () => Promise.reject(new Error("boom")) },
        1,
      );
      expect(result.connection).toMatchObject({ status: "error", stage: "history" });
      expect(result.history).toEqual([]);
    });
  });

  describe("describeConnectionFailure", () => {
    it("names the stage and the cause", () => {
      expect(describeConnectionFailure("history", new Error("Companion request failed (HTTP 500)"))).toBe(
        "Chat history failed: Companion request failed (HTTP 500)",
      );
    });
    it("adds a hint when the server is unreachable", () => {
      expect(describeConnectionFailure("session", new TypeError("Failed to fetch"))).toContain("server unreachable");
    });
    it("adds a hint on an authentication rejection", () => {
      expect(describeConnectionFailure("session", "Authentication required")).toContain("API key required");
    });
  });

  describe("retryDelayMs", () => {
    it("backs off exponentially from one second", () => {
      expect([1, 2, 3].map((a) => retryDelayMs(a))).toEqual([1000, 2000, 4000]);
    });
    it("caps the delay at eight seconds", () => {
      expect(retryDelayMs(5, 10)).toBe(8000);
    });
    it("stops after the retry budget", () => {
      expect(retryDelayMs(MAX_AUTO_RETRIES + 1)).toBeNull();
      expect(retryDelayMs(0)).toBeNull();
    });
  });

  describe("httpFailure", () => {
    it("flags a non-JSON body with its status", () => {
      expect(httpFailure({ status: 200 }, null, "Companion request failed").message).toBe(
        "Companion request failed: API returned non-JSON (HTTP 200)",
      );
    });
    it("prefers the server's error text", () => {
      expect(httpFailure({ status: 502 }, { error: "AI model unavailable" }, "x").message).toBe("AI model unavailable");
    });
    it("falls back to the status when the body has no error", () => {
      expect(httpFailure({ status: 404 }, { success: false }, "Lookup failed").message).toBe("Lookup failed (HTTP 404)");
    });
  });
});
