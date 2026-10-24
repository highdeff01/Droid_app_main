import { describe, expect, it, vi } from "vitest";
import { runUseCommand, type UseCommandDeps } from "./assistant-control";
import type { ScreenPerceptionReport } from "../ai-perception-engine";

const frame = {
  success: true as const,
  status: "live" as const,
  source: "desktop_capture",
  ageMs: 10,
  imageData: "data:image/png;base64,AA==",
  timestamp: Date.now(),
};

const report = (
  elements: Array<{ name: string; x: number; y: number }>,
): ScreenPerceptionReport => ({
  timestamp: Date.now(),
  screenDescription: "Settings page",
  activeWindow: "App",
  visualStateChange: "",
  elements: elements.map((el, i) => ({
    id: `e${i}`,
    name: el.name,
    type: "button",
    boundingBox: { x: el.x - 10, y: el.y - 10, width: 20, height: 20 },
    center: { x: el.x, y: el.y },
    confidence: 0.8,
    interactive: true,
  })),
  feedbackPosition: { x: 0, y: 0 },
  primarySuggestion: "",
  confidence: 0.8,
  source: "model",
  simulated: false,
});

function deps(overrides: Partial<UseCommandDeps> = {}): UseCommandDeps {
  return {
    readFrame: async () => frame,
    perceive: async () =>
      report([
        { name: "Apply changes", x: 640, y: 410 },
        { name: "Reset", x: 100, y: 50 },
      ]),
    execute: vi.fn(async () => ({
      success: true,
      executed: true,
      status: "executed",
    })),
    ...overrides,
  };
}

describe("runUseCommand", () => {
  it("clicks the centre of the matched element through the input bridge", async () => {
    const d = deps();
    const result = await runUseCommand("apply", d);
    expect(d.execute).toHaveBeenCalledWith({
      action: "click",
      x: 640,
      y: 410,
      origin: "use_command",
    });
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      stage: "execute",
      element: { name: "Apply changes" },
    });
  });

  it("reports 503 when no live frame exists and never executes", async () => {
    const d = deps({
      readFrame: async () => ({
        success: false,
        status: "standby",
        imageData: null,
        timestamp: Date.now(),
        message: "No live frame available",
        skipped: [],
      }),
    });
    const result = await runUseCommand("apply", d);
    expect(result).toMatchObject({
      httpStatus: 503,
      body: { success: false, stage: "capture" },
    });
    expect(d.execute).not.toHaveBeenCalled();
  });

  it("reports 404 with candidates when the target is not on screen", async () => {
    const d = deps();
    const result = await runUseCommand("Logout", d);
    expect(result.httpStatus).toBe(404);
    expect(result.body.candidates).toEqual(["Apply changes", "Reset"]);
    expect(d.execute).not.toHaveBeenCalled();
  });

  it("fails when perception is unavailable instead of guessing a target", async () => {
    const d = deps({
      perceive: async () => ({
        ...report([]),
        simulated: true,
        simulationReason: "model offline",
      }),
    });
    const result = await runUseCommand("apply", d);
    expect(result).toMatchObject({
      httpStatus: 502,
      body: { stage: "perception", error: "model offline" },
    });
  });

  it("surfaces a bridge that did not execute as a failure", async () => {
    const d = deps({
      execute: async () => ({
        success: false,
        executed: false,
        status: "unavailable",
        error: "pyautogui missing",
      }),
    });
    const result = await runUseCommand("reset", d);
    expect(result.httpStatus).toBe(502);
    expect(result.body).toMatchObject({
      success: false,
      executed: false,
      error: "pyautogui missing",
    });
  });
});
