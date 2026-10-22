import { createHash } from "node:crypto";
import type { DriftMeasure, OperationStepReport } from "../../shared/overseer";
import { buildVisionMessage, parseModelJson, sendQwenChatRequest } from "../ai-endpoint";
import { generateVisionJson } from "../ai-gemini-service";
import { assessmentFromModel, type StepAssessment } from "./verdict";
import { checkupFromModel, type CheckupAssessment } from "./checkup";

export type AnalyzerProvider = "qwen" | "gemini";

/** An answer from the vision model (value + provider), or the honest reason there is none. */
export interface AnalyzerResult<T> {
  ok: boolean;
  value?: T;
  provider?: AnalyzerProvider;
  reason?: string;
}

export interface OverseerAnalyzer {
  assessStep(image: string, step: OperationStepReport, goal: string): Promise<AnalyzerResult<StepAssessment>>;
  checkup(image: string, goal: string, elapsedSeconds: number): Promise<AnalyzerResult<CheckupAssessment>>;
}

/** Qwen (qwen3.5:2b via the Ollama chain) by default; Gemini only when explicitly selected. */
export function selectedProvider(env: NodeJS.ProcessEnv = process.env): AnalyzerProvider {
  return env.OVERSEER_VISION_PROVIDER === "gemini" && env.GEMINI_API_KEY ? "gemini" : "qwen";
}

function stepPrompt(step: OperationStepReport, goal: string): string {
  const where = step.x === undefined || step.y === undefined ? "" : ` at (${step.x}, ${step.y})`;
  return `You are the Overseer, an independent supervisor double-checking another AI's automation step.
Do not trust the executor; judge only from this fresh screenshot.
- Operation goal: "${goal}"
- Step: "${step.name}" — ${step.action}${where}${step.text ? ` with text "${step.text}"` : ""}
- Declared expectation: "${step.expectation ?? "not declared"}"

Answer with STRICT JSON only:
{"status":"verified|missed|obstructed|off_track|completed_early","verified":true,"accuracyScore":0.0,"expectationMet":true,"onTrack":true,"goalFinished":false,"analysis":"what you see","suggestedCorrection":null}
Omit accuracyScore if you cannot judge. Use "off_track" when the screen no longer serves the goal.`;
}

function checkupPrompt(goal: string, elapsedSeconds: number): string {
  return `You are the Overseer running a periodic checkup on a long-running automation.
- Declared goal: "${goal}"
- Elapsed: ${elapsedSeconds}s
From this screenshot only, decide whether the goal is complete, still progressing, or off-track.
Answer with STRICT JSON only: {"isFinished":false,"onTrack":true,"summary":"what you see"}`;
}

async function qwenJson(prompt: string, image: string): Promise<any> {
  const result = await sendQwenChatRequest([buildVisionMessage(prompt, image)], { format: "json" });
  if (!result.success) throw new Error(result.error || "Qwen request failed");
  return parseModelJson(result.content);
}

async function askModel<T>(
  prompt: string,
  image: string,
  map: (parsed: any) => T,
  provider: AnalyzerProvider,
): Promise<AnalyzerResult<T>> {
  try {
    const parsed = provider === "gemini" ? await generateVisionJson(prompt, [image]) : await qwenJson(prompt, image);
    return { ok: true, value: map(parsed), provider };
  } catch (err) {
    return { ok: false, reason: `Overseer vision check unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function createVisionAnalyzer(provider: () => AnalyzerProvider = selectedProvider): OverseerAnalyzer {
  return {
    assessStep: (image, step, goal) => askModel(stepPrompt(step, goal), image, assessmentFromModel, provider()),
    checkup: (image, goal, elapsed) => askModel(checkupPrompt(goal, elapsed), image, checkupFromModel, provider()),
  };
}

function frameHash(image: string): string {
  return createHash("sha256").update(image.replace(/^data:[^,]*,/, "")).digest("hex");
}

/**
 * Server-side frame drift: byte-identical frames mean nothing changed. Percent-level
 * pixel diffs come from the client pixel-diff engine (reported with the step) because
 * that engine needs a canvas.
 */
export function measureFrameDrift(before: string | undefined, after: string | undefined): DriftMeasure | undefined {
  if (!before || !after) return undefined;
  const identical = frameHash(before) === frameHash(after);
  return { identical, diffPercent: identical ? 0 : null, method: "hash" };
}
