/**
 * Safe fetch & JSON parsing helpers that gracefully handle non-JSON responses,
 * server error pages, and network failures without throwing unhandled rejections.
 */

export type SafeApiResponse<T> = T & {
  success?: boolean;
  error?: string;
  message?: string;
};

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return { success: res.ok, ...data };
    }
    const text = await res.text();
    return { success: res.ok, message: text } as SafeApiResponse<T>;
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) } as SafeApiResponse<T>;
  }
}

/**
 * Parses a response body as JSON; a non-JSON body is a failure, never a success.
 * Throws with the HTTP status and the start of the body so callers can surface it.
 */
export async function readJsonResponse<T = any>(res: Response): Promise<SafeApiResponse<T>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as SafeApiResponse<T>;
  } catch {
    const snippet = text.trim().slice(0, 120) || "empty body";
    throw new Error(`HTTP ${res.status}: expected JSON but received ${snippet}`);
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
