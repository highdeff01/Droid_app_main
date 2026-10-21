/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

/** A screen point tagged from the HUD context menu, persisted by POST /api/hud/entities. */
export interface HudEntity {
  id: string;
  type: "goal" | "context" | "distractor";
  x: number;
  y: number;
  label?: string;
  /** Label of the analyzed element covering the point, when one was found. */
  elementLabel?: string;
  frameWidth?: number;
  frameHeight?: number;
  createdAt: number;
}

/** One action the Qwen guide proposes; it runs only through the action gate after approval. */
export interface HudSuggestedAction {
  name: string;
  action: "click" | "type_text" | "press_key";
  x: number;
  y: number;
  text?: string;
}

/** POST /api/hud/qwen/guide result: the model's own words, never a canned string. */
export interface HudGuideResult {
  thought: string;
  intention: string;
  incompleteTyping: { stepId: string; remainingText: string } | null;
  suggestedActions: HudSuggestedAction[];
}

/** A reusable bundle of a recorded sequence, its plan and reference screenshots (POST /api/hud/packs). */
export interface HudPack {
  id: string;
  name: string;
  sequence: unknown[];
  plan: unknown | null;
  screenshots: string[];
  createdAt: number;
}
