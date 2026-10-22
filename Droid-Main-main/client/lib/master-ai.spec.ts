import { describe, expect, it, vi } from "vitest";
import {
  FailedMethodLedger,
  MasterAiController,
  nextDeviceOperation,
  type MasterDeps,
  type MasterHooks,
  type OperationContext,
  type OperationKind,
  type OperationOutcome,
  type OperationRunner,
  type RunnerTable,
} from "./master-ai";

/** A runner that waits until released or aborted; records its context. */
function controllable() {
  const contexts: OperationContext[] = [];
  const releases: Array<(outcome: OperationOutcome) => void> = [];
  const runner: OperationRunner = (_op, ctx) => {
    contexts.push(ctx);
    return new Promise<OperationOutcome>((resolve, reject) => {
      releases.push(resolve);
      ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  };
  return { runner: vi.fn(runner), contexts, releases };
}

function makeTable(overrides: Partial<RunnerTable> = {}) {
  const fallback = controllable();
  const table = {} as RunnerTable;
  for (const kind of ["goal", "replay", "trigger", "habit", "qwen_orchestrate", "save_flow"] as OperationKind[]) {
    table[kind] = overrides[kind] ?? fallback.runner;
  }
  return { table, fallback };
}

function makeHooks(): MasterHooks & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    enableTriggers: vi.fn(async () => void calls.push("enable")),
    disableTriggers: vi.fn(async () => void calls.push("disable")),
    cancelReplay: vi.fn(async (id: string) => void calls.push(`cancel:${id}`)),
    haltExternal: vi.fn(async () => void calls.push("halt")),
  };
}

/** Manual clock and timers. */
function makeDeps(settleMs = 0) {
  let now = 1000;
  const timers: Array<{ at: number; fn: () => void; cleared: boolean }> = [];
  const deps: MasterDeps = {
    now: () => now,
    setTimer: (fn, ms) => {
      const timer = { at: now + ms, fn, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    settleMs,
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((t) => !t.cleared && t.at <= now)) {
      t.cleared = true;
      t.fn();
    }
  };
  return { deps, advance };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MasterAiController start/stop lifecycle", () => {
  it("enables trigger evaluation on start and refuses work before start", async () => {
    const hooks = makeHooks();
    const master = new MasterAiController(makeTable().table, hooks, {}, makeDeps().deps);
    expect(() => master.enqueue({ kind: "goal", title: "g" })).toThrow(/Start Master AI/);
    await master.start();
    expect(hooks.enableTriggers).toHaveBeenCalledTimes(1);
    expect(master.snapshot()).toMatchObject({ active: true, triggersEnabled: true });
  });

  it("stop aborts every running operation, cancels queued ones and replays, disables triggers and declines approvals", async () => {
    const goal = controllable();
    const qwen = controllable();
    const hooks = makeHooks();
    const { table } = makeTable({ goal: goal.runner, qwen_orchestrate: qwen.runner });
    const master = new MasterAiController(table, hooks, {}, makeDeps().deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "Run goal" });
    master.enqueue({ kind: "qwen_orchestrate", title: "Qwen" });
    master.enqueue({ kind: "trigger", title: "Queued trigger" });
    goal.contexts[0].registerReplay("run-7");
    const approval = goal.contexts[0].requestApproval("fix?");

    const report = await master.stop();

    expect(goal.contexts[0].signal.aborted).toBe(true);
    expect(qwen.contexts[0].signal.aborted).toBe(true);
    expect(await approval).toBe(false);
    expect(report.abortedOperations.sort()).toEqual(["Qwen", "Run goal"]);
    expect(report.cancelledQueued).toEqual(["Queued trigger"]);
    expect(report.declinedApprovals).toBe(1);
    expect(report.replaysCancelled).toEqual(["run-7"]);
    expect(report.triggersDisabled).toBe(true);
    expect(report.stillRunning).toEqual([]);
    expect(hooks.calls).toEqual(expect.arrayContaining(["disable", "cancel:run-7", "halt"]));
    const snapshot = master.snapshot();
    expect(snapshot.active).toBe(false);
    expect(snapshot.triggersEnabled).toBe(false);
    expect(snapshot.operations.every((op) => op.status === "cancelled")).toBe(true);
    // Nothing starts after stop.
    expect(() => master.enqueue({ kind: "goal", title: "late" })).toThrow();
  });

  it("reports honestly when an operation ignores the abort and is still running", async () => {
    const stubborn: OperationRunner = () => new Promise<OperationOutcome>(() => {});
    const { deps, advance } = makeDeps(50);
    const master = new MasterAiController(makeTable({ goal: stubborn }).table, makeHooks(), {}, deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "Stuck goal" });
    const stopping = master.stop();
    await flush();
    advance(50);
    const report = await stopping;
    expect(report.stillRunning).toEqual(["Stuck goal"]);
  });

  it("reports a trigger-disable failure instead of claiming it", async () => {
    const hooks = makeHooks();
    hooks.disableTriggers = vi.fn(async () => {
      throw new Error("watch endpoint down");
    });
    const master = new MasterAiController(makeTable().table, hooks, {}, makeDeps().deps);
    await master.start();
    const report = await master.stop();
    expect(report.triggersDisabled).toBe(false);
    expect(report.errors).toContain("watch endpoint down");
  });
});

