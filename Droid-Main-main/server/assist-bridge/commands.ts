import type {
  AssistCommandType,
  AssistFrame,
  CreateFilePayload,
  InterceptNoticePayload,
  RequestResultPayload,
  RunScriptPayload,
  StepUpdatePayload,
  TakeoverStepPayload,
  UserRequestPayload,
} from "../../shared/assist-bridge";
import type { FrameOutcome } from "./frames";
import { parseCommand, replyEnvelope } from "./protocol";
import type { ScriptRunner } from "./script-runner";

/** The protocol v2 surface: requests both ways, step consensus, takeover and file creation. */
export interface V2CommandDeps {
  userRequest: (payload: UserRequestPayload) => unknown;
  stepUpdate: (payload: StepUpdatePayload) => Promise<unknown>;
  takeover: (payload: TakeoverStepPayload) => Promise<unknown>;
  createFile: (payload: CreateFilePayload) => Promise<unknown>;
  requestResult: (payload: RequestResultPayload) => unknown;
}

export interface CommandDeps {
  freshFrame: () => Promise<FrameOutcome>;
  reportState: () => Promise<unknown>;
  runner: ScriptRunner;
  logNotice: (notice: InterceptNoticePayload) => void;
  v2: V2CommandDeps;
}

type Handler = (payload: any, deps: CommandDeps) => Promise<unknown>;

async function requestFreshFrame(_payload: unknown, deps: CommandDeps): Promise<AssistFrame> {
  const outcome = await deps.freshFrame();
  if (outcome.live === false) throw new Error(`No live frame (standby): ${outcome.message}`);
  return outcome.frame;
}

async function interceptNotice(payload: InterceptNoticePayload, deps: CommandDeps) {
  deps.logNotice(payload);
  return { logged: true };
}

const HANDLERS: Record<AssistCommandType, Handler> = {
  request_fresh_frame: requestFreshFrame,
  report_state: (_payload, deps) => deps.reportState(),
  run_script: (payload: RunScriptPayload, deps) => deps.runner.run(payload.steps),
  intercept_notice: interceptNotice,
  user_request: async (payload: UserRequestPayload, deps) => deps.v2.userRequest(payload),
  step_update: (payload: StepUpdatePayload, deps) => deps.v2.stepUpdate(payload),
  takeover_step: (payload: TakeoverStepPayload, deps) => deps.v2.takeover(payload),
  create_file: (payload: CreateFilePayload, deps) => deps.v2.createFile(payload),
  request_result: async (payload: RequestResultPayload, deps) => deps.v2.requestResult(payload),
};

/** Validates and executes one command envelope; always resolves with its reply envelope. */
export async function handleCommand(raw: unknown, deps: CommandDeps) {
  const parsed = parseCommand(raw);
  if (parsed.ok === false) return replyEnvelope(parsed.id, parsed.type, { ok: false, error: parsed.error });
  try {
    const result = await HANDLERS[parsed.type](parsed.payload, deps);
    return replyEnvelope(parsed.id, parsed.type, { ok: true, result });
  } catch (err) {
    return replyEnvelope(parsed.id, parsed.type, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
