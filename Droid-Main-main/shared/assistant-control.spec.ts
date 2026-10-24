import { describe, expect, it } from "vitest";
import {
  MONITOR_INTERVAL_MS,
  USE_USAGE,
  classifyInputAction,
  matchTargetElement,
  parseAssistantCommand,
} from "./assistant-control";

describe("parseAssistantCommand", () => {
  it("reads /use with any keyword case and strips surrounding quotes", () => {
    expect(parseAssistantCommand("/USE  'Save draft' ")).toEqual({ kind: "use", target: "Save draft" });
    expect(parseAssistantCommand("/use search box")).toEqual({ kind: "use", target: "search box" });
  });

  it("rejects /use without a target with the usage message", () => {
    expect(parseAssistantCommand("/use   ")).toEqual({ kind: "usage_error", message: USE_USAGE });
  });

  it("reads /log and /monitor modes; other text is plain text", () => {
    expect(parseAssistantCommand("/log")).toEqual({ kind: "log" });
    expect(parseAssistantCommand("/monitor Advanced")).toEqual({ kind: "monitor", mode: "advanced" });
    expect(parseAssistantCommand("/monitor off")).toEqual({ kind: "monitor", mode: "off" });
    expect(parseAssistantCommand("/monitor fast").kind).toBe("usage_error");
    expect(parseAssistantCommand("open the menu")).toEqual({ kind: "text", text: "open the menu" });
  });
});

describe("monitor cadence", () => {
  it("is 1 s for background and 0.25 s for advanced", () => {
    expect(MONITOR_INTERVAL_MS).toEqual({ background: 1000, advanced: 250 });
  });
});

describe("classifyInputAction", () => {
  it("splits mouse and keyboard actions and ignores waits", () => {
    expect(classifyInputAction("right_click")).toBe("mouse");
    expect(classifyInputAction("mouse-move")).toBe("mouse");
    expect(classifyInputAction("HOTKEY")).toBe("keyboard");
    expect(classifyInputAction("keyboard-text")).toBe("keyboard");
    expect(classifyInputAction("wait")).toBeNull();
  });
});

describe("matchTargetElement", () => {
  const els = [
    { name: "Cancel", confidence: 0.9 },
    { name: "Save as draft", confidence: 0.5 },
    { name: "Save", textValue: "Save", confidence: 0.4 },
    { name: "Search field", confidence: 0.7 },
  ];

  it("prefers an exact label over a substring match", () => {
    expect(matchTargetElement("save", els)?.name).toBe("Save");
  });

  it("falls back to shared words, then returns null when nothing matches", () => {
    expect(matchTargetElement("the search input", els)?.name).toBe("Search field");
    expect(matchTargetElement("Logout", els)).toBeNull();
  });

  it("breaks ties by confidence", () => {
    const tied = [
      { name: "Next page", confidence: 0.3 },
      { name: "Next step", confidence: 0.8 },
    ];
    expect(matchTargetElement("next", tied)?.name).toBe("Next step");
  });
});
