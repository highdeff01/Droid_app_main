import { beforeEach, describe, expect, it } from "vitest";

const store = new Map<string, string>();
(globalThis as any).window = Object.assign(globalThis, { dispatchEvent: () => true });
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const { loadStoredWorkflowSteps } = await import("./drift-calibration");

describe("loadStoredWorkflowSteps", () => {
  beforeEach(() => store.clear());

  it("starts empty and seeds nothing when no recording exists", () => {
    expect(loadStoredWorkflowSteps()).toEqual([]);
    expect(store.size).toBe(0);
  });

  it("returns empty for corrupt or empty stored data", () => {
    store.set("unified_sequence", "{not json");
    expect(loadStoredWorkflowSteps()).toEqual([]);
    store.set("unified_sequence", "[]");
    expect(loadStoredWorkflowSteps()).toEqual([]);
  });

  it("returns only the user's recorded steps", () => {
    store.set("unified_sequence", JSON.stringify([{ id: "a", name: "Click OK", action: "click", x: 5, y: 6 }]));
    const steps = loadStoredWorkflowSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ id: "a", stepNumber: 1, x: 5, y: 6, originalX: 5, originalY: 6 });
  });
});