describe("guidance injection", () => {
  it("acknowledges guidance at once and hands it to the next turn without aborting the running step", async () => {
    const goal = controllable();
    const master = new MasterAiController(makeTable({ goal: goal.runner }).table, makeHooks(), {}, makeDeps().deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "g" });
    const ctx = goal.contexts[0];
    expect(ctx.guidance()).toEqual([]);

    master.addGuidance("  skip the ad ");

    const acked = master.snapshot();
    expect(acked.guidance).toEqual([expect.objectContaining({ text: "skip the ad", appliedAt: null })]);
    expect(acked.chain.some((c) => c.message.includes('Guidance acknowledged: "skip the ad"'))).toBe(true);
    expect(ctx.signal.aborted).toBe(false);

    expect(ctx.guidance()).toEqual(["skip the ad"]);
    expect(master.snapshot().guidance[0].appliedAt).not.toBeNull();
    // Persists for subsequent turns.
    master.addGuidance("slow down");
    expect(ctx.guidance()).toEqual(["skip the ad", "slow down"]);
  });

  it("rejects empty guidance", () => {
    const master = new MasterAiController(makeTable().table, makeHooks(), {}, makeDeps().deps);
    expect(() => master.addGuidance("   ")).toThrow();
  });
});

describe("operation queuing and interleaving", () => {
  it("queues a trigger behind a running goal and starts it only when the goal finishes", async () => {
    const goal = controllable();
    const trigger = controllable();
    const master = new MasterAiController(makeTable({ goal: goal.runner, trigger: trigger.runner }).table, makeHooks(), {}, makeDeps().deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "goal" });
    master.enqueue({ kind: "trigger", title: "trigger" });
    expect(trigger.runner).not.toHaveBeenCalled();
    expect(master.snapshot().operations.map((o) => o.status)).toEqual(["running", "queued"]);

    goal.releases[0]({ status: "completed", detail: "done" });
    await flush();

    expect(trigger.runner).toHaveBeenCalledTimes(1);
    expect(master.snapshot().operations.map((o) => o.status)).toEqual(["completed", "running"]);
  });

  it("interleaves non-device operations alongside a running device operation", async () => {
    const goal = controllable();
    const qwen = controllable();
    const master = new MasterAiController(makeTable({ goal: goal.runner, qwen_orchestrate: qwen.runner }).table, makeHooks(), {}, makeDeps().deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "goal" });
    master.enqueue({ kind: "qwen_orchestrate", title: "qwen" });
    expect(qwen.runner).toHaveBeenCalledTimes(1);
    expect(master.snapshot().operations.every((o) => o.status === "running")).toBe(true);
  });

  it("starts a queued user goal before an earlier queued trigger", async () => {
    const habit = controllable();
    const goal = controllable();
    const trigger = controllable();
    const master = new MasterAiController(
      makeTable({ habit: habit.runner, goal: goal.runner, trigger: trigger.runner }).table,
      makeHooks(),
      {},
      makeDeps().deps,
    );
    await master.start();
    master.enqueue({ kind: "habit", title: "habit" });
    master.enqueue({ kind: "trigger", title: "trigger" });
    master.enqueue({ kind: "goal", title: "goal" });
    habit.releases[0]({ status: "completed", detail: "ok" });
    await flush();
    expect(goal.runner).toHaveBeenCalledTimes(1);
    expect(trigger.runner).not.toHaveBeenCalled();
  });

  it("forwards follow-up operations along the operation graph with their parent", async () => {
    const replay: OperationRunner = async () => ({
      status: "failed",
      reason: "Action blocked",
      next: [{ kind: "goal", title: "Re-plan", payload: { goal: "x" } }],
    });
    const goal = controllable();
    const master = new MasterAiController(makeTable({ replay, goal: goal.runner }).table, makeHooks(), {}, makeDeps().deps);
    await master.start();
    const first = master.enqueue({ kind: "replay", title: "Replay" });
    await flush();
    const ops = master.snapshot().operations;
    expect(ops[0]).toMatchObject({ status: "failed", detail: "Action blocked" });
    expect(ops[1]).toMatchObject({ kind: "goal", parentId: first.id, status: "running" });
  });

  it("nextDeviceOperation ignores non-device and non-queued operations", () => {
    expect(nextDeviceOperation([])).toBeUndefined();
  });
});

