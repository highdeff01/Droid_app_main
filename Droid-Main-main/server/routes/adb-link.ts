import type { RequestHandler } from "express";
import { spawn } from "child_process";
import { failedOutcome, unavailableOutcome } from "../../shared/device-execution";
import { validateAdbEndpoint } from "../security";
import { validateDeviceId } from "../automation-adapters";
import { replyOnce, type Reply } from "./adb-capture";

export const ADB_CONNECT_TIMEOUT_MS = 8000;
export const ADB_DISCONNECT_TIMEOUT_MS = 4000;
export const ADB_PAIR_TIMEOUT_MS = 12000;

/** Exit status and output of a finished adb command. */
interface AdbResult {
  code: number | null;
  out: string;
  err: string;
}

/** Turns a finished adb run into the route's reply. */
type ResultMapper = (result: AdbResult) => Reply;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs adb once; missing adb, a crash or a timeout become an honest failure, never success. */
function runAdb(args: string[], timeoutMs: number, extra: Record<string, unknown>, done: (reply: Reply) => void, map: ResultMapper) {
  const unavailable = (reason: string): Reply => ({ status: 503, body: { ...unavailableOutcome(reason), ...extra, hasLocalAdb: false } });
  try {
    const adb = spawn("adb", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        adb.kill();
      } catch {}
      done({ status: 504, body: { ...failedOutcome(`adb ${args[0]} timed out after ${timeoutMs}ms.`), ...extra } });
    }, timeoutMs);
    adb.stdout.on("data", (d) => (out += d.toString()));
    adb.stderr.on("data", (d) => (err += d.toString()));
    adb.on("error", (e) => {
      clearTimeout(timer);
      done(unavailable(`adb is not available (${e.message}); install platform-tools and add it to PATH.`));
    });
    adb.on("close", (code) => {
      clearTimeout(timer);
      done(map({ code, out, err }));
    });
  } catch (e) {
    done(unavailable(`adb could not be started (${errorMessage(e)}).`));
  }
}

/** True only when adb exited cleanly and reported the link as connected. */
export function isAdbConnected({ code, out }: AdbResult): boolean {
  const text = out.toLowerCase();
  return code === 0 && /\bconnected\b/.test(text) && !/failed|cannot|unable/.test(text);
}

function connectReply(target: string): ResultMapper {
  return (result) => {
    const output = result.out.trim();
    if (isAdbConnected(result)) {
      return { status: 200, body: { success: true, simulated: false, output, target, hasLocalAdb: true } };
    }
    const reason = result.err.trim() || output || `adb connect exited with code ${result.code ?? "unknown"}.`;
    return { status: 502, body: { ...failedOutcome(reason), output, target, hasLocalAdb: true } };
  };
}

/** POST /api/adb/connect: success only for a link adb confirms; no virtual links. */
export const handleAdbConnect: RequestHandler = (req, res) => {
  const send = replyOnce(res);
  let target: string;
  try {
    target = validateAdbEndpoint(req.body?.ip, req.body?.port ?? 5555);
  } catch (error) {
    send({ status: 400, body: { success: false, error: error instanceof Error ? error.message : "Invalid endpoint" } });
    return;
  }
  runAdb(["connect", target], ADB_CONNECT_TIMEOUT_MS, { target }, send, connectReply(target));
};

/** True only when adb exited cleanly and reported the device as paired. */
export function isAdbPaired({ code, out }: AdbResult): boolean {
  const text = out.toLowerCase();
  return code === 0 && /successfully paired/.test(text) && !/failed|cannot|unable/.test(text);
}

function pairReply(target: string, onPaired: () => void): ResultMapper {
  return (result) => {
    const output = result.out.trim();
    if (isAdbPaired(result)) {
      onPaired();
      return { status: 200, body: { success: true, simulated: false, output, target, hasLocalAdb: true } };
    }
    const reason = result.err.trim() || output || `adb pair exited with code ${result.code ?? "unknown"}.`;
    return { status: 502, body: { ...failedOutcome(reason), output, target, hasLocalAdb: true } };
  };
}

/**
 * POST /api/adb/pair: success only when adb reports the pairing; the target is registered
 * only then. Missing adb is unavailable and a hang is failed, never a "verified" pairing.
 */
export function createAdbPairHandler(registered: Set<string>): RequestHandler {
  return (req, res) => {
    const send = replyOnce(res);
    const code = req.body?.code;
    if (typeof code !== "string" || !/^\d{4,8}$/.test(code)) {
      send({ status: 400, body: { success: false, error: "A 4-8 digit pairing code is required" } });
      return;
    }
    let target: string;
    try {
      target = validateAdbEndpoint(req.body?.ip, req.body?.port);
    } catch (error) {
      send({ status: 400, body: { success: false, error: error instanceof Error ? error.message : "Invalid endpoint" } });
      return;
    }
    runAdb(["pair", target, code], ADB_PAIR_TIMEOUT_MS, { target }, send, pairReply(target, () => registered.add(target)));
  };
}

function disconnectReply(label: string): ResultMapper {
  return ({ code, out, err }) => {
    if (code === 0) {
      return { status: 200, body: { success: true, simulated: false, output: out.trim() || `disconnected ${label}`, error: err.trim() || undefined } };
    }
    return { status: 502, body: { ...failedOutcome(err.trim() || out.trim() || `adb disconnect exited with code ${code ?? "unknown"}.`) } };
  };
}

/**
 * POST /api/adb/disconnect: forgets locally registered simulated targets, then asks adb.
 * Without adb the reply is unavailable, never a claimed disconnect.
 */
export function createAdbDisconnectHandler(simulated: Set<string>): RequestHandler {
  return (req, res) => {
    const send = replyOnce(res);
    const deviceId = req.body?.deviceId;
    let safeDeviceId: string | undefined;
    try {
      safeDeviceId = deviceId ? validateDeviceId(deviceId) : undefined;
    } catch (error) {
      send({ status: 400, body: { success: false, error: error instanceof Error ? error.message : "Invalid device ID" } });
      return;
    }
    if (safeDeviceId) simulated.delete(safeDeviceId);
    else simulated.clear();
    const args = safeDeviceId ? ["disconnect", safeDeviceId] : ["disconnect"];
    runAdb(args, ADB_DISCONNECT_TIMEOUT_MS, {}, send, disconnectReply(safeDeviceId || "all"));
  };
}
