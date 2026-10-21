import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PhoneBridge, PhoneRecorder, phoneActionArgs, type AdbRun } from "./phone-bridge";

export function png(width = 1080, height = 1920) {
  const data = Buffer.alloc(32); Buffer.from("89504e470d0a1a0a", "hex").copy(data); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20); return data;
}
describe("real phone bridge", () => {
  it("rejects unauthorized devices and malformed screenshots", async () => {
    const bridge = new PhoneBridge(async args => args[0] === "devices" ? Buffer.from("List of devices attached\nphone unauthorized\n") : Buffer.from("not png"));
    await expect(bridge.requireDevice("phone")).rejects.toThrow("authorization");
    await expect(bridge.capture("phone")).rejects.toThrow("PNG");
    await expect(bridge.capture("-s;evil")).rejects.toThrow("device ID");
  });
  it("routes screenshots and bounded actions to the selected device", async () => {
    const run = vi.fn(async () => png());
    const bridge = new PhoneBridge(run);
    const frame = await bridge.capture("phone");
    expect(frame.width).toBe(1080);
    await bridge.execute("phone", { type: "tap", x: 1, y: 1 }, frame);
    expect(run).toHaveBeenLastCalledWith(["-s", "phone", "shell", "input", "tap", "1079", "1919"]);
    expect(() => phoneActionArgs({ type: "tap", x: 2, y: 0 }, 100, 100)).toThrow();
  });
  it("quotes remote shell text, preserving literal %s and rejecting unsupported unicode", () => {
    const args = phoneActionArgs({ type: "text", text: "a';$(reboot) %s" }, 100, 100);
    expect(args).toEqual(["shell", "input text 'a'\\'';$(reboot)%s' && input text '%' && input text 's'"]);
    expect(() => phoneActionArgs({ type: "text", text: "📱" }, 100, 100)).toThrow();
  });
});
describe("host-owned phone recording", () => {
  it("continues independently, rejects duplicates, stops and preserves downloadable segments", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "phone-record-test-"));
    let finish: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => finish());
    const run: AdbRun = async args => { if (args[2] === "pull") await writeFile(args[4], Buffer.alloc(64)); return Buffer.alloc(0); };
    const recorder = new PhoneRecorder(root, run, () => ({ done, stop }));
    try {
      const record = await recorder.begin("phone", 10);
      expect((await recorder.status(record.id)).state).toBe("recording");
      await expect(recorder.begin("phone", 1)).rejects.toThrow("active recording");
      await recorder.stop("phone");
      expect(stop).toHaveBeenCalledOnce();
      expect(await recorder.status(record.id)).toMatchObject({ state: "complete", segments: 1 });
      expect(await recorder.files(record.id)).toHaveLength(1);
      expect((await new PhoneRecorder(root).status(record.id)).state).toBe("complete");
      await expect(recorder.files("../etc")).rejects.toThrow("Invalid");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("reports hardware failures without fake recording success", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "phone-record-error-"));
    const recorder = new PhoneRecorder(root, async () => { throw new Error("device offline"); }, () => ({ done: Promise.reject(new Error("screenrecord denied")), stop: async () => {} }));
    try {
      const record = await recorder.begin("phone", 1);
      await vi.waitFor(async () => expect((await recorder.status(record.id)).state).toBe("failed"));
      expect(await recorder.status(record.id)).toMatchObject({ segments: 0, error: "screenrecord denied" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
