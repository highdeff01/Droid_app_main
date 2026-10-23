import { describe, expect, it, vi } from "vitest";
import type { AssistantPlan } from "@shared/assistant";
import { ACTION_TIMEOUT_MS, ExecutionStateRepository } from "./execution-state";
import { allowlistedActionSchema } from "./routes/assistant-execution";

const plan = (
  action?: AssistantPlan["steps"][number]["action"],
  adaptive?: AssistantPlan["steps"][number]["adaptive"],
): AssistantPlan =>
  ({
    id: "plan-1",
    sessionId: "session-1",
    instruction: {} as AssistantPlan["instruction"],
    sourceCaptureIds: [],
    sourceNoteIds: [],
    clarifications: [],
    steps: [
      {
        id: "step-1",
        order: 1,
        title: "Safe step",
        description: "A test step",
        status: "approved",
        timing: "now",
        confidence: 1,
        prerequisites: [],
        risks: [],
        action,
        adaptive,
      },
    ],
    prerequisites: [],
    risks: [],
    timing: "now",
    confidence: 1,
    approvalState: "approved",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as AssistantPlan;

describe("allowlisted execution", () => {
  it("rejects unknown action shapes and accepts bounded actions", () => {
    expect(
      allowlistedActionSchema.safeParse({ type: "shell", command: "dir" })
        .success,
    ).toBe(false);
    expect(
      allowlistedActionSchema.safeParse({ type: "click", x: 10, y: 20 })
        .success,
    ).toBe(true);
    expect(
      allowlistedActionSchema.safeParse({ type: "wait", durationMs: 5001 })
        .success,
    ).toBe(false);
  });

  it("tracks completion and supports cancellation without shell execution", async () => {
    const execute = vi.fn(async (action) => ({
      actionType: action.type,
      success: true,
      message: "safe",
    }));
    const repository = new ExecutionStateRepository(execute, {
      mode: "memory",
    });
    const execution = repository.create(plan({ type: "screenshot" }));
    await repository.start(execution, plan({ type: "screenshot" }));
    expect(execution.status).toBe("completed");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      execution.timeline.some(
        (event) => event.message === "Execution completed",
      ),
    ).toBe(true);

    const cancelled = repository.create(
      plan({ type: "wait", durationMs: 100 }),
    );
    repository.cancel(cancelled.id);
    await repository.start(cancelled, plan({ type: "wait", durationMs: 100 }));
    expect(cancelled.status).toBe("cancelled");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("retries failed verification and records fresh evidence", async () => {
    const execute = vi.fn(async (action) => ({
      actionType: action.type,
      success: true,
      message: "safe",
    }));
    let observations = 0;
    const repository = new ExecutionStateRepository(execute, async () => {
      observations += 1;
      return {
        analysis: {
          id: `analysis-${observations}`,
          status: "completed",
          provider: "local-ocr",
          confidence: 0.9,
          ocrText:
            observations > 1
              ? [{ id: "text", text: "Done", confidence: 0.9 }]
              : [],
          detectedElements: [],
          regionsOfInterest: [],
          notes: [],
          analyzedAt: new Date().toISOString(),
        },
      };
    });
    const execution = repository.create(
      plan(
        { type: "click", x: 10, y: 20 },
        {
          verification: { kind: "text-present", text: "Done" },
          retry: { maxAttempts: 2 },
        },
      ),
    );
    await repository.start(
      execution,
      plan(
        { type: "click", x: 10, y: 20 },
        {
          verification: { kind: "text-present", text: "Done" },
          retry: { maxAttempts: 2 },
        },
      ),
    );
    expect(execution.status).toBe("completed");
    expect(execution.evidence).toHaveLength(2);
    expect(execution.timeline.some((event) => event.status === "retry")).toBe(
      true,
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("pauses when analysis is uncertain instead of inventing success", async () => {
    const repository = new ExecutionStateRepository(
      async (action) => ({
        actionType: action.type,
        success: true,
        message: "safe",
      }),
      async () => ({}),
    );
    const execution = repository.create(
      plan(
        { type: "click", x: 10, y: 20 },
        { verification: { kind: "confidence-threshold", minConfidence: 0.8 } },
      ),
    );
    await repository.start(
      execution,
      plan(
        { type: "click", x: 10, y: 20 },
        { verification: { kind: "confidence-threshold", minConfidence: 0.8 } },
      ),
    );
    expect(execution.status).toBe("awaiting_approval");
    expect(execution.pendingApproval?.reason).toContain("unavailable");
  });
});

it("does not claim device execution when the assistant adapter is unconfigured", async () => {
  const repository = new ExecutionStateRepository(undefined, { mode: "memory" });
  const approved = plan({ type: "click", x: 10, y: 20 });
  const execution = repository.create(approved);
  await repository.start(execution, approved);
  expect(execution.status).not.toBe("completed");
  expect(execution.results.some(result => result.success)).toBe(false);
});

type Step = AssistantPlan["steps"][number];
const stepOf = (id: string, action: Step["action"], adaptive?: Step["adaptive"]): Step =>
  ({ ...plan(action, adaptive).steps[0], id, title: id });
const planOf = (...steps: Step[]): AssistantPlan => ({ ...plan(), steps });
const okExecutor = () =>
  vi.fn(async (action: { type: string }) => ({ actionType: action.type, success: true, message: "done" })) as any;
const analysisWith = (text: string | null, confidence = 0.9) => ({
  analysis: {
    id: `analysis_${Math.random()}`,
    status: "completed" as const,
    provider: "local-ocr" as const,
    confidence,
    ocrText: text ? [{ id: "t", text, confidence }] : [],
    detectedElements: [],
    regionsOfInterest: [],
    notes: [],
    analyzedAt: new Date().toISOString(),
  },
});

describe("recovery paths", () => {
  it("fails verification once, retries within the bound and completes", async () => {
    const execute = okExecutor();
    const seen = ["Loading", "Saved"];
    const repo = new ExecutionStateRepository(execute, async () => analysisWith(seen.shift() ?? "Saved"));
    const p = planOf(
      stepOf("save", { type: "click", x: 40, y: 50 }, {
        verification: { kind: "text-present", text: "Saved" },
        retry: { maxAttempts: 3, backoffMs: 1 },
      }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    expect(execution.status).toBe("completed");
    const retries = execution.timeline.filter((e) => e.status === "retry");
    expect(retries.map((e) => e.message)).toEqual([expect.stringContaining("attempt 2/3")]);
    expect(execution.evidence.map((e) => e.verification.status)).toEqual(["failed", "passed"]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries, proposes the alternate, and approveAlternate swaps it in and continues", async () => {
    const execute = okExecutor();
    const repo = new ExecutionStateRepository(execute, async (step) =>
      analysisWith(step.id === "alt" ? "Saved" : "Error"),
    );
    const p = planOf(
      stepOf("primary", { type: "click", x: 10, y: 10 }, {
        verification: { kind: "text-present", text: "Saved" },
        retry: { maxAttempts: 2, alternateStepId: "alt" },
      }),
      stepOf("alt", { type: "key", key: "Enter" }, { verification: { kind: "text-present", text: "Saved" } }),
      stepOf("after", { type: "screenshot" }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    expect(execution.status).toBe("awaiting_approval");
    expect(execution.pendingApproval).toMatchObject({ stepId: "primary", alternateStepId: "alt" });
    expect(execution.timeline.filter((e) => e.status === "retry")).toHaveLength(1);
    expect(execution.timeline.some((e) => e.status === "alternate")).toBe(true);
    expect(repo.get(execution.id)?.status).toBe("awaiting_approval");
    expect(execute.mock.calls.map((c: any[]) => c[0].type)).toEqual(["click", "click"]);

    const resumed = await repo.approveAlternate(execution.id, p);
    expect(resumed?.status).toBe("completed");
    expect(resumed?.pendingApproval).toBeUndefined();
    // the alternate ran once in the primary's slot; the reserve slot was not re-run
    expect(execute.mock.calls.map((c: any[]) => c[0].type)).toEqual(["click", "click", "key", "screenshot"]);
  });

  it("runs a reserve alternate only when approved, never in the normal sequence", async () => {
    const execute = okExecutor();
    const repo = new ExecutionStateRepository(execute, async () => analysisWith("Saved"));
    const p = planOf(
      stepOf("primary", { type: "click", x: 1, y: 1 }, {
        verification: { kind: "text-present", text: "Saved" },
        retry: { maxAttempts: 1, alternateStepId: "alt" },
      }),
      stepOf("alt", { type: "key", key: "Enter" }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    expect(execution.status).toBe("completed");
    expect(execute.mock.calls.map((c: any[]) => c[0].type)).toEqual(["click"]);
  });

  it("retries exhausted without an alternate fails with the verification reason", async () => {
    const repo = new ExecutionStateRepository(okExecutor(), async () => analysisWith("Error"));
    const p = planOf(
      stepOf("only", { type: "click", x: 1, y: 1 }, {
        verification: { kind: "text-present", text: "Saved" },
        retry: { maxAttempts: 2 },
      }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    expect(execution.status).toBe("failed");
    expect(execution.error).toBeTruthy();
  });

  it("uncertain capture before a step pauses, and approvePending (retryStep true) re-runs that step", async () => {
    const execute = okExecutor();
    let observed = 0;
    const repo = new ExecutionStateRepository(execute, async () => (++observed === 1 ? {} : analysisWith("ok")));
    const p = planOf(
      stepOf("first", { type: "click", x: 5, y: 5 }, { captureBefore: true }),
      stepOf("second", { type: "screenshot" }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    expect(execution.status).toBe("awaiting_approval");
    expect(execution.pendingApproval).toMatchObject({ stepId: "first", retryStep: true });
    expect(execute).not.toHaveBeenCalled();

    const resumed = await repo.approvePending(execution.id, p);
    expect(resumed?.status).toBe("completed");
    expect(resumed?.pendingApproval).toBeUndefined();
    expect(execute.mock.calls.map((c: any[]) => c[0].type)).toEqual(["click", "screenshot"]);
  });

  it("uncertain verification after a step pauses, and approvePending (retryStep false) moves to the next step", async () => {
    const execute = okExecutor();
    const repo = new ExecutionStateRepository(execute, async () => ({}));
    const p = planOf(
      stepOf("first", { type: "click", x: 5, y: 5 }, { verification: { kind: "confidence-threshold", minConfidence: 0.8 } }),
      stepOf("second", { type: "screenshot" }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    expect(execution.status).toBe("awaiting_approval");
    expect(execution.pendingApproval).toMatchObject({ stepId: "first", retryStep: false });

    const resumed = await repo.approvePending(execution.id, p);
    expect(resumed?.status).toBe("completed");
    expect(execute.mock.calls.map((c: any[]) => c[0].type)).toEqual(["click", "screenshot"]);
  });

  it("reject ends an execution awaiting approval as failed and refuses otherwise", async () => {
    const repo = new ExecutionStateRepository(okExecutor(), async () => ({}));
    const p = planOf(
      stepOf("first", { type: "click", x: 5, y: 5 }, { verification: { kind: "confidence-threshold", minConfidence: 0.8 } }),
    );
    const execution = repo.create(p);
    await repo.start(execution, p);
    const rejected = repo.reject(execution.id, "wrong window");
    expect(rejected?.status).toBe("failed");
    expect(rejected?.error).toBe("Rejected by user: wrong window");
    expect(rejected?.pendingApproval).toBeUndefined();
    expect(repo.reject(execution.id)).toBeUndefined();
    expect(await repo.approvePending(execution.id, p)).toBeUndefined();
  });
});

describe("action timeout", () => {
  it("cancels the in-flight device action when it times out, so the run never fails while the device keeps going", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      let deviceStillRunning = false;
      const hang = vi.fn((_action: unknown, s?: AbortSignal) => {
        signal = s;
        deviceStillRunning = true;
        s?.addEventListener("abort", () => { deviceStillRunning = false; });
        return new Promise<never>(() => {});
      });
      const repo = new ExecutionStateRepository(hang as any, { mode: "memory" });
      const p = plan({ type: "click", x: 1, y: 2 });
      const execution = repo.create(p);
      const run = repo.start(execution, p);
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS - 1);
      expect(signal?.aborted).toBe(false);
      expect(deviceStillRunning).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(signal?.aborted).toBe(true);
      expect(deviceStillRunning).toBe(false);
      expect(execution.status).toBe("failed");
      expect(execution.error).toMatch(/timed out .*cancelled/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout once the action settles, leaving no pending timer", async () => {
    vi.useFakeTimers();
    try {
      const repo = new ExecutionStateRepository(okExecutor(), { mode: "memory" });
      const p = plan({ type: "screenshot" });
      const execution = repo.create(p);
      await repo.start(execution, p);
      expect(execution.status).toBe("completed");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
