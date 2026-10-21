import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ReplayRequest, ReplayStep } from "../shared/replay";
import type { PhoneFrame, PhoneAction } from "../shared/phone";
import { PhoneBridge } from "./phone-bridge";

export interface ReplayAdapter {
  capture(): Promise<PhoneFrame>;
  execute(step: ReplayStep, frame: PhoneFrame): Promise<void>;
}
export function desktopOperation(payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON_CMD ||
        (process.platform === "win32" ? "python" : "python3"),
      [path.resolve("python-service/replay.py")],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      error = "",
      finished = false;
    const finish = (failure?: Error, value?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      failure ? reject(failure) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Desktop operation timed out; its effect is uncertain"));
    }, 15000);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (data) => {
      output += data;
      if (output.length > 24_000_000) {
        child.kill();
        finish(new Error("Desktop output too large"));
      }
    });
    child.stderr.on("data", (data) => {
      error = (error + data).slice(-2000);
    });
    child.once("error", (err) => finish(err));
    child.once("close", (code) => {
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.success !== true || result.simulated)
          throw new Error(result.error || error || "Desktop execution failed");
        finish(undefined, result);
      } catch (err) {
        finish(
          err instanceof Error ? err : new Error("Invalid desktop response"),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export function phoneReplayAction(
  step: ReplayStep,
  frame: PhoneFrame,
): PhoneAction {
  const x = step.x / (frame.width - 1),
    y = step.y / (frame.height - 1);
  if (step.action === "click") return { type: "tap", x, y };
  if (step.action === "type_text")
    return { type: "text", text: step.text || "" };
  if (step.action === "press_key")
    return { type: "key", key: (step.keyPayload || "").toUpperCase() as any };
  if (
    step.action === "scroll" &&
    ["up", "down"].includes(step.keyPayload || "")
  )
    return {
      type: "swipe",
      x: 0.5,
      y: step.keyPayload === "down" ? 0.8 : 0.2,
      endX: 0.5,
      endY: step.keyPayload === "down" ? 0.2 : 0.8,
      duration: 400,
    };
  throw new Error(
    `Android replay does not support ${step.action}; use tap, text, key, scroll or wait`,
  );
}
export function createReplayAdapter(
  request: Pick<ReplayRequest, "targetDevice" | "deviceId">,
): ReplayAdapter {
  if (request.targetDevice === "android") {
    const bridge = new PhoneBridge(),
      device = request.deviceId!;
    return {
      capture: async () => {
        await bridge.requireDevice(device);
        return bridge.capture(device);
      },
      execute: async (step, frame) => {
        if (step.action === "wait") {
          await new Promise((r) => setTimeout(r, step.delayMs));
          return;
        }
        await bridge.execute(device, phoneReplayAction(step, frame), frame);
      },
    };
  }
  return {
    capture: async () => {
      const result = await desktopOperation({ operation: "capture" });
      if (
        typeof result.image !== "string" ||
        !result.image.startsWith("data:image/png;base64,")
      )
        throw new Error("Desktop returned no PNG");
      const bytes = Buffer.from(result.image.split(",")[1], "base64");
      if (
        bytes.length < 24 ||
        bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      )
        throw new Error("Invalid screenshot");
      const width = bytes.readUInt32BE(16),
        height = bytes.readUInt32BE(20);
      if (width < 2 || height < 2 || width > 16384 || height > 16384)
        throw new Error("Invalid screenshot dimensions");
      return {
        image: result.image,
        width,
        height,
        hash: createHash("sha256").update(bytes).digest("hex"),
        capturedAt: Date.now(),
      };
    },
    execute: async (step) => {
      await desktopOperation({ operation: "execute", step });
    },
  };
}
