import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FollowUpThread } from "@shared/feedback";
import { FollowUpLedger } from "./companion-tasks-panel";

function thread(proposalId: string, overrides: Partial<FollowUpThread> = {}): FollowUpThread {
  const proposal = {
    id: `e_${proposalId}`,
    kind: "proposal" as const,
    proposalId,
    topic: "fix",
    summary: `Fix for ${proposalId}`,
    source: "error-bus",
    priorFeedback: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return { proposal, entries: [proposal], ...overrides };
}

describe("FollowUpLedger", () => {
  it("shows what was suggested, what the user chose and what happened", () => {
    const withExtension = thread("p1", { decision: "edited", outcome: "succeeded" });
    withExtension.entries.push({
      id: "x1",
      kind: "extension",
      proposalId: "p1",
      topic: "fix",
      description: "added wait",
      addedSteps: 1,
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const html = renderToStaticMarkup(<FollowUpLedger threads={[withExtension, thread("p2")]} error={null} />);
    expect(html).toContain("Fix for p1");
    expect(html).toContain("edited");
    expect(html).toContain("succeeded");
    expect(html).toContain("1 workflow extension(s)");
    expect(html).toContain("no decision yet");
    expect(html.indexOf("Fix for p2")).toBeLessThan(html.indexOf("Fix for p1"));
  });

  it("shows a failed ledger load as a failure", () => {
    const html = renderToStaticMarkup(<FollowUpLedger threads={[]} error="Unauthorized" />);
    expect(html).toContain("Ledger unavailable: Unauthorized");
    expect(html).not.toContain("No AI proposals recorded yet");
  });
});
