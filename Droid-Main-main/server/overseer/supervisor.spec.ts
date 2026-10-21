import { describe, it, expect, vi } from "vitest";
import type { OperationStepReport } from "../../shared/overseer";
import { OverseerSupervisor } from "./supervisor";
import type { OverseerAnalyzer } from "./analyzer";

const FRAME = "data:image/png;base64,AAAA";

function setup(capture: () => Promise<string | null> = async () => FRAME) {
  const clock = { now: 1_000 };
  const analyzer = { assessStep: vi.fn(), checkup: vi.fn() } satisfies OverseerAnalyzer;
  const audit = vi.fn();
  const supervisor = new OverseerSupervisor({
    analyzer,
    capture,
    audit,
    now: () => clock.now,
    stallMs: 1_000,
    checkupIntervalMs: 5_000,
  });
  return { clock, analyzer, audit, supervisor };
}

const step = (overrides: Partial<OperationStepReport> = {}): OperationStepReport => ({
  stepId: "s1",
  name: "Click save",
  action: "click",
  x: 10,
  y: 20,
  expectation: "Saved banner",
  ...overrides,
});

const answer = (value: Record<string, unknown>) => ({ ok: true, provider: "qwen" as const, value: { accuracyScore: null, ...value } });

describe("OverseerSupervisor verification", () => {
  it("reports uncertain without a frame and never calls the model", async () => {
    const { supervisor, analyzer } = setup(async () => null);
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "save" });
    const verdict = await supervisor.reportStep("op", step());
    expect(verdict).toMatchObject({ status: "uncertain", accuracyScore: null, provider: "none" });
    expect(analyzer.assessStep).not.toHaveBeenCalled();
    expect(supervisor.snapshot().interventions).toEqual([]);
  });

  it("surfaces an unreachable model as uncertain with its reason", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue({ ok: false, reason: "model down" });
    supervisor.register({ id: "op", kind: "goal_run", source: "t", goal: "save" });
    const verdict = await supervisor.reportStep("op", step());
    expect(verdict.status).toBe("uncertain");
    expect(verdict.analysis).toContain("model down");
  });

  it("verifies with evidence and audits the verdict", async () => {
    const { supervisor, analyzer, audit } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "verified", accuracyScore: 0.92, analysis: "banner shown" }));
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "save" });
    const verdict = await supervisor.reportStep("op", step());
    expect(verdict).toMatchObject({ status: "verified", accuracyScore: 0.92, evidenceImage: FRAME, provider: "qwen" });
    expect(audit).toHaveBeenCalledWith("SUCCESS", expect.any(String), expect.objectContaining({ status: "verified" }));
  });
});

describe("OverseerSupervisor interventions", () => {
  it("retries a missed step twice, then proposes a replan for approval", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "missed" }));
    const retry = vi.fn();
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "save", caps: { maxRepeats: null } }, { retry });
    await supervisor.reportStep("op", step());
    expect(supervisor.get("op")!.directive).toBe("retry");
    expect(retry).toHaveBeenCalledTimes(1);
    await supervisor.reportStep("op", step());
    await supervisor.reportStep("op", step());
    await supervisor.reportStep("op", step());
    const kinds = supervisor.snapshot().interventions.map((i) => [i.kind, i.status]).reverse();
    expect(kinds).toEqual([
      ["retry", "applied"],
      ["retry", "applied"],
      ["replan", "pending_approval"],
    ]);
    expect(retry).toHaveBeenCalledTimes(2);
    expect(supervisor.get("op")!.status).toBe("running");
  });

  it("pauses for the user when the executor cannot retry on request", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "missed" }));
    const pause = vi.fn();
    supervisor.register({ id: "op", kind: "assistant_execution", source: "t", goal: "save" }, { pause });
    await supervisor.reportStep("op", step());
    expect(supervisor.snapshot().interventions[0]).toMatchObject({ kind: "pause", status: "applied" });
    expect(supervisor.get("op")!.status).toBe("paused");
    expect(pause).toHaveBeenCalled();
  });

  it("an approved replan pauses the run for the user to re-plan", async () => {
    const { supervisor } = setup();
    const pause = vi.fn();
    supervisor.register({ id: "op", kind: "goal_run", source: "t", goal: "save" }, { pause });
    const replan = supervisor.propose("op", "replan", "drift", "new plan");
    supervisor.decide(replan.id, true);
    expect(supervisor.get("op")).toMatchObject({ status: "paused", directive: "replan" });
    expect(pause).toHaveBeenCalled();
  });

  it("never revives a finished operation", () => {
    const { supervisor } = setup();
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "save" });
    const queue = supervisor.propose("op", "queue", "busy");
    supervisor.finish("op", "completed");
    expect(() => supervisor.pauseOperation("op", "x")).toThrow(/already completed/);
    expect(() => supervisor.resumeOperation("op")).toThrow(/already completed/);
    expect(() => supervisor.propose("op", "replan", "x")).toThrow(/already completed/);
    expect(supervisor.decide(queue.id, true).status).toBe("approved");
    expect(supervisor.get("op")!.status).toBe("completed");
  });

  it("pauses an obstructed operation through its control", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "obstructed" }));
    const pause = vi.fn();
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "save" }, { pause });
    await supervisor.reportStep("op", step());
    expect(supervisor.get("op")!.status).toBe("paused");
    expect(pause).toHaveBeenCalled();
  });

  it("gates proposals on a single user decision", async () => {
    const { supervisor, audit } = setup();
    const pause = vi.fn();
    supervisor.register({ id: "op", kind: "orchestrator", source: "t", goal: "save" }, { pause });
    const queue = supervisor.propose("op", "queue", "busy");
    expect(queue.status).toBe("pending_approval");
    expect(supervisor.get("op")!.status).toBe("running");
    expect(supervisor.decide(queue.id, true).status).toBe("approved");
    expect(supervisor.get("op")!.status).toBe("queued");
    expect(pause).toHaveBeenCalled();
    expect(() => supervisor.decide(queue.id, false)).toThrow();
    const replan = supervisor.propose("op", "replan", "drift", "new plan");
    expect(supervisor.decide(replan.id, false).status).toBe("rejected");
    expect(audit).toHaveBeenCalledWith("WARN", expect.stringContaining("rejected"), expect.anything());
  });
});

