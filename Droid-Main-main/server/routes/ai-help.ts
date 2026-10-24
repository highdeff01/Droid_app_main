/**
 * AI Help and live AI status routes. AI Help sends the user's question (and the
 * live captured frame when supplied) to the Qwen endpoint with the session's
 * conversation history; an unreachable endpoint is a 502, never a canned reply.
 */

import { RequestHandler } from "express";
import { aiConversations } from "../ai-conversation";
import { buildVisionMessage, QwenChatMessage } from "../ai-endpoint";
import { getAiStatus, pingAiEndpoint } from "../ai-status";

const HELP_SYSTEM_PROMPT = `You are the Droid assistant's AI Help. Answer the operator's question about what is on their screen and how to automate it. When a screenshot is attached, base your answer on what it actually shows; never invent elements that are not visible. Be concise.`;

const SCREENSHOT_PATTERN = /^data:image\/(png|jpeg);base64,/;

export function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export const handleAiHelp: RequestHandler = async (req, res) => {
  const { question, imageData, sessionId = "ai-help", endpoint, model } = req.body ?? {};
  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ success: false, error: "A question is required" });
  }
  const hasFrame = typeof imageData === "string" && SCREENSHOT_PATTERN.test(imageData);
  const message: QwenChatMessage = hasFrame
    ? buildVisionMessage(question.trim(), imageData)
    : { role: "user", content: question.trim() };
  const reply = await aiConversations.send(String(sessionId), message, {
    system: HELP_SYSTEM_PROMPT,
    endpoint,
    model,
  });
  if (!reply.success) {
    return res.status(502).json({
      success: false,
      error: `AI endpoint unreachable: ${reply.error || "no response"}`,
    });
  }
  res.json({
    success: true,
    answer: stripThinking(reply.content),
    endpoint: reply.endpoint,
    sessionId,
    usedFrame: hasFrame,
  });
};

export const handleClearAiSession: RequestHandler = (req, res) => {
  aiConversations.clear(String(req.params.sessionId));
  res.json({ success: true });
};

export const handleGetAiStatus: RequestHandler = async (req, res) => {
  const status = req.query.refresh ? await pingAiEndpoint() : getAiStatus();
  res.json({ success: true, status });
};
