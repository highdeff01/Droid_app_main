import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  child.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
  child.kill = vi.fn();
  const b = behaviour;
  setTimeout(() => {
    if (b.kind === "error") {
      child.emit("error", new Error("spawn python3 ENOENT"));
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

import { COMPARE_TIMEOUT_MS, handleCompareScreenshots } from "./compare-screenshots";

const IMAGES = { referenceImage: "data:image/png;base64,AAAA", liveImage: "data:image/png;base64,BBBB" };

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

async function run(body: unknown = IMAGES) {
  const res = makeRes();
  handleCompareScreenshots({ body } as any, res, () => {});
  await vi.waitFor(() => expect(res.body).toBeDefined());
  await new Promise((r) => setTimeout(r, 5));
  return res;
}

function expectNoInventedSimilarity(res: any) {
  expect(res.body.success).toBe(false);
  expect(res.body.similarity).toBeNull();
  expect(res.body).not.toHaveProperty("matched");
  expect(res.calls).toBe(1);
}

describe("POST /api/compare-screenshots", () => {
  beforeEach(() => {
    behaviour = { kind: "close", code: 0, stdout: "" };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the similarity PIL computed", async () => {
    behaviour = { kind: "close", code: 0, stdout: JSON.stringify({ success: true, similarity: 0.4321, mse: 12.5 }) };
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, similarity: 0.4321, mse: 12.5 });
  });

  it("rejects a request missing an image", async () => {
    const res = await run({ referenceImage: "x" });
    expect(res.statusCode).toBe(400);
    expectNoInventedSimilarity(res);
  });

  it("is unavailable, not a match, when python cannot be spawned", async () => {
    behaviour = { kind: "error" };
    const res = await run();
    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe("unavailable");
    expectNoInventedSimilarity(res);
  });

  it("fails when the script produces no output", async () => {
    behaviour = { kind: "close", code: 1, stderr: "Traceback: boom" };
    const res = await run();
    expect(res.statusCode).toBe(500);
    expect(res.body.status).toBe("failed");
    expect(res.body.error).toContain("Traceback: boom");
    expectNoInventedSimilarity(res);
  });

  it("fails when the script reports a PIL exception", async () => {
    behaviour = {
      kind: "close",
      code: 0,
      stdout: JSON.stringify({ success: false, similarity: null, error: "No module named 'PIL'" }),
    };
    const res = await run();
    expect(res.body.error).toContain("No module named 'PIL'");
    expectNoInventedSimilarity(res);
  });

  it("fails when the output is not JSON or carries no numeric similarity", async () => {
    behaviour = { kind: "close", code: 0, stdout: "garbage" };
    expectNoInventedSimilarity(await run());
    behaviour = { kind: "close", code: 0, stdout: JSON.stringify({ success: true }) };
    expectNoInventedSimilarity(await run());
  });

  it("is unavailable with timeout flagged when the comparison hangs", async () => {
    vi.useFakeTimers();
    behaviour = { kind: "hang" };
    const res = makeRes();
    handleCompareScreenshots({ body: IMAGES } as any, res, () => {});
    await vi.advanceTimersByTimeAsync(COMPARE_TIMEOUT_MS + 1);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ status: "unavailable", timeout: true });
    expectNoInventedSimilarity(res);
  });

  it("fails in the outer catch without claiming visual alignment", async () => {
    behaviour = { kind: "throw" };
    const res = await run();
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain("spawn exploded");
    expect(JSON.stringify(res.body)).not.toMatch(/alignment verified/i);
    expectNoInventedSimilarity(res);
  });
});
