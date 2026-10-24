import { describe, expect, it, vi } from "vitest";
import {
  runStepwiseReplay,
  summarizeOutcomes,
  type LoadedFrame,
  type StepOutcome,
  type StepwiseDeps,
  type StepwiseStep,
} from "./stepwise-replay";

/** A solid-luminance synthetic frame: distinct values stand in for distinct screens. */
function makeFrame(luminance: number): LoadedFrame {
  return { gray: { width: 64, height: 36, data: new Array(64 * 36).fill(luminance) }, width: 1920, height: 1080 };
}

const FRAMES: Record<string, LoadedFrame> = { A: makeFrame(0), B: makeFrame(120), C: makeFrame(240) };

/** A capture() mock that returns the given data-url letters in order, one per call. */
function captureSequence(values: string[]): StepwiseDeps["capture"] {
  let index = 0;
  return vi.fn(async () => {
    const value = values[index];
    index += 1;
    return value;
  });
}

function makeDeps(overrides: Partial<StepwiseDeps> = {}): StepwiseDeps {
  return {
    checkBackend: vi.fn(async () => null),
    capture: vi.fn(async () => "A"),
    loadFrame: vi.fn(async (url: string) => FRAMES[url] ?? makeFrame(0)),
    runStep: vi.fn(async () => {}),
    findElement: vi.fn(async () => null),
    replan: vi.fn(async () => "Replanning toward the goal"),
    ...overrides,
  };
}

function makeStep(id: string, name: string, extra: Partial<StepwiseStep> = {}): StepwiseStep {
  return { id, name, action: "click", x: 10, y: 20, ...extra };
}

