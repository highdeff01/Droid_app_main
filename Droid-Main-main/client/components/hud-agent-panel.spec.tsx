import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HudAgentPanel } from "./hud-agent-panel";

describe("HudAgentPanel Ask Qwen controls", () => {
  it("renders the question input with Enter-to-send and a visible Send button", () => {
    const markup = renderToStaticMarkup(
      React.createElement(HudAgentPanel, {
        steps: [],
        replayRun: null,
        device: { targetDevice: "desktop" },
        onLoadSteps: () => {},
      }),
    );
    expect(markup).toContain('aria-label="Question for Qwen"');
    expect(markup).toContain("Enter to send");
    expect(markup).toContain('aria-label="Send question to Qwen"');
    expect(markup).toContain(">Send<");
  });
});
