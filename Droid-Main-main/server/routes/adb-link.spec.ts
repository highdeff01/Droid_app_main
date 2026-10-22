import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";

type Behaviour =
  | { kind: "error" }
  | { kind: "close"; stdout?: string; stderr?: string; code: number }
  | { kind: "hang" }
  | { kind: "throw" };
let behaviour: Behaviour;

function fakeChild() {
  if (behaviour.kind === "throw") throw new Error("spawn exploded");
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  const b = behaviour;
  setTimeout(() => {
    if (b.kind === "error") {
      child.emit("error", new Error("spawn adb ENOENT"));
      child.emit("close", -2);
    } else if (b.kind === "close") {
      if (b.stdout) child.stdout.emit("data", Buffer.from(b.stdout));
      if (b.stderr) child.stderr.emit("data", Buffer.from(b.stderr));
      child.emit("close", b.code);
    }
  }, 0);
  return child;
}

vi.mock("child_process", () => ({ spawn: vi.fn(() => fakeChild()) }));

import { ADB_CONNECT_TIMEOUT_MS, ADB_DISCONNECT_TIMEOUT_MS, createAdbDisconnectHandler, handleAdbConnect } from "./adb-link";

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

async function run(handler: any, body: Record<string, unknown>) {
  const res = makeRes();
  handler({ body } as any, res, () => {});
  await vi.waitFor(() => expect(res.body).toBeDefined());
  await new Promise((r) => setTimeout(r, 5));
  return res;
}

async function runTimedOut(handler: any, body: Record<string, unknown>, ms: number) {
  vi.useFakeTimers();
  behaviour = { kind: "hang" };
  const res = makeRes();
  handler({ body } as any, res, () => {});
  await vi.advanceTimersByTimeAsync(ms + 1);
  return res;
}

function expectNoClaimedLink(res: any) {
  expect(res.body.success).toBe(false);
  expect(JSON.stringify(res.body)).not.toMatch(/Virtual link|Virtual device/);
  expect(res.calls).toBe(1);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/adb/connect", () => {
  const body = { ip: "10.0.0.7", port: 5555 };

  it("succeeds only when adb confirms the link", async () => {
    behaviour = { kind: "close", code: 0, stdout: "connected to 10.0.0.7:5555\n" };
    const res = await run(handleAdbConnect, body);
    expect(res.body).toMatchObject({ success: true, simulated: false, target: "10.0.0.7:5555", hasLocalAdb: true });
  });

  it("fails when adb reports it could not connect, even with empty stderr", async () => {
    behaviour = { kind: "close", code: 0, stdout: "failed to connect to '10.0.0.7:5555': Connection refused\n" };
    const res = await run(handleAdbConnect, body);
    expect(res.body).toMatchObject({ status: "failed", target: "10.0.0.7:5555" });
    expectNoClaimedLink(res);
  });

  it("is unavailable, not a virtual link, when no adb binary exists", async () => {
    behaviour = { kind: "error" };
    const res = await run(handleAdbConnect, body);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ status: "unavailable", simulated: true, executed: false, hasLocalAdb: false });
    expect(res.body.error).toContain("ENOENT");
    expectNoClaimedLink(res);
  });

  it("is unavailable when spawn throws", async () => {
    behaviour = { kind: "throw" };
    const res = await run(handleAdbConnect, body);
    expect(res.body.status).toBe("unavailable");
    expectNoClaimedLink(res);
  });

  it("fails when adb hangs", async () => {
    const res = await runTimedOut(handleAdbConnect, body, ADB_CONNECT_TIMEOUT_MS);
    expect(res.body.status).toBe("failed");
    expectNoClaimedLink(res);
  });

  it("rejects an invalid endpoint", async () => {
    behaviour = { kind: "error" };
    const res = await run(handleAdbConnect, { ip: "not-an-ip" });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/adb/disconnect", () => {
  it("reports a real disconnect and forgets the simulated target", async () => {
    behaviour = { kind: "close", code: 0, stdout: "disconnected 10.0.0.7:5555\n" };
    const simulated = new Set(["10.0.0.7:5555", "10.0.0.8:5555"]);
    const res = await run(createAdbDisconnectHandler(simulated), { deviceId: "10.0.0.7:5555" });
    expect(res.body).toMatchObject({ success: true, simulated: false, output: "disconnected 10.0.0.7:5555" });
    expect([...simulated]).toEqual(["10.0.0.8:5555"]);
  });

  it("is unavailable, not a claimed disconnect, when no adb binary exists", async () => {
    behaviour = { kind: "error" };
    const simulated = new Set(["10.0.0.7:5555"]);
    const res = await run(createAdbDisconnectHandler(simulated), {});
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ success: false, status: "unavailable", simulated: true });
    expect(simulated.size).toBe(0);
    expect(res.calls).toBe(1);
  });

  it("is unavailable when spawn throws", async () => {
    behaviour = { kind: "throw" };
    const res = await run(createAdbDisconnectHandler(new Set()), {});
    expect(res.body).toMatchObject({ success: false, status: "unavailable" });
  });

  it("fails when adb exits non-zero or hangs", async () => {
    behaviour = { kind: "close", code: 1, stderr: "no such device" };
    const failed = await run(createAdbDisconnectHandler(new Set()), { deviceId: "R3CN90" });
    expect(failed.body).toMatchObject({ success: false, status: "failed", error: "no such device" });
    const hung = await runTimedOut(createAdbDisconnectHandler(new Set()), {}, ADB_DISCONNECT_TIMEOUT_MS);
    expect(hung.body).toMatchObject({ success: false, status: "failed" });
  });
});
