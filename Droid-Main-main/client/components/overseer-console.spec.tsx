import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverseerConsole } from "./overseer-console";

describe("OverseerConsole", () => {
  it("shows a loading state, never placeholder operations, before the first poll lands", () => {
    const markup = renderToStaticMarkup(React.createElement(OverseerConsole));
    expect(markup).toContain("data-overseer-console");
    expect(markup).toContain("Loading overseer state");
    expect(markup).toContain("Ask overseer for status");
    expect(markup).toContain("0 operation(s) · 0 awaiting approval");
    expect(markup).not.toContain("data-operation=");
  });
});
