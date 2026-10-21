import type {
  CompanionChatRequest,
  CompanionChatResponse,
  CompanionErrorEvent,
  TriggerObservation,
  WorkflowStepDraft,
} from "@shared/companion";
import { sendQwenChatRequest } from "./ai-endpoint";
import { ChatMemory, MEMORY_LIMITS, composeChatMessages, parseCompanionReply } from "./chat-memory";
import { companionEvents } from "./companion-events";
import { DurableStore, type StorageOptions } from "./durable-store";
import { ErrorBus, type WorkflowLookup } from "./error-bus";
import { NotesStore } from "./notes-store";
import { observeScreen, type ObservationTarget } from "./screen-observer";
import { TriggerEngine } from "./trigger-engine";
import { qwenWorkflowProposer, type WorkflowProposer } from "./workflow-proposer";

export type ChatSender = typeof sendQwenChatRequest;

export interface CompanionDeps {
  storage?: StorageOptions;
  proposer?: WorkflowProposer;
  lookupWorkflow?: WorkflowLookup;
  listWorkflows?: () => Array<{ id: string; name: string }>;
  chat?: ChatSender;
}

/** Owns the companion stores and connects them to the error/event channel. */
export class CompanionService {
  readonly notes: NotesStore;
  readonly errors: ErrorBus;
  readonly triggers: TriggerEngine;
  readonly chatMemory: ChatMemory;
  private readonly listWorkflows: () => Array<{ id: string; name: string }>;
  private readonly chat: ChatSender;

  constructor(deps: CompanionDeps = {}) {
    const store = new DurableStore(deps.storage);
    this.notes = new NotesStore(store);
    this.errors = new ErrorBus(
      store,
      this.notes,
      deps.proposer ?? qwenWorkflowProposer,
      deps.lookupWorkflow,
    );
    this.triggers = new TriggerEngine(store, this.notes, this.errors);
    this.chatMemory = new ChatMemory(store);
    this.listWorkflows = deps.listWorkflows ?? (() => []);
    this.chat = deps.chat ?? sendQwenChatRequest;
    this.errors.onError((event) => this.evaluateErrorTriggers(event));
  }

  /** Subscribes to the process-wide channel the replay engine and device paths publish on. */
  connect() {
    companionEvents.onError((event) => this.errors.report(event));
    companionEvents.onEvent((event) =>
      this.notes.recordEvent(event.kind, event.title, event.detail, event.screenshot),
    );
  }

  reportError(event: CompanionErrorEvent) {
    return this.errors.report(event);
  }

  /** Captures and analyses a fresh frame, then evaluates every trigger against it. */
  async evaluateTriggers(target: ObservationTarget, provided?: Partial<TriggerObservation>) {
    const kinds = new Set(this.triggers.list().filter((t) => t.enabled).map((t) => t.condition.kind));
    const observation: TriggerObservation = provided?.frame
      ? { at: Date.now(), ...provided }
      : await observeScreen(target, {
          vision: ["screen_state", "element_appears", "element_disappears"].some((k) => kinds.has(k as never)),
          ocr: kinds.has("ocr_text"),
        });
    return { observation, firings: this.triggers.evaluate(observation) };
  }

  /** Friend-like chat: composes memory (notes, event screenshots, workflows, history) and asks the model. */
  async converse(request: CompanionChatRequest): Promise<CompanionChatResponse> {
    const screenshots = this.relevantScreenshots(request.message);
    const messages = composeChatMessages({
      request,
      history: this.chatMemory.history(request.sessionId),
      notes: this.notes.list().slice(0, MEMORY_LIMITS.notes),
      screenshots,
      savedWorkflows: this.listWorkflows(),
    });
    const response = await this.chat(messages);
    if (!response.success) return { success: false, error: response.error || "AI model unavailable" };
    this.chatMemory.append(request.sessionId, "user", request.message);
    const { reply, actions } = parseCompanionReply(response.content);
    const turn = this.chatMemory.append(
      request.sessionId,
      "assistant",
      reply,
      screenshots.map((n) => n.id),
    );
    return { success: true, reply: turn, actions, screenshots };
  }

  /** Screenshots the message asks about, else the most recent important events. */
  private relevantScreenshots(message: string) {
    const matches = this.notes.searchScreenshots(message, MEMORY_LIMITS.screenshots);
    return matches.length
      ? matches
      : this.notes.list({ withScreenshot: true }).slice(0, MEMORY_LIMITS.screenshots);
  }

  private evaluateErrorTriggers(event: CompanionErrorEvent) {
    if (event.source === "trigger") return;
    this.triggers.evaluate({ at: Date.now(), frame: event.screenshot, errors: [event.message] }, [
      "error_observed",
    ]);
  }
}

export function workflowStepsFromActions(
  actions: Array<{
    id?: string;
    type?: string;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    description?: string;
  }>,
): WorkflowStepDraft[] {
  const ACTION_MAP: Record<string, string> = {
    tap: "click",
    double_tap: "double_click",
    type: "type_text",
    type_text: "type_text",
    scroll: "scroll",
    key: "press_key",
  };
  return actions.map((action, index) => ({
    id: action.id || `step_${index + 1}`,
    name: action.description || `${action.type} ${index + 1}`,
    action: ACTION_MAP[action.type ?? ""] ?? "click",
    x: action.x ?? 0,
    y: action.y ?? 0,
    text: action.text,
    keyPayload: action.key,
  }));
}
