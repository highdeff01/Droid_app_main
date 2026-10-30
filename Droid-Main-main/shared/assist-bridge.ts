/**
 * Wire contract between this app's assist bridge (server/assist-bridge/) and the
 * droid-assist prototype. Documented in docs/assist-bridge-protocol.md — keep both in sync.
 */
import { z } from "zod";

export const ASSIST_BRIDGE_PROTOCOL_VERSION = 2;
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
  "user_request",
  "step_update",
  "takeover_step",
  "create_file",
  "request_result",
] as const;
export type AssistCommandType = (typeof ASSIST_COMMAND_TYPES)[number];

export const ASSIST_EVENT_TYPES = [
  "error",
  "state_change",
  "element_change",
  "test_request",
  "step_observation",
  "step_incomplete",
  "handoff",
  "monitor_problem",
] as const;
export type AssistEventType = (typeof ASSIST_EVENT_TYPES)[number];

/** Server → assist message types. `request` carries a main → assist request (v2). */
export type AssistServerMessageType = "hello" | "frame" | "frame_standby" | "reply" | "request" | AssistEventType;

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

// ---------------------------------------------------------------------------
// Protocol v2: requests both ways, step consensus, takeover, file creation.
// ---------------------------------------------------------------------------

/** A step droid-new started counts as incomplete after this long without done/failed (the 10-second rule). */
export const STEP_STALL_MS = 10_000;
/** How long a main → assist request waits for its `request_result`. */
export const ASSIST_REQUEST_TIMEOUT_MS = 30_000;
export const WORKFLOW_MAX_STEPS = 100;
export const SCREENSHOT_MAX_CHARS = 4_000_000;

const shortText = z.string().trim().min(1).max(SCRIPT_MAX_TEXT);
const longText = z.string().trim().min(1).max(4000);
const screenshot = z.string().regex(/^data:image\/(png|jpeg);base64,/).max(SCREENSHOT_MAX_CHARS);

export const userRequestPayloadSchema = z.object({ text: longText, source: z.string().max(200).optional() }).strict();
export type UserRequestPayload = z.infer<typeof userRequestPayloadSchema>;

export const STEP_STATUSES = ["started", "done", "failed"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const stepUpdatePayloadSchema = z
  .object({
    stepId: z.string().min(1).max(200),
    goal: longText,
    step: longText,
    status: z.enum(STEP_STATUSES),
    /** droid-new's own verification verdict; defaults to status === "done". */
    verified: z.boolean().optional(),
    /** Bounded script for this step, used when main has to take it over. */
    script: z.array(scriptStepSchema).min(1).max(SCRIPT_MAX_STEPS).optional(),
    tried: z.array(shortText).max(20).optional(),
  })
  .strict();
export type StepUpdatePayload = z.infer<typeof stepUpdatePayloadSchema>;

export const takeoverStepPayloadSchema = z
  .object({
    stepId: z.string().min(1).max(200),
    goal: longText,
    step: longText,
    tried: z.array(shortText).max(20).default([]),
    reason: z.string().max(2000).optional(),
    screenshots: z.array(screenshot).max(5).default([]),
    /** When absent, main asks its own AI for a bounded script from the full context. */
    script: z.array(scriptStepSchema).min(1).max(SCRIPT_MAX_STEPS).optional(),
  })
  .strict();
export type TakeoverStepPayload = z.infer<typeof takeoverStepPayloadSchema>;

export const workflowDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    goal: z.string().max(2000).optional(),
    steps: z.array(scriptStepSchema).min(1).max(WORKFLOW_MAX_STEPS),
  })
  .strict();
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const createFilePayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workflow"), workflow: workflowDefinitionSchema }).strict(),
  z
    .object({ kind: z.literal("fix_script"), name: z.string().trim().min(1).max(120), script: runScriptPayloadSchema })
    .strict(),
  z
    .object({
      kind: z.literal("code"),
      path: z.string().trim().min(1).max(300),
      content: z.string().max(200_000),
      summary: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type CreateFilePayload = z.infer<typeof createFilePayloadSchema>;

export const requestResultPayloadSchema = z
  .object({ requestId: z.string().min(1).max(200), ok: z.boolean(), result: z.unknown().optional(), error: z.string().max(4000).optional() })
  .strict();
export type RequestResultPayload = z.infer<typeof requestResultPayloadSchema>;

/** droid-new's settings as managed remotely from the main app. Every field is optional. */
export const assistRemoteSettingsSchema = z
  .object({
    bridge: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(["listen", "dial"]),
        host: z.string().trim().min(1).max(255),
        port: z.number().int().min(1).max(65535),
        url: z.string().trim().max(500),
        token: z.string().max(512),
      })
      .partial()
      .strict(),
    ai: z.object({ endpoint: z.string().trim().max(500), model: z.string().trim().max(200) }).partial().strict(),
    monitor: z
      .object({ mode: z.enum(["off", "standard", "advanced"]), intervalMs: z.number().int().min(250).max(10_000) })
      .partial()
      .strict(),
    agents: z.record(z.string().max(100), z.boolean()),
  })
  .partial()
  .strict();
