import { beforeEach, describe, expect, it, vi } from "vitest";

const compareScreensForMatch = vi.fn();
vi.mock("../ai-gemini-service", () => ({
  compareScreensForMatch: (...args: unknown[]) => compareScreensForMatch(...args),
}));

const dispatchActionToPython = vi.fn();
vi.mock("./dual-ai-pipeline", () => ({
  dispatchActionToPython: (...args: unknown[]) => dispatchActionToPython(...args),
}));

vi.mock("../log-hub", () => ({ centralLogHub: { addLog: vi.fn() } }));

import { handleAutoActorTrigger } from "./ai-automation-controller";

const CURRENT = "data:image/png;base64,aaaa";
const EXPECTED = "data:image/png;base64,bbbb";

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

describe("handleAutoActorTrigger", () => {
  beforeEach(() => {
    compareScreensForMatch.mockReset();
    dispatchActionToPython.mockReset();
  });

  it("returns 400 when either frame is missing", async () => {
    const res = makeRes();

    await handleAutoActorTrigger({ body: { currentScreen: CURRENT } } as any, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(compareScreensForMatch).not.toHaveBeenCalled();
  });

  it("returns 502 when the comparison is simulated (model unreachable)", async () => {
    compareScreensForMatch.mockResolvedValueOnce({
      matched: false,
      similarityScore: 0,
      reason: "unreachable",
      identifiedElements: [],
      simulated: true,
      simulationReason: "AI model unavailable: ECONNREFUSED",
    });
    const res = makeRes();

    await handleAutoActorTrigger(
      { body: { currentScreen: CURRENT, expectedScreen: EXPECTED } } as any,
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(dispatchActionToPython).not.toHaveBeenCalled();
  });

  it("dispatches to the model's own coordinates when matched and auto-act is enabled", async () => {
    compareScreensForMatch.mockResolvedValueOnce({
      matched: true,
      similarityScore: 0.9,
      reason: "matched",
      identifiedElements: [],
      suggestedNextStep: { action: "click", x: 123, y: 456, name: "Click target" },
      simulated: false,
    });
    dispatchActionToPython.mockResolvedValueOnce({ ok: true });
    const res = makeRes();

    await handleAutoActorTrigger(
      { body: { currentScreen: CURRENT, expectedScreen: EXPECTED, autoActEnabled: true } } as any,
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.autoActExecuted).toBe(true);
    const [dispatched] = dispatchActionToPython.mock.calls[0];
    expect(dispatched).toMatchObject({ x: 123, y: 456 });
    expect(dispatched).not.toMatchObject({ x: 960, y: 540 });
  });

  it("returns 422 and does not dispatch when matched but the model gave no coordinates", async () => {
    compareScreensForMatch.mockResolvedValueOnce({
      matched: true,
      similarityScore: 0.9,
      reason: "matched",
      identifiedElements: [],
      simulated: false,
    });
    const res = makeRes();

    await handleAutoActorTrigger(
      { body: { currentScreen: CURRENT, expectedScreen: EXPECTED, autoActEnabled: true } } as any,
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(dispatchActionToPython).not.toHaveBeenCalled();
  });
});
