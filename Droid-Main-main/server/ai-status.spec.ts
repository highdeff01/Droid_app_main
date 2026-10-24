import { afterEach, describe, expect, it, vi } from "vitest";

const { testAiEndpoint } = vi.hoisted(() => ({
  testAiEndpoint: vi.fn(),
}));

vi.mock("./ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-endpoint")>()),
  testAiEndpoint,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getAiStatus", () => {
  it("reports state 'unknown' before any ping", async () => {
    vi.resetModules();
    const { getAiStatus } = await import("./ai-status");

    const status = getAiStatus();

    expect(status.state).toBe("unknown");
    expect(status.latencyMs).toBeNull();
    expect(status.checkedAt).toBeNull();
  });
});

describe("recordAiPing", () => {
  it("records a successful ping as online with latency", async () => {
    vi.resetModules();
    const { recordAiPing } = await import("./ai-status");

    const status = recordAiPing({
      success: true,
      latencyMs: 42,
      endpoint: "https://quantumclaw.net/ollama/api/chat",
      model: "qwen3.5:2b",
      message: "Endpoint verified successfully (42ms)",
    });

    expect(status.state).toBe("online");
    expect(status.latencyMs).toBe(42);
    expect(status.message).toBe("Endpoint verified successfully (42ms)");
  });

  it("records a failed ping as offline with latencyMs null and the message kept", async () => {
    vi.resetModules();
    const { recordAiPing } = await import("./ai-status");

    const status = recordAiPing({
      success: false,
      latencyMs: 8000,
      endpoint: "https://quantumclaw.net/ollama/api/chat",
      model: "qwen3.5:2b",
      message: "Connection error: fetch failed",
    });

    expect(status.state).toBe("offline");
    expect(status.latencyMs).toBeNull();
    expect(status.message).toBe("Connection error: fetch failed");
  });
});

describe("pingAiEndpoint", () => {
  it("calls testAiEndpoint and getAiStatus then returns the recorded status", async () => {
    vi.resetModules();
    testAiEndpoint.mockResolvedValue({
      success: true,
      latencyMs: 10,
      endpoint: "https://quantumclaw.net/ollama/api/chat",
      model: "qwen3.5:2b",
      message: "Endpoint verified successfully (10ms)",
    });
    const { pingAiEndpoint, getAiStatus } = await import("./ai-status");

    const result = await pingAiEndpoint();

    expect(testAiEndpoint).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("online");
    expect(getAiStatus()).toEqual(result);
  });
});
