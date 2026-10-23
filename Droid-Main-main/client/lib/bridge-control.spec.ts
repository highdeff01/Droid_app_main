import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { BACKEND_UNREACHABLE_MESSAGE, setBackendStatus } from "./backend-status";
import {
  fetchBridgeHealth,
  parseBridgeHealthBody,
  runQuickReconnect,
  runTogglePause,
  syncBridgeCoordinates,
} from "./bridge-control";

const NON_JSON = "Bridge unreachable: API returned non-JSON (backend not running)";
const WARMUP_HTML = "<!doctype html><html><head><title>Starting Server</title></head><body></body></html>";

const html = () => new Response(WARMUP_HTML, { status: 200, headers: { "Content-Type": "text/html" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.clearAllMocks();
  setBackendStatus({ state: "unknown", aiStudio: false });
});

describe("runQuickReconnect", () => {
  it("never toasts success or crashes when reconnect and health return HTML 200", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => html());
    await expect(runQuickReconnect(fetchImpl as any)).resolves.toBe(false);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Bridge Reconnect Failed", { description: NON_JSON });
  });

  it("does not toast success when reconnect JSON reports failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ success: false, online: false, error: "python3 not found" }));
    expect(await runQuickReconnect(fetchImpl as any)).toBe(false);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Bridge Reconnect Failed", { description: "python3 not found" });
  });

  it("does not toast success when reconnect succeeds but the health check returns HTML", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ success: true, online: true })).mockResolvedValueOnce(html());
    expect(await runQuickReconnect(fetchImpl as any)).toBe(false);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Bridge Reconnect Failed", { description: NON_JSON });
  });

  it("toasts success only when reconnect and health both report online", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ success: true, online: true, message: "Bridge reconnected successfully." }))
      .mockResolvedValueOnce(json({ online: true, paused: false }));
    expect(await runQuickReconnect(fetchImpl as any)).toBe(true);
    expect(toastMock.success).toHaveBeenCalledWith("Python execution bridge reconnected successfully", expect.anything());
  });

  it("fails fast without fetching while the backend is unreachable", async () => {
    setBackendStatus({ state: "unreachable", aiStudio: true });
    const fetchImpl = vi.fn();
    expect(await runQuickReconnect(fetchImpl as any)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Bridge Reconnect Failed", { description: BACKEND_UNREACHABLE_MESSAGE });
  });
});

describe("fetchBridgeHealth / syncBridgeCoordinates", () => {
  it("reports HTML 200 health as a concise non-JSON error, never online", async () => {
    const result = await fetchBridgeHealth(vi.fn().mockResolvedValue(html()) as any);
    expect(result).toEqual({ ok: false, unreachable: true, error: NON_JSON });
  });

  it("treats HTML labelled application/json as non-JSON", async () => {
    const body = new Response(WARMUP_HTML, { status: 200, headers: { "Content-Type": "application/json" } });
    expect(await fetchBridgeHealth(vi.fn().mockResolvedValue(body) as any)).toEqual({ ok: false, unreachable: true, error: NON_JSON });
  });

  it("returns no coordinate reading for an HTML reply", async () => {
    expect(await syncBridgeCoordinates(vi.fn().mockResolvedValue(html()) as any)).toBeNull();
  });

  it("returns no coordinate reading when the JSON reply has no measured position", async () => {
    const reply = json({ success: false, bridgeReportedX: null, bridgeReportedY: null, spatialDriftPx: null });
    expect(await syncBridgeCoordinates(vi.fn().mockResolvedValue(reply) as any)).toBeNull();
  });

  it("reports a network failure as unreachable, never online", async () => {
    const result = await fetchBridgeHealth(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as any);
    expect(result).toEqual({ ok: false, unreachable: true, error: "Bridge unreachable: Failed to fetch" });
  });

  it.each([{}, { online: "true" }, { online: 1 }, { status: "ok" }, { success: true }])(
    "never reports online for a 200 JSON body without online: true (%j)",
    async (body) => {
      const result = await fetchBridgeHealth(vi.fn().mockResolvedValue(json(body)) as any);
      expect(result.ok && result.value?.online).toBe(false);
    },
  );

  it.each([null, [], "ok", 42, true])("fails without crashing on a non-object JSON body (%j)", async (body) => {
    const result = await fetchBridgeHealth(vi.fn().mockResolvedValue(json(body)) as any);
    expect(result).toEqual({ ok: false, error: "Bridge health reply was not a status object" });
  });
});

describe("parseBridgeHealthBody", () => {
  it("is online only for a literal online: true and keeps well-formed fields", () => {
    const result = parseBridgeHealthBody({
      online: true,
      paused: false,
      pythonVersion: "3.11.4",
      pyautoguiAvailable: true,
      screenResolution: { width: 1920, height: 1080 },
      activeProcesses: [{ name: "bridge", pid: 42, status: "running" }],
    });
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      online: true,
      pythonVersion: "3.11.4",
      screenResolution: { width: 1920, height: 1080 },
      activeProcesses: [{ name: "bridge", pid: 42, status: "running" }],
    });
  });

  it("drops malformed fields instead of crashing", () => {
    const result = parseBridgeHealthBody({
      online: true,
      pythonVersion: 3,
      screenResolution: "1920x1080",
      activeProcesses: [null, "x", { name: "ok", pid: 1, status: "up" }],
      latencyMs: "fast",
    });
    expect(result.value).toMatchObject({
      pythonVersion: undefined,
      screenResolution: undefined,
      activeProcesses: [{ name: "ok", pid: 1, status: "up" }],
      latencyMs: undefined,
    });
  });
});

describe("runTogglePause", () => {
  it("shows no Paused/Resumed toast and keeps state for an HTML 200 reply", async () => {
    expect(await runTogglePause(false, vi.fn().mockResolvedValue(html()) as any)).toBeNull();
    expect(toastMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(`Failed to toggle pause: ${NON_JSON}`);
  });

  it("surfaces a non-ok JSON reply", async () => {
    expect(await runTogglePause(false, vi.fn().mockResolvedValue(json({ error: "bridge busy" }, 500)) as any)).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith("Failed to toggle pause: bridge busy");
  });

  it("applies the confirmed paused state from JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ success: true, paused: true, message: "Paused" }));
    expect(await runTogglePause(false, fetchImpl as any)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("/api/pyautogui/pause", expect.anything());
    expect(toastMock).toHaveBeenCalledWith("Execution Bridge Paused", expect.objectContaining({ description: "Paused" }));
  });
});
