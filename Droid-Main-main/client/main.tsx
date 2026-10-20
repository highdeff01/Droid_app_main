import { createRoot } from "react-dom/client";
import App from "./App";
import "./global.css";

// Resilient Response.prototype.json patch to guard against HTML fallbacks and plain-text rate limits
const _originalJson = Response.prototype.json;
Response.prototype.json = async function () {
  try {
    const text = await this.text();
    if (!text || text.trim() === "") {
      return { success: this.ok, status: this.status };
    }
    try {
      return JSON.parse(text);
    } catch {
      const cleanMsg =
        text.length < 150 && !text.includes("<!doctype") && !text.includes("<html")
          ? text.trim()
          : `Non-JSON response (HTTP ${this.status})`;
      return {
        success: false,
        status: this.status,
        error: cleanMsg,
        rawText: text.slice(0, 300),
      };
    }
  } catch (err: any) {
    return {
      success: false,
      status: this.status,
      error: err?.message || "Failed to read response body",
    };
  }
};

// Global uncaught error handler to prevent silent blank screens
window.addEventListener("error", (event) => {
  console.warn("Handled global window error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.warn("Handled global unhandled promise rejection:", event.reason);
  // Prevent unhandled promise rejections from crashing the applet
  event.preventDefault();
});

const container = document.getElementById("root");
if (container) {
  try {
    const root = createRoot(container);
    root.render(<App />);
  } catch (err) {
    console.error("Failed to render App:", err);
    container.innerHTML = `
      <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;background:#090d16;color:#f87171;font-family:sans-serif;padding:20px;text-align:center;">
        <div>
          <h2 style="font-size:20px;margin-bottom:8px;color:#fff;">AI Studio Workspace Recovery</h2>
          <p style="font-size:14px;color:#94a3b8;margin-bottom:16px;">Click below to reset cache and reload the application.</p>
          <button onclick="localStorage.clear();sessionStorage.clear();window.location.reload();" style="padding:10px 20px;background:#06b6d4;color:#000;font-weight:bold;border:none;border-radius:6px;cursor:pointer;">
            Clear Cache & Reload
          </button>
        </div>
      </div>
    `;
  }
}
