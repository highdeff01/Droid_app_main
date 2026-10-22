import type {
  OperationCaps,
  OperationConflict,
  OperationStepReport,
  ScreenRegion,
  SupervisedOperation,
} from "../../shared/overseer";

/** Orchestrator safety caps applied when an operation declares none. */
export const DEFAULT_CAPS: OperationCaps = {
  maxIterations: 50,
  maxDurationMs: 15 * 60_000,
  maxRepeats: 3,
};

export interface CapViolation {
  cap: keyof OperationCaps;
  reason: string;
}

/** The non-repetition ledger key for one step: what was done, where, with what text. */
export function actionSignature(step: Pick<OperationStepReport, "action" | "x" | "y" | "text">): string {
  const where = step.x === undefined || step.y === undefined ? "-" : `${Math.round(step.x)},${Math.round(step.y)}`;
  return `${step.action}@${where}:${step.text ?? ""}`;
}

/** Returns the first cap the operation has exceeded, or null while it is within every cap. */
export function findCapViolation(op: SupervisedOperation, now: number): CapViolation | null {
  const { maxIterations, maxDurationMs, maxRepeats } = op.caps;
  if (maxIterations !== null && op.iterations > maxIterations)
    return { cap: "maxIterations", reason: `Exceeded ${maxIterations} iterations (${op.iterations}).` };
  if (maxDurationMs !== null && now - op.startedAt > maxDurationMs)
    return { cap: "maxDurationMs", reason: `Exceeded ${Math.round(maxDurationMs / 1000)}s run time.` };
  if (maxRepeats !== null) {
    const repeated = Object.entries(op.ledger).find(([, count]) => count > maxRepeats);
    if (repeated)
      return { cap: "maxRepeats", reason: `Repeated "${repeated[0]}" ${repeated[1]} times (limit ${maxRepeats}).` };
  }
  return null;
}

/** Overlap of two regions, or null when they do not intersect. */
export function intersectRegions(a: ScreenRegion, b: ScreenRegion): ScreenRegion | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Every pair of running operations whose screen regions overlap. */
export function detectConflicts(operations: SupervisedOperation[]): OperationConflict[] {
  const running = operations.filter((op) => op.status === "running" && op.region);
  const conflicts: OperationConflict[] = [];
  for (let i = 0; i < running.length; i++) {
    for (let j = i + 1; j < running.length; j++) {
      const region = intersectRegions(running[i].region!, running[j].region!);
      if (region) conflicts.push({ operationIds: [running[i].id, running[j].id], region });
    }
  }
  return conflicts;
}

/** Of two conflicting operations, the one that should yield: lower priority, then the later starter. */
export function conflictLoser(a: SupervisedOperation, b: SupervisedOperation): SupervisedOperation {
  if (a.priority !== b.priority) return a.priority < b.priority ? a : b;
  return a.startedAt > b.startedAt ? a : b;
}
