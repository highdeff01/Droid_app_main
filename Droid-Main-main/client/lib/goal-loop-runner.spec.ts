import { describe, expect, it, vi } from "vitest";
import {
  GOAL_PHASE_BADGE,
  runGoalLoop,
  toSequenceSteps,
  type GoalDevice,
  type GoalLoopDeps,
  type GoalLoopEvent,
  type GoalLoopOptions,
  type GoalLoopPhase,
} from "./goal-loop-runner";
import type {
  GoalAssessment,
  GoalStep,
  ObservedElement,
  PlanProposal,
  ReportLike,
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

function makeOptions(overrides: Partial<GoalLoopOptions> = {}) {
  const events: GoalLoopEvent[] = [];
  const device: GoalDevice = { targetDevice: "desktop" };
  const approve = overrides.approve ?? vi.fn().mockResolvedValue(true);
  const options: GoalLoopOptions = {
    device,
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
    approve,
    ...overrides,
  };
  return { options, events, approve };
}

/** Each named phase must occur, in this relative order, among the events. */
function assertPhaseOrder(events: GoalLoopEvent[], phases: GoalLoopPhase[]) {
  let lastIndex = -1;
  for (const phase of phases) {
    const index = events.findIndex((event, i) => i > lastIndex && event.phase === phase);
    expect(index, `expected phase "${phase}" after index ${lastIndex}`).toBeGreaterThan(lastIndex);
    lastIndex = index;
  }
}

describe("runGoalLoop", () => {
  it("completes a one-step run with per-step verification and a gate-before-replay order", async () => {
    const step = makeStep({
      id: "s1",
      name: "Tap OK",
      action: "click",
      x: 10,
      y: 10,
      targetLabel: "OK",
      expectation: { kind: "screen_changed" },
    });
    const harness = createHarness({
      captures: [{ hash: "h0" }, { hash: "h1" }, { hash: "h2" }],
      reports: [
        makeReport(),
        makeReport({ elements: [makeElement({ name: "OK", boundingBox: { x: 0, y: 0, width: 30, height: 30 }, center: { x: 10, y: 10 } })] }),
        makeReport(),
      ],
      proposals: [{ goal: GOAL, reason: "", steps: [step] }],
    });
    const { options, events } = makeOptions();

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.evidence.steps).toHaveLength(1);
      expect(result.evidence.steps.every((s) => s.passed)).toBe(true);
    }
    const gateIndex = harness.calls.findIndex((c) => c.kind === "gate");
    const replayIndex = harness.calls.findIndex((c) => c.kind === "post" && c.url === "/api/replay");
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(replayIndex).toBeGreaterThan(gateIndex);
    assertPhaseOrder(events, ["thinking", "analyzing", "verifying", "acting", "completed"]);
  });

  it("fails without dispatching replay when the gate blocks the action", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const inPlace = makeElement({ name: "OK", boundingBox: { x: 0, y: 0, width: 30, height: 30 }, center: { x: 10, y: 10 } });
    const harness = createHarness({
      reports: [makeReport({ elements: [inPlace] })],
      proposals: [{ goal: GOAL, reason: "", steps: [step] }],
      gateResults: [{ status: "blocked", reason: "Element not found" }],
    });
    const { options } = makeOptions();

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reason).toContain("Action blocked");
    expect(harness.calls.some((c) => c.kind === "post" && c.url === "/api/replay")).toBe(false);
  });

  it("re-grounds a moved target on the fresh screen before gating and replaying", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const moved = makeElement({ name: "OK", boundingBox: { x: 190, y: 190, width: 20, height: 20 }, center: { x: 200, y: 200 } });
    const harness = createHarness({
      captures: [{ hash: "h0" }, { hash: "h1" }, { hash: "h2" }],
      reports: [makeReport(), makeReport({ elements: [moved] }), makeReport()],
      proposals: [{ goal: GOAL, reason: "", steps: [step] }],
    });
    const { options } = makeOptions();

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("completed");
    const gateRequest = harness.gate.mock.calls[0][0] as { target: { x: number; y: number } };
    expect(gateRequest.target.x).toBe(200);
    expect(gateRequest.target.y).toBe(200);
    const replayCall = harness.calls.find((c) => c.kind === "post" && c.url === "/api/replay");
    const body = replayCall?.body as { steps: Array<{ x: number; y: number }> };
    expect(body.steps[0].x).toBe(200);
    expect(body.steps[0].y).toBe(200);
  });

  it("re-plans and stops when the user declines the corrected proposal", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK", expectation: { kind: "text_found", text: "Done" } });
    const inPlace = makeElement({ name: "OK", boundingBox: { x: 0, y: 0, width: 30, height: 30 }, center: { x: 10, y: 10 } });
    const reproposal: PlanProposal = { goal: GOAL, reason: "corrected", steps: [makeStep({ id: "s2", action: "wait" })] };
    const harness = createHarness({
      reports: [makeReport({ elements: [inPlace] })],
      proposals: [{ goal: GOAL, reason: "", steps: [step] }, reproposal],
    });
    const approve = vi.fn().mockResolvedValue(false);
    const { options } = makeOptions({ approve });

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reason).toContain("declined");
    const proposeCalls = harness.calls.filter((c) => c.kind === "post" && c.url === "/api/goal-workflows/propose");
    expect(proposeCalls).toHaveLength(2);
    expect((proposeCalls[1].body as { reason?: string }).reason).toBeTruthy();
    expect(approve).toHaveBeenCalledWith(reproposal);
    const replayCalls = harness.calls.filter((c) => c.kind === "post" && c.url === "/api/replay");
    expect(replayCalls).toHaveLength(2);
  });

  it("sends guidance added mid-run with the next planning turn, not the earlier one", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK", expectation: { kind: "text_found", text: "Done" } });
    const inPlace = makeElement({ name: "OK", boundingBox: { x: 0, y: 0, width: 30, height: 30 }, center: { x: 10, y: 10 } });
    const harness = createHarness({
      reports: [makeReport({ elements: [inPlace] })],
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "corrected", steps: [makeStep({ id: "s2", action: "wait" })] },
      ],
    });
    const guidance: string[] = [];
    const { options } = makeOptions({
      guidance: () => [...guidance],
      onPlan: () => {
        if (guidance.length === 0) guidance.push("avoid the top bar");
      },
    });

    await runGoalLoop(GOAL, options, harness.deps);

    const proposeBodies = harness.calls
      .filter((c) => c.kind === "post" && c.url === "/api/goal-workflows/propose")
      .map((c) => c.body as { guidance?: string[] });
    expect(proposeBodies[0].guidance).toBeUndefined();
    expect(proposeBodies[1].guidance).toEqual(["avoid the top bar"]);
    const assessBodies = harness.calls
      .filter((c) => c.kind === "post" && c.url === "/api/goal-workflows/assess")
      .map((c) => c.body as { guidance?: string[] });
    expect(assessBodies[0].guidance).toEqual(["avoid the top bar"]);
  });

  it("refuses a step the beforeStep hook rejects without gating or dispatching it", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK" });
    const inPlace = makeElement({ name: "OK", boundingBox: { x: 0, y: 0, width: 30, height: 30 }, center: { x: 10, y: 10 } });
    const harness = createHarness({
      reports: [makeReport({ elements: [inPlace] })],
      proposals: [{ goal: GOAL, reason: "", steps: [step] }],
    });
    const approve = vi.fn().mockResolvedValue(false);
    const { options } = makeOptions({ approve, beforeStep: () => "method already failed" });

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("failed");
    expect(harness.gate).not.toHaveBeenCalled();
    expect(harness.calls.some((c) => c.kind === "post" && c.url === "/api/replay")).toBe(false);
    const replanBody = harness.calls.filter((c) => c.url === "/api/goal-workflows/propose")[1]?.body as { reason?: string };
    expect(replanBody.reason).toBe("method already failed");
  });

  it("keeps the original goal and records one revision when an approved re-plan completes", async () => {
    const step = makeStep({ id: "s1", action: "click", x: 10, y: 10, targetLabel: "OK", expectation: { kind: "text_found", text: "Done" } });
    const inPlace = makeElement({ name: "OK", boundingBox: { x: 0, y: 0, width: 30, height: 30 }, center: { x: 10, y: 10 } });
    const nextStepAfterPlan = makeStep({ id: "s2", action: "wait" });
    const harness = createHarness({
      reports: [makeReport({ elements: [inPlace] })],
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "corrected", steps: [nextStepAfterPlan] },
      ],
    });
    const approve = vi.fn().mockResolvedValue(true);
    const { options } = makeOptions({ approve });

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.state.goal).toBe(GOAL);
      expect(result.state.revisions).toBe(1);
    }
  });

  it("requests approval with a 'Goal not reached' reason when the assessment is incomplete", async () => {
    const step = makeStep({ id: "s1", action: "wait" });
    const harness = createHarness({
      proposals: [
        { goal: GOAL, reason: "", steps: [step] },
        { goal: GOAL, reason: "corrected", steps: [makeStep({ id: "s2", action: "wait" })] },
      ],
      assessments: [{ complete: false, onTrack: true, reason: "The dark mode toggle is still off" }],
    });
    const approve = vi.fn().mockResolvedValue(false);
    const { options, events } = makeOptions({ approve });

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("failed");
    expect(
      events.some((e) => e.phase === "awaiting_approval" && e.message.startsWith("Waiting for approval: Goal not reached")),
    ).toBe(true);
  });

  it("stops dispatching once the goal is reached mid-plan", async () => {
    const harness = createHarness({
      proposals: [{ goal: GOAL, reason: "", steps: [makeStep({ id: "s1", action: "wait" }), makeStep({ id: "s2", action: "wait" })] }],
      assessments: [{ complete: true, onTrack: true, reason: "Already done" }],
    });
    const { options } = makeOptions();

    const result = await runGoalLoop(GOAL, options, harness.deps);

    expect(result.status).toBe("completed");
    expect(harness.calls.filter((c) => c.kind === "post" && c.url === "/api/replay")).toHaveLength(1);
  });
});

describe("toSequenceSteps", () => {
  it("maps a goal step to a pending sequence step carrying its target label", () => {
    const step = makeStep({ id: "s1", name: "Tap OK", action: "click", x: 10, y: 10, targetLabel: "OK" });

    const [sequenceStep] = toSequenceSteps([step]);

    expect(sequenceStep.stepNumber).toBe(1);
    expect(sequenceStep.status).toBe("pending");
    expect(sequenceStep.targetOcrLabel).toBe("OK");
  });
});

describe("GOAL_PHASE_BADGE", () => {
  it("maps 'failed' to the failed badge state", () => {
    expect(GOAL_PHASE_BADGE.failed).toBe("failed");
  });

  it("maps 'awaiting_approval' to the retrying badge state", () => {
    expect(GOAL_PHASE_BADGE.awaiting_approval).toBe("retrying");
  });
});
