import {
  addFlowVersion,
  confirmBestVersion,
  type BestFlow,
  type GoalStep,
  type RunEvidence,
} from "../shared/goal-loop";
import { DurableStore, type StorageOptions } from "./durable-store";

const COLLECTION = "best-flows";

const createId = () =>
  `flow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export interface SaveRunInput {
  flowId?: string;
  name: string;
  goal: string;
  steps: GoalStep[];
  evidence: RunEvidence;
}

/** Durable store of goal workflows and their verified versions. */
export class BestFlowRepository {
  private readonly store: DurableStore;

  constructor(options: StorageOptions = {}) {
    this.store = new DurableStore(options);
  }

  list(): BestFlow[] {
    return this.store.readCollection<BestFlow>(COLLECTION);
  }

  get(id: string): BestFlow | undefined {
    return this.list().find((flow) => flow.id === id);
  }

  /**
   * Saves a verified run as a new version of `flowId` (or of a new flow).
   * The first version of a flow with no confirmed best is a candidate only;
   * confirmation is a separate, explicit step.
   */
  saveRun(input: SaveRunInput): BestFlow {
    const flows = this.store.readCollectionForWrite<BestFlow>(COLLECTION);
    const existing = input.flowId
      ? flows.find((flow) => flow.id === input.flowId)
      : undefined;
    if (input.flowId && !existing) throw new Error("Flow not found");
    if (existing && existing.goal !== input.goal) {
      throw new Error("A version must serve the flow's original goal");
    }
    const base: BestFlow = existing ?? {
      id: createId(),
      name: input.name,
      goal: input.goal,
      versions: [],
      updatedAt: Date.now(),
    };
    const saved = addFlowVersion(base, input.steps, input.evidence);
    this.write(flows, saved);
    return saved;
  }

  confirm(id: string, version: number, approvedReplace: boolean): BestFlow {
    const flows = this.store.readCollectionForWrite<BestFlow>(COLLECTION);
    const flow = flows.find((f) => f.id === id);
    if (!flow) throw new Error("Flow not found");
    const confirmed = confirmBestVersion(flow, version, approvedReplace);
    this.write(flows, confirmed);
    return confirmed;
  }

  private write(flows: BestFlow[], flow: BestFlow) {
    const others = flows.filter((f) => f.id !== flow.id);
    this.store.writeCollection(COLLECTION, [flow, ...others]);
  }
}

export const bestFlowRepository = new BestFlowRepository();
