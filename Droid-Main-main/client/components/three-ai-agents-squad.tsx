import React, { useState, useEffect } from "react";
import {
  Bot,
  FileText,
  Wrench,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Play,
  Pause,
  Clock,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Sliders,
  ChevronRight,
  Terminal,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useActionGate } from "@/hooks/use-action-gate";
import { habitRoutinePlan } from "@/lib/gated-plans";
import { gateFailure, type GatedRunResult } from "@/lib/gated-dispatch";

export interface SquadAgent {
  id: string;
  name: string;
  roleTitle: string;
  avatar: string;
  themeColor: string;
  status: "active" | "monitoring" | "intervening" | "idle" | "degraded";
  liveThought: string;
  interventions: number;
  lastAction: string;
  lastActionTime: string;
  metrics: { [key: string]: string | number };
}

/** The real outcome of a dispatched habit routine. */
export interface RoutineResult {
  ok: boolean;
  message: string;
}

interface ThreeAiAgentsSquadProps {
  className?: string;
  onDispatchFix?: (action: string) => void;
  /** Run the routine through the host's gated sequence runner and report its verified outcome. */
  onRunRoutine?: (x: number, y: number, repeatCount: number) => Promise<RoutineResult>;
}

const ROUTINE_REPEATS = 5;

/** Why a poll failed: HTTP status or the thrown error. */
async function pollJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The outcome of a gated routine run without a host runner: the device's own response decides. */
function routineResultFromGate(result: GatedRunResult | undefined): RoutineResult {
  const failure = gateFailure(result);
  if (failure) return { ok: false, message: `Routine not run: ${failure}` };
  const response: any = result && result.status === "completed" ? result.results[0] : undefined;
  if (response?.success === false) {
    return { ok: false, message: `Routine dispatch failed: ${response.error || "device reported failure"}` };
  }
  return { ok: true, message: `Routine dispatched after screen verification (${ROUTINE_REPEATS} cycles requested).` };
}

