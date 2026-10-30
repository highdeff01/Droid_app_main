import { z } from "zod";
import { SCRIPT_MAX_STEPS, scriptStepSchema, type ScriptStep } from "../../shared/assist-bridge";
import { buildVisionMessage, parseModelJson, sendQwenChatRequest, type QwenChatMessage } from "../ai-endpoint";
import type { TakeoverPlanner } from "./steps";

const TAKEOVER_SYSTEM_PROMPT = `You are the main Droid app taking over a stalled automation step from Droid Assist.
Return ONLY JSON: {"steps":[...]} with 1-${SCRIPT_MAX_STEPS} steps, each one of
{"op":"click","x":int,"y":int} | {"op":"type","text":string} | {"op":"key","key":string} | {"op":"wait","ms":int<=5000}.
Coordinates are screen pixels of the attached screenshot. Do not repeat what was already tried and failed.`;

const planSchema = z.object({ steps: z.array(scriptStepSchema).min(1).max(SCRIPT_MAX_STEPS) });

/** Builds the takeover prompt with the full context: goal, step, what was tried and the reason. */
export function takeoverPrompt(context: Parameters<TakeoverPlanner>[0]): string {
  return [
    `Goal: ${context.goal}`,
    `Stalled step: ${context.step}`,
    context.reason ? `Why it was handed off: ${context.reason}` : "",
    context.tried.length ? `Already tried:\n- ${context.tried.join("\n- ")}` : "Nothing tried yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The main app's own Qwen plans the takeover script; an unreachable model or unreadable plan is an error, never a guess. */
export const qwenTakeoverPlanner: TakeoverPlanner = async (context) => {
  const image = context.frame ?? context.screenshots[context.screenshots.length - 1];
  if (!image) throw new Error("No live frame or handed-off screenshot to plan the takeover from");
  const messages: QwenChatMessage[] = [
    { role: "system", content: TAKEOVER_SYSTEM_PROMPT },
    buildVisionMessage(takeoverPrompt(context), image),
  ];
  const reply = await sendQwenChatRequest(messages, { format: "json" });
  if (!reply.success) throw new Error(`AI endpoint unreachable: ${reply.error || "no response"}`);
  const plan = planSchema.safeParse(parseModelJson(reply.content));
  if (!plan.success) throw new Error("AI returned an unreadable takeover plan");
  return plan.data.steps as ScriptStep[];
};
