import type { ReplayRun } from "@shared/replay";
import {
  STORY_PERSPECTIVES,
  type GeneratedStory,
  type StoryGenerateRequest,
  type StoryPerspective,
  type StoryScene,
  type StorySceneAction,
} from "@shared/story";
import {
  buildVisionMessage,
  parseModelJson,
  sendQwenChatRequest,
  type QwenChatMessage,
} from "./ai-endpoint";

/**
 * Story mode: Qwen writes every scene from a premise, a topic, the current screen or a
 * finished replay run. Nothing is seeded and no score is invented; a failed or empty model
 * reply is an error the caller reports as such.
 */

export type ChatFn = typeof sendQwenChatRequest;

/** An input or model failure carrying the HTTP status the route should answer with. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface RunLookup {
  getRun: (id: string) => ReplayRun | undefined;
  runImages: (id: string) => string[];
}

export interface StoryDeps extends RunLookup {
  chat: ChatFn;
}

interface StoryContext {
  message: QwenChatMessage;
  backgrounds: string[];
  allowActions: boolean;
}

const MAX_SCENES = 8;
const DEFAULT_SCENES = 4;
const SCREENSHOT = /^data:image\/(png|jpeg);base64,/;
const ACTION_TYPES = new Set(["click", "type", "hotkey", "scroll"]);

const STORY_PROMPT = `You are Nova, a playful co-creative storyteller inside a desktop automation app.
Write an engaging multi-scene story. Reply with JSON only:
{"title": string, "scenes": [{"title": string, "perspective": "user_viewpoint"|"ai_agent_viewpoint"|"environment_viewpoint",
"narrativeDescription": string, "decisionTurn": string, "predictedNextTurn": string}]}.
"decisionTurn" is the choice the characters face; "predictedNextTurn" is what you think happens next.
Never include probabilities, scores or percentages.`;

const ACTION_PROMPT = `When the screenshot shows a real control a scene's character would use next, add
"inAppAction": {"actionType": "click"|"type"|"hotkey"|"scroll", "x": number, "y": number, "payload"?: string, "description": string}
to that scene, with pixel coordinates of the attached screenshot. Omit it otherwise.`;

function isScreenshot(value: unknown): value is string {
  return typeof value === "string" && SCREENSHOT.test(value);
}

function clampScenes(count: unknown): number {
  const n = Number(count);
  return Number.isFinite(n) ? Math.min(MAX_SCENES, Math.max(1, Math.round(n))) : DEFAULT_SCENES;
}

function perspectiveRule(request: StoryGenerateRequest): string {
  const p = request.perspective;
  return p && p !== "mixed"
    ? `Narrate every scene from the ${p.replace("_", " ")}.`
    : "Alternate perspectives between the user, the AI agent and the environment.";
}

/** One-line-per-event narration of a replay run, as recorded by the engine. */
export function describeRun(run: ReplayRun): string {
  const header = `Run ${run.id} on ${run.target}: ${run.status}, ${run.completed}/${run.total} actions completed${run.error ? `, error: ${run.error}` : ""}.`;
  const events = run.events
    .slice(-40)
    .map((e) => `- [${e.phase}]${e.stepId ? ` step ${e.stepId}` : ""}${e.attempt ? ` attempt ${e.attempt}` : ""}: ${e.detail}`);
  return [header, ...events].join("\n");
}

function textContext(request: StoryGenerateRequest, label: string): StoryContext {
  const text = request.text?.trim();
  if (!text) throw new GenerationError(`A ${label} is required`, 400);
  return {
    message: { role: "user", content: `${label[0].toUpperCase()}${label.slice(1)}: ${text.slice(0, 4000)}` },
    backgrounds: [],
    allowActions: false,
  };
}

function screenContext(request: StoryGenerateRequest): StoryContext {
  if (!isScreenshot(request.imageData)) {
    throw new GenerationError("An actual PNG/JPEG screenshot is required", 400);
  }
  const note = request.text?.trim() ? `\nUser's idea: ${request.text.trim().slice(0, 1000)}` : "";
  return {
    message: buildVisionMessage(
      `Tell a story about what is happening on this screen.${note}\n${ACTION_PROMPT}`,
      request.imageData,
    ),
    backgrounds: [request.imageData],
    allowActions: true,
  };
}

