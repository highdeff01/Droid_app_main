import { describe, expect, it, vi } from "vitest";

const sendQwenChatRequest = vi.hoisted(() => vi.fn());

vi.mock("../ai-endpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai-endpoint")>()),
  sendQwenChatRequest,
}));
vi.mock("../ai-monitor-store", () => ({ aiMonitorStore: { record: vi.fn() } }));

import { handleAiReviewSteps, handleApplySuggestionsWithQwen } from "./ai-workflow-review";

async function review(steps: unknown[]) {
  const res: any = { json: vi.fn() };
  await handleAiReviewSteps({ body: { steps } } as any, res, () => {});
  return res.json.mock.calls[0][0];
}

describe("handleAiReviewSteps", () => {
  it("labels the heuristic fallback as simulated with no score or confidence", async () => {
    sendQwenChatRequest.mockResolvedValue({ success: false, error: "unreachable" });
    const body = await review([{ id: "a", delayMs: 100 }]);
    expect(body).toMatchObject({ simulated: true, source: "heuristic", score: null });
    expect(body.suggestions[0].confidence).toBeNull();
    expect(body.suggestions[0].suggestion).toMatch(/Increase delayMs/);
  });

  it("passes a model review through as not simulated", async () => {
    sendQwenChatRequest.mockResolvedValue({
      success: true,
      content: JSON.stringify({ score: 70, suggestions: [{ stepIndex: 0, confidence: 0.4, suggestion: "ok", driftTolerancePx: 8 }] }),
    });
    const body = await review([{ id: "b", delayMs: 500 }]);
    expect(body).toMatchObject({ simulated: false, source: "model", score: 70 });
    expect(body.suggestions[0]).toMatchObject({ stepId: "b", confidence: 0.4 });
  });

  it("apply-suggestions is labelled as a heuristic, not a Qwen result", () => {
    const res: any = { json: vi.fn() };
    handleApplySuggestionsWithQwen({ body: { steps: [{ delayMs: 50 }] } } as any, res, () => {});
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ simulated: true, source: "heuristic" });
    expect(body.optimizedSteps[0].delayMs).toBe(300);
    expect(body.message).not.toMatch(/Qwen/);
  });
});
