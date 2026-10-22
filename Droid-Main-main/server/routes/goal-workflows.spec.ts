import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ai-monitor-store", () => ({
  aiMonitorStore: {
    setStatus: vi.fn(),
    record: vi.fn(),
  },
}));

vi.mock("../ocr-provider", () => ({
  recognizeWithProviders: vi.fn(),
}));

vi.mock("../ai-endpoint", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai-endpoint")>();
  return { ...actual, sendQwenChatRequest: vi.fn() };
});

vi.mock("../best-flow-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../best-flow-store")>();
  return {
    ...actual,
    bestFlowRepository: new actual.BestFlowRepository({ inMemory: true }),
  };
});

import {
  handleProposeGoalPlan,
  handleAssessGoal,
  handleGoalOcr,
  handleSaveFlowRun,
  handleConfirmBestFlow,
} from "./goal-workflows";
import { sendQwenChatRequest } from "../ai-endpoint";
import { recognizeWithProviders } from "../ocr-provider";
import { BestFlowRepository } from "../best-flow-store";
import type { GoalStep, RunEvidence } from "@shared/goal-loop";

const sendQwenChatRequestMock = vi.mocked(sendQwenChatRequest);
const recognizeWithProvidersMock = vi.mocked(recognizeWithProviders);

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

const noopNext = (() => {}) as any;

const ELEMENT = {
  name: "Submit",
  textValue: "Submit",
  boundingBox: { x: 100, y: 200, width: 50, height: 20 },
  center: { x: 125, y: 210 },
  confidence: 0.9,
};

function makeObservation(elements = [ELEMENT]) {
  return {
    signature: "sig-1",
    description: "Form screen",
    elements,
    ocrText: [],
    confidence: 0.8,
    capturedAt: Date.now(),
  };
}

function qwenSuccess(content: unknown) {
  return { success: true, content: JSON.stringify(content) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleProposeGoalPlan", () => {
  it("returns 400 when goal is missing", async () => {
    const req: any = { body: { observation: makeObservation() } };
    const res = makeRes();

    await handleProposeGoalPlan(req, res, noopNext);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("re-grounds the first step to the element center when the model gives a labelled step at a moved point", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce(
      qwenSuccess({
        steps: [
          {
            name: "Click Submit",
            action: "click",
            x: 10,
            y: 10,
            targetLabel: "Submit",
            expectation: { kind: "element_present", label: "Submit" },
          },
        ],
      }),
    );
    const req: any = { body: { goal: "Submit the form", observation: makeObservation() } };
    const res = makeRes();

    await handleProposeGoalPlan(req, res, noopNext);

    expect(res.body.success).toBe(true);
    expect(res.body.proposal.steps[0].x).toBe(125);
    expect(res.body.proposal.steps[0].y).toBe(210);
  });

  it("puts mid-run user guidance into the planner prompt", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce(
      qwenSuccess({ steps: [{ name: "Click Submit", action: "click", x: 125, y: 210, targetLabel: "Submit" }] }),
    );
    const req: any = {
      body: { goal: "Submit the form", observation: makeObservation(), guidance: ["avoid the top bar", "slow down"] },
    };
    const res = makeRes();

    await handleProposeGoalPlan(req, res, noopNext);

    expect(res.body.success).toBe(true);
    const messages = sendQwenChatRequestMock.mock.calls[0][0] as Array<{ content: unknown }>;
    const prompt = JSON.stringify(messages[1].content);
    expect(prompt).toContain("USER GUIDANCE");
    expect(prompt).toContain("avoid the top bar");
    expect(prompt).toContain("slow down");
  });

  it("returns 422 when the first step targets no element", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce(
      qwenSuccess({
        steps: [
          {
            name: "Click somewhere",
            action: "click",
            x: 999,
            y: 999,
            expectation: { kind: "none" },
          },
        ],
      }),
    );
    const req: any = { body: { goal: "Submit the form", observation: makeObservation() } };
    const res = makeRes();

    await handleProposeGoalPlan(req, res, noopNext);

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("returns 502 with no fabricated plan when the model call fails", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce({
      success: false,
      content: "",
      error: "connection refused",
    });
    const req: any = { body: { goal: "Submit the form", observation: makeObservation() } };
    const res = makeRes();

    await handleProposeGoalPlan(req, res, noopNext);

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.proposal).toBeUndefined();
  });

  it("includes the reason in the message sent to the model and echoes the goal unchanged", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce(
      qwenSuccess({
        steps: [
          {
            name: "Click Submit",
            action: "click",
            x: 125,
            y: 210,
            targetLabel: "Submit",
            expectation: { kind: "element_present", label: "Submit" },
          },
        ],
      }),
    );
    const req: any = {
      body: {
        goal: "Original goal",
        observation: makeObservation(),
        reason: "Lost track of the Submit button",
      },
    };
    const res = makeRes();

    await handleProposeGoalPlan(req, res, noopNext);

    const [messages] = sendQwenChatRequestMock.mock.calls[0];
    const userMessage = messages[1] as { content: string };
    expect(userMessage.content).toContain("Lost track of the Submit button");
    expect(userMessage.content).toContain("off-track");
    expect(res.body.proposal.goal).toBe("Original goal");
    expect(res.body.proposal.reason).toBe("Lost track of the Submit button");
  });
});

