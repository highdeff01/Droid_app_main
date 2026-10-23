import { describe, expect, it, vi } from "vitest";
import type { AssistantExecution, ExecutionTimelineEvent } from "@shared/assistant";
import {
  approveAlternateExecution,
  approvePendingExecution,
  assessGoalOnScreen,
  fetchExecution,
  focusExecution,
  listExecutions,
  rejectExecution,
  summarizeExecution,
  type ExecutionFetch,
} from "./workflow-status";

/** An AssistantExecution fixture with every required field filled; override any of them. */
function makeExecution(overrides: Partial<AssistantExecution> = {}): AssistantExecution {
  return {
    id: "exec-1",
    planId: "plan-1",
    sessionId: "session-1",
    status: "running",
    currentStep: 0,
    totalSteps: 3,
    timeline: [],
    results: [],
    evidence: [],
    ...overrides,
  };
}

function retryEvent(overrides: Partial<ExecutionTimelineEvent> = {}): ExecutionTimelineEvent {
  return {
    id: "evt-1",
    timestamp: "2024-01-01T00:00:00.000Z",
    status: "retry",
    message: "Verification failed; retrying step 1 (attempt 2/3).",
    stepId: "step-1",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("summarizeExecution retries", () => {
  it("parses the attempt counts out of a retry event's message", () => {
    const execution = makeExecution({ timeline: [retryEvent()] });

    expect(summarizeExecution(execution).retries).toEqual([
      { stepId: "step-1", attempt: 2, max: 3, message: "Verification failed; retrying step 1 (attempt 2/3)." },
    ]);
  });

  it("ignores non-retry events and retry events without the attempt pattern", () => {
    const execution = makeExecution({
      timeline: [
        { id: "e1", timestamp: "t", status: "info", message: "attempt 2/3" },
        { id: "e2", timestamp: "t", status: "retry", message: "retrying without a count" },
      ],
    });

    expect(summarizeExecution(execution).retries).toEqual([]);
  });
});

describe("summarizeExecution pending decision", () => {
  it("sets alternate, not approval, when pendingApproval carries an alternateStepId", () => {
    const execution = makeExecution({
      pendingApproval: { stepId: "step-2", reason: "Retries exhausted", alternateStepId: "step-2b" },
    });

    const summary = summarizeExecution(execution);

    expect(summary.alternate).toEqual({ stepId: "step-2", alternateStepId: "step-2b", reason: "Retries exhausted" });
    expect(summary.approval).toBeUndefined();
  });

  it("sets approval, not alternate, when pendingApproval has no alternateStepId", () => {
    const execution = makeExecution({
      pendingApproval: { stepId: "step-2", reason: "Uncertain verification", retryStep: true },
    });

    const summary = summarizeExecution(execution);

    expect(summary.approval).toEqual({ stepId: "step-2", reason: "Uncertain verification", retryStep: true });
    expect(summary.alternate).toBeUndefined();
  });

  it("defaults approval.retryStep to false when the server omits it", () => {
    const execution = makeExecution({ pendingApproval: { stepId: "step-2", reason: "Uncertain" } });

    expect(summarizeExecution(execution).approval?.retryStep).toBe(false);
  });
});

describe("summarizeExecution currentStep", () => {
  it("clamps currentStep to totalSteps", () => {
    const execution = makeExecution({ currentStep: 5, totalSteps: 3 });

    expect(summarizeExecution(execution).currentStep).toBe(3);
  });
});

describe("summarizeExecution verdict", () => {
  it("has no verdict while the run is still going", () => {
    for (const status of ["running", "awaiting_approval", "paused"] as const) {
      expect(summarizeExecution(makeExecution({ status })).verdict).toBeUndefined();
    }
  });

  it("uses execution.error for a failed verdict, falling back to the last timeline message", () => {
    const withError = makeExecution({
      status: "failed",
      error: "Boom",
      timeline: [{ id: "e", timestamp: "t", status: "failed", message: "Step failed" }],
    });
    expect(summarizeExecution(withError).verdict).toEqual({ outcome: "failed", reason: "Boom" });

    const withoutError = makeExecution({
      status: "failed",
      timeline: [{ id: "e", timestamp: "t", status: "failed", message: "Step failed" }],
    });
    expect(summarizeExecution(withoutError).verdict).toEqual({ outcome: "failed", reason: "Step failed" });
  });

  it("uses the last timeline message for completed and cancelled verdicts", () => {
    const completed = makeExecution({
      status: "completed",
      timeline: [{ id: "e", timestamp: "t", status: "completed", message: "All steps verified" }],
    });
    expect(summarizeExecution(completed).verdict).toEqual({ outcome: "completed", reason: "All steps verified" });

    const cancelled = makeExecution({
      status: "cancelled",
      timeline: [{ id: "e", timestamp: "t", status: "completed", message: "User cancelled" }],
    });
    expect(summarizeExecution(cancelled).verdict).toEqual({ outcome: "cancelled", reason: "User cancelled" });
  });
});

describe("approvePendingExecution", () => {
  it("POSTs confirmation to the approve endpoint and returns the execution", async () => {
    const execution = makeExecution();
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ execution }));

    const result = await approvePendingExecution("exec-1", fetcher);

    const [url, init] = (fetcher as any).mock.calls[0];
    expect(url).toBe("/api/assistant/execution/exec-1/approve");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ confirmation: true });
    expect(result).toEqual(execution);
  });

  it("rejects with the server's error message on a non-ok response", async () => {
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ error: "Execution not found" }, 404));

    await expect(approvePendingExecution("exec-1", fetcher)).rejects.toThrow("Execution not found");
  });
});

