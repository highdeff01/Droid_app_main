import type {
  RecordedAction,
  RecordedSession,
  RecordingOperationPack,
  RecordingPlanDraft,
  RecordingSourceMetadata,
} from "@shared/recordings";
import { DurableStore, type StorageOptions } from "./durable-store";

/** Returns the current time as an ISO-8601 string. */
const now = () => new Date().toISOString();
/** Generates a unique id prefixed with `prefix`. */
const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Durable repository for recorded browser sessions, backed by `DurableStore`,
 * including preview-only operation pack and plan draft generation.
 */
export class RecordingRepository {
  private readonly store: DurableStore;
  private recordings = new Map<string, RecordedSession>();

  /** Creates the repository and loads any previously persisted recordings. */
  constructor(options: StorageOptions = {}) {
    this.store = new DurableStore(options);
    this.load();
  }

  /** Reloads the in-memory recordings map from durable storage. */
  private load() {
    this.recordings = new Map(
      this.store
        .readCollection<RecordedSession>("recordings")
        .map((recording) => [recording.id, recording]),
    );
  }

  /** Persists the current recordings map to durable storage. */
  private persist() {
    this.store.writeCollection("recordings", [...this.recordings.values()]);
  }

  /** Starts a new recording session for `sessionId` and persists it. */
  start(
    sessionId: string,
    name: string,
    source: RecordingSourceMetadata,
  ): RecordedSession {
    this.load();
    const startedAt = now();
    const recording: RecordedSession = {
      id: createId("recording"),
      sessionId,
      name,
      status: "recording",
      startedAt,
      source,
      events: [],
    };
    this.recordings.set(recording.id, recording);
    this.persist();
    return recording;
  }

  /** Marks the recording `id` as stopped, setting its `stoppedAt` timestamp. */
  stop(id: string): RecordedSession | undefined {
    this.load();
    const recording = this.recordings.get(id);
    if (!recording) return undefined;
    const updated = {
      ...recording,
      status: "stopped" as const,
      stoppedAt: recording.stoppedAt ?? now(),
    };
    this.recordings.set(id, updated);
    this.persist();
    return updated;
  }

  /** Appends `events` to an in-progress recording; returns `undefined` if not recording. */
  append(id: string, events: RecordedAction[]): RecordedSession | undefined {
    this.load();
    const recording = this.recordings.get(id);
    if (!recording || recording.status !== "recording") return undefined;
    const updated = { ...recording, events: [...recording.events, ...events] };
    this.recordings.set(id, updated);
    this.persist();
    return updated;
  }

  /** Lists recordings, optionally filtered by session id, newest first. */
  list(sessionId?: string): RecordedSession[] {
    this.load();
    return [...this.recordings.values()]
      .filter((recording) => !sessionId || recording.sessionId === sessionId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Retrieves a recording by id. */
  get(id: string): RecordedSession | undefined {
    this.load();
    return this.recordings.get(id);
  }

  /** Builds a preview-only operation pack summarizing a recording's actions. */
  createOperationPack(id: string): RecordingOperationPack | undefined {
    const recording = this.get(id);
    if (!recording) return undefined;
    return {
      id: createId("pack"),
      recordingId: id,
      name: `${recording.name} review pack`,
      description:
        "A preview-only representation of recorded browser actions. No actions are executed.",
      previewOnly: true,
      operations: recording.events.map((event) => describeAction(event)),
      createdAt: now(),
    };
  }

  /** Builds a preview-only, step-by-step plan draft from a recording's actions. */
  createPlanDraft(id: string): RecordingPlanDraft | undefined {
    const recording = this.get(id);
    if (!recording) return undefined;
    return {
      id: createId("draft"),
      recordingId: id,
      title: `${recording.name} plan draft`,
      previewOnly: true,
      steps: recording.events.map((event, index) => ({
        order: index + 1,
        actionId: event.id,
        description: describeAction(event),
        requiresReview: true as const,
      })),
      createdAt: now(),
    };
  }
}

/** Produces a short human-readable description of a recorded action. */
function describeAction(event: RecordedAction): string {
  switch (event.type) {
    case "mouse-click":
      return `Click ${event.button} at (${event.x}, ${event.y})`;
    case "mouse-move":
      return `Move pointer to (${event.x}, ${event.y})`;
    case "keyboard-key":
      return `Press ${event.key}${event.modifiers.length ? ` with ${event.modifiers.join("+")}` : ""}`;
    case "keyboard-text":
      return event.redacted
        ? "Enter redacted text (value not captured)"
        : "Enter captured text";
    case "wait":
      return `Wait ${event.durationMs}ms`;
    case "screenshot-checkpoint":
      return `Review screenshot checkpoint: ${event.label}`;
    case "note":
      return `Note: ${event.text}`;
  }
}

export const recordingRepository = new RecordingRepository();
