import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dueTasks, startPollLoop, type PollTask } from "./poll-loop";

const task = (everyTicks: number, run = vi.fn(async () => {}), enabled = () => true): PollTask => ({
  everyTicks,
  enabled,
  run,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("dueTasks", () => {
  it("runs every-tick tasks always and slower tasks on their multiple", () => {
    const fast = task(1);
    const slow = task(2);
    expect(dueTasks([fast, slow], 0)).toEqual([fast, slow]);
    expect(dueTasks([fast, slow], 1)).toEqual([fast]);
  });

  it("skips disabled tasks", () => {
    expect(dueTasks([task(1, undefined, () => false)], 0)).toEqual([]);
  });
});

describe("startPollLoop", () => {
  it("never overlaps a slow tick and stops cleanly", async () => {
    let resolveRun: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (resolveRun = resolve)));
    const stop = startPollLoop([task(1, run)], 250);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    resolveRun();
    await vi.advanceTimersByTimeAsync(250);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    resolveRun();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a task rejects", async () => {
    const run = vi.fn(async () => {
      throw new Error("network");
    });
    const stop = startPollLoop([task(1, run)], 100);
    await vi.advanceTimersByTimeAsync(250);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(3);
    stop();
  });
});