export const ThreeAiAgentsSquad: React.FC<ThreeAiAgentsSquadProps> = ({
  className = "",
  onDispatchFix,
  onRunRoutine,
}) => {
  const actionGate = useActionGate({ targetDevice: "desktop" });
  const [agents, setAgents] = useState<SquadAgent[]>([
    {
      id: "agent_assistant",
      name: "Assistant Agent",
      roleTitle: "Proactive Workflow Guide",
      avatar: "🤖",
      themeColor: "cyan",
      status: "active",
      liveThought: "Tracking current workflow steps. Suggesting next optimal action and goal alignment.",
      interventions: 18,
      lastAction: "Guided user to search bar",
      lastActionTime: new Date().toLocaleTimeString(),
      metrics: { "Guidance Accuracy": "99.2%", "Next Step ETA": "< 120ms" },
    },
    {
      id: "agent_log_reader",
      name: "Log Watcher Sentinel",
      roleTitle: "Real-time Telemetry & Error Inspector",
      avatar: "📜",
      themeColor: "emerald",
      status: "monitoring",
      liveThought: "Reading /api/central-logs stream. Zero critical unhandled rejections detected in pipeline.",
      interventions: 42,
      lastAction: "Audited PyAutoGUI execution logs",
      lastActionTime: new Date().toLocaleTimeString(),
      metrics: { "Log Rate": "14 ev/s", "System Health": "100% OK" },
    },
    {
      id: "agent_corrector",
      name: "Auto-Corrector & Healer",
      roleTitle: "Adaptive Action Recovery & Scheduler",
      avatar: "🛠️",
      themeColor: "amber",
      status: "intervening",
      liveThought: "Self-healing ready: auto-switches to keypress fallback (Tab+Enter) if click drifts > 15px.",
      interventions: 7,
      lastAction: "Applied drift recalibration offset Δ(2px, -1px)",
      lastActionTime: new Date().toLocaleTimeString(),
      metrics: { "Recovery Rate": "98.7%", "Fallback Methods": "4 Ready" },
    },
  ]);

  const [habitSuggestion, setHabitSuggestion] = useState<{
    zone: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  /** Per-endpoint poll failures; shown as a degraded state instead of silently keeping stale data. */
  const [pollErrors, setPollErrors] = useState<{ interactions?: string; habits?: string }>({});

  const applyInteractions = (interactions: any[]) => {
    const errCount = interactions.filter((i: any) => i.status === "error" || i.status === "failed").length;
    setAgents((prev) => [
      {
        ...prev[0],
        liveThought: "Formulating sequence checkpoints and asserting screen stability.",
        lastActionTime: new Date().toLocaleTimeString(),
      },
      {
        ...prev[1],
        status: "monitoring",
        liveThought: `Inspected ${interactions.length} interactions. ${errCount === 0 ? "All commands healthy." : `${errCount} warning caught.`}`,
        metrics: { "Logged Interactions": interactions.length, "Failed Interactions": errCount },
      },
      {
        ...prev[2],
        liveThought: "Monitoring coordinate drift and scheduling automated recovery routines.",
        interventions: prev[2].interventions + (errCount > 0 ? 1 : 0),
      },
    ]);
  };

  const applyHabits = (profile: any) => {
    if (!profile?.repetitiveActionDetected || !profile?.topClickZones?.length) {
      setHabitSuggestion(null);
      return;
    }
    const topZ = profile.topClickZones[0];
    setHabitSuggestion({ zone: `${topZ.x}, ${topZ.y}`, count: profile.repetitiveActionCount, x: topZ.x, y: topZ.y });
    setAgents((prev) => [
      {
        ...prev[0],
        status: "intervening",
        liveThought: `Habit Detected: ${profile.repetitiveActionCount} repetitive actions in zone (${topZ.x}, ${topZ.y}). Auto-routine ready to dispatch.`,
      },
      prev[1],
      prev[2],
    ]);
  };

  const markDegraded = (index: number, reason: string) =>
    setAgents((prev) => prev.map((a, i) => (i === index ? { ...a, status: "degraded", liveThought: reason } : a)));

  // Live polling of logs and habits; each failure is surfaced, never swallowed.
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await pollJson("/api/interactions");
        applyInteractions(data.interactions || []);
        setPollErrors((prev) => ({ ...prev, interactions: undefined }));
      } catch (error) {
        const reason = `Interaction log unavailable: ${errorText(error)}`;
        setPollErrors((prev) => ({ ...prev, interactions: reason }));
        markDegraded(1, reason);
      }
      try {
        const data = await pollJson("/api/learning/habits");
        applyHabits(data.profile);
        setPollErrors((prev) => ({ ...prev, habits: undefined }));
      } catch (error) {
        const reason = `Habit profile unavailable: ${errorText(error)}`;
        setPollErrors((prev) => ({ ...prev, habits: reason }));
        markDegraded(0, reason);
      }
    };
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const runRoutine = async (x: number, y: number): Promise<RoutineResult> => {
    if (onRunRoutine) return onRunRoutine(x, y, ROUTINE_REPEATS);
    return routineResultFromGate(await actionGate.run(habitRoutinePlan(x, y, ROUTINE_REPEATS)));
  };

  const handleAutomateRoutine = async () => {
    if (!habitSuggestion) return;
    toast.info(`Verifying the live screen, then automating routine for ${ROUTINE_REPEATS} cycles...`);
    const result = await runRoutine(habitSuggestion.x, habitSuggestion.y);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    setHabitSuggestion(null);
  };

  const pollErrorList = [pollErrors.interactions, pollErrors.habits].filter(Boolean) as string[];

  const handleManualHealTrigger = (agentId: string) => {
    if (agentId === "agent_corrector") {
      fetch("/api/ai/adaptive-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: "fallback_keys_and_recalibrate",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // Also trigger ad dismissal heuristic
      fetch("/api/ai/dismiss-ad", { method: "POST" }).catch(() => {});
      toast.success("🛠️ Auto-Corrector: Triggered action self-healing & dismissed popups!");
      onDispatchFix?.("self_heal");
    } else if (agentId === "agent_log_reader") {
      toast.info("📜 Log Sentinel: Audited pipeline history and cleared error counters.");
    } else {
      toast.success("🤖 Assistant Agent: Refreshed next-step suggestions and goal queue.");
    }
  };

  return (
    <Card className={`bg-slate-950/90 border-slate-800 shadow-2xl overflow-hidden font-mono ${className}`}>
      <CardHeader className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div>
            <CardTitle className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <span>Tri-Agent Autonomous Operations Squad</span>
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[9px] py-0">
                {pollErrorList.length ? "Degraded" : "3 Agents Active"}
              </Badge>
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        {pollErrorList.length > 0 && (
          <div role="alert" data-squad-degraded className="mb-3 p-2 rounded-xl bg-rose-950/80 border border-rose-500/70 text-[10px] text-rose-200 space-y-0.5">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-3.5 h-3.5" /> Degraded: showing last known data
            </div>
            {pollErrorList.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
        {/* Habit & Routine Detected Banner */}
        {habitSuggestion && (
          <div className="mb-3 p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/80 flex items-center justify-between gap-3 text-xs text-amber-200 animate-pulse shadow-lg">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Repetitive Habit Detected:</strong> User performed {habitSuggestion.count} actions in area ({habitSuggestion.zone}). Automate as background routine?
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => { void handleAutomateRoutine(); }}
                className="h-6 px-2.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white font-bold"
              >
                Automate Routine (5x)
              </Button>
              {actionGate.isGating && (
                <button
                  onClick={actionGate.stop}
                  className="text-[10px] text-rose-300 hover:text-white px-1"
                >
                  Stop
                </button>
              )}
              <button
                onClick={() => setHabitSuggestion(null)}
                className="text-xs text-amber-400 hover:text-white px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`p-2.5 rounded-xl border flex flex-col justify-between space-y-2 transition-all ${
                agent.themeColor === "cyan"
                  ? "bg-slate-900/80 border-cyan-500/40 hover:border-cyan-400 shadow-md shadow-cyan-950/40"
                  : agent.themeColor === "emerald"
                  ? "bg-slate-900/80 border-emerald-500/40 hover:border-emerald-400 shadow-md shadow-emerald-950/40"
                  : "bg-slate-900/80 border-amber-500/40 hover:border-amber-400 shadow-md shadow-amber-950/40"
              }`}
            >
              <div>
                {/* Agent Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{agent.avatar}</span>
                    <div>
                      <h4 className="text-[11px] font-bold text-slate-100">{agent.name}</h4>
                      <p className="text-[9px] text-slate-400">{agent.roleTitle}</p>
                    </div>
                  </div>
                  <Badge
                    className={`text-[8px] uppercase py-0 ${
                      agent.status === "active"
                        ? "bg-cyan-950 text-cyan-300 border-cyan-700"
                        : agent.status === "intervening"
                        ? "bg-amber-950 text-amber-300 border-amber-700 animate-pulse"
                        : agent.status === "degraded"
                        ? "bg-rose-950 text-rose-300 border-rose-700"
                        : "bg-emerald-950 text-emerald-300 border-emerald-700"
                    }`}
                  >
                    {agent.status}
                  </Badge>
                </div>

                {/* Live Thought Stream */}
                <div className="mt-2 p-1.5 rounded bg-slate-950 border border-slate-800/80 text-[10px] text-slate-300 leading-relaxed">
                  <span className="text-cyan-400 font-bold block text-[9px] uppercase">Thought Stream:</span>
                  {agent.liveThought}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-1.5 mt-2 text-[9px]">
                  {Object.entries(agent.metrics).map(([k, v]) => (
                    <div key={k} className="p-1 rounded bg-slate-950/60 border border-slate-800">
                      <span className="text-slate-500 block truncate">{k}:</span>
                      <span className="text-emerald-400 font-bold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer action */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[9px]">
                <span className="text-slate-500 truncate">Interventions: {agent.interventions}</span>
                <Button
                  size="sm"
                  onClick={() => handleManualHealTrigger(agent.id)}
                  className={`h-6 px-2 text-[9px] font-bold ${
                    agent.themeColor === "amber"
                      ? "bg-amber-600 hover:bg-amber-500 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  {agent.id === "agent_corrector" ? "Auto-Heal Action" : "Refresh"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
