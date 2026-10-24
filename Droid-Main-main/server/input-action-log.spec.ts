import { beforeEach, describe, expect, it } from "vitest";
import { aiMonitorStore } from "./ai-monitor-store";
import { recordInputActions } from "./input-action-log";
import { setLiveFrameReader } from "./live-frame";

const live =
  (imageData: string, timestamp = Date.now()) =>
  async () =>
    ({
      success: true,
      status: "live",
      source: "spec",
      ageMs: 0,
      imageData,
      timestamp,
    }) as const;

describe("recordInputActions", () => {
  beforeEach(() => aiMonitorStore.clearActionHistory());

  it("logs mouse and keyboard actions with a timestamp and a shared screenshot, skipping waits", async () => {
    setLiveFrameReader(live("data:image/png;base64,QQ==", 1234));
    const before = Date.now();
    const records = await recordInputActions(
      [
        { action: "double_click", x: 10.6, y: 20.2 },
        { action: "wait" },
        { action: "hotkey", key: "ctrl+s" },
      ],
      { origin: "bridge", executed: true },
    );
    expect(records.map((r) => [r.inputKind, r.action, r.status])).toEqual([
      ["mouse", "double_click", "completed"],
      ["keyboard", "hotkey", "completed"],
    ]);
    expect(records[0]).toMatchObject({
      x: 11,
      y: 20,
      origin: "bridge",
      executed: true,
    });
    expect(records[1].input).toBe("ctrl+s");
    expect(records[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(records[0].screenshotId).toBe(records[1].screenshotId);
    expect(
      aiMonitorStore.getScreenshot(records[0].screenshotId!)?.imageData,
    ).toBe("data:image/png;base64,QQ==");
    expect(aiMonitorStore.getActionHistory(5)).toHaveLength(2);
  });

  it("records a failed action as failed with the error, and a standby screen as screenshotError", async () => {
    setLiveFrameReader(async () => ({
      success: false,
      status: "standby",
      imageData: null,
      timestamp: Date.now(),
      message: "No live frame",
      skipped: [],
    }));
    const [rec] = await recordInputActions([{ action: "type", text: "abc" }], {
      origin: "execute_task",
      executed: false,
      error: "pyautogui missing",
    });
    expect(rec.status).toBe("failed");
    expect(rec.executed).toBe(false);
    expect(rec.detail).toContain("pyautogui missing");
    expect(rec.screenshotId).toBeUndefined();
    expect(rec.screenshotError).toBe("No live frame");
  });

  it("uses the action's own time for recorded user events and skips the capture", async () => {
    setLiveFrameReader(live("data:image/png;base64,Qg=="));
    const [rec] = await recordInputActions(
      [{ action: "mouse-click", x: 1, y: 2, at: 5000 }],
      {
        origin: "user_recording",
        executed: true,
        skipScreenshot: true,
      },
    );
    expect(rec.timestamp).toBe(5000);
    expect(rec.screenshotId).toBeUndefined();
  });
});
