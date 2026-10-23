import type { ReplayRun } from "@shared/replay";
import type { GlobalAICursorState } from "@/components/global-ai-cursor-overlay";

export interface CursorStepLike {
  id: string;
  name?: string;
  action: string;
  x: number;
  y: number;
  targetOcrLabel?: string;
}

const CURSOR_ACTION: Record<string, GlobalAICursorState["action"]> = {
  click: "clicking",
  double_click: "double_clicking",
  right_click: "right_clicking",
  clear_and_type: "typing",
  type_text: "typing",
  scroll: "dragging",
};

/**
 * The AI cursor for a replay run: the step the engine is dispatching now, at its
 * coordinates; null once the run is no longer running/paused or the step is unknown.
 */
export function replayCursorState(
  run: Pick<ReplayRun, "status" | "currentStep" | "steps">,
  sequence: CursorStepLike[],
): GlobalAICursorState | null {
  if (run.status !== "running" && run.status !== "paused") return null;
  const id = run.steps[run.currentStep]?.id;
  const step = id ? sequence.find((s) => s.id === id) : undefined;
  if (!step) return null;
  return {
    x: step.x,
    y: step.y,
    action: CURSOR_ACTION[step.action] ?? "moving",
    targetLabel: step.targetOcrLabel || step.name,
    isActing: run.status === "running",
  };
}
