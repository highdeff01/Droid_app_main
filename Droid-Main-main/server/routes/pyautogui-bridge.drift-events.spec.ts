import { describe, expect, it, vi } from "vitest";

vi.mock("./mobile-stream", () => ({ queueMobileAction: vi.fn() }));

import { handleAutoRepositionAgent, handleGetDriftEvents } from "./pyautogui-bridge";

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

async function call(handler: any, body?: unknown) {
  const res = makeRes();
  await handler({ body } as any, res, () => {});
  return res;
}

describe("drift correction history", () => {
  it("starts empty with no seeded demo events", async () => {
    const res = await call(handleGetDriftEvents);
    expect(res.body).toEqual({ success: true, count: 0, events: [] });
  });

  it("lists only events that were actually recorded", async () => {
    await call(handleAutoRepositionAgent, {
      stepName: "Login",
      originalX: 100,
      originalY: 100,
      currentScreenTarget: { x: 106, y: 108 },
    });
    const res = await call(handleGetDriftEvents);
    expect(res.body.count).toBe(1);
    expect(res.body.events[0]).toMatchObject({ stepName: "Login", euclideanDriftPx: 10, confidenceScore: null });
    expect(JSON.stringify(res.body)).not.toMatch(/drift_evt_0|Search Input Bar|Primary Submit Button/);
  });
});
