import { gateTargetForAction, type GateTarget } from "@/lib/action-gate";
import { postDeviceAction, type GatedAction } from "@/lib/gated-dispatch";

/**
 * The gated action plans for every AI/replay-driven dispatch path outside the Dashboard.
 * Each plan keeps the endpoint and body its component always posted; the gate runs first.
 */

export interface PlanStep {
  id?: string;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  key?: string;
  delayMs?: number;
}

/** Gate `target`, then POST `body` to `url`. */
export function gatedPost(
  url: string,
  body: unknown,
  target: GateTarget,
  delayMs?: number,
): GatedAction {
  return { target, dispatch: () => postDeviceAction(url, body), delayMs };
}

/** Gate a step's point, then POST it to /api/execute-task in the shape the components used. */
export function executeTaskAction(
  step: PlanStep,
  context: { targetDevice?: string; deviceId?: string; extra?: Record<string, unknown> } = {},
): GatedAction {
  const body = {
    ...(context.targetDevice ? { targetDevice: context.targetDevice } : {}),
    ...(context.deviceId ? { deviceId: context.deviceId } : {}),
    task: {
      id: step.id,
      name: step.name,
      action: step.action,
      targetPosition: { x: step.x, y: step.y },
      textPayload: step.text ?? "",
      ...(step.key ? { keyPayload: step.key } : {}),
    },
    ...context.extra,
  };
  const target = gateTargetForAction(step.action, step.x, step.y, step.name);
  return gatedPost("/api/execute-task", body, target, step.delayMs);
}

/** ai-learning-code-synthesizer-studio: run the synthesized script on the desktop. */
export function synthesizedScriptPlan(): GatedAction[] {
  return [
    executeTaskAction(
      { id: `script_exec_${Date.now()}`, name: "Execute Synthesized Script", action: "click", x: 960, y: 540 },
      { targetDevice: "desktop" },
    ),
  ];
}

/** click-sequence-register: the AI mirrors the latest recorded step. */
export function aiRepeatPlan(step: PlanStep): GatedAction[] {
  return [
    executeTaskAction({ ...step, id: `ai_mimic_${step.id}`, name: `AI Repeat: ${step.name}`, delayMs: 0 }),
  ];
}

export interface RoutePointLike {
  x: number;
  y: number;
}

/** continuous-mouse-route-player: stream the whole route once the screen is analyzed. */
export function mouseRoutePlan(
  routePoints: RoutePointLike[],
  options: { speedMultiplier: number; driftPx: number; isDrag: boolean },
): GatedAction[] {
  const start = routePoints[0];
  const body = {
    targetDevice: "desktop",
    task: {
      id: `route_${Date.now()}`,
      name: "Continuous Navigational Mouse Route",
      action: "stream_mouse_route",
      routePoints,
      ...options,
    },
  };
  const target = gateTargetForAction("stream_mouse_route", start.x, start.y, "Route start");
  return [gatedPost("/api/execute-task", body, target)];
}

/** dynamic-calculator-typing-hub: type the payload into the field at `coords`. */
export function typingPlan(
  targetDevice: string,
  coords: RoutePointLike,
  text: string,
  clearFirst: boolean,
): GatedAction[] {
  const action = clearFirst ? "clear_and_type" : "type";
  return [
    executeTaskAction(
      { id: `type_task_${Date.now()}`, name: `Type Payload on ${targetDevice}`, action, x: coords.x, y: coords.y, text },
      { targetDevice },
    ),
  ];
}

/** three-ai-agents-squad: automate a detected habit for `repeatCount` cycles. */
export function habitRoutinePlan(x: number, y: number, repeatCount: number): GatedAction[] {
  const body = {
    task: { name: "Habit Routine Loop", action: "click", targetPosition: { x, y }, delayMs: 400 },
    repeatCount,
  };
  return [gatedPost("/api/execute-task", body, gateTargetForAction("click", x, y, "Habit Routine Loop"))];
}

/** workflow-debugger-panel / AIDecideActionHUD fallback: one gated execute-task per step. */
export function stepSequencePlan(
  steps: PlanStep[],
  context: { targetDevice?: string; deviceId?: string } = {},
): GatedAction[] {
  return steps.map((step) => executeTaskAction(step, context));
}

/** workflow-debugger-panel: retry a segment through the bridge after verifying its first target. */
export function retrySegmentPlan(
  steps: PlanStep[],
  body: Record<string, unknown>,
): GatedAction[] {
  const first = steps[0];
  const target = gateTargetForAction(first.action, first.x, first.y, first.name);
  return [gatedPost("/api/pyautogui/retry-segment", { ...body, steps }, target)];
}

/** Gate each step's point, then hand it to a component callback. */
export function callbackPlan(
  steps: PlanStep[],
  dispatch: (step: PlanStep) => unknown,
): GatedAction[] {
  return steps.map((step) => ({
    target: gateTargetForAction(step.action, step.x, step.y, step.name),
    dispatch: () => dispatch(step),
    delayMs: step.delayMs,
  }));
}

/** A MobileRemote phone action: x/y are 0–1 fractions of the phone screen. */
export interface MobileActionLike {
  type?: string;
  x?: number;
  y?: number;
  description?: string;
  durationMs?: number;
}

/** MobileRemote AI chat / synced workflow: gate each phone action (relative point), then execute it. */
export function mobileActionPlan<T extends MobileActionLike>(
  actions: T[],
  dispatch: (action: T) => unknown,
): GatedAction[] {
  return actions.map((act) => ({
    target: gateTargetForAction(act.type || "tap", act.x ?? 0.5, act.y ?? 0.5, act.description, true),
    dispatch: () => dispatch(act),
    delayMs: act.durationMs,
  }));
}

/** virtual-desktop-mirror-studio: the main AI clicks the cued point on the mirrored desktop. */
export function mirrorAiMovePlan(x: number, y: number): GatedAction[] {
  const body = { action: "click", x, y, deviceMode: "desktop_mirror" };
  return [gatedPost("/api/pyautogui/interactive-action", body, gateTargetForAction("click", x, y, "AI navigation cue"))];
}

/** LiveExecutionConsole: send the configured action through the bridge or the parent dispatcher. */
export function bridgeActionPlan(
  action: string,
  payload: { targetPosition: RoutePointLike } & Record<string, unknown>,
  dispatch?: (action: string, payload: unknown) => unknown,
): GatedAction[] {
  const { x, y } = payload.targetPosition;
  const target = gateTargetForAction(action, x, y, `Bridge ${action}`);
  return [
    {
      target,
      dispatch: () => (dispatch ? dispatch(action, payload) : postDeviceAction("/api/pyautogui/bridge", payload)),
    },
  ];
}
