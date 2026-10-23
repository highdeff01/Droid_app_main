import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_UNREACHABLE_MESSAGE,
  assertBackendReachable,
  bannerText,
  getBackendStatus,
  probeBackend,
  setBackendStatus,
  startBackendProbe,
  summarizeNonJson,
} from "./backend-status";

const WARMUP_HTML =
  '<!doctype html><html><head><title>Starting Server</title></head><body><script>window.__aistudio_warmup_failed=false</script></body></html>';

const respond = (body: string, status = 200, contentType = "text/html") =>
  vi.fn().mockResolvedValue(new Response(body, { status, headers: { "Content-Type": contentType } }));

afterEach(() => {
  setBackendStatus({ state: "unknown", aiStudio: false });
  vi.useRealTimers();
});

describe("probeBackend", () => {
  it("treats a JSON health reply as reachable and shows no banner", async () => {
    const fetchImpl = respond('{"status":"ok"}', 200, "application/json");
    const status = await probeBackend(fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledWith("/api/health", expect.anything());
    expect(status.state).toBe("reachable");
    expect(bannerText(status)).toBeNull();
  });

  it("treats JSON served as text/plain as reachable (decided by parsing)", async () => {
    expect((await probeBackend(respond('{"status":"ok"}', 200, "text/plain") as any)).state).toBe("reachable");
  });

  it("treats a generic HTML page with HTTP 200 as unreachable without naming AI Studio", async () => {
    const status = await probeBackend(respond("<!DOCTYPE html><html><body>Not here</body></html>") as any);
    expect(status.state).toBe("unreachable");
    expect(status.aiStudio).toBe(false);
    expect(bannerText(status)).toBe(BACKEND_UNREACHABLE_MESSAGE);
  });

  it("names the AI Studio warmup page in the banner", async () => {
    const status = await probeBackend(respond(WARMUP_HTML, 200, "application/json") as any);
    expect(status.aiStudio).toBe(true);
    const text = bannerText(status)!;
    expect(text).toContain(
      "Backend API not reachable — this environment cannot run the automation server (no Python, no display, no device control). Run the app locally with npm run dev on port 3000.",
    );
    expect(text).toContain("AI Studio");
    expect(status.detail).not.toContain("<");
  });

  it("treats a network failure as unreachable", async () => {
    const status = await probeBackend(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as any);
    expect(status.state).toBe("unreachable");
    expect(status.aiStudio).toBe(false);
    expect(bannerText(status)).toBe(BACKEND_UNREACHABLE_MESSAGE);
  });
});

describe("startBackendProbe", () => {
  it("re-probes while unreachable and clears the condition once JSON comes back", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(WARMUP_HTML, { status: 200 }))
      .mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    const stop = startBackendProbe(fetchImpl as any, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(getBackendStatus().state).toBe("unreachable");
    expect(() => assertBackendReachable()).toThrow(BACKEND_UNREACHABLE_MESSAGE);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getBackendStatus().state).toBe("reachable");
    expect(() => assertBackendReachable()).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe("summarizeNonJson", () => {
  it("never returns HTML and keeps a short plain-text reason", () => {
    expect(summarizeNonJson("<!DOCTYPE html><html>...</html>", 200)).toBe("Non-JSON response (HTTP 200)");
    expect(summarizeNonJson("Bad Gateway", 502)).toBe("Bad Gateway");
  });
});