describe("handleAssessGoal", () => {
  it("returns the assessment parsed from valid model JSON", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce(
      qwenSuccess({ complete: true, onTrack: true, reason: "Done", confidence: 0.95 }),
    );
    const req: any = { body: { goal: "Open settings", observation: makeObservation() } };
    const res = makeRes();

    await handleAssessGoal(req, res, noopNext);

    expect(res.body.success).toBe(true);
    expect(res.body.assessment).toEqual({
      complete: true,
      onTrack: true,
      reason: "Done",
      confidence: 0.95,
    });
  });

  it("returns 502 when the model omits complete/onTrack", async () => {
    sendQwenChatRequestMock.mockResolvedValueOnce(qwenSuccess({ foo: "bar" }));
    const req: any = { body: { goal: "Open settings", observation: makeObservation() } };
    const res = makeRes();

    await handleAssessGoal(req, res, noopNext);

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

describe("handleGoalOcr", () => {
  it("returns lines from recognizeWithProviders", async () => {
    recognizeWithProvidersMock.mockResolvedValueOnce({
      result: { provider: "tesseract", text: [{ text: "Hello" }, { text: "World" }] },
      errors: [],
    } as any);
    const req: any = { body: { imageData: "data:image/png;base64,abcd" } };
    const res = makeRes();

    await handleGoalOcr(req, res, noopNext);

    expect(res.body.success).toBe(true);
    expect(res.body.provider).toBe("tesseract");
    expect(res.body.lines).toEqual(["Hello", "World"]);
  });

  it("returns 502 when no result is returned", async () => {
    recognizeWithProvidersMock.mockResolvedValueOnce({
      result: null,
      errors: ["timeout"],
    } as any);
    const req: any = { body: { imageData: "data:image/png;base64,abcd" } };
    const res = makeRes();

    await handleGoalOcr(req, res, noopNext);

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

function makeStep(overrides: Partial<GoalStep> = {}): GoalStep {
  return {
    id: "step_1",
    name: "Click Submit",
    action: "click",
    x: 10,
    y: 10,
    delayMs: 500,
    expectation: { kind: "none" },
    ...overrides,
  } as GoalStep;
}

function makeEvidence(overrides: Partial<RunEvidence> = {}): RunEvidence {
  return {
    steps: [{ stepId: "step_1", passed: true, checks: [] }],
    goalAssessment: { complete: true, onTrack: true, reason: "Reached" },
    ...overrides,
  } as RunEvidence;
}

describe("BestFlowRepository", () => {
  describe("saveRun", () => {
    let repo: BestFlowRepository;

    beforeEach(() => {
      repo = new BestFlowRepository({ inMemory: true });
    });

    it("creates version 1 unconfirmed with no bestVersion", () => {
      const flow = repo.saveRun({
        name: "Flow",
        goal: "Goal",
        steps: [makeStep()],
        evidence: makeEvidence(),
      });

      expect(flow.versions).toHaveLength(1);
      expect(flow.versions[0].version).toBe(1);
      expect(flow.versions[0].confirmed).toBe(false);
      expect(flow.bestVersion).toBeUndefined();
    });

    it("appends version 2 when saving again with the same flowId", () => {
      const flow = repo.saveRun({
        name: "Flow",
        goal: "Goal",
        steps: [makeStep()],
        evidence: makeEvidence(),
      });

      const flow2 = repo.saveRun({
        flowId: flow.id,
        name: "Flow",
        goal: "Goal",
        steps: [makeStep()],
        evidence: makeEvidence(),
      });

      expect(flow2.versions).toHaveLength(2);
      expect(flow2.versions[1].version).toBe(2);
    });

    it("refuses a save for a different goal than the flow's original", () => {
      const flow = repo.saveRun({
        name: "Flow",
        goal: "Goal",
        steps: [makeStep()],
        evidence: makeEvidence(),
      });

      expect(() =>
        repo.saveRun({
          flowId: flow.id,
          name: "Flow",
          goal: "A different goal",
          steps: [makeStep()],
          evidence: makeEvidence(),
        }),
      ).toThrow();
    });

    it("refuses a save for an unknown flowId", () => {
      expect(() =>
        repo.saveRun({
          flowId: "nonexistent",
          name: "Flow",
          goal: "Goal",
          steps: [makeStep()],
          evidence: makeEvidence(),
        }),
      ).toThrow();
    });

    it("refuses evidence with a failed step", () => {
      expect(() =>
        repo.saveRun({
          name: "Flow",
          goal: "Goal",
          steps: [makeStep()],
          evidence: makeEvidence({ steps: [{ stepId: "step_1", passed: false, checks: [] }] }),
        }),
      ).toThrow();
    });
  });

  describe("confirm", () => {
    let repo: BestFlowRepository;
    let flowId: string;

    beforeEach(() => {
      repo = new BestFlowRepository({ inMemory: true });
      const v1 = repo.saveRun({
        name: "Flow",
        goal: "Goal",
        steps: [makeStep()],
        evidence: makeEvidence(),
      });
      flowId = v1.id;
      repo.saveRun({
        flowId,
        name: "Flow",
        goal: "Goal",
        steps: [makeStep()],
        evidence: makeEvidence(),
      });
    });

    it("sets the confirmed version as the best", () => {
      const confirmed = repo.confirm(flowId, 1, false);

      expect(confirmed.bestVersion).toBe(1);
      expect(confirmed.versions.find((v) => v.version === 1)?.confirmed).toBe(true);
    });

    it("throws confirming a different version without approvedReplace", () => {
      repo.confirm(flowId, 1, false);

      expect(() => repo.confirm(flowId, 2, false)).toThrow();
    });

    it("succeeds confirming a different version with approvedReplace", () => {
      repo.confirm(flowId, 1, false);

      const confirmed = repo.confirm(flowId, 2, true);

      expect(confirmed.bestVersion).toBe(2);
    });
  });

  describe("handleSaveFlowRun", () => {
    it("returns 409 for unproven evidence", () => {
      const req: any = {
        body: {
          name: "Flow X",
          goal: "Goal X",
          steps: [makeStep()],
          evidence: makeEvidence({ steps: [{ stepId: "step_1", passed: false, checks: [] }] }),
        },
      };
      const res = makeRes();

      handleSaveFlowRun(req, res, noopNext);

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe("handleConfirmBestFlow", () => {
    it("returns 409 when replacing the confirmed best without approval", () => {
      const saveReq1: any = {
        body: { name: "Flow Y", goal: "Goal Y", steps: [makeStep()], evidence: makeEvidence() },
      };
      const saveRes1 = makeRes();
      handleSaveFlowRun(saveReq1, saveRes1, noopNext);
      const flowId = saveRes1.body.flow.id;

      const saveReq2: any = {
        body: {
          flowId,
          name: "Flow Y",
          goal: "Goal Y",
          steps: [makeStep()],
          evidence: makeEvidence(),
        },
      };
      handleSaveFlowRun(saveReq2, makeRes(), noopNext);

      const confirmRes1 = makeRes();
      handleConfirmBestFlow(
        { body: { version: 1, approvedReplace: false }, params: { id: flowId } } as any,
        confirmRes1,
        noopNext,
      );
      expect(confirmRes1.statusCode).toBe(200);

      const confirmRes2 = makeRes();
      handleConfirmBestFlow(
        { body: { version: 2, approvedReplace: false }, params: { id: flowId } } as any,
        confirmRes2,
        noopNext,
      );

      expect(confirmRes2.statusCode).toBe(409);
      expect(confirmRes2.body.success).toBe(false);
    });
  });
});
