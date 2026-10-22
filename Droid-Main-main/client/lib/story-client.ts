import type {
  GeneratedPresentation,
  GeneratedStory,
  PresentationGenerateRequest,
  StoryGenerateRequest,
  StorySceneAction,
  StruggleTopic,
} from "@shared/story";
import type { ReplayRun } from "@shared/replay";
import { executeTaskAction } from "@/lib/gated-plans";
import type { GatedAction } from "@/lib/gated-dispatch";

/** A finished replay run as listed by GET /api/ai/story/runs. */
export type RecentRun = Pick<ReplayRun, "id" | "target" | "status" | "completed" | "total" | "startedAt" | "error">;

/** Calls a story/presentation route and returns `field`; a `success:false` reply throws its error. */
async function requestField<T>(url: string, field: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined
    ? undefined
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
  if (!data?.success) throw new Error(data?.error || `Request failed (HTTP ${response.status})`);
  return data[field] as T;
}

export const generateStory = (request: StoryGenerateRequest) =>
  requestField<GeneratedStory>("/api/ai/story/generate", "story", request);

export const generatePresentation = (request: PresentationGenerateRequest) =>
  requestField<GeneratedPresentation>("/api/ai/presentations/generate", "presentation", request);

export const fetchStruggles = () =>
  requestField<StruggleTopic[]>("/api/ai/presentations/struggles", "topics");

export const fetchRecentRuns = () =>
  requestField<RecentRun[]>("/api/ai/story/runs", "runs");

const SCENE_ACTION_TYPES: Record<StorySceneAction["actionType"], string> = {
  click: "click",
  type: "type_text",
  hotkey: "press_key",
  scroll: "scroll",
};

/** The gated desktop plan for a scene's suggested action; the gate verifies the point before dispatch. */
export function sceneActionPlan(action: StorySceneAction): GatedAction[] {
  const isHotkey = action.actionType === "hotkey";
  return [
    executeTaskAction(
      {
        id: `story_action_${Date.now()}`,
        name: action.description,
        action: SCENE_ACTION_TYPES[action.actionType],
        x: action.x,
        y: action.y,
        text: isHotkey ? undefined : action.payload,
        key: isHotkey ? action.payload : undefined,
      },
      { targetDevice: "desktop" },
    ),
  ];
}
