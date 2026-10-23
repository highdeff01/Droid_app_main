import { useSyncExternalStore } from "react";
import {
  getPreviewEvents,
  getPreviewState,
  subscribePreviewEvents,
  subscribePreviewState,
  type PreviewEvent,
  type PreviewState,
} from "@/lib/preview-mode";

/** Live Preview Mode state (auto-detected or toggled in Settings). */
export function usePreviewMode(): PreviewState {
  return useSyncExternalStore(subscribePreviewState, getPreviewState, getPreviewState);
}

/** The simulated-action event feed, newest last. */
export function usePreviewEvents(): PreviewEvent[] {
  return useSyncExternalStore(subscribePreviewEvents, getPreviewEvents, getPreviewEvents);
}
