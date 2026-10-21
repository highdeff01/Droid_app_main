import { execFile, spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, stat, writeFile, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { phoneActionSchema, type PhoneAction, type PhoneFrame, type PhoneRecording } from "../shared/phone";
import { validateDeviceId } from "./automation-adapters";

export type AdbRun = (args: string[], timeout?: number) => Promise<Buffer>;
export const runAdb: AdbRun = (args, timeout = 15000) => new Promise((resolve, reject) => {
  execFile("adb", args, { timeout, maxBuffer: 24 * 1024 * 1024, encoding: "buffer", windowsHide: true }, (error, stdout, stderr) => {
    if (error) reject(new Error(stderr?.toString().trim() || error.message));
    else resolve(stdout);
  });
});

// ADB joins shell arguments on the remote device. Quote there as well as avoiding a host shell.
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
export function phoneActionArgs(action: PhoneAction, width: number, height: number): string[] {
  const a = phoneActionSchema.parse(action);
  const x = (n: number) => String(Math.round(n * (width - 1)));
  const y = (n: number) => String(Math.round(n * (height - 1)));
  if (a.type === "tap") return ["shell", "input", "tap", x(a.x), y(a.y)];
  if (a.type === "swipe") return ["shell", "input", "swipe", x(a.x), y(a.y), x(a.endX), y(a.endY), String(a.duration)];
  // Android's input tool treats %s as a space. Send literal percent separately.
  if (a.type === "text") return ["shell", a.text.split(/(%)/).filter(Boolean).map(part => `input text ${quote(part.replace(/ /g, "%s"))}`).join(" && ")];
  return ["shell", "input", "keyevent", `KEYCODE_${a.key}`];
}

export class PhoneBridge {
  constructor(readonly run: AdbRun = runAdb) {}
  async devices() {
    return (await this.run(["devices", "-l"])).toString().split(/\r?\n/).slice(1).filter(Boolean).map(line => {
      const [id, state, ...detail] = line.trim().split(/\s+/);
      return { id, state, detail: detail.join(" ") };
    }).filter(device => device.id && device.state);
  }
  async requireDevice(id: string) {
    validateDeviceId(id);
    if (!(await this.devices()).some(device => device.id === id && device.state === "device")) throw new Error("Device is disconnected, offline, or awaiting USB debugging authorization");
  }
  async capture(id: string): Promise<PhoneFrame> {
    validateDeviceId(id);
    const bytes = await this.run(["-s", id, "exec-out", "screencap", "-p"]);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Device did not return a PNG screenshot");
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 16384 || height > 16384) throw new Error("Invalid screenshot dimensions");
    return { image: `data:image/png;base64,${bytes.toString("base64")}`, width, height, hash: createHash("sha256").update(bytes).digest("hex"), capturedAt: Date.now() };
  }
  async execute(id: string, action: PhoneAction, frame: PhoneFrame) {
    validateDeviceId(id);
    await this.run(["-s", id, ...phoneActionArgs(action, frame.width, frame.height)]);
  }
}

export interface RecordingProcess { done: Promise<void>; stop: () => Promise<void> }
export type StartRecording = (device: string, remote: string) => RecordingProcess;
export const startAdbRecording: StartRecording = (device, remote) => {
  const child = spawn("adb", ["-s", validateDeviceId(device), "shell", `screenrecord --time-limit 180 ${quote(remote)} & p=$!; echo $p; wait $p`], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "", error = "", stopped = false, closed = false;
  let resolvePid: (pid: string) => void, rejectPid: (error: Error) => void;
  const pid = new Promise<string>((resolve, reject) => { resolvePid = resolve; rejectPid = reject; });
  // Attach a handler immediately, including when a recording fails before Stop is pressed.
  void pid.catch(() => {});
  child.stdout.on("data", chunk => {
    output += chunk.toString();
    const match = output.match(/^(\d+)\r?\n/);
    if (match && Number(match[1]) > 1) resolvePid(match[1]);
  });
  child.stderr.on("data", chunk => { error = (error + chunk.toString()).slice(-4000); });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", err => { rejectPid(err); reject(err); });
    child.once("close", code => {
      closed = true;
      rejectPid(new Error("Recording process exited before reporting its PID"));
      if (code === 0 || (stopped && (code === 130 || code === 2))) resolve();
      else reject(new Error(error || `screenrecord exited with ${code}`));
    });
  });
  // A broken ADB connection must not leave the host process alive forever.
  const watchdog = setTimeout(() => child.kill(), 205000);
  watchdog.unref();
  void done.finally(() => clearTimeout(watchdog)).catch(() => {});
  return { done, stop: async () => {
    if (closed) return;
    const remotePid = await Promise.race([pid, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("No recording PID received")), 5000); timer.unref(); })]);
    if (closed) return;
    stopped = true;
    // Only signal the screenrecord process started by this operation.
    await runAdb(["-s", device, "shell", `if [ "$(cat /proc/${remotePid}/comm 2>/dev/null)" = screenrecord ]; then kill -2 ${remotePid}; fi`]);
  } };
};

