import { RequestHandler } from "express";
import { aiMonitorStore } from "../ai-monitor-store";

export const handleGetAiMonitor: RequestHandler = (_req, res) => {
  res.json({
    success: true,
    status: aiMonitorStore.getStatus(),
    recentActions: aiMonitorStore.getActionHistory(20),
    browserContext: aiMonitorStore.getBrowserContext(),
  });
};

export const handleGetActionHistory: RequestHandler = (req, res) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
  const history = aiMonitorStore.getActionHistory(limit);
  res.json({
    success: true,
    history,
    count: history.length,
  });
};

export const handleExportActionHistoryCsv: RequestHandler = (_req, res) => {
  const csv = aiMonitorStore.exportCsv();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ai-action-history-${Date.now()}.csv"`
  );
  res.send(csv);
};

export const handleRecordAction: RequestHandler = (req, res) => {
  const record = aiMonitorStore.record(req.body);
  res.json({ success: true, record });
};

export const handleClearActionHistory: RequestHandler = (_req, res) => {
  aiMonitorStore.clearActionHistory();
  res.json({ success: true, message: "Action history cleared" });
};
