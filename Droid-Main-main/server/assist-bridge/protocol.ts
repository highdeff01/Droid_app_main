import { randomUUID } from "crypto";
import {
  ASSIST_COMMAND_PAYLOADS,
  ASSIST_COMMAND_TYPES,
  assistEnvelopeSchema,
  type AssistCommandType,
  type AssistEnvelope,
  type AssistReplyPayload,
  type AssistServerMessageType,
} from "../../shared/assist-bridge";

export type ParsedCommand =
  | { ok: true; id: string; type: AssistCommandType; payload: any }
  | { ok: false; id: string; type: string; error: string };

export function makeEnvelope<P>(type: AssistServerMessageType, payload: P): AssistEnvelope<AssistServerMessageType, P> {
  return { type, id: randomUUID(), ts: Date.now(), payload };
}

export function replyEnvelope(replyTo: string, command: string, outcome: { ok: true; result: unknown } | { ok: false; error: string }) {
  const payload: AssistReplyPayload = { replyTo, command, ...outcome };
  return makeEnvelope("reply", payload);
}

function isCommandType(type: string): type is AssistCommandType {
  return (ASSIST_COMMAND_TYPES as readonly string[]).includes(type);
}

function describeIssues(error: { issues: { path: (string | number)[]; message: string }[] }): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

/** Validates one incoming envelope (raw text or parsed JSON) against the closed command set. */
export function parseCommand(raw: unknown): ParsedCommand {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, id: "", type: "", error: "Message is not valid JSON" };
    }
  }
  const envelope = assistEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    const id = typeof (value as any)?.id === "string" ? (value as any).id : "";
    return { ok: false, id, type: String((value as any)?.type ?? ""), error: `Invalid envelope: ${describeIssues(envelope.error)}` };
  }
  const { id, type } = envelope.data;
  if (!isCommandType(type)) {
    return { ok: false, id, type, error: `Unknown command "${type}"; allowed: ${ASSIST_COMMAND_TYPES.join(", ")}` };
  }
  const payload = ASSIST_COMMAND_PAYLOADS[type].safeParse(envelope.data.payload ?? {});
  if (!payload.success) {
    return { ok: false, id, type, error: `Invalid ${type} payload: ${describeIssues(payload.error)}` };
  }
  return { ok: true, id, type, payload: payload.data };
}