function runContext(request: StoryGenerateRequest, runs: RunLookup): StoryContext {
  const run = request.runId ? runs.getRun(request.runId) : undefined;
  if (!run) throw new GenerationError("Replay run not found", 404);
  if (run.status === "running" || run.status === "paused") {
    throw new GenerationError("The run is still in progress; narrate it once it finishes", 409);
  }
  return {
    message: {
      role: "user",
      content: `Narrate what really happened in this automation run as a story; stay faithful to the events.\n${describeRun(run)}`,
    },
    backgrounds: runs.runImages(run.id).filter(isScreenshot),
    allowActions: false,
  };
}

const CONTEXT_BUILDERS: Record<
  StoryGenerateRequest["source"],
  (request: StoryGenerateRequest, runs: RunLookup) => StoryContext
> = {
  premise: (request) => textContext(request, "premise"),
  topic: (request) => textContext(request, "topic"),
  screen: (request) => screenContext(request),
  run: runContext,
};

function toPerspective(value: unknown, index: number, request: StoryGenerateRequest): StoryPerspective {
  if (request.perspective && request.perspective !== "mixed") return request.perspective;
  return STORY_PERSPECTIVES.includes(value as StoryPerspective)
    ? (value as StoryPerspective)
    : STORY_PERSPECTIVES[index % STORY_PERSPECTIVES.length];
}

function toAction(value: any): StorySceneAction | undefined {
  if (!value || !ACTION_TYPES.has(value.actionType)) return undefined;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return {
    actionType: value.actionType,
    x,
    y,
    ...(typeof value.payload === "string" && value.payload ? { payload: value.payload } : {}),
    description: String(value.description ?? `${value.actionType} at (${x}, ${y})`),
  };
}

/** Background for scene `index`: the run's frames spread across scenes, or the single screenshot. */
function backgroundFor(backgrounds: string[], index: number, total: number): string | null {
  if (backgrounds.length === 0) return null;
  const at = Math.floor((index * backgrounds.length) / Math.max(1, total));
  return backgrounds[Math.min(backgrounds.length - 1, at)];
}

function toScene(
  raw: any,
  index: number,
  total: number,
  ctx: Pick<StoryContext, "backgrounds" | "allowActions">,
  request: StoryGenerateRequest,
): StoryScene {
  const action = ctx.allowActions ? toAction(raw?.inAppAction) : undefined;
  return {
    id: `scene_${index + 1}`,
    sceneNumber: index + 1,
    title: String(raw?.title ?? "").trim() || `Scene ${index + 1}`,
    perspective: toPerspective(raw?.perspective, index, request),
    narrativeDescription: String(raw?.narrativeDescription ?? "").trim(),
    decisionTurn: String(raw?.decisionTurn ?? "").trim(),
    predictedNextTurn: String(raw?.predictedNextTurn ?? "").trim(),
    backgroundImage: backgroundFor(ctx.backgrounds, index, total),
    ...(action ? { inAppAction: action } : {}),
  };
}

/** Parses the model reply; scenes without narrative are dropped and an empty story is an error. */
export function parseStory(
  content: string,
  request: StoryGenerateRequest,
  ctx: Pick<StoryContext, "backgrounds" | "allowActions">,
): Omit<GeneratedStory, "createdAt" | "endpoint"> {
  let parsed: any;
  try {
    parsed = parseModelJson<any>(content);
  } catch {
    throw new GenerationError("Qwen returned a reply that is not story JSON", 502);
  }
  const raw: any[] = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const usable = raw.filter((s) => String(s?.narrativeDescription ?? "").trim()).slice(0, MAX_SCENES);
  if (usable.length === 0) throw new GenerationError("Qwen returned no story scenes", 502);
  return {
    title: String(parsed?.title ?? "").trim() || "Untitled story",
    source: request.source,
    scenes: usable.map((s, i) => toScene(s, i, usable.length, ctx, request)),
  };
}

/** Builds the source context, asks Qwen for the story and parses it. */
export async function generateStory(request: StoryGenerateRequest, deps: StoryDeps): Promise<GeneratedStory> {
  const build = CONTEXT_BUILDERS[request?.source];
  if (!build) throw new GenerationError("source must be premise, topic, screen or run", 400);
  const ctx = build(request, deps);
  const count = clampScenes(request.sceneCount);
  const reply = await deps.chat(
    [
      { role: "system", content: `${STORY_PROMPT}\nWrite exactly ${count} scenes. ${perspectiveRule(request)}` },
      ctx.message,
    ],
    { endpoint: request.endpoint, model: request.model, format: "json" },
  );
  if (!reply.success) throw new GenerationError(reply.error || "Qwen unavailable", 502);
  return {
    ...parseStory(reply.content, request, ctx),
    endpoint: reply.endpoint,
    createdAt: new Date().toISOString(),
  };
}
