/**
 * Safe fetch & JSON parsing helpers that gracefully handle non-JSON responses,
 * server error pages, and network failures without throwing unhandled rejections.
 */

import { readJsonReply, summarizeNonJson } from "@/lib/backend-status";

export type SafeApiResponse<T> = T & {
  success?: boolean;
  error?: string;
  message?: string;
  /** The body was not JSON (HTML page, plain text); `error` holds a concise summary, never the body. */
  nonJson?: boolean;
  httpStatus?: number;
};

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    // Decided by parsing, not the content-type header: static hosts serve HTML with 200 for /api/*.
    const reply = await readJsonReply(res);
    if (reply.json) return { success: res.ok, ...reply.body };
    return { success: false, nonJson: true, httpStatus: res.status, error: reply.reason } as SafeApiResponse<T>;
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) } as SafeApiResponse<T>;
  }
}

/**
 * Parses a response body as JSON; a non-JSON body is a failure, never a success.
 * Throws with the HTTP status and a summary of the body (never raw HTML) so callers can surface it.
 */
export async function readJsonResponse<T = any>(res: Response): Promise<SafeApiResponse<T>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as SafeApiResponse<T>;
  } catch {
    throw new Error(`HTTP ${res.status}: expected JSON but received ${summarizeNonJson(text, res.status)}`);
  }
}

export async function safePostJson<T = any>(
  url: string,
  body: any = {},
  options?: Omit<RequestInit, "body" | "method">
): Promise<SafeApiResponse<T>> {
  return safeFetchJson<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    body: JSON.stringify(body),
    ...options,
  });
}
