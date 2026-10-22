import type { ProgressEvent, ProgressPage } from "@shared/progress";
import { startPollLoop } from "@/lib/poll-loop";

/**
 * One shared subscription to the server's unified progress stream (/api/progress):
 * every tab subscribes here, and a single poll loop runs while anyone listens.
 */

const PROGRESS_POLL_MS = 2000;
/** Most recent events kept client-side. */
export const MAX_CLIENT_EVENTS = 200;

export interface ProgressState {
  events: ProgressEvent[];
  cursor: number;
  /** Why the last poll failed; null after a successful poll. */
  error: string | null;
}

type Listener = (state: ProgressState) => void;

/** Appends a page's events after the known cursor, keeping only the newest `max`. */
export function mergeProgress(state: ProgressState, page: ProgressPage, max = MAX_CLIENT_EVENTS): ProgressState {
  const fresh = page.events.filter((event) => event.seq > state.cursor);
  return {
    events: [...state.events, ...fresh].slice(-max),
    cursor: Math.max(state.cursor, page.cursor),
    error: null,
  };
}

/** Fetches events after `since`; throws the server's error so the UI shows the failure. */
export async function fetchProgressPage(since: number): Promise<ProgressPage> {
  const response = await fetch(`/api/progress?since=${since}`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(data?.error || `Progress request failed (${response.status})`);
  return { events: data.events, cursor: data.cursor };
}

let state: ProgressState = { events: [], cursor: 0, error: null };
const listeners = new Set<Listener>();
let stopLoop: (() => void) | null = null;

function setState(next: ProgressState) {
  state = next;
  for (const listener of listeners) listener(state);
}

async function pollOnce() {
  try {
    setState(mergeProgress(state, await fetchProgressPage(state.cursor)));
  } catch (error) {
    setState({ ...state, error: error instanceof Error ? error.message : String(error) });
  }
}

export function currentProgress(): ProgressState {
  return state;
}

/** Subscribes to the shared stream; the first subscriber starts the poll loop, the last one stops it. */
export function subscribeProgress(listener: Listener): () => void {
  listeners.add(listener);
  stopLoop ??= startPollLoop([{ everyTicks: 1, enabled: () => true, run: pollOnce }], PROGRESS_POLL_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopLoop) {
      stopLoop();
      stopLoop = null;
    }
  };
}
