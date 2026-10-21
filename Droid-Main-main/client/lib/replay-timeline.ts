/**
 * Projects a real replay run (shared/replay.ts) onto the orchestrator's
 * 7-stage visual timeline. Stages are a visual grouping of the run's own
 * event phases; nothing here claims AI verification the run did not report.
 */
import type { ReplayEvent, ReplayRun } from "@shared/replay";

export const TIMELINE_STAGE_COUNT = 7;

export type TimelineStageStatus = "idle" | "running" | "done" | "failed";

/** Which timeline stage each replay event phase belongs to (1-based). */
const STAGE_BY_PHASE: Record<ReplayEvent["phase"], number> = {
  system: 1,
  perception: 2,
  planning: 2,
  execution: 3,
  recovery: 4,
  verification: 5,
};
const COMMIT_STAGE = 6;
const FINAL_STAGE = 7;

export interface TimelineLogEntry {
  id: string;
  timestamp: string;
  stageNumber: number;
  phase: ReplayEvent["phase"];
  detail: string;
}

/** The stage the run is in now: its latest event's phase, or the final stages once terminal. */
export function currentTimelineStage(run: ReplayRun | null): number {
  if (!run) return 1;
  if (run.status === "completed") return FINAL_STAGE;
  const last = run.events[run.events.length - 1];
  return last ? STAGE_BY_PHASE[last.phase] : 1;
}

/** Status of every stage (index 0 = stage 1) derived from the run's status and current stage. */
export function timelineStageStatuses(run: ReplayRun | null): TimelineStageStatus[] {
  const statuses: TimelineStageStatus[] = Array(TIMELINE_STAGE_COUNT).fill("idle");
  if (!run) return statuses;
  if (run.status === "completed") return statuses.fill("done");
  const current = currentTimelineStage(run);
  for (let stage = 1; stage < current; stage++) statuses[stage - 1] = "done";
  const failed = run.status === "failed" || run.status === "cancelled";
  statuses[current - 1] = failed ? "failed" : run.status === "running" ? "running" : "idle";
  return statuses;
}

/** Newest-first log entries taken from the run's real events. */
export function timelineLog(run: ReplayRun | null, limit = 20): TimelineLogEntry[] {
  if (!run) return [];
  const entries = run.events.map((event) => ({
    id: event.id,
    timestamp: new Date(event.at).toLocaleTimeString(),
    stageNumber: STAGE_BY_PHASE[event.phase],
    phase: event.phase,
    detail: event.detail,
  }));
  if (run.status === "completed") {
    entries.push({
      id: `${run.id}-completed`,
      timestamp: entries[entries.length - 1]?.timestamp ?? "",
      stageNumber: COMMIT_STAGE,
      phase: "system",
      detail: `Run completed: ${run.completed}/${run.total} actions`,
    });
  }
  return entries.reverse().slice(0, limit);
}