describe("runStepwiseReplay", () => {
  it("reports unavailable and never dispatches when the backend check fails", async () => {
    const deps = makeDeps({ checkBackend: vi.fn(async () => "PyAutoGUI bridge offline") });
    const signal = new AbortController().signal;
    const result = await runStepwiseReplay(
      [makeStep("s1", "Step One")],
      { signal, verifyDrift: false, onProgress: vi.fn() },
      deps,
    );
    expect(result).toEqual({ status: "unavailable", reason: "PyAutoGUI bridge offline", outcomes: [] });
    expect(deps.runStep).not.toHaveBeenCalled();
  });

  it("runs every step in order and reports honest executing/executed progress", async () => {
    const steps = [makeStep("s1", "Step One"), makeStep("s2", "Step Two"), makeStep("s3", "Step Three")];
    const deps = makeDeps();
    const onProgress = vi.fn();
    const signal = new AbortController().signal;

    const result = await runStepwiseReplay(steps, { signal, verifyDrift: false, onProgress }, deps);

    expect(vi.mocked(deps.runStep).mock.calls.map(([step]) => step.id)).toEqual(["s1", "s2", "s3"]);
    expect(onProgress.mock.calls.map(([p]) => ({ phase: p.phase, current: p.current, total: p.total }))).toEqual([
      { phase: "executing", current: 1, total: 3 },
      { phase: "executed", current: 1, total: 3 },
      { phase: "executing", current: 2, total: 3 },
      { phase: "executed", current: 2, total: 3 },
      { phase: "executing", current: 3, total: 3 },
      { phase: "executed", current: 3, total: 3 },
    ]);
    expect(result.status).toBe("completed");
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes.every((o) => o.status === "executed")).toBe(true);
  });

  it("fails on a step rejection and does not run later steps", async () => {
    const steps = [makeStep("s1", "Step One"), makeStep("s2", "Step Two")];
    const deps = makeDeps({
      runStep: vi.fn(async (step: StepwiseStep) => {
        if (step.id === "s1") throw new Error("Bridge disconnected");
      }),
    });
    const signal = new AbortController().signal;

    const result = await runStepwiseReplay(steps, { signal, verifyDrift: false, onProgress: vi.fn() }, deps);

    if (result.status !== "failed") throw new Error("expected failed");
    expect(result.reason).toContain("Bridge disconnected");
    expect(result.outcomes).toEqual([
      expect.objectContaining({ stepId: "s1", status: "failed", detail: "Bridge disconnected" }),
    ]);
    expect(deps.runStep).toHaveBeenCalledTimes(1);
  });

  it("drift-checks against saved frames and completes when the screen matches expectations", async () => {
    const step1 = makeStep("s1", "Step One");
    const step2 = makeStep("s2", "Step Two", { referenceScreenshotUrl: "B" });
    const steps = [step1, step2];
    const deps = makeDeps({
      capture: captureSequence(["A", "B", "B", "C"]),
      findElement: vi.fn(async () => "Submit button"),
    });
    const signal = new AbortController().signal;

    const result = await runStepwiseReplay(steps, { signal, verifyDrift: true, onProgress: vi.fn() }, deps);

    expect(result.status).toBe("completed");
    expect(deps.findElement).toHaveBeenCalledTimes(1);
    expect(deps.findElement).toHaveBeenCalledWith("B", step2, signal);
    expect(result.outcomes[0]).toMatchObject({ status: "executed", elementCheck: "next target found: Submit button" });
    expect(result.outcomes[0].postCheck?.kind).toBe("progress");
    expect(result.outcomes[1]).toMatchObject({ status: "executed", elementCheck: "skipped: last step has no next target" });
    expect(result.outcomes[1].preCheck?.kind).toBe("progress");
  });

  it("reflects the element check's absence when the next target is not found", async () => {
    const step1 = makeStep("s1", "Step One");
    const step2 = makeStep("s2", "Step Two", { referenceScreenshotUrl: "B", targetOcrLabel: "Submit" });
    const deps = makeDeps({
      capture: captureSequence(["A", "B", "B", "C"]),
      findElement: vi.fn(async () => null),
    });
    const signal = new AbortController().signal;

    const result = await runStepwiseReplay([step1, step2], { signal, verifyDrift: true, onProgress: vi.fn() }, deps);

    expect(result.status).toBe("completed");
    expect(result.outcomes[0].elementCheck).toBe('next target "Submit" not found');
  });

  it("classifies a backtrack to an earlier screen, replans from the drifting step, and skips it", async () => {
    const step1 = makeStep("s1", "Step One");
    const step2 = makeStep("s2", "Step Two", { referenceScreenshotUrl: "B" });
    const steps = [step1, step2];
    // pre step1 -> A, post step1 -> B (matches step2's expectation), pre step2 -> A again: the
    // screen reverted to the very first frame instead of holding B, which is a backtrack.
    const deps = makeDeps({
      capture: captureSequence(["A", "B", "A"]),
      replan: vi.fn(async () => "Replanning from step 2"),
    });
    const onDrift = vi.fn();
    const signal = new AbortController().signal;

    const result = await runStepwiseReplay(steps, { signal, verifyDrift: true, onProgress: vi.fn(), onDrift }, deps);

    if (result.status !== "replanned") throw new Error("expected replanned");
    expect(result.drift.kind).toBe("backtrack");
    expect(result.replan).toBe("Replanning from step 2");
    expect(onDrift).toHaveBeenCalledWith(expect.objectContaining({ kind: "backtrack" }), step2);
    expect(deps.replan).toHaveBeenCalledWith(expect.stringContaining('Backtrack at step 2 ("Step Two")'), [step2], signal);
    expect(deps.runStep).toHaveBeenCalledTimes(1);
    expect(deps.runStep).toHaveBeenCalledWith(step1, signal);
  });

  it("classifies an unexpected page, replans including the step just run, and surfaces the drift", async () => {
    const step1 = makeStep("s1", "Step One");
    const step2 = makeStep("s2", "Step Two", { referenceScreenshotUrl: "B" });
    const steps = [step1, step2];
    // pre step1 -> A, post step1 -> C: a page neither matching step2's saved frame nor seen before.
    const deps = makeDeps({ capture: captureSequence(["A", "C"]) });
    const onDrift = vi.fn();
    const signal = new AbortController().signal;

    const result = await runStepwiseReplay(steps, { signal, verifyDrift: true, onProgress: vi.fn(), onDrift }, deps);

    if (result.status !== "replanned") throw new Error("expected replanned");
    expect(result.drift.kind).toBe("wrong_page");
    expect(onDrift).toHaveBeenCalledWith(expect.objectContaining({ kind: "wrong_page" }), step1);
    expect(deps.replan).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected page at step 1 ("Step One")'),
      [step1, step2],
      signal,
    );
    expect(deps.runStep).toHaveBeenCalledTimes(1);
  });

  it("cancels before dispatch when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = makeDeps();

    const result = await runStepwiseReplay(
      [makeStep("s1", "Step One")],
      { signal: controller.signal, verifyDrift: false, onProgress: vi.fn() },
      deps,
    );

    expect(result).toEqual({ status: "cancelled", reason: "Stopped before step 1", outcomes: [] });
    expect(deps.checkBackend).toHaveBeenCalled();
    expect(deps.runStep).not.toHaveBeenCalled();
  });

  it("fails immediately on an empty step list without touching the backend", async () => {
    const deps = makeDeps();

    const result = await runStepwiseReplay([], { signal: new AbortController().signal, verifyDrift: false, onProgress: vi.fn() }, deps);

    expect(result).toEqual({ status: "failed", reason: "No recorded steps to execute.", outcomes: [] });
    expect(deps.checkBackend).not.toHaveBeenCalled();
  });
});

