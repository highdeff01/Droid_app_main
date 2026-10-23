import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeBehaviour = { kind: "error"; error: Error } | { kind: "exit"; code: number; stderr?: string };
let behaviour: FakeBehaviour;

function fakeChild() {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.kill = vi.fn();
  setTimeout(() => {
    if (behaviour.kind === "error") {
      child.emit("error", behaviour.error);
      child.emit("close", -2);
    } else {
      if (behaviour.stderr) child.stderr.emit("data", Buffer.from(behaviour.stderr));
      child.emit("close", behaviour.code);
    }
  }, 0);
  return child;
}

vi.mock("child_process", () => ({ spawn: vi.fn(() => fakeChild()) }));
vi.mock("./mobile-stream", () => ({ queueMobileAction: vi.fn() }));
const resolution = vi.hoisted(() => ({
  current: { found: true, command: "python", prefixArgs: [] as string[], version: "3.12.1", tried: ["python3", "python"] },
}));
vi.mock("../python-resolver", async (importOriginal) => {
  const actual: any = await importOriginal();
  const cp: any = await import("child_process");
  return {
    ...actual,
    resolvePython: () => resolution.current,
    spawnPython: (args: string[], options: unknown) =>
      cp.spawn(resolution.current.command ?? "python3", [...resolution.current.prefixArgs, ...args], options),
  };
});

import {
  executePythonPyAutoGUI,
  handleAiNavigationCheck,
  handleAutoRepositionAgent,
  handleBridgeHealth,
  handleBridgePing,
  handleCoordinateSync,
  handleExecutePyAutoGUI,
  handleInteractiveDeviceAction,
  handlePreExecutionScan,
  handlePreExecutionValidate,
  handlePreReplaySnapshotCheck,
  handlePyAutoGUIBridge,
  handleReplayTrail,
} from "./pyautogui-bridge";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    calls: 0,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.calls += 1;
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function run(handler: any, body: unknown) {
  const res = makeRes();
  await handler({ body } as any, res, () => {});
  await vi.waitFor(() => expect(res.body).toBeDefined());
  await new Promise((r) => setTimeout(r, 5));
  return res;
}

const ENOENT = Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" });

