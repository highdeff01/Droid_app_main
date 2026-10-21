import { describe, expect, it, vi } from "vitest";
import { operationBus, type OperationBusEvent } from "./operation-bus";
import { createOverseer } from "./index";
import { centralLogHub } from "../log-hub";

describe("operationBus", () => {
  it("delivers started, step and finished events until unsubscribed", () => {
    const seen: OperationBusEvent["type"][] = [];
    const unsubscribe = operationBus.subscribe((event) => seen.push(event.type));
    operationBus.started({ id: "bus_1", kind: "replay", source: "t", goal: "g" });
    operationBus.step("bus_1", { stepId: "s", name: "n", action: "click" });
    operationBus.finished("bus_1", "completed");
    unsubscribe();
    operationBus.finished("bus_1", "failed");
    expect(seen).toEqual(["started", "step", "finished"]);
  });

  it("keeps notifying other listeners when one throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const good = vi.fn();
    const offBad = operationBus.subscribe(() => {
      throw new Error("boom");
    });
    const offGood = operationBus.subscribe(good);
    operationBus.finished("bus_2", "cancelled");
    offBad();
    offGood();
    expect(good).toHaveBeenCalledWith({ type: "finished", operationId: "bus_2", status: "cancelled", detail: undefined });
    error.mockRestore();
  });
});

describe("createOverseer", () => {
  it("supervises operations published on the bus and audits to the central log hub", () => {
    const supervisor = createOverseer(async () => null);
    operationBus.started({ id: "bus_op", kind: "trigger_action", source: "trigger-engine", goal: "Notify me" });
    expect(supervisor.get("bus_op")).toMatchObject({ kind: "trigger_action", status: "running" });
    operationBus.finished("bus_op", "completed");
    expect(supervisor.get("bus_op")!.status).toBe("completed");
    const messages = centralLogHub.getLogs(20, "Overseer").map((e) => e.message);
    expect(messages.some((m) => m.includes('Supervising trigger_action "Notify me"'))).toBe(true);
  });
});
