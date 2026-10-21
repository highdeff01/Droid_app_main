import { describe, expect, it } from "vitest";
import {
  MAX_CONSECUTIVE_FAILURES,
  MAX_REVISIONS,
  MAX_UNCHANGED_STEPS,
  addFlowVersion,
  applyApprovedPlan,
  applyRelocation,
  assessProgress,
  bestVersionOf,
  confirmBestVersion,
  createGoalState,
  groundFirstStep,
  observeScreen,
  parseProposedSteps,
  recordStepResult,
  relocateTarget,
  reportSignature,
  verifyStep,
  type BestFlow,
  type ExecutedStep,
  type FlowVersion,
  type GoalState,
  type GoalStep,
  type ObservedElement,
  type Relocation,
  type RunEvidence,
  type ScreenObservation,
} from "./goal-loop";

function makeElement(overrides: Partial<ObservedElement> = {}): ObservedElement {
  return {
    name: "Button",
    boundingBox: { x: 100, y: 100, width: 50, height: 50 },
    center: { x: 125, y: 125 },
    confidence: 0.9,
    ...overrides,
  };
}

function makeStep(overrides: Partial<GoalStep> = {}): GoalStep {
  return {
    id: "step-1",
    name: "Click button",
    action: "click",
    x: 125,
    y: 125,
    delayMs: 500,
    expectation: { kind: "none" },
    ...overrides,
  };
}

function makeObservation(overrides: Partial<ScreenObservation> = {}): ScreenObservation {
  return {
    signature: "sig-1",
    description: "",
    elements: [],
    ocrText: [],
    capturedAt: 0,
    ...overrides,
  };
}

function makeExecuted(overrides: Partial<ExecutedStep> = {}): ExecutedStep {
  return {
    step: makeStep(),
    verification: { passed: true, screenChanged: true, checks: [] },
    relocation: "in_place",
    signatureAfter: "sig-2",
    at: 0,
    ...overrides,
  };
}

function stateWith(executed: ExecutedStep[], visited: string[]): GoalState {
  return {
    goal: "Open settings",
    status: "testing",
    plan: [],
    cursor: 0,
    executed,
    visited,
    revisions: 0,
  };
}

function passingEvidence(overrides: Partial<RunEvidence> = {}): RunEvidence {
  return {
    steps: [{ stepId: "s1", passed: true, checks: [] }],
    goalAssessment: { complete: true, onTrack: true, reason: "Goal reached" },
    ...overrides,
  };
}

function makeFlow(overrides: Partial<BestFlow> = {}): BestFlow {
  return {
    id: "flow-1",
    name: "Open settings",
    goal: "Open settings",
    versions: [],
    updatedAt: 0,
    ...overrides,
  };
}

function makeVersion(overrides: Partial<FlowVersion> = {}): FlowVersion {
  return {
    version: 1,
    steps: [makeStep()],
    evidence: passingEvidence(),
    confirmed: false,
    createdAt: 0,
    ...overrides,
  };
}

