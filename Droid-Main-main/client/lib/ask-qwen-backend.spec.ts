import { afterEach, describe, expect, it, vi } from "vitest";
import { askQwen, postHudJson } from "./hud-actions";
import { postGateJson } from "./action-gate";
import { BACKEND_NOT_RUNNING_MESSAGE, BackendNotRunningError } from "./backend-status";
import { MAX_CAPTURE_RETRIES, runTurnLoop, type GoalLoopDeps, type TurnLoopOptions } from "./qwen-turn-loop";

const WARMUP_HTML = "<!doctype html><html><head><title>Starting Server</title></head><body>__aistudio_warmup_failed</body></html>";
const FRAME = "data:image/png;base64,AAAA";

const htmlFetch = () => vi.fn(async () => new Response(WARMUP_HTML, { status: 200, headers: { "Content-Type": "text/html" } }));

afterEach(() => vi.unstubAllGlobals());

describe("non-JSON API replies (static host, backend not running)", () => {
  it("Ask Qwen reports the actionable backend message, never the HTML", async () => {
    vi.stubGlobal("fetch", htmlFetch());
    const error = await askQwen(FRAME, "What is on screen?").catch((e) => e);
    expect(error).toBeInstanceOf(BackendNotRunningError);
    expect(error.message).toContain(BACKEND_NOT_RUNNING_MESSAGE);
    expect(error.message).toContain("/api/hud/qwen/ask");
    expect(error.message).not.toMatch(/<html|doctype|Starting Server/i);
  });

  it("postHudJson still reports a JSON failure with the server's error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Qwen is down" }), { status: 502 })));
    await expect(postHudJson("/api/hud/qwen/ask", {})).rejects.toThrow("Qwen is down");
  });

  it("the capture-forward post (postGateJson) reports the backend message for HTML", async () => {
    vi.stubGlobal("fetch", htmlFetch());
    const signal = new AbortController().signal;
    await expect(postGateJson("/api/replay/capture", {}, { signal })).rejects.toThrow(BACKEND_NOT_RUNNING_MESSAGE);
  });
});

function askOptions(events: string[]): TurnLoopOptions {
  return {
    device: { targetDevice: "desktop" },
    signal: new AbortController().signal,
    onEvent: (e) => events.push(e.message),
    approve: async () => false,
    entry: "answer",
    question: "What is on screen?",
  };
}

/** Deps whose capture step fails `captureFailures` times (with `failure`), then serves a frame. */
function askDeps(captureFailures: number, failure: () => Error) {
  const urls: string[] = [];
  let failuresLeft = captureFailures;
  const post: GoalLoopDeps["post"] = async (url) => {
    urls.push(url);
    if (url === "/api/replay/capture") {
      if (failuresLeft-- > 0) throw failure();
      return { success: true, frame: { image: FRAME, hash: "h" } };
    }
    if (url === "/api/ai/describe-screen") return { success: true, report: { screenDescription: "s", elements: [], confidence: 0.5 } };
    if (url === "/api/goal-workflows/ocr") return { success: true, lines: [] };
    if (url === "/api/hud/qwen/ask") return { success: true, answer: "The button is blue." };
    throw new Error(`unexpected ${url}`);
  };
  const deps: GoalLoopDeps = { post, get: async () => ({}), gate: vi.fn() as any, sleep: async () => {} };
  return { deps, urls, captures: () => urls.filter((u) => u === "/api/replay/capture").length };
}

describe("Ask Qwen turn: capture forward with bounded retry", () => {
  it("retries a transient capture failure and answers from the fresh frame", async () => {
    const events: string[] = [];
    const { deps, urls, captures } = askDeps(1, () => new Error("ECONNRESET"));
    const result = await runTurnLoop("q", askOptions(events), deps);
    expect(result).toEqual({ status: "answered", answer: "The button is blue." });
    expect(captures()).toBe(2);
    expect(urls.indexOf("/api/hud/qwen/ask")).toBeGreaterThan(urls.lastIndexOf("/api/replay/capture"));
    expect(events.some((m) => m.includes(`Capture attempt 1/${MAX_CAPTURE_RETRIES + 1} failed`))).toBe(true);
  });

  it("gives up after at most 2 retries and reports the real attempt count, with no answer", async () => {
    const { deps, urls, captures } = askDeps(99, () => new Error("No live frame"));
    const result = await runTurnLoop("q", askOptions([]), deps);
    expect(result.status).toBe("failed");
    expect(captures()).toBe(MAX_CAPTURE_RETRIES + 1);
    if (result.status === "failed") expect(result.reason).toBe("Screen capture failed after 3 attempt(s): No live frame");
    expect(urls).not.toContain("/api/hud/qwen/ask");
  });

  it("fails at once with the backend message when capture gets the static-host HTML", async () => {
    const { deps, urls, captures } = askDeps(99, () => new BackendNotRunningError("/api/replay/capture", 200));
    const result = await runTurnLoop("q", askOptions([]), deps);
    expect(result.status).toBe("failed");
    expect(captures()).toBe(1);
    if (result.status === "failed") expect(result.reason).toContain(BACKEND_NOT_RUNNING_MESSAGE);
    expect(urls).not.toContain("/api/hud/qwen/ask");
  });
});