describe("OverseerSupervisor cross-operation management", () => {
  const region = (x: number) => ({ x, y: 0, width: 100, height: 100 });

  it("detects a region conflict and proposes queuing the later operation once", async () => {
    const { supervisor, clock } = setup();
    supervisor.register({ id: "first", kind: "replay", source: "t", goal: "a", region: region(0) });
    clock.now += 10;
    supervisor.register({ id: "second", kind: "goal_run", source: "t", goal: "b", region: region(50) });
    await supervisor.tick();
    const { conflicts, interventions } = supervisor.snapshot();
    expect(conflicts).toHaveLength(1);
    expect(interventions.filter((i) => i.kind === "queue")).toEqual([
      expect.objectContaining({ operationId: "second", status: "pending_approval" }),
    ]);
  });

  it("stops an operation that breaks the non-repetition ledger", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "verified", accuracyScore: 0.9 }));
    const cancel = vi.fn();
    supervisor.register({ id: "op", kind: "autonomous_loop", source: "t", goal: "a", caps: { maxRepeats: 2 } }, { cancel });
    for (let i = 0; i < 3; i++) await supervisor.reportStep("op", step());
    expect(supervisor.snapshot().interventions[0]).toMatchObject({ kind: "cap_stop", status: "applied" });
    expect(cancel).toHaveBeenCalled();
    expect(supervisor.get("op")!.directive).toBe("stop");
  });

  it("stops an operation past its duration cap", async () => {
    const { supervisor, clock } = setup();
    supervisor.register({ id: "op", kind: "habit_routine", source: "t", goal: "a", caps: { maxDurationMs: 500 } });
    clock.now += 600;
    await supervisor.tick();
    expect(supervisor.snapshot().interventions[0].kind).toBe("cap_stop");
  });

  it("pauses a stalled operation", async () => {
    const { supervisor, clock } = setup();
    supervisor.register({ id: "op", kind: "goal_run", source: "t", goal: "a" });
    clock.now += 1_500;
    await supervisor.tick();
    expect(supervisor.snapshot().interventions[0]).toMatchObject({ kind: "pause" });
    expect(supervisor.snapshot().interventions[0].reason).toContain("Stalled");
  });
});

describe("OverseerSupervisor checkups", () => {
  async function checkupWith(result: unknown) {
    const ctx = setup();
    ctx.analyzer.checkup.mockResolvedValue(result);
    ctx.supervisor.register({ id: "op", kind: "goal_run", source: "t", goal: "a" });
    ctx.clock.now += 5_000;
    ctx.supervisor.get("op")!.lastActivityAt = ctx.clock.now;
    await ctx.supervisor.tick();
    return ctx;
  }

  it("reports continuing, complete, off_track and uncertain honestly", async () => {
    expect((await checkupWith(answer({ isFinished: false, onTrack: true, summary: "s" }))).supervisor.get("op")!.lastCheckup!.outcome).toBe("continuing");
    expect((await checkupWith(answer({ isFinished: true, onTrack: null, summary: "s" }))).supervisor.get("op")!.lastCheckup!.outcome).toBe("complete");
    expect((await checkupWith({ ok: false, reason: "down" })).supervisor.get("op")!.lastCheckup!.outcome).toBe("uncertain");
    const offTrack = await checkupWith(answer({ isFinished: false, onTrack: false, summary: "s" }));
    expect(offTrack.supervisor.get("op")!.lastCheckup!.outcome).toBe("off_track");
    expect(offTrack.supervisor.snapshot().interventions[0]).toMatchObject({ kind: "replan", status: "pending_approval" });
  });
});

describe("OverseerSupervisor lifecycle", () => {
  it("keeps verdicts after finish but no longer intervenes", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "missed" }));
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "a" });
    supervisor.finish("op", "completed");
    await supervisor.reportStep("op", step());
    expect(supervisor.get("op")!.status).toBe("completed");
    expect(supervisor.get("op")!.verdicts).toHaveLength(1);
    expect(supervisor.snapshot().interventions).toEqual([]);
  });

  it("supervises operations announced on the bus", async () => {
    const { supervisor, analyzer } = setup();
    analyzer.assessStep.mockResolvedValue(answer({ status: "verified", accuracyScore: 0.8 }));
    supervisor.handleBusEvent({ type: "started", input: { id: "op", kind: "trigger_action", source: "t", goal: "a" } });
    supervisor.handleBusEvent({ type: "step", operationId: "op", report: step() });
    await vi.waitFor(() => expect(supervisor.get("op")!.verdicts).toHaveLength(1));
    supervisor.handleBusEvent({ type: "finished", operationId: "op", status: "failed", detail: "boom" });
    expect(supervisor.get("op")).toMatchObject({ status: "failed", detail: "boom" });
  });

  it("summarizes active operations and pending proposals", () => {
    const { supervisor } = setup();
    supervisor.register({ id: "op", kind: "replay", source: "t", goal: "save file" });
    supervisor.propose("op", "deprioritize", "less urgent");
    const summary = supervisor.summary();
    expect(summary).toContain("1 active operation(s), 1 proposal(s) awaiting approval");
    expect(summary).toContain('replay "save file": running, no verdict yet');
  });
});
