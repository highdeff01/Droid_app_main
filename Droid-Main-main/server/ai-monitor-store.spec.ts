import { beforeEach, describe, expect, it } from "vitest";
import { aiMonitorStore } from "./ai-monitor-store";

describe("aiMonitorStore input records", () => {
  beforeEach(() => aiMonitorStore.clearActionHistory());

  it("exports input fields and an ISO timestamp per row in the CSV", () => {
    aiMonitorStore.record({
      timestamp: Date.UTC(2026, 0, 2, 3, 4, 5),
      title: "Keyboard type",
      inputKind: "keyboard",
      action: "type",
      input: 'say "hi"',
      executed: true,
      origin: "bridge",
      screenshotId: "shot_1",
    });
    const [header, row] = aiMonitorStore.exportCsv().split("\n");
    expect(header).toContain("ISO Time");
    expect(header).toContain("Input Kind");
    expect(header).toContain("Screenshot ID");
    expect(row).toContain("2026-01-02T03:04:05.000Z");
    expect(row).toContain(',keyboard,type,');
    expect(row).toContain('"say ""hi"""');
    expect(row).toContain(",true,bridge,shot_1");
  });

  it("keeps defaults when an entry carries undefined fields", () => {
    const rec = aiMonitorStore.record({ title: undefined, timestamp: undefined });
    expect(rec.title).toBe("Action");
    expect(rec.timestamp).toBeGreaterThan(0);
  });

  it("stores screenshots and drops them on clear", () => {
    const shot = aiMonitorStore.storeScreenshot("data:image/png;base64,AA==", 42);
    expect(aiMonitorStore.getScreenshot(shot.id)?.capturedAt).toBe(42);
    aiMonitorStore.clearActionHistory();
    expect(aiMonitorStore.getScreenshot(shot.id)).toBeUndefined();
  });
});
