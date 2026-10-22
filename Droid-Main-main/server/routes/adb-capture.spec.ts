import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Behaviour =
  | { kind: "error" }
  | { kind: "close"; stdout?: string | Buffer; stderr?: string; code: number }
  | { kind: "hang" }
  | { kind: "throw" };
let behaviour: Behaviour;

function fakeChild() {
  if (behaviour.kind === "throw") throw new Error("spawn exploded");
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  const b = behaviour;
  setTimeout(() => {
    if (b.kind === "error") {
      child.emit("error", new Error("spawn adb ENOENT"));
      child.emit("close", -2);
    } else if (b.kind === "close") {
      if (b.stdout) child.stdout.emit("data", Buffer.from(b.stdout));
      if (b.stderr) child.stderr.emit("data", Buffer.from(b.stderr));
      child.emit("close", b.code);
    }
  }, 0);
  return child;
}

vi.mock("child_process", () => ({ spawn: vi.fn(() => fakeChild()) }));

import {
  ADB_CAPTURE_TIMEOUT_MS,
  ADB_DEVICES_TIMEOUT_MS,
  ADB_SCAN_HINT,
  createAdbCaptureHandler,
  createAdbScanHandler,
  handleAdbDevices,
  parseAdbDevices,
} from "./adb-capture";

const REAL_FRAME = "data:image/jpeg;base64,REALFRAME";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    calls: 0,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.calls += 1;
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function run(handler: any, query: Record<string, string> = {}) {
  const res = makeRes();
  handler({ query } as any, res, () => {});
  await vi.waitFor(() => expect(res.body).toBeDefined());
  await new Promise((r) => setTimeout(r, 5));
  return res;
}

function expectNoFabricatedDevice(res: any) {
  expect(res.body.success).toBe(false);
  expect(res.body.devices).toEqual([]);
  expect(JSON.stringify(res.body)).not.toMatch(/emulator-5554|virtual/);
  expect(res.calls).toBe(1);
}

function expectStandbyWithoutImage(res: any) {
  expect(res.statusCode).toBe(503);
  expect(res.body).toMatchObject({ success: false, status: "standby", imageData: null });
  expect(JSON.stringify(res.body)).not.toContain("image/svg+xml");
  expect(res.calls).toBe(1);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseAdbDevices", () => {
  it("keeps only devices in the device state", () => {
    const out = "List of devices attached\nR58M123\tdevice\n192.168.0.9:5555\toffline\nZX1\tunauthorized\n";
    expect(parseAdbDevices(out)).toEqual(["R58M123"]);
  });
});

describe("GET /api/adb/devices", () => {
  it("lists the devices adb reports", async () => {
    behaviour = { kind: "close", code: 0, stdout: "List of devices attached\nPIXEL7\tdevice\n" };
    const res = await run(handleAdbDevices);
    expect(res.body).toMatchObject({ success: true, devices: ["PIXEL7"], hasLocalAdb: true });
  });

  it("returns an empty list, not a virtual emulator, when adb sees no device", async () => {
    behaviour = { kind: "close", code: 0, stdout: "List of devices attached\n" };
    const res = await run(handleAdbDevices);
    expect(res.body).toMatchObject({ success: true, devices: [] });
  });

  it("is unavailable with no devices when adb is missing", async () => {
    behaviour = { kind: "error" };
    const res = await run(handleAdbDevices);
    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe("unavailable");
    expectNoFabricatedDevice(res);
  });

  it("fails with no devices when adb exits non-zero", async () => {
    behaviour = { kind: "close", code: 1, stderr: "daemon not running" };
    const res = await run(handleAdbDevices);
    expect(res.body).toMatchObject({ status: "failed", error: "daemon not running" });
    expectNoFabricatedDevice(res);
  });

  it("is unavailable with no devices when adb hangs", async () => {
    vi.useFakeTimers();
    behaviour = { kind: "hang" };
    const res = makeRes();
    handleAdbDevices({ query: {} } as any, res, () => {});
    await vi.advanceTimersByTimeAsync(ADB_DEVICES_TIMEOUT_MS + 1);
    expectNoFabricatedDevice(res);
  });

  it("is unavailable with no devices when spawn throws", async () => {
    behaviour = { kind: "throw" };
    expectNoFabricatedDevice(await run(handleAdbDevices));
  });
});

