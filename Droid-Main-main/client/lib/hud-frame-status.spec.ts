import { describe, expect, it } from "vitest";
import { describeEmptyState, readCaptureStandby } from "./hud-frame-status";

const reply = (status: number, body: unknown) =>
  new Response(body === undefined ? "<html>" : JSON.stringify(body), { status });

describe("hud-frame-status", () => {
  describe("readCaptureStandby", () => {
    it("returns null for a live frame", async () => {
      expect(await readCaptureStandby(reply(200, { success: true }))).toBeNull();
    });
    it("reads the server's standby message from a 503", async () => {
      expect(await readCaptureStandby(reply(503, { status: "standby", message: "No live frame from 3 sources" }))).toEqual({
        message: "No live frame from 3 sources",
      });
    });
    it("reports a non-JSON reply as an error", async () => {
      expect(await readCaptureStandby(reply(502, undefined))).toEqual({
        error: "Capture endpoint returned non-JSON (HTTP 502)",
      });
    });
  });

  describe("describeEmptyState", () => {
    it("never claims a live screen and shows the standby reason", () => {
      const state = describeEmptyState({ message: "desktop capture stale" }, { online: false, error: "python3 missing" }, false);
      expect(state.title).toBe("No live screen");
      expect(state.detail).toBe("desktop capture stale");
      expect(state.bridgeLabel).toBe("Desktop bridge offline: python3 missing");
      expect(state.steps).toHaveLength(3);
    });
    it("prefers a transport error over the standby message", () => {
      expect(describeEmptyState({ message: "m", error: "unreachable" }, null, false).detail).toBe("unreachable");
    });
    it("labels an online and an unknown bridge", () => {
      expect(describeEmptyState(null, { online: true }, false).bridgeLabel).toBe("Desktop bridge online");
      expect(describeEmptyState(null, null, false).bridgeLabel).toBe("Desktop bridge status unknown");
    });
    it("puts the open-in-new-tab step first inside an iframe", () => {
      const state = describeEmptyState(null, null, true);
      expect(state.steps[0]).toMatch(/own tab/);
      expect(state.steps).toHaveLength(4);
    });
  });
});
