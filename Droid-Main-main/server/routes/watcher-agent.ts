import { RequestHandler } from "express";

let isWatcherRunning = false;
let watcherStartTime: number | null = null;
let watcherEvents: any[] = [];

export const handleGetWatcherStatus: RequestHandler = (_req, res) => {
  res.json({
    success: true,
    running: isWatcherRunning,
    startTime: watcherStartTime,
    uptimeSec: watcherStartTime ? Math.floor((Date.now() - watcherStartTime) / 1000) : 0,
    eventsCount: watcherEvents.length,
    events: watcherEvents.slice(-20),
  });
};

export const handleStartWatcher: RequestHandler = (req, res) => {
  isWatcherRunning = true;
  watcherStartTime = Date.now();
  watcherEvents.push({
    id: `ev_${Date.now()}`,
    time: new Date().toLocaleTimeString(),
    type: "started",
    message: "Background UI watchdog monitoring started",
  });
  res.json({ success: true, message: "Watcher agent started" });
};

export const handleStopWatcher: RequestHandler = (_req, res) => {
  isWatcherRunning = false;
  watcherStartTime = null;
  watcherEvents.push({
    id: `ev_${Date.now()}`,
    time: new Date().toLocaleTimeString(),
    type: "stopped",
    message: "Background UI watchdog monitoring stopped",
  });
  res.json({ success: true, message: "Watcher agent stopped" });
};

export const handleAssembleTask: RequestHandler = (req, res) => {
  const { steps, name, targetDevice } = req.body;
  const assembledTask = {
    id: `task_assembled_${Date.now()}`,
    name: name || "Assembled Watcher Task",
    targetDevice: targetDevice || "desktop",
    stepsCount: (steps || []).length,
    steps: steps || [],
    createdAt: new Date().toISOString(),
  };
  res.json({ success: true, task: assembledTask });
};
