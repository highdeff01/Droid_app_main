import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProgressEvent } from "@shared/progress";
import { ProgressFeedView } from "./progress-feed";

const SHOT = "data:image/png;base64,AAAA";

function event(seq: number, overrides: Partial<ProgressEvent> = {}): ProgressEvent {
  return { seq, kind: "run", level: "info", title: `Event ${seq}`, detail: "", logs: [], at: 0, ...overrides };
}

describe("ProgressFeedView", () => {
  it("shows the newest events first with their logs and screenshot", () => {
    const html = renderToStaticMarkup(
      <ProgressFeedView
        state={{
          events: [event(1, { title: "Goal started" }), event(2, { kind: "error", level: "error", title: "Step failed", logs: ["click missed"], screenshot: SHOT })],
          cursor: 2,
          error: null,
        }}
      />,
    );
    expect(html.indexOf("Step failed")).toBeLessThan(html.indexOf("Goal started"));
    expect(html).toContain("click missed");
    expect(html).toContain(SHOT);
    expect(html).toContain('data-kind="error"');
  });

  it("limits how many events are shown", () => {
    const events = [1, 2, 3].map((seq) => event(seq));
    const html = renderToStaticMarkup(<ProgressFeedView state={{ events, cursor: 3, error: null }} limit={2} />);
    expect(html).not.toContain("Event 1");
    expect(html).toContain("Event 3");
  });

  it("shows a failed stream as a failure, not as no activity", () => {
    const html = renderToStaticMarkup(<ProgressFeedView state={{ events: [], cursor: 0, error: "Unauthorized" }} />);
    expect(html).toContain("Progress unavailable: Unauthorized");
    expect(html).not.toContain("No activity yet");
  });
});
