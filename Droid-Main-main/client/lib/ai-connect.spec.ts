import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectAiEndpoint, connectStatusText } from "./ai-connect";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
};

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const ENDPOINT = "https://example.test/ollama/api/chat";

beforeEach(() => store.clear());

describe("connectAiEndpoint", () => {
  it("pings test-endpoint with endpoint+model, then persists both on success", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ success: true, latencyMs: 87 }))
      .mockResolvedValueOnce(json({ success: true }));
    const result = await connectAiEndpoint(ENDPOINT, "qwen2.5-vl:7b", fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toBe("/api/ai/test-endpoint");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ endpoint: ENDPOINT, model: "qwen2.5-vl:7b" });
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/ai/settings");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ modelUrl: ENDPOINT, model: "qwen2.5-vl:7b" });
    expect(store.get("ai_model_url")).toBe(ENDPOINT);
    expect(store.get("ai_model_name")).toBe("qwen2.5-vl:7b");
    expect(result.connected).toBe(true);
    expect(connectStatusText(result)).toBe("Connected (87ms)");
  });

  it("saves nothing and reports offline when the ping fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ success: false, message: "HTTP 502" }));
    const result = await connectAiEndpoint(ENDPOINT, "qwen3.5:2b", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
    expect(connectStatusText(result)).toBe("Offline: HTTP 502");
  });

  it("reports offline when the request itself throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const result = await connectAiEndpoint(ENDPOINT, "qwen3.5:2b", fetchImpl);
    expect(result.connected).toBe(false);
    expect(connectStatusText(result)).toBe("Offline: network down");
    expect(store.size).toBe(0);
  });
});