describe("pyautogui bridge honest fallbacks", () => {
  beforeEach(() => {
    behaviour = { kind: "exit", code: 0 };
  });

  it("interactive action without python3 is unavailable, not success, and responds once", async () => {
    behaviour = { kind: "error", error: ENOENT };
    const res = await run(handleInteractiveDeviceAction, { action: "click", x: 10, y: 20 });
    expect(res.calls).toBe(1);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("unavailable");
    expect(res.body.simulated).toBe(true);
    expect(res.body.executed).toBe(false);
    expect(res.body.executedOnPC).toBe(false);
    expect(res.body.message).not.toMatch(/\bexecuted at\b/);
  });

  it("interactive action is unavailable when pyautogui cannot be imported", async () => {
    behaviour = { kind: "exit", code: 3, stderr: "pyautogui unavailable: No module named 'pyautogui'" };
    const res = await run(handleInteractiveDeviceAction, { action: "type", text: "hi" });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", executed: false });
  });

  it("interactive action that exits non-zero is failed, not success", async () => {
    behaviour = { kind: "exit", code: 1, stderr: "Error: cannot open display" };
    const res = await run(handleInteractiveDeviceAction, { action: "double_click", x: 1, y: 2 });
    expect(res.body).toMatchObject({ success: false, status: "failed", executed: false, simulated: false });
  });

  it("interactive action that exits 0 is executed", async () => {
    const res = await run(handleInteractiveDeviceAction, { action: "click", x: 5, y: 6 });
    expect(res.body).toMatchObject({ success: true, status: "executed", executed: true, simulated: false });
  });

  it("direct execute without python3 reports unavailable instead of 'completed successfully'", async () => {
    behaviour = { kind: "error", error: ENOENT };
    const res = await run(handleExecutePyAutoGUI, { action: "move", x: 3, y: 4 });
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("unavailable");
    expect(res.body.simulated).toBe(true);
    expect(res.body.executedOnPC).toBe(false);
    expect(res.body.message).not.toMatch(/completed successfully/);
  });

  it("executePythonPyAutoGUI reports a missing interpreter as unavailable", async () => {
    behaviour = { kind: "error", error: ENOENT };
    const result = await executePythonPyAutoGUI("print(1)");
    expect(result).toMatchObject({ success: false, status: "unavailable", simulated: true, executed: false });
  });

  it("/bridge with python3 present but pyautogui missing is unavailable, not CLICKED success", async () => {
    behaviour = { kind: "exit", code: 3, stderr: "pyautogui unavailable: No module named 'pyautogui'" };
    const res = await run(handlePyAutoGUIBridge, { actions: [{ type: "click", x: 10, y: 10 }] });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", executed: false, simulated: true });
  });

  it.each([
    ["missing python3", { kind: "error", error: ENOENT } as FakeBehaviour, "unavailable"],
    ["missing pyautogui", { kind: "exit", code: 3 } as FakeBehaviour, "unavailable"],
  ])("ping with %s reports offline with no invented position", async (_label, b, status) => {
    behaviour = b;
    const res = await run(handleBridgePing, {});
    expect(res.body).toMatchObject({ success: false, status, online: false, currentPosition: null, screenResolution: null });
  });

  it("pre-execution validate without python3 is not valid and has no similarity score", async () => {
    behaviour = { kind: "error", error: ENOENT };
    const res = await run(handlePreExecutionValidate, { targetPosition: { x: 100, y: 200 } });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", valid: false, similarityScore: null, spatialDriftPx: null });
  });

  it("pre-execution scan without pyautogui is not within threshold and has no similarity score", async () => {
    behaviour = { kind: "exit", code: 3 };
    const res = await run(handlePreExecutionScan, { targetPosition: { x: 100, y: 200 } });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", similarityScore: null, euclideanDriftPx: null, isWithinAcceptableThreshold: false });
  });

  it("coordinate sync without python3 reports no bridge position instead of echoing the canvas", async () => {
    behaviour = { kind: "error", error: ENOENT };
    const res = await run(handleCoordinateSync, { canvasX: 300, canvasY: 400 });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", bridgeReportedX: null, bridgeReportedY: null, spatialDriftPx: null });
  });

  it("health without pyautogui reports offline with no invented version, resolution or processes", async () => {
    behaviour = { kind: "exit", code: 3 };
    const res = await run(handleBridgeHealth, {});
    expect(res.body).toMatchObject({ success: false, online: false, pyautoguiAvailable: false, pythonVersion: null, screenResolution: null, activeProcesses: [] });
  });

  it("health reports the real resolved interpreter and the setup fix when pyautogui is missing", async () => {
    behaviour = { kind: "exit", code: 3 };
    const res = await run(handleBridgeHealth, {});
    expect(res.body).toMatchObject({
      pythonAvailable: true,
      pythonInterpreter: "python (3.12.1)",
      pythonCommand: "python",
      pyautoguiAvailable: false,
    });
    expect(res.body.fix).toContain("setup-python.bat");
    expect(res.body.fix).toContain("pip install pyautogui mss pillow");
  });

  it("health reports 'not found' with every tried candidate when no interpreter resolves", async () => {
    const previous = resolution.current;
    resolution.current = { found: false, command: null as any, prefixArgs: [], version: null as any, tried: ["python3", "python", "py -3"] };
    behaviour = { kind: "error", error: ENOENT };
    try {
      const res = await run(handleBridgeHealth, {});
      expect(res.body).toMatchObject({
        success: false,
        online: false,
        pythonAvailable: false,
        pythonInterpreter: "not found",
        pythonCommand: null,
        pythonCandidatesTried: ["python3", "python", "py -3"],
        pyautoguiAvailable: false,
      });
      expect(res.body.fix).toContain("pip install pyautogui mss pillow");
    } finally {
      resolution.current = previous;
    }
  });

  it("spawns the resolved interpreter (with launcher args) instead of a hardcoded python3", async () => {
    const { spawn } = await import("child_process");
    const previous = resolution.current;
    resolution.current = { found: true, command: "py", prefixArgs: ["-3"], version: "3.12.1", tried: ["python3", "python", "py -3"] };
    try {
      await run(handleInteractiveDeviceAction, { action: "click", x: 1, y: 1 });
      const call = (spawn as any).mock.calls.at(-1);
      expect(call[0]).toBe("py");
      expect(call[1].slice(0, 2)).toEqual(["-3", "-c"]);
    } finally {
      resolution.current = previous;
    }
  });

  it("pre-replay snapshot check claims no match or similarity", async () => {
    const res = await run(handlePreReplaySnapshotCheck, { stepIndex: 2 });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", matched: false, similarityScore: null, driftPx: null, readyToProceed: false });
  });

  it("AI navigation check does not claim a verified frame or element confidences", async () => {
    const res = await run(handleAiNavigationCheck, { currentStepName: "Login" });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", isCorrectFrame: null, detectedElements: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/97\.8|0\.96|0\.99/);
  });

  it("auto-reposition requires a measured target and claims no confidence", async () => {
    const missing = await run(handleAutoRepositionAgent, { originalX: 10, originalY: 10 });
    expect(missing.statusCode).toBe(400);
    expect(missing.body.success).toBe(false);
    const res = await run(handleAutoRepositionAgent, { originalX: 10, originalY: 10, currentScreenTarget: { x: 13, y: 14 } });
    expect(res.body.euclideanDistancePx).toBe(5);
    expect(res.body.event.confidenceScore).toBeNull();
  });

  it("replay trail without pyautogui is unavailable, not replayed on hardware", async () => {
    behaviour = { kind: "exit", code: 3 };
    const res = await run(handleReplayTrail, { trail: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    expect(res.body).toMatchObject({ success: false, status: "unavailable", executedOnHardware: false, replayedPoints: 0 });
  });

  it("replay trail that runs reports executed", async () => {
    const res = await run(handleReplayTrail, { trail: [{ x: 1, y: 2 }] });
    expect(res.body).toMatchObject({ success: true, status: "executed", executedOnHardware: true, replayedPoints: 1 });
  });

  it("replay trail dispatches the recorded waypoints with their recorded timing", async () => {
    const res = await run(handleReplayTrail, {
      trail: [
        { x: 1, y: 2, time: 1000 },
        { x: 30, y: 40, time: 1250, isClick: true },
      ],
    });
    expect(res.body).toMatchObject({ success: true, status: "executed", executedOnHardware: true, replayedPoints: 2 });
  });
});
