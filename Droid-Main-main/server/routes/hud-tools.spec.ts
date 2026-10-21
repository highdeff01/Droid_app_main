import { describe, expect, it, vi, beforeEach } from "vitest";

import { DurableStore } from "../durable-store";
import { blockAtPoint, createHudToolsHandlers } from "./hud-tools";
import type { OCRTextBlock } from "@shared/assistant";

const IMAGE_DATA_URL = "data:image/png;base64,AAAA";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function makeDeps() {
  return {
    store: new DurableStore({ inMemory: true }),
    recognize: vi.fn(),
    chat: vi.fn(),
  };
}

function block(id: string, text: string, confidence: number, region: { x: number; y: number; width: number; height: number }): OCRTextBlock {
  return { id, text, confidence, region: { id: `r_${id}`, ...region } };
}

describe("hud-tools handlers", () => {
  let deps: ReturnType<typeof makeDeps>;
  let handlers: ReturnType<typeof createHudToolsHandlers>;

  beforeEach(() => {
    deps = makeDeps();
    handlers = createHudToolsHandlers(deps);
  });

  describe("ocrInspect", () => {
    it("returns the smallest OCR block whose normalized region contains the point", async () => {
      const big = block("b1", "Big Panel", 0.7, { x: 0, y: 0, width: 1, height: 1 });
      const small = block("b2", "OK", 0.95, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 });
      deps.recognize.mockResolvedValueOnce({
        result: { provider: "tesseract", text: [big, small], confidence: 0.8, regions: [] },
        errors: [],
      });
      const res = makeRes();

      await handlers.ocrInspect(
        { body: { imageData: IMAGE_DATA_URL, x: 50, y: 50, frameWidth: 100, frameHeight: 100 } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.body.success).toBe(true);
      expect(res.body.text).toBe("OK");
      expect(res.body.confidence).toBe(0.95);
      expect(res.body.provider).toBe("tesseract");
    });

    it("returns null text when no block contains the point", async () => {
      const far = block("b1", "Elsewhere", 0.9, { x: 0.8, y: 0.8, width: 0.1, height: 0.1 });
      deps.recognize.mockResolvedValueOnce({
        result: { provider: "tesseract", text: [far], confidence: 0.8, regions: [] },
        errors: [],
      });
      const res = makeRes();

      await handlers.ocrInspect(
        { body: { imageData: IMAGE_DATA_URL, x: 10, y: 10, frameWidth: 100, frameHeight: 100 } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.body.success).toBe(true);
      expect(res.body.text).toBeNull();
    });

    it("returns 400 when imageData is not a data URL", async () => {
      const res = makeRes();

      await handlers.ocrInspect(
        { body: { imageData: "not-a-url", x: 1, y: 1, frameWidth: 100, frameHeight: 100 } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when frame size is missing", async () => {
      const res = makeRes();

      await handlers.ocrInspect(
        { body: { imageData: IMAGE_DATA_URL, x: 1, y: 1 } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 502 with the joined provider errors when recognition fails", async () => {
      deps.recognize.mockResolvedValueOnce({ errors: ["tesseract: x"] });
      const res = makeRes();

      await handlers.ocrInspect(
        { body: { imageData: IMAGE_DATA_URL, x: 1, y: 1, frameWidth: 100, frameHeight: 100 } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.statusCode).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("tesseract: x");
    });
  });

  describe("tagEntity", () => {
    it("persists the entity so listEntities returns it", async () => {
      const res = makeRes();

      await handlers.tagEntity(
        { body: { type: "goal", x: 12.4, y: 30.6, label: "Submit" } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.body.success).toBe(true);
      const listRes = makeRes();
      handlers.listEntities({} as any, listRes as any, vi.fn());
      expect(listRes.body.entities).toHaveLength(1);
      expect(listRes.body.entities[0]).toMatchObject({ type: "goal", x: 12, y: 31, label: "Submit" });
    });

    it("gives a total of 2 after a second tag", async () => {
      await handlers.tagEntity({ body: { type: "goal", x: 1, y: 1 } } as any, makeRes() as any, vi.fn());
      const res = makeRes();

      await handlers.tagEntity({ body: { type: "context", x: 2, y: 2 } } as any, res as any, vi.fn());

      expect(res.body.total).toBe(2);
    });

    it("returns 400 for an invalid entity type", async () => {
      const res = makeRes();

      await handlers.tagEntity({ body: { type: "enemy", x: 1, y: 1 } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("askQwen", () => {
    it("sends a user message whose images[0] is the base64 part and returns the stripped answer", async () => {
      deps.chat.mockResolvedValueOnce({
        success: true,
        content: "<think>pondering</think>The button is blue.",
        endpoint: "http://localhost:11434",
      });
      const res = makeRes();

      await handlers.askQwen(
        { body: { imageData: IMAGE_DATA_URL, question: "What color is the button?" } } as any,
        res as any,
        vi.fn(),
      );

      const [messages] = deps.chat.mock.calls[0];
      const userMessage = messages.find((m: any) => m.role === "user");
      expect(userMessage.images[0]).toBe("AAAA");
      expect(res.body.success).toBe(true);
      expect(res.body.answer).toBe("The button is blue.");
    });

    it("returns 502 when the chat call fails", async () => {
      deps.chat.mockResolvedValueOnce({ success: false, error: "down" });
      const res = makeRes();

      await handlers.askQwen(
        { body: { imageData: IMAGE_DATA_URL, question: "anything?" } } as any,
        res as any,
        vi.fn(),
      );

      expect(res.statusCode).toBe(502);
      expect(res.body.success).toBe(false);
    });
  });

  describe("guide", () => {
    it("returns the thought, incomplete typing and only the valid suggested action, using json format", async () => {
      const content = JSON.stringify({
        thought: "The user is filling a form",
        intention: "Complete the login",
        incompleteTyping: { stepId: "s1", remainingText: "lo" },
        suggestedActions: [
          { name: "a", action: "click", x: 1, y: 2 },
          { name: "bad", action: "click" },
        ],
      });
      deps.chat.mockResolvedValueOnce({ success: true, content, endpoint: "http://localhost:11434" });
      const res = makeRes();

      await handlers.guide({ body: { imageData: IMAGE_DATA_URL, sequence: [] } } as any, res as any, vi.fn());

      expect(res.body.success).toBe(true);
      expect(res.body.guide.thought).toBe("The user is filling a form");
      expect(res.body.guide.incompleteTyping).toEqual({ stepId: "s1", remainingText: "lo" });
      expect(res.body.guide.suggestedActions).toEqual([{ name: "a", action: "click", x: 1, y: 2 }]);
      const [, options] = deps.chat.mock.calls[0];
      expect(options.format).toBe("json");
    });
  });

  describe("createPack / listPacks / getPack", () => {
    it("persists name, sequence and screenshots filtered to data URLs", async () => {
      const res = makeRes();

      await handlers.createPack(
        {
          body: {
            name: "Login flow",
            sequence: [{ id: "s1" }],
            screenshots: [IMAGE_DATA_URL, "not-a-url"],
          },
        } as any,
        res as any,
        vi.fn(),
      );

      expect(res.body.success).toBe(true);
      expect(res.body.pack.name).toBe("Login flow");
      expect(res.body.pack.sequence).toEqual([{ id: "s1" }]);
      expect(res.body.pack.screenshots).toEqual([IMAGE_DATA_URL]);
    });

    it("lists packs with stepCount", async () => {
      const createRes = makeRes();
      await handlers.createPack(
        { body: { name: "Pack A", sequence: [{ id: "s1" }, { id: "s2" }] } } as any,
        createRes as any,
        vi.fn(),
      );
      const res = makeRes();

      handlers.listPacks({} as any, res as any, vi.fn());

      expect(res.body.packs).toHaveLength(1);
      expect(res.body.packs[0].stepCount).toBe(2);
    });

    it("returns 404 for an unknown pack id", async () => {
      const res = makeRes();

      handlers.getPack({ params: { id: "missing" } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when creating a pack with an empty sequence", async () => {
      const res = makeRes();

      await handlers.createPack({ body: { name: "Empty", sequence: [] } } as any, res as any, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

describe("blockAtPoint", () => {
  it("returns the smallest block containing the normalized point", () => {
    const big = block("b1", "Big", 0.5, { x: 0, y: 0, width: 1, height: 1 });
    const small = block("b2", "Small", 0.9, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 });

    expect(blockAtPoint([big, small], 0.5, 0.5)).toBe(small);
  });

  it("returns undefined when no block contains the point", () => {
    const far = block("b1", "Far", 0.9, { x: 0.8, y: 0.8, width: 0.1, height: 0.1 });

    expect(blockAtPoint([far], 0.1, 0.1)).toBeUndefined();
  });
});
