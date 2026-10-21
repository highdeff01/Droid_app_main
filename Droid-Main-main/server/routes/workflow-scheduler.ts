import { RequestHandler } from "express";

export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  workflowId?: string;
  stepsCount?: number;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: "success" | "failed";
  createdAt: string;
}

let scheduledJobs: ScheduledJob[] = [
  {
    id: "job_daily_audit",
    name: "Daily Workflows Audit & OCR Verification",
    cronExpression: "0 9 * * *",
    enabled: true,
    lastRunAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    lastStatus: "success",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "job_cleanup",
    name: "Nightly Screen Frame Cache Pruning",
    cronExpression: "0 2 * * *",
    enabled: true,
    lastRunAt: new Date(Date.now() - 3600000 * 19).toISOString(),
    lastStatus: "success",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

export const handleGetScheduledJobs: RequestHandler = (_req, res) => {
  res.json({ success: true, jobs: scheduledJobs });
};

export const handleCreateScheduledJob: RequestHandler = (req, res) => {
  const { name, cronExpression, workflowId, stepsCount } = req.body;
  const newJob: ScheduledJob = {
    id: `job_${Date.now()}`,
    name: name || "Scheduled Automation Job",
    cronExpression: cronExpression || "0 * * * *",
    workflowId,
    stepsCount: stepsCount || 0,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  scheduledJobs.push(newJob);
  res.json({ success: true, job: newJob });
};

export const handleToggleScheduledJob: RequestHandler = (req, res) => {
  const { jobId, enabled } = req.body;
  const job = scheduledJobs.find((j) => j.id === jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }
  job.enabled = enabled !== undefined ? enabled : !job.enabled;
  res.json({ success: true, job });
};

export const handleRunJobNow: RequestHandler = (req, res) => {
  const { jobId } = req.body;
  const job = scheduledJobs.find((j) => j.id === jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }
  job.lastRunAt = new Date().toISOString();
  job.lastStatus = "success";
  res.json({
    success: true,
    message: `Job "${job.name}" triggered immediately.`,
    job,
  });
};

export const handleDeleteScheduledJob: RequestHandler = (req, res) => {
  const { jobId } = req.body;
  scheduledJobs = scheduledJobs.filter((j) => j.id !== jobId);
  res.json({ success: true, message: "Job deleted successfully" });
};
