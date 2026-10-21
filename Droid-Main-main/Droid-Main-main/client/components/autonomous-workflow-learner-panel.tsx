import React, { useState, useEffect } from "react";
import {
  Brain,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  Layers,
  Terminal,
  FileCode,
  AppWindow,
  Eye,
  Plus,
  Trash2,
  Activity,
  Compass,
  AlertTriangle,
  RefreshCw,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { audioSynthesizer } from "@/lib/audio-synthesizer";

export function AutonomousWorkflowLearnerPanel() {
  const [learnedWorkflows, setLearnedWorkflows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [learningFeedback, setLearningFeedback] = useState<string | null>(null);
  const [executingWorkflowId, setExecutingWorkflowId] = useState<string | null>(null);

  // Watcher Agent State
  const [watcherActive, setWatcherActive] = useState(true);
  const [monitoredPrograms, setMonitoredPrograms] = useState<string[]>([
    "notepad.exe",
    "calc.exe",
    "chrome.exe",
    "code.exe"
  ]);
  const [monitoredFiles, setMonitoredFiles] = useState<string[]>([
    "/workspace/tasks.json",
    "/workspace/input.txt"
  ]);
  const [newProgramInput, setNewProgramInput] = useState("");
  const [newFileInput, setNewFileInput] = useState("");
  const [watcherEvents, setWatcherEvents] = useState<any[]>([]);
  const [assembledTasks, setAssembledTasks] = useState<any[]>([]);

  // Companion Command & App Launch Inputs
  const [assemblePrompt, setAssemblePrompt] = useState("");
  const [appToLaunch, setAppToLaunch] = useState("");
  const [companionCommand, setCompanionCommand] = useState("");
  const [isAssembling, setIsAssembling] = useState(false);

  // Load existing learned workflows & watcher status
  const fetchLearnedData = async () => {
    try {
      const res = await fetch("/api/ai/learned-workflows");
      const d = await res.json();
      if (d.success && d.learnedWorkflows) {
        setLearnedWorkflows(d.learnedWorkflows);
      }
    } catch {}

    try {
      const wRes = await fetch("/api/watcher/status");
      const wData = await wRes.json();
      if (wData.success && wData.state) {
        setWatcherActive(wData.state.isActive);
        setMonitoredPrograms(wData.state.monitoredPrograms || []);
        setMonitoredFiles(wData.state.monitoredFiles || []);
        setWatcherEvents(wData.state.eventsLog || []);
        setAssembledTasks(wData.state.assembledTasks || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchLearnedData();
    const interval = setInterval(fetchLearnedData, 6000);
    return () => clearInterval(interval);
  }, []);

  // Trigger Autonomous Learning from Workflow History
  const handleTriggerLearning = async () => {
    setIsLoading(true);
    setLearningFeedback("Scanning recent workflow interaction traces & clustering similar actions...");
    audioSynthesizer.playThinkingSound();

    try {
      // Fetch recorded interactions to feed learner
      const intRes = await fetch("/api/interactions");
      const intData = await intRes.json();
      const history = intData.interactions || [];

      const res = await fetch("/api/ai/learn-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historySteps: history,
          liveContext: "Autonomous desktop automation trace analysis"
        })
      });
      const data = await res.json();
      if (data.success) {
        setLearnedWorkflows(data.allLearnedWorkflows || []);
        setLearningFeedback(data.message);
        audioSynthesizer.playTaskCompleteSound();
      } else {
        setLearningFeedback(data.error || "Learning failed");
      }
    } catch (err: any) {
      setLearningFeedback(`Learning error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute a learned workflow on PC via PyAutoGUI bridge
  const handleExecuteLearnedWorkflow = async (workflow: any) => {
    setExecutingWorkflowId(workflow.id);
    audioSynthesizer.playClickSound();

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        await fetch("/api/pyautogui/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: step.action || "click",
            targetPosition: { x: step.x || 960, y: step.y || 540 },
            text: step.text,
            key: step.key,
            speed: 1.0,
            driftPx: 5
          })
        });
        await new Promise((r) => setTimeout(r, step.dwellMs || 500));
      }
      setLearningFeedback(`Successfully executed learned workflow "${workflow.name}" on PC.`);
      audioSynthesizer.playTaskCompleteSound();
    } catch (err: any) {
      setLearningFeedback(`Execution error: ${err.message}`);
    } finally {
      setExecutingWorkflowId(null);
    }
  };

  // Toggle Watcher Agent
  const handleToggleWatcher = async () => {
    const next = !watcherActive;
    setWatcherActive(next);
    const endpoint = next ? "/api/watcher/start" : "/api/watcher/stop";
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monitoredPrograms, monitoredFiles })
    });
    fetchLearnedData();
  };

  // Assemble a live task in real-time
  const handleAssembleTask = async () => {
    if (!assemblePrompt && !appToLaunch && !companionCommand) return;
    setIsAssembling(true);
    audioSynthesizer.playClickSound();

    try {
      const res = await fetch("/api/watcher/assemble-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: assemblePrompt,
          appToOpen: appToLaunch,
          companionCommand: companionCommand,
          actionType: companionCommand ? "companion_command" : appToLaunch ? "launch" : "click",
          x: 960,
          y: 540
        })
      });
      const data = await res.json();
      if (data.success) {
        setAssemblePrompt("");
        setAppToLaunch("");
        setCompanionCommand("");
        fetchLearnedData();
        audioSynthesizer.playTaskCompleteSound();
      }
    } catch (err) {
      console.error("Task assembly error:", err);
    } finally {
      setIsAssembling(false);
    }
  };

  // Execute assembled task on PC
  const handleExecuteAssembledTask = async (task: any) => {
    audioSynthesizer.playClickSound();
    try {
      await fetch("/api/pyautogui/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: task.action === "companion_command" ? "companion_command" : task.action === "launch" ? "launch_app" : task.action,
          targetPosition: task.parameters?.x ? { x: task.parameters.x, y: task.parameters.y } : undefined,
          text: task.parameters?.text,
          key: task.parameters?.key,
          companionCommand: task.parameters?.command,
          launchApp: task.parameters?.appName
        })
      });
      fetchLearnedData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 text-slate-100 font-mono text-xs">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h2 className="text-base font-bold text-white tracking-wide">
              Autonomous Learning & Live Watcher Agent
            </h2>
            <Badge className="bg-indigo-900/80 text-indigo-300 border-indigo-600/60 text-[10px]">
              AUTONOMOUS VISION 2.0
            </Badge>
          </div>
          <p className="text-slate-400 text-xs">
            Detects repeating patterns from workflow history, creates automatic parameterized workflows, monitors system programs/files, and dynamically assembles tasks in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleTriggerLearning}
            disabled={isLoading}
            className="h-8 px-3.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold shadow-md gap-1.5"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-yellow-300" : "text-cyan-300"}`} />
            {isLoading ? "LEARNING PATTERNS..." : "LEARN FROM TRACES (AI)"}
          </Button>

          <Button
            size="sm"
            onClick={handleToggleWatcher}
            className={`h-8 px-3.5 font-bold border transition-all ${
              watcherActive
                ? "bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-400 shadow-md ring-1 ring-emerald-400"
                : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700"
            }`}
          >
            <Activity className="w-3.5 h-3.5 mr-1 text-emerald-300" />
            WATCHER AGENT ({watcherActive ? "ACTIVE" : "PAUSED"})
          </Button>
        </div>
      </div>

      {learningFeedback && (
        <div className="p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-500/50 text-indigo-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            <span>{learningFeedback}</span>
          </div>
          <button onClick={() => setLearningFeedback(null)} className="text-slate-400 hover:text-white px-2">✕</button>
        </div>
      )}

      {/* Grid: 1. Autonomously Learned Workflows | 2. Watcher Agent & Task Assembly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Learned Workflows Library */}
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl">
          <CardHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Autonomously Learned Workflows ({learnedWorkflows.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Pattern-extracted workflows saved from historical interaction traces
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={fetchLearnedData} className="h-7 text-xs border-slate-700">
              <RefreshCw className="w-3 h-3 text-cyan-400" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <ScrollArea className="h-[380px] pr-2">
              <div className="space-y-3">
                {learnedWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-600/50 transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{wf.name}</span>
                          <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[9px]">
                            {Math.round((wf.confidenceScore || 0.9) * 100)}% Match
                          </Badge>
                          <Badge className="bg-slate-800 text-slate-300 text-[9px] capitalize">
                            {wf.patternType || "custom"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{wf.description}</p>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleExecuteLearnedWorkflow(wf)}
                        disabled={executingWorkflowId === wf.id}
                        className="h-7 px-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-[10px] gap-1 shadow-md shrink-0"
                      >
                        <Zap className="w-3 h-3 text-yellow-300" />
                        {executingWorkflowId === wf.id ? "RUNNING..." : "RUN ON PC"}
                      </Button>
                    </div>

                    {/* Step Pipeline Visualization */}
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-[10px]">
                      {wf.steps?.map((st: any, idx: number) => (
                        <div
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 shrink-0 flex items-center gap-1"
                        >
                          <span className="text-cyan-400 font-bold">{idx + 1}.</span>
                          <span className="font-semibold uppercase">{st.action}</span>
                          {st.text && <span className="text-slate-400 max-w-[80px] truncate">"{st.text}"</span>}
                          {st.key && <span className="text-amber-300">[{st.key}]</span>}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                      <span>Trigger: {wf.triggerCondition}</span>
                      <span>Executions: {wf.executionCount || 0}</span>
                    </div>
                  </div>
                ))}

                {learnedWorkflows.length === 0 && (
                  <div className="text-center py-10 text-slate-500">
                    No workflows learned yet. Click "LEARN FROM TRACES (AI)" above to extract patterns from your recordings.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Card 2: Watcher Agent & Live Task Assembly */}
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl flex flex-col justify-between">
          <CardHeader className="p-4 border-b border-slate-800 pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Live Task Assembly & Companion Commands
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Assemble tasks in real-time, launch secondary apps/windows, or run companion commands alongside workflows
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* Task Assembly Creator */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                Assemble Live Task or Command
              </span>

              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-400">Task Objective / Description:</label>
                  <Input
                    placeholder="e.g. Open calculator and solve expression, or inspect download file..."
                    value={assemblePrompt}
                    onChange={(e) => setAssemblePrompt(e.target.value)}
                    className="h-7 text-xs bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Launch App / Window:</label>
                    <Input
                      placeholder="e.g. calc.exe or notepad.exe"
                      value={appToLaunch}
                      onChange={(e) => setAppToLaunch(e.target.value)}
                      className="h-7 text-xs bg-slate-900 border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Companion Shell Command:</label>
                    <Input
                      placeholder="e.g. echo 'Job started' or dir"
                      value={companionCommand}
                      onChange={(e) => setCompanionCommand(e.target.value)}
                      className="h-7 text-xs bg-slate-900 border-slate-700"
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={handleAssembleTask}
                  disabled={isAssembling || (!assemblePrompt && !appToLaunch && !companionCommand)}
                  className="w-full h-7 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {isAssembling ? "ASSEMBLING TASK..." : "ASSEMBLE TASK & QUEUE FOR PC"}
                </Button>
              </div>
            </div>

            {/* Assembled Tasks Stream */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-300">Live Assembled Tasks Queue:</span>
              <ScrollArea className="h-[140px] pr-2">
                <div className="space-y-1.5">
                  {assembledTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <div className="font-bold text-slate-200 text-[11px] truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                          <span className="uppercase text-cyan-400">{t.action}</span>
                          {t.targetApp && <span>Target: {t.targetApp}</span>}
                          {t.parameters?.command && <span className="font-mono text-purple-300">cmd: {t.parameters.command}</span>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleExecuteAssembledTask(t)}
                        className="h-6 px-2 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white font-bold gap-1 shrink-0"
                      >
                        <Zap className="w-2.5 h-2.5 text-yellow-300" /> Run
                      </Button>
                    </div>
                  ))}
                  {assembledTasks.length === 0 && (
                    <div className="text-center py-4 text-slate-500 text-[11px]">
                      No tasks assembled yet.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Watcher Monitored Programs & Event Stream */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3 h-3 text-emerald-400" />
                Monitored Programs ({monitoredPrograms.length}) & System Events:
              </span>
              <div className="flex flex-wrap gap-1">
                {monitoredPrograms.map((p, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-300 text-[10px]">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