describe("relocateTarget", () => {
  it("is in_place when the labelled element sits under the planned point", () => {
    const step = makeStep({ targetLabel: "Submit", x: 125, y: 125 });
    const element = makeElement({ name: "Submit" });
    const observation = makeObservation({ elements: [element] });

    const result = relocateTarget(step, observation);

    expect(result.status).toBe("in_place");
    if (result.status === "in_place") expect(result.element).toBe(element);
  });

  it("is moved to the element's new center with the travelled distance when the label is found elsewhere", () => {
    const step = makeStep({ targetLabel: "Submit", x: 125, y: 125 });
    const element = makeElement({
      name: "Submit",
      boundingBox: { x: 300, y: 300, width: 50, height: 50 },
      center: { x: 325, y: 325 },
    });
    const observation = makeObservation({ elements: [element] });

    const result = relocateTarget(step, observation);

    expect(result.status).toBe("moved");
    if (result.status === "moved") {
      expect(result.x).toBe(325);
      expect(result.y).toBe(325);
      expect(result.distancePx).toBe(Math.round(Math.hypot(200, 200)));
    }
  });

  it("is missing when no element on the fresh screen matches the label", () => {
    const step = makeStep({ targetLabel: "Submit", x: 125, y: 125 });
    const observation = makeObservation({ elements: [makeElement({ name: "Cancel" })] });

    expect(relocateTarget(step, observation).status).toBe("missing");
  });

  it("treats an unlabelled point within the 12px TARGET_SLACK_PX as in place", () => {
    const element = makeElement({ boundingBox: { x: 100, y: 100, width: 50, height: 50 } });
    const step = makeStep({ x: 100 - 12, y: 125 });
    const observation = makeObservation({ elements: [element] });

    expect(relocateTarget(step, observation).status).toBe("in_place");
  });

  it("treats an unlabelled point 1px beyond the 12px TARGET_SLACK_PX as missing", () => {
    const element = makeElement({ boundingBox: { x: 100, y: 100, width: 50, height: 50 } });
    const step = makeStep({ x: 100 - 13, y: 125 });
    const observation = makeObservation({ elements: [element] });

    expect(relocateTarget(step, observation).status).toBe("missing");
  });

  it("is not_positional for press_key", () => {
    const step = makeStep({ action: "press_key", keyPayload: "Enter" });

    expect(relocateTarget(step, makeObservation()).status).toBe("not_positional");
  });

  it("is not_positional for wait", () => {
    const step = makeStep({ action: "wait" });

    expect(relocateTarget(step, makeObservation()).status).toBe("not_positional");
  });
});

describe("applyRelocation", () => {
  it("re-grounds the step at the moved target's coordinates", () => {
    const step = makeStep({ x: 1, y: 1 });
    const relocation: Relocation = {
      status: "moved",
      element: makeElement(),
      x: 200,
      y: 300,
      distancePx: 50,
    };

    const result = applyRelocation(step, relocation);

    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
  });

  it("leaves the step unchanged when the target is in place", () => {
    const step = makeStep({ x: 1, y: 1 });
    const relocation: Relocation = { status: "in_place", element: makeElement() };

    expect(applyRelocation(step, relocation)).toBe(step);
  });

  it("leaves the step unchanged when the target is missing", () => {
    const step = makeStep({ x: 1, y: 1 });
    const relocation: Relocation = { status: "missing", reason: "gone" };

    expect(applyRelocation(step, relocation)).toBe(step);
  });
});

describe("verifyStep", () => {
  const before = makeObservation({ signature: "sig-1" });

  it("passes element_present when the labelled element is found on the fresh screen", () => {
    const step = makeStep({ expectation: { kind: "element_present", label: "Save" } });
    const after = makeObservation({ signature: "sig-2", elements: [makeElement({ name: "Save" })] });

    const result = verifyStep(step, before, after);

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ check: "element_present", passed: true });
  });

  it("fails element_present when the labelled element is absent from the fresh screen", () => {
    const step = makeStep({ expectation: { kind: "element_present", label: "Save" } });
    const after = makeObservation({ signature: "sig-2", elements: [] });

    expect(verifyStep(step, before, after).passed).toBe(false);
  });

  it("passes screen_changed when the signature differs from before", () => {
    const step = makeStep({ expectation: { kind: "screen_changed" } });
    const after = makeObservation({ signature: "sig-2" });

    const result = verifyStep(step, before, after);

    expect(result.passed).toBe(true);
    expect(result.screenChanged).toBe(true);
  });

  it("fails screen_changed when the signature is unchanged", () => {
    const step = makeStep({ expectation: { kind: "screen_changed" } });
    const after = makeObservation({ signature: "sig-1" });

    expect(verifyStep(step, before, after).passed).toBe(false);
  });

  it("passes text_found when the OCR lines contain the expected text", () => {
    const step = makeStep({ expectation: { kind: "text_found", text: "Welcome" } });
    const after = makeObservation({ signature: "sig-2", ocrText: ["Welcome back"] });

    expect(verifyStep(step, before, after).passed).toBe(true);
  });

  it("fails text_found when the expected text is not in the OCR lines", () => {
    const step = makeStep({ expectation: { kind: "text_found", text: "Welcome" } });
    const after = makeObservation({ signature: "sig-2", ocrText: ["Goodbye"] });

    expect(verifyStep(step, before, after).passed).toBe(false);
  });

  it("passes vacuously with no checks for a none expectation", () => {
    const step = makeStep({ expectation: { kind: "none" } });
    const after = makeObservation({ signature: "sig-2" });

    const result = verifyStep(step, before, after);

    expect(result.checks).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it("fails the text_landed check when typed text is not visible after typing", () => {
    const step = makeStep({ action: "type_text", text: "hello world", expectation: { kind: "none" } });
    const after = makeObservation({ signature: "sig-2", ocrText: ["something else"] });

    const result = verifyStep(step, before, after);

    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.check === "text_landed")?.passed).toBe(false);
  });
});

