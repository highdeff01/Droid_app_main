/**
 * Assistant control contract shared by the workspace chat and the
 * /api/assistant/control routes: chat commands, monitor cadences, input-action
 * kinds and the /use target matcher.
 */

export type MonitorMode = "background" | "advanced";

/** Screenshot cadence per monitor mode: background every second, advanced every quarter second. */
export const MONITOR_INTERVAL_MS: Record<MonitorMode, number> = {
  background: 1000,
  advanced: 250,
};

export function isMonitorMode(value: unknown): value is MonitorMode {
  return value === "background" || value === "advanced";
}

export type AssistantCommand =
  | { kind: "use"; target: string }
  | { kind: "log" }
  | { kind: "monitor"; mode: MonitorMode | "off" }
  | { kind: "usage_error"; message: string }
  | { kind: "text"; text: string };

export const USE_USAGE = "Usage: /use <target>, e.g. /use Submit button";
export const MONITOR_USAGE = "Usage: /monitor background | advanced | off";

function stripQuotes(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value);
  return (match ? match[2] : value).trim();
}

/** Parses one chat line; the command keyword is case-insensitive. */
export function parseAssistantCommand(input: string): AssistantCommand {
  const line = input.trim();
  const match = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(line);
  if (!match) return { kind: "text", text: line };
  const keyword = match[1].toLowerCase();
  const rest = stripQuotes((match[2] ?? "").trim());
  if (keyword === "use")
    return rest ? { kind: "use", target: rest } : { kind: "usage_error", message: USE_USAGE };
  if (keyword === "log") return { kind: "log" };
  if (keyword === "monitor") {
    const mode = rest.toLowerCase();
    if (mode === "off" || isMonitorMode(mode)) return { kind: "monitor", mode };
    return { kind: "usage_error", message: MONITOR_USAGE };
  }
  return { kind: "text", text: line };
}

export type InputKind = "mouse" | "keyboard";

const INPUT_KINDS: Record<string, InputKind> = {
  click: "mouse",
  double_click: "mouse",
  right_click: "mouse",
  move: "mouse",
  drag: "mouse",
  drag_and_drop: "mouse",
  scroll: "mouse",
  tap: "mouse",
  double_tap: "mouse",
  swipe: "mouse",
  "mouse-click": "mouse",
  "mouse-move": "mouse",
  type: "keyboard",
  type_text: "keyboard",
  type_no_focus: "keyboard",
  clear_and_type: "keyboard",
  press_key: "keyboard",
  key: "keyboard",
  hotkey: "keyboard",
  "keyboard-key": "keyboard",
  "keyboard-text": "keyboard",
};

/** Mouse or keyboard for an input action name; null for waits and non-input actions. */
export function classifyInputAction(action: string): InputKind | null {
  return INPUT_KINDS[action.toLowerCase()] ?? null;
}

export interface MatchableElement {
  name: string;
  textValue?: string;
  confidence: number | null;
}

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const words = (value: string) => normalize(value).split(/[^a-z0-9]+/).filter(Boolean);

/** 3 exact label, 2 label contains target (or the reverse), 1 shared words fraction; 0 no match. */
function matchScore(target: string, element: MatchableElement): number {
  const wanted = normalize(target);
  const labels = [element.name, element.textValue ?? ""].map(normalize).filter(Boolean);
  if (labels.some((label) => label === wanted)) return 3;
  if (labels.some((label) => label.includes(wanted) || wanted.includes(label))) return 2;
  const targetWords = words(target);
  const labelWords = new Set(labels.flatMap(words));
  const shared = targetWords.filter((w) => labelWords.has(w)).length;
  return targetWords.length ? shared / targetWords.length : 0;
}

/** The element whose label best matches the target; ties go to the higher confidence. */
export function matchTargetElement<T extends MatchableElement>(target: string, elements: T[]): T | null {
  let best: { element: T; score: number; confidence: number } | null = null;
  for (const element of elements) {
    const score = matchScore(target, element);
    if (score <= 0) continue;
    const confidence = element.confidence ?? 0;
    if (!best || score > best.score || (score === best.score && confidence > best.confidence))
      best = { element, score, confidence };
  }
  return best?.element ?? null;
}
