import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetchJson } from "./api-helper";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeFetchJson (Dashboard Phone share path)", () => {
  it("reports an honest failure with the real error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED adb bridge")));

    const result = await safeFetchJson<{ devices?: string[]; simulated?: boolean }>("/api/adb/devices");

    expect(result.success).toBe(false);
    expect(result.error).toBe("ECONNREFUSED adb bridge");
    expect(result.simulated).toBeUndefined();
    expect(result.devices).toBeUndefined();
  });

  it("reports failure for a non-ok JSON response instead of success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "no device" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await safeFetchJson("/api/adb/capture");

    expect(result.success).toBe(false);
    expect(result.error).toBe("no device");
  });
});
