import { describe, expect, it, vi } from "vitest";
import { ReplayEngine, type ReplayJudge } from "./replay-engine";
import type { ReplayAdapter } from "./replay-adapter";
import { replayActionCount, replayRequestSchema } from "../shared/replay";

vi.mock("./ai-monitor-store", () => ({
  aiMonitorStore: { record: vi.fn(), setStatus: vi.fn() },
}));

/** Fake device: every frame is fresh; the hash changes only after an action executes. */
function fakeAdapter() {
  let executed = 0;
  const adapter: ReplayAdapter = {
    capture: async () => ({
      image: "data:image/png;base64,AA==",
      width: 1920,
      height: 1080,
      capturedAt: Date.now(),
      hash: `frame-${executed}`,
    }),
    execute: async () => {
      executed++;
    },
  };
  return { adapter, executions: () => executed };
}

const certainJudge: ReplayJudge = async (phase, step) =>
  phase === "planning"
    ? { certain: true, explanation: "target found", x: step.x, y: step.y }
    : { certain: true, explanation: "outcome visible", verified: true };

const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Step ${id}`,
  action: "click",
  x: 100,
  y: 200,
  delayMs: 0,
  ...extra,
});

let deviceSeq = 0;
const request = (steps: unknown[], iterations = 1) => ({
  targetDevice: "android",
  deviceId: `spec-device-${++deviceSeq}`,
  steps,
  iterations,
  confirmation: true,
});

async function settle(engine: ReplayEngine, id: string) {
  for (let i = 0; i < 200; i++) {
    const run = engine.get(id)!;
    if (!["running", "paused"].includes(run.status)) return run;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("run did not settle");
}

describe("replay step repeatCount", () => {
  it("defaults repeatCount to 1 when the step omits it", () => {
    const parsed = replayRequestSchema.parse(request([step("a")]));
    expect(parsed.steps[0].repeatCount).toBe(1);
  });

  it("rejects repeatCount below 1, above 25 or fractional", () => {
    for (const repeatCount of [0, 26, 1.5])
      expect(
        replayRequestSchema.safeParse(request([step("a", { repeatCount })]))
          .success,
      ).toBe(false);
  });

  it("counts repeats toward the 100-action limit", () => {
    expect(replayActionCount([{ repeatCount: 4 }, {}], 3)).toBe(15);
    const tooMany = request([step("a", { repeatCount: 25 })], 5);
    expect(replayRequestSchema.safeParse(tooMany).success).toBe(false);
    const allowed = request([step("a", { repeatCount: 20 })], 5);
    expect(replayRequestSchema.safeParse(allowed).success).toBe(true);
  });

  it("performs a step's action repeatCount times, each verified, in each iteration", async () => {
    const { adapter, executions } = fakeAdapter();
    const judge = vi.fn(certainJudge);
    const engine = new ReplayEngine(undefined, judge);
    const started = engine.start(
      request([step("a", { repeatCount: 3 }), step("b")], 2),
      adapter,
    );
    expect(started.total).toBe(8);
    const run = await settle(engine, started.id);
    expect(run.status).toBe("completed");
    expect(executions()).toBe(8);
    expect(run.completed).toBe(8);
    expect(judge.mock.calls.filter(([p]) => p === "verification")).toHaveLength(8);
    expect(run.steps.map((s) => s.status)).toEqual(["completed", "completed"]);
  }, 20000);

  it("fails the step and stops repeating when one repeat is not verified", async () => {
    const { adapter, executions } = fakeAdapter();
    let reviews = 0;
    const judge: ReplayJudge = async (phase, s, before, after) => {
      if (phase === "verification" && ++reviews === 2)
        return { certain: true, explanation: "nothing changed", verified: false };
      return certainJudge(phase, s, before, after);
    };
    const engine = new ReplayEngine(undefined, judge);
    const started = engine.start(
      request([step("a", { repeatCount: 4 }), step("b")]),
      adapter,
    );
    const run = await settle(engine, started.id);
    expect(run.status).toBe("failed");
    expect(executions()).toBe(2);
    expect(run.completed).toBe(1);
    expect(run.steps.map((s) => s.status)).toEqual(["failed", "pending"]);
  }, 20000);
});
