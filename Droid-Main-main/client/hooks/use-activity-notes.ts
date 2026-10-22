import { useEffect, useMemo, useState } from "react";
import type { CompanionNote } from "@shared/companion";
import { companionApi } from "@/lib/companion-api";
import { useProgressStream } from "@/hooks/use-progress-stream";

export interface ActivityNotesState {
  /** The AI's notes on screen activity and control times, newest first; null before the first load. */
  notes: CompanionNote[] | null;
  error: string | null;
}

const ACTIVITY_TAG = "activity";
const SHOWN = 10;

/** Activity notes, reloaded whenever the shared progress stream reports a new note. */
export function useActivityNotes(): ActivityNotesState {
  const { events } = useProgressStream();
  const latestNoteSeq = useMemo(() => events.filter((e) => e.kind === "note").at(-1)?.seq ?? 0, [events]);
  const [state, setState] = useState<ActivityNotesState>({ notes: null, error: null });

  useEffect(() => {
    let cancelled = false;
    companionApi
      .notes()
      .then((notes) => {
        const activity = notes.filter((n) => n.tags.includes(ACTIVITY_TAG));
        if (!cancelled) setState({ notes: activity.slice(-SHOWN).reverse(), error: null });
      })
      .catch((error) => {
        if (!cancelled) setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : String(error) }));
      });
    return () => {
      cancelled = true;
    };
  }, [latestNoteSeq]);

  return state;
}
