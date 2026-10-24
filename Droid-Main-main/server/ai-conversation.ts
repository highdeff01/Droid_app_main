/**
 * Per-session conversation history for the Qwen chat endpoint, mirroring the
 * user's reference client: a `messages` array of {role, content} pairs that is
 * sent in full on every turn so Plan, Auto Act and AI Help keep context.
 *
 * Screenshots ride only on the current turn; stored turns keep text only so a
 * long session does not resend every frame. A failed turn is not stored.
 */

import {
  QwenChatMessage,
  QwenChatOptions,
  QwenChatResult,
  sendQwenChatRequest,
} from "./ai-endpoint";

/** Most recent messages kept per session (user + assistant pairs). */
export const MAX_SESSION_MESSAGES = 40;

export type ChatFn = (
  messages: QwenChatMessage[],
  options?: QwenChatOptions,
) => Promise<QwenChatResult>;

export interface ConversationTurnOptions extends QwenChatOptions {
  /** System prompt sent ahead of the history; never stored. */
  system?: string;
}

export class ConversationStore {
  private sessions = new Map<string, QwenChatMessage[]>();

  constructor(private readonly chat: ChatFn = sendQwenChatRequest) {}

  history(sessionId: string): QwenChatMessage[] {
    return [...(this.sessions.get(sessionId) ?? [])];
  }

  clear(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  /** Sends system + history + this message; stores the pair only on success. */
  async send(
    sessionId: string,
    message: QwenChatMessage,
    options: ConversationTurnOptions = {},
  ): Promise<QwenChatResult> {
    const { system, ...chatOptions } = options;
    const history = this.history(sessionId);
    const messages: QwenChatMessage[] = [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      ...history,
      message,
    ];
    const result = await this.chat(messages, chatOptions);
    if (result.success) {
      const turn: QwenChatMessage[] = [
        { role: "user", content: message.content },
        { role: "assistant", content: result.content },
      ];
      this.sessions.set(sessionId, [...history, ...turn].slice(-MAX_SESSION_MESSAGES));
    }
    return result;
  }
}

export const aiConversations = new ConversationStore();
