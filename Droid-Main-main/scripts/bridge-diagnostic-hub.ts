import os from "os";
import http from "http";
import { execSync } from "child_process";
import path from "path";

// Helper to find local IPv4 addresses
function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const addresses: { name: string; ip: string }[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("169.254")) {
        addresses.push({ name, ip: iface.address });
      }
    }
  }
  return addresses;
}

// Simple ASCII QR Code Generator Fallback
function renderAsciiQrBox(text: string, title: string) {
  const border = "═".repeat(60);
  console.log(`\n╔${border}╗`);
  console.log(`║ 📱 ${title.padEnd(55)} ║`);
  console.log(`╠${border}╣`);
  console.log(`║ URL: ${text.padEnd(55)} ║`);
  console.log(`╚${border}╝\n`);
}

// Check ADB connection & setup reverse port forwarding
function setupAdbReverseBridge(): boolean {
  const possibleAdbPaths = [
    "adb",
    "C:\\Users\\Dan\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
    path.join(process.env.LOCALAPPDATA || "", "Android\\Sdk\\platform-tools\\adb.exe"),
  ];

  for (const adbCmd of possibleAdbPaths) {
    try {
      const devicesOutput = execSync(`"${adbCmd}" devices`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const lines = devicesOutput.split("\n").filter((l) => l.trim() && !l.startsWith("List of devices"));

      if (lines.length > 0) {
        console.log(`[ADB Bridge] Found ${lines.length} connected Android device(s):`);
        lines.forEach((l) => console.log(`   └─ ${l.trim()}`));

        console.log(`[ADB Bridge] Setting up USB/Wi-Fi reverse port forwarding (3000 -> 3000)...`);
        execSync(`"${adbCmd}" reverse tcp:3000 tcp:3000`, { stdio: "ignore" });
        execSync(`"${adbCmd}" reverse tcp:5173 tcp:5173`, { stdio: "ignore" });
        console.log(`[ADB Bridge] ✅ Reverse bridge ACTIVE! Phone can now connect via http://127.0.0.1:3000/mobile-remote\n`);
        return true;
      }
    } catch (ignored) {}
  }
  return false;
}

// Test server port responsiveness
function testServerPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runBridgeDiagnostics() {
  console.log("================================================================");
  console.log("🚀 SIGHTLINE MOBILE INTERACTIVE BRIDGE & DIAGNOSTIC HUB v2.5.0");
  console.log("================================================================");

  // 1. Check Server
  const isServerRunning = await testServerPort(3000);
  if (isServerRunning) {
    console.log("✅ Desktop Web Server: ONLINE on port 3000");
  } else {
    console.log("⚠️ Desktop Web Server: NOT RESPONDING on port 3000");
    console.log("   (Make sure you ran 'npm run dev' or 'run_master_app.bat' first)");
  }

  // 2. Check ADB Reverse Bridge
  const adbActive = setupAdbReverseBridge();

  // 3. Detect Network Interfaces
  const interfaces = getNetworkInterfaces();
  console.log("📡 Detected Network Adapter Interfaces:");
  if (interfaces.length === 0) {
    console.log("   ⚠️ No active Wi-Fi or LAN IP address found.");
  } else {
    interfaces.forEach((iface) => {
      console.log(`   ├─ ${iface.name}: http://${iface.ip}:3000/mobile-remote`);
    });
  }

  // 4. Print Connection Links & Dual QR Options
  console.log("\n🔗 RECONNECT & RETRY METHODS FOR YOUR PHONE:");

  const primaryLanIp = interfaces.find((i) => i.name.toLowerCase().includes("wi-fi") || i.name.toLowerCase().includes("wifi"))?.ip || interfaces[0]?.ip || "192.168.1.xxx";

  renderAsciiQrBox(`http://${primaryLanIp}:3000/mobile-remote`, "METHOD 1: Wi-Fi LAN Connection Link");

  if (adbActive) {
    renderAsciiQrBox(`http://127.0.0.1:3000/mobile-remote`, "METHOD 2: USB / ADB Reverse Bridge (100% Guaranteed)");
  } else {
    renderAsciiQrBox(`http://10.0.2.2:3000/mobile-remote`, "METHOD 2: Android Emulator Bridge");
  }

  console.log("----------------------------------------------------------------");
  console.log("💡 TROUBLESHOOTING STEPS IF STILL NOT CONNECTING:");
  console.log("1. Connect Phone to the SAME Wi-Fi network as this PC.");
  console.log("2. Open the Sightline App on your phone -> Long-press anywhere on screen.");
  console.log(`3. Enter this server address: http://${primaryLanIp}:3000/mobile-remote`);
  console.log("4. Alternatively, plug in USB cable with USB Debugging enabled for instant 0-lag connection!");
  console.log("================================================================\n");
}

runBridgeDiagnostics();
