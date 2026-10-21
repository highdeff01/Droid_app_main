/**
 * The HUD operation graph: every AI-driven HUD operation is one node, and the
 * forwarding between buttons is this table, not ad-hoc calls in each handler.
 *
 *   think → plan → apply_plan → simulate → start → check_completion → save_best → done
 *   start/continue  failed     → retry      (re-inspect: fresh capture + OCR)
 *   retry           exhausted  → error_fix  (Qwen proposes a fix; runs after approval)
 *   start/continue  blocked    → error_fix  (the gate already re-inspected; replan)
 *   check_completion incomplete → continue   (next planned step)
 *   check_completion needs_replan → think   (new turn, same goal, accumulated context)
 *
 * Any operation in FRESH_FRAME_OPS forwards to `capture` first when the turn
 * holds no frame newer than the last plan change or dispatch.
 */

export const OPERATIONS = [
  "capture",
  "think",
  "plan",
  "apply_plan",
  "simulate",
  "start",
  "continue",
  "retry",
  "error_fix",
  "check_completion",
  "save_best",
  "answer",
] as const;
export type Operation = (typeof OPERATIONS)[number];

export type OperationOutcome =
  | "ok"
  | "verified"
  | "plan_done"
  | "failed"
  | "blocked"
  | "off_track"
  | "exhausted"
  | "declined"
  | "complete"
  | "incomplete"
  | "needs_replan";

/** Where a chain ends: the run finished (done) or stopped with its reason (failed). */
export type ChainEnd = "done" | "failed";

const STEP_EXECUTION: Partial<Record<OperationOutcome, Operation | ChainEnd>> = {
  verified: "check_completion",
  plan_done: "check_completion",
  failed: "retry",
  blocked: "error_fix",
  off_track: "error_fix",
};

/** The forwarding rules. `capture` returns to the operation that needed the frame. */
export const FORWARD: Record<Operation, Partial<Record<OperationOutcome, Operation | ChainEnd>>> = {
  capture: {},
  answer: { ok: "done" },
  think: { ok: "plan" },
  plan: { ok: "apply_plan", declined: "failed" },
  apply_plan: { ok: "simulate" },
  simulate: { ok: "start", blocked: "error_fix" },
  start: STEP_EXECUTION,
  continue: STEP_EXECUTION,
  retry: { ok: "continue", exhausted: "error_fix" },
  error_fix: { ok: "apply_plan", declined: "failed" },
  check_completion: {
    complete: "save_best",
    incomplete: "continue",
    off_track: "error_fix",
    needs_replan: "think",
  },
  save_best: { ok: "done" },
};

/** Operations that act on the current screen: a fresh capture is forwarded first when none is held. */
export const FRESH_FRAME_OPS: ReadonlySet<Operation> = new Set<Operation>([
  "think",
  "answer",
  "simulate",
  "start",
  "continue",
  "retry",
  "error_fix",
  "check_completion",
]);

/**
 * Operations after which the held frame must not be reused: a changed plan is
 * verified against a new screenshot, and a retry always re-inspects the screen.
 */
export const STALE_FRAME_OPS: ReadonlySet<Operation> = new Set<Operation>(["apply_plan", "retry"]);

/** The operation an outcome forwards to; an outcome without a rule is a programming error. */
export function nextOperation(op: Operation, outcome: OperationOutcome): Operation | ChainEnd {
  const next = FORWARD[op][outcome];
  if (!next) throw new Error(`No forwarding rule for ${op} → ${outcome}`);
  return next;
}

export const OPERATION_LABEL: Record<Operation, string> = {
  capture: "capturing",
  think: "thinking",
  plan: "planning",
  apply_plan: "updating plan",
  simulate: "verifying (dry run)",
  start: "starting",
  continue: "continuing",
  retry: "retrying",
  error_fix: "proposing fix",
  check_completion: "checking completion",
  save_best: "saving as best",
  answer: "asking Qwen",
};

export interface ChainLink {
  op: Operation;
  /** e.g. "step 3"; appended to the label. */
  detail?: string;
}

/** Links kept in the HUD readout. */
export const CHAIN_DISPLAY_LINKS = 6;

/** The forwarding the user sees: "verifying (dry run) → retrying step 3 → proposing fix". */
export function formatChain(links: ChainLink[], max = CHAIN_DISPLAY_LINKS): string {
  const shown = links.slice(-max).map((l) => (l.detail ? `${OPERATION_LABEL[l.op]} ${l.detail}` : OPERATION_LABEL[l.op]));
  return links.length > max ? `… → ${shown.join(" → ")}` : shown.join(" → ");
}
