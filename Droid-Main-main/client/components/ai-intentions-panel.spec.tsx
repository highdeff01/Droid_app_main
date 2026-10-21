import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UserHabitProfile } from "@shared/learning";
import { AiIntentionsPanel, type AiIntentionsPanelProps } from "./ai-intentions-panel";

function makeProfile(overrides: Partial<UserHabitProfile> = {}): UserHabitProfile {
  return {
    totalActionsRecorded: 0,
    appUsageFrequencies: {},
    topClickZones: [],
    repetitiveActionDetected: false,
    repetitiveActionCount: 0,
    habitDetectionRate: null,
    preferredDevice: "desktop",
    learnedWorkflowsCount: 0,
    gateStats: {
      attempts: 0,
      verified: 0,
      blocked: 0,
      targetNotFound: 0,
      overrides: 0,
      successRate: null,
    },
    corrections: { count: 0, meanDx: null, meanDy: null },
    movement: { delayMultiplier: 1, userAdjusted: false, preferredZones: [] },
    ...overrides,
  };
}

function defaultProps(): AiIntentionsPanelProps {
  return {
    gateReport: null,
    replayRun: null,
    sequence: [],
    goals: [],
    detectedElements: null,
    profile: null,
    profileError: null,
    defaultOpen: true,
  };
}

/** Static markup of AiIntentionsPanel with default props merged with overrides. */
export function renderPanel(overrides: Partial<AiIntentionsPanelProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(AiIntentionsPanel, { ...defaultProps(), ...overrides }),
  );
}

function extractMetricValues(markup: string): string[] {
  const values: string[] = [];
  const re = /data-metric="[^"]*">([^<]*)</g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markup))) values.push(match[1]);
  return values;
}

describe("AiIntentionsPanel with no profile", () => {
  it("shows an em dash for metrics with no digits except the given detected elements count", () => {
    const markup = renderPanel({ detectedElements: 3 });
    const values = extractMetricValues(markup);

    const detectedElements = values.find((_, i) => /Detected elements/.test(markup.split("data-metric=")[i + 1] ?? ""));
    const nonDetected = values.filter((v) => v !== "3");

    expect(values).toContain("3");
    nonDetected.forEach((value) => expect(value).not.toMatch(/\d/));
  });
});

describe("AiIntentionsPanel with a profile", () => {
  it("renders the habit detection rate and learned workflow count", () => {
    const profile: UserHabitProfile = makeProfile({ habitDetectionRate: 0.5, learnedWorkflowsCount: 7 });

    const markup = renderPanel({ profile });

    expect(markup).toContain("50%");
    expect(markup).toContain("7");
  });
});

describe("AiIntentionsPanel completed goals", () => {
  it("shows a completed goal with its data-completed-goal attribute", () => {
    const goal = {
      id: "goal-done",
      title: "Finished goal",
      description: "",
      priority: 3 as const,
      status: "completed" as const,
      category: "navigation" as const,
      targetRegion: { x: 0, y: 0, width: 0, height: 0 },
      targetCenter: { x: 0, y: 0 },
      targetLabel: "",
      policy: {
        mode: "strict_verification" as const,
        maxRetries: 0,
        timeoutSeconds: 30,
        requireVisualConfirmation: true,
        autoTriggerOnCaptcha: false,
      },
      dependencies: [],
      subtasks: [],
      progressPercent: 100,
    };

    const markup = renderPanel({ goals: [goal] });

    expect(markup).toContain(`data-completed-goal="${goal.id}"`);
  });
});

describe("AiIntentionsPanel profile error", () => {
  it("renders the profile error text", () => {
    const markup = renderPanel({ profileError: "network down" });

    expect(markup).toContain("network down");
  });
});