describe("createGoalState", () => {
  it("rejects an empty goal", () => {
    expect(() => createGoalState("   ", [makeStep()], "sig-0")).toThrow();
  });

  it("rejects a plan with no steps", () => {
    expect(() => createGoalState("Open settings", [], "sig-0")).toThrow();
  });
});

describe("recordStepResult", () => {
  const state = createGoalState("Open settings", [makeStep()], "sig-0");

  it("advances the cursor only when the step verification passed", () => {
    const executed = makeExecuted({
      verification: { passed: true, screenChanged: true, checks: [] },
      signatureAfter: "sig-1",
    });

    const result = recordStepResult(state, executed);

    expect(result.cursor).toBe(1);
    expect(result.visited).toEqual(["sig-0", "sig-1"]);
  });

  it("keeps the cursor when the step verification failed", () => {
    const executed = makeExecuted({
      verification: { passed: false, screenChanged: false, checks: [] },
      signatureAfter: "sig-1",
    });

    const result = recordStepResult(state, executed);

    expect(result.cursor).toBe(0);
  });
});

describe("assessProgress", () => {
  it("is off_track after MAX_CONSECUTIVE_FAILURES failed verifications in a row", () => {
    const executed = Array.from({ length: MAX_CONSECUTIVE_FAILURES }, (_, i) =>
      makeExecuted({
        verification: {
          passed: false,
          screenChanged: false,
          checks: [{ check: "element_present", passed: false, detail: `attempt ${i} failed` }],
        },
        signatureAfter: "sig-same",
      }),
    );
    const state = stateWith(executed, ["sig-0", ...executed.map(() => "sig-same")]);

    const result = assessProgress(state);

    expect(result.kind).toBe("off_track");
  });

  it("is stalled after MAX_UNCHANGED_STEPS steps that expected a change but left the screen unchanged", () => {
    const executed = Array.from({ length: MAX_UNCHANGED_STEPS }, () =>
      makeExecuted({
        step: makeStep({ expectation: { kind: "screen_changed" } }),
        verification: { passed: true, screenChanged: false, checks: [] },
        signatureAfter: "sig-same",
      }),
    );
    const state = stateWith(executed, ["sig-0", ...executed.map(() => "sig-same")]);

    expect(assessProgress(state).kind).toBe("stalled");
  });

  it("does not count wait steps toward a stall", () => {
    const executed = Array.from({ length: MAX_UNCHANGED_STEPS }, () =>
      makeExecuted({
        step: makeStep({ action: "wait", expectation: { kind: "none" } }),
        verification: { passed: true, screenChanged: false, checks: [] },
        signatureAfter: "sig-same",
      }),
    );
    const state = stateWith(executed, ["sig-0", ...executed.map(() => "sig-same")]);

    expect(assessProgress(state).kind).toBe("on_track");
  });

  it("is backtrack when a step returns to an earlier screen signature", () => {
    const changeStep = () => makeStep({ expectation: { kind: "screen_changed" } });
    const executed = [
      makeExecuted({ step: changeStep(), verification: { passed: true, screenChanged: true, checks: [] }, signatureAfter: "a" }),
      makeExecuted({ step: changeStep(), verification: { passed: true, screenChanged: true, checks: [] }, signatureAfter: "b" }),
      makeExecuted({ step: changeStep(), verification: { passed: true, screenChanged: true, checks: [] }, signatureAfter: "a" }),
    ];
    const state = stateWith(executed, ["start", "a", "b", "a"]);

    expect(assessProgress(state).kind).toBe("backtrack");
  });

  it("is on_track when steps are passing and progressing to new screens", () => {
    const changeStep = () => makeStep({ expectation: { kind: "screen_changed" } });
    const executed = [
      makeExecuted({ step: changeStep(), verification: { passed: true, screenChanged: true, checks: [] }, signatureAfter: "a" }),
      makeExecuted({ step: changeStep(), verification: { passed: true, screenChanged: true, checks: [] }, signatureAfter: "b" }),
    ];
    const state = stateWith(executed, ["start", "a", "b"]);

    expect(assessProgress(state).kind).toBe("on_track");
  });
});

