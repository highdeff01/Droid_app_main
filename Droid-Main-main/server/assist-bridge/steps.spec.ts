import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { judgeStep, StepCoordinator, type StepCoordinatorDeps } from "./steps";
import type { FrameOutcome } from "./frames";

function frame(jpeg: string): FrameOutcome {
  return { live: true, frame: { jpeg, w: 1, h: 1, ts: 1 } };
}
const STANDBY: FrameOutcome = { live: false, message: "no frame" };

describe("stepConsensus", () => {
  it("judgeStep fails when end is null", () => {
    expect(judgeStep(null, null, [])).toMatchObject({ passed: false, evidence: expect.stringContaining("No live frame") });
  });

  it("judgeStep fails when errors are non-empty", () => {
    expect(judgeStep("a", "a", ["boom"])).toMatchObject({ passed: false, evidence: expect.stringContaining("boom") });
  });

  it("judgeStep fails when start === end ('did not change')", () => {
    expect(judgeStep("a", "a", [])).toMatchObject({ passed: false, evidence: expect.stringContaining("did not change") });
  });

  it("judgeStep passes otherwise", () => {
    expect(judgeStep("a", "b", [])).toMatchObject({ passed: true });
    expect(judgeStep(null, "b", [])).toMatchObject({ passed: true });
  });

  function makeDeps(overrides: Partial<StepCoordinatorDeps> = {}): { deps: StepCoordinatorDeps; readFrame: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> } {
    const readFrame = vi.fn(async () => frame("same"));
    const emit = vi.fn();
    const request = vi.fn(async () => ({}));
    const deps: StepCoordinatorDeps = {
      readFrame,
      errorsSince: () => [],
      runScript: vi.fn(async () => ({ completed: true, steps: [] })),
      planTakeover: vi.fn(async () => [{ op: "wait" as const, ms: 0 }]),
      emit,
      request,
      log: vi.fn(),
      autoTakeover: () => false,
      now: () => 0,
      ...overrides,
    };
    return { deps, readFrame, emit, request };
  }

  it("update(started) then update(done, verified true) with a changed frame and no errors completes and emits step_observation", async () => {
    let call = 0;
    const readFrame = vi.fn(async () => (call++ === 0 ? frame("frame-a") : frame("frame-b")));
    const { deps, emit } = makeDeps({ readFrame });
    const coordinator = new StepCoordinator(deps);
    await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "started" });
    const record = await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "done", verified: true });
    expect(record.state).toBe("complete");
    expect(emit).toHaveBeenCalledWith("step_observation", expect.objectContaining({ stepId: "s1", state: "complete" }));
  });

  it("assist verified true but same frame is 'disputed' and routes resolve_disagreement with mainVerified:false", async () => {
    const { deps, request } = makeDeps({ readFrame: vi.fn(async () => frame("same")) });
    const coordinator = new StepCoordinator(deps);
    await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "started" });
    const record = await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "done", verified: true });
    expect(record.state).toBe("disputed");
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith("resolve_disagreement", expect.objectContaining({ stepId: "s1", assistVerified: true, mainVerified: false }));
  });

  it("both fail is 'failed'", async () => {
    const { deps } = makeDeps({ readFrame: vi.fn(async () => frame("same")) });
    const coordinator = new StepCoordinator(deps);
    await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "started" });
    const record = await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "failed", verified: false });
    expect(record.state).toBe("failed");
  });
});

describe("stallAndTakeover", () => {
  function makeDeps(overrides: Partial<StepCoordinatorDeps> = {}) {
    let now = 0;
    const readFrame = vi.fn(async () => frame("f"));
    const emit = vi.fn();
    const runScript = vi.fn(async () => ({ completed: true, steps: [] }));
    const planTakeover = vi.fn(async () => [{ op: "wait" as const, ms: 0 }]);
    const deps: StepCoordinatorDeps = {
      readFrame,
      errorsSince: () => [],
      runScript,
      planTakeover,
      emit,
      request: vi.fn(async () => ({})),
      log: vi.fn(),
      autoTakeover: () => false,
      now: () => now,
      stallMs: 10_000,
      ...overrides,
    };
    return { deps, emit, runScript, planTakeover, advance: (ms: number) => (now += ms) };
  }

  it("a running step older than stallMs becomes 'incomplete' and emits step_incomplete", async () => {
    const { deps, emit, advance } = makeDeps();
    const coordinator = new StepCoordinator(deps);
    await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "started" });
    advance(10_001);
    await coordinator.checkStalls();
    const record = coordinator.list().find((r) => r.stepId === "s1")!;
    expect(record.state).toBe("incomplete");
    expect(emit).toHaveBeenCalledWith("step_incomplete", expect.objectContaining({ stepId: "s1" }));
  });

  it("with a script and autoTakeover() true, runScript runs it and a handoff with origin 'main' is recorded", async () => {
    const script = [{ op: "wait", ms: 0 } as const];
    const { deps, runScript, advance } = makeDeps({ autoTakeover: () => true });
    const coordinator = new StepCoordinator(deps);
    await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "started", script });
    advance(10_001);
    await coordinator.checkStalls();
    expect(runScript).toHaveBeenCalledWith(script);
    const handoff = coordinator.handoffs().find((h) => h.stepId === "s1")!;
    expect(handoff.origin).toBe("main");
  });

  it("autoTakeover() false does not call runScript", async () => {
    const script = [{ op: "wait", ms: 0 } as const];
    const { deps, runScript, advance } = makeDeps({ autoTakeover: () => false });
    const coordinator = new StepCoordinator(deps);
    await coordinator.update({ stepId: "s1", goal: "g", step: "do it", status: "started", script });
    advance(10_001);
    await coordinator.checkStalls();
    expect(runScript).not.toHaveBeenCalled();
  });

  it("takeover(payload, 'assist') without a script plans, runs, and emits a 'completed' handoff", async () => {
    const { deps, planTakeover, emit } = makeDeps();
    const coordinator = new StepCoordinator(deps);
    const payload = { stepId: "s1", goal: "g", step: "do it", tried: ["clicked wrong spot"], screenshots: [] };
    const handoff = await coordinator.takeover(payload, "assist");
    expect(planTakeover).toHaveBeenCalledWith(expect.objectContaining({ goal: "g", step: "do it", tried: ["clicked wrong spot"], frame: "f" }));
    expect(handoff.outcome).toBe("completed");
    expect(emit).toHaveBeenCalledWith("handoff", expect.objectContaining({ outcome: "completed" }));
  });

  it("runScript returning completed:false gives outcome 'failed' with detail = stoppedReason", async () => {
    const runScript = vi.fn(async () => ({ completed: false, steps: [], stoppedReason: "no backend" }));
    const { deps } = makeDeps({ runScript });
    const coordinator = new StepCoordinator(deps);
    const payload = { stepId: "s1", goal: "g", step: "do it", tried: [], screenshots: [] };
    const handoff = await coordinator.takeover(payload, "assist");
    expect(handoff.outcome).toBe("failed");
    expect(handoff.detail).toBe("no backend");
  });

  it("planTakeover throwing gives outcome 'failed' with that message", async () => {
    const planTakeover = vi.fn(async () => {
      throw new Error("AI endpoint unreachable");
    });
    const { deps } = makeDeps({ planTakeover });
    const coordinator = new StepCoordinator(deps);
    const payload = { stepId: "s1", goal: "g", step: "do it", tried: [], screenshots: [] };
    const handoff = await coordinator.takeover(payload, "assist");
    expect(handoff.outcome).toBe("failed");
    expect(handoff.detail).toBe("AI endpoint unreachable");
  });
});
