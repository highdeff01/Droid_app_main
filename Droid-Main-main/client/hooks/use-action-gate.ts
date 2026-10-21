import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  runGatedSequence,
  type GatedAction,
  type GatedRunResult,
} from "@/lib/gated-dispatch";

export interface ActionGateDevice {
  targetDevice: string;
  deviceId?: string;
  apiKey?: string;
}

/**
 * Gate AI/replay-driven device actions on a fresh, verified screen analysis.
 * One run at a time: a second run while one is pending is rejected, not queued.
 * `stop()` and unmount abort the in-flight capture/analysis so nothing is dispatched.
 */
export function useActionGate(device: ActionGateDevice) {
  const controllerRef = useRef<AbortController | null>(null);
  const [isGating, setIsGating] = useState(false);

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return false;
    controller.abort();
    toast.info("Pending action cancelled before dispatch.");
    return true;
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = async (
    actions: GatedAction[],
  ): Promise<GatedRunResult | undefined> => {
    if (controllerRef.current) {
      toast.info("An action is already being verified or running. Press Stop to cancel it.");
      return undefined;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsGating(true);
    try {
      const result = await runGatedSequence(actions, {
        ...device,
        signal: controller.signal,
      });
      if (result.status === "blocked") toast.error(`Action blocked: ${result.reason}`);
      return result;
    } finally {
      controllerRef.current = null;
      setIsGating(false);
    }
  };

  return { run, stop, isGating };
}
