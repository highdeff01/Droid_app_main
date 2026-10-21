import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePhoneBridge } from "./native-phone-bridge";
function png() { const bytes = Buffer.alloc(32); Buffer.from("89504e470d0a1a0a", "hex").copy(bytes); bytes.writeUInt32BE(1080, 16); bytes.writeUInt32BE(1920, 20); return bytes; }

afterEach(() => vi.useRealTimers());
describe("native phone transport", () => {
  it("uses separate credentials, consumes pairing once and expires stale frames", async () => {
    vi.useFakeTimers();
    const bridge = new NativePhoneBridge();
    const invitation = bridge.create(Date.now() + 3600000);
    expect(bridge.authenticate(invitation.pairing)).toBeUndefined();
    const phone = bridge.register(invitation.pairing, "Test Android");
    expect(() => bridge.register(invitation.pairing, "Other")).toThrow("already used");
    expect(bridge.authenticate(phone.token)?.id).toBe(invitation.id);
    bridge.upload(invitation.id, png());
    expect((await bridge.capture(invitation.id)).width).toBe(1080);
    await vi.advanceTimersByTimeAsync(5001);
    await expect(bridge.capture(invitation.id)).rejects.toThrow("fresh");
    bridge.revoke(invitation.id);
    expect(bridge.authenticate(phone.token)).toBeUndefined();
  });
  it("waits for a real acknowledgment, never repeats delivered actions and reports timeouts", async () => {
    vi.useFakeTimers();
    const bridge = new NativePhoneBridge(), invitation = bridge.create(Date.now() + 3600000);
    bridge.register(invitation.pairing, "Test");
    await expect(bridge.command(invitation.id, "action", { action: { type: "key", key: "HOME" } })).rejects.toThrow("accessibility");
    bridge.heartbeat(invitation.id, true, []);
    const work = bridge.command(invitation.id, "action", { action: { type: "tap", x: .5, y: .5 } });
    const command = bridge.heartbeat(invitation.id, true, []);
    expect(command?.type).toBe("action");
    expect(bridge.heartbeat(invitation.id, true, [])).toBeNull();
    expect(bridge.acknowledge(invitation.id, command!.id, false, "Gesture cancelled")).toBe(true);
    await expect(work).rejects.toThrow("Gesture cancelled");
    const next = bridge.command(invitation.id, "record-start", { minutes: 1 });
    const timeout = expect(next).rejects.toThrow("did not confirm");
    await vi.advanceTimersByTimeAsync(12000); await timeout;
    expect(bridge.heartbeat(invitation.id, true, [])).toBeNull();
  });
  it("rejects malformed frame uploads and bounds native invitations", () => {
    const bridge = new NativePhoneBridge(), invitation = bridge.create(Date.now() + 3600000);
    expect(() => bridge.upload(invitation.id, Buffer.from("not PNG"))).toThrow("PNG");
    for (let i = 1; i < 32; i++) bridge.create(Date.now() + 3600000);
    expect(() => bridge.create(Date.now() + 3600000)).toThrow("Too many");
  });
});
