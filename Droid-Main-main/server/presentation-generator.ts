import type {
  GeneratedPresentation,
  PresentationGenerateRequest,
  PresentationKind,
  PresentationSlideContent,
  StruggleTopic,
} from "@shared/story";
import { parseModelJson } from "./ai-endpoint";
import { describeRun, GenerationError, type ChatFn, type RunLookup } from "./story-generator";

/**
 * Versatile presentations: one source builder per kind turns the request into the material
 * Qwen presents. All slide text comes from the model; facts come from real records only.
 */

export type PageFetcher = (url: string) => Promise<string>;

export interface PresentationDeps extends Pick<RunLookup, "getRun"> {
  chat: ChatFn;
  fetchPage: PageFetcher;
  struggles: () => StruggleTopic[];
}

interface PresentationSource {
  source: string;
  instruction: string;
  material: string;
}

const MAX_MATERIAL = 6000;
const MAX_SLIDES = 10;

const PRESENTATION_PROMPT = `You build clear slide presentations. Reply with JSON only:
{"title": string, "slides": [{"title": string, "bullets": string[], "notes"?: string}]}.
Use 3 to 8 slides of 2 to 5 short bullets. Only state numbers that appear in the material;
never invent metrics, percentages or confidence values.`;

function requireText(value: string | undefined, error: string): string {
  const text = value?.trim();
  if (!text) throw new GenerationError(error, 400);
  return text;
}

/** Strips scripts, styles and tags from an HTML page, leaving readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetches an http(s) page and returns its text; any failure throws. */
export const fetchPageText: PageFetcher = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return htmlToText(await response.text());
};

function parseHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // reported below
  }
  throw new GenerationError("url must be an http(s) URL", 400);
}

function taskSource(request: PresentationGenerateRequest, deps: PresentationDeps): PresentationSource {
  const run = request.runId ? deps.getRun(request.runId) : undefined;
  if (!run) throw new GenerationError("Replay run not found", 404);
  if (run.status === "running" || run.status === "paused") {
    throw new GenerationError("The run is still in progress; present it once it finishes", 409);
  }
  const lastAt = run.events.length ? run.events[run.events.length - 1].at : run.startedAt;
  const steps = run.steps.map((s) => `- step ${s.id}: ${s.status}`).join("\n");
  return {
    source: `run:${run.id}`,
    instruction: "Present what this automation run did: the steps, which were verified, timings and the outcome.",
    material: `${describeRun(run)}\nDuration: ${Math.round((lastAt - run.startedAt) / 1000)}s\nSteps:\n${steps}`,
  };
}

async function webSource(request: PresentationGenerateRequest, deps: PresentationDeps): Promise<PresentationSource> {
  if (request.url?.trim()) {
    const url = parseHttpUrl(request.url.trim());
    let text: string;
    try {
      text = await deps.fetchPage(url);
    } catch (err) {
      throw new GenerationError(`Could not read ${url}: ${err instanceof Error ? err.message : String(err)}`, 502);
    }
    if (!text) throw new GenerationError(`${url} has no readable text`, 502);
    return { source: url, instruction: "Summarize this web page into a presentation.", material: text };
  }
  const topic = requireText(request.text, "A URL or topic is required");
  return {
    source: "model_knowledge",
    instruction: "Present this topic from your own knowledge; say so on the first slide.",
    material: `Topic: ${topic}`,
  };
}

function userSource(request: PresentationGenerateRequest): PresentationSource {
  return {
    source: "user_input",
    instruction: "Turn the user's content into a presentation without adding facts.",
    material: requireText(request.text, "Content is required"),
  };
}

function teachSource(request: PresentationGenerateRequest, deps: PresentationDeps): PresentationSource {
  const topic = deps.struggles().find((t) => t.id === request.topicId);
  if (!topic) throw new GenerationError("That struggle topic is no longer detected", 404);
  return {
    source: `struggle:${topic.id}`,
    instruction:
      "The user keeps running into this problem. Write a friendly teaching presentation: what goes wrong, why, and step-by-step how to avoid or fix it.",
    material: `Problem: ${topic.label}\nSeen ${topic.occurrences} times (${topic.sources.join(", ")}).\nRecorded errors:\n${topic.examples.map((e) => `- ${e}`).join("\n")}`,
  };
}

export const PRESENTATION_SOURCES: Record<
  PresentationKind,
  (request: PresentationGenerateRequest, deps: PresentationDeps) => PresentationSource | Promise<PresentationSource>
> = {
  task: taskSource,
  web: webSource,
  user: userSource,
  teach: teachSource,
};

function toSlide(raw: any, index: number): PresentationSlideContent {
  const bullets: string[] = Array.isArray(raw?.bullets) ? raw.bullets.map(String).filter((b: string) => b.trim()) : [];
  return {
    title: String(raw?.title ?? "").trim() || `Slide ${index + 1}`,
    bullets,
    ...(typeof raw?.notes === "string" && raw.notes.trim() ? { notes: raw.notes.trim() } : {}),
  };
}

/** Parses the model reply; slides without bullets are dropped and none left is an error. */
export function parsePresentation(content: string): { title: string; slides: PresentationSlideContent[] } {
  let parsed: any;
  try {
    parsed = parseModelJson<any>(content);
  } catch {
    throw new GenerationError("Qwen returned a reply that is not presentation JSON", 502);
  }
  const slides = (Array.isArray(parsed?.slides) ? parsed.slides : [])
    .map(toSlide)
    .filter((s: PresentationSlideContent) => s.bullets.length > 0)
    .slice(0, MAX_SLIDES);
  if (slides.length === 0) throw new GenerationError("Qwen returned no slides", 502);
  return { title: String(parsed?.title ?? "").trim() || "Untitled presentation", slides };
}

/** Routes the request to its kind's source, asks Qwen for the slides and parses them. */
export async function generatePresentation(
  request: PresentationGenerateRequest,
  deps: PresentationDeps,
): Promise<GeneratedPresentation> {
  const build = PRESENTATION_SOURCES[request?.kind];
  if (!build) throw new GenerationError("kind must be task, web, user or teach", 400);
  const src = await build(request, deps);
  const reply = await deps.chat(
    [
      { role: "system", content: PRESENTATION_PROMPT },
      { role: "user", content: `${src.instruction}\n\n${src.material.slice(0, MAX_MATERIAL)}` },
    ],
    { endpoint: request.endpoint, model: request.model, format: "json" },
  );
  if (!reply.success) throw new GenerationError(reply.error || "Qwen unavailable", 502);
  return {
    kind: request.kind,
    source: src.source,
    ...parsePresentation(reply.content),
    endpoint: reply.endpoint,
    createdAt: new Date().toISOString(),
  };
}