describe("applyApprovedPlan", () => {
  const executed = [
    makeExecuted({ step: makeStep({ id: "step-a" }), verification: { passed: true, screenChanged: true, checks: [] } }),
    makeExecuted({ step: makeStep({ id: "step-b" }), verification: { passed: false, screenChanged: false, checks: [] } }),
  ];
  const state = stateWith(executed, ["start", "sig-1", "sig-2"]);

  it("keeps the goal and the already-verified steps when adopting an approved re-plan", () => {
    const proposal = { goal: "Open settings", reason: "off track", steps: [makeStep({ id: "step-c" })] };

    const result = applyApprovedPlan(state, proposal);

    expect(result.goal).toBe("Open settings");
    expect(result.status).toBe("testing");
    expect(result.plan.map((s) => s.id)).toEqual(["step-a", "step-c"]);
    expect(result.cursor).toBe(1);
  });

  it("increments the revision count on each approved re-plan", () => {
    const proposal = { goal: "Open settings", reason: "off track", steps: [makeStep({ id: "step-c" })] };

    const once = applyApprovedPlan(state, proposal);
    const twice = applyApprovedPlan(once, proposal);

    expect(once.revisions).toBe(1);
    expect(twice.revisions).toBe(2);
  });

  it("refuses a proposal that targets a different goal", () => {
    const proposal = { goal: "Open billing", reason: "off track", steps: [makeStep()] };

    expect(() => applyApprovedPlan(state, proposal)).toThrow();
  });

  it("refuses once the goal was already re-planned MAX_REVISIONS times", () => {
    const maxedState = { ...state, revisions: MAX_REVISIONS };
    const proposal = { goal: "Open settings", reason: "off track", steps: [makeStep()] };

    expect(() => applyApprovedPlan(maxedState, proposal)).toThrow();
  });
});

describe("parseProposedSteps", () => {
  it("drops invalid items and assigns ids to the ones that parse", () => {
    const raw = [
      { name: "Tap button", action: "click", x: 10, y: 20, expectation: { kind: "none" } },
      { name: "", action: "click", x: 10, y: 20 },
      { action: "bogus_action", x: 1, y: 1 },
    ];

    const result = parseProposedSteps(raw);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("goal_step_1");
    expect(result[0].name).toBe("Tap button");
  });

  it("returns an empty array when the raw value is not an array", () => {
    expect(parseProposedSteps(null)).toEqual([]);
    expect(parseProposedSteps(undefined)).toEqual([]);
  });
});

describe("groundFirstStep", () => {
  it("rejects a first step whose target has no element on the fresh screen", () => {
    const steps = [makeStep({ x: 500, y: 500, targetLabel: "Ghost" })];
    const observation = makeObservation({ elements: [] });

    const result = groundFirstStep(steps, observation);

    expect(result.steps).toEqual([]);
    expect(result.rejected).toMatch(/rejected/);
  });

  it("re-grounds a first step whose target moved, leaving the rest of the plan untouched", () => {
    const first = makeStep({ id: "step-1", x: 10, y: 10, targetLabel: "Save" });
    const rest = makeStep({ id: "step-2" });
    const element = makeElement({
      name: "Save",
      boundingBox: { x: 300, y: 300, width: 50, height: 50 },
      center: { x: 325, y: 325 },
    });
    const observation = makeObservation({ elements: [element] });

    const result = groundFirstStep([first, rest], observation);

    expect(result.rejected).toBeUndefined();
    expect(result.steps[0]).toMatchObject({ x: 325, y: 325 });
    expect(result.steps[1].id).toBe("step-2");
  });
});

