import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LABEL,
  INITIAL_COGNITION,
  WAITING_FOR_INSPECTION,
  cognitionView,
  loadCuesEnabled,
  masterLine,
  reduceCognition,
  replayActivity,
  saveCuesEnabled,
} from "./cognition-feed";
import type { GoalLoopEvent } from "./qwen-turn-loop";
import type { MasterSnapshot } from "./master-ai";

const fold = (events: GoalLoopEvent[]) => events.reduce(reduceCognition, INITIAL_COGNITION);

describe("cognition panel mapping", () => {
  it("shows only the waiting line before any event", () => {
    const view = cognitionView(INITIAL_COGNITION);
    expect(view).toEqual({
      goal: "—",
      thought: WAITING_FOR_INSPECTION,
      detail: null,
      current: null,
      next: null,
      narration: null,
      pipeline: null,
      master: null,
    });
    expect(WAITING_FOR_INSPECTION).toBe("waiting for first inspection…");
  });

  it("uses exactly the event's message as the thought", () => {
    const view = cognitionView(fold([{ phase: "thinking", message: "Screen: login form; 4 elements" }]));
    expect(view.thought).toBe("Screen: login form; 4 elements");
  });

  it("never invents coordinates for an event without x/y", () => {
    const state = fold([
      { phase: "verifying", message: "check", x: 40, y: 60 },
      { phase: "acting", message: "Acting: Submit", label: "Submit" },
    ]);
    expect(state.point).toBeNull();
    expect(cognitionView(state).detail).not.toMatch(/\(0, 0\)|\(40, 60\)/);
  });

  it("shows goal, current and next steps carried by the loop", () => {
    const view = cognitionView(
      fold([
        {
          phase: "verifying",
          message: 'Verifying target for "Type email"',
          goal: "Sign up",
          x: 12,
          y: 34,
          current: { name: "Type email", action: "type_text", x: 12, y: 34, label: "Email" },
          next: { name: "Submit", action: "click", x: 50, y: 90 },
        },
      ]),
    );
    expect(view.goal).toBe("Sign up");
    expect(view.current).toBe("Type email · type_text → Email @ (12, 34)");
    expect(view.next).toBe("Submit · click @ (50, 90)");
    expect(view.detail).toContain("(12, 34)");
  });

  it("reports no further step only when the loop says so", () => {
    expect(cognitionView(fold([{ phase: "thinking", message: "m" }])).next).toBeNull();
    expect(cognitionView(fold([{ phase: "analyzing", message: "m", next: null }])).next).toBe("no further planned step");
  });

  it("shows the on-track check only after a step was verified", () => {
    expect(cognitionView(fold([{ phase: "acting", message: "Acting" }])).narration).toBeNull();
    const view = cognitionView(
      fold([
        {
          phase: "analyzing",
          message: "n",
          narration: { step: "Open menu", passed: true, checks: "Screen changed", progress: "on_track", nextObjective: "Pick settings" },
        },
      ]),
    );
    expect(view.narration).toBe('Previous "Open menu" ✓ verified (Screen changed) · on track · next objective: Pick settings');
  });

  it("shows the pipelined pre-verification as the loop reported it", () => {
    const view = cognitionView(
      fold([{ phase: "verifying", message: "pre", pipeline: { stage: "pre", step: "Submit", verdict: "pass", reason: 'Target "Submit" found' } }]),
    );
    expect(view.pipeline).toBe('Next "Submit" pre-verified in background: pass — Target "Submit" found');
  });
});

describe("activity notices", () => {
  it("separates thinking, acting and plain replay", () => {
    expect(fold([{ phase: "verifying", message: "v" }]).activity?.kind).toBe("thinking");
    expect(fold([{ phase: "awaiting_approval", message: "a" }]).activity?.kind).toBe("thinking");
    expect(fold([{ phase: "acting", message: "Acting: Submit" }]).activity).toEqual({ kind: "acting", message: "Acting: Submit" });
    expect(replayActivity(INITIAL_COGNITION, "Replaying 3 recorded step(s)").activity?.kind).toBe("replay");
    expect(ACTIVITY_LABEL.replay).toContain("no AI decision");
  });

  it("clears the notice when the run ends", () => {
    expect(fold([{ phase: "acting", message: "a" }, { phase: "completed", message: "done" }]).activity).toBeNull();
    expect(replayActivity(fold([{ phase: "acting", message: "a" }]), null).activity).toBeNull();
  });

  it("persists the cue toggle, off by default", () => {
    const data: Record<string, string> = {};
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    expect(loadCuesEnabled(storage)).toBe(false);
    saveCuesEnabled(true, storage);
    expect(loadCuesEnabled(storage)).toBe(true);
  });
});

describe("masterLine", () => {
  it("reports the running master operation and nothing when inactive", () => {
    expect(masterLine(null)).toBeNull();
    const snapshot = {
      active: true,
      operations: [{ kind: "goal", title: "Fill form", status: "running", detail: "step 2" }],
    } as unknown as MasterSnapshot;
    expect(masterLine(snapshot)).toBe('Master AI: goal "Fill form" running — step 2');
  });
});
