/**
 * Types shared by the server-side AI companion layer (triggers, error bus,
 * notes, fix tasks, proposals, chat memory) and the client panels that use it.
 */

export type TriggerConditionKind =
  | "screen_state"
  | "element_appears"
  | "element_disappears"
  | "ocr_text"
  | "error_observed"
  | "time_interval";

export interface TriggerCondition {
  kind: TriggerConditionKind;
  /** Text matched (case-insensitive) against the screen description, element names/text, OCR text or error message. */
  pattern?: string;
  /** time_interval only: milliseconds between firings (minimum 5000). */
  intervalMs?: number;
}

export type TriggerActionKind =
  | "run_workflow"
  | "take_note"
  | "capture_screenshot"
  | "notify_user"
  | "ask_approval";

export interface TriggerAction {
  kind: TriggerActionKind;
  /** run_workflow / ask_approval: the saved workflow to run. */
  workflowId?: string;
  /** take_note / notify_user / ask_approval: the message. */
  message?: string;
}

export interface CompanionTrigger {
  id: string;
  name: string;
  enabled: boolean;
  condition: TriggerCondition;
  action: TriggerAction;
  /** Whether the condition held on the previous evaluation (edge detection). */
  lastMatched: boolean;
  lastFiredAt?: string;
  createdAt: string;
}

/** What a trigger is evaluated against: a fresh capture and its real analysis. */
export interface TriggerObservation {
  at: number;
  frame?: string;
  screenDescription?: string;
  elements?: Array<{ name: string; textValue?: string }>;
  ocrText?: string;
  errors?: string[];
}

export type NoteCategory =
  | "user_request"
  | "observation"
  | "decision"
  | "goal_state"
  | "event";

export type ImportantEventKind =
  | "workflow_completed"
  | "workflow_failed"
  | "goal_reached"
  | "error"
  | "trigger_fired";

export interface CompanionNote {
  id: string;
  category: NoteCategory;
  title: string;
  content: string;
  tags: string[];
  event?: ImportantEventKind;
  /** data:image/...;base64 screenshot captured at the event. */
  screenshot?: string;
  createdAt: string;
}

export type ErrorSource = "replay" | "action_gate" | "trigger" | "device_command";

export interface CompanionErrorEvent {
  source: ErrorSource;
  message: string;
  failedStep?: { id?: string; name?: string; action?: string; x?: number; y?: number };
  screenshot?: string;
  workflowId?: string;
}

export interface WorkflowStepDraft {
  id: string;
  name: string;
  action: string;
  x: number;
  y: number;
  text?: string;
  keyPayload?: string;
  delayMs?: number;
}

export type ProposalStatus = "proposed" | "approved" | "rejected";

export interface WorkflowProposal {
  id: string;
  origin: "fix" | "improvement";
  taskId?: string;
  workflowId?: string;
  summary: string;
  steps: WorkflowStepDraft[];
  status: ProposalStatus;
  createdAt: string;
}

export type FixTaskStatus = "open" | "proposed" | "approved" | "dismissed";

export interface FixTask {
  id: string;
  title: string;
  source: ErrorSource;
  error: string;
  failedStep?: CompanionErrorEvent["failedStep"];
  screenshot?: string;
  workflowId?: string;
  noteId?: string;
  proposalId?: string;
  status: FixTaskStatus;
  createdAt: string;
}

export type PendingActionStatus = "pending" | "approved" | "rejected" | "dispatched";

/** A device-touching action the client must run through the action gate. */
export interface PendingCompanionAction {
  id: string;
  kind: "run_workflow";
  requiresApproval: boolean;
  workflowId?: string;
  triggerId?: string;
  reason: string;
  status: PendingActionStatus;
  createdAt: string;
}

export interface CompanionChatTurn {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  noteIds?: string[];
  createdAt: string;
}

export type ChatUiActionKind =
  | "navigate_tab"
  | "show_screenshot"
  | "attach_workflow"
  | "propose_improvement";

export interface ChatUiAction {
  kind: ChatUiActionKind;
  tab?: string;
  noteId?: string;
  workflowId?: string;
}

export interface CompanionChatRequest {
  sessionId: string;
  message: string;
  currentTab?: string;
  screenSummary?: string;
  screenshot?: string;
  workflowHistory?: Array<{ name: string; status: string; at?: string; error?: string }>;
}

export interface CompanionChatResponse {
  success: boolean;
  reply?: CompanionChatTurn;
  actions?: ChatUiAction[];
  screenshots?: CompanionNote[];
  error?: string;
}