describe("GET /api/adb/capture", () => {
  const noFrame = createAdbCaptureHandler(() => null);
  const withFrame = createAdbCaptureHandler(() => REAL_FRAME);

  beforeEach(() => {
    behaviour = { kind: "error" };
  });

  it("serves the real synced frame for a generic phone id", async () => {
    for (const query of [{}, { deviceId: "WiFi Phone" }]) {
      const res = await run(withFrame, query);
      expect(res.body).toMatchObject({ success: true, imageData: REAL_FRAME, source: "mobile_live_stream", isRealDevice: true });
    }
  });

  it("returns a real adb screencap as PNG", async () => {
    behaviour = { kind: "close", code: 0, stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
    const res = await run(noFrame, { deviceId: "PIXEL7" });
    expect(res.body.success).toBe(true);
    expect(res.body.imageData).toBe("data:image/png;base64,iVBORw==");
    expect(res.body.source).toBe("adb_screencap");
  });

  it("is on standby with no image when adb is missing and no real frame exists", async () => {
    const res = await run(noFrame, { deviceId: "PIXEL7" });
    expectStandbyWithoutImage(res);
    expect(res.body.error).toContain("ENOENT");
  });

  it("is on standby when adb returns an empty screencap", async () => {
    behaviour = { kind: "close", code: 0, stdout: "" };
    expectStandbyWithoutImage(await run(noFrame, { deviceId: "PIXEL7" }));
  });

  it("is on standby when adb hangs", async () => {
    vi.useFakeTimers();
    behaviour = { kind: "hang" };
    const res = makeRes();
    noFrame({ query: { deviceId: "PIXEL7" } } as any, res, () => {});
    await vi.advanceTimersByTimeAsync(ADB_CAPTURE_TIMEOUT_MS + 1);
    expectStandbyWithoutImage(res);
  });

  it("is on standby when spawn throws", async () => {
    behaviour = { kind: "throw" };
    expectStandbyWithoutImage(await run(noFrame, { deviceId: "PIXEL7" }));
  });

  it("labels the real frame as the live stream, not that device's capture, when adb fails", async () => {
    const res = await run(withFrame, { deviceId: "emulator-5554" });
    expect(res.body).toMatchObject({ success: true, imageData: REAL_FRAME, source: "mobile_live_stream", isRealDevice: false });
    expect(res.body.adbError).toContain("ENOENT");
  });

  it("rejects an invalid device id without an image", async () => {
    const res = await run(noFrame, { deviceId: "bad; rm -rf /" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, imageData: null });
  });
});

describe("GET /api/adb/scan", () => {
  const scan = (simulated: string[] = []) => createAdbScanHandler(() => new Set(simulated));

  function expectNoInventedDevice(res: any) {
    expect(JSON.stringify(res.body)).not.toMatch(/WiFi Phone|192\.168\.1\.50/);
    expect(res.calls).toBe(1);
  }

  it("passes through only the devices adb reports in the device state", async () => {
    behaviour = { kind: "close", code: 0, stdout: "List of devices attached\nR3CN90\tdevice\n10.0.0.7:5555\tdevice\nQQ1\tunauthorized\n" };
    const res = await run(scan());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, devices: ["R3CN90", "10.0.0.7:5555"], simulatedDevices: [], hint: ADB_SCAN_HINT });
    expect(res.body.simulated).toBeUndefined();
    expectNoInventedDevice(res);
  });

  it("returns an empty device list with the hint, not an invented WiFi phone, when adb sees nothing", async () => {
    behaviour = { kind: "close", code: 0, stdout: "List of devices attached\n" };
    const res = await run(scan());
    expect(res.body).toMatchObject({ success: true, devices: [], simulatedDevices: [], hint: ADB_SCAN_HINT });
    expectNoInventedDevice(res);
  });

  it("keeps simulated targets out of devices and marks each one simulated", async () => {
    behaviour = { kind: "close", code: 0, stdout: "List of devices attached\nR3CN90\tdevice\n" };
    const res = await run(scan(["10.1.2.3:5555", "R3CN90"]));
    expect(res.body.devices).toEqual(["R3CN90"]);
    expect(res.body.simulatedDevices).toEqual([{ id: "10.1.2.3:5555", simulated: true }]);
  });

  it("is unavailable with no devices when adb is missing, listing simulated targets only as simulated", async () => {
    behaviour = { kind: "error" };
    const res = await run(scan(["10.1.2.3:5555"]));
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ success: false, status: "unavailable", simulated: true, devices: [], hint: ADB_SCAN_HINT });
    expect(res.body.simulatedDevices).toEqual([{ id: "10.1.2.3:5555", simulated: true }]);
    expectNoInventedDevice(res);
  });

  it("fails with no devices when adb exits non-zero", async () => {
    behaviour = { kind: "close", code: 1, stderr: "daemon not running" };
    const res = await run(scan());
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, status: "failed", devices: [] });
    expectNoInventedDevice(res);
  });

  it("is unavailable with no devices when adb hangs or spawn throws", async () => {
    behaviour = { kind: "throw" };
    expectNoFabricatedDevice(await run(scan()));
    vi.useFakeTimers();
    behaviour = { kind: "hang" };
    const res = makeRes();
    scan()({ query: {} } as any, res, () => {});
    await vi.advanceTimersByTimeAsync(ADB_DEVICES_TIMEOUT_MS + 1);
    expectNoFabricatedDevice(res);
  });
});
