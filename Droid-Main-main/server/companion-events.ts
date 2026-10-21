import type { CompanionErrorEvent, ImportantEventKind } from "@shared/companion";

/** An important event worth a timestamped note and screenshot. */
export interface CompanionImportantEvent {
  kind: ImportantEventKind;
  title: string;
  detail: string;
  screenshot?: string;
}

type Listener<T> = (event: T) => void;

const errorListeners: Listener<CompanionErrorEvent>[] = [];
const eventListeners: Listener<CompanionImportantEvent>[] = [];

/**
 * Dependency-free channel so the replay engine and device command paths can
 * publish failures and important events without importing the companion layer.
 */
export const companionEvents = {
  reportError(event: CompanionErrorEvent) {
    for (const listener of errorListeners) safeCall(listener, event);
  },
  reportEvent(event: CompanionImportantEvent) {
    for (const listener of eventListeners) safeCall(listener, event);
  },
  onError(listener: Listener<CompanionErrorEvent>) {
    errorListeners.push(listener);
  },
  onEvent(listener: Listener<CompanionImportantEvent>) {
    eventListeners.push(listener);
  },
};

function safeCall<T>(listener: Listener<T>, event: T) {
  try {
    listener(event);
  } catch (error) {
    console.error("Companion listener failed:", error);
  }
}
