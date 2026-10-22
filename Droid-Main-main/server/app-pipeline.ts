import type { CompanionErrorEvent, CompanionNote } from "@shared/companion";
import type { ProgressKind, ProgressLevel } from "@shared/progress";
import type { SupervisedOperation } from "@shared/overseer";
import { ActivityNotes } from "./activity-notes";
import type { CompanionService } from "./companion-service";
import type { CompanionImportantEvent } from "./companion-events";
import { companionEvents } from "./companion-events";
import type { OverseerSupervisor, SupervisorEvent } from "./overseer/supervisor";
import { PresentationDrafts } from "./presentation-drafts";
import type { ProgressStream } from "./progress-stream";

const KIND_OF: Partial<Record<SupervisedOperation["kind"], ProgressKind>> = {
  goal_run: "goal",
  trigger_action: "trigger",
};

const LEVEL_OF: Record<string, ProgressLevel> = {
  completed: "success",
  failed: "error",
  cancelled: "warning",
};

const progressKind = (op: SupervisedOperation): ProgressKind => KIND_OF[op.kind] ?? "run";

/** One progress event per supervisor event; verdicts carry the overseer's evidence frame. */
function publishOperation(stream: ProgressStream, event: SupervisorEvent) {
  const { op } = event;
  const base = { kind: progressKind(op), operationId: op.id, status: op.status };
  if (event.type === "started")
    return stream.publish({ ...base, title: `Started ${op.kind}`, detail: op.goal, logs: [`source: ${op.source}`] });
  if (event.type === "step")
    return stream.publish({ ...base, title: `Step: ${event.report.name}`, detail: `${event.report.action} (${op.iterations} so far)` });
  if (event.type === "verdict")
    return stream.publish({
      ...base,
      level: event.verdict.status === "verified" ? "success" : "warning",
      title: `Verdict ${event.verdict.status}: ${event.report.name}`,
      detail: event.verdict.analysis,
      screenshot: event.verdict.evidenceImage,
      logs: [`accuracy: ${event.verdict.accuracyScore ?? "none"}`, `provider: ${event.verdict.provider}`],
    });
  return stream.publish({
    ...base,
    level: LEVEL_OF[op.status] ?? "info",
    title: `${op.kind} ${op.status}`,
    detail: op.detail ?? op.goal,
    screenshot: op.verdicts[op.verdicts.length - 1]?.evidenceImage,
  });
}

function publishNote(stream: ProgressStream, note: CompanionNote) {
  stream.publish({ kind: "note", title: note.title, detail: note.content, screenshot: note.screenshot, logs: note.tags });
}

function publishError(stream: ProgressStream, event: CompanionErrorEvent) {
  stream.publish({
    kind: "error",
    level: "error",
    title: `${event.source} error`,
    detail: event.message,
    screenshot: event.screenshot,
    logs: event.failedStep ? [`failed step: ${JSON.stringify(event.failedStep)}`] : [],
  });
}

function publishImportant(stream: ProgressStream, event: CompanionImportantEvent) {
  stream.publish({
    kind: event.kind === "trigger_fired" ? "trigger" : event.kind === "goal_reached" ? "goal" : "run",
    level: event.kind === "workflow_failed" || event.kind === "error" ? "error" : "success",
    title: event.title,
    detail: event.detail,
    screenshot: event.screenshot,
  });
}

/**
 * Connects the supervisor (every operation) and the companion channel to the
 * activity notes, the background presentation drafts and the unified progress stream.
 */
export function connectAppPipeline(supervisor: OverseerSupervisor, companion: CompanionService, stream: ProgressStream) {
  const activity = new ActivityNotes(companion.notes);
  const drafts = new PresentationDrafts();
  supervisor.subscribe((event) => {
    publishOperation(stream, event);
    drafts.handle(event);
    const note = activity.handle(event);
    if (note) publishNote(stream, note);
  });
  drafts.onRefresh((draft) => {
    if (!draft.draft || draft.slides.length)
      stream.publish({
        kind: "presentation",
        operationId: draft.runId,
        status: draft.status,
        title: `Presentation ${draft.draft ? "draft updated" : "finalized"}`,
        detail: `${draft.completed}/${draft.total} verified step(s) for "${draft.goal.slice(0, 80)}"`,
      });
  });
  companion.errors.onError((event) => publishError(stream, event));
  companionEvents.onEvent((event) => publishImportant(stream, event));
  return { activity, drafts };
}
