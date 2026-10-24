import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { centralLogHub } from "./log-hub";
import {
  AiUnavailableError,
  DEFAULT_LOCAL_OLLAMA_ENDPOINT,
  DEFAULT_OLLAMA_ENDPOINT,
  aiErrorStatus,
  buildVisionMessage,
  parseModelJson,
  resetAiConfiguration,
  resolveAiEndpointChain,
  sendQwenChatRequest,
  setConfiguredAiEndpoint,
  setConfiguredAiModel,
} from "./ai-endpoint";

beforeEach(() => {
  resetAiConfiguration();
  delete process.env.OLLAMA_ENDPOINT;
  delete process.env.OLLAMA_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ message: { content } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveAiEndpointChain", () => {
  it("defaults to quantumclaw only when nothing is configured", () => {
    expect(resolveAiEndpointChain()).toEqual([DEFAULT_OLLAMA_ENDPOINT]);
  });

  it("never puts the LAN preset in front of quantumclaw by default", () => {
    expect(resolveAiEndpointChain()).not.toContain(DEFAULT_LOCAL_OLLAMA_ENDPOINT);
  });

  it("tries a configured custom endpoint first, then quantumclaw", () => {
    setConfiguredAiEndpoint("http://10.0.0.6:11434");
    expect(resolveAiEndpointChain()).toEqual([
      "http://10.0.0.6:11434/api/chat",
      DEFAULT_OLLAMA_ENDPOINT,
    ]);
  });

  it("uses OLLAMA_ENDPOINT as the primary endpoint ahead of quantumclaw", () => {
    process.env.OLLAMA_ENDPOINT = "http://10.0.0.5:11434";
    expect(resolveAiEndpointChain()).toEqual([
      "http://10.0.0.5:11434/api/chat",
      DEFAULT_OLLAMA_ENDPOINT,
    ]);
  });

  it("prefers the runtime-configured endpoint over the env var", () => {
    process.env.OLLAMA_ENDPOINT = "http://10.0.0.5:11434";
    setConfiguredAiEndpoint("http://10.0.0.6:11434");
    expect(resolveAiEndpointChain()[0]).toBe("http://10.0.0.6:11434/api/chat");
  });

  it("has a single entry when the primary endpoint is already quantumclaw", () => {
    setConfiguredAiEndpoint(DEFAULT_OLLAMA_ENDPOINT);
    expect(resolveAiEndpointChain()).toEqual([DEFAULT_OLLAMA_ENDPOINT]);
  });
});

describe("sendQwenChatRequest", () => {
  it("falls back to quantumclaw when a configured custom endpoint rejects with a connection failure", async () => {
    setConfiguredAiEndpoint("http://10.0.0.6:11434");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse("hello"));
    vi.stubGlobal("fetch", fetchMock);
    const addLogSpy = vi.spyOn(centralLogHub, "addLog");

    const result = await sendQwenChatRequest([
      { role: "user", content: "hi" },
    ]);

    expect(result.success).toBe(true);
    expect(result.endpoint).toBe(DEFAULT_OLLAMA_ENDPOINT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("http://10.0.0.6:11434/api/chat");
    expect(fetchMock.mock.calls[1][0]).toBe(DEFAULT_OLLAMA_ENDPOINT);
    expect(addLogSpy).toHaveBeenCalledWith(
      "Qwen Vision",
      "WARN",
      expect.stringContaining("falling back"),
      expect.anything(),
    );
  });

  it("falls back to quantumclaw when a configured custom endpoint times out", async () => {
    setConfiguredAiEndpoint("http://10.0.0.6:11434");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
      .mockResolvedValueOnce(jsonResponse("hello"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendQwenChatRequest([
      { role: "user", content: "hi" },
    ]);

    expect(result.success).toBe(true);
    expect(result.endpoint).toBe(DEFAULT_OLLAMA_ENDPOINT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fall back when a configured custom endpoint answers with an HTTP error", async () => {
    setConfiguredAiEndpoint("http://10.0.0.6:11434");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendQwenChatRequest([
      { role: "user", content: "hi" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it("reports failure with an error string when every endpoint fails", async () => {
    setConfiguredAiEndpoint("http://10.0.0.6:11434");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendQwenChatRequest([
      { role: "user", content: "hi" },
    ]);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it("calls only quantumclaw, once, with the default chain", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendQwenChatRequest([{ role: "user", content: "hi" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(DEFAULT_OLLAMA_ENDPOINT);
    expect(result.success).toBe(false);
  });

  it("builds the default request body with model, stream and a signal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await sendQwenChatRequest([{ role: "user", content: "hi" }]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("qwen3.5:2b");
    expect(body.stream).toBe(false);
    expect(body.format).toBeUndefined();
    expect(init.signal).toBeDefined();
  });

  it("sets format 'json' when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await sendQwenChatRequest([{ role: "user", content: "hi" }], {
      format: "json",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.format).toBe("json");
  });

  it("uses the runtime-configured model in the request body", async () => {
    setConfiguredAiModel("x:1");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await sendQwenChatRequest([{ role: "user", content: "hi" }]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("x:1");
  });
});

describe("buildVisionMessage", () => {
  it("strips the data URL prefix into the images array", () => {
    expect(buildVisionMessage("p", "data:image/png;base64,iVBOR")).toEqual({
      role: "user",
      content: "p",
      images: ["iVBOR"],
    });
  });

  it("passes raw base64 through unchanged", () => {
    expect(buildVisionMessage("p", "iVBOR")).toEqual({
      role: "user",
      content: "p",
      images: ["iVBOR"],
    });
  });

  it("is sent through sendQwenChatRequest with the images array intact", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await sendQwenChatRequest([
      buildVisionMessage("p", "data:image/png;base64,iVBOR"),
    ]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].images).toEqual(["iVBOR"]);
  });
});

describe("parseModelJson", () => {
  it("parses plain JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON fenced in a ```json block", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses JSON preceded by a <think> block", () => {
    expect(parseModelJson('<think>reasoning</think>{"a":1}')).toEqual({
      a: 1,
    });
  });

  it("parses JSON surrounded by prose", () => {
    expect(parseModelJson('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseModelJson("not json at all")).toThrow();
  });
});

describe("aiErrorStatus", () => {
  it("maps AiUnavailableError to 502", () => {
    expect(aiErrorStatus(new AiUnavailableError("AI endpoint unreachable: down"))).toBe(502);
  });

  it("maps any other error to 500", () => {
    expect(aiErrorStatus(new Error("boom"))).toBe(500);
    expect(aiErrorStatus("not an error")).toBe(500);
  });
});
