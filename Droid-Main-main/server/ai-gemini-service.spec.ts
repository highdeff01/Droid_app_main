import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatchActionToPython } = vi.hoisted(() => ({ dispatchActionToPython: vi.fn() }));

vi.mock("./routes/dual-ai-pipeline", () => ({ dispatchActionToPython }));

import { resolveStuckState } from "./ai-gemini-service";
import { handleStuckResolver } from "./routes/ai-automation-controller";

const POSITIONAL = new Set(["click", "double_click", "right_click", "type", "scroll", "drag", "move"]);

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

describe("stuck resolver without a screen capture", () => {
  beforeEach(() => {
    dispatchActionToPython.mockReset();
    dispatchActionToPython.mockResolvedValue({ success: true });
  });

  it("recommends no positional action when imageData is missing", async () => {
    const result = await resolveStuckState({ imageData: "" });

    expect(result.isStuck).toBe(true);
    for (const rec of result.recommendedActions) {
      expect(POSITIONAL.has(rec.action)).toBe(false);
      expect(rec.x).toBeUndefined();
      expect(rec.y).toBeUndefined();
    }
  });

  it("returns 502 and dispatches nothing when the resolution is simulated", async () => {
    const res = makeRes();
    await handleStuckResolver(
      { body: { autoExecuteFix: true, lastError: "timeout" } } as any,
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(dispatchActionToPython).not.toHaveBeenCalled();
  });
});
