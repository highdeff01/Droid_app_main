/**
 * SVG-based fallback frame generator for desktop and mobile devices.
 * Produces crisp, standalone base64 data URIs for immediate HUD display.
 */

export interface MobileFrameOptions {
  model?: string;
  battery?: number;
  wifi?: boolean;
  activeApp?: string;
  [key: string]: any;
}

export function generateDefaultDesktopFrame(title = "Sightline AI Vision Core"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <rect width="1920" height="1080" fill="#020617"/>
    <defs>
      <radialGradient id="deskGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#0f172a" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#020617" stop-opacity="1"/>
      </radialGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1" stroke-opacity="0.4"/>
      </pattern>
    </defs>
    <rect width="1920" height="1080" fill="url(#deskGrad)"/>
    <rect width="1920" height="1080" fill="url(#grid)"/>
    <!-- Top Bar -->
    <rect width="1920" height="40" fill="#090d16" stroke="#1e293b" stroke-width="1"/>
    <circle cx="24" cy="20" r="6" fill="#ef4444"/>
    <circle cx="44" cy="20" r="6" fill="#eab308"/>
    <circle cx="64" cy="20" r="6" fill="#22c55e"/>
    <text x="960" y="25" fill="#94a3b8" font-family="monospace" font-size="13" text-anchor="middle" font-weight="bold">${title} — Physical Display (1920x1080)</text>
    <!-- Center HUD Display -->
    <rect x="460" y="240" width="1000" height="600" rx="12" fill="#030712" stroke="#06b6d4" stroke-width="2" stroke-opacity="0.6"/>
    <text x="960" y="520" fill="#38bdf8" font-family="monospace" font-size="28" text-anchor="middle" font-weight="bold">AI VISION REAL-TIME VIEWPORT</text>
    <text x="960" y="560" fill="#64748b" font-family="monospace" font-size="14" text-anchor="middle">Ready for live screen capture, ADB mirror, or PyAutoGUI automation</text>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function generateDefaultMobileFrame(options: MobileFrameOptions = {}): string {
  const model = options.model || "Galaxy S24 Ultra";
  const app = options.activeApp || "Sightline Mobile Agent";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <rect width="1080" height="1920" fill="#020617"/>
    <defs>
      <linearGradient id="phoneGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#phoneGrad)"/>
    <!-- Status Bar -->
    <rect width="1080" height="70" fill="#090d16" stroke="#1e293b" stroke-width="1"/>
    <text x="50" y="46" fill="#f8fafc" font-family="sans-serif" font-size="26" font-weight="bold">12:00</text>
    <text x="1030" y="46" fill="#22c55e" font-family="sans-serif" font-size="24" text-anchor="end" font-weight="bold">100% ⚡</text>
    <circle cx="540" cy="35" r="14" fill="#000000"/>
    <!-- Main Screen Content -->
    <rect x="60" y="160" width="960" height="420" rx="20" fill="#090d16" stroke="#06b6d4" stroke-width="2"/>
    <text x="540" y="340" fill="#38bdf8" font-family="monospace" font-size="34" text-anchor="middle" font-weight="bold">${model}</text>
    <text x="540" y="400" fill="#94a3b8" font-family="monospace" font-size="22" text-anchor="middle">${app}</text>
    <!-- Live Touch Surface Area -->
    <rect x="60" y="640" width="960" height="1080" rx="20" fill="#020617" stroke="#334155" stroke-dasharray="10,10"/>
    <text x="540" y="1180" fill="#64748b" font-family="monospace" font-size="26" text-anchor="middle">Touch or Drag to Record Real Mobile Steps</text>
    <!-- Navigation Bar -->
    <rect y="1820" width="1080" height="100" fill="#090d16"/>
    <line x1="500" y1="1870" x2="580" y2="1870" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