interface RunningRecording { record: PhoneRecording; process?: RecordingProcess; stop: boolean; done: Promise<void> }
export class PhoneRecorder {
  private active = new Map<string, RunningRecording>();
  constructor(readonly root: string, readonly run: AdbRun = runAdb, readonly start: StartRecording = startAdbRecording) {}
  private directory(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid recording ID");
    return path.join(this.root, id);
  }
  private async save(record: PhoneRecording) {
    await writeFile(path.join(this.directory(record.id), "recording.json"), JSON.stringify(record), { mode: 0o600 });
  }
  async begin(device: string, minutes: number): Promise<PhoneRecording> {
    validateDeviceId(device);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error("Recording limit must be 1–60 minutes");
    if (this.active.has(device)) throw new Error("This phone already has an active recording");
    const record: PhoneRecording = { id: randomUUID(), state: "recording", startedAt: Date.now(), segments: 0 };
    const running: RunningRecording = { record, stop: false, done: Promise.resolve() };
    this.active.set(device, running);
    try {
      await mkdir(this.directory(record.id), { recursive: true, mode: 0o700 });
      await this.save(record);
    } catch (error) { this.active.delete(device); throw error; }
    const timer = setTimeout(() => { void this.stop(device).catch(() => {}); }, minutes * 60000);
    timer.unref();
    running.done = this.loop(device, running).finally(() => { clearTimeout(timer); this.active.delete(device); });
    void running.done.catch(() => {});
    return { ...record };
  }
  private async loop(device: string, running: RunningRecording) {
    const record = running.record;
    try {
      while (!running.stop) {
        const name = `part-${String(record.segments + 1).padStart(3, "0")}.mp4`;
        const remote = `/sdcard/droid-${record.id}-${name}`;
        running.process = this.start(device, remote);
        let processError: unknown;
        try { await running.process.done; } catch (error) { processError = error; }
        running.process = undefined;
        const local = path.join(this.directory(record.id), name);
        // Even on disconnect/failure, try to recover a finalized segment.
        try {
          await this.run(["-s", device, "pull", remote, local], 60000);
          if ((await stat(local)).size < 32) throw new Error("Phone returned an empty recording");
          record.segments++;
          await this.save(record);
          await this.run(["-s", device, "shell", "rm", remote]);
        } catch (error) { await rm(local, { force: true }); throw processError || error; }
        if (processError) throw processError;
      }
      record.state = "complete";
    } catch (error) { record.state = "failed"; record.error = error instanceof Error ? error.message : String(error); }
    finally { record.stoppedAt = Date.now(); await this.save(record); }
  }
  async stop(device: string) {
    const running = this.active.get(device);
    if (!running) return;
    running.stop = true;
    running.record.state = "stopping";
    await this.save(running.record);
    if (running.process) await running.process.stop();
    await running.done;
  }
  async status(id: string): Promise<PhoneRecording> {
    const live = [...this.active.values()].find(item => item.record.id === id);
    if (live) return { ...live.record };
    const record: PhoneRecording = JSON.parse(await readFile(path.join(this.directory(id), "recording.json"), "utf8"));
    if (record.state === "recording" || record.state === "stopping") return { ...record, state: "failed", error: "Server restarted during recording; completed segments remain available" };
    return record;
  }
  async files(id: string) {
    const dir = this.directory(id);
    return (await readdir(dir)).filter(name => /^part-\d+\.mp4$/.test(name)).sort().map(name => ({ name, path: path.join(dir, name) }));
  }
}
