import { randomUUID } from "crypto";
import {
  ASSIST_REQUEST_PARAMS,
  ASSIST_REQUEST_TIMEOUT_MS,
  type AssistRequestKind,
  type AssistRequestPayload,
  type AssistRequestRecord,
  type InboxRequest,
  type RequestResultPayload,
  type UserRequestPayload,
} from "../../shared/assist-bridge";

const HISTORY_LIMIT = 100;

export interface RequestBrokerDeps {
  /** Sends a `request` envelope to droid-new. */
  send: (payload: AssistRequestPayload) => void;
  isConnected: () => boolean;
  timeoutMs?: number;
  now?: () => number;
}

interface Pending {
  record: AssistRequestRecord;
  resolve: (record: AssistRequestRecord) => void;
  timer: NodeJS.Timeout;
}

function pushBounded<T>(list: T[], item: T): void {
  list.unshift(item);
  if (list.length > HISTORY_LIMIT) list.pop();
}

/** Main → assist requests (sent, awaited by `request_result`) and the inbox of assist → main user requests. */
export class RequestBroker {
  private readonly pending = new Map<string, Pending>();
  private readonly records: AssistRequestRecord[] = [];
  private readonly inboxItems: InboxRequest[] = [];
  private readonly now: () => number;

  constructor(private readonly deps: RequestBrokerDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Validates and sends one request; resolves with the settled record (ok, failed or timed out). Throws when invalid or not connected. */
  send(kind: AssistRequestKind, params: unknown): Promise<AssistRequestRecord> {
    const schema = ASSIST_REQUEST_PARAMS[kind];
    if (!schema) throw new Error(`Unknown request kind "${kind}"`);
    const parsed = schema.safeParse(params ?? {});
    if (!parsed.success) throw new Error(`Invalid ${kind} params: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    if (!this.deps.isConnected()) throw new Error("droid-new is not connected to the bridge");
    const record: AssistRequestRecord = { requestId: randomUUID(), kind, params: parsed.data, status: "pending", sentAt: this.now() };
    pushBounded(this.records, record);
    const settled = new Promise<AssistRequestRecord>((resolve) => {
      const timer = setTimeout(() => this.finish(record.requestId, { ok: false, error: "Timed out waiting for droid-new" }), this.deps.timeoutMs ?? ASSIST_REQUEST_TIMEOUT_MS);
      timer.unref?.();
      this.pending.set(record.requestId, { record, resolve, timer });
    });
    this.deps.send({ requestId: record.requestId, kind, params: parsed.data });
    return settled;
  }

  /** droid-new's `request_result`: settles the pending request. */
  settle(payload: RequestResultPayload): AssistRequestRecord {
    const record = this.finish(payload.requestId, { ok: payload.ok === true, result: payload.result, error: payload.error });
    if (!record) throw new Error(`No pending request "${payload.requestId}"`);
    return record;
  }

  private finish(requestId: string, outcome: { ok: boolean; result?: unknown; error?: string }): AssistRequestRecord | null {
    const entry = this.pending.get(requestId);
    if (!entry) return null;
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    const { record } = entry;
    record.status = outcome.ok ? "ok" : "failed";
    record.settledAt = this.now();
    if (outcome.ok) record.result = outcome.result;
    else record.error = outcome.error || "droid-new reported a failure";
    entry.resolve(record);
    return record;
  }

  list(): AssistRequestRecord[] {
    return [...this.records];
  }

  /** A user request entered on droid-new's side. */
  receiveUserRequest(payload: UserRequestPayload): InboxRequest {
    const item: InboxRequest = { id: randomUUID(), text: payload.text, source: payload.source ?? "droid-new", receivedAt: this.now() };
    pushBounded(this.inboxItems, item);
    return item;
  }

  inbox(): InboxRequest[] {
    return [...this.inboxItems];
  }
}
