import type { RequestHandler, Response } from "express";
import { spawn } from "child_process";
import { failedOutcome, unavailableOutcome } from "../../shared/device-execution";
import { validateDeviceId } from "../automation-adapters";

export const ADB_DEVICES_TIMEOUT_MS = 4000;
export const ADB_CAPTURE_TIMEOUT_MS = 8000;

/** Reads the latest real synced phone frame, or null when none exists. */
export type RealFrameReader = () => string | null | undefined;

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** Calls res.json at most once, so `error`, `close` and the timeout cannot double-respond. */
export function replyOnce(res: Response) {
  let responded = false;
  return (reply: Reply) => {
    if (responded) return false;
    responded = true;
    res.status(reply.status).json(reply.body);
    return true;
  };
}

/** Device serials in the `device` state from `adb devices` output. */
export function parseAdbDevices(out: string): string[] {
  return out
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split("\t"))
    .filter((parts) => parts.length === 2 && parts[1] === "device")
    .map((parts) => parts[0]);
}

function devicesUnavailable(reason: string): Reply {
  return { status: 503, body: { ...unavailableOutcome(reason), devices: [], hasLocalAdb: false } };
}

/** Runs `adb devices` and hands one honest reply per outcome to `done` (callers guard it with replyOnce). */
function listAdbDevices(done: (reply: Reply) => void): void {
  try {
    const adb = spawn("adb", ["devices"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        adb.kill();
      } catch {}
      done(devicesUnavailable(`adb devices timed out after ${ADB_DEVICES_TIMEOUT_MS}ms.`));
    }, ADB_DEVICES_TIMEOUT_MS);
    adb.stdout.on("data", (d) => (out += d.toString()));
    adb.stderr.on("data", (d) => (err += d.toString()));
    adb.on("error", (e) => {
      clearTimeout(timer);
      done(devicesUnavailable(`adb is not available (${e.message}); install platform-tools and add it to PATH.`));
    });
    adb.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        done({
          status: 500,
          body: { ...failedOutcome(err.trim() || `adb devices exited with code ${code ?? "unknown"}.`), devices: [], hasLocalAdb: true },
        });
        return;
      }
      done({ status: 200, body: { success: true, devices: parseAdbDevices(out), raw: out.trim(), hasLocalAdb: true } });
    });
  } catch (e) {
    done(devicesUnavailable(`adb could not be started (${e instanceof Error ? e.message : String(e)}).`));
  }
}

/** GET /api/adb/devices: only devices adb actually reports; never a fabricated entry. */
export const handleAdbDevices: RequestHandler = (_req, res) => {
  listAdbDevices(replyOnce(res));
};

export const ADB_SCAN_HINT = "For WiFi: enable Wireless Debugging";

/** Reads the targets registered locally without a confirmed adb link. */
export type SimulatedDeviceReader = () => Iterable<string>;

/** Locally registered targets adb does not report, each explicitly marked simulated. */
function simulatedEntries(reply: Reply, simulated: Iterable<string>) {
  const real = (reply.body.devices as string[] | undefined) ?? [];
  return Array.from(simulated)
    .filter((id) => !real.includes(id))
    .map((id) => ({ id, simulated: true }));
}

/** GET /api/adb/scan: the real device list (empty when none), simulated targets kept apart and labelled. */
export function createAdbScanHandler(readSimulated: SimulatedDeviceReader): RequestHandler {
  return (_req, res) => {
    const send = replyOnce(res);
    listAdbDevices((reply) => {
      const body = { ...reply.body, simulatedDevices: simulatedEntries(reply, readSimulated()), hint: ADB_SCAN_HINT };
      send({ status: reply.status, body });
    });
  };
}

/** True for the generic phone ids the live mobile stream stands in for. */
function isGenericPhoneId(deviceId?: string): boolean {
  return !deviceId || ["virtual", "WiFi", "Phone", "Mobile"].some((tag) => deviceId.includes(tag));
}

function liveStreamReply(imageData: string, extra: Record<string, unknown> = {}): Reply {
  return { status: 200, body: { success: true, imageData, source: "mobile_live_stream", ...extra } };
}

/** No adb frame: the real synced frame labelled as the live stream, else an honest standby. */
function noCaptureReply(reason: string, realFrame: string | null | undefined): Reply {
  if (realFrame) return liveStreamReply(realFrame, { isRealDevice: false, adbError: reason });
  return {
    status: 503,
    body: {
      success: false,
      status: "standby",
      imageData: null,
      message: "No live phone frame: connect a device over adb or start the mobile stream.",
      error: reason,
    },
  };
}

function captureArgs(deviceId?: string): string[] {
  const args: string[] = [];
  if (deviceId && !deviceId.includes("virtual") && !deviceId.includes("WiFi Phone")) {
    args.push("-s", validateDeviceId(deviceId));
  }
  return [...args, "exec-out", "screencap", "-p"];
}

/** GET /api/adb/capture: a real adb screencap or the real synced frame; never a synthetic image. */
export function createAdbCaptureHandler(readRealFrame: RealFrameReader): RequestHandler {
  return (req, res) => {
    const send = replyOnce(res);
    const deviceId = req.query.deviceId as string | undefined;
    const realFrame = readRealFrame();
    if (realFrame && isGenericPhoneId(deviceId)) {
      send(liveStreamReply(realFrame, { isRealDevice: true }));
      return;
    }
    let args: string[];
    try {
      args = captureArgs(deviceId);
    } catch (error) {
      send({ status: 400, body: { success: false, imageData: null, error: error instanceof Error ? error.message : "Invalid device ID" } });
      return;
    }
    try {
      const adb = spawn("adb", args, { stdio: ["pipe", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      let err = "";
      const timer = setTimeout(() => {
        try {
          adb.kill();
        } catch {}
        send(noCaptureReply(`adb screencap timed out after ${ADB_CAPTURE_TIMEOUT_MS}ms.`, realFrame));
      }, ADB_CAPTURE_TIMEOUT_MS);
      adb.stdout.on("data", (d) => chunks.push(d as Buffer));
      adb.stderr.on("data", (d) => (err += d.toString()));
      adb.on("error", (e) => {
        clearTimeout(timer);
        send(noCaptureReply(`adb is not available (${e.message}).`, realFrame));
      });
      adb.on("close", (code) => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        if (code === 0 && buf.length > 0) {
          send({ status: 200, body: { success: true, imageData: "data:image/png;base64," + buf.toString("base64"), isRealDevice: true, source: "adb_screencap" } });
          return;
        }
        send(noCaptureReply(err.trim() || `adb screencap returned no image (exit code ${code ?? "unknown"}).`, realFrame));
      });
    } catch (e) {
      send(noCaptureReply(`adb could not be started (${e instanceof Error ? e.message : String(e)}).`, realFrame));
    }
  };
}
