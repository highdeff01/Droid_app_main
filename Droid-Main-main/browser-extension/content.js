/**
 * DroidVision AI Page Bridge — content script.
 * Collects the visible interactive elements of the current page on demand and
 * hands them to the service worker, which posts them to the app's API.
 */

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(el);
  if (
    style.visibility === "hidden" ||
    style.display === "none" ||
    Number(style.opacity) < 0.05
  ) {
    return false;
  }
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function selectorFor(el) {
  if (el.id) return `#${el.id}`;
  const name = el.getAttribute("name");
  if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 4) {
    let part = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName,
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

function typeFor(el) {
  const tag = el.tagName.toLowerCase();
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (tag === "a" || role === "link") return "link";
  if (tag === "button" || role === "button" || tag === "summary") return "button";
  if (tag === "select") return "dropdown";
  if (tag === "textarea") return "textarea";
  if (tag === "input") {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "checkbox" || t === "radio") return "checkbox";
    if (t === "submit" || t === "button") return "button";
    return "input";
  }
  if (role === "tab") return "tab";
  if (el.isContentEditable) return "input";
  return "other";
}

function labelFor(el) {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("title") ||
    el.getAttribute("name") ||
    (el.innerText || el.value || "").trim().slice(0, 80) ||
    el.tagName.toLowerCase()
  );
}

function collectPage() {
  const nodes = Array.from(
    document.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [contenteditable="true"]',
    ),
  );
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
      id: `ext_${elements.length + 1}`,
      name: labelFor(el),
      type: typeFor(el),
      selector,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      confidence: 0.96,
      interactive: true,
      textValue: (el.value || el.innerText || "").trim().slice(0, 120),
    });
  }
  return {
    page: {
      title: document.title,
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    elements,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "droidvision:collect") {
    try {
      sendResponse(collectPage());
    } catch (err) {
      sendResponse({ page: null, elements: [], error: String(err) });
    }
  }
  return true;
});
