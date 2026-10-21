import { z } from "zod";
import type { ReplayStep } from "./replay";

/** Raw user interactions captured by the Android companion's accessibility service. */
const pixel = z.number().finite().min(0).max(16384);
const at = z.number().finite().nonnegative();
export const recordedEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("click"), x: pixel, y: pixel, at, label: z.string().max(200).optional() }),
  z.object({ kind: z.literal("scroll"), x: pixel, y: pixel, at, direction: z.enum(["up", "down", "left", "right"]) }),
  z.object({
    kind: z.literal("text"), at, field: z.string().max(200), text: z.string().max(4000),
    previous: z.string().max(4000), password: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("key"), at, key: z.enum(["HOME", "BACK", "APP_SWITCH"]) }),
]);
export const actionRecordingSchema = z.object({
  name: z.string().trim().min(1).max(200),
  screenWidth: z.number().int().min(1).max(16384),
  screenHeight: z.number().int().min(1).max(16384),
  events: z.array(recordedEventSchema).max(500),
});
export type RecordedEvent =
  | { kind: "click"; x: number; y: number; at: number; label?: string }
  | { kind: "scroll"; x: number; y: number; at: number; direction: "up" | "down" | "left" | "right" }
  | { kind: "text"; at: number; field: string; text: string; previous: string; password?: boolean }
  | { kind: "key"; at: number; key: "HOME" | "BACK" | "APP_SWITCH" };
export interface ActionRecording { name: string; screenWidth: number; screenHeight: number; events: RecordedEvent[] }
type ScrollEvent = Extract<RecordedEvent, { kind: "scroll" }>;
type TextEvent = Extract<RecordedEvent, { kind: "text" }>;

/** The action shape /api/mobile-stream/workflows stores; coordinates are 0..1 of the phone display. */
export interface WorkflowAction {
  type: "tap" | "swipe" | "type" | "key" | (string & {});
  x?: number; y?: number; toX?: number; toY?: number;
  text?: string; key?: string;
  durationMs?: number;
  description?: string;
  repeatCount?: number;
}
export interface SkippedEvent { index: number; reason: string }

const SCROLL_MERGE_MS = 700, SWIPE_SPAN = 0.3;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const printable = /^[\x20-\x7e]+$/;

function swipeFor(event: ScrollEvent, x: number, y: number): WorkflowAction {
  // Content scrolling "down" means the finger moves up.
  const half = SWIPE_SPAN / 2, vertical = event.direction === "up" || event.direction === "down";
  const sign = event.direction === "down" || event.direction === "right" ? 1 : -1;
  const from = (center: number) => clamp(center + sign * half), to = (center: number) => clamp(center - sign * half);
  return vertical
    ? { type: "swipe", x, y: from(y), toX: x, toY: to(y), durationMs: 350, description: `Scroll ${event.direction}` }
    : { type: "swipe", x: from(x), y, toX: to(x), toY: y, durationMs: 350, description: `Scroll ${event.direction}` };
}

function textAction(first: TextEvent, last: TextEvent): WorkflowAction | string {
  if (first.password || last.password) return "Password fields are never recorded";
  if (!last.text.startsWith(first.previous)) return "Text edit was not an append; re-type it to record it";
  const typed = last.text.slice(first.previous.length);
  if (!typed) return "Text field change added no text";
  if (!printable.test(typed) || typed.length > 2000) return "Only printable ASCII text up to 2000 characters can be replayed";
  return { type: "type", text: typed, description: `Type "${typed}"` };
}

/** Converts recorded events into replayable workflow actions; unconvertible events are reported, never faked. */
export function recordingToActions(recording: ActionRecording): { actions: WorkflowAction[]; skipped: SkippedEvent[] } {
  const actions: WorkflowAction[] = [], skipped: SkippedEvent[] = [];
  const { events, screenWidth, screenHeight } = recording;
  const nx = (x: number) => clamp(x / screenWidth), ny = (y: number) => clamp(y / screenHeight);
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.kind === "click") {
      actions.push({ type: "tap", x: nx(event.x), y: ny(event.y), description: event.label ? `Tap "${event.label}"` : "Tap" });
    } else if (event.kind === "key") {
      actions.push({ type: "key", key: event.key, description: `Press ${event.key.replace("_", " ")}` });
    } else if (event.kind === "scroll") {
      let end = index;
      while (events[end + 1]?.kind === "scroll" && (events[end + 1] as ScrollEvent).direction === event.direction && events[end + 1].at - events[end].at <= SCROLL_MERGE_MS) end++;
      actions.push(swipeFor(event, nx(event.x), ny(event.y)));
      index = end;
    } else {
      let end = index;
      while (events[end + 1]?.kind === "text" && (events[end + 1] as TextEvent).field === event.field) end++;
      const result = textAction(event, events[end] as TextEvent);
      if (typeof result === "string") skipped.push({ index, reason: result });
      else actions.push(result);
      index = end;
    }
  }
  return { actions, skipped };
}

const repeat = (value: number | undefined) => Math.min(25, Math.max(1, Math.floor(value ?? 1)));
const pixelOf = (value: number | undefined, size: number) => Math.round(clamp(value ?? 0.5) * (size - 1));

function stepAction(action: WorkflowAction): Pick<ReplayStep, "action" | "text" | "keyPayload"> {
  switch (action.type) {
    case "tap": return { action: "click" };
    case "swipe": return { action: "scroll" };
    case "type": case "type_text": return { action: "type_text", text: action.text };
    case "key": return { action: "press_key", keyPayload: action.key };
    case "home": return { action: "press_key", keyPayload: "HOME" };
    case "back": return { action: "press_key", keyPayload: "BACK" };
    case "app_switch": case "recents": return { action: "press_key", keyPayload: "APP_SWITCH" };
    default: throw new Error(`The phone cannot replay a "${action.type}" step`);
  }
}

/** Maps saved normalized actions onto replay steps in pixels of the given phone frame, keeping per-step repeats. */
export function actionsToReplaySteps(actions: WorkflowAction[], frame: { width: number; height: number }, repeatOverride?: number): ReplayStep[] {
  if (!actions.length) throw new Error("Workflow has no action steps");
  return actions.map((action, index) => {
    let mapped: ReturnType<typeof stepAction>;
    try { mapped = stepAction(action); } catch (error) { throw new Error(`Step ${index + 1}: ${(error as Error).message}`); }
    const swipe = action.type === "swipe";
    if (swipe && (action.toX === undefined || action.toY === undefined)) throw new Error(`Step ${index + 1}: swipe has no end point`);
    return {
      id: `step-${index + 1}`,
      name: action.description || `Step ${index + 1}: ${action.type}`,
      ...mapped,
      x: pixelOf(action.x, frame.width), y: pixelOf(action.y, frame.height),
      ...(swipe ? { toX: pixelOf(action.toX, frame.width), toY: pixelOf(action.toY, frame.height) } : {}),
      delayMs: 500,
      repeatCount: repeat(repeatOverride ?? action.repeatCount),
    };
  });
}
