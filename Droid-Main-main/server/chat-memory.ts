import type {
  ChatUiAction,
  CompanionChatRequest,
  CompanionChatTurn,
  CompanionNote,
} from "@shared/companion";
import { parseModelJson, toBase64Image, type QwenChatMessage } from "./ai-endpoint";
import type { DurableStore } from "./durable-store";
import { CompanionCollection, createCompanionId, nowIso } from "./companion-store";

export const MEMORY_LIMITS = {
  history: 20,
  notes: 15,
  screenshots: 3,
  workflows: 10,
};

export const COMPANION_SYSTEM_PROMPT = `You are Sightline, the user's friendly long-term companion for their screen automation app.
Talk naturally like a friend who remembers: refer to past notes, events, workflows and earlier conversation when relevant. Never invent results, confidences or events that are not in the memory below.
You may propose UI actions; the app only performs them, and anything that touches the device still needs the user's approval and the action gate.
Reply ONLY with JSON: {"reply": "your message", "actions": [{"kind": "navigate_tab", "tab": "<tab id>"} | {"kind": "show_screenshot", "noteId": "<note id>"} | {"kind": "attach_workflow", "workflowId": "<id>"} | {"kind": "propose_improvement", "workflowId": "<id>"}]}`;

/** Server-side conversation history, persisted per assistant session. */
export class ChatMemory {
  private readonly turns: CompanionCollection<CompanionChatTurn>;

  constructor(store: DurableStore) {
    this.turns = new CompanionCollection<CompanionChatTurn>(store, "companionChat", 5000);
  }

  history(sessionId: string, limit = MEMORY_LIMITS.history): CompanionChatTurn[] {
    return this.turns
      .all()
      .filter((turn) => turn.sessionId === sessionId)
      .slice(-limit);
  }

  append(
    sessionId: string,
    role: CompanionChatTurn["role"],
    content: string,
    noteIds?: string[],
  ): CompanionChatTurn {
    return this.turns.insert({
      id: createCompanionId("turn"),
      sessionId,
      role,
      content,
      noteIds: noteIds?.length ? noteIds : undefined,
      createdAt: nowIso(),
    });
  }
}

export interface MemoryInputs {
  request: CompanionChatRequest;
  history: CompanionChatTurn[];
  notes: CompanionNote[];
  /** Important-event screenshots, attached as vision images. */
  screenshots: CompanionNote[];
  savedWorkflows: Array<{ id: string; name: string }>;
}

const line = (note: CompanionNote) =>
  `- [${note.createdAt}] (${note.event ?? note.category}${note.tags.length ? `; ${note.tags.join(", ")}` : ""}) ${note.title}${note.content ? `: ${note.content}` : ""}${note.screenshot ? ` [screenshot noteId=${note.id}]` : ""}`;

function memorySection(inputs: MemoryInputs): string {
  const { request, notes, screenshots, savedWorkflows } = inputs;
  const history = (request.workflowHistory ?? []).slice(0, MEMORY_LIMITS.workflows);
  return [
    `CURRENT TAB: ${request.currentTab || "unknown"}`,
    `CURRENT SCREEN: ${request.screenSummary || (request.screenshot ? "see the last attached image" : "no capture available")}`,
    `RECENT NOTES (newest first):\n${notes.map(line).join("\n") || "- none yet"}`,
    `IMPORTANT-EVENT SCREENSHOTS ATTACHED (in order):\n${screenshots.map(line).join("\n") || "- none"}`,
    `RECENT WORKFLOW RUNS:\n${history.map((w) => `- ${w.at ?? ""} ${w.name}: ${w.status}${w.error ? ` (${w.error})` : ""}`).join("\n") || "- none recorded"}`,
    `SAVED WORKFLOWS:\n${savedWorkflows.slice(0, 20).map((w) => `- ${w.id}: ${w.name}`).join("\n") || "- none"}`,
  ].join("\n\n");
}

/** Builds the model conversation: system prompt + memory, past turns, then the new message with images. */
export function composeChatMessages(inputs: MemoryInputs): QwenChatMessage[] {
  const images = [
    ...inputs.screenshots.slice(0, MEMORY_LIMITS.screenshots),
    ...(inputs.request.screenshot ? [{ screenshot: inputs.request.screenshot }] : []),
  ]
    .map((item) => item.screenshot)
    .filter((image): image is string => !!image)
    .map(toBase64Image);
  return [
    { role: "system", content: `${COMPANION_SYSTEM_PROMPT}\n\nMEMORY\n${memorySection(inputs)}` },
    ...inputs.history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: inputs.request.message, ...(images.length ? { images } : {}) },
  ];
}

const UI_ACTION_KINDS = new Set<ChatUiAction["kind"]>([
  "navigate_tab",
  "show_screenshot",
  "attach_workflow",
  "propose_improvement",
]);

/** Reads the model reply; unparseable output is the reply itself with no actions. */
export function parseCompanionReply(content: string): { reply: string; actions: ChatUiAction[] } {
  try {
    const parsed = parseModelJson<{ reply?: unknown; actions?: unknown }>(content);
    const actions = Array.isArray(parsed.actions)
      ? (parsed.actions as ChatUiAction[]).filter((a) => a && UI_ACTION_KINDS.has(a.kind))
      : [];
    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    return { reply: reply || content.trim(), actions };
  } catch {
    return { reply: content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(), actions: [] };
  }
}
