import { promises as fs } from "fs";
import path from "path";
import type { CreateFilePayload, CreatedFile } from "../../shared/assist-bridge";
import type { WorkflowProposal } from "../../shared/companion";

type CodeFilePayload = { path: string; content: string; summary: string };

export interface CodeFileQueue {
  proposeCodeFile(summary: string, file: { path: string; content: string }): WorkflowProposal;
}

export interface FileCreatorDeps {
  /** Where workflow definitions and fix scripts are written directly. */
  filesDir: string;
  /** Root of the main app; approved code files must stay inside it. */
  appRoot: string;
  queue: CodeFileQueue;
  log: (level: "INFO" | "WARN" | "ERROR", message: string) => void;
}

/** File name from a user label: lowercase, [a-z0-9-], bounded. */
export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "untitled";
}

/** Resolves a code path inside the app root; refuses escapes, absolute paths and protected locations. */
export function resolveCodePath(appRoot: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error("Code file path must be relative to the app root");
  const root = path.resolve(appRoot);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error("Code file path escapes the app root");
  const parts = path.relative(root, target).split(path.sep);
  if (parts.some((p) => p === "node_modules" || p === ".git" || p.startsWith(".env"))) {
    throw new Error("Code file path targets a protected location");
  }
  return target;
}

/** Workflow definitions and fix scripts are written directly; code files go through the approval queue. */
export class FileCreator {
  constructor(private readonly deps: FileCreatorDeps) {}

  async create(payload: CreateFilePayload): Promise<CreatedFile> {
    if (payload.kind === "code") return this.proposeCode(payload as CodeFilePayload);
    const name = payload.kind === "workflow" ? payload.workflow.name : payload.name;
    const body = payload.kind === "workflow" ? payload.workflow : { name: payload.name, steps: payload.script.steps };
    const dir = path.join(this.deps.filesDir, payload.kind === "workflow" ? "workflows" : "fix-scripts");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${slugify(name)}.json`);
    await fs.writeFile(file, `${JSON.stringify({ kind: payload.kind, createdAt: new Date().toISOString(), ...body }, null, 2)}\n`, "utf8");
    this.deps.log("INFO", `Assist bridge wrote ${payload.kind} ${file}`);
    return { kind: payload.kind, status: "written", path: file };
  }

  private proposeCode(payload: CodeFilePayload): CreatedFile {
    resolveCodePath(this.deps.appRoot, payload.path);
    const proposal = this.deps.queue.proposeCodeFile(payload.summary, { path: payload.path, content: payload.content });
    this.deps.log("INFO", `Assist bridge queued code file ${payload.path} for approval (${proposal.id})`);
    return { kind: "code", status: "proposed", proposalId: proposal.id, path: payload.path };
  }

  /** Approval-queue decision hook: writes an approved code file; anything else is ignored. */
  async applyDecision(proposal: WorkflowProposal): Promise<void> {
    if (proposal.origin !== "code_file" || proposal.status !== "approved" || !proposal.file) return;
    try {
      const target = resolveCodePath(this.deps.appRoot, proposal.file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, proposal.file.content, "utf8");
      this.deps.log("INFO", `Approved code file written: ${target}`);
    } catch (err) {
      this.deps.log("ERROR", `Approved code file not written: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