export type AssistRemoteSettings = z.infer<typeof assistRemoteSettingsSchema>;

const target = { target: shortText, x: coord.optional(), y: coord.optional() };

/** Main → assist request kinds and their params; the closed set main may ask droid-new for. */
export const ASSIST_REQUEST_PARAMS = {
  analyze_page: z.object({ question: z.string().max(2000).optional() }).strict(),
  plan_workflow: z.object({ goal: longText }).strict(),
  create_workflow: z.object({ workflow: workflowDefinitionSchema }).strict(),
  run_workflow: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
  verify_target: z.object(target).strict(),
  watch_element: z.object({ ...target, durationMs: z.number().int().min(1000).max(600_000).optional() }).strict(),
  assist_error: z.object({ message: longText, source: z.string().max(200).optional(), context: z.string().max(4000).optional() }).strict(),
  user_request: userRequestPayloadSchema,
  get_settings: z.object({}).strict(),
  set_settings: z.object({ settings: assistRemoteSettingsSchema }).strict(),
  resolve_disagreement: z
    .object({ stepId: z.string().min(1).max(200), assistVerified: z.boolean(), mainVerified: z.boolean(), evidence: z.string().max(4000) })
    .strict(),
} satisfies Record<string, z.ZodTypeAny>;
export type AssistRequestKind = keyof typeof ASSIST_REQUEST_PARAMS;
export const ASSIST_REQUEST_KINDS = Object.keys(ASSIST_REQUEST_PARAMS) as AssistRequestKind[];

/** payload of a server → assist `request` envelope. */
export interface AssistRequestPayload {
  requestId: string;
  kind: AssistRequestKind;
  params: unknown;
}

export type AssistRequestStatus = "pending" | "ok" | "failed";

export interface AssistRequestRecord {
  requestId: string;
  kind: AssistRequestKind;
  params: unknown;
  status: AssistRequestStatus;
  sentAt: number;
  settledAt?: number;
  result?: unknown;
  error?: string;
}

export interface InboxRequest {
  id: string;
  text: string;
  source: string;
  receivedAt: number;
}

export type StepState = "running" | "incomplete" | "complete" | "failed" | "disputed" | "taken_over";

export interface StepVerdict {
  passed: boolean;
  evidence: string;
}

export interface StepRecord {
  stepId: string;
  goal: string;
  step: string;
  state: StepState;
  startedAt: number;
  updatedAt: number;
  tried: string[];
  hasScript: boolean;
  assistVerified?: boolean;
  main?: StepVerdict;
  resolution?: string;
}

export type HandoffOrigin = "assist" | "main";

export interface HandoffRecord {
  id: string;
  stepId: string;
  origin: HandoffOrigin;
  goal: string;
  step: string;
  tried: string[];
  reason?: string;
  screenshots: number;
  startedAt: number;
  finishedAt?: number;
  outcome: "running" | "completed" | "failed";
  detail?: string;
  result?: RunScriptResult;
}

export interface MonitorProblem {
  at: number;
  message: string;
  source: string;
  assist: string;
}

export interface AssistAutomation {
  monitoring: boolean;
  autoAssist: boolean;
  autoTakeover: boolean;
}

export interface AssistMonitorStatus extends AssistAutomation {
  intervalMs: number;
  framesCaptured: number;
  live: boolean;
  lastFrameAt: number | null;
  lastMessage: string | null;
  problems: MonitorProblem[];
}

export type CreatedFile =
  | { kind: "workflow" | "fix_script"; status: "written"; path: string }
  | { kind: "code"; status: "proposed"; proposalId: string; path: string };

/** Payload schema per command; the closed set of what the bridge accepts. */
export const ASSIST_COMMAND_PAYLOADS = {
  request_fresh_frame: z.object({}).passthrough(),
  report_state: z.object({}).passthrough(),
  run_script: runScriptPayloadSchema,
  intercept_notice: interceptNoticePayloadSchema,
  user_request: userRequestPayloadSchema,
  step_update: stepUpdatePayloadSchema,
  takeover_step: takeoverStepPayloadSchema,
  create_file: createFilePayloadSchema,
  request_result: requestResultPayloadSchema,
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
