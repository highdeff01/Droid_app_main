/**
 * Narrow, app-wide error handling installed from main.tsx. Non-JSON response
 * bodies still resolve to a `{ success: false, error }` object (so callers'
 * error branches run instead of crashing), but every such case and every
 * unexpected rejection is logged with console.error and surfaced to the user.
 * Only expected cancellations and the stale-chunk blank-screen case are
 * prevented from reaching the default handler.
 */

export type ErrorSurface = (message: string, options?: { reload?: boolean }) => void;

/** Parse a response body; a non-JSON body becomes a failure object, never a silent success. */
export function parseResponseBody(text: string, status: number, ok: boolean): unknown {
  if (!text || text.trim() === "") {
    return { success: ok, status };
  }
  try {
    return JSON.parse(text);
  } catch {
    const isHtml = /<!doctype|<html/i.test(text);
    const error = text.length < 150 && !isHtml ? text.trim() : `Non-JSON response (HTTP ${status})`;
    console.error(`Expected JSON but received a non-JSON body (HTTP ${status})`, text.slice(0, 300));
    return { success: false, status, error, rawText: text.slice(0, 300) };
  }
}

/** Replaces Response.prototype.json with the non-JSON guard; body read errors still reject. */
export function installJsonGuard(proto: { json: () => Promise<any>; text: () => Promise<string> }): void {
  proto.json = async function (this: Response) {
    const text = await this.text();
    return parseResponseBody(text, this.status, this.ok);
  };
}

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : "Unexpected error";
}

/** An AbortError is an intentional cancellation (stop buttons, unmount cleanup). */
export function isExpectedCancellation(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "AbortError";
}

/** A lazily-loaded chunk that no longer exists after a redeploy: the blank-screen crash. */
export function isChunkLoadFailure(reason: unknown): boolean {
  const message = reasonMessage(reason);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

export type RejectionVerdict = "ignore" | "reload" | "report";

export function classifyRejection(reason: unknown): RejectionVerdict {
  if (isExpectedCancellation(reason)) return "ignore";
  if (isChunkLoadFailure(reason)) return "reload";
  return "report";
}

/** Handles one unhandled rejection; only the guarded cases are prevented from propagating. */
export function handleUnhandledRejection(
  event: { reason: unknown; preventDefault: () => void },
  surface: ErrorSurface,
): void {
  const verdict = classifyRejection(event.reason);
  if (verdict === "ignore") {
    event.preventDefault();
    return;
  }
  console.error("Unhandled promise rejection:", event.reason);
  if (verdict === "reload") {
    event.preventDefault();
    surface("The app was updated. Reload to load the latest version.", { reload: true });
    return;
  }
  surface(`Unexpected error: ${reasonMessage(event.reason)}`);
}

/** Logs uncaught window errors and surfaces them; the browser's default reporting is kept. */
export function handleWindowError(event: { error?: unknown; message?: string }, surface: ErrorSurface): void {
  console.error("Uncaught error:", event.error ?? event.message);
  surface(`Unexpected error: ${reasonMessage(event.error ?? event.message)}`);
}
