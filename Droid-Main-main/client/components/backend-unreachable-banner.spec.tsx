import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { BackendUnreachableBanner } from "./backend-unreachable-banner";
import { setBackendStatus } from "@/lib/backend-status";

const SENTENCE =
  "Backend API not reachable — this environment cannot run the automation server (no Python, no display, no device control). Run the app locally with npm run dev on port 3000.";

const render = () => renderToStaticMarkup(React.createElement(BackendUnreachableBanner));

afterEach(() => setBackendStatus({ state: "unknown", aiStudio: false }));

describe("BackendUnreachableBanner", () => {
  it("renders nothing before the probe answers or when the API replies with JSON", () => {
    expect(render()).toBe("");
    setBackendStatus({ state: "reachable", aiStudio: false });
    expect(render()).toBe("");
  });

  it("shows the persistent, dismissible notice when the API is unreachable", () => {
    setBackendStatus({ state: "unreachable", aiStudio: false, detail: "/api/health request failed: Failed to fetch" });
    const markup = render();
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(SENTENCE);
    expect(markup).toContain("Dismiss backend warning");
    expect(markup).not.toContain("AI Studio");
  });

  it("names the AI Studio warmup page when it was detected", () => {
    setBackendStatus({ state: "unreachable", aiStudio: true, detail: "/api/health returned non-JSON (HTTP 200)" });
    const markup = render();
    expect(markup).toContain(SENTENCE);
    expect(markup).toContain("AI Studio");
    expect(markup).not.toContain("&lt;html");
  });
});
