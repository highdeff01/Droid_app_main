/** Pure connection logic for the companion chat: staged connect, failure diagnosis and retry backoff. */

export type CompanionConnectionStage = "session" | "history";

export type CompanionConnection =
  | { status: "connecting"; attempt: number }
  | { status: "connected"; sessionId: string }
  | { status: "error"; stage: CompanionConnectionStage; reason: string; attempt: number };

/** Automatic reconnect attempts before only the manual Reconnect control remains. */
export const MAX_AUTO_RETRIES = 3;

const STAGE_LABEL: Record<CompanionConnectionStage, string> = {
  session: "Assistant session",
  history: "Chat history",
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Human-readable failure reason naming the stage that failed and the underlying cause. */
export function describeConnectionFailure(stage: CompanionConnectionStage, error: unknown) {
  const cause = errorMessage(error);
  const hint = /failed to fetch|networkerror|load failed/i.test(cause)
    ? " (server unreachable: is `npm run dev` running?)"
    : /authentication required|\b401\b/i.test(cause)
      ? " (API key required: set ASSISTANT_API_KEY access or use the app from localhost)"
      : "";
  return `${STAGE_LABEL[stage]} failed: ${cause}${hint}`;
}

/** Delay before automatic retry `attempt` (1-based): 1s, 2s, 4s, capped at 8s; null once retries are exhausted. */
export function retryDelayMs(attempt: number, maxRetries = MAX_AUTO_RETRIES) {
  if (attempt < 1 || attempt > maxRetries) return null;
  return Math.min(8000, 1000 * 2 ** (attempt - 1));
}

/** Error for a non-ok or non-JSON HTTP reply, preferring the server's own `error` text. */
export function httpFailure(response: Pick<Response, "status">, body: unknown, fallback: string) {
  if (body === null) return new Error(`${fallback}: API returned non-JSON (HTTP ${response.status})`);
  const serverError = (body as { error?: unknown })?.error;
  return new Error(typeof serverError === "string" && serverError ? serverError : `${fallback} (HTTP ${response.status})`);
}

export interface CompanionConnectDeps<T> {
  ensureSession: () => Promise<string>;
  loadHistory: (sessionId: string) => Promise<T[]>;
}

/** Resolves a session and its history, reporting which stage failed and why. */
export async function connectCompanion<T>(
  deps: CompanionConnectDeps<T>,
  attempt: number,
): Promise<{ connection: CompanionConnection; history: T[] }> {
  let stage: CompanionConnectionStage = "session";
  try {
    const sessionId = await deps.ensureSession();
    stage = "history";
    const history = await deps.loadHistory(sessionId);
    return { connection: { status: "connected", sessionId }, history };
  } catch (error) {
    return {
      connection: { status: "error", stage, reason: describeConnectionFailure(stage, error), attempt },
      history: [],
    };
  }
}