describe("addFlowVersion", () => {
  it("refuses evidence with a failed step", () => {
    const evidence = passingEvidence({ steps: [{ stepId: "s1", passed: false, checks: [] }] });

    expect(() => addFlowVersion(makeFlow(), [makeStep()], evidence)).toThrow();
  });

  it("refuses evidence where the goal was not reached", () => {
    const evidence = passingEvidence({ goalAssessment: { complete: false, onTrack: true, reason: "Not there yet" } });

    expect(() => addFlowVersion(makeFlow(), [makeStep()], evidence)).toThrow();
  });

  it("assigns increasing version numbers to successive saves", () => {
    const afterFirst = addFlowVersion(makeFlow(), [makeStep()], passingEvidence());
    const afterSecond = addFlowVersion(afterFirst, [makeStep()], passingEvidence());

    expect(afterFirst.versions.map((v) => v.version)).toEqual([1]);
    expect(afterSecond.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("never changes bestVersion when appending a new version", () => {
    const flow = makeFlow({ versions: [makeVersion({ version: 1, confirmed: true })], bestVersion: 1 });

    const result = addFlowVersion(flow, [makeStep()], passingEvidence());

    expect(result.bestVersion).toBe(1);
  });
});

describe("confirmBestVersion", () => {
  it("confirms the first version as best without needing approval", () => {
    const flow = makeFlow({ versions: [makeVersion({ version: 1 })] });

    const result = confirmBestVersion(flow, 1, false);

    expect(result.bestVersion).toBe(1);
    expect(result.versions[0].confirmed).toBe(true);
  });

  it("refuses to replace a different confirmed best without approval", () => {
    const flow = makeFlow({
      versions: [makeVersion({ version: 1, confirmed: true }), makeVersion({ version: 2 })],
      bestVersion: 1,
    });

    expect(() => confirmBestVersion(flow, 2, false)).toThrow();
  });

  it("replaces the confirmed best when approval is given", () => {
    const flow = makeFlow({
      versions: [makeVersion({ version: 1, confirmed: true }), makeVersion({ version: 2 })],
      bestVersion: 1,
    });

    const result = confirmBestVersion(flow, 2, true);

    expect(result.bestVersion).toBe(2);
    expect(result.versions.find((v) => v.version === 2)?.confirmed).toBe(true);
  });

  it("rejects an unknown version", () => {
    const flow = makeFlow({ versions: [makeVersion({ version: 1 })] });

    expect(() => confirmBestVersion(flow, 99, false)).toThrow();
  });
});

describe("bestVersionOf", () => {
  it("returns the confirmed best version's record", () => {
    const v1 = makeVersion({ version: 1 });
    const v2 = makeVersion({ version: 2, confirmed: true });
    const flow = makeFlow({ versions: [v1, v2], bestVersion: 2 });

    expect(bestVersionOf(flow)).toBe(v2);
  });

  it("returns undefined when no version is confirmed yet", () => {
    const flow = makeFlow({ versions: [makeVersion({ version: 1 })] });

    expect(bestVersionOf(flow)).toBeUndefined();
  });
});

describe("observeScreen", () => {
  it("uses the frame hash as the signature when one is given", () => {
    const report = { screenDescription: "d", activeWindow: "w", elements: [] };

    const result = observeScreen(report, ["line"], "hash-123", 100);

    expect(result.signature).toBe("hash-123");
  });

  it("falls back to the report signature when no frame hash is given", () => {
    const report = { screenDescription: "d", activeWindow: "Window A", elements: [makeElement({ name: "Btn" })] };

    const result = observeScreen(report, [], undefined, 100);

    expect(result.signature).toBe(reportSignature(report));
  });
});
