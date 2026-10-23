import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantExecution } from "@shared/assistant";
import { SchedulingWorker, retryBackoffMs, type ScheduledRunner } from "./scheduling-worker";

const execution = (status: AssistantExecution["status"], error?: string) =>
  ({ id: "e", planId: "p", sessionId: "s", status, error, currentStep: 0, totalSteps: 1, timeline: [], results: [], evidence: [] }) as AssistantExecution;

describe("SchedulingWorker retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  function setup(runner: ScheduledRunner) {
    const events: Array<{ type: string; payload: any }> = [];
    const worker = new SchedulingWorker(runner, (_s, type, payload) => events.push({ type, payload }), false);
    const taskId = worker.scheduleWorkflow("wf", "session", new Date().toISOString());
    return { worker, taskId, events };
  }

  async function runAt(worker: SchedulingWorker, ms: number) {
    vi.setSystemTime(new Date(Date.now() + ms));
    await worker.processScheduledTasks();
  }

  it("backs off 2 then 4 minutes and reports failure with the real error after the third attempt", async () => {
    const runner = vi.fn(async () => execution("failed", "Submit not found"));
    const { worker, taskId, events } = setup(runner);
    const t0 = Date.now();
    await worker.processScheduledTasks();
    expect(worker.getTaskStatus(taskId)?.status).toBe("pending");
    expect(Date.parse(worker.getTaskStatus(taskId)!.scheduledTime) - t0).toBe(2 * 60000);

    await runAt(worker, 60000); // not due yet
    expect(runner).toHaveBeenCalledTimes(1);

    await runAt(worker, 60000);
    const t2 = Date.now();
    expect(Date.parse(worker.getTaskStatus(taskId)!.scheduledTime) - t2).toBe(4 * 60000);
    await runAt(worker, 4 * 60000);

    expect(runner).toHaveBeenCalledTimes(3);
    expect(worker.getTaskStatus(taskId)?.status).toBe("failed");
    const retries = events.filter((e) => e.type === "workflow.retry_scheduled");
    expect(retries.map((e) => e.payload.retryCount)).toEqual([1, 2]);
    expect(retries[0].payload.error).toBe("Submit not found");
    const failed = events.filter((e) => e.type === "workflow.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].payload).toMatchObject({ taskId, retryCount: 3, error: "Submit not found" });
    expect(events.some((e) => e.type === "workflow.completed")).toBe(false);
  });

  it("completes on a retry after a thrown failure without reporting failure", async () => {
    const runner = vi
      .fn<ScheduledRunner>()
      .mockRejectedValueOnce(new Error("No execution plan found"))
      .mockResolvedValueOnce(execution("completed"));
    const { worker, taskId, events } = setup(runner);
    await worker.processScheduledTasks();
    await runAt(worker, retryBackoffMs(1));
    expect(worker.getTaskStatus(taskId)?.status).toBe("completed");
    expect(events.map((e) => e.type)).toEqual([
      "workflow.scheduled",
      "workflow.started",
      "workflow.retry_scheduled",
      "workflow.started",
      "workflow.completed",
    ]);
  });

  it("treats a run left awaiting approval as not completed", async () => {
    const { worker, taskId, events } = setup(async () => execution("awaiting_approval"));
    await worker.processScheduledTasks();
    expect(worker.getTaskStatus(taskId)?.status).toBe("pending");
    expect(events.find((e) => e.type === "workflow.retry_scheduled")?.payload.error).toBe("Execution ended awaiting_approval");
  });
});
