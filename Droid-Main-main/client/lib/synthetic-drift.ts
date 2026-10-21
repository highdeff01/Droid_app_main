import type { AutoCorrectionEntry } from "@/components/AutoCorrectionLog";

/**
 * Builds clearly-labelled synthetic drift events for the "Simulate Drift
 * Event" diagnostic control. These entries exercise the log UI only: they
 * carry no measured confidence or diff score and are structurally marked via
 * `source: "synthetic_test"` so they can never be mistaken for real
 * auto-correction events.
 */

export const SYNTHETIC_DRIFT_LABEL = "SYNTHETIC TEST DATA";

export type SyntheticDriftEntry = Omit<AutoCorrectionEntry, "id" | "timestamp">;

export interface SyntheticDriftToast {
  title: string;
  description: string;
}

/** True when an entry was produced by the synthetic diagnostic control. */
export function isSyntheticDriftEntry(entry: Pick<AutoCorrectionEntry, "source">): boolean {
  return entry.source === "synthetic_test";
}

/**
 * Generates one synthetic drift entry. `random` defaults to Math.random and is
 * injectable so the output is deterministic under test.
 */
export function buildSyntheticDriftEntry(
  sequenceLength: number,
  random: () => number = Math.random,
): SyntheticDriftEntry {
  const x = Math.round(200 + random() * 1200);
  const y = Math.round(150 + random() * 700);
  const dx = Math.round((random() - 0.5) * 36);
  const dy = Math.round((random() - 0.5) * 36);
  const driftDistancePx = parseFloat(Math.hypot(dx, dy).toFixed(1));
  const stepIndex = sequenceLength > 0 ? Math.floor(random() * sequenceLength) + 1 : 1;

  return {
    stepIndex,
    stepName: `[${SYNTHETIC_DRIFT_LABEL}] Simulated drift on step #${stepIndex}`,
    originalCoords: { x, y },
    recalibratedCoords: { x: x + dx, y: y + dy },
    driftDistancePx,
    driftDelta: { dx, dy },
    recoveryBranch: "synthetic_test",
    targetElement: `[${SYNTHETIC_DRIFT_LABEL}] Random point (${x}, ${y})`,
    reasoning: `${SYNTHETIC_DRIFT_LABEL}: randomly generated ${driftDistancePx}px offset to exercise the drift log UI. No frame was captured or analysed and no confidence was measured.`,
    status: "synthetic_test",
    source: "synthetic_test",
  };
}

/** Toast copy for a synthetic entry: labelled, and with no confidence claim. */
export function describeSyntheticDriftToast(entry: SyntheticDriftEntry): SyntheticDriftToast {
  return {
    title: `[${SYNTHETIC_DRIFT_LABEL}] Simulated drift (Δ${entry.driftDistancePx}px)`,
    description: `Synthetic diagnostic event logged at (${entry.recalibratedCoords.x}, ${entry.recalibratedCoords.y}). Not a real measurement; no confidence score.`,
  };
}
