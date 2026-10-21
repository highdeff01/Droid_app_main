import type {
  CompanionErrorEvent,
  FixTask,
  WorkflowProposal,
  WorkflowStepDraft,
} from "@shared/companion";
import type { DurableStore } from "./durable-store";
import { CompanionCollection, createCompanionId, nowIso } from "./companion-store";
import type { NotesStore } from "./notes-store";
import type { WorkflowProposer } from "./workflow-proposer";

export type ErrorListener = (event: CompanionErrorEvent, task: FixTask) => void;

/** Saved workflow lookup so fixes and improvements can see the steps that failed. */
export type WorkflowLookup = (
  workflowId: string,
) => { name: string; steps: WorkflowStepDraft[] } | undefined;

/**
 * Captures failures from replay runs, gate verifications, trigger evaluations
 * and device commands; each one becomes a fix task with its context. AI fix
 * proposals are only proposals: approval returns the steps for the client to
 * run through the action gate, nothing is executed here.
 */
export class ErrorBus {
  readonly tasks: CompanionCollection<FixTask>;
  readonly proposals: CompanionCollection<WorkflowProposal>;
  private listeners: ErrorListener[] = [];

  constructor(
    store: DurableStore,
    private readonly notes: NotesStore,
    private readonly proposer: WorkflowProposer,
    private readonly lookupWorkflow: WorkflowLookup = () => undefined,
  ) {
    this.tasks = new CompanionCollection<FixTask>(store, "companionFixTasks");
    this.proposals = new CompanionCollection<WorkflowProposal>(store, "companionProposals");
  }

  onError(listener: ErrorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Records the failure as an error note plus an open fix task; returns the task. */
  report(event: CompanionErrorEvent): FixTask {
    const stepLabel = event.failedStep?.name || event.failedStep?.action;
    const title = `Fix ${event.source.replace("_", " ")} failure${stepLabel ? `: ${stepLabel}` : ""}`;
    const failedRun = event.source === "replay";
    const note = this.notes.recordEvent(
      failedRun ? "workflow_failed" : "error",
      failedRun ? `Workflow failed${stepLabel ? ` at ${stepLabel}` : ""}` : title,
      event.message,
      event.screenshot,
      failedRun ? [event.source, "error"] : [event.source],
    );
    const task = this.tasks.insert({
      id: createCompanionId("fixtask"),
      title,
      source: event.source,
      error: event.message,
      failedStep: event.failedStep,
      screenshot: event.screenshot,
      workflowId: event.workflowId,
      noteId: note.id,
      status: "open",
      createdAt: nowIso(),
    });
    for (const listener of this.listeners) listener(event, task);
    return task;
  }

  listTasks(): FixTask[] {
    return this.tasks.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listProposals(): WorkflowProposal[] {
    return this.proposals.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Asks the AI for a fix workflow for an open task and stores it as a proposal awaiting approval. */
  async proposeFix(taskId: string): Promise<WorkflowProposal> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("Fix task not found");
    const workflow = task.workflowId ? this.lookupWorkflow(task.workflowId) : undefined;
    const draft = await this.proposer({
      goal: `Fix the failure "${task.error}" so the task succeeds`,
      context: [
        `Source: ${task.source}`,
        task.failedStep ? `Failed step: ${JSON.stringify(task.failedStep)}` : "",
        workflow ? `Workflow: ${workflow.name}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      currentSteps: workflow?.steps,
      screenshot: task.screenshot,
    });
    const proposal = this.saveProposal("fix", draft.summary, draft.steps, task.workflowId, task.id);
    this.tasks.update(task.id, { status: "proposed", proposalId: proposal.id });
    return proposal;
  }

  /** Asks the AI to improve a saved workflow using the recent error notes about it. */
  async proposeImprovement(workflowId: string): Promise<WorkflowProposal> {
    const workflow = this.lookupWorkflow(workflowId);
    if (!workflow) throw new Error("Workflow not found");
    const failures = this.listTasks()
      .filter((task) => task.workflowId === workflowId)
      .slice(0, 5);
    const events = this.notes
      .list()
      .filter((note) => note.category === "event")
      .slice(0, 10);
    const draft = await this.proposer({
      goal: `Improve the workflow "${workflow.name}" so it stops failing`,
      context: [
        ...failures.map((task) => `Failure: ${task.error}${task.failedStep?.name ? ` at ${task.failedStep.name}` : ""}`),
        ...events.map((note) => `Event ${note.createdAt}: ${note.title} — ${note.content}`),
      ].join("\n") || "No recorded failures yet.",
      currentSteps: workflow.steps,
      screenshot: failures.find((task) => task.screenshot)?.screenshot,
    });
    return this.saveProposal("improvement", draft.summary, draft.steps, workflowId);
  }

  /** Marks a proposal approved or rejected; approval returns its steps for gated execution. */
  decideProposal(proposalId: string, approved: boolean): WorkflowProposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "proposed") throw new Error(`Proposal already ${proposal.status}`);
    const status = approved ? "approved" : "rejected";
    if (proposal.taskId)
      this.tasks.update(proposal.taskId, { status: approved ? "approved" : "open" });
    return this.proposals.update(proposalId, { status })!;
  }

  dismissTask(taskId: string): FixTask | undefined {
    return this.tasks.update(taskId, { status: "dismissed" });
  }

  private saveProposal(
    origin: WorkflowProposal["origin"],
    summary: string,
    steps: WorkflowStepDraft[],
    workflowId?: string,
    taskId?: string,
  ): WorkflowProposal {
    return this.proposals.insert({
      id: createCompanionId("proposal"),
      origin,
      taskId,
      workflowId,
      summary,
      steps,
      status: "proposed",
      createdAt: nowIso(),
    });
  }
}
