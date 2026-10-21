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
