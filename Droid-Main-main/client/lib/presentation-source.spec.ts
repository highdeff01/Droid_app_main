import { describe, expect, it, vi } from "vitest";
import type { ReplayRun } from "@shared/replay";
import type { PresentationDraft } from "@shared/presentation";
import { resolvePresentation } from "./presentation-source";

const draft: PresentationDraft = {
  runId: "op_live",
  status: "running",
  startedAt: 0,
  completed: 1,
  total: 2,
  slides: [],
  draft: true,
  kind: "replay",
  goal: "Log in",
  updatedAt: 5,
  durationMs: 5,
  unverifiedSteps: 1,
};

const finishedRun = {
  id: "run_local",
  status: "completed",
  startedAt: 0,
  completed: 1,
  total: 1,
  steps: [],
  events: [],
} as unknown as ReplayRun;

describe("resolvePresentation", () => {
  it("opens the background draft even while the operation is still running", async () => {
    await expect(resolvePresentation(async () => draft, finishedRun, [])).resolves.toBe(draft);
  });

  it("falls back to a finished local replay run when there is no draft", async () => {
    const presentation = await resolvePresentation(async () => null, finishedRun, []);
    expect(presentation.runId).toBe("run_local");
  });

  it("falls back to the local run when the draft request fails", async () => {
    const presentation = await resolvePresentation(vi.fn().mockRejectedValue(new Error("offline")), finishedRun, []);
    expect(presentation.runId).toBe("run_local");
  });

  it("reports the draft failure when there is no local run either", async () => {
    await expect(resolvePresentation(vi.fn().mockRejectedValue(new Error("offline")), null, [])).rejects.toThrow("offline");
  });

  it("says nothing has run when there is neither a draft nor a run", async () => {
    await expect(resolvePresentation(async () => null, null, [])).rejects.toThrow("No operation has run yet");
  });
});
