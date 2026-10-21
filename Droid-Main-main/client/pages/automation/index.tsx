import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Play,
  Pause,
  RefreshCw,
  Check,
  X,
  Bot,
  Settings,
  ListChecks,
} from "lucide-react";
import type { SequenceStep } from "@/components/live-screen-hud";
import type { AIReviewResult } from "@/components/ai-workflow-review-modal";
import {
  TERMINAL_REPLAY_STATUSES,
  captureScreenFrame,
  fetchReplay,
  generateAutomationSteps,
  reviewAutomationSteps,
  startReplay,
  stopAutomationRun,
  type ReplayRunSnapshot,
} from "@/lib/automation-runner";

const REPLAY_POLL_MS = 1000;

interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  steps: SequenceStep[];
  review: AIReviewResult | null;
  reviewError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default function AutomationPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("tasks");
  const [objective, setObjective] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [agentNotes, setAgentNotes] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const runAbortRef = useRef<AbortController | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);
  const replayIdRef = useRef<string | null>(null);
  const lastLoggedStepRef = useRef(-1);

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;

  const addLog = (message: string) => setLogs((prev) => [...prev, message]);

  const updateTask = (id: string, patch: Partial<Task>) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date() } : t)),
    );

  const clearRunTimers = () => {
    clearTimeout(pollTimerRef.current);
    runAbortRef.current?.abort();
    runAbortRef.current = null;
  };

  useEffect(
    () => () => {
      clearRunTimers();
      generateAbortRef.current?.abort();
      if (replayIdRef.current) void stopAutomationRun(replayIdRef.current);
    },
    [],
  );

  const reviewTask = async (task: Task, screenshot: string, signal: AbortSignal) => {
    addLog("Requesting AI review of generated steps...");
    try {
      const review = await reviewAutomationSteps(task.steps, screenshot, task.title, signal);
      updateTask(task.id, { review, reviewError: null });
      addLog(`AI review: ${review.overallScore}% (${review.overallStatus}) — ${review.summary}`);
    } catch (error) {
      if (signal.aborted) return;
      updateTask(task.id, { reviewError: errorMessage(error) });
      addLog(`AI review failed: ${errorMessage(error)}`);
      toast.error(`AI review failed: ${errorMessage(error)}`);
    }
  };

  const generateTasks = async () => {
    const goal = objective.trim();
    if (!goal) return;
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setIsGenerating(true);
    addLog("Capturing screen and asking the AI planner for steps...");
    try {
      const screenshot = await captureScreenFrame(controller.signal);
      const steps = await generateAutomationSteps(goal, screenshot, controller.signal);
      const task: Task = {
        id: crypto.randomUUID(),
        title: goal,
        description: `${steps.length} AI-generated step(s)`,
        status: "pending",
        steps,
        review: null,
        reviewError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setTasks((prev) => [...prev, task]);
      setActiveTaskId(task.id);
      setObjective("");
      addLog(`Generated ${steps.length} step(s) for "${goal}"`);
      await reviewTask(task, screenshot, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      addLog(`Error generating tasks: ${errorMessage(error)}`);
      toast.error(`Task generation failed: ${errorMessage(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const finishRun = (taskId: string, status: "completed" | "failed", detail?: string) => {
    clearRunTimers();
    replayIdRef.current = null;
    setIsRunning(false);
    updateTask(taskId, { status });
    addLog(status === "completed" ? "Task completed" : `Task failed: ${detail || "replay stopped"}`);
  };

  const applyRun = (taskId: string, steps: SequenceStep[], run: ReplayRunSnapshot) => {
    updateTask(taskId, {
      steps: steps.map((step) => ({
        ...step,
        status: (run.steps.find((s) => s.id === step.id)?.status as SequenceStep["status"]) || step.status,
      })),
    });
    if (run.currentStep !== lastLoggedStepRef.current && steps[run.currentStep]) {
      lastLoggedStepRef.current = run.currentStep;
      addLog(`Executing step ${run.currentStep + 1}: ${steps[run.currentStep].name}`);
    }
  };

  const pollReplay = (taskId: string, steps: SequenceStep[], replayId: string, signal: AbortSignal) => {
    pollTimerRef.current = setTimeout(async () => {
      let run: ReplayRunSnapshot;
      try {
        run = await fetchReplay(replayId, signal);
      } catch (error) {
        if (!signal.aborted) finishRun(taskId, "failed", `Monitor disconnected: ${errorMessage(error)}`);
        return;
      }
      if (signal.aborted) return;
      applyRun(taskId, steps, run);
      if (!TERMINAL_REPLAY_STATUSES.includes(run.status)) {
        pollReplay(taskId, steps, replayId, signal);
        return;
      }
      finishRun(taskId, run.status === "completed" ? "completed" : "failed", run.error || run.status);
    }, REPLAY_POLL_MS);
  };

  const startAutomation = async () => {
    if (!activeTask || isRunning) return;
    if (!activeTask.review) {
      toast.error("This task has no successful AI review; generate it again before running.");
      return;
    }
    const task = activeTask;
    clearRunTimers();
    const controller = new AbortController();
    runAbortRef.current = controller;
    lastLoggedStepRef.current = -1;
    setIsRunning(true);
    updateTask(task.id, { status: "in-progress" });
    addLog(`Starting task: ${task.title}`);
    try {
      const run = await startReplay(task.steps, controller.signal);
      if (controller.signal.aborted) {
        void stopAutomationRun(run.id);
        return;
      }
      replayIdRef.current = run.id;
      addLog(`Replay ${run.id} started`);
      applyRun(task.id, task.steps, run);
      pollReplay(task.id, task.steps, run.id, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) finishRun(task.id, "failed", errorMessage(error));
    }
  };

  const stopAutomation = async () => {
    const replayId = replayIdRef.current;
    clearRunTimers();
    replayIdRef.current = null;
    setIsRunning(false);
    if (activeTaskId) updateTask(activeTaskId, { status: "failed" });
    addLog("Automation stopped by user");
    const failures = await stopAutomationRun(replayId);
    failures.forEach((failure) => addLog(`Stop request failed: ${failure}`));
    if (failures.length) toast.error(`Stop may be incomplete: ${failures.join("; ")}`);
  };

  const addNote = () => {
    if (!agentNotes.trim()) return;

    setLogs((prev) => [...prev, `Note: ${agentNotes}`]);
    setAgentNotes("");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">AI Automation</h1>
        <Button onClick={() => navigate("/")} variant="outline">
          Back to Dashboard
        </Button>
      </div>

      <Tabs
        defaultValue="tasks"
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="tasks">
            <ListChecks className="w-4 h-4 mr-2" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Objective</CardTitle>
              <CardDescription>
                Describe what you want to automate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2">
                <Input
                  placeholder="Enter your automation objective..."
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  disabled={isGenerating || isRunning}
                />
                <Button
                  onClick={generateTasks}
                  disabled={!objective.trim() || isGenerating || isRunning}
                >
                  {isGenerating ? "Generating..." : "Generate Tasks"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Task List */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Tasks</CardTitle>
                <CardDescription>Generated automation tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {tasks.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No tasks generated yet. Enter an objective and click
                        'Generate Tasks'.
                      </p>
                    ) : (
                      tasks.map((task) => (
                        <div
                          key={task.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            activeTask?.id === task.id
                              ? "bg-muted"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => !isRunning && setActiveTaskId(task.id)}
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium">{task.title}</h4>
                            <Badge
                              variant={
                                task.status === "completed"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {task.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {task.description}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Task Details */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>
                      {activeTask ? activeTask.title : "No Task Selected"}
                    </CardTitle>
                    <CardDescription>
                      {activeTask
                        ? activeTask.description
                        : "Select a task to view details"}
                    </CardDescription>
                  </div>
                  <div className="space-x-2">
                    {isRunning ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={stopAutomation}
                      >
                        <Pause className="w-4 h-4 mr-2" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={startAutomation}
                        disabled={!activeTask?.review || isRunning}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeTask && (
                    <div>
                      <h4 className="font-medium mb-2">AI Review</h4>
                      {activeTask.review ? (
                        <p className="text-sm">
                          <Badge variant="secondary" className="mr-2">
                            {activeTask.review.overallScore}% ·{" "}
                            {activeTask.review.overallStatus}
                          </Badge>
                          {activeTask.review.summary}
                        </p>
                      ) : (
                        <p role="alert" className="text-sm text-destructive">
                          {activeTask.reviewError
                            ? `Review failed: ${activeTask.reviewError}. Start is disabled.`
                            : "Review pending..."}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <h4 className="font-medium mb-2">Steps</h4>
                    <div className="space-y-2">
                      {activeTask?.steps.map((step) => (
                        <div key={step.id} className="flex items-start space-x-2">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                            {step.status === "failed" ? (
                              <X className="w-3 h-3 text-destructive" />
                            ) : step.status === "running" ? (
                              <RefreshCw className="w-3 h-3 text-primary animate-spin" />
                            ) : step.status === "completed" ? (
                              <Check className="w-3 h-3 text-primary" />
                            ) : (
                              <Bot className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                          <p className="text-sm">
                            {step.stepNumber}. {step.name}{" "}
                            <span className="text-muted-foreground font-mono">
                              ({step.action} @ {step.x},{step.y})
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Agent Notes</h4>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Add a note for the agent..."
                        value={agentNotes}
                        onChange={(e) => setAgentNotes(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addNote()}
                      />
                      <Button onClick={addNote}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Note
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Execution Logs</h4>
                    <div className="bg-black/5 p-3 rounded-md h-[200px] overflow-y-auto">
                      {logs.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          No logs yet. Start the automation to see logs.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {logs.map((log, index) => (
                            <div key={index} className="text-sm font-mono">
                              <span className="text-muted-foreground">
                                [{new Date().toLocaleTimeString()}]
                              </span>{" "}
                              {log}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Automation Settings</CardTitle>
              <CardDescription>
                Configure automation behavior and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Agent Behavior</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="autoRetry"
                        className="w-4 h-4"
                        defaultChecked
                      />
                      <label htmlFor="autoRetry" className="text-sm">
                        Automatically retry failed tasks
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="notifications"
                        className="w-4 h-4"
                        defaultChecked
                      />
                      <label htmlFor="notifications" className="text-sm">
                        Enable desktop notifications
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">AI Model</h4>
                  <select className="w-full p-2 border rounded-md">
                    <option value="qwen2.5vl:7b">Qwen 7B (Default)</option>
                    <option value="llama2:7b">Llama 2 7B</option>
                    <option value="gpt-4">GPT-4</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
