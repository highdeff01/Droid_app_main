/** Story mode and versatile presentations: every text field comes from the model, never seeded. */

export type StoryPerspective = "user_viewpoint" | "ai_agent_viewpoint" | "environment_viewpoint";

export const STORY_PERSPECTIVES: readonly StoryPerspective[] = [
  "user_viewpoint",
  "ai_agent_viewpoint",
  "environment_viewpoint",
];

export type StorySourceKind = "premise" | "topic" | "screen" | "run";

export interface StoryGenerateRequest {
  source: StorySourceKind;
  /** Premise or topic text (premise/topic sources). */
  text?: string;
  /** PNG/JPEG data URL (screen source). */
  imageData?: string;
  /** Replay run id (run source). */
  runId?: string;
  /** Narrating viewpoint, or "mixed" to let scenes alternate. */
  perspective?: StoryPerspective | "mixed";
  sceneCount?: number;
  endpoint?: string;
  model?: string;
}

/** A device action a screen-derived scene suggests; always dispatched through the action gate. */
export interface StorySceneAction {
  actionType: "click" | "type" | "hotkey" | "scroll";
  x: number;
  y: number;
  payload?: string;
  description: string;
}

export interface StoryScene {
  id: string;
  sceneNumber: number;
  title: string;
  perspective: StoryPerspective;
  narrativeDescription: string;
  decisionTurn: string;
  predictedNextTurn: string;
  /** Real screenshot (screen/run stories); null means the UI shows labeled placeholder art. */
  backgroundImage: string | null;
  inAppAction?: StorySceneAction;
}

export interface GeneratedStory {
  title: string;
  source: StorySourceKind;
  scenes: StoryScene[];
  endpoint?: string;
  createdAt: string;
}

export type PresentationKind = "task" | "web" | "user" | "teach";

export interface PresentationGenerateRequest {
  kind: PresentationKind;
  /** task: replay run id. */
  runId?: string;
  /** web: URL to read. */
  url?: string;
  /** web: topic (when no URL); user: the content to present. */
  text?: string;
  /** teach: id of a detected struggle topic the user approved. */
  topicId?: string;
  endpoint?: string;
  model?: string;
}

export interface PresentationSlideContent {
  title: string;
  bullets: string[];
  notes?: string;
}

export interface GeneratedPresentation {
  kind: PresentationKind;
  title: string;
  /** Where the content came from: run id, URL, "model_knowledge", "user_input" or the struggle topic. */
  source: string;
  slides: PresentationSlideContent[];
  endpoint?: string;
  createdAt: string;
}

/** Something the user repeatedly struggles with, from real error/retry records. */
export interface StruggleTopic {
  id: string;
  label: string;
  /** How many recorded failures/retries share this key. */
  occurrences: number;
  sources: string[];
  /** Sample error messages as recorded. */
  examples: string[];
  lastSeen: string;
}
