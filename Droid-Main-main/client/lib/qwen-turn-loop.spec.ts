import { describe, expect, it, vi } from "vitest";
import {
  runTurnLoop,
  type GoalDevice,
  type GoalLoopDeps,
  type GoalLoopEvent,
  type TurnLoopOptions,
} from "./qwen-turn-loop";
import type { ChainLink } from "@shared/operation-graph";
import type {
  GoalAssessment,
  GoalStep,
  ObservedElement,
  PlanProposal,
  ReportLike,
  RunEvidence,
} from "@shared/goal-loop";

const GOAL = "Open settings and enable dark mode";

function makeStep(overrides: Partial<GoalStep> & Pick<GoalStep, "id">): GoalStep {
  return {
    name: overrides.name ?? "Step",
    action: "click",
    x: 0,
    y: 0,
    delayMs: 0,
    expectation: { kind: "none" },
    ...overrides,
  };
}

function makeElement(overrides: Partial<ObservedElement> = {}): ObservedElement {
  return {
    name: "Element",
    boundingBox: { x: 0, y: 0, width: 20, height: 20 },
    center: { x: 10, y: 10 },
    confidence: 0.9,
    ...overrides,
  };
}

function makeReport(overrides: Partial<ReportLike> = {}): ReportLike {
  return {
    screenDescription: "screen",
    activeWindow: "win",
    elements: [],
    confidence: 0.9,
    ...overrides,
  };
}

/** The element every "in place" step targets, at the coordinates the tests' steps use. */
const IN_PLACE_OK = makeElement({
  name: "OK",
  boundingBox: { x: 0, y: 0, width: 30, height: 30 },
  center: { x: 10, y: 10 },
});

/** Consumes queued scripted values in order; the last entry repeats once reached. */
function takeScripted<T>(queue: T[]): T {
  if (queue.length > 1) return queue.shift()!;
  return queue[0];
}

interface CallRecord {
  kind: "post" | "gate";
  url?: string;
  body?: unknown;
}

interface HarnessInit {
  captures?: Array<{ hash: string }>;
  reports?: ReportLike[];
  ocrLines?: string[][];
  proposals?: PlanProposal[];
  assessments?: GoalAssessment[];
  replayRuns?: Array<{ id: string; status: string; currentStep: number; steps: unknown[] }>;
  gateResults?: Array<Record<string, unknown>>;
  answers?: string[];
}

/** Fake GoalLoopDeps that routes by URL and scripts a value per endpoint, repeating the last. */
function createHarness(init: HarnessInit = {}) {
  const calls: CallRecord[] = [];
  const captureQueue = init.captures ?? [{ hash: "h0" }];
  const reportQueue = init.reports ?? [makeReport()];
  const ocrQueue = init.ocrLines ?? [[]];
  const proposeQueue = init.proposals ?? [];
  const assessQueue = init.assessments ?? [{ complete: true, onTrack: true, reason: "Goal reached" }];
  const replayQueue = init.replayRuns ?? [{ id: "r1", status: "completed", currentStep: 0, steps: [] }];
  const gateQueue = init.gateResults ?? [{ status: "verified", frame: "x", report: makeReport(), confidence: 0.9 }];
  const answerQueue = init.answers ?? ["An answer from Qwen"];

  const gate = vi.fn(async (request: unknown) => {
    calls.push({ kind: "gate", body: request });
    return takeScripted(gateQueue);
  });

  const post: GoalLoopDeps["post"] = async (url, body) => {
    calls.push({ kind: "post", url, body });
    switch (url) {
      case "/api/replay/capture":
        return { success: true, frame: { image: "data:image/png;base64,AAA=", hash: takeScripted(captureQueue).hash } };
      case "/api/ai/describe-screen":
        return { success: true, report: takeScripted(reportQueue) };
      case "/api/goal-workflows/ocr":
        return { success: true, lines: takeScripted(ocrQueue) };
      case "/api/goal-workflows/propose":
        return { success: true, proposal: takeScripted(proposeQueue) };
      case "/api/goal-workflows/assess":
        return { success: true, assessment: takeScripted(assessQueue) };
      case "/api/replay":
        return { success: true, run: takeScripted(replayQueue) };
      case "/api/hud/qwen/ask":
        return { success: true, answer: takeScripted(answerQueue) };
      default:
        throw new Error(`unexpected url ${url}`);
    }
  };

  const get: GoalLoopDeps["get"] = async () => ({
    run: { id: "r1", status: "completed", currentStep: 0, steps: [] },
  });

  const sleep: GoalLoopDeps["sleep"] = async () => {};

  const deps: GoalLoopDeps = { post, get, gate: gate as unknown as GoalLoopDeps["gate"], sleep };
  return { deps, calls, gate };
}

