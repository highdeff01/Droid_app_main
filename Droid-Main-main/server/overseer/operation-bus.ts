import type {
  FinishedStatus,
  OperationRegistrationInput,
  OperationStepReport,
} from "../../shared/overseer";

/** Hooks an engine hands the overseer so it can pause/stop and capture that operation's own screen. */
export interface OperationControl {
  pause?: () => void;
  resume?: () => void;
  cancel?: () => void;
  /** Fresh capture of the device this operation drives (data URL); null when none is available. */
  capture?: () => Promise<string | null>;
}

export type OperationBusEvent =
  | { type: "started"; input: OperationRegistrationInput & { id: string }; control?: OperationControl }
  | { type: "step"; operationId: string; report: OperationStepReport }
  | { type: "finished"; operationId: string; status: FinishedStatus; detail?: string };

type Listener = (event: OperationBusEvent) => void;

const listeners: Listener[] = [];

function emit(event: OperationBusEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Operation bus listener failed:", error);
    }
  }
}

/**
 * Dependency-free channel the executors (replay engine, assistant executions, trigger
 * engine) publish to, so the overseer can supervise them without the engines importing it.
 */
export const operationBus = {
  started(input: OperationRegistrationInput & { id: string }, control?: OperationControl) {
    emit({ type: "started", input, control });
  },
  step(operationId: string, report: OperationStepReport) {
    emit({ type: "step", operationId, report });
  },
  finished(operationId: string, status: FinishedStatus, detail?: string) {
    emit({ type: "finished", operationId, status, detail });
  },
  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  },
};
