import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { FileCreator, type CodeFileQueue } from "./files";
import type { WorkflowProposal } from "../../shared/companion";

describe("fileCreator", () => {
  let filesDir: string;
  let appRoot: string;
  let queue: CodeFileQueue;
  let proposeCodeFile: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;
  let creator: FileCreator;

  beforeEach(async () => {
    filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "assist-files-"));
    appRoot = await fs.mkdtemp(path.join(os.tmpdir(), "assist-app-"));
    proposeCodeFile = vi.fn((summary: string, file: { path: string; content: string }) => ({
      id: "proposal-1",
      origin: "code_file",
      summary,
      steps: [],
      file,
      status: "proposed",
      createdAt: new Date().toISOString(),
    } satisfies WorkflowProposal));
    queue = { proposeCodeFile };
    log = vi.fn();
    creator = new FileCreator({ filesDir, appRoot, queue, log });
  });

  afterEach(async () => {
    await fs.rm(filesDir, { recursive: true, force: true });
    await fs.rm(appRoot, { recursive: true, force: true });
  });

  it("writes a workflow as JSON under filesDir/workflows with a slugified name and status 'written'", async () => {
    const result = await creator.create({ kind: "workflow", workflow: { name: "Sign Up Flow!", steps: [{ op: "wait", ms: 0 }] } });
    expect(result.status).toBe("written");
    expect(result.path).toBe(path.join(filesDir, "workflows", "sign-up-flow.json"));
    const body = JSON.parse(await fs.readFile(result.path, "utf8"));
    expect(body).toMatchObject({ kind: "workflow", name: "Sign Up Flow!" });
  });

  it("writes a fix_script as JSON under filesDir/fix-scripts with a slugified name and status 'written'", async () => {
    const result = await creator.create({ kind: "fix_script", name: "Retry Login", script: { steps: [{ op: "wait", ms: 0 }] } });
    expect(result.status).toBe("written");
    expect(result.path).toBe(path.join(filesDir, "fix-scripts", "retry-login.json"));
    const body = JSON.parse(await fs.readFile(result.path, "utf8"));
    expect(body).toMatchObject({ kind: "fix_script", name: "Retry Login" });
  });

  it("does not write a code file to disk; queues it via queue.proposeCodeFile with status 'proposed' and a proposalId", async () => {
    const result = await creator.create({ kind: "code", path: "client/x.ts", content: "export {}", summary: "add x" });
    expect(proposeCodeFile).toHaveBeenCalledWith("add x", { path: "client/x.ts", content: "export {}" });
    expect(result).toMatchObject({ kind: "code", status: "proposed", proposalId: "proposal-1" });
    await expect(fs.access(path.join(appRoot, "client/x.ts"))).rejects.toThrow();
  });

  it("refuses a code path escaping the app root with '..'", async () => {
    await expect(creator.create({ kind: "code", path: "../escape.ts", content: "x", summary: "s" })).rejects.toThrow(/escapes the app root/);
  });

  it("refuses an absolute code path", async () => {
    await expect(creator.create({ kind: "code", path: "/etc/passwd", content: "x", summary: "s" })).rejects.toThrow(/relative to the app root/);
  });

  it.each(["node_modules/pkg/index.js", ".git/config", ".env"])("refuses a code path under a protected location (%s)", async (relative) => {
    await expect(creator.create({ kind: "code", path: relative, content: "x", summary: "s" })).rejects.toThrow(/protected location/);
  });

  it("applyDecision writes the file only for origin 'code_file' and status 'approved'", async () => {
    const proposal: WorkflowProposal = {
      id: "p1",
      origin: "code_file",
      summary: "add x",
      steps: [],
      file: { path: "client/x.ts", content: "export const x = 1;" },
      status: "approved",
      createdAt: new Date().toISOString(),
    };
    await creator.applyDecision(proposal);
    const written = await fs.readFile(path.join(appRoot, "client/x.ts"), "utf8");
    expect(written).toBe("export const x = 1;");
  });

  it("applyDecision does nothing for status 'rejected'", async () => {
    const proposal: WorkflowProposal = {
      id: "p2",
      origin: "code_file",
      summary: "add y",
      steps: [],
      file: { path: "client/y.ts", content: "export const y = 1;" },
      status: "rejected",
      createdAt: new Date().toISOString(),
    };
    await creator.applyDecision(proposal);
    await expect(fs.access(path.join(appRoot, "client/y.ts"))).rejects.toThrow();
  });
});
