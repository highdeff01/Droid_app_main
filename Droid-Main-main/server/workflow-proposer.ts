import type { WorkflowStepDraft } from "@shared/companion";
import { replayStepSchema } from "../shared/replay";
import {
  buildVisionMessage,
  parseModelJson,
  sendQwenChatRequest,
} from "./ai-endpoint";

export interface ProposalRequest {
  goal: string;
  context: string;
  currentSteps?: WorkflowStepDraft[];
  screenshot?: string;
}

export interface ProposalDraft {
  summary: string;
  steps: WorkflowStepDraft[];
}

/** Produces an AI-proposed workflow; rejects when the model is unavailable or returns no usable steps. */
export type WorkflowProposer = (request: ProposalRequest) => Promise<ProposalDraft>;

const PROPOSAL_PROMPT = `You repair and improve desktop/phone automation workflows.
Return ONLY JSON: {"summary": "one sentence on what changes and why", "steps": [{"name": "...", "action": "click|double_click|right_click|clear_and_type|type_text|press_key|hotkey|scroll|wait", "x": 0, "y": 0, "text": "optional", "keyPayload": "optional", "delayMs": 500}]}
Coordinates are pixels on the attached screenshot (1920x1080 when none is attached).`;

/** Keeps only steps the replay engine accepts, assigning ids. */
export function sanitizeProposedSteps(raw: unknown): WorkflowStepDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((step, index) => {
    const parsed = replayStepSchema.safeParse({
      ...(step as object),
      id: `proposed_${index + 1}`,
      name: (step as { name?: string })?.name || `Step ${index + 1}`,
    });
    if (!parsed.success) return [];
    const { id, name, action, x, y, text, keyPayload, delayMs } = parsed.data;
    return [{ id, name, action, x, y, text, keyPayload, delayMs }];
  });
}

export const qwenWorkflowProposer: WorkflowProposer = async (request) => {
  const prompt = [
    `Goal: ${request.goal}`,
    `Context:\n${request.context}`,
    request.currentSteps?.length
      ? `Current steps:\n${JSON.stringify(request.currentSteps)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const message = request.screenshot
    ? buildVisionMessage(prompt, request.screenshot)
    : { role: "user" as const, content: prompt };
  const response = await sendQwenChatRequest(
    [{ role: "system", content: PROPOSAL_PROMPT }, message],
    { format: "json" },
  );
  if (!response.success) throw new Error(response.error || "AI model unavailable");
  const parsed = parseModelJson<{ summary?: string; steps?: unknown }>(response.content);
  const steps = sanitizeProposedSteps(parsed.steps);
  if (steps.length === 0) throw new Error("The AI reply contained no valid workflow steps");
  return { summary: String(parsed.summary || "AI-proposed workflow"), steps };
};
