import type { Presentation } from "@shared/presentation";
import type { ReplayRun } from "@shared/replay";
import { buildPresentation, type HudStepLike } from "@/lib/hud-actions";

export type FetchDraft = () => Promise<Presentation | null>;

/**
 * What the HUD Presentation button opens: the background draft of the latest
 * operation; only when the server has none (or cannot be reached) is a finished
 * local replay run built on demand. With neither, the failure is reported.
 */
export async function resolvePresentation(
  fetchDraft: FetchDraft,
  replayRun: ReplayRun | null,
  steps: HudStepLike[],
): Promise<Presentation> {
  let draftError: unknown = null;
  try {
    const draft = await fetchDraft();
    if (draft) return draft;
  } catch (error) {
    draftError = error;
  }
  if (replayRun) return buildPresentation(replayRun, steps);
  if (draftError) throw draftError;
  throw new Error("No operation has run yet. Run the sequence first.");
}
