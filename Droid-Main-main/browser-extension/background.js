/**
 * DroidVision AI Page Bridge — service worker.
 * Forwards the active tab's page elements to the app's browser-inspector API so
 * the AI can interpret real tabs and page elements during screen analysis.
 */

const API_URL = "http://localhost:3000/api/browser/extension-report";

async function reportActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  let collected = { page: null, elements: [] };
  try {
    collected = await chrome.tabs.sendMessage(tab.id, {
      type: "droidvision:collect",
    });
  } catch {
    // The content script is not injected on this page (chrome://, store pages…).
    return;
  }

  const tabs = await chrome.tabs.query({});
  const payload = {
    tab: { id: String(tab.id), title: tab.title, url: tab.url, active: true },
    tabs: tabs.map((t) => ({
      id: String(t.id),
      title: t.title,
      url: t.url,
      active: t.id === tab.id,
    })),
    page: collected?.page || { title: tab.title, url: tab.url },
    elements: collected?.elements || [],
  };

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // The app is not running or unreachable — nothing to do.
  }
}

chrome.action.onClicked.addListener(() => {
  reportActiveTab();
});

chrome.tabs.onActivated.addListener(() => {
  reportActiveTab();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    reportActiveTab();
  }
});
