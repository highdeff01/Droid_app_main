import { beforeEach, describe, expect, it, vi } from "vitest";
import { DurableStore } from "./durable-store";
import { NotesStore } from "./notes-store";
import { ErrorBus } from "./error-bus";
import { TriggerEngine } from "./trigger-engine";

describe("TriggerEngine", () => {
  let store: DurableStore;
  let notes: NotesStore;
  let errors: ErrorBus;
  let engine: TriggerEngine;

  beforeEach(() => {
    store = new DurableStore({ inMemory: true });
    notes = new NotesStore(store);
    errors = new ErrorBus(store, notes, vi.fn());
    engine = new TriggerEngine(store, notes, errors);
  });

  describe("create()", () => {
    it("rejects an element_appears condition without a pattern", () => {
      expect(() =>
        engine.create({
          name: "no pattern",
          condition: { kind: "element_appears" },
          action: { kind: "take_note" },
        }),
      ).toThrow();
    });

    it("rejects a time_interval condition below the minimum intervalMs", () => {
      expect(() =>
        engine.create({
          name: "too fast",
          condition: { kind: "time_interval", intervalMs: 1000 },
          action: { kind: "take_note" },
        }),
      ).toThrow();
    });

    it("rejects a run_workflow action without a workflowId", () => {
      expect(() =>
        engine.create({
          name: "no workflow",
          condition: { kind: "screen_state", pattern: "go" },
          action: { kind: "run_workflow" },
        }),
      ).toThrow();
    });
  });

  it("fires element_appears once on appearance, not again while still present, again after it reappears", () => {
    const trigger = engine.create({
      name: "login appears",
      condition: { kind: "element_appears", pattern: "Login" },
      action: { kind: "take_note" },
    });
    const withLogin = (at: number) => ({ at, elements: [{ name: "Login button" }] });
    const withoutLogin = (at: number) => ({ at, elements: [] });

    const first = engine.evaluate(withLogin(1000));
    expect(first).toHaveLength(1);
    expect(first[0].triggerId).toBe(trigger.id);
    expect(engine.evaluate(withLogin(2000))).toHaveLength(0);
    expect(engine.evaluate(withoutLogin(3000))).toHaveLength(0);
    expect(engine.evaluate(withLogin(4000))).toHaveLength(1);
  });

  it("fires element_disappears only on the present-to-absent transition", () => {
    engine.create({
      name: "login disappears",
      condition: { kind: "element_disappears", pattern: "Login" },
      action: { kind: "take_note" },
    });
    const withLogin = (at: number) => ({ at, elements: [{ name: "Login button" }] });
    const withoutLogin = (at: number) => ({ at, elements: [] });

    expect(engine.evaluate(withLogin(1000))).toHaveLength(0);
    expect(engine.evaluate(withoutLogin(2000))).toHaveLength(1);
    expect(engine.evaluate(withoutLogin(3000))).toHaveLength(0);
    expect(engine.evaluate(withLogin(4000))).toHaveLength(0);
    expect(engine.evaluate(withoutLogin(5000))).toHaveLength(1);
  });

  it("fires screen_state on a screenDescription substring match", () => {
    engine.create({
      name: "home",
      condition: { kind: "screen_state", pattern: "Home" },
      action: { kind: "take_note" },
    });
    expect(engine.evaluate({ at: 1000, screenDescription: "You are on the Home screen" })).toHaveLength(1);
  });

  it("fires ocr_text on an ocrText substring match", () => {
    engine.create({
      name: "ocr",
      condition: { kind: "ocr_text", pattern: "Welcome" },
      action: { kind: "take_note" },
    });
    expect(engine.evaluate({ at: 1000, ocrText: "Welcome back" })).toHaveLength(1);
  });

  it("does not fire an ocr_text trigger on an observation lacking ocrText", () => {
    engine.create({
      name: "ocr missing",
      condition: { kind: "ocr_text", pattern: "Welcome" },
      action: { kind: "take_note" },
    });
    expect(engine.evaluate({ at: 1000 })).toHaveLength(0);
  });

  it("fires error_observed on every matching observation, not just the first (not edge-triggered)", () => {
    engine.create({
      name: "err",
      condition: { kind: "error_observed", pattern: "timeout" },
      action: { kind: "take_note" },
    });
    expect(engine.evaluate({ at: 1000, errors: ["Request timeout"] })).toHaveLength(1);
    expect(engine.evaluate({ at: 2000, errors: ["Request timeout"] })).toHaveLength(1);
  });

  it("fires time_interval only once intervalMs has elapsed, and not again immediately after", () => {
    const trigger = engine.create({
      name: "tick",
      condition: { kind: "time_interval", intervalMs: 10000 },
      action: { kind: "take_note" },
    });
    const created = Date.parse(trigger.createdAt);
    expect(engine.evaluate({ at: created + 5000 })).toHaveLength(0);
    expect(engine.evaluate({ at: created + 10001 })).toHaveLength(1);
    expect(engine.evaluate({ at: created + 10002 })).toHaveLength(0);
  });

  it("run_workflow queues a pending action that does not require approval", () => {
    engine.create({
      name: "run",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "run_workflow", workflowId: "wf1" },
    });
    engine.evaluate({ at: 1000, screenDescription: "go now" });
    const [pending] = engine.listPendingActions();
    expect(pending.requiresApproval).toBe(false);
    expect(pending.workflowId).toBe("wf1");
  });

  it("ask_approval queues a pending action that requires approval before it can be dispatched", () => {
    engine.create({
      name: "ask",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "ask_approval", workflowId: "wf2" },
    });
    engine.evaluate({ at: 1000, screenDescription: "go now" });
    const [pending] = engine.listPendingActions();
    expect(pending.requiresApproval).toBe(true);
    expect(() => engine.markDispatched(pending.id)).toThrow();
    engine.decidePendingAction(pending.id, true);
    expect(engine.markDispatched(pending.id).status).toBe("dispatched");
  });

  it("decidePendingAction(id, false) rejects the pending action", () => {
    engine.create({
      name: "ask reject",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "ask_approval", workflowId: "wf3" },
    });
    engine.evaluate({ at: 1000, screenDescription: "go now" });
    const [pending] = engine.listPendingActions();
    expect(engine.decidePendingAction(pending.id, false).status).toBe("rejected");
  });

  it("capture_screenshot records a trigger_fired note carrying the observation frame", () => {
    engine.create({
      name: "cap",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "capture_screenshot" },
    });
    engine.evaluate({ at: 1000, screenDescription: "go now", frame: "data:image/png;base64,AAAA" });
    const [note] = notes.list();
    expect(note.event).toBe("trigger_fired");
    expect(note.tags).toContain("trigger_fired");
    expect(note.screenshot).toBe("data:image/png;base64,AAAA");
  });

  it("notify_user records a note tagged notify", () => {
    engine.create({
      name: "notify",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "notify_user", message: "Heads up" },
    });
    engine.evaluate({ at: 1000, screenDescription: "go now" });
    const [note] = notes.list();
    expect(note.tags).toContain("notify");
  });

  it("take_note creates an observation-category note", () => {
    engine.create({
      name: "note",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "take_note" },
    });
    engine.evaluate({ at: 1000, screenDescription: "go now" });
    const [note] = notes.list();
    expect(note.category).toBe("observation");
  });

  it("never fires a disabled trigger", () => {
    engine.create({
      name: "disabled",
      enabled: false,
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "take_note" },
    });
    expect(engine.evaluate({ at: 1000, screenDescription: "go now" })).toHaveLength(0);
  });

  it("evaluate() scoped to kinds only evaluates triggers of those condition kinds", () => {
    engine.create({
      name: "screen",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "take_note" },
    });
    const errTrigger = engine.create({
      name: "err",
      condition: { kind: "error_observed", pattern: "timeout" },
      action: { kind: "take_note" },
    });
    const firings = engine.evaluate(
      { at: 1000, screenDescription: "go now", errors: ["Request timeout"] },
      ["error_observed"],
    );
    expect(firings).toHaveLength(1);
    expect(firings[0].triggerId).toBe(errTrigger.id);
  });

  it("persists triggers visible to a second TriggerEngine on the same store", () => {
    engine.create({
      name: "persisted",
      condition: { kind: "screen_state", pattern: "go" },
      action: { kind: "take_note" },
    });
    const engine2 = new TriggerEngine(store, notes, errors);
    expect(engine2.list().map((t) => t.name)).toContain("persisted");
  });
});
