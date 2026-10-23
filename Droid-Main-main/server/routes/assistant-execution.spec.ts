import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assistantExecutionRouter } from "./assistant-execution";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/assistant/execution", assistantExecutionRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant/execution`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};

describe("assistant execution approval routes", () => {
  it("requires explicit confirmation to approve or select an alternate", async () => {
    expect((await post("/missing/approve", {})).status).toBe(400);
    expect((await post("/missing/approve-alternate", { confirmation: false })).status).toBe(400);
  });

  it("reject answers 404 for an unknown execution", async () => {
    const res = await post("/missing/reject", { reason: "no" });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  it("lists executions", async () => {
    const res = await fetch(base);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.executions)).toBe(true);
  });
});
