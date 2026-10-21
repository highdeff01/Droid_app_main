/**
 * Browser Inspector
 * Reads real browser tabs and page elements so the AI can interpret web pages
 * precisely instead of guessing from pixels.
 *
 * Two sources are supported:
 *  - Chrome DevTools Protocol (CDP): connect to a Chrome/Chromium started with
 *    --remote-debugging-port (default http://localhost:9222).
 *  - The bundled browser extension (`browser-extension/`), which posts the
 *    active tab and its elements to /api/browser/extension-report.
 */

import type {
  AiMonitorBrowserContext,
  AiMonitorBrowserElement,
} from "./ai-monitor-store";

export const DEFAULT_CDP_URL =
  process.env.CHROME_CDP_URL || "http://localhost:9222";

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  webSocketDebuggerUrl?: string;
}

/** Lists the open page targets of a CDP-enabled browser. */
export async function listBrowserTabs(
  cdpUrl: string = DEFAULT_CDP_URL,
): Promise<BrowserTab[]> {
  const response = await fetch(`${cdpUrl.replace(/\/$/, "")}/json/list`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new Error(`CDP endpoint returned ${response.status}`);
  }
  const targets: any[] = await response.json();
  return (Array.isArray(targets) ? targets : [])
    .filter((t) => t.type === "page" && !String(t.url || "").startsWith("devtools://"))
    .map((t, idx) => ({
      id: String(t.id),
      title: t.title || "Untitled tab",
      url: t.url || "",
      active: idx === 0,
      webSocketDebuggerUrl: t.webSocketDebuggerUrl,
    }));
}

export interface BrowserPageSnapshot {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  elements: AiMonitorBrowserElement[];
}

/** Expression evaluated inside the page to extract visible interactive elements. */
const DOM_EXTRACTION_EXPRESSION = `(() => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.05) return false;
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  };
  const selectorFor = (el) => {
    if (el.id) return '#' + el.id;
    const name = el.getAttribute('name');
    if (name) return el.tagName.toLowerCase() + '[name="' + name + '"]';
    const testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };
  const labelFor = (el) => (
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    el.getAttribute('title') ||
    el.getAttribute('name') ||
    (el.innerText || el.value || '').trim().slice(0, 80) ||
    el.tagName.toLowerCase()
  );
  const typeFor = (el) => {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'a' || role === 'link') return 'link';
    if (tag === 'button' || role === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'dropdown';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox' || t === 'radio') return 'checkbox';
      if (t === 'submit' || t === 'button') return 'button';
      return 'input';
    }
    if (role === 'tab') return 'tab';
    if (role === 'checkbox') return 'checkbox';
    if (el.isContentEditable) return 'input';
    return 'other';
  };
  const nodes = Array.from(document.querySelectorAll(
    'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [contenteditable="true"]'
  ));
  const elements = [];
  const seen = new Set();
  for (const el of nodes) {
    if (elements.length >= 60) break;
    if (!isVisible(el)) continue;
    const selector = selectorFor(el);
    if (seen.has(selector)) continue;
    seen.add(selector);
    const rect = el.getBoundingClientRect();
    elements.push({
      id: 'dom_' + (elements.length + 1),
      name: labelFor(el),
      type: typeFor(el),
      selector,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      confidence: 0.97,
      interactive: true,
      textValue: (el.value || el.innerText || '').trim().slice(0, 120),
    });
  }
  return {
    title: document.title,
    url: location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    elements,
  };
})()`;

/** Reads the live DOM of one tab through the CDP WebSocket. */
export async function inspectBrowserTab(
  tab: BrowserTab,
  cdpUrl: string = DEFAULT_CDP_URL,
): Promise<BrowserPageSnapshot> {
  let socketUrl = tab.webSocketDebuggerUrl;
  if (!socketUrl) {
    const tabs = await listBrowserTabs(cdpUrl);
    const match = tabs.find((t) => t.id === tab.id);
    socketUrl = match?.webSocketDebuggerUrl;
  }
  if (!socketUrl) {
    throw new Error("No DevTools WebSocket available for this tab");
  }

  const raw = await evaluateInTarget(socketUrl, DOM_EXTRACTION_EXPRESSION);
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    title: parsed?.title || tab.title,
    url: parsed?.url || tab.url,
    viewport: parsed?.viewport || { width: 1920, height: 1080 },
    elements: Array.isArray(parsed?.elements) ? parsed.elements : [],
  };
}

function evaluateInTarget(socketUrl: string, expression: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {}
      reject(new Error("Timed out waiting for the browser DevTools response"));
    }, 8000);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      fn();
    };

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression,
            returnByValue: true,
            awaitPromise: false,
          },
        }),
      );
    });

    socket.addEventListener("message", (event: any) => {
      let payload: any;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (payload.id !== 1) return;
      if (payload.error) {
        return finish(() => reject(new Error(payload.error.message)));
      }
      const result = payload.result?.result;
      if (result?.subtype === "error") {
        return finish(() => reject(new Error(result.description || "Page evaluation failed")));
      }
      finish(() => resolve(result?.value));
    });

    socket.addEventListener("error", () =>
      finish(() => reject(new Error("Could not connect to the browser DevTools socket"))),
    );
  });
}

/** Builds the shared browser-context shape used by the monitor and the AI. */
export function buildBrowserContext(params: {
  source: "cdp" | "extension";
  tabs?: AiMonitorBrowserContext["tabs"];
  page?: AiMonitorBrowserContext["page"];
  elements?: AiMonitorBrowserElement[];
}): AiMonitorBrowserContext {
  const tabs = params.tabs || [];
  return {
    updatedAt: Date.now(),
    source: params.source,
    tabs,
    activeTab: tabs.find((t) => t.active) || tabs[0],
    page: params.page,
    elements: params.elements || [],
  };
}
