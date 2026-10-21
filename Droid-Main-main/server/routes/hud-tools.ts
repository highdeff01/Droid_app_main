import { Router, type RequestHandler } from "express";
import { DurableStore } from "../durable-store";
import {
  buildVisionMessage,
  parseModelJson,
  sendQwenChatRequest,
} from "../ai-endpoint";
import { recognizeWithProviders } from "../ocr-provider";
import type { OCRTextBlock } from "@shared/assistant";
import type {
  HudEntity,
  HudGuideResult,
  HudPack,
} from "@shared/api";

/**
 * Screen HUD tools: OCR at a point, persisted entity tags, Qwen ask/guide, and reusable packs.
 * Every handler returns the real provider/store result or `success: false` with the error.
 */

export const ENTITY_COLLECTION = "hud_entities";
export const PACK_COLLECTION = "hud_packs";
const ENTITY_TYPES = new Set(["goal", "context", "distractor"]);

export interface HudToolsDeps {
  store: Pick<DurableStore, "readCollection" | "readCollectionForWrite" | "writeCollection">;
  recognize: typeof recognizeWithProviders;
  chat: typeof sendQwenChatRequest;
}

const GUIDE_PROMPT = `You are the Qwen agent guide watching a live screen while a user records an automation.
Reply with JSON only: {"thought": string, "intention": string,
"incompleteTyping": {"stepId": string, "remainingText": string} | null,
"suggestedActions": [{"name": string, "action": "click"|"type_text"|"press_key", "x": number, "y": number, "text"?: string}]}.
"thought" describes what you see; "intention" is what the user appears to be doing.
Report incompleteTyping only when a recorded typing step's text is visibly unfinished on screen.
Coordinates are pixels of the attached screenshot.`;

function isScreenshot(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpeg);base64,/.test(value);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The OCR block whose (0–1 normalized) region contains the frame-relative point. */
export function blockAtPoint(
  blocks: OCRTextBlock[],
  fx: number,
  fy: number,
): OCRTextBlock | undefined {
  const area = (b: OCRTextBlock) => (b.region ? b.region.width * b.region.height : Infinity);
  return blocks
    .filter((b) => {
      const r = b.region;
      return !!r && fx >= r.x && fx <= r.x + r.width && fy >= r.y && fy <= r.y + r.height;
    })
    .sort((a, b) => area(a) - area(b))[0];
}

