/**
 * Where the AI may act: the entire PC screen (default) or only the region of
 * the screen the HUD canvas occupies. The mode is persisted; the region is
 * measured live from the mounted HUD. The action gate and every replay
 * dispatch read the active scope, so AI-initiated device actions outside the
 * chosen region are blocked before anything is dispatched.
 */
import { useSyncExternalStore } from "react";
import type { DetectedUIElement, ScreenPerceptionReport } from "@/components/dual-ai-copilot-panel";
import type { GateTarget } from "@/lib/action-gate";

export type AiScopeMode = "full" | "hud";

/** A rectangle in desktop screen pixels (the coordinate space of desktop gate targets). */
export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiScope {
  mode: AiScopeMode;
  /** The HUD canvas on screen; null while no HUD is mounted. */
  region: ScreenRegion | null;
}

export const AI_SCOPE_STORAGE_KEY = "sightline_ai_scope";

export const AI_SCOPE_LABEL: Record<AiScopeMode, string> = {
  full: "Entire PC screen",
  hud: "HUD canvas only",
};

type ScopeStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): ScopeStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** The persisted mode; anything other than "hud" (including nothing stored) is the full screen. */
export function loadScopeMode(storage: ScopeStorage | undefined = browserStorage()): AiScopeMode {
  return storage?.getItem(AI_SCOPE_STORAGE_KEY) === "hud" ? "hud" : "full";
}

let state: AiScope = { mode: loadScopeMode(), region: null };
const listeners = new Set<() => void>();

function publish(next: AiScope) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getAiScope(): AiScope {
  return state;
}

export function setScopeMode(mode: AiScopeMode, storage: ScopeStorage | undefined = browserStorage()) {
  storage?.setItem(AI_SCOPE_STORAGE_KEY, mode);
  if (mode !== state.mode) publish({ ...state, mode });
}

const sameRegion = (a: ScreenRegion | null, b: ScreenRegion | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

export function setHudRegion(region: ScreenRegion | null) {
  if (!sameRegion(region, state.region)) publish({ ...state, region });
}

export function subscribeAiScope(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The live scope for components (selector, cognition panel). */
export function useAiScope(): AiScope {
  return useSyncExternalStore(subscribeAiScope, getAiScope, getAiScope);
}

interface WindowGeometry {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/**
 * A viewport rectangle (getBoundingClientRect) in desktop screen pixels: the
 * window's screen position plus the browser chrome (side borders split evenly,
 * the rest on top), scaled by the device pixel ratio.
 */
export function clientRectToScreenRegion(
  rect: { left: number; top: number; width: number; height: number },
  win: WindowGeometry,
): ScreenRegion {
  const ratio = win.devicePixelRatio || 1;
  const border = Math.max(0, (win.outerWidth - win.innerWidth) / 2);
  const chromeTop = Math.max(0, win.outerHeight - win.innerHeight - border);
  return {
    x: Math.round((win.screenX + border + rect.left) * ratio),
    y: Math.round((win.screenY + chromeTop + rect.top) * ratio),
    width: Math.round(rect.width * ratio),
    height: Math.round(rect.height * ratio),
  };
}

export const regionContains = (region: ScreenRegion, x: number, y: number) =>
  x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height;

/** Only desktop targets are screen pixels; phone coordinates are not constrained by a desktop region. */
const scoped = (scope: AiScope, targetDevice: string) => scope.mode === "hud" && targetDevice === "desktop";

/** The target the gate checks, or the reason the scope refuses it (exactly one is set). */
export type ScopedTarget = { target: GateTarget; reason?: undefined } | { target?: undefined; reason: string };

/**
 * The gate target under the scope. Full screen leaves it unchanged; HUD scope
 * maps relative (0–1) targets into the region and refuses absolute targets
 * outside it (never clamped: a clamped point is not what the AI chose).
 */
export function scopeTarget(target: GateTarget, scope: AiScope, targetDevice: string): ScopedTarget {
  if (!scoped(scope, targetDevice) || !target.needsTarget) return { target };
  const region = scope.region;
  if (!region) return { reason: "AI scope is the HUD canvas, but no HUD canvas is on screen" };
  if (target.relative) {
    return {
      target: {
        ...target,
        relative: false,
        x: Math.round(region.x + target.x * region.width),
        y: Math.round(region.y + target.y * region.height),
      },
    };
  }
  if (regionContains(region, target.x, target.y)) return { target };
  return {
    reason: `Target (${target.x}, ${target.y}) is outside the HUD canvas region (${region.x}, ${region.y}, ${region.width}×${region.height}); AI scope is the HUD canvas only`,
  };
}

const overlaps = (el: DetectedUIElement, region: ScreenRegion) => {
  const box = el.boundingBox;
  return (
    !!box &&
    box.x < region.x + region.width &&
    box.x + box.width > region.x &&
    box.y < region.y + region.height &&
    box.y + box.height > region.y
  );
};

/** The analysis limited to elements inside the scope, so the gate never verifies against the rest of the screen. */
export function scopeReport(report: ScreenPerceptionReport, scope: AiScope, targetDevice: string): ScreenPerceptionReport {
  if (!scoped(scope, targetDevice) || !scope.region) return report;
  const region = scope.region;
  return { ...report, elements: (report.elements ?? []).filter((el) => overlaps(el, region)) };
}

const POSITIONAL_STEP = new Set(["click", "double_click", "right_click", "clear_and_type", "type_text", "type", "scroll", "tap", "double_tap"]);

/** Why a replay may not be dispatched under the scope (first offending step), or null when every step is inside it. */
export function stepsOutsideScope(
  steps: ReadonlyArray<{ action: string; x: number; y: number; name?: string }>,
  scope: AiScope,
  targetDevice: string,
): string | null {
  for (const step of steps) {
    if (!POSITIONAL_STEP.has(step.action)) continue;
    const result = scopeTarget({ x: step.x, y: step.y, label: step.name, needsTarget: true }, scope, targetDevice);
    if (result.reason !== undefined) return step.name ? `Step "${step.name}": ${result.reason}` : result.reason;
  }
  return null;
}

/** Throws before a replay dispatch whose steps leave the active scope. */
export function assertStepsInScope(
  steps: ReadonlyArray<{ action: string; x: number; y: number; name?: string }>,
  targetDevice: string,
  scope: AiScope = getAiScope(),
) {
  const reason = stepsOutsideScope(steps, scope, targetDevice);
  if (reason) throw new Error(`Replay not dispatched: ${reason}`);
}
