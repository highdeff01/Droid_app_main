/**
 * Workflow status as reported by /api/assistant/execution: a display summary of
 * one execution and the actions that drive its recovery paths. Every value here
 * comes from a server response; nothing is inferred or flipped locally.
 */
import type { AssistantExecution } from "@shared/assistant";
import { observeScreen, type GoalAssessment } from "@shared/goal-loop";
import { postGateJson, type GatePost } from "@/lib/action-gate";

export interface RetryAttempt {
  stepId?: string;
  attempt: number;
  max: number;
  message: string;
}

export interface WorkflowStatusSummary {
  id: string;
  status: AssistantExecution["status"];
  currentStep: number;
  totalSteps: number;
  retries: RetryAttempt[];
  /** Retries exhausted: the server proposes this alternate step for approval. */
  alternate?: { stepId: string; alternateStepId: string; reason: string };
  /** Uncertain verification: the server waits for approval to continue. */
  approval?: { stepId: string; reason: string; retryStep: boolean };
  /** The terminal verdict with its reason; absent while the run is still going. */
  verdict?: { outcome: "completed" | "failed" | "cancelled"; reason: string };
}

const ATTEMPT_PATTERN = /\(attempt (\d+)\/(\d+)\)/;
const TERMINAL = ["completed", "failed", "cancelled"] as const;
type Terminal = (typeof TERMINAL)[number];

/** Retry events from the timeline, with the attempt counts the server wrote into them. */
export function retryAttempts(execution: AssistantExecution): RetryAttempt[] {
  return execution.timeline.flatMap((event) => {
    if (event.status !== "retry") return [];
    const match = ATTEMPT_PATTERN.exec(event.message);
    if (!match) return [];
    return [{ stepId: event.stepId, attempt: Number(match[1]), max: Number(match[2]), message: event.message }];
  });
}

function terminalVerdict(execution: AssistantExecution): WorkflowStatusSummary["verdict"] {
  const outcome = execution.status as Terminal;
  if (!TERMINAL.includes(outcome)) return undefined;
  const last = execution.timeline[execution.timeline.length - 1];
  const reason = outcome === "failed" ? execution.error ?? last?.message ?? "Execution failed" : last?.message ?? `Execution ${outcome}`;
  return { outcome, reason };
}

export function summarizeExecution(execution: AssistantExecution): WorkflowStatusSummary {
  const pending = execution.pendingApproval;
  return {
    id: execution.id,
    status: execution.status,
    currentStep: Math.min(execution.currentStep, execution.totalSteps),
    totalSteps: execution.totalSteps,
    retries: retryAttempts(execution),
    alternate: pending?.alternateStepId
      ? { stepId: pending.stepId, alternateStepId: pending.alternateStepId, reason: pending.reason }
      : undefined,
    approval:
      pending && !pending.alternateStepId
        ? { stepId: pending.stepId, reason: pending.reason, retryStep: pending.retryStep === true }
        : undefined,
    verdict: terminalVerdict(execution),
  };
}

export type ExecutionFetch = (url: string, init?: RequestInit) => Promise<Response>;

async function requestJson<T>(fetcher: ExecutionFetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${url} failed (${response.status})`);
  return body;
}

const executionUrl = (id: string, action?: string) =>
  `/api/assistant/execution/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

async function postAction(id: string, action: string, body: unknown, fetcher: ExecutionFetch) {
  const data = await requestJson<{ execution: AssistantExecution }>(fetcher, executionUrl(id, action), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.execution;
}

/** Continues after an uncertain verification (the server retries or advances the step). */
export const approvePendingExecution = (id: string, fetcher: ExecutionFetch = fetch) =>
  postAction(id, "approve", { confirmation: true }, fetcher);

/** Swaps the proposed alternate step into the failed step's slot and resumes. */
export const approveAlternateExecution = (id: string, fetcher: ExecutionFetch = fetch) =>
  postAction(id, "approve-alternate", { confirmation: true }, fetcher);

/** Declines the pending approval; the server ends the run as failed. */
export const rejectExecution = (id: string, reason?: string, fetcher: ExecutionFetch = fetch) =>
  postAction(id, "reject", { confirmation: true, ...(reason ? { reason } : {}) }, fetcher);

export async function fetchExecution(id: string, fetcher: ExecutionFetch = fetch) {
  return (await requestJson<{ execution: AssistantExecution }>(fetcher, executionUrl(id))).execution;
}

export async function listExecutions(fetcher: ExecutionFetch = fetch) {
  return (await requestJson<{ executions: AssistantExecution[] }>(fetcher, "/api/assistant/execution")).executions;
}

/** The execution the HUD shows: one awaiting approval first, else the most recently started. */
export function focusExecution(executions: AssistantExecution[]): AssistantExecution | undefined {
  const waiting = executions.find((e) => e.status === "awaiting_approval");
  if (waiting) return waiting;
  return [...executions].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))[0];
}

export interface AssessDevice {
  targetDevice: "desktop" | "android";
  deviceId?: string;
  apiKey?: string;
}

/**
 * The real completion verdict for a goal: a fresh capture, analyzed by perception
 * and OCR, assessed by /api/goal-workflows/assess. Any failed stage rejects; no
 * verdict is ever made up here.
 */
export async function assessGoalOnScreen(
  goal: string,
  device: AssessDevice,
  signal: AbortSignal,
  post: GatePost = postGateJson,
): Promise<GoalAssessment> {
  const options = { apiKey: device.apiKey, signal };
  const shot = await post("/api/replay/capture", { targetDevice: device.targetDevice, deviceId: device.deviceId }, options);
  const frame: string | undefined = shot.frame?.image;
  if (!frame) throw new Error("Screen capture returned no frame");
  const analysis = await post("/api/ai/describe-screen", { imageData: frame }, options);
  if (!analysis.report) throw new Error("Screen analysis returned no report");
  const ocr = await post("/api/goal-workflows/ocr", { imageData: frame }, options).catch(() => ({ lines: [] }));
  const observation = observeScreen(analysis.report, Array.isArray(ocr.lines) ? ocr.lines : [], shot.frame?.hash);
  const data = await post("/api/goal-workflows/assess", { goal, observation, screenshot: frame }, options);
  if (typeof data.assessment?.complete !== "boolean") throw new Error("Goal assessment returned no verdict");
  return data.assessment as GoalAssessment;
}
