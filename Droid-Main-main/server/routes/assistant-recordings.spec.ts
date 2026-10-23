import { describe, expect, it } from "vitest";
import type { RecordedAction } from "@shared/recordings";
import { isPrintableKey, recordedEventsToActions } from "./assistant-recordings";

const src = { source: "manual", sensitiveInputCaptured: false } as const;
const key = (k: string, modifiers: string[] = [], code?: string): RecordedAction =>
  ({
    id: `k-${k}`,
    timestamp: new Date().toISOString(),
    source: src,
    type: "keyboard-key",
    key: k,
    code,
    modifiers,
    sensitive: false,
  }) as RecordedAction;

describe("isPrintableKey", () => {
  it("accepts punctuation, digits, letters and non-ASCII characters", () => {
    for (const k of ["@", ".", "!", "_", "-", "+", "#", "a", "Z", "7", "é", "€"]) {
      expect(isPrintableKey(k), k).toBe(true);
    }
  });

  it("rejects named keys, space and control characters", () => {
    for (const k of ["Enter", "Tab", "ArrowUp", " ", "\n", "\t", ""]) {
      expect(isPrintableKey(k), JSON.stringify(k)).toBe(false);
    }
  });
});

describe("recordedEventsToActions keyboard replay", () => {
  it("types every character of an email instead of pressing Enter for punctuation", () => {
    const actions = recordedEventsToActions("me.x@site.io".split("").map((c) => key(c)));
    expect(actions.map((a) => a.action)).toEqual(
      "me.x@site.io".split("").map((text) => ({ type: "type", text })),
    );
  });

  it("drops an implied Shift for shifted punctuation such as '!' and '@'", () => {
    const [bang, at] = recordedEventsToActions([key("!", ["Shift"], "Digit1"), key("@", ["Shift"], "Digit2")]);
    expect(bang.action).toEqual({ type: "type", text: "!" });
    expect(at.action).toEqual({ type: "type", text: "@" });
  });

  it("still sends named keys and modifier combos as key presses", () => {
    const [enter, space, copy] = recordedEventsToActions([key("Enter"), key(" "), key("c", ["Control"], "KeyC")]);
    expect(enter.action).toEqual({ type: "key", key: "enter" });
    expect(space.action).toEqual({ type: "key", key: "space" });
    expect(copy.action).toEqual({ type: "key", key: "ctrl+c" });
  });
});
