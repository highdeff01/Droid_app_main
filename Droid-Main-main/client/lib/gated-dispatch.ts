import {
  runActionGate,
  postGateJson,
  type GatePost,
  type GateTarget,
} from "@/lib/action-gate";

/** Same ceiling as the Dashboard gate: a check can never hang the UI. */
export const GATE_TIMEOUT_MS = 45_000;

/** One device action: the gate verifies `target`, then `dispatch` runs it. */
export interface GatedAction {
  target: GateTarget;
  dispatch: () => unknown;
  /** Pause after this action before the next one is gated. */
  delayMs?: number;
}

export interface GatedRunOptions {
  targetDevice: string;
  deviceId?: string;
  apiKey?: string;
  signal: AbortSignal;
  post?: GatePost;
  timeoutMs?: number;
}

export type GatedRunResult =
  | { status: "completed"; results: unknown[] }
  | { status: "blocked" | "cancelled"; reason: string; results: unknown[] };

const CANCELLED = "Action cancelled before dispatch";

/** Why a gated run dispatched nothing (or not everything); null when it completed. */
export function gateFailure(result: GatedRunResult | undefined): string | null {
  if (!result) return "another action is already being verified or running";
  return result.status === "completed" ? null : result.reason;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

/** Gate one action; undefined when verified, else the failed result. */
async function gateOne(
  action: GatedAction,
  options: GatedRunOptions,
  results: unknown[],
): Promise<GatedRunResult | undefined> {
  const { signal, post = postGateJson, timeoutMs = GATE_TIMEOUT_MS } = options;
  const gate = await runActionGate(
    {
      targetDevice: options.targetDevice,
      deviceId: options.deviceId,
      apiKey: options.apiKey,
      target: action.target,
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    },
    post,
  );
  if (signal.aborted) return { status: "cancelled", reason: CANCELLED, results };
  if (gate.status === "verified") return undefined;
  const reason =
    gate.status === "cancelled"
      ? `Screen analysis timed out (${Math.round(timeoutMs / 1000)}s); action not dispatched`
      : gate.reason;
  return { status: "blocked", reason, results };
}

/** POST a device action as JSON (the endpoints the components already use) and return the parsed body. */
export async function postDeviceAction(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ success: response.ok }));
}

/**
 * Run actions in order, re-running the gate before every one.
 * Stops at the first failed check or abort; nothing unverified is dispatched.
 */
export async function runGatedSequence(
  actions: GatedAction[],
  options: GatedRunOptions,
): Promise<GatedRunResult> {
  const results: unknown[] = [];
  for (const action of actions) {
    const failed = await gateOne(action, options, results);
    if (failed) return failed;
    results.push(await action.dispatch());
    await abortableDelay(action.delayMs ?? 0, options.signal);
    if (options.signal.aborted) {
      return { status: "cancelled", reason: CANCELLED, results };
    }
  }
  return { status: "completed", results };
}
