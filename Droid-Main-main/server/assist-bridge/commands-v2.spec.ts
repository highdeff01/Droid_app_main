import { describe, it, expect, vi } from "vitest";
import { handleCommand, type CommandDeps } from "./commands";
import { ScriptRunner } from "./script-runner";

function envelope(type: string, payload: unknown, id = "id-1") {
  return { type, id, ts: Date.now(), payload };
}

function makeDeps(v2: Partial<CommandDeps["v2"]> = {}): CommandDeps {
  const refuse = async () => {
    throw new Error("not wired in this test");
  };
  return {
    freshFrame: async () => ({ live: false, message: "no frame" }),
    reportState: async () => ({}),
    runner: new ScriptRunner({ execute: async () => ({ success: true, executed: true }), isKilled: () => false }),
    logNotice: vi.fn(),
    v2: { userRequest: refuse, stepUpdate: refuse, takeover: refuse, createFile: refuse, requestResult: refuse, ...v2 },
  };
}

describe("v2CommandRouting", () => {
  it("routes user_request to deps.v2.userRequest and replies ok:true with its result", async () => {
    const userRequest = vi.fn().mockReturnValue({ id: "inbox-1" });
    const reply = await handleCommand(envelope("user_request", { text: "what next?" }), makeDeps({ userRequest }));
    expect(userRequest).toHaveBeenCalledWith({ text: "what next?" });
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual({ id: "inbox-1" });
  });

  it("routes step_update to deps.v2.stepUpdate and replies ok:true with its result", async () => {
    const stepUpdate = vi.fn().mockResolvedValue({ stepId: "s1", state: "running" });
    const payload = { stepId: "s1", goal: "finish the signup", step: "click the button", status: "started" };
    const reply = await handleCommand(envelope("step_update", payload), makeDeps({ stepUpdate }));
    expect(stepUpdate).toHaveBeenCalledWith(payload);
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual({ stepId: "s1", state: "running" });
  });

  it("routes takeover_step to deps.v2.takeover and replies ok:true with its result", async () => {
    const takeover = vi.fn().mockResolvedValue({ id: "h1", outcome: "completed" });
    const payload = { stepId: "s1", goal: "finish the signup", step: "click the button", tried: [], screenshots: [] };
    const reply = await handleCommand(envelope("takeover_step", payload), makeDeps({ takeover }));
    expect(takeover).toHaveBeenCalledWith(payload);
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual({ id: "h1", outcome: "completed" });
  });

  it("routes create_file to deps.v2.createFile and replies ok:true with its result", async () => {
    const createFile = vi.fn().mockResolvedValue({ kind: "workflow", status: "written", path: "/tmp/x.json" });
    const payload = { kind: "workflow", workflow: { name: "wf", steps: [{ op: "wait", ms: 0 }] } };
    const reply = await handleCommand(envelope("create_file", payload), makeDeps({ createFile }));
    expect(createFile).toHaveBeenCalledWith(payload);
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual({ kind: "workflow", status: "written", path: "/tmp/x.json" });
  });

  it("routes request_result to deps.v2.requestResult and replies ok:true with its result", async () => {
    const requestResult = vi.fn().mockReturnValue({ requestId: "r1", status: "ok" });
    const payload = { requestId: "r1", ok: true, result: { done: true } };
    const reply = await handleCommand(envelope("request_result", payload), makeDeps({ requestResult }));
    expect(requestResult).toHaveBeenCalledWith(payload);
    expect((reply.payload as any).ok).toBe(true);
    expect((reply.payload as any).result).toEqual({ requestId: "r1", status: "ok" });
  });

  it("refuses step_update with an invalid status and never calls the handler", async () => {
    const stepUpdate = vi.fn();
    const reply = await handleCommand(
      envelope("step_update", { stepId: "s1", goal: "g", step: "s", status: "paused" }),
      makeDeps({ stepUpdate }),
    );
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Invalid step_update payload");
    expect(stepUpdate).not.toHaveBeenCalled();
  });

  it("refuses create_file with an unknown kind and never calls the handler", async () => {
    const createFile = vi.fn();
    const reply = await handleCommand(envelope("create_file", { kind: "shell", path: "x" }), makeDeps({ createFile }));
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Invalid create_file payload");
    expect(createFile).not.toHaveBeenCalled();
  });

  it("refuses takeover_step missing a goal and never calls the handler", async () => {
    const takeover = vi.fn();
    const reply = await handleCommand(
      envelope("takeover_step", { stepId: "s1", step: "s", tried: [], screenshots: [] }),
      makeDeps({ takeover }),
    );
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Invalid takeover_step payload");
    expect(takeover).not.toHaveBeenCalled();
  });

  it("refuses user_request with empty text and never calls the handler", async () => {
    const userRequest = vi.fn();
    const reply = await handleCommand(envelope("user_request", { text: "" }), makeDeps({ userRequest }));
    expect((reply.payload as any).ok).toBe(false);
    expect((reply.payload as any).error).toContain("Invalid user_request payload");
    expect(userRequest).not.toHaveBeenCalled();
  });
});