/** A frame whose full-resolution pixels hold a textured 20x20 button at top-left (bx, by); null = no button. */
function pixelFrame(button: { x: number; y: number } | null): LoadedFrame {
  const data = new Float32Array(200 * 120).fill(30);
  if (button) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) data[(button.y + y) * 200 + button.x + x] = 100 + ((x * 7 + y * 13) % 120);
    }
  }
  return { gray: makeFrame(0).gray, width: 200, height: 120, pixels: { width: 200, height: 120, data } };
}

describe("runStepwiseReplay drift measurement (template matching)", () => {
  const signal = new AbortController().signal;
  const PIXEL_FRAMES: Record<string, LoadedFrame> = {
    saved: pixelFrame({ x: 60, y: 40 }),
    moved: pixelFrame({ x: 73, y: 31 }),
    gone: pixelFrame(null),
  };

  it("locates the target on the live frame, acts at the corrected point, re-verifies and logs drift", async () => {
    const step = makeStep("s1", "Press OK", { x: 70, y: 50, referenceScreenshotUrl: "saved" });
    const deps = makeDeps({ capture: captureSequence(["moved", "moved"]), loadFrame: vi.fn(async (url: string) => PIXEL_FRAMES[url]) });
    const onDriftMeasured = vi.fn();

    const result = await runStepwiseReplay([step], { signal, verifyDrift: true, onProgress: vi.fn(), onDriftMeasured }, deps);

    expect(result.status).toBe("completed");
    expect(deps.runStep).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", x: 83, y: 41 }), signal);
    const [outcome] = result.outcomes;
    expect(outcome.actedAt).toEqual({ x: 83, y: 41 });
    expect(outcome.drift).toMatchObject({ status: "located", dx: 13, dy: -9 });
    expect(outcome.postDrift).toMatchObject({ status: "located", dx: 0, dy: 0 });
    expect(onDriftMeasured.mock.calls.map(([, phase, drift]) => [phase, drift.dx, drift.dy])).toEqual([
      ["before", 13, -9],
      ["after", 0, 0],
    ]);
  });

  it("fails without acting when the recorded target is not on the live frame", async () => {
    const step = makeStep("s1", "Press OK", { x: 70, y: 50, referenceScreenshotUrl: "saved" });
    const deps = makeDeps({ capture: captureSequence(["gone"]), loadFrame: vi.fn(async (url: string) => PIXEL_FRAMES[url]) });

    const result = await runStepwiseReplay([step], { signal, verifyDrift: true, onProgress: vi.fn() }, deps);

    expect(result.status).toBe("failed");
    expect(result.outcomes[0].drift?.status).toBe("not_found");
    expect(deps.runStep).not.toHaveBeenCalled();
  });

  it("acts at the recorded point with drift unmeasured when the step has no saved frame", async () => {
    const step = makeStep("s1", "Press OK", { x: 70, y: 50 });
    const deps = makeDeps({ capture: captureSequence(["moved", "moved"]), loadFrame: vi.fn(async (url: string) => PIXEL_FRAMES[url]) });

    const result = await runStepwiseReplay([step], { signal, verifyDrift: true, onProgress: vi.fn() }, deps);

    expect(result.status).toBe("completed");
    expect(deps.runStep).toHaveBeenCalledWith(step, signal);
    expect(result.outcomes[0].drift?.status).toBe("unmeasured");
  });
});

describe("summarizeOutcomes", () => {
  it("counts executed, failed and skipped outcomes against the total", () => {
    const outcomes: StepOutcome[] = [
      { stepId: "1", name: "a", status: "executed", detail: "x" },
      { stepId: "2", name: "b", status: "executed", detail: "x" },
      { stepId: "3", name: "c", status: "failed", detail: "x" },
      { stepId: "4", name: "d", status: "skipped", detail: "x" },
    ];
    expect(summarizeOutcomes(outcomes, 5)).toBe("2/5 executed, 1 failed, 1 skipped");
  });
});
