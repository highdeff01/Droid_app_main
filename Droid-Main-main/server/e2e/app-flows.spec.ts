/**
 * Back-to-back end-to-end chain: every major HUD flow runs against the real
 * server routes in one sequential suite, sharing state, so a regression in one
 * link surfaces as a broken chain. The Python bridges are mocked at the spawn
 * boundary (replay.py answers, every other script is missing: ENOENT) and the
 * AI model is stubbed at the HTTP boundary by matching the route's own prompt.
 */
import { EventEmitter } from "events";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runActionGate, gateTargetForAction, type GatePost } from "../../client/lib/action-gate";

const spawnBoundary = (() => {
  const state = { screenVersion: 0, executed: [] as unknown[], spawned: [] as string[] };

  /** A real PNG header (magic + IHDR, 4x4) whose trailing byte tracks the screen version. */
  function png(): string {
    const bytes = Buffer.alloc(33);
    Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(4, 16);
    bytes.writeUInt32BE(4, 20);
    bytes[32] = state.screenVersion % 256;
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }

  /** replay.py: capture returns the current screen, execute changes it. */
  function replayReply(payload: { operation: string; step?: unknown }) {
    if (payload.operation === "capture") return { success: true, image: png() };
    state.executed.push(payload.step);
    state.screenVersion++;
    return { success: true };
  }

  function fakeChild(script: string) {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.write = () => true;
    child.kill = () => true;
    child.unref = () => undefined;
    if (script.endsWith("replay.py")) {
      child.stdin.end = (data: string) =>
        setTimeout(() => {
          child.stdout.emit("data", Buffer.from(JSON.stringify(replayReply(JSON.parse(data)))));
          child.emit("close", 0);
        }, 1);
    } else {
      child.stdin.end = () => undefined;
      setTimeout(() => {
        child.emit("error", Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" }));
        child.emit("close", -2);
      }, 1);
    }
    return child;
  }

  const spawn = (_cmd: string, args: string[] = []) => {
    const script = String(args[0] ?? _cmd);
    state.spawned.push(script);
    return fakeChild(script);
  };
  return { state, png, spawn };
})();

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  spawn: vi.fn((cmd: string, args?: string[]) => spawnBoundary.spawn(cmd, args)),
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn((cmd: string, args?: string[]) => spawnBoundary.spawn(cmd, args)),
}));

const API_KEY = "e2e-chain-key";
const AI_ENDPOINT = "http://ai.test/api/chat";
const SUBMIT = { name: "Submit", textValue: "Submit", boundingBox: { x: 100, y: 200, width: 50, height: 20 }, center: { x: 125, y: 210 }, confidence: 0.9 };
const NOTE_TITLE = `Invoice folder location ${Date.now()}`;
const RECORDED_STEP = `Click recorded Submit ${Date.now()}`;
const original = { ...process.env };
const realFetch = globalThis.fetch;
let server: Server;
let baseUrl = "";

/** The model's reply for each route, chosen by the prompt that route sends. */
const AI_REPLIES: Array<[string, (text: string) => unknown]> = [
  ["cautious UI replay planner", () => ({ certain: true, explanation: "Target located", x: 1, y: 1 })],
  ["cautious UI replay reviewer", () => ({ certain: true, verified: true, explanation: "Outcome visible" })],
  ["planner of a screen-control", () => ({ steps: [{ name: "Click Submit", action: "click", x: 125, y: 210, targetLabel: "Submit", expectation: { kind: "screen_changed" } }] })],
  ["track whether a screen-control GOAL", () => ({ complete: true, onTrack: true, reason: "Form submitted", confidence: 0.9 })],
  ["Overseer running a periodic checkup", () => ({ isFinished: false, onTrack: true, summary: "Progressing" })],
  ["You are the Overseer", () => ({ status: "verified", verified: true, accuracyScore: 0.9, expectationMet: true, onTrack: true, goalFinished: false, analysis: "Step visible" })],
  ["repair and improve", () => ({ summary: "Click retry", steps: [{ name: "Retry", action: "click", x: 5, y: 5 }] })],
  ["You are Sightline", (text) => ({ reply: text.includes(NOTE_TITLE) ? `I remember: ${NOTE_TITLE}` : "I have no notes about that", actions: [] })],
  ["Describe only the supplied screenshot", () => ({ screenDescription: "Login screen", confidence: 0.9, elements: [{ id: "submit", type: "button", interactive: true, ...SUBMIT }] })],
];

