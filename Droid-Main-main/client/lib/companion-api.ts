import type {
  CompanionChatRequest,
  CompanionChatResponse,
  CompanionChatTurn,
  CompanionErrorEvent,
  CompanionNote,
  FixTask,
  PendingCompanionAction,
  WorkflowProposal,
  WorkflowStepDraft,
} from "@shared/companion";
import type { FollowUpThread, LedgerEntry, LedgerOutcome } from "@shared/feedback";
import type { PresentationDraft } from "@shared/presentation";

export interface CompanionWorkflow {
  id?: string;
  name: string;
  steps: WorkflowStepDraft[];
}

/** Calls an /api/companion endpoint and returns its JSON, throwing the server's error message. */
async function companionRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/companion${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Companion request failed (${response.status})`);
  }
  return data as T;
}

export const companionApi = {
  chatHistory: (sessionId: string) =>
    companionRequest<{ turns: CompanionChatTurn[] }>(`/chat/${encodeURIComponent(sessionId)}`).then((d) => d.turns),
  sendChat: (request: CompanionChatRequest) =>
    companionRequest<CompanionChatResponse>("/chat", "POST", request),
  notes: (withScreenshots = false) =>
    companionRequest<{ notes: CompanionNote[] }>(`/notes${withScreenshots ? "?screenshots=true" : ""}`).then((d) => d.notes),
  /** Saves a goal_reached important-event note with the screenshot at that moment. */
  recordGoalReached: (title: string, screenshot?: string) =>
    companionRequest<{ note: CompanionNote }>("/notes", "POST", {
      category: "goal_state",
      event: "goal_reached",
      title: `Goal reached: ${title}`,
      tags: ["goal_reached", "goal"],
      screenshot,
    }).then((d) => d.note),
  reportError: (event: CompanionErrorEvent) =>
    companionRequest<{ task: FixTask }>("/errors", "POST", event).then((d) => d.task),
  tasks: () => companionRequest<{ tasks: FixTask[] }>("/tasks").then((d) => d.tasks),
  proposeFix: (taskId: string) =>
    companionRequest<{ proposal: WorkflowProposal }>(`/tasks/${taskId}/propose-fix`, "POST", {}).then((d) => d.proposal),
  dismissTask: (taskId: string) =>
    companionRequest<{ task: FixTask }>(`/tasks/${taskId}/dismiss`, "POST", {}).then((d) => d.task),
  proposals: () => companionRequest<{ proposals: WorkflowProposal[] }>("/proposals").then((d) => d.proposals),
  proposeImprovement: (workflowId: string) =>
    companionRequest<{ proposal: WorkflowProposal }>(`/workflows/${encodeURIComponent(workflowId)}/propose-improvement`, "POST", {}).then((d) => d.proposal),
  decideProposal: (proposalId: string, approved: boolean) =>
    companionRequest<{ proposal: WorkflowProposal }>(`/proposals/${proposalId}/decision`, "POST", { approved }).then((d) => d.proposal),
  workflow: (workflowId: string) =>
    companionRequest<{ workflow: CompanionWorkflow }>(`/workflows/${encodeURIComponent(workflowId)}`).then((d) => d.workflow),
  pendingActions: () =>
    companionRequest<{ actions: PendingCompanionAction[] }>("/pending-actions").then((d) => d.actions),
  decidePendingAction: (actionId: string, approved: boolean) =>
    companionRequest<{ action: PendingCompanionAction; workflow?: CompanionWorkflow }>(`/pending-actions/${actionId}/decision`, "POST", { approved }),
  markDispatched: (actionId: string) =>
    companionRequest<{ action: PendingCompanionAction }>(`/pending-actions/${actionId}/dispatched`, "POST", {}).then((d) => d.action),
  /** Follow-up threads: what was suggested, what the user chose, what happened. */
  ledger: (topic?: string) =>
    companionRequest<{ threads: FollowUpThread[] }>(`/ledger${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`).then((d) => d.threads),
  recordOutcome: (proposalId: string, outcome: LedgerOutcome, detail: string) =>
    companionRequest<{ entry: LedgerEntry }>(`/ledger/${proposalId}/outcome`, "POST", { outcome, detail }).then((d) => d.entry),
};

/** The background draft (or finished) presentation of the latest operation; null when none has run. */
export async function fetchCurrentPresentation(): Promise<PresentationDraft | null> {
  const response = await fetch("/api/presentations/current");
  if (response.status === 404) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(data?.error || `Presentation request failed (${response.status})`);
  return data.presentation as PresentationDraft;
}
