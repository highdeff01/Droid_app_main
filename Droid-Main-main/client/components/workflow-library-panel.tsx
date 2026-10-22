import { useState, useMemo, useEffect, useRef } from "react";
import {
  Bookmark,
  CalendarClock,
  RefreshCw,
  ShieldCheck,
  ArrowUpDown,
  Play,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Zap,
  Sliders,
} from "lucide-react";
import type { AssistantWorkflow } from "@shared/assistant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ProgressFeed } from "./progress-feed";

type SortOption = "modifiedTime" | "name" | "status" | "repeatCount";

interface WorkingMethodTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  stepsCount: number;
  successRate: number;
  resilientAgainstAds: boolean;
  repeatSupported: boolean;
  steps: Array<{
    action: string;
    targetPosition?: { x: number; y: number };
    textPayload?: string;
    keyPayload?: string;
    delayMs?: number;
    description: string;
  }>;
}

export function WorkflowLibraryPanel() {
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem("assistant_session_id") ?? "",
  );
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem("workflow_sort_preference");
    return (saved as SortOption) || "modifiedTime";
  });
  const [workflows, setWorkflows] = useState<AssistantWorkflow[]>([]);
  const [templates, setTemplates] = useState<WorkingMethodTemplate[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const runGenRef = useRef(0);
  const [repeatCounts, setRepeatCounts] = useState<{ [id: string]: number }>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    localStorage.setItem("workflow_sort_preference", newSort);
  };

  // Load real working templates from the backend
  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/learning/templates");
      if (res.ok) {
        const data = await res.json();
        if (data.templates && data.templates.length > 0) {
          setTemplates(data.templates);
        }
      }
    } catch (e) {
      console.warn("Template fetch note:", e);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadWorkflows = async () => {
    setError("");
    setLoading(true);
    try {
      localStorage.setItem("assistant_session_id", sessionId);
      const response = await fetch(
        `/api/assistant/workflows?sessionId=${encodeURIComponent(sessionId)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load workflows");
      setWorkflows(data.workflows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load workflows",
      );
    } finally {
      setLoading(false);
    }
  };

  // Execute a template directly on PC / Device
  const handleExecuteTemplate = async (template: WorkingMethodTemplate) => {
    const repeat = repeatCounts[template.id] || 1;
    const gen = ++runGenRef.current;
    setExecutingId(template.id);
    toast.info(`Executing "${template.name}" (${repeat}x)...`);

    try {
      const res = await fetch(`/api/learning/templates/${template.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repeatCount: repeat }),
      });
      const data = await res.json();
      if (runGenRef.current !== gen) return;
      if (data.success) {
        toast.success(`Executed "${template.name}" successfully! (${data.totalStepsExecuted} steps)`);
      } else {
        toast.error(`Execution error: ${data.error || "Failed"}`);
      }
    } catch (err: any) {
      if (runGenRef.current === gen) {
        toast.error(`Execution failed: ${err.message}`);
      }
    } finally {
      if (runGenRef.current === gen) {
        setExecutingId(null);
      }
    }
  };

  // Load template steps into Sequence Studio for editing & live HUD playback
  const handleLoadIntoSequenceStudio = (template: WorkingMethodTemplate) => {
    try {
      const convertedSteps = template.steps.map((st: any, idx) => {
        const rawX = st.targetPosition?.x ?? st.x;
        const rawY = st.targetPosition?.y ?? st.y;
        const hasCoords = typeof rawX === "number" && typeof rawY === "number";

        return {
          id: `tpl_step_${Date.now()}_${idx}`,
          stepNumber: idx + 1,
          name: st.name || st.description || `Step ${idx + 1} (${st.action.toUpperCase()})`,
          x: hasCoords ? rawX : 0,
          y: hasCoords ? rawY : 0,
          delayMs: st.delayMs ?? 500,
          text: st.textPayload || st.text || "",
          keyPayload: st.keyPayload || st.key || "enter",
          status: "pending" as const,
        };
      });

      localStorage.setItem("unified_sequence", JSON.stringify(convertedSteps));
      window.dispatchEvent(new CustomEvent("load-workflow-sequence", { detail: { steps: convertedSteps } }));
      toast.success(`Loaded "${template.name}" into Sequence Studio! (${convertedSteps.length} steps)`);
    } catch {
      toast.error("Failed to load into sequence studio");
    }
  };

  const sortedWorkflows = useMemo(() => {
    return [...workflows].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "status") {
        return a.status.localeCompare(b.status);
      }
      if (sortBy === "repeatCount") {
        return (b.repeatCount || 0) - (a.repeatCount || 0);
      }
      const timeA = a.schedule?.nextRunAt ? new Date(a.schedule.nextRunAt).getTime() : 0;
      const timeB = b.schedule?.nextRunAt ? new Date(b.schedule.nextRunAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [workflows, sortBy]);

  return (
    <Card className="border-slate-800 bg-slate-950/70 text-slate-100 font-mono">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <span>Working Methods & Workflow Library</span>
            </CardTitle>
            <CardDescription className="text-slate-400 mt-1">
              Production-ready automation templates, ad-resilient routines, and scheduled execution packs.
            </CardDescription>
          </div>
          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-xs">
            {templates.length} Working Templates Ready
          </Badge>
        </div>

        <ProgressFeed title="Live workflow progress" limit={4} className="pt-2" />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-1 gap-2 min-w-[240px]">
            <Input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="Session ID (Optional)"
              aria-label="Assistant session ID"
              className="border-slate-700 bg-slate-900 text-xs h-8"
            />
            <Button size="sm" onClick={loadWorkflows} disabled={!sessionId || loading} className="h-8 text-xs">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Load Session
            </Button>
            <Button size="sm" variant="outline" onClick={loadTemplates} className="h-8 text-xs border-slate-700 text-cyan-300">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh Templates
            </Button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono">
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
              className="bg-transparent text-cyan-300 font-bold outline-none cursor-pointer"
            >
              <option value="modifiedTime" className="bg-slate-950 text-slate-200">Date Modified</option>
              <option value="name" className="bg-slate-950 text-slate-200">Name (A-Z)</option>
              <option value="status" className="bg-slate-950 text-slate-200">Status</option>
              <option value="repeatCount" className="bg-slate-950 text-slate-200">Repeat Count</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Real Working Templates Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Verified Executable Methods ({templates.length})
            </span>
            <span className="text-[10px] text-slate-500">Physical Hardware & Virtual Execution</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((tpl) => {
              const currentRepeat = repeatCounts[tpl.id] || 1;
              const isExecuting = executingId === tpl.id;

              return (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2.5 hover:border-cyan-500/50 transition-all shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                        <span>{tpl.name}</span>
                        {tpl.resilientAgainstAds && (
                          <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[8px]" title="Auto-dismisses ads and modals">
                            🛡️ Ad-Resilient
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{tpl.description}</p>
                    </div>
                    <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 text-[9px] uppercase py-0.5">
                      {tpl.category}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span>Steps: <strong className="text-slate-200">{tpl.stepsCount}</strong></span>
                    <span>•</span>
                    <span>Success Rate: <strong className="text-emerald-400">{Math.round(tpl.successRate * 100)}%</strong></span>
                    <span>•</span>
                    <span>OCR Grounded: <strong className="text-cyan-300">Yes</strong></span>
                  </div>

                  {/* Actions & Execution Controls */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {/* Repeat selector */}
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-slate-400">Repeat:</span>
                      <select
                        value={currentRepeat}
                        onChange={(e) =>
                          setRepeatCounts((prev) => ({
                            ...prev,
                            [tpl.id]: Number(e.target.value),
                          }))
                        }
                        className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-cyan-300 font-bold outline-none"
                      >
                        <option value={1}>1x</option>
                        <option value={3}>3x</option>
                        <option value={5}>5x</option>
                        <option value={10}>10x</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLoadIntoSequenceStudio(tpl)}
                        className="h-7 px-2 text-[10px] bg-slate-950 border-slate-700 text-slate-300 hover:text-white"
                        title="Load steps into sequence studio for live HUD playback"
                      >
                        Load to Studio
                      </Button>

                      <Button
                        size="sm"
                        disabled={isExecuting}
                        onClick={() => handleExecuteTemplate(tpl)}
                        className="h-7 px-3 text-[10px] font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-sm gap-1"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        {isExecuting ? "Running..." : `Run Method ${currentRepeat > 1 ? `(${currentRepeat}x)` : ""}`}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Saved Session Workflows */}
        {workflows.length > 0 && (
          <div className="space-y-3 pt-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block border-b border-slate-800 pb-2">
              Session Checkpoints & Saved Packs ({workflows.length})
            </span>

            {sortedWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="rounded-lg border border-slate-800 bg-slate-900/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-sm text-slate-100">{workflow.name}</h3>
                    <p className="text-xs text-slate-400">
                      {workflow.description || "No description"}
                    </p>
                  </div>
                  <Badge
                    variant={workflow.status === "paused" ? "secondary" : "default"}
                  >
                    {workflow.status}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                  <span>Repeat count: {workflow.repeatCount}</span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Next run:{" "}
                    {workflow.schedule.nextRunAt
                      ? new Date(workflow.schedule.nextRunAt).toLocaleString()
                      : "Not scheduled"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Bookmark className="h-3.5 w-3.5" />
                    Checkpoints: {workflow.checkpointIds.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Resume: {workflow.pauseResumePolicy.resumeMode}
                  </span>
                </div>
                {workflow.goals.map((goal) => {
                  const percent = goal.total
                    ? (goal.completed / goal.total) * 100
                    : 0;
                  return (
                    <div key={goal.goalId} className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-slate-400">
                        <span>{goal.title}</span>
                        <span>
                          {goal.completed}/{goal.total}
                        </span>
                      </div>
                      <Progress value={percent} className="h-2" />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
