import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  resolution: { found: true, command: "python3", prefixArgs: [] as string[], version: "3.11.0", tried: ["python3"] } as any,
  exit: { code: 1, stdout: "", stderr: "" },
  spawned: 0,
}));

vi.mock("../python-resolver", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    resolvePython: () => state.resolution,
    spawnPython: () => {
      state.spawned += 1;
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      child.killed = false;
      setTimeout(() => {
        if (state.exit.stdout) child.stdout.emit("data", Buffer.from(state.exit.stdout));
        if (state.exit.stderr) child.stderr.emit("data", Buffer.from(state.exit.stderr));
        child.emit("close", state.exit.code);
      }, 0);
      return child;
    },
  };
});

import { captureDesktopFrame, handleGetScreenCapture } from "./screen-capture";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe("desktop capture honesty", () => {
  beforeEach(() => {
    state.spawned = 0;
    state.resolution = { found: true, command: "python3", prefixArgs: [], version: "3.11.0", tried: ["python3"] };
  });

  it("fails honestly without spawning when no interpreter resolves", async () => {
    state.resolution = { found: false, command: null, prefixArgs: [], version: null, tried: ["python3", "python", "py -3"] };
    const result = await captureDesktopFrame();
    expect(result.success).toBe(false);
    expect(result.imageData).toBeUndefined();
    expect(result.error).toContain("no Python interpreter found");
    expect(result.error).toContain("py -3");
    expect(result.error).toContain("pip install pyautogui mss pillow");
    expect(state.spawned).toBe(0);
  });

  it("returns success:false with the script's reason when mss and PIL are missing", async () => {
    state.exit = {
      code: 1,
      stdout: "",
      stderr: JSON.stringify({ success: false, error: "No screen capture backend available (mss: No module named 'mss'; PIL ImageGrab: No module named 'PIL')" }),
    };
    const result = await captureDesktopFrame();
    expect(result).toMatchObject({ success: false });
    expect(result.imageData).toBeUndefined();
    expect(result.error).toContain("No module named 'mss'");
    expect(result.error).toContain("setup-python");
  });

  it("serves the 503 failure through the HTTP handler, never a frame", async () => {
    state.exit = { code: 1, stdout: "", stderr: "Traceback: boom" };
    const res = makeRes();
    await handleGetScreenCapture({} as any, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.imageData).toBeUndefined();
  });

  it("passes through a real captured frame", async () => {
    state.exit = { code: 0, stdout: JSON.stringify({ success: true, imageData: "data:image/png;base64,REAL", method: "mss" }), stderr: "" };
    const result = await captureDesktopFrame();
    expect(result).toMatchObject({ success: true, imageData: "data:image/png;base64,REAL", method: "mss" });
  });
});