/** TurnLoopOptions plus the chain and events the test can inspect after the run. */
function makeOptions(overrides: Partial<TurnLoopOptions> = {}) {
  const events: GoalLoopEvent[] = [];
  let chain: ChainLink[] = [];
  const device: GoalDevice = { targetDevice: "desktop" };
  const approve = overrides.approve ?? vi.fn().mockResolvedValue(true);
  const options: TurnLoopOptions = {
    device,
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
    onChain: (links) => {
      chain = links;
    },
    approve,
    ...overrides,
  };
  return { options, events, approve, chain: () => chain };
}

describe("runTurnLoop", () => {
  it("fullTurnOrder", async () => {
    const step = makeStep({ id: "s1", name: "Tap OK", action: "click", x: 10, y: 10, targetLabel: "OK", expectation: { kind: "none" } });
    const harness = createHarness({
      captures: [{ hash: "h0" }, { hash: "h1" }, { hash: "h2" }],
      reports: [makeReport({ elements: [IN_PLACE_OK] })],
      proposals: [{ goal: GOAL, reason: "", steps: [step] }],
    });
    const { options, chain } = makeOptions();

    const result = await runTurnLoop(GOAL, options, harness.deps);

    expect(chain().map((l) => l.op)).toEqual([
      "capture",
      "think",
      "plan",
      "apply_plan",
      "capture",
      "simulate",
      "start",
      "check_completion",
      "save_best",
    ]);
    const gateIndex = harness.calls.findIndex((c) => c.kind === "gate");
    const replayIndex = harness.calls.findIndex((c) => c.kind === "post" && c.url === "/api/replay");
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(replayIndex).toBeGreaterThan(gateIndex);
    expect(result.status).toBe("completed");
  });

  it("verifyIsDryRun", async () => {
    const step1 = makeStep({ id: "s1", name: "Tap OK", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const step2 = makeStep({ id: "s2", name: "Tap Next", action: "click", x: 50, y: 50, targetLabel: "Next" });
    const harness = createHarness({
      reports: [makeReport(), makeReport({ elements: [IN_PLACE_OK] })],
      proposals: [{ goal: GOAL, reason: "", steps: [step1, step2] }],
    });
    const { options } = makeOptions({ stopBefore: "start" });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("planned");
    if (result.status === "planned") {
      expect(result.simulation[0].verdict).toBe("pass");
      expect(result.simulation[1].verdict).toBe("unchecked");
    }
    expect(harness.calls.some((c) => c.kind === "post" && c.url === "/api/replay")).toBe(false);
    expect(harness.gate).not.toHaveBeenCalled();
  });

  it("failedStepForwardsToRetryThenErrorFix", async () => {
    const step = makeStep({
      id: "s1",
      action: "click",
      x: 10,
      y: 10,
      targetLabel: "OK",
      expectation: { kind: "text_found", text: "Done" },
    });
    const harness = createHarness({
      reports: [makeReport({ elements: [IN_PLACE_OK] })],
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "fix", steps: [step] },
      ],
    });
    const approve = vi.fn().mockResolvedValue(false);
    const { options, chain } = makeOptions({ approve });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    const ops = chain().map((l) => l.op);
    expect(ops).toContain("retry");
    expect(ops.lastIndexOf("error_fix")).toBeGreaterThan(ops.lastIndexOf("retry"));
    const proposeCalls = harness.calls.filter((c) => c.kind === "post" && c.url === "/api/goal-workflows/propose");
    expect((proposeCalls[proposeCalls.length - 1].body as { reason?: string }).reason).toBeTruthy();
    expect(approve).toHaveBeenCalled();
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reason).toContain("declined");
  });

  it("gateBlockForwardsToErrorFix", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const harness = createHarness({
      reports: [makeReport({ elements: [IN_PLACE_OK] })],
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "fix", steps: [step] },
      ],
      gateResults: [{ status: "blocked", reason: "Element not found" }],
    });
    const approve = vi.fn().mockResolvedValue(false);
    const { options, chain } = makeOptions({ approve });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    expect(harness.calls.some((c) => c.kind === "post" && c.url === "/api/replay")).toBe(false);
    const ops = chain().map((l) => l.op);
    expect(ops.lastIndexOf("error_fix")).toBeGreaterThan(ops.lastIndexOf("start"));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
  });

  it("autoApproveSkipsPrompt", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const fixStep = makeStep({ id: "s2", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const harness = createHarness({
      captures: [{ hash: "h0" }, { hash: "h1" }, { hash: "h2" }, { hash: "h3" }, { hash: "h4" }],
      reports: [makeReport({ elements: [IN_PLACE_OK] })],
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "fix", steps: [fixStep] },
      ],
      gateResults: [{ status: "blocked", reason: "Element not found" }, { status: "verified", frame: "x", report: makeReport(), confidence: 0.9 }],
    });
    const approve = vi.fn().mockResolvedValue(true);
    const { options, events } = makeOptions({ approve, autoApprove: true });

    await runTurnLoop(GOAL, options, harness.deps);

    expect(approve).not.toHaveBeenCalled();
    expect(events.some((e) => e.message.startsWith("Auto-approved"))).toBe(true);
  });

  it("completionCheckLoopsBackToThink", async () => {
    const step = makeStep({ id: "s1", action: "wait" });
    const correctedStep = makeStep({ id: "s2", action: "wait" });
    const harness = createHarness({
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "corrected", steps: [correctedStep] },
      ],
      assessments: [
        { complete: false, onTrack: true, reason: "x" },
        { complete: true, onTrack: true, reason: "done" },
      ],
    });
    const approve = vi.fn().mockResolvedValue(true);
    const { options, chain } = makeOptions({ approve });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    const ops = chain().map((l) => l.op);
    const checkIndex = ops.indexOf("check_completion");
    expect(ops.lastIndexOf("think")).toBeGreaterThan(checkIndex);
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.goal).toBe(GOAL);
      expect(result.state.revisions).toBe(1);
    }
  });

  it("capturesBeforeAnswering", async () => {
    const harness = createHarness({ answers: ["What is here? It's a dialog box."] });
    const { options, chain } = makeOptions({ entry: "answer", question: "What is here?" });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    expect(chain().map((l) => l.op)).toEqual(["capture", "answer"]);
    const askCall = harness.calls.find((c) => c.kind === "post" && c.url === "/api/hud/qwen/ask");
    expect((askCall?.body as { imageData?: string }).imageData).toBe("data:image/png;base64,AAA=");
    expect(result).toEqual({ status: "answered", answer: "What is here? It's a dialog box." });
  });

  it("applyPlanEntryUsesInitialSteps", async () => {
    const step = makeStep({ id: "s1", action: "wait" });
    const harness = createHarness();
    const { options } = makeOptions({ entry: "apply_plan", initialSteps: [step], stopBefore: "start" });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    expect(harness.calls.some((c) => c.kind === "post" && c.url === "/api/goal-workflows/propose")).toBe(false);
    expect(result.status).toBe("planned");
  });

  it("stopAbortsPendingApproval", async () => {
    const controller = new AbortController();
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const harness = createHarness({
      reports: [makeReport({ elements: [IN_PLACE_OK] })],
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "fix", steps: [step] },
      ],
      gateResults: [{ status: "blocked", reason: "Element not found" }],
    });
    const approve = vi.fn(() => {
      setTimeout(() => controller.abort(), 0);
      return new Promise<boolean>(() => {});
    });
    const { options } = makeOptions({ signal: controller.signal, approve });

    const result = await runTurnLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reason).toBe("Stopped by user");
    expect(harness.calls.some((c) => c.kind === "post" && c.url === "/api/replay")).toBe(false);
  });

  it("saveBestReceivesVerifiedRun", async () => {
    const step = makeStep({ id: "s1", action: "wait" });
    const runOnce = async (saveBest: TurnLoopOptions["saveBest"]) => {
      const harness = createHarness({ proposals: [{ goal: GOAL, reason: "", steps: [step] }] });
      const { options } = makeOptions({ saveBest });
      return runTurnLoop(GOAL, options, harness.deps);
    };

    const saveBest = vi.fn().mockResolvedValue(undefined);
    const result = await runOnce(saveBest);
    expect(result.status).toBe("completed");
    if (result.status === "completed") expect(result.saved).toBe(true);
    expect(saveBest).toHaveBeenCalledTimes(1);
    const savedRun = saveBest.mock.calls[0][0] as { evidence: RunEvidence };
    expect(savedRun.evidence.goalAssessment.complete).toBe(true);

    const failingSave = vi.fn().mockRejectedValue(new Error("disk"));
    const result2 = await runOnce(failingSave);
    expect(result2.status).toBe("completed");
    if (result2.status === "completed") {
      expect(result2.saved).toBe(false);
      expect(result2.saveError).toBe("disk");
    }
  });
});
