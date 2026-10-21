import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ai-perception-engine", () => ({
  qwenVisionEngine: { analyzeScreen: vi.fn() },
}));
vi.mock("../ai-planner-engine", () => ({
  aiPlannerEngine: { planAndFormulateAction: vi.fn() },
}));
vi.mock("../adaptive-retry-engine", () => ({
  adaptiveRetryEngine: {
    recalibrateElementCoordinates: vi.fn(),
    computeAdaptiveRetry: vi.fn(),
  },
}));
vi.mock("../ai-gemini-service", () => ({
  verifyStepAccuracy: vi.fn(),
  resolveStuckState: vi.fn(),
}));
vi.mock("../ai-monitor-store", () => ({
  aiMonitorStore: {
    setStatus: vi.fn(),
    record: vi.fn(),
    getBrowserContext: vi.fn(() => null),
  },
}));
vi.mock("./execute-task", () => ({
  executeDeviceTask: vi.fn(),
}));

import { handleDescribeScreen } from "./dual-ai-pipeline";
import { runActionGate, type GatePost } from "../../client/lib/action-gate";

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ message: { content } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const VALID_CONTENT = JSON.stringify({
  screenDescription: "Login",
  confidence: 0.8,
  elements: [
    {
      name: "OK",
      type: "button",
      boundingBox: { x: 10, y: 10, width: 50, height: 20 },
      confidence: 0.9,
    },
  ],
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleDescribeScreen", () => {
  it("posts a json-format request with the image stripped into the images array", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(VALID_CONTENT));
    vi.stubGlobal("fetch", fetchMock);
    const req: any = { body: { imageData: IMAGE_DATA_URL } };
    const res = makeRes();

    await handleDescribeScreen(req, res, (() => {}) as any);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.format).toBe("json");
    const userMessage = body.messages.find((m: any) => m.role === "user");
    expect(userMessage.images[0]).toBe("iVBORw0KGgo=");
  });

  it("returns success true with the report, elements and confidence from the model", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(VALID_CONTENT));
    vi.stubGlobal("fetch", fetchMock);
    const req: any = { body: { imageData: IMAGE_DATA_URL } };
    const res = makeRes();

    await handleDescribeScreen(req, res, (() => {}) as any);

    expect(res.body.success).toBe(true);
    expect(res.body.report.elements[0].boundingBox).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 20,
    });
    expect(res.body.elements[0].boundingBox).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 20,
    });
    expect(res.body.confidence).toBe(0.8);
  });

  it("returns 502 with success false when the model reply is not parseable JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse("garbage"));
    vi.stubGlobal("fetch", fetchMock);
    const req: any = { body: { imageData: IMAGE_DATA_URL } };
    const res = makeRes();

    await handleDescribeScreen(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when imageData is missing", async () => {
    const req: any = { body: {} };
    const res = makeRes();

    await handleDescribeScreen(req, res, (() => {}) as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns success false when fetch rejects for both endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const req: any = { body: { imageData: IMAGE_DATA_URL } };
    const res = makeRes();

    await handleDescribeScreen(req, res, (() => {}) as any);

    expect(res.body.success).toBe(false);
  });
});

describe("handleDescribeScreen via runActionGate", () => {
  async function describeScreenThenGate(target: {
    x: number;
    y: number;
    needsTarget: boolean;
  }) {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(VALID_CONTENT));
    vi.stubGlobal("fetch", fetchMock);
    const req: any = { body: { imageData: IMAGE_DATA_URL } };
    const res = makeRes();
    await handleDescribeScreen(req, res, (() => {}) as any);
    const describeScreenPayload = res.body;

    const post: GatePost = async (url) => {
      if (url === "/api/replay/capture") {
        return { success: true, frame: { image: IMAGE_DATA_URL } };
      }
      if (url === "/api/ai/describe-screen") {
        return describeScreenPayload;
      }
      throw new Error(`unexpected url ${url}`);
    };
    const controller = new AbortController();
    return runActionGate(
      { targetDevice: "device-1", target, signal: controller.signal },
      post,
    );
  }

  it("verifies the target when it falls inside the detected element's box", async () => {
    const result = await describeScreenThenGate({
      x: 30,
      y: 20,
      needsTarget: true,
    });
    expect(result.status).toBe("verified");
    if (result.status === "verified") {
      expect(result.element?.name).toBe("OK");
    }
  });

  it("blocks when the target point is far from every detected element", async () => {
    const result = await describeScreenThenGate({
      x: 500,
      y: 500,
      needsTarget: true,
    });
    expect(result.status).toBe("blocked");
  });
});