export function createHudToolsHandlers(deps: HudToolsDeps) {
  const ocrInspect: RequestHandler = async (req, res) => {
    const { imageData, x, y, frameWidth, frameHeight } = req.body ?? {};
    if (!isScreenshot(imageData)) {
      return res.status(400).json({ success: false, error: "An actual PNG/JPEG screenshot is required" });
    }
    if (![x, y, frameWidth, frameHeight].every((n) => Number.isFinite(n)) || frameWidth <= 0 || frameHeight <= 0) {
      return res.status(400).json({ success: false, error: "x, y, frameWidth and frameHeight are required" });
    }
    try {
      const { result, errors } = await deps.recognize({ imageData });
      if (!result) {
        return res.status(502).json({ success: false, error: `OCR unavailable: ${errors.join("; ")}` });
      }
      const block = blockAtPoint(result.text, x / frameWidth, y / frameHeight);
      res.json({
        success: true,
        provider: result.provider,
        text: block?.text ?? null,
        confidence: block?.confidence ?? null,
        block: block ?? null,
        blockCount: result.text.length,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  const listEntities: RequestHandler = (_req, res) => {
    try {
      res.json({ success: true, entities: deps.store.readCollection<HudEntity>(ENTITY_COLLECTION) });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  const tagEntity: RequestHandler = (req, res) => {
    const { type, x, y, label, elementLabel, frameWidth, frameHeight } = req.body ?? {};
    if (!ENTITY_TYPES.has(type) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ success: false, error: "type (goal|context|distractor), x and y are required" });
    }
    try {
      const entities = deps.store.readCollectionForWrite<HudEntity>(ENTITY_COLLECTION);
      const entity: HudEntity = {
        id: `entity_${Date.now()}_${entities.length + 1}`,
        type,
        x: Math.round(x),
        y: Math.round(y),
        label: typeof label === "string" && label ? label : undefined,
        elementLabel: typeof elementLabel === "string" && elementLabel ? elementLabel : undefined,
        frameWidth: Number.isFinite(frameWidth) ? frameWidth : undefined,
        frameHeight: Number.isFinite(frameHeight) ? frameHeight : undefined,
        createdAt: Date.now(),
      };
      deps.store.writeCollection(ENTITY_COLLECTION, [...entities, entity]);
      res.json({ success: true, entity, total: entities.length + 1 });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  const askQwen: RequestHandler = async (req, res) => {
    const { imageData, question, endpoint, model } = req.body ?? {};
    if (!isScreenshot(imageData) || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, error: "A PNG/JPEG screenshot and a question are required" });
    }
    try {
      const reply = await deps.chat([buildVisionMessage(question.trim(), imageData)], { endpoint, model });
      if (!reply.success) {
        return res.status(502).json({ success: false, error: reply.error || "Qwen unavailable" });
      }
      const answer = reply.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      res.json({ success: true, answer, endpoint: reply.endpoint });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  const guide: RequestHandler = async (req, res) => {
    const { imageData, sequence = [], endpoint, model } = req.body ?? {};
    if (!isScreenshot(imageData)) {
      return res.status(400).json({ success: false, error: "An actual PNG/JPEG screenshot is required" });
    }
    try {
      const steps = JSON.stringify((Array.isArray(sequence) ? sequence : []).slice(-10));
      const reply = await deps.chat(
        [
          { role: "system", content: GUIDE_PROMPT },
          buildVisionMessage(`Recorded steps so far: ${steps}`, imageData),
        ],
        { endpoint, model, format: "json" },
      );
      if (!reply.success) {
        return res.status(502).json({ success: false, error: reply.error || "Qwen unavailable" });
      }
      const parsed = parseModelJson<Partial<HudGuideResult>>(reply.content);
      const result: HudGuideResult = {
        thought: String(parsed.thought ?? ""),
        intention: String(parsed.intention ?? ""),
        incompleteTyping: parsed.incompleteTyping?.stepId ? parsed.incompleteTyping : null,
        suggestedActions: Array.isArray(parsed.suggestedActions)
          ? parsed.suggestedActions.filter((a) => Number.isFinite(a?.x) && Number.isFinite(a?.y))
          : [],
      };
      res.json({ success: true, guide: result, endpoint: reply.endpoint });
    } catch (err) {
      res.status(502).json({ success: false, error: `Qwen guide failed: ${errorMessage(err)}` });
    }
  };

  const createPack: RequestHandler = (req, res) => {
    const { name, sequence, plan, screenshots } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || !Array.isArray(sequence) || sequence.length === 0) {
      return res.status(400).json({ success: false, error: "A pack needs a name and at least one step" });
    }
    try {
      const packs = deps.store.readCollectionForWrite<HudPack>(PACK_COLLECTION);
      const pack: HudPack = {
        id: `pack_${Date.now()}_${packs.length + 1}`,
        name: name.trim(),
        sequence,
        plan: plan ?? null,
        screenshots: Array.isArray(screenshots) ? screenshots.filter(isScreenshot) : [],
        createdAt: Date.now(),
      };
      deps.store.writeCollection(PACK_COLLECTION, [...packs, pack]);
      res.json({ success: true, pack });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  const listPacks: RequestHandler = (_req, res) => {
    try {
      const packs = deps.store.readCollection<HudPack>(PACK_COLLECTION).map((p) => ({
        id: p.id,
        name: p.name,
        stepCount: p.sequence.length,
        screenshotCount: p.screenshots.length,
        hasPlan: !!p.plan,
        createdAt: p.createdAt,
      }));
      res.json({ success: true, packs });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  const getPack: RequestHandler = (req, res) => {
    try {
      const pack = deps.store.readCollection<HudPack>(PACK_COLLECTION).find((p) => p.id === req.params.id);
      if (!pack) return res.status(404).json({ success: false, error: "Pack not found" });
      res.json({ success: true, pack });
    } catch (err) {
      res.status(500).json({ success: false, error: errorMessage(err) });
    }
  };

  return { ocrInspect, listEntities, tagEntity, askQwen, guide, createPack, listPacks, getPack };
}

/** Express router mounted at /api/hud. */
export function createHudToolsRouter(deps: HudToolsDeps): Router {
  const h = createHudToolsHandlers(deps);
  const router = Router();
  router.post("/ocr-inspect", h.ocrInspect);
  router.get("/entities", h.listEntities);
  router.post("/entities", h.tagEntity);
  router.post("/qwen/ask", h.askQwen);
  router.post("/qwen/guide", h.guide);
  router.get("/packs", h.listPacks);
  router.post("/packs", h.createPack);
  router.get("/packs/:id", h.getPack);
  return router;
}
