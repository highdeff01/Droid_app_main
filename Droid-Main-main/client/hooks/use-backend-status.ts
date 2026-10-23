import { useSyncExternalStore } from "react";
import { getBackendStatus, subscribeBackendStatus, type BackendStatus } from "@/lib/backend-status";

/** Live backend reachability from the startup probe. */
export function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(subscribeBackendStatus, getBackendStatus, getBackendStatus);
}
