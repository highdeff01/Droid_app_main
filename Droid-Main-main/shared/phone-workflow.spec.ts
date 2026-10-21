import { describe, expect, it } from "vitest";
import { phoneActionSchema } from "./phone";
import { actionRecordingSchema, actionsToReplaySteps, recordingToActions, type ActionRecording } from "./phone-workflow";
import { replayActionCount, replayRequestSchema } from "./replay";
import { phoneReplayAction } from "../server/replay-adapter";

const recording = (events: unknown[]) => actionRecordingSchema.parse({ name: "Test", screenWidth: 1080, screenHeight: 2400, events }) as ActionRecording;

describe("recordingToActions", () => {
  it("normalizes a tap to the phone screen", () => {
    const { actions, skipped } = recordingToActions(recording([{ kind: "click", x: 540, y: 1200, at: 1, label: "OK" }]));
    expect(skipped).toEqual([]);
    expect(actions).toEqual([{ type: "tap", x: 0.5, y: 0.5, description: 'Tap "OK"' }]);
  });
  it("merges consecutive text changes into one appended type step", () => {
    const { actions } = recordingToActions(recording([
      { kind: "text", at: 1, field: "f", previous: "ab", text: "abc" },
      { kind: "text", at: 2, field: "f", previous: "abc", text: "abcde" },
    ]));
    expect(actions).toEqual([{ type: "type", text: "cde", description: 'Type "cde"' }]);
  });
  it("reports password, non-append and non-ASCII edits instead of faking them", () => {
    const { actions, skipped } = recordingToActions(recording([
      { kind: "text", at: 1, field: "p", previous: "", text: "secret", password: true },
      { kind: "text", at: 2, field: "q", previous: "hello", text: "help" },
      { kind: "text", at: 3, field: "r", previous: "", text: "héllo" },
    ]));
    expect(actions).toEqual([]);
    expect(skipped.map(s => s.index)).toEqual([0, 1, 2]);
    expect(skipped[0].reason).toMatch(/Password/);
  });
  it("merges a burst of same-direction scrolls into one swipe and keeps navigation keys", () => {
    const { actions } = recordingToActions(recording([
      { kind: "scroll", x: 540, y: 1200, at: 0, direction: "down" },
      { kind: "scroll", x: 540, y: 1200, at: 300, direction: "down" },
      { kind: "scroll", x: 540, y: 1200, at: 5000, direction: "down" },
      { kind: "key", at: 6000, key: "BACK" },
    ]));
    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({ type: "swipe", x: 0.5, y: 0.65, toX: 0.5, toY: 0.35 });
    expect(actions[2]).toMatchObject({ type: "key", key: "BACK" });
  });
});

describe("actionsToReplaySteps", () => {
  const frame = { width: 1001, height: 2001 };
  it("maps recorded actions to phone actions the replay adapter accepts", () => {
    const { actions } = recordingToActions(recording([
      { kind: "click", x: 540, y: 1200, at: 0 },
      { kind: "scroll", x: 540, y: 1200, at: 1, direction: "up" },
      { kind: "text", at: 2, field: "f", previous: "", text: "hi" },
      { kind: "key", at: 3, key: "HOME" },
    ]));
    const steps = actionsToReplaySteps(actions, frame);
    const phone = steps.map(step => phoneActionSchema.parse(phoneReplayAction(step, { ...frame, image: "", hash: "h" })));
    expect(phone[0]).toEqual({ type: "tap", x: 0.5, y: 0.5 });
    expect(phone[1]).toMatchObject({ type: "swipe", x: 0.5, y: 0.35, endX: 0.5, endY: 0.65 });
    expect(phone[2]).toEqual({ type: "text", text: "hi" });
    expect(phone[3]).toEqual({ type: "key", key: "HOME" });
  });
  it("applies per-step repeats, a whole-workflow override and the 100-action limit", () => {
    const steps = actionsToReplaySteps([{ type: "tap", x: 0.1, y: 0.1, repeatCount: 3 }, { type: "back" }], frame);
    expect(steps.map(s => s.repeatCount)).toEqual([3, 1]);
    expect(replayActionCount(steps, 2)).toBe(8);
    expect(actionsToReplaySteps([{ type: "tap", repeatCount: 3 }], frame, 5)[0].repeatCount).toBe(5);
    const base = { targetDevice: "android", deviceId: "d", confirmation: true };
    expect(replayRequestSchema.safeParse({ ...base, steps, iterations: 25 }).success).toBe(true);
    const heavy = actionsToReplaySteps([{ type: "tap", repeatCount: 25 }], frame);
    expect(replayRequestSchema.safeParse({ ...base, steps: heavy, iterations: 5 }).success).toBe(false);
  });
  it("rejects steps the phone cannot perform instead of skipping them", () => {
    expect(() => actionsToReplaySteps([{ type: "tap" }, { type: "double_tap" }], frame)).toThrow(/Step 2.*double_tap/);
    expect(() => actionsToReplaySteps([{ type: "swipe", x: 0.5, y: 0.5 }], frame)).toThrow(/end point/);
    expect(() => actionsToReplaySteps([], frame)).toThrow(/no action steps/);
  });
});
