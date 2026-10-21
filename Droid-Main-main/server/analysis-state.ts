import type { FrameAnalysis } from "../shared/assistant";

/** Generates a unique id for a new frame analysis record. */
const createId = () =>
  `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/** In-memory repository for storing and querying frame analysis results. */
export class AnalysisRepository {
  private readonly analyses = new Map<string, FrameAnalysis>();

  /** Creates and stores a new analysis record, assigning it a unique id. */
  create(input: Omit<FrameAnalysis, "id">): FrameAnalysis {
    const analysis = { ...input, id: createId() };
    this.analyses.set(analysis.id, analysis);
    return analysis;
  }

  /** Retrieves a stored analysis by id. */
  get(id: string): FrameAnalysis | undefined {
    return this.analyses.get(id);
  }

  /** Lists stored analyses, optionally filtered by capture/session id, newest first. */
  list(captureId?: string, sessionId?: string): FrameAnalysis[] {
    return [...this.analyses.values()]
      .filter(
        (analysis) =>
          (!captureId || analysis.captureId === captureId) &&
          (!sessionId || analysis.sessionId === sessionId),
      )
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  }
}

export const analysisRepository = new AnalysisRepository();