describe("approveAlternateExecution", () => {
  it("POSTs confirmation to the approve-alternate endpoint and returns the execution", async () => {
    const execution = makeExecution();
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ execution }));

    const result = await approveAlternateExecution("exec-1", fetcher);

    const [url, init] = (fetcher as any).mock.calls[0];
    expect(url).toBe("/api/assistant/execution/exec-1/approve-alternate");
    expect(JSON.parse(init.body)).toEqual({ confirmation: true });
    expect(result).toEqual(execution);
  });

  it("rejects with the server's error message on a non-ok response", async () => {
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ error: "No alternate proposed" }, 409));

    await expect(approveAlternateExecution("exec-1", fetcher)).rejects.toThrow("No alternate proposed");
  });
});

describe("rejectExecution", () => {
  it("POSTs confirmation without a reason when none is given", async () => {
    const execution = makeExecution();
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ execution }));

    await rejectExecution("exec-1", undefined, fetcher);

    const [url, init] = (fetcher as any).mock.calls[0];
    expect(url).toBe("/api/assistant/execution/exec-1/reject");
    expect(JSON.parse(init.body)).toEqual({ confirmation: true });
  });

  it("adds the reason to the body when one is given", async () => {
    const execution = makeExecution();
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ execution }));

    await rejectExecution("exec-1", "User declined", fetcher);

    const [, init] = (fetcher as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ confirmation: true, reason: "User declined" });
  });

  it("rejects with the server's error message on a non-ok response", async () => {
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ error: "Already finished" }, 400));

    await expect(rejectExecution("exec-1", undefined, fetcher)).rejects.toThrow("Already finished");
  });
});

describe("listExecutions", () => {
  it("GETs the execution list and returns body.executions", async () => {
    const executions = [makeExecution({ id: "e1" }), makeExecution({ id: "e2" })];
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ executions }));

    const result = await listExecutions(fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/assistant/execution", expect.any(Object));
    expect(result).toEqual(executions);
  });
});