function aiReply(body: { messages: Array<{ content: string }> }): Response {
  const text = body.messages.map((m) => m.content).join("\n");
  const match = AI_REPLIES.find(([marker]) => text.includes(marker));
  if (!match) return new Response("unexpected prompt", { status: 500 });
  return new Response(JSON.stringify({ message: { content: JSON.stringify(match[1](text)) } }), {
    headers: { "Content-Type": "application/json" },
  });
}

const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("http://ai.test")) return aiReply(JSON.parse(String(init?.body)));
  return realFetch(input, init);
}) as typeof fetch;

beforeAll(async () => {
  process.env.NODE_ENV = "production";
  process.env.ASSISTANT_API_KEY = API_KEY;
  process.env.OLLAMA_ENDPOINT = AI_ENDPOINT;
  delete process.env.CORS_ORIGINS;
  globalThis.fetch = stubFetch;
  const { createServer } = await import("../index");
  server = createServer().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  globalThis.fetch = realFetch;
  process.env = { ...original };
});

async function call(method: string, path: string, body?: unknown) {
  const res = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

/** The HUD's own gate client, pointed at this server. */
const serverPost: GatePost = async (url, body) => {
  const { status, data } = await call("POST", url, body);
  if (status >= 400 || data.success !== true) throw new Error(data.error || `${url} failed`);
  return data;
};

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const observation = () => ({
  signature: `sig_${spawnBoundary.state.screenVersion}`,
  description: "Login screen",
  elements: [SUBMIT],
  ocrText: [],
  capturedAt: Date.now(),
});

describe("app flows chain", () => {
  const chain: {
    cursor: number;
    frame: string;
    runId: string;
    goalSteps: any[];
    operationId: string;
    taskId: string;
    proposalId: string;
  } = { cursor: 0, frame: "", runId: "", goalSteps: [], operationId: `op_e2e_${Date.now()}`, taskId: "", proposalId: "" };

  it("starts from a progress cursor every tab can poll from", async () => {
    const { status, data } = await call("GET", "/api/progress?since=0");
    expect(status).toBe(200);
    expect(Array.isArray(data.events)).toBe(true);
    chain.cursor = data.cursor;
  });

  it("capture → analyze → gate → execute: the gate verifies the target and the missing bridge is reported honestly", async () => {
    const shot = await call("POST", "/api/replay/capture", { targetDevice: "desktop" });
    expect(shot.status).toBe(200);
    expect(shot.data.frame.image).toMatch(/^data:image\/png;base64,/);
    expect(shot.data.frame).toMatchObject({ width: 4, height: 4 });
    chain.frame = shot.data.frame.image;

    const synced = await call("POST", "/api/sync-real-frame", { imageData: chain.frame });
    expect(synced.data.success).toBe(true);
    const live = await call("GET", "/api/capture-screen");
    expect(live.status).toBe(200);
    expect(live.data).toMatchObject({ success: true, imageData: chain.frame, source: "live_hud_sync" });

    const gate = await runActionGate(
      { targetDevice: "desktop", target: gateTargetForAction("click", 125, 210, "Submit"), signal: new AbortController().signal },
      serverPost,
    );
    expect(gate.status).toBe("verified");
    expect(gate.status === "verified" && gate.element?.name).toBe("Submit");

    const missedGate = await runActionGate(
      { targetDevice: "desktop", target: gateTargetForAction("click", 900, 900, "Ghost"), signal: new AbortController().signal },
      serverPost,
    );
    expect(missedGate.status).toBe("blocked");

    const exec = await call("POST", "/api/pyautogui/bridge", { action: "click", targetPosition: { x: 125, y: 210 } });
    expect(exec.status).toBe(200);
    expect(exec.data).toMatchObject({ success: false, status: "unavailable", executed: false, executedCount: 0 });
  });

  it("record → save → replay with repeat: every repetition is captured, executed and verified", async () => {
    const executedBefore = spawnBoundary.state.executed.length;
    const started = await call("POST", "/api/replay", {
      targetDevice: "desktop",
      steps: [{ id: "rec_1", name: RECORDED_STEP, action: "click", x: 1, y: 1, delayMs: 0, repeatCount: 2 }],
      iterations: 1,
      confirmation: true,
    });
    expect(started.status).toBe(202);
    chain.runId = started.data.run.id;
    const finished = await until(
      () => call("GET", `/api/replay/${chain.runId}`),
      (r) => ["completed", "failed", "cancelled"].includes(r.data.run?.status),
      30000,
    );
    expect(finished.data.run.status).toBe("completed");
    expect(finished.data.run.total).toBe(2);
    expect(finished.data.run.completed).toBe(2);
    expect(spawnBoundary.state.executed.length - executedBefore).toBe(2);
  }, 40000);

  it("records the replay's control times as an AI activity note", async () => {
    const notes = await until(
      () => call("GET", "/api/companion/notes?tag=control_time"),
      (r) => (r.data.notes ?? []).some((n: any) => n.title.includes(RECORDED_STEP)),
      10000,
    );
    const note = notes.data.notes.find((n: any) => n.title.includes(RECORDED_STEP));
    expect(note).toBeDefined();
    expect(note.tags).toEqual(expect.arrayContaining(["activity", "replay", "workflow_completed"]));
    expect(note.event).toBe("workflow_completed");
    expect(note.content).toMatch(/\d+ ?ms/);
  }, 15000);

  it("goal loop: think → plan → verify → start → continue → completion check → save best flow", async () => {
    const goal = "Submit the login form";
    const analysis = await call("POST", "/api/ai/describe-screen", { imageData: chain.frame });
    expect(analysis.status).toBe(200);
    expect(analysis.data.report.screenDescription).toBe("Login screen");

    const plan = await call("POST", "/api/goal-workflows/propose", { goal, observation: observation() });
    expect(plan.status).toBe(200);
    chain.goalSteps = plan.data.proposal.steps;
    expect(chain.goalSteps[0]).toMatchObject({ action: "click", x: 125, y: 210, targetLabel: "Submit" });

    const verify = await runActionGate(
      { targetDevice: "desktop", target: gateTargetForAction("click", chain.goalSteps[0].x, chain.goalSteps[0].y, "Submit"), signal: new AbortController().signal },
      serverPost,
    );
    expect(verify.status).toBe("verified");

    const run = await call("POST", "/api/replay", {
      targetDevice: "desktop",
      steps: [{ id: chain.goalSteps[0].id, name: chain.goalSteps[0].name, action: "click", x: 1, y: 1, delayMs: 0 }],
      iterations: 1,
      confirmation: true,
    });
    expect(run.status).toBe(202);
    const done = await until(
      () => call("GET", `/api/replay/${run.data.run.id}`),
      (r) => ["completed", "failed", "cancelled"].includes(r.data.run?.status),
      30000,
    );
    expect(done.data.run.status).toBe("completed");

    const assess = await call("POST", "/api/goal-workflows/assess", { goal, observation: observation() });
    expect(assess.status).toBe(200);
    expect(assess.data.assessment).toMatchObject({ complete: true, onTrack: true });

    const saved = await call("POST", "/api/goal-workflows/flows", {
      name: `E2E flow ${Date.now()}`,
      goal,
      steps: chain.goalSteps,
      evidence: { steps: [{ stepId: chain.goalSteps[0].id, passed: true, checks: [] }], goalAssessment: assess.data.assessment },
    });
    expect(saved.status).toBe(200);
    expect(saved.data.flow).toBeDefined();
  }, 40000);

  it("overseer-supervised operation feeds the background presentation draft", async () => {
    const registered = await call("POST", "/api/overseer/operations", { id: chain.operationId, kind: "goal_run", source: "e2e", goal: "Submit the login form" });
    expect(registered.status).toBe(201);

    // The click changed the screen: the overseer's independent capture sees the new frame.
    spawnBoundary.state.screenVersion++;
    await call("POST", "/api/sync-real-frame", { imageData: spawnBoundary.png() });
    const step = await call("POST", `/api/overseer/operations/${chain.operationId}/steps`, {
      report: { stepId: "goal_step_1", name: "Click Submit", action: "click", x: 125, y: 210, beforeImage: chain.frame },
    });
    expect(step.status).toBe(200);
    expect(step.data.verdict.status).toBe("verified");

    const draft = await call("GET", `/api/presentations/${chain.operationId}`);
    expect(draft.status).toBe(200);
    expect(draft.data.presentation).toMatchObject({ draft: true, status: "running" });
    expect(draft.data.presentation.slides).toHaveLength(1);

    const finish = await call("POST", `/api/overseer/operations/${chain.operationId}/finish`, { status: "completed" });
    expect(finish.status).toBe(200);
    const current = await call("GET", "/api/presentations/current");
    expect(current.status).toBe(200);
    expect(current.data.presentation).toMatchObject({ runId: chain.operationId, draft: false, status: "completed", completed: 1 });
  });

  it("companion chat answers from its notes memory and keeps the conversation", async () => {
    const note = await call("POST", "/api/companion/notes", { category: "observation", title: NOTE_TITLE, content: "Invoices live in Documents/Invoices", tags: ["e2e"] });
    expect(note.status).toBe(201);
    const sessionId = `e2e_${Date.now()}`;
    const chat = await call("POST", "/api/companion/chat", { sessionId, message: "Where are my invoices?" });
    expect(chat.status).toBe(200);
    expect(chat.data.reply.content).toContain(NOTE_TITLE);
    const history = await call("GET", `/api/companion/chat/${sessionId}`);
    expect(history.data.turns.map((t: any) => t.role)).toEqual(["user", "assistant"]);
  });

  it("trigger fires on a fresh capture and takes a note", async () => {
    const created = await call("POST", "/api/companion/triggers", {
      name: `Login seen ${Date.now()}`,
      condition: { kind: "screen_state", pattern: "Login" },
      action: { kind: "take_note", message: "Login screen appeared" },
    });
    expect(created.status).toBe(201);
    const triggerId = created.data.trigger.id;
    const evaluated = await call("POST", "/api/companion/triggers/evaluate", { targetDevice: "desktop" });
    expect(evaluated.status).toBe(200);
    expect(evaluated.data.firings.some((f: any) => f.triggerId === triggerId || f.trigger?.id === triggerId)).toBe(true);
    await call("DELETE", `/api/companion/triggers/${triggerId}`);
  });

  it("error → auto-fix task → proposal → rejection is tracked in the follow-up ledger", async () => {
    const reported = await call("POST", "/api/companion/errors", { source: "replay", message: `Submit not found ${Date.now()}` });
    expect(reported.status).toBe(201);
    chain.taskId = reported.data.task.id;
    const proposed = await call("POST", `/api/companion/tasks/${chain.taskId}/propose-fix`);
    expect(proposed.status).toBe(201);
    chain.proposalId = proposed.data.proposal.id;
    expect(proposed.data.proposal.steps[0]).toMatchObject({ action: "click", x: 5, y: 5 });
    const decided = await call("POST", `/api/companion/proposals/${chain.proposalId}/decision`, { approved: false });
    expect(decided.status).toBe(200);

    const ledger = await call("GET", "/api/companion/ledger");
    const thread = ledger.data.threads.find((t: any) => t.proposal.proposalId === chain.proposalId);
    expect(thread).toBeDefined();
    expect(thread.decision).toBe("rejected");
    expect(thread.entries.map((e: any) => e.kind)).toEqual(["proposal", "decision"]);
  });

  it("every link of the chain reached the unified progress stream, and the cursor only returns newer events", async () => {
    const { data } = await call("GET", `/api/progress?since=${chain.cursor}`);
    const kinds = new Set(data.events.map((e: any) => e.kind));
    for (const kind of ["run", "goal", "note", "error", "presentation"]) expect(kinds).toContain(kind);
    expect(data.events.every((e: any) => e.seq > chain.cursor)).toBe(true);

    const posted = await call("POST", "/api/progress", { kind: "goal", title: "Chain finished" });
    expect(posted.status).toBe(201);
    const newer = await call("GET", `/api/progress?since=${data.cursor}`);
    expect(newer.data.events.map((e: any) => e.title)).toEqual(["Chain finished"]);
  });
});
