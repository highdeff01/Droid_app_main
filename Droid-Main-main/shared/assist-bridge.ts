/**
 * Wire contract between this app's assist bridge (server/assist-bridge/) and the
 * droid-assist prototype. Documented in docs/assist-bridge-protocol.md — keep both in sync.
 */
import { z } from "zod";

export const ASSIST_BRIDGE_PROTOCOL_VERSION = 1;
export const ASSIST_BRIDGE_DEFAULT_HOST = "127.0.0.1";
export const ASSIST_BRIDGE_DEFAULT_PORT = 3010;
export const ASSIST_BRIDGE_DEFAULT_INTERVAL_MS = 500;
export const ASSIST_BRIDGE_MIN_INTERVAL_MS = 250;
export const ASSIST_BRIDGE_MAX_INTERVAL_MS = 2000;

/** Every message, both directions: {type, id, ts, payload}. */
export interface AssistEnvelope<T extends string = string, P = unknown> {
  type: T;
  id: string;
  ts: number;
  payload: P;
}

/** A streamed screen frame: JPEG data URL plus pixel size and capture time. */
export interface AssistFrame {
  jpeg: string;
  w: number;
  h: number;
  ts: number;
}

export const ASSIST_COMMAND_TYPES = [
  "request_fresh_frame",
  "report_state",
  "run_script",
  "intercept_notice",
] as const;
export type AssistCommandType = (typeof ASSIST_COMMAND_TYPES)[number];

export const ASSIST_EVENT_TYPES = ["error", "state_change", "element_change", "test_request"] as const;
export type AssistEventType = (typeof ASSIST_EVENT_TYPES)[number];

/** Server → assist message types. */
export type AssistServerMessageType = "hello" | "frame" | "frame_standby" | "reply" | AssistEventType;

export const SCRIPT_MAX_STEPS = 20;
export const SCRIPT_MAX_TEXT = 500;
export const SCRIPT_MAX_WAIT_MS = 5000;
export const SCRIPT_MAX_TOTAL_WAIT_MS = 15000;
export const SCRIPT_MAX_COORD = 10000;

const coord = z.number().int().min(0).max(SCRIPT_MAX_COORD);
const optionalCoords = { x: coord.optional(), y: coord.optional() };

export const scriptStepSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("click"), x: coord, y: coord }).strict(),
  z.object({ op: z.literal("type"), text: z.string().min(1).max(SCRIPT_MAX_TEXT), ...optionalCoords }).strict(),
  z.object({ op: z.literal("key"), key: z.string().regex(/^[A-Za-z0-9+_-]{1,32}$/), ...optionalCoords }).strict(),
  z.object({ op: z.literal("wait"), ms: z.number().int().min(0).max(SCRIPT_MAX_WAIT_MS) }).strict(),
]);
export type ScriptStep = z.infer<typeof scriptStepSchema>;

export const runScriptPayloadSchema = z
  .object({ steps: z.array(scriptStepSchema).min(1).max(SCRIPT_MAX_STEPS) })
  .refine(
    (p) => p.steps.reduce((sum, s) => sum + (s.op === "wait" ? s.ms : 0), 0) <= SCRIPT_MAX_TOTAL_WAIT_MS,
    { message: `Total wait must be at most ${SCRIPT_MAX_TOTAL_WAIT_MS}ms` },
  );
export type RunScriptPayload = z.infer<typeof runScriptPayloadSchema>;

export const interceptNoticePayloadSchema = z.object({
  message: z.string().min(1).max(2000),
  source: z.string().max(200).optional(),
  level: z.enum(["info", "warn", "error"]).optional(),
});
export type InterceptNoticePayload = z.infer<typeof interceptNoticePayloadSchema>;

/** Payload schema per command; the closed set of what the bridge accepts. */
export const ASSIST_COMMAND_PAYLOADS = {
  request_fresh_frame: z.object({}).passthrough(),
  report_state: z.object({}).passthrough(),
  run_script: runScriptPayloadSchema,
  intercept_notice: interceptNoticePayloadSchema,
} satisfies Record<AssistCommandType, z.ZodTypeAny>;

export const assistEnvelopeSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1).max(200),
  ts: z.number(),
  payload: z.unknown().optional(),
});

export interface ScriptStepOutcome {
  index: number;
  op: ScriptStep["op"];
  executed: boolean;
  error?: string;
}

export interface RunScriptResult {
  completed: boolean;
  steps: ScriptStepOutcome[];
  stoppedReason?: string;
}

/** payload of a `reply` envelope. */
export type AssistReplyPayload =
  | { replyTo: string; command: string; ok: true; result: unknown }
  | { replyTo: string; command: string; ok: false; error: string };

export interface AssistBridgeSettings {
  host: string;
  port: number;
  /** Optional shared secret; empty string means no token. */
  token: string;
  intervalMs: number;
}

/** Settings as shown to the UI: the token itself is never returned. */
export type AssistBridgePublicSettings = Omit<AssistBridgeSettings, "token"> & { tokenSet: boolean };

export type AssistBridgeState = "waiting" | "connected" | "error";

export interface AssistBridgeStatus {
  state: AssistBridgeState;
  listening: boolean;
  url: string | null;
  peer: string | null;
  lastError: string | null;
  /** Bound to a non-loopback host over plain HTTP. */
  insecure: boolean;
  killSwitch: boolean;
  settings: AssistBridgePublicSettings;
}
