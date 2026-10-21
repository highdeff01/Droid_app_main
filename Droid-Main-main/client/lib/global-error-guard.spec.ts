import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyRejection,
  handleUnhandledRejection,
  handleWindowError,
  installJsonGuard,
  parseResponseBody,
} from "./global-error-guard";

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

afterEach(() => vi.restoreAllMocks());

describe("parseResponseBody", () => {
  it("parses JSON", () => {
    expect(parseResponseBody('{"success":true,"n":1}', 200, true)).toEqual({ success: true, n: 1 });
  });

  it("maps an empty body to the HTTP outcome", () => {
    expect(parseResponseBody("", 500, false)).toEqual({ success: false, status: 500 });
  });

  it("turns an HTML fallback into a logged failure", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = parseResponseBody("<!DOCTYPE html><html></html>", 404, false) as any;
    expect(result).toMatchObject({ success: false, status: 404, error: "Non-JSON response (HTTP 404)" });
    expect(error).toHaveBeenCalled();
  });

  it("keeps a short plain-text error message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(parseResponseBody("Too many requests", 429, false)).toMatchObject({ error: "Too many requests" });
  });
});

describe("installJsonGuard", () => {
  it("rethrows body read failures instead of returning a fake object", async () => {
    const proto: any = { json: async () => ({}), text: async () => "" };
    installJsonGuard(proto);
    const response = { ...proto, status: 200, ok: true, text: async () => { throw new TypeError("body used"); } };
    await expect(proto.json.call(response)).rejects.toThrow("body used");
  });
});

describe("unhandled rejections", () => {
  it("classifies cancellations, stale chunks and real errors", () => {
    expect(classifyRejection(abortError())).toBe("ignore");
    expect(classifyRejection(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe("reload");
    expect(classifyRejection(new Error("boom"))).toBe("report");
  });

  it("reports real errors without preventing the default handler", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const event = { reason: new Error("boom"), preventDefault: vi.fn() };
    const surface = vi.fn();
    handleUnhandledRejection(event, surface);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(surface).toHaveBeenCalledWith("Unexpected error: boom");
  });

  it("guards the stale-chunk blank screen with a reload prompt", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const event = { reason: new Error("Importing a module script failed."), preventDefault: vi.fn() };
    const surface = vi.fn();
    handleUnhandledRejection(event, surface);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(surface).toHaveBeenCalledWith(expect.any(String), { reload: true });
  });

  it("silences only intentional aborts", () => {
    const event = { reason: abortError(), preventDefault: vi.fn() };
    const surface = vi.fn();
    handleUnhandledRejection(event, surface);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(surface).not.toHaveBeenCalled();
  });

  it("logs and surfaces window errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const surface = vi.fn();
    handleWindowError({ error: new Error("render failed") }, surface);
    expect(error).toHaveBeenCalled();
    expect(surface).toHaveBeenCalledWith("Unexpected error: render failed");
  });
});
