/**
 * One self-scheduling poll loop: each tick awaits the previous one before the
 * next is scheduled, so slow requests never pile up. Several pollers can share
 * one loop by running only on every Nth tick.
 */

export interface PollTask {
  /** Run on every `everyTicks`-th tick (1 = every tick). */
  everyTicks: number;
  enabled: () => boolean;
  run: () => Promise<void>;
}

/** The tasks due on a given tick number. */
export function dueTasks(tasks: PollTask[], tick: number): PollTask[] {
  return tasks.filter((task) => tick % task.everyTicks === 0 && task.enabled());
}

/** Starts the loop immediately; the returned function stops it. Task errors never stop the loop. */
export function startPollLoop(tasks: PollTask[], intervalMs: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tick = 0;
  const loop = async () => {
    await Promise.allSettled(dueTasks(tasks, tick).map((task) => task.run()));
    tick += 1;
    if (!stopped) timer = setTimeout(loop, intervalMs);
  };
  void loop();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
