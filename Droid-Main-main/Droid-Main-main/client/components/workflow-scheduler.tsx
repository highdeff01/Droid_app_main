import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sliders,
  Terminal,
  Layers,
  History,
  Activity,
  Smartphone,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export interface ScheduledJobItem {
  id: string;
  name: string;
  description?: string;
  workflowName: string;
  steps: Array<{
    id: string;
    name?: string;
    action: string;
    x?: number;
    y?: number;
    text?: string;
    keyPayload?: string;
    delayMs?: number;
  }>;
  triggerType: "cron" | "delayed" | "interval" | "daily";
  cronExpression?: string;
  delayMinutes?: number;
  intervalMinutes?: number;
  dailyTime?: string;
  targetDevice: "desktop" | "android";
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  executionCount: number;
  status: "idle" | "running" | "completed" | "failed" | "paused";
  lastError?: string;
  lastExecutionDurationMs?: number;
}

export interface JobExecutionLog {
  id: string;
  jobId: string;
  jobName: string;
  timestamp: number;
  triggerType: string;
  stepsExecuted: number;
  success: boolean;
  durationMs: number;
  outputSummary: string;
  error?: string;
}

interface WorkflowSchedulerProps {
  currentSequenceSteps?: Array<{
    id: string;
    name?: string;
    action: string;
    x: number;
    y: number;
    text?: string;
    keyPayload?: string;
    delayMs?: number;
  }>;
  onExecuteNow?: (steps: any[]) => void;
  className?: string;
}

