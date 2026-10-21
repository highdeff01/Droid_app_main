import { dispatchActionToPython } from "./routes/dual-ai-pipeline";
import { queueMobileAction } from "./routes/mobile-stream";
import type { ChildProcess } from "child_process";

export interface DeviceExecutorOpts {
  targetDevice: "desktop" | "android" | "universal";
  deviceId?: string;
  sourceId?: string;
}

export interface DeviceExecutorHandle {
  execute: (action: any) => Promise<{ actionType: string; success: boolean; message: string; data?: any }>;
  executor: (action: any) => Promise<{ actionType: string; success: boolean; message: string; data?: any }>;
  abort: () => void;
}

export function createDeviceExecutorHandle(opts: DeviceExecutorOpts): DeviceExecutorHandle {
  let activeProcess: ChildProcess | null = null;
  let isAborted = false;

  const executeFn = async (action: any) => {
    const actType = action?.type || "action";
    if (isAborted) {
      return { actionType: actType, success: false, message: "Action aborted by user" };
    }
    try {
      if (opts.targetDevice === "android") {
        const item = queueMobileAction({
          ...action,
          deviceId: opts.deviceId,
        });
        return {
          actionType: actType,
          success: true,
          message: `Queued ${actType} on Android device (${opts.deviceId || "default"})`,
          data: item,
        };
      } else {
        const res = await dispatchActionToPython(action);
        const success = res?.success ?? true;
        const message = success
          ? (res?.explanation || res?.message || `Executed ${actType} on Desktop`)
          : (res?.error || res?.message || `Failed to execute ${actType} on Desktop`);
        return {
          actionType: actType,
          success,
          message,
          data: res,
        };
      }
    } catch (err: any) {
      return {
        actionType: actType,
        success: false,
        message: err?.message || String(err),
      };
    }
  };

  return {
    execute: executeFn,
    executor: executeFn,
    abort: () => {
      isAborted = true;
      if (activeProcess) {
        try {
          activeProcess.kill("SIGTERM");
        } catch {}
      }
    },
  };
}
