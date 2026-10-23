import {
  DesktopAutomationAdapter,
  DesktopCaptureAdapter,
  validateText,
} from "./automation-adapters";
import { centralLogHub } from "./log-hub";
import {
  loadNativeDesktopControl,
  NATIVE_MODULE_NAME,
  type NativeDesktopControl,
} from "./native-desktop-bridge";
import { describePythonResolution, resolvePython } from "./python-resolver";
import {
  DESKTOP_CONTROL_INSTALL_HINT,
  type DesktopControlBackend,
  type DeviceExecutionOutcome,
  executedOutcome,
  failedOutcome,
} from "../shared/device-execution";

export interface DesktopControlSelection {
  backend: DesktopControlBackend;
  /** Why this backend was chosen, e.g. the native load error that forced the fallback. */
  reason: string;
  native: NativeDesktopControl | null;
  /** What to install, only when no backend is available. */
  installHint: string | null;
}

export interface DesktopControlDeps {
  loadNative: () => Promise<NativeDesktopControl>;
  /** Display label of the resolved Python interpreter, or null when none resolves. */
  python: () => string | null;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}

const defaultDeps = (): DesktopControlDeps => ({
  loadNative: () => loadNativeDesktopControl(),
  python: () => {
    const resolution = resolvePython();
    return resolution.found ? describePythonResolution(resolution) : null;
  },
  env: process.env,
  platform: process.platform,
});

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Loads the native module, or returns the reason it cannot run on this machine. */
async function tryNative(deps: DesktopControlDeps): Promise<NativeDesktopControl | string> {
  if (deps.platform === "linux" && !deps.env.DISPLAY && !deps.env.WAYLAND_DISPLAY) {
    return "no DISPLAY or WAYLAND_DISPLAY is set";
  }
  try {
    return await deps.loadNative();
  } catch (err) {
    return errorMessage(err);
  }
}

/** Native first; Python only when the native module is unavailable; otherwise unavailable. */
export async function detectDesktopControl(deps: DesktopControlDeps = defaultDeps()): Promise<DesktopControlSelection> {
  const native = await tryNative(deps);
  if (typeof native !== "string") {
    return { backend: "native", reason: `${NATIVE_MODULE_NAME} loaded`, native, installHint: null };
  }
  const nativeReason = `${NATIVE_MODULE_NAME} unavailable: ${native}`;
  const python = deps.python();
  if (python) {
    return { backend: "python", reason: `${nativeReason}; using Python ${python}`, native: null, installHint: null };
  }
  return {
    backend: "unavailable",
    reason: `${nativeReason}; no Python interpreter found`,
    native: null,
    installHint: DESKTOP_CONTROL_INSTALL_HINT,
  };
}

const BACKEND_LABELS: Record<DesktopControlBackend, string> = {
  native: "native",
  python: "python fallback",
  unavailable: "unavailable",
};

let selection: Promise<DesktopControlSelection> | null = null;

/** Detects the control backend once per process (server startup) and logs the choice. */
export function initDesktopControl(deps?: DesktopControlDeps): Promise<DesktopControlSelection> {
  selection ??= detectDesktopControl(deps).then((chosen) => {
    const message = `Control backend: ${BACKEND_LABELS[chosen.backend]} — ${chosen.reason}`;
    console.log(`[desktop-control] ${message}`);
    centralLogHub.addLog("System", chosen.backend === "unavailable" ? "WARN" : "INFO", message, {
      backend: chosen.backend,
    });
    return chosen;
  });
  return selection;
}

/** Clears the cached selection (tests). */
export function resetDesktopControl(): void {
  selection = null;
}

/** The native control when it was selected at startup; null keeps callers on the Python path. */
export async function activeNativeControl(): Promise<NativeDesktopControl | null> {
  return selection ? (await selection).native : null;
}

/** Health fields describing the selected backend (python when startup detection never ran). */
export async function desktopControlStatus(): Promise<{
  controlBackend: DesktopControlBackend;
  controlReason: string;
  controlInstallHint: string | null;
}> {
  const chosen = selection ? await selection : null;
  return {
    controlBackend: chosen?.backend ?? "python",
    controlReason: chosen?.reason ?? "desktop control detection has not run; using the Python path",
    controlInstallHint: chosen?.installHint ?? null,
  };
}

