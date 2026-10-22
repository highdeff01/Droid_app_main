import { useEffect, useState } from "react";
import type { OverseerSnapshot } from "@shared/overseer";
import { startPollLoop } from "@/lib/poll-loop";
import { fetchOverseerSnapshot } from "@/lib/overseer-client";

const OVERSEER_POLL_MS = 2000;

export interface OverseerSnapshotState {
  snapshot: OverseerSnapshot | null;
  /** Why the last poll failed; null after a successful poll. */
  error: string | null;
  refresh: () => Promise<void>;
}

/** Polls /api/overseer while `enabled`; a failed poll is reported, never replaced with placeholder data. */
export function useOverseerSnapshot(enabled = true): OverseerSnapshotState {
  const [snapshot, setSnapshot] = useState<OverseerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const result = await fetchOverseerSnapshot();
    if (result.ok === true) {
      setSnapshot(result.value);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  useEffect(() => {
    if (!enabled) return undefined;
    return startPollLoop([{ everyTicks: 1, enabled: () => true, run: refresh }], OVERSEER_POLL_MS);
  }, [enabled]);

  return { snapshot, error, refresh };
}