describe("fetchExecution", () => {
  it("GETs a single execution by id", async () => {
    const execution = makeExecution({ id: "e1" });
    const fetcher: ExecutionFetch = vi.fn(async () => jsonResponse({ execution }));

    const result = await fetchExecution("e1", fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/assistant/execution/e1", expect.any(Object));
    expect(result).toEqual(execution);
  });
});

describe("focusExecution", () => {
  it("returns undefined for an empty list", () => {
    expect(focusExecution([])).toBeUndefined();
  });

  it("picks an awaiting_approval execution over a more recently started one", () => {
    const waiting = makeExecution({ id: "waiting", status: "awaiting_approval", startedAt: "2024-01-01T00:00:00.000Z" });
    const newer = makeExecution({ id: "newer", status: "running", startedAt: "2024-01-02T00:00:00.000Z" });

    expect(focusExecution([newer, waiting])).toBe(waiting);
  });

  it("picks the execution with the greatest startedAt when none await approval", () => {
    const older = makeExecution({ id: "older", startedAt: "2024-01-01T00:00:00.000Z" });
    const newer = makeExecution({ id: "newer", startedAt: "2024-01-02T00:00:00.000Z" });

    expect(focusExecution([older, newer])).toBe(newer);
  });
});

function makeAssessResponses(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    "/api/replay/capture": { frame: { image: "data:image/png;base64,AAAA", hash: "hash-1" } },
    "/api/ai/describe-screen": { report: { elements: [], description: "Login page", confidence: 0.9 } },
    "/api/goal-workflows/ocr": { lines: ["Welcome"] },
    "/api/goal-workflows/assess": { assessment: { complete: true, onTrack: true, reason: "Inbox shows 0 unread" } },
    ...overrides,
  };
}

describe("assessGoalOnScreen", () => {
  it("returns the real verdict from the capture → describe → ocr → assess chain", async () => {
    const responses = makeAssessResponses();
    const post = vi.fn(async (url: string) => responses[url]);

    const assessment = await assessGoalOnScreen("Read inbox", { targetDevice: "desktop" }, new AbortController().signal, post);

    expect(assessment).toEqual(responses["/api/goal-workflows/assess"].assessment);
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      "/api/replay/capture",
      "/api/ai/describe-screen",
      "/api/goal-workflows/ocr",
      "/api/goal-workflows/assess",
    ]);
  });

  it("rejects when the capture has no frame image", async () => {
    const responses = makeAssessResponses({ "/api/replay/capture": { frame: {} } });
    const post = vi.fn(async (url: string) => responses[url]);

    await expect(
      assessGoalOnScreen("Read inbox", { targetDevice: "desktop" }, new AbortController().signal, post),
    ).rejects.toThrow("Screen capture returned no frame");
  });

  it("rejects when screen analysis returns no report", async () => {
    const responses = makeAssessResponses({ "/api/ai/describe-screen": {} });
    const post = vi.fn(async (url: string) => responses[url]);

    await expect(
      assessGoalOnScreen("Read inbox", { targetDevice: "desktop" }, new AbortController().signal, post),
    ).rejects.toThrow("Screen analysis returned no report");
  });

  it("tolerates an OCR failure, proceeding with empty lines", async () => {
    const responses = makeAssessResponses();
    const post = vi.fn(async (url: string) => {
      if (url === "/api/goal-workflows/ocr") throw new Error("ocr down");
      return responses[url];
    });

    const assessment = await assessGoalOnScreen("Read inbox", { targetDevice: "desktop" }, new AbortController().signal, post);

    expect(assessment.complete).toBe(true);
  });

  it("rejects when the assess call itself rejects", async () => {
    const responses = makeAssessResponses();
    const post = vi.fn(async (url: string) => {
      if (url === "/api/goal-workflows/assess") throw new Error("assess failed");
      return responses[url];
    });

    await expect(
      assessGoalOnScreen("Read inbox", { targetDevice: "desktop" }, new AbortController().signal, post),
    ).rejects.toThrow("assess failed");
  });

  it("rejects when assess returns no boolean verdict, never fabricating one", async () => {
    const responses = makeAssessResponses({ "/api/goal-workflows/assess": { assessment: { reason: "unclear" } } });
    const post = vi.fn(async (url: string) => responses[url]);

    await expect(
      assessGoalOnScreen("Read inbox", { targetDevice: "desktop" }, new AbortController().signal, post),
    ).rejects.toThrow("Goal assessment returned no verdict");
  });
});
