import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AGENT_CONFIG_UNAVAILABLE, AgentConfigureButton } from "./index";

describe("AgentConfigureButton", () => {
  const html = renderToStaticMarkup(React.createElement(AgentConfigureButton));

  it("is disabled because no agents backend can persist settings", () => {
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("says honestly that configuration is unavailable", () => {
    expect(html).toContain("Configure (unavailable)");
    expect(html).toContain(AGENT_CONFIG_UNAVAILABLE);
  });
});
