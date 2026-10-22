import { toast } from "sonner";
import { describeDeviceOutcome } from "@shared/device-execution";
import { postDeviceAction } from "@/lib/gated-dispatch";

/**
 * POSTs a device action and tells the user what really happened: executed,
 * failed, or not executed because device automation is unavailable (simulated).
 * Returns the server reply so callers can branch on `success`.
 */
export async function reportDeviceAction(url: string, body: unknown, actionLabel: string): Promise<any> {
  try {
    const reply = await postDeviceAction(url, body);
    const { level, text } = describeDeviceOutcome(reply ?? {}, actionLabel);
    toast[level](text);
    return reply;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast.error(`${actionLabel} failed: ${message}`);
    return { success: false, executed: false, error: message };
  }
}