/** The existing desktop adapters, backed by the native control. */
export function nativeDesktopAdapters(native: NativeDesktopControl) {
  return {
    automation: new DesktopAutomationAdapter(native.pointer, undefined, {
      typeText: native.typeText,
      key: native.key,
    }),
    capture: new DesktopCaptureAdapter(native.captureFrame),
  };
}

/** A desktop action in the shape the desktop routes receive it. */
export interface NativeActionRequest {
  action: string;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  text?: string;
  key?: string;
  delayMs?: number;
}

type NativeActionRunner = (control: NativeDesktopControl, req: NativeActionRequest) => Promise<void>;

const point = (req: NativeActionRequest) => ({ x: req.x ?? 960, y: req.y ?? 540 });
const selectAllKey = () => (process.platform === "darwin" ? "cmd" : "ctrl");
const clickRunner =
  (button: "left" | "right", double: boolean): NativeActionRunner =>
  (control, req) =>
    control.click(point(req).x, point(req).y, button, double);

const pressKey: NativeActionRunner = (control, req) => {
  const key = (req.key || "enter").trim();
  return key.includes("+") ? control.hotkey(key.split("+")) : control.key(key);
};

const typeText: NativeActionRunner = (control, req) => control.typeText(validateText(req.text ?? ""));

const drag: NativeActionRunner = (control, req) => {
  if (req.toX === undefined || req.toY === undefined) {
    throw new Error("drag requires toX and toY");
  }
  return control.drag([point(req), { x: req.toX, y: req.toY }]);
};

/** One runner per desktop action name the routes accept. */
const NATIVE_ACTIONS: Record<string, NativeActionRunner> = {
  move: (control, req) => control.move(point(req).x, point(req).y),
  mouse_move: (control, req) => control.move(point(req).x, point(req).y),
  hover: (control, req) => control.move(point(req).x, point(req).y),
  click: clickRunner("left", false),
  tap: clickRunner("left", false),
  focus_and_click: clickRunner("left", false),
  double_click: clickRunner("left", true),
  double_tap: clickRunner("left", true),
  right_click: clickRunner("right", false),
  drag,
  swipe: drag,
  drag_and_drop: drag,
  type: typeText,
  type_text: typeText,
  type_no_focus: typeText,
  clear_and_type: async (control, req) => {
    await control.hotkey([selectAllKey(), "a"]);
    await typeText(control, req);
  },
  key: pressKey,
  press_key: pressKey,
  hotkey: (control, req) => control.hotkey((req.key || "").split("+")),
  scroll: (control, req) => control.scroll(point(req).x, point(req).y, req.key === "up" ? "up" : "down"),
  wait: (_control, req) => new Promise((resolve) => setTimeout(resolve, Math.min(req.delayMs ?? 500, 5000))),
  sleep: (_control, req) => new Promise((resolve) => setTimeout(resolve, Math.min(req.delayMs ?? 500, 5000))),
};

/** Runs one desktop action natively; executed only when the native call returned. */
export async function runNativeDesktopAction(
  control: NativeDesktopControl,
  req: NativeActionRequest,
): Promise<DeviceExecutionOutcome> {
  const runner = NATIVE_ACTIONS[req.action];
  if (!runner) return failedOutcome(`Native desktop control does not support "${req.action}"; the action did not execute.`);
  try {
    await runner(control, req);
    return executedOutcome();
  } catch (err) {
    return failedOutcome(`Native desktop ${req.action} failed: ${errorMessage(err)}`);
  }
}

/** Runs actions in order and stops at the first that does not execute. */
export async function runNativeDesktopActions(
  control: NativeDesktopControl,
  requests: NativeActionRequest[],
): Promise<DeviceExecutionOutcome> {
  for (const req of requests) {
    const outcome = await runNativeDesktopAction(control, req);
    if (!outcome.executed) return outcome;
  }
  return executedOutcome();
}
