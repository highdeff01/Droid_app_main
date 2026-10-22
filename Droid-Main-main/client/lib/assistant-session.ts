import { httpFailure } from "@/lib/companion-connection";

const SESSION_STORAGE_KEY = "assistant_session_id";

export interface AssistantSessionOptions {
  project: { name: string; [key: string]: unknown };
  goals?: unknown[];
  savedStateIds?: string[];
}

/** Parses a fetch `Response` body as JSON, returning `null` on failure. */
async function responseBody(response: Response) {
  return response.json().catch(() => null);
}

let pendingSession: Promise<string> | null = null;

/**
 * Looks up the locally stored Assistant session id and verifies it still
 * exists on the server, creating a new session when none is cached or the
 * cached one is no longer valid.
 */
async function resolveAssistantSession({
  project,
  goals = [],
  savedStateIds = [],
}: AssistantSessionOptions): Promise<string> {
  const storedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (storedSessionId) {
    const existing = await fetch(
      `/api/assistant/sessions/${encodeURIComponent(storedSessionId)}`,
    );
    if (existing.ok) return storedSessionId;
    if (existing.status !== 404) {
      throw httpFailure(existing, await responseBody(existing), "Could not verify the Assistant session");
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  const response = await fetch("/api/assistant/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, goals, savedStateIds }),
  });
  const body = await responseBody(response);
  if (!response.ok) throw httpFailure(response, body, "Could not create an Assistant session");
  const sessionId = body?.session?.id;
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error("Assistant session response did not contain a session id");
  }
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  window.dispatchEvent(
    new CustomEvent("assistant-session-changed", { detail: { sessionId } }),
  );
  return sessionId;
}

/**
 * Ensures an Assistant session exists, reusing any in-flight resolution so
 * concurrent callers share the same session lookup/creation request.
 */
export function ensureAssistantSession(
  options: AssistantSessionOptions,
): Promise<string> {
  if (pendingSession) return pendingSession;
  pendingSession = resolveAssistantSession(options).finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}
