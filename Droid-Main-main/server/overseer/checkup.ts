import type { CheckupOutcome } from "../../shared/overseer";

/** What the overseer's checkup prompt reported; null fields mean the model did not say. */
export interface CheckupAssessment {
  isFinished: boolean | null;
  onTrack: boolean | null;
  summary: string;
}

/** Classifies a checkup honestly: no answer is "uncertain", never "complete". */
export function classifyCheckup(assessment: CheckupAssessment | null): CheckupOutcome {
  if (!assessment) return "uncertain";
  if (assessment.isFinished === true) return "complete";
  if (assessment.onTrack === false) return "off_track";
  if (assessment.isFinished === false) return "continuing";
  return "uncertain";
}

export const CHECKUP_LABEL: Record<CheckupOutcome, string> = {
  complete: "Complete",
  continuing: "Not complete, continuing",
  off_track: "Off-track",
  uncertain: "Uncertain",
};

export function checkupFromModel(parsed: any): CheckupAssessment {
  return {
    isFinished: typeof parsed?.isFinished === "boolean" ? parsed.isFinished : null,
    onTrack: typeof parsed?.onTrack === "boolean" ? parsed.onTrack : null,
    summary: typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : "The model returned no summary.",
  };
}
