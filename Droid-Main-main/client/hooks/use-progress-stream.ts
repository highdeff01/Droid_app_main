import { useSyncExternalStore } from "react";
import { currentProgress, subscribeProgress, type ProgressState } from "@/lib/progress-client";

const SERVER_STATE: ProgressState = { events: [], cursor: 0, error: null };

/** Live app progress (runs, goals, triggers, errors, notes) from the one shared poller. */
export function useProgressStream(): ProgressState {
  return useSyncExternalStore(subscribeProgress, currentProgress, () => SERVER_STATE);
}
