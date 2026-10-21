/** Request/response types for POST /api/ai/goal-replan, shared by server and client. */

export interface ReplanStepItem {
  id: string;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  keyPayload?: string;
  delayMs?: number;
  originalX?: number;
  originalY?: number;
  status?: "kept" | "modified" | "inserted" | "removed";
  replanReason?: string;
  /** Model-reported confidence; null when no model analysed this re-plan. */
  confidence?: number | null;
}

export interface ReplanResult {
  replanId: string;
  timestamp: number;
  driftDetected: boolean;
  maxDriftPx: number;
  originalStepCount: number;
  newStepCount: number;
  summary: string;
  /** Model-reported confidence; null when the re-plan is heuristic only. */
  confidence: number | null;
  /** "model" when a vision model returned a readable analysis, else "heuristic". */
  source: "model" | "heuristic";
  /** False when nothing in this re-plan was checked by a model. */
  verified: boolean;
  suggestedSteps: ReplanStepItem[];
  mitigationStrategies: string[];
  executionPlan: string;
}
