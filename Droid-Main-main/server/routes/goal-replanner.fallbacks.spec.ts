import { describe, expect, it, vi } from "vitest";

vi.mock("../ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai-endpoint")>()),
  sendQwenChatRequest: vi.fn(async () => ({ success: false, error: "unreachable" })),
}));

import { handleGoalReplan } from "./goal-replanner";

describe("handleGoalReplan", () => {
  it("labels the rule-based re-plan as simulated with no fabricated confidence", async () => {
    delete process.env.GEMINI_API_KEY;
    const res: any = { json: vi.fn(), status: vi.fn(() => res) };
    await handleGoalReplan(
      { body: { currentSteps: [{ id: "s1", action: "click", x: 100, y: 100 }, { id: "s2", action: "type_text", x: 5, y: 5 }] } } as any,
      res,
    );
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ simulated: true, source: "heuristic" });
    expect(body.replan.confidence).toBeNull();
    expect(body.replan.summary).not.toMatch(/successfully/i);
    for (const step of body.replan.suggestedSteps) expect(step.confidence).toBeNull();
  });
});
