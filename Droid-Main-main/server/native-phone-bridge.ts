import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PhoneAction, PhoneFrame, PhoneRecording } from "../shared/phone";

export const nativeRecordingSchema = z.object({
  id: z.string().uuid(), state: z.enum(["recording", "stopping", "complete", "failed"]),
  startedAt: z.number().finite().positive(), stoppedAt: z.number().finite().positive().optional(),
  segments: z.number().int().min(0).max(1), error: z.string().max(1000).optional(),
  storage: z.literal("phone"),
});
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
interface PendingCommand {
  command: { id: string; type: string; action?: PhoneAction; minutes?: number; expires: number };
  delivered: boolean; timer: ReturnType<typeof setTimeout>;
  resolve: (result: unknown) => void; reject: (error: Error) => void;
}
interface NativeDevice {
  id: string; name: string; pairing?: string; pairingExpires: number; credential?: string;
  expires: number; lastSeen: number; controlEnabled: boolean; frame?: PhoneFrame;
  records: PhoneRecording[]; pending: Map<string, PendingCommand>;
}

/** Each phone has separate, revocable upload credentials and a one-use QR invitation. */
export class NativePhoneBridge {
  private devices = new Map<string, NativeDevice>();
  create(expires: number) {
    this.prune();
    if (this.devices.size >= 32) throw new Error("Too many native phones; disconnect an existing phone first");
    const id = `native-${randomUUID()}`, pairing = randomBytes(32).toString("base64url");
    this.devices.set(id, { id, name: "Waiting for Android app", pairing: digest(pairing), pairingExpires: Date.now() + 300000,
      expires, lastSeen: 0, controlEnabled: false, records: [], pending: new Map() });
    return { id, pairing };
  }
  private prune() {
    for (const [id, device] of this.devices) if (device.expires <= Date.now()) this.revoke(id);
  }
  has(id: string) { return this.devices.has(id); }
  register(pairing: string, name: string) {
    this.prune();
    const device = [...this.devices.values()].find(d => d.pairing === digest(pairing) && d.pairingExpires > Date.now());
    if (!device) throw new Error("QR invitation expired or already used. Create a new QR on the desktop.");
    const token = randomBytes(32).toString("base64url");
    device.pairing = undefined; device.credential = digest(token); device.name = name; device.lastSeen = Date.now();
    return { token, device: device.id, expires: device.expires };
  }
  authenticate(token: string) {
    this.prune();
    if (!token) return undefined;
    return [...this.devices.values()].find(d => d.credential === digest(token));
  }
  list() {
    this.prune();
    return [...this.devices.values()].map(d => ({ id: d.id, state: Date.now() - d.lastSeen < 15000 ? "device" : "offline", detail: d.name }));
  }
  info(id: string) {
    const d = this.devices.get(id);
    return d && { online: Date.now() - d.lastSeen < 15000, controlEnabled: d.controlEnabled, name: d.name, storage: "phone" };
  }
  heartbeat(id: string, controlEnabled: boolean, records: PhoneRecording[]) {
    const d = this.devices.get(id);
    if (!d) throw new Error("Phone disconnected");
    d.lastSeen = Date.now(); d.controlEnabled = controlEnabled;
    d.records = records.slice(-50);
    const command = [...d.pending.values()].find(p => !p.delivered);
    if (!command) return null;
    command.delivered = true; // Never deliver the same gesture twice after a lost acknowledgment.
    return { ...command.command, ttlMs: Math.max(0, command.command.expires - Date.now()) };
  }
  upload(id: string, bytes: Buffer) {
    const d = this.devices.get(id);
    if (!d) throw new Error("Phone disconnected");
    if (bytes.length < 24 || bytes.length > 8000000 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw new Error("Expected a PNG screenshot");
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error("Invalid screenshot dimensions");
    d.frame = { image: `data:image/png;base64,${bytes.toString("base64")}`, width, height, hash: digest(bytes.toString("base64")), capturedAt: Date.now() };
    d.lastSeen = Date.now();
  }
  async capture(id: string): Promise<PhoneFrame> {
    const d = this.devices.get(id);
    if (!d?.frame || Date.now() - d.frame.capturedAt > 5000) throw new Error("No fresh phone screen. Enable Sightline accessibility and screen sharing in the Android app.");
    return { ...d.frame };
  }
  async command(id: string, type: string, extra: { action?: PhoneAction; minutes?: number } = {}) {
    const d = this.devices.get(id);
    if (!d || Date.now() - d.lastSeen > 15000) throw new Error("Android app is offline");
    if (type === "action" && !d.controlEnabled) throw new Error("Enable Sightline accessibility on the phone to allow control");
    if (d.pending.size) throw new Error("Phone has an operation awaiting acknowledgment");
    return new Promise<unknown>((resolve, reject) => {
      const command = { id: randomUUID(), type, ...extra, expires: Date.now() + 12000 };
      const timer = setTimeout(() => { d.pending.delete(command.id); reject(new Error("Phone did not confirm the operation. Check the phone before retrying.")); }, 12000);
      timer.unref();
      d.pending.set(command.id, { command, delivered: false, timer, resolve, reject });
    });
  }
  acknowledge(id: string, commandId: string, success: boolean, error?: string, result?: unknown) {
    const d = this.devices.get(id), p = d?.pending.get(commandId);
    if (!p || !p.delivered) return false;
    clearTimeout(p.timer); d.pending.delete(commandId);
    if (success) p.resolve(result); else p.reject(new Error(error || "Android rejected the operation"));
    return true;
  }
  recordings(id: string) { return this.devices.get(id)?.records.map(r => ({ ...r })) || []; }
  revoke(id: string) {
    const d = this.devices.get(id);
    for (const p of d?.pending.values() || []) { clearTimeout(p.timer); p.reject(new Error("Phone connection revoked")); }
    this.devices.delete(id);
  }
}
