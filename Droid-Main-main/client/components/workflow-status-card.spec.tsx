import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkflowStatusActions } from "./workflow-status-card";
import { WorkflowStatusCard } from "./workflow-status-card";
import type { WorkflowStatusSummary } from "@/lib/workflow-status";

/** A WorkflowStatusSummary fixture; override any field. */
function makeSummary(overrides: Partial<WorkflowStatusSummary> = {}): WorkflowStatusSummary {
  return {
    id: "exec-1",
    status: "running",
    currentStep: 2,
    totalSteps: 3,
    retries: [],
    ...overrides,
  };
}

function makeActions(): WorkflowStatusActions {
  return { onApprove: () => {}, onApproveAlternate: () => {}, onReject: () => {} };
}

function render(summary: WorkflowStatusSummary, extra: { busy?: boolean; error?: string } = {}) {
  return renderToStaticMarkup(
    <WorkflowStatusCard summary={summary} actions={makeActions()} {...extra} />,
  );
}

describe("WorkflowStatusCard step and status", () => {
  it("shows the current step out of total and the status badge", () => {
    const markup = render(makeSummary({ currentStep: 2, totalSteps: 3, status: "running" }));

    expect(markup).toContain("Step 2 / 3");
    expect(markup).toContain("running");
  });
});

describe("WorkflowStatusCard retries", () => {
  it("renders a retry attempt line for each retry", () => {
    const markup = render(
      makeSummary({
        retries: [
          { stepId: "step-1", attempt: 2, max: 3, message: "retrying step 1 (attempt 2/3)" },
          { stepId: "step-2", attempt: 1, max: 2, message: "retrying step 2 (attempt 1/2)" },
        ],
      }),
    );

    expect(markup).toContain("Retry attempt 2/3");
    expect(markup).toContain("Retry attempt 1/2");
  });
});

describe("WorkflowStatusCard alternate proposal", () => {
  it("shows the alternate step id with approve alternate and reject controls", () => {
    const markup = render(
      makeSummary({ alternate: { stepId: "step-2", alternateStepId: "step-2b", reason: "Retries exhausted" } }),
    );

    expect(markup).toContain("step-2b");
    expect(markup).toContain("Approve alternate");
    expect(markup).toContain("Reject");
  });
});

describe("WorkflowStatusCard approval request", () => {
  it("shows approve and continue, reject, and the reason", () => {
    const markup = render(makeSummary({ approval: { stepId: "step-2", reason: "Uncertain verification", retryStep: true } }));

    expect(markup).toContain("Approve and continue");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Uncertain verification");
  });
});

describe("WorkflowStatusCard with neither alternate nor approval", () => {
  it("renders no Reject button", () => {
    const markup = render(makeSummary());

    expect(markup).not.toContain("Reject");
  });
});

describe("WorkflowStatusCard verdict", () => {
  it("renders Completed with the reason for a completed verdict", () => {
    const markup = render(makeSummary({ verdict: { outcome: "completed", reason: "All steps verified" } }));

    expect(markup).toContain("Completed: All steps verified");
  });

  it("renders Failed with the reason for a failed verdict", () => {
    const markup = render(makeSummary({ verdict: { outcome: "failed", reason: "Step 2 did not verify" } }));

    expect(markup).toContain("Failed: Step 2 did not verify");
  });
});

describe("WorkflowStatusCard error", () => {
  it("renders the error text", () => {
    const markup = render(makeSummary(), { error: "Network request failed" });

    expect(markup).toContain("Network request failed");
  });
});
