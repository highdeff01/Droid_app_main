/**
 * Thin client for the real automation stack used by the /automation page:
 * screen capture, AI step generation, AI step review, the replay engine and
 * the pyautogui emergency stop. Every call throws on a non-success reply so
 * callers surface the failure instead of continuing with stale data.
 */
import type { SequenceStep } from "@/components/live-screen-hud";
import type { AIReviewResult } from "@/components/ai-workflow-review-modal";
import { assertStepsInScope } from "@/lib/ai-scope";

export type ReplayStatus =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface ReplayRunSnapshot {
  id: string;
  status: ReplayStatus;
  currentStep: number;
  error?: string;
  steps: { id: string; status: string }[];
}

export const TERMINAL_REPLAY_STATUSES: ReplayStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

async function requestJson<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${url} returned ${response.status} without JSON`);
  }
  const data = await response.json();
  if (!response.ok || data.success !== true) {
    throw new Error(data.error || data.message || `${url} failed (${response.status})`);
  }
  return data as T;
}

export async function captureScreenFrame(signal?: AbortSignal): Promise<string> {
  const data = await requestJson<{ imageData?: string }>(
    "/api/capture-screen",
    undefined,
    signal,
  );
  if (!data.imageData) throw new Error("/api/capture-screen returned no frame");
  return data.imageData;
}

function toSequenceStep(raw: any, index: number): SequenceStep {
  return {
    ...raw,
    id: raw.id || crypto.randomUUID(),
    stepNumber: index + 1,
    name: raw.name || raw.title || raw.description || `Step ${index + 1}`,
    action: raw.action || "click",
    x: Number(raw.x ?? raw.targetPosition?.x ?? 0),
    y: Number(raw.y ?? raw.targetPosition?.y ?? 0),
    delayMs: Number(raw.delayMs ?? 500),
    text: raw.text ?? raw.textPayload,
    keyPayload: raw.keyPayload ?? raw.key,
    status: "pending",
  };
}

export async function generateAutomationSteps(
  objective: string,
  screenshot: string,
  signal?: AbortSignal,
): Promise<SequenceStep[]> {
  const data = await requestJson<{ steps?: any[] }>(
    "/api/dual-ai/pipeline",
    { screenshot, goalPrompt: objective, autoExecute: false },
    signal,
  );
  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (!steps.length) throw new Error("AI returned no steps for this objective");
  return steps.map(toSequenceStep);
}

export async function reviewAutomationSteps(
  steps: SequenceStep[],
  screenshotUrl: string,
  userObjective: string,
  signal?: AbortSignal,
): Promise<AIReviewResult> {
  return requestJson<AIReviewResult & { success: true }>(
    "/api/ai/review-steps",
    { steps, screenshotUrl, userObjective },
    signal,
  );
}

export async function startReplay(
  steps: SequenceStep[],
  signal?: AbortSignal,
): Promise<ReplayRunSnapshot> {
  assertStepsInScope(steps, "desktop");
  const data = await requestJson<{ run: ReplayRunSnapshot }>(
    "/api/replay",
    { targetDevice: "desktop", steps, iterations: 1, confirmation: true },
    signal,
  );
  return data.run;
}

export async function fetchReplay(
  id: string,
  signal?: AbortSignal,
): Promise<ReplayRunSnapshot> {
  const data = await requestJson<{ run: ReplayRunSnapshot }>(
    `/api/replay/${encodeURIComponent(id)}`,
    undefined,
    signal,
  );
  return data.run;
}

/** Cancels the replay run and halts the pyautogui bridge; reports each failure. */
export async function stopAutomationRun(replayId: string | null): Promise<string[]> {
  const calls: Promise<unknown>[] = [requestJson("/api/pyautogui/stop", {})];
  if (replayId) {
    calls.unshift(requestJson(`/api/replay/${encodeURIComponent(replayId)}/cancel`, {}));
  }
  const results = await Promise.allSettled(calls);
  return results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
}
