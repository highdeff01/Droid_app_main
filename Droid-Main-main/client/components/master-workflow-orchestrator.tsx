import React from "react";
import { Play, Pause, Square, Clock, Zap, Layers, Activity, RotateCcw } from "lucide-react";
import type { ReplayRun } from "@shared/replay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  currentTimelineStage,
  timelineLog,
  timelineStageStatuses,
  type TimelineStageStatus,
} from "@/lib/replay-timeline";

/** Visual grouping of a replay run's event phases; descriptions only, no claimed verification. */
const TIMELINE_STAGES = [
  { name: "1. Run Setup", description: "Replay engine accepted the run and connected to the target device" },
  { name: "2. Perception & Planning", description: "Engine captures the screen and plans the next action" },
  { name: "3. Execute Action", description: "Engine dispatches the recorded click / type / key action" },
  { name: "4. Recovery", description: "Engine retries or recovers when an action did not land" },
  { name: "5. Post-Action Verification", description: "Engine compares the screen after the action" },
  { name: "6. Run Summary", description: "All actions finished; completion recorded" },
  { name: "7. Completed", description: "Run reached its completed state" },
];

const STATUS_BADGE: Record<TimelineStageStatus, string> = {
  idle: "text-slate-400 border-slate-800",
  running: "text-cyan-300 border-cyan-500 bg-cyan-950/40 animate-pulse",
  done: "text-emerald-300 border-emerald-800 bg-emerald-950/40",
  failed: "text-red-300 border-red-800 bg-red-950/40",
};

interface MasterWorkflowOrchestratorProps {
  run?: ReplayRun | null;
  onRun?: () => void;
  onControl?: (command: "pause" | "resume" | "cancel") => Promise<void>;
}

function elapsedLabel(run: ReplayRun | null): string {
  if (!run) return "0m 0s";
  const end = run.events[run.events.length - 1]?.at ?? run.startedAt;
  const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const RunControls: React.FC<Required<Pick<MasterWorkflowOrchestratorProps, "onRun" | "onControl">> & { run: ReplayRun | null }> = ({
  run,
  onRun,
  onControl,
}) => {
  const active = run && (run.status === "running" || run.status === "paused");
  if (!active) {
    return (
      <Button size="sm" onClick={onRun} className="h-7 text-xs font-mono font-bold bg-cyan-600 text-white">
        <Play className="w-3.5 h-3.5 mr-1" /> Run Recorded Sequence
      </Button>
    );
  }
  const paused = run.status === "paused";
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => void onControl(paused ? "resume" : "pause")}
        className="h-7 text-xs font-mono font-bold bg-amber-600 text-white"
      >
        {paused ? <Play className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void onControl("cancel")} className="h-7 text-xs font-mono">
        <Square className="w-3.5 h-3.5 mr-1" /> Cancel
      </Button>
    </div>
  );
};

/**
 * Visual timeline of the Dashboard's real replay run. Stage progress and the
 * log come from the replay engine's own status and events.
 */
export const MasterWorkflowOrchestrator: React.FC<MasterWorkflowOrchestratorProps> = ({
  run = null,
  onRun = () => {},
  onControl = async () => {},
}) => {
  const currentStage = currentTimelineStage(run);
  const statuses = timelineStageStatuses(run);
  const logs = timelineLog(run);
  const progress = run && run.total > 0 ? (run.completed / run.total) * 100 : 0;

  return (
    <div className="space-y-4 font-mono">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-cyan-500/40 shadow-xl">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Replay Run</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <strong className="text-slate-100 text-sm uppercase">{run ? run.status : "no run yet"}</strong>
            <p className="text-[10px] text-slate-300 truncate">
              {run?.error ?? TIMELINE_STAGES[currentStage - 1].name}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-purple-500/40 shadow-xl">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4" />
              <span>Actions Completed</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <strong className="text-purple-300 text-sm">
              {run?.completed ?? 0} / {run?.total ?? 0} (iteration {run?.iteration ?? 0})
            </strong>
            <Progress value={progress} className="h-1.5 bg-slate-800" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-emerald-500/40 shadow-xl">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>Elapsed (last event)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            <strong className="text-emerald-300 text-sm">{elapsedLabel(run)}</strong>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="pb-2 bg-slate-950 border-b border-slate-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Replay Visual Timeline</span>
            </CardTitle>
            <p className="text-[10px] text-slate-400 mt-1">
              Visual grouping of the replay engine's event phases — not an AI verification score.
            </p>
          </div>
          <RunControls run={run} onRun={onRun} onControl={onControl} />
        </CardHeader>
        <CardContent className="p-4 space-y-2.5">
          {TIMELINE_STAGES.map((stage, index) => (
            <div
              key={stage.name}
              className={`p-3 rounded-xl border text-xs flex flex-col gap-1 ${
                index + 1 === currentStage && run ? "bg-slate-950 border-cyan-500" : "bg-slate-950/40 border-slate-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[9px] font-mono uppercase ${STATUS_BADGE[statuses[index]]}`}>
                  {statuses[index]}
                </Badge>
                <span className="font-bold text-slate-100">{stage.name}</span>
              </div>
              <p className="text-[10px] text-slate-300">{stage.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="pb-2 bg-slate-950 border-b border-slate-800">
          <CardTitle className="text-xs font-bold text-cyan-400 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>Replay Engine Event Feed</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <ScrollArea className="h-44 pr-2">
            <div className="space-y-2">
              {logs.length === 0 && (
                <p className="text-[11px] text-slate-400">No replay events yet. Run a recorded sequence to see real engine events.</p>
              )}
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2.5 text-xs font-mono"
                >
                  <span className="text-[10px] text-slate-400">{entry.timestamp}</span>
                  <Badge className="bg-cyan-950 text-cyan-300 border-cyan-800 text-[9px]">STAGE #{entry.stageNumber}</Badge>
                  <span className="text-slate-200 font-bold uppercase text-[10px]">{entry.phase}</span>
                  <span className="text-slate-300 text-[10px]">{entry.detail}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
