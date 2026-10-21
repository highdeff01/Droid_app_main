import { RequestHandler } from "express";
import { aiMonitorStore, AiMonitorBrowserContext } from "../ai-monitor-store";

const CDP_URL = process.env.CHROME_CDP_URL || "http://localhost:9222";

export const handleGetBrowserTabs: RequestHandler = async (_req, res) => {
  try {
    const response = await fetch(`${CDP_URL}/json/list`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) {
      throw new Error(`CDP responded with status ${response.status}`);
    }
    const tabs = await response.json();
    res.json({
      success: true,
      tabs: (tabs || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        type: t.type,
      })),
    });
  } catch {
    res.json({
      success: false,
      message: "Chrome DevTools Protocol not reachable at " + CDP_URL + ". Start Chrome with --remote-debugging-port=9222 or use extension.",
      tabs: [],
    });
  }
};

export const handleInspectBrowserTab: RequestHandler = async (req, res) => {
  const { tabId } = req.body;
  try {
    const listRes = await fetch(`${CDP_URL}/json/list`, { signal: AbortSignal.timeout(1500) });
    const tabs = await listRes.json();
    const tab = tabs.find((t: any) => t.id === tabId) || tabs[0];
    if (!tab) {
      return res.status(404).json({ success: false, error: "Tab not found" });
    }

    const context: AiMonitorBrowserContext = {
      updatedAt: Date.now(),
      source: "cdp",
      activeTab: { id: tab.id, title: tab.title, url: tab.url },
      tabs: tabs.map((t: any) => ({ id: t.id, title: t.title, url: t.url })),
      page: { title: tab.title, url: tab.url },
      elements: [],
    };
    aiMonitorStore.setBrowserContext(context);

    res.json({ success: true, context });
  } catch (err: any) {
    res.json({
      success: false,
      message: "Inspection failed or Chrome CDP not connected: " + (err.message || String(err)),
    });
  }
};

export const handleBrowserExtensionReport: RequestHandler = (req, res) => {
  const { activeTab, tabs, page, elements } = req.body;
  const context: AiMonitorBrowserContext = {
    updatedAt: Date.now(),
    source: "extension",
    activeTab,
    tabs: tabs || [],
    page,
    elements: elements || [],
  };
  aiMonitorStore.setBrowserContext(context);
  res.json({ success: true, message: "Browser context synced from extension" });
};

export const handleGetBrowserContext: RequestHandler = (_req, res) => {
  const context = aiMonitorStore.getBrowserContext();
  res.json({ success: true, context });
};
