import { describe, expect, it, vi } from "vitest";
import type { ReplayRunSnapshot } from "./automation-runner";
import {
  MAX_REPLAY_ACTIONS,
  runVerifiedReplay,
  sessionToReplaySteps,
  toReplaySteps,
  waitForReplayRun,
  type ReplayDeps,
} from "./verified-replay";

const run = (status: ReplayRunSnapshot["status"], currentStep = 0, error?: string): ReplayRunSnapshot => ({
  id: "r1",
  status,
  currentStep,
  error,
  steps: [],
});

function makeDeps(runs: ReplayRunSnapshot[], gateStatus: "verified" | "blocked" = "verified"): ReplayDeps {
  const queue = [...runs];
  return {
    gate: vi.fn(async () =>
      gateStatus === "verified"
        ? ({ status: "verified", frame: "f", report: {} as any, confidence: 0.7 } as const)
        : ({ status: "blocked", reason: "Target not found" } as const),
    ),
    start: vi.fn(async () => queue.shift()!),
    fetch: vi.fn(async () => queue.shift()!),
    sleep: vi.fn(async () => {}),
  };
}

const step = { id: "s1", name: "Email", action: "type_text" as const, x: 10, y: 20, text: "a@b.c" };

describe("toReplaySteps", () => {
  it("rejects an empty recording instead of inventing steps", () => {
    expect(() => toReplaySteps([])).toThrow(/No recorded steps/);
  });

  it("applies calibrated offsets to the original coordinates", () => {
    const [out] = toReplaySteps([{ ...step, originalX: 100, originalY: 50, offsetX: 7, offsetY: -3 }]);
    expect(out).toMatchObject({ id: "s1", stepNumber: 1, x: 107, y: 47, text: "a@b.c", status: "pending" });
  });
});

describe("sessionToReplaySteps", () => {
  it("replays only click points, keeping right clicks", () => {
    const steps = sessionToReplaySteps({
      id: "sess",
      name: "Login",
      points: [
        { x: 1, y: 1, type: "move" },
        { x: 5.4, y: 6.6, type: "left_click" },
        { x: 9, y: 9, type: "right_click" },
      ],
    });
    expect(steps.map((s) => [s.action, s.x, s.y])).toEqual([
      ["click", 5, 7],
      ["right_click", 9, 9],
    ]);
  });

  it("fails clearly when a session has no clicks", () => {
    expect(() => sessionToReplaySteps({ name: "Hover", points: [{ x: 1, y: 1, type: "hover" }] })).toThrow(
      /no recorded clicks/,
    );
  });

  it("fails clearly above the replay action limit", () => {
    const points = Array.from({ length: MAX_REPLAY_ACTIONS + 1 }, () => ({ x: 1, y: 1, type: "click" }));
    expect(() => sessionToReplaySteps({ name: "Big", points })).toThrow(/at most 100/);
  });
});

describe("waitForReplayRun", () => {
  it("polls until completed and reports each snapshot", async () => {
    const deps = makeDeps([run("running", 1), run("completed", 2)]);
    const seen: number[] = [];
    const final = await waitForReplayRun(
      run("running", 0),
      { signal: new AbortController().signal, onProgress: (r) => seen.push(r.currentStep) },
      deps,
    );
    expect(final.status).toBe("completed");
    expect(seen).toEqual([0, 1, 2]);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects with the run error when the replay fails", async () => {
    const deps = makeDeps([run("failed", 3, "Step 4 target missing")]);
    await expect(
      waitForReplayRun(run("running"), { signal: new AbortController().signal }, deps),
    ).rejects.toThrow("Step 4 target missing");
  });

  it("rejects a cancelled run", async () => {
    const deps = makeDeps([]);
    await expect(
      waitForReplayRun(run("cancelled"), { signal: new AbortController().signal }, deps),
    ).rejects.toThrow(/cancelled/);
  });
});

describe("runVerifiedReplay", () => {
  it("does not dispatch when the gate blocks", async () => {
    const deps = makeDeps([run("completed")], "blocked");
    await expect(
      runVerifiedReplay(toReplaySteps([step]), { signal: new AbortController().signal }, deps),
    ).rejects.toThrow("Action blocked: Target not found");
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("starts the replay after verification and resolves on completion", async () => {
    const deps = makeDeps([run("running"), run("completed", 1)]);
    const onGate = vi.fn();
    const final = await runVerifiedReplay(
      toReplaySteps([step]),
      { signal: new AbortController().signal, onGate },
      deps,
    );
    expect(final.status).toBe("completed");
    expect(onGate).toHaveBeenCalledWith(expect.objectContaining({ status: "verified", confidence: 0.7 }));
    expect(deps.gate).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ x: 10, y: 20, needsTarget: true }) }),
    );
  });
});
