/**
 * Preview Mode: an explicit, labelled stand-in for device control when no
 * automation backend can run here (static hosts, CI, no Python/native
 * control). Device actions are simulated on the client and every one is
 * badged PREVIEW (simulated) — a simulated reply is never a success and never
 * claims it executed. Real mode is untouched while Preview Mode is off.
 */
import { toast } from "sonner";
import {
  BACKEND_REPROBE_MS,
  getBackendStatus,
  readJsonReply,
  subscribeBackendStatus,
  type BackendStatus,
} from "@/lib/backend-status";

export const PREVIEW_BADGE = "PREVIEW (simulated)";
export const CONTROL_HEALTH_URL = "/api/pyautogui/health";
export const PREVIEW_REASON_BACKEND = "Backend API not reachable";
export const PREVIEW_REASON_CONTROL = "No control backend available (native nut-js or Python pyautogui)";
export const PREVIEW_REASON_MANUAL = "Enabled manually in Settings";
export const PREVIEW_EVENT_LIMIT = 50;

export interface PreviewState {
  active: boolean;
  /** Why Preview Mode is active; null when it is off. */
  reason: string | null;
  /** Session-only manual choice from Settings; null follows auto-detection. */
  override: boolean | null;
  /** What auto-detection found missing; null when a real backend is available (or not yet known). */
  detected: string | null;
}

export interface PreviewEvent {
  id: number;
  at: number;
  /** Always starts with PREVIEW_BADGE. */
  message: string;
}

/** Reply of a simulated device action: never success, never executed. */
export interface SimulatedDeviceReply {
  success: false;
  executed: false;
  simulated: true;
  preview: true;
  status: "preview";
  message: string;
}

/** The missing piece that puts the app in Preview Mode, or null while the backend and control are available or unknown. */
export function detectPreviewNeed(backend: BackendStatus, controlBackend: string | null): string | null {
  if (backend.state === "unreachable") return PREVIEW_REASON_BACKEND;
  if (backend.state === "reachable" && controlBackend === "unavailable") return PREVIEW_REASON_CONTROL;
  return null;
}

/** Text badged as simulated. */
export function previewLabel(text: string): string {
  return `${PREVIEW_BADGE}: ${text}`;
}

const INITIAL: PreviewState = { active: false, reason: null, override: null, detected: null };
let state: PreviewState = INITIAL;
let events: PreviewEvent[] = [];
let nextEventId = 1;
const stateListeners = new Set<() => void>();
const eventListeners = new Set<() => void>();

export function getPreviewState(): PreviewState {
  return state;
}

export function subscribePreviewState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function isPreviewActive(): boolean {
  return state.active;
}

export function getPreviewEvents(): PreviewEvent[] {
  return events;
}

export function subscribePreviewEvents(listener: () => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function resolve(override: boolean | null, detected: string | null): PreviewState {
  const active = override ?? detected !== null;
  const reason = !active ? null : override ? PREVIEW_REASON_MANUAL : detected;
  return { active, reason, override, detected };
}

function commit(next: PreviewState): void {
  state = next;
  stateListeners.forEach((listener) => listener());
}

/** Applies an auto-detection result; announces entering and leaving when it changes the mode. */
export function applyPreviewDetection(detected: string | null): void {
  const previous = state;
  const next = resolve(previous.override, detected);
  commit(next);
  if (!previous.active && next.active) {
    toast.warning(`${PREVIEW_BADGE} — Preview Mode on: ${detected}`, {
      description: "Clicks, typing and steps are simulated on the client; nothing runs on a device.",
    });
  } else if (previous.active && !next.active) {
    toast.success("Real backend reachable — Preview Mode off", {
      description: "Device actions now run for real through the automation backend.",
    });
  }
}

/** Manual toggle from Settings (session only); null hands control back to auto-detection. */
export function setPreviewOverride(override: boolean | null): void {
  commit(resolve(override, state.detected));
}

/** Records one simulated action in the event feed and returns its labelled reply. */
export function simulateDeviceAction(actionLabel: string): SimulatedDeviceReply {
  const message = previewLabel(`${actionLabel} — not executed on any device`);
  events = [...events.slice(-(PREVIEW_EVENT_LIMIT - 1)), { id: nextEventId++, at: Date.now(), message }];
  eventListeners.forEach((listener) => listener());
  return { success: false, executed: false, simulated: true, preview: true, status: "preview", message };
}

/** Clears state and the event feed (tests). */
export function resetPreviewMode(): void {
  state = INITIAL;
  events = [];
  nextEventId = 1;
}

/** The control backend the server selected at startup ([desktop-control]); null when the reply is not usable JSON. */
export async function fetchControlBackend(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const reply = await readJsonReply(await fetchImpl(CONTROL_HEALTH_URL, { cache: "no-store" }));
    const backend = reply.json ? reply.body?.controlBackend : undefined;
    return typeof backend === "string" ? backend : null;
  } catch {
    return null;
  }
}

/**
 * Follows the backend probe: unreachable enters Preview Mode; reachable checks
 * the control backend, re-polling it every `pollMs` while it is unavailable.
 * Leaves Preview Mode automatically once both answer. Returns a stop function.
 */
export function startPreviewWatcher(fetchImpl: typeof fetch = fetch, pollMs = BACKEND_REPROBE_MS): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const evaluate = async () => {
    clearTimeout(timer);
    const backend = getBackendStatus();
    const control = backend.state === "reachable" ? await fetchControlBackend(fetchImpl) : null;
    if (stopped || getBackendStatus() !== backend) return;
    const detected = detectPreviewNeed(backend, control);
    applyPreviewDetection(detected);
    if (detected === PREVIEW_REASON_CONTROL) timer = setTimeout(() => void evaluate(), pollMs);
  };
  const unsubscribe = subscribeBackendStatus(() => void evaluate());
  void evaluate();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
}