export const WorkflowScheduler: React.FC<WorkflowSchedulerProps> = ({
  currentSequenceSteps = [],
  onExecuteNow,
  className = "",
}) => {
  const [jobs, setJobs] = useState<ScheduledJobItem[]>([]);
  const [logs, setLogs] = useState<JobExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form State for new schedule
  const [newJobName, setNewJobName] = useState("Nightly Data Sync & Screen Audit");
  const [newJobDesc, setNewJobDesc] = useState("Automated execution of recorded workflow with recalibration");
  const [triggerType, setTriggerType] = useState<"cron" | "delayed" | "interval" | "daily">("cron");
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [delayMinutes, setDelayMinutes] = useState(10);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [dailyTime, setDailyTime] = useState("09:30");
  const [targetDevice, setTargetDevice] = useState<"desktop" | "android">("desktop");

  const fetchJobsAndLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/scheduler/jobs");
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
        setLogs(data.recentLogs || []);
      }
    } catch (err: any) {
      console.warn("Scheduler fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobsAndLogs();
    const interval = setInterval(fetchJobsAndLogs, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateJob = async () => {
    if (!newJobName.trim()) {
      toast.error("Please enter a job name");
      return;
    }

    const stepsToSchedule =
      currentSequenceSteps && currentSequenceSteps.length > 0
        ? currentSequenceSteps
        : [
            { id: "s1", name: "Focus Screen", action: "click", x: 960, y: 540, delayMs: 300 },
            { id: "s2", name: "Audit Action", action: "click", x: 1200, y: 400, delayMs: 400 },
          ];

    try {
      const res = await fetch("/api/scheduler/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newJobName,
          description: newJobDesc,
          workflowName: "Active Workflow Sequence",
          steps: stepsToSchedule,
          triggerType,
          cronExpression,
          delayMinutes,
          intervalMinutes,
          dailyTime,
          targetDevice,
          enabled: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Workflow schedule "${newJobName}" created!`);
        setIsCreating(false);
        fetchJobsAndLogs();
      } else {
        toast.error(data.error || "Failed to create schedule");
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleToggleJob = async (id: string) => {
    try {
      const res = await fetch(`/api/scheduler/jobs/${id}/toggle`, {
        method: "PUT",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchJobsAndLogs();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRunNow = async (job: ScheduledJobItem) => {
    try {
      const res = await fetch(`/api/scheduler/jobs/${job.id}/run`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Triggered immediate run for "${job.name}"`);
        if (onExecuteNow && job.steps) {
          onExecuteNow(job.steps);
        }
        fetchJobsAndLogs();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      const res = await fetch(`/api/scheduler/jobs/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.info("Schedule deleted");
        fetchJobsAndLogs();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatCountdown = (timestamp?: number) => {
    if (!timestamp) return "—";
    const diffMs = timestamp - Date.now();
    if (diffMs <= 0) return "Ready now";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `in ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `in ${diffMin}m ${diffSec % 60}s`;
    const diffHours = Math.floor(diffMin / 60);
    return `in ${diffHours}h ${diffMin % 60}m`;
  };

  return (
    <div className={`space-y-4 font-mono text-slate-200 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
        <div>
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              WORKFLOW AUTOMATION SCHEDULER
            </h2>
            <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-xs">
              CRON &amp; RECURRING TRIGGERS
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Set delayed timers or recurring cron triggers for recorded automation routines via PyAutoGUI &amp; ADB
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchJobsAndLogs}
            disabled={isLoading}
            className="h-8 text-xs border-slate-700 hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreating(!isCreating)}
            className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold gap-1.5 shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            {isCreating ? "Close Form" : "New Scheduled Trigger"}
          </Button>
        </div>
      </div>

      {/* New Schedule Creation Drawer */}
      {isCreating && (
        <Card className="bg-slate-900/90 border-2 border-cyan-500/60 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-cyan-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Configure Scheduled Automation Trigger
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Select execution schedule type, timing parameters, and target workflow steps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs font-mono">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Job Name:</label>
                <Input
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  className="h-8 bg-slate-950 border-slate-700 text-xs"
                  placeholder="e.g. Daily Form Submission"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Target Platform:</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetDevice("desktop")}
                    className={`flex-1 h-8 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      targetDevice === "desktop"
                        ? "bg-cyan-600 border-cyan-400 text-white"
                        : "bg-slate-950 border-slate-700 text-slate-400"
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop (PyAutoGUI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetDevice("android")}
                    className={`flex-1 h-8 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      targetDevice === "android"
                        ? "bg-emerald-600 border-emerald-400 text-white"
                        : "bg-slate-950 border-slate-700 text-slate-400"
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Android (ADB)
                  </button>
                </div>
              </div>
            </div>

            {/* Schedule Trigger Selector */}
            <div className="space-y-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-300 font-bold block text-xs">Trigger Mode:</span>
              <Tabs
                value={triggerType}
                onValueChange={(v: any) => setTriggerType(v)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-4 bg-slate-900 border border-slate-800 h-8">
                  <TabsTrigger value="cron" className="text-xs">
                    Cron Syntax
                  </TabsTrigger>
                  <TabsTrigger value="delayed" className="text-xs">
                    Delayed One-Shot
                  </TabsTrigger>
                  <TabsTrigger value="interval" className="text-xs">
                    Fixed Interval
                  </TabsTrigger>
                  <TabsTrigger value="daily" className="text-xs">
                    Daily Time
                  </TabsTrigger>
                </TabsList>

                {/* Cron tab */}
                <TabsContent value="cron" className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      className="h-8 bg-slate-900 border-slate-700 text-cyan-300 font-bold"
                      placeholder="*/15 * * * *"
                    />
                    <div className="flex gap-1">
                      {["*/5 * * * *", "*/15 * * * *", "0 * * * *", "0 9 * * 1-5"].map((expr) => (
                        <button
                          key={expr}
                          type="button"
                          onClick={() => setCronExpression(expr)}
                          className="px-2 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                        >
                          {expr}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Standard 5-part cron: minute hour day-of-month month day-of-week (e.g.{" "}
                    <code>*/15 * * * *</code> = Every 15 minutes)
                  </p>
                </TabsContent>

                {/* Delayed tab */}
                <TabsContent value="delayed" className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Execute once in:</span>
                    <Input
                      type="number"
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(Number(e.target.value))}
                      className="w-24 h-8 bg-slate-900 border-slate-700 text-cyan-300 font-bold"
                      min={1}
                      max={1440}
                    />
                    <span className="text-slate-300">minutes</span>
                  </div>
                </TabsContent>

                {/* Interval tab */}
                <TabsContent value="interval" className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Repeat every:</span>
                    <Input
                      type="number"
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                      className="w-24 h-8 bg-slate-900 border-slate-700 text-cyan-300 font-bold"
                      min={1}
                      max={1440}
                    />
                    <span className="text-slate-300">minutes</span>
                  </div>
                </TabsContent>

                {/* Daily tab */}
                <TabsContent value="daily" className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Execute every day at:</span>
                    <Input
                      type="time"
                      value={dailyTime}
                      onChange={(e) => setDailyTime(e.target.value)}
                      className="w-32 h-8 bg-slate-900 border-slate-700 text-cyan-300 font-bold"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                Will schedule {currentSequenceSteps.length} recorded automation steps.
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCreating(false)}
                  className="h-8 text-xs border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateJob}
                  className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Save &amp; Activate Schedule
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Schedules Table */}
      <Card className="bg-slate-900/80 border border-slate-800 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Active Scheduled Automation Workflows ({jobs.length})
            </CardTitle>
            <Badge variant="outline" className="text-xs bg-slate-950 border-slate-700">
              {jobs.filter((j) => j.enabled).length} Running • {jobs.filter((j) => !j.enabled).length} Paused
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-bold text-[11px]">
                  <th className="p-3">JOB / WORKFLOW</th>
                  <th className="p-3">TRIGGER / SYNTAX</th>
                  <th className="p-3">PLATFORM</th>
                  <th className="p-3">NEXT EXECUTION</th>
                  <th className="p-3">RUNS</th>
                  <th className="p-3">STATUS</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-white">{job.name}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">
                        {job.workflowName} ({job.steps?.length || 0} steps)
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        {job.triggerType === "cron"
                          ? `CRON: ${job.cronExpression}`
                          : job.triggerType === "delayed"
                          ? `Once in ${job.delayMinutes}m`
                          : job.triggerType === "interval"
                          ? `Every ${job.intervalMinutes}m`
                          : `Daily @ ${job.dailyTime}`}
                      </div>
                    </td>

                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          job.targetDevice === "android"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : "bg-slate-950 text-cyan-300 border-cyan-800"
                        }`}
                      >
                        {job.targetDevice === "android" ? "Android (ADB)" : "Desktop (PC)"}
                      </Badge>
                    </td>

                    <td className="p-3">
                      <span
                        className={`font-bold ${
                          job.enabled ? "text-amber-400" : "text-slate-500"
                        }`}
                      >
                        {job.enabled ? formatCountdown(job.nextRunAt) : "Paused"}
                      </span>
                    </td>

                    <td className="p-3 font-bold text-slate-300">
                      {job.executionCount}
                    </td>

                    <td className="p-3">
                      <Badge
                        className={`text-[10px] font-bold ${
                          job.status === "running"
                            ? "bg-amber-950 text-amber-300 border-amber-600 animate-pulse"
                            : job.enabled
                            ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {job.status === "running"
                          ? "EXECUTING..."
                          : job.enabled
                          ? "ACTIVE"
                          : "PAUSED"}
                      </Badge>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRunNow(job)}
                          className="h-7 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/60"
                          title="Run now immediately"
                        >
                          <Play className="w-3 h-3 mr-1" /> Run Now
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleJob(job.id)}
                          className="h-7 px-2 text-[10px] text-slate-300 hover:text-white"
                          title={job.enabled ? "Pause Schedule" : "Resume Schedule"}
                        >
                          {job.enabled ? (
                            <Pause className="w-3 h-3" />
                          ) : (
                            <Play className="w-3 h-3 text-cyan-400" />
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteJob(job.id)}
                          className="h-7 px-2 text-[10px] text-red-400 hover:text-red-300"
                          title="Delete Schedule"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No scheduled automation workflows found. Click &quot;New Scheduled Trigger&quot; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Execution Audit History */}
      <Card className="bg-slate-900/80 border border-slate-800 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            AUTOMATION EXECUTION AUDIT LOGS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[11px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      log.success ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <span className="font-bold text-white truncate">{log.jobName}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-400 truncate">{log.outputSummary}</span>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-slate-400">
                  <span className="text-cyan-300 font-bold">{log.durationMs}ms</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="text-slate-500 text-center py-3 text-xs">
                No recent scheduler execution logs.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
