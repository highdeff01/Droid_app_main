import { describe, it, expect, vi, type Mock } from "vitest";
import { handleCommand, type CommandDeps } from "./commands";
import { ScriptRunner, type DeviceExecutor, type ScriptRunnerDeps } from "./script-runner";
import type { FrameOutcome } from "./frames";

function envelope(type: string, payload: unknown, id = "id-1") {
  return { type, id, ts: Date.now(), payload };
}

function makeRunner(overrides: Partial<ScriptRunnerDeps> = {}) {
  const execute = (overrides.execute ?? vi.fn(async () => ({ success: true, executed: true }))) as Mock<DeviceExecutor>;
  const runnerDeps: ScriptRunnerDeps = { execute, isKilled: () => false, sleep: async () => {}, ...overrides };
  return { execute, runner: new ScriptRunner(runnerDeps) };
}

function makeDeps(opts: {
  runner?: ScriptRunner;
  freshFrame?: () => Promise<FrameOutcome>;
  reportState?: () => Promise<unknown>;
  logNotice?: CommandDeps["logNotice"];
} = {}): CommandDeps {
  return {
    freshFrame: opts.freshFrame ?? (async () => ({ live: false, message: "no frame" })),
    reportState: opts.reportState ?? (async () => ({})),
    runner: opts.runner ?? makeRunner().runner,
    logNotice: opts.logNotice ?? vi.fn(),
  };
}

describe("commandValidation", () => {
  it("rejects an unknown command type", async () => {
    const { execute, runner } = makeRunner();
    const reply = await handleCommand(envelope("shell_exec", {}, "req-1"), makeDeps({ runner }));
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Unknown command");
    expect((reply.payload as any).replyTo).toBe("req-1");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON string message", async () => {
    const reply = await handleCommand("not json at all", makeDeps());
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("not valid JSON");
  });

  it("rejects an envelope missing an id", async () => {
    const reply = await handleCommand({ type: "report_state", ts: Date.now(), payload: {} }, makeDeps());
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Invalid envelope");
  });

  const invalidRunScriptCases: [string, unknown[]][] = [
    ["too many steps", Array.from({ length: 21 }, () => ({ op: "wait", ms: 0 }))],
    ["negative coordinate", [{ op: "click", x: -1, y: 0 }]],
    ["text too long", [{ op: "type", text: "a".repeat(501) }]],
    ["invalid key", [{ op: "key", key: "rm -rf" }]],
    ["wait over the per-step limit", [{ op: "wait", ms: 6000 }]],
    ["total wait over the budget", [{ op: "wait", ms: 8000 }, { op: "wait", ms: 8000 }]],
    ["unknown op", [{ op: "scroll", x: 0, y: 0 }]],
  ];

  it.each(invalidRunScriptCases)("rejects run_script with %s", async (_name, steps) => {
    const { execute, runner } = makeRunner();
    const reply = await handleCommand(envelope("run_script", { steps }), makeDeps({ runner }));
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Invalid run_script payload");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses request_fresh_frame while in standby", async () => {
    const reply = await handleCommand(
      envelope("request_fresh_frame", {}),
      makeDeps({ freshFrame: async () => ({ live: false, message: "no frame" }) }),
    );
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("standby");
  });

  it("returns the live frame for request_fresh_frame", async () => {
    const frame = { jpeg: "data:image/jpeg;base64,AAA", w: 2, h: 2, ts: 1 };
    const reply = await handleCommand(
      envelope("request_fresh_frame", {}),
      makeDeps({ freshFrame: async () => ({ live: true, frame }) }),
    );
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual(frame);
  });

  it("logs and acknowledges intercept_notice", async () => {
    const logNotice = vi.fn();
    const reply = await handleCommand(envelope("intercept_notice", { message: "hi" }), makeDeps({ logNotice }));
    expect(logNotice).toHaveBeenCalledWith({ message: "hi" });
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual({ logged: true });
  });
});

describe("runScriptRefusal", () => {
  it("refuses run_script while the kill switch is tripped", async () => {
    const { execute, runner } = makeRunner({ isKilled: () => true });
    const reply = await handleCommand(envelope("run_script", { steps: [{ op: "wait", ms: 0 }] }), makeDeps({ runner }));
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Kill switch");
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs a valid click/type/key/wait script to completion", async () => {
    const { execute, runner } = makeRunner();
    const steps = [
      { op: "click", x: 1, y: 1 },
      { op: "type", text: "hi" },
      { op: "key", key: "Enter" },
      { op: "wait", ms: 0 },
    ];
    const reply = await handleCommand(envelope("run_script", { steps }), makeDeps({ runner }));
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result.completed).toBe(true);
    const actions = execute.mock.calls.map((call) => call[0].action);
    expect(actions).toEqual(["click", "type", "press_key"]);
    for (const call of execute.mock.calls) expect(call[0].origin).toBe("assist_bridge");
  });

  it("stops after a step the executor refuses and does not run later steps", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ success: true, executed: true })
      .mockResolvedValueOnce({ success: false, executed: false, error: "no backend" })
      .mockResolvedValueOnce({ success: true, executed: true });
    const { runner } = makeRunner({ execute });
    const steps = [{ op: "click", x: 1, y: 1 }, { op: "type", text: "hi" }, { op: "key", key: "Enter" }];
    const reply = await handleCommand(envelope("run_script", { steps }), makeDeps({ runner }));
    expect((reply.payload as any).result.completed).toBe(false);
    expect((reply.payload as any).result.stoppedReason).toBe("no backend");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("stops when the kill switch trips mid-run", async () => {
    let killed = false;
    const execute = vi.fn(async () => {
      killed = true;
      return { success: true, executed: true };
    });
    const { runner } = makeRunner({ execute, isKilled: () => killed });
    const steps = [{ op: "click", x: 1, y: 1 }, { op: "type", text: "hi" }];
    const reply = await handleCommand(envelope("run_script", { steps }), makeDeps({ runner }));
    expect((reply.payload as any).result.completed).toBe(false);
    expect((reply.payload as any).result.stoppedReason).toBe("Kill switch tripped");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses a second run while the first is still pending", async () => {
    let resolveFirst!: () => void;
    const pending = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const execute = vi.fn(async () => {
      await pending;
      return { success: true, executed: true };
    });
    const { runner } = makeRunner({ execute });
    const deps = makeDeps({ runner });
    const first = handleCommand(envelope("run_script", { steps: [{ op: "click", x: 1, y: 1 }] }), deps);
    const second = await handleCommand(envelope("run_script", { steps: [{ op: "click", x: 1, y: 1 }] }), deps);
    expect((second.payload as any).ok).toBe(false);
    expect((second.payload as any).error).toContain("busy");
    resolveFirst();
    await first;
  });
});
