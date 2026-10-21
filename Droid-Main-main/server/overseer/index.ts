import { centralLogHub } from "../log-hub";
import { createVisionAnalyzer } from "./analyzer";
import { operationBus } from "./operation-bus";
import { OverseerSupervisor } from "./supervisor";

/**
 * Builds the app's overseer: verdicts and interventions go to centralLogHub (source
 * "Overseer"), and every executor publishing on the operation bus is supervised.
 */
export function createOverseer(capture: () => Promise<string | null>): OverseerSupervisor {
  const supervisor = new OverseerSupervisor({
    analyzer: createVisionAnalyzer(),
    capture,
    audit: (level, message, metadata) => centralLogHub.addLog("Overseer", level, message, metadata),
  });
  operationBus.subscribe((event) => supervisor.handleBusEvent(event));
  return supervisor;
}