describe("enforced limits", () => {
  it("fails an operation that exceeds max iterations before the extra step is dispatched", async () => {
    const dispatched: number[] = [];
    const goal: OperationRunner = async (_op, ctx) => {
      for (let i = 1; i <= 5; i += 1) {
        ctx.countIteration();
        dispatched.push(i);
      }
      return { status: "completed", detail: "all" };
    };
    const master = new MasterAiController(makeTable({ goal }).table, makeHooks(), { maxIterations: 3 }, makeDeps().deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "g" });
    await flush();
    expect(dispatched).toEqual([1, 2, 3]);
    expect(master.snapshot().operations[0]).toMatchObject({ status: "failed", iterations: 3, detail: "Max iterations (3) reached" });
  });

  it("stops the whole session when the duration cap is reached", async () => {
    const goal = controllable();
    const hooks = makeHooks();
    const { deps, advance } = makeDeps();
    const master = new MasterAiController(makeTable({ goal: goal.runner }).table, hooks, { maxDurationMs: 60_000 }, deps);
    await master.start();
    master.enqueue({ kind: "goal", title: "g" });
    advance(59_999);
    expect(goal.contexts[0].signal.aborted).toBe(false);
    advance(1);
    await flush();
    expect(goal.contexts[0].signal.aborted).toBe(true);
    expect(master.snapshot().active).toBe(false);
    expect(master.snapshot().lastStop?.reason).toMatch(/Duration cap reached \(60s\)/);
    expect(hooks.disableTriggers).toHaveBeenCalled();
  });

  it("the failed-methods ledger matches the same method at nearby points and lists it", () => {
    const ledger = new FailedMethodLedger();
    ledger.record({ action: "click", x: 101, y: 199, label: "OK" }, "screen unchanged");
    expect(ledger.has({ action: "click", x: 99, y: 202, label: "ok" })).toBe(true);
    expect(ledger.has({ action: "double_click", x: 101, y: 199, label: "OK" })).toBe(false);
    expect(ledger.list()).toEqual(["click@100,200:ok (screen unchanged)"]);
  });
});
