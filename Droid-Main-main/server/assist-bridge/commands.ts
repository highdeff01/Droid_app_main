import type { AssistCommandType, AssistFrame, InterceptNoticePayload, RunScriptPayload } from "../../shared/assist-bridge";
import type { FrameOutcome } from "./frames";
import { parseCommand, replyEnvelope } from "./protocol";
import type { ScriptRunner } from "./script-runner";

export interface CommandDeps {
  freshFrame: () => Promise<FrameOutcome>;
  reportState: () => Promise<unknown>;
  runner: ScriptRunner;
  logNotice: (notice: InterceptNoticePayload) => void;
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
