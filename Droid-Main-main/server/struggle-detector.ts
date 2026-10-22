import type { CompanionNote, FixTask } from "@shared/companion";
import type { ReplayRun } from "@shared/replay";
import type { StruggleTopic } from "@shared/story";

/**
 * Teach mode's struggle detection: groups real failure records — fix tasks from the error
 * ledger, error notes not already tied to a task, and replay steps that needed a retry —
 * by what failed. A key seen at least STRUGGLE_THRESHOLD times is a struggle topic.
 */

export const STRUGGLE_THRESHOLD = 2;
const MAX_EXAMPLES = 3;

export interface StruggleInputs {
  tasks: FixTask[];
  notes: CompanionNote[];
  runs: ReplayRun[];
}

interface Occurrence {
  key: string;
  label: string;
  source: string;
  example: string;
  at: string;
}

const ERROR_EVENTS = new Set(["error", "workflow_failed"]);

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

function taskOccurrence(task: FixTask): Occurrence {
  const step = task.failedStep?.name || task.failedStep?.action;
  const label = step ? `${step}` : `${task.source.replace("_", " ")} failures`;
  return { key: slug(label), label, source: task.source, example: task.error, at: task.createdAt };
}

function noteOccurrence(note: CompanionNote): Occurrence {
  return { key: slug(note.title), label: note.title, source: "notes", example: note.content, at: note.createdAt };
}

/** One occurrence per extra attempt a replay step needed (attempt 2 means one retry). */
function runOccurrences(run: ReplayRun): Occurrence[] {
  return run.events
    .filter((e) => e.stepId && (e.attempt ?? 1) > 1)
    .map((e) => ({
      key: slug(`replay step ${e.stepId}`),
      label: `Replay step ${e.stepId}`,
      source: "replay_retry",
      example: e.detail,
      at: new Date(e.at).toISOString(),
    }));
}

function collect(inputs: StruggleInputs): Occurrence[] {
  const linked = new Set(inputs.tasks.map((t) => t.noteId).filter(Boolean));
  const looseNotes = inputs.notes.filter((n) => n.event && ERROR_EVENTS.has(n.event) && !linked.has(n.id));
  return [
    ...inputs.tasks.map(taskOccurrence),
    ...looseNotes.map(noteOccurrence),
    ...inputs.runs.flatMap(runOccurrences),
  ];
}

function toTopic(group: Occurrence[]): StruggleTopic {
  const sorted = [...group].sort((a, b) => b.at.localeCompare(a.at));
  return {
    id: sorted[0].key,
    label: sorted[0].label,
    occurrences: group.length,
    sources: [...new Set(group.map((o) => o.source))],
    examples: [...new Set(sorted.map((o) => o.example).filter(Boolean))].slice(0, MAX_EXAMPLES),
    lastSeen: sorted[0].at,
  };
}

/** Repeated struggles, most frequent first, then most recent. */
export function detectStruggles(inputs: StruggleInputs): StruggleTopic[] {
  const groups = new Map<string, Occurrence[]>();
  for (const occurrence of collect(inputs)) {
    groups.set(occurrence.key, [...(groups.get(occurrence.key) ?? []), occurrence]);
  }
  return [...groups.values()]
    .filter((group) => group.length >= STRUGGLE_THRESHOLD)
    .map(toTopic)
    .sort((a, b) => b.occurrences - a.occurrences || b.lastSeen.localeCompare(a.lastSeen));
}
