import React, { useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronUp, MousePointerClick, PlayCircle, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HUD_LAYERS } from "@/lib/hud-layout";
import { calibrateCoordinates, getStoredCalibration, screenToViewport } from "@/lib/coordinate-calibration";
import { AI_SCOPE_LABEL, useAiScope } from "@/lib/ai-scope";
import type { MasterSnapshot } from "@/lib/master-ai";
import {
  ACTIVITY_LABEL,
  cognitionView,
  loadCuesEnabled,
  playActivityCue,
  saveCuesEnabled,
  type ActivityKind,
  type CognitionState,
} from "@/lib/cognition-feed";

export interface AiCognitionPanelProps {
  cognition: CognitionState;
  master?: MasterSnapshot | null;
  /** Native screen point of the AI cursor; the panel docks under the user's mouse when there is none. */
  aiCursor?: { x: number; y: number } | null;
}

const PANEL = { width: 320, offset: 28, margin: 8 };

const ACTIVITY_STYLE: Record<ActivityKind, string> = {
  thinking: "border-amber-500/60 bg-amber-950/80 text-amber-200",
  acting: "border-rose-500/70 bg-rose-950/80 text-rose-200",
  replay: "border-sky-500/60 bg-sky-950/80 text-sky-200",
};

const ACTIVITY_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  thinking: Brain,
  acting: MousePointerClick,
  replay: PlayCircle,
};

/** The AI cursor on the viewport (same calibration the cursor overlay uses), else the user's mouse. */
function useAnchor(aiCursor: AiCognitionPanelProps["aiCursor"]) {
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  if (aiCursor) {
    const profile = getStoredCalibration();
    return screenToViewport(calibrateCoordinates(aiCursor.x, aiCursor.y, profile), profile, { width: window.innerWidth, height: window.innerHeight });
  }
  return mouse;
}

function panelPosition(anchor: { x: number; y: number } | null, height: number) {
  if (!anchor) return { right: PANEL.margin * 2, bottom: PANEL.margin * 6 };
  const left = Math.min(window.innerWidth - PANEL.width - PANEL.margin, Math.max(PANEL.margin, anchor.x + PANEL.offset));
  const below = anchor.y + PANEL.offset;
  const top = below + height > window.innerHeight - PANEL.margin ? Math.max(PANEL.margin, anchor.y - PANEL.offset - height) : below;
  return { left, top };
}

/** Plays the cue (sound + flash) when the activity kind changes and cues are on. */
function useActivityCue(kind: ActivityKind | undefined, enabled: boolean) {
  const [flash, setFlash] = useState(false);
  const last = useRef<ActivityKind | undefined>(undefined);
  useEffect(() => {
    if (kind === last.current) return;
    last.current = kind;
    if (!enabled || !kind) return;
    playActivityCue(kind);
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 400);
    return () => clearTimeout(timer);
  }, [kind, enabled]);
  return flash;
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5">
      <span className="w-14 shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-[11px] text-slate-200 break-words">{value}</span>
    </div>
  );
}

/** Mouse-adjacent panel showing the AI's goal, current/next step and its real current thought. */
export const AiCognitionPanel: React.FC<AiCognitionPanelProps> = ({ cognition, master, aiCursor }) => {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cues, setCues] = useState(loadCuesEnabled);
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useAnchor(aiCursor);
  const scope = useAiScope();
  const activity = cognition.activity;
  const flash = useActivityCue(activity?.kind, cues);
  const view = cognitionView(cognition, master);

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className={cn("fixed bottom-12 right-4 rounded-full border border-cyan-500/50 bg-slate-950/90 p-2 text-cyan-300", HUD_LAYERS.floating)}
        title="Show AI cognition panel"
      >
        <Brain className="h-4 w-4" />
      </button>
    );
  }

  const toggleCues = () => {
    saveCuesEnabled(!cues);
    setCues(!cues);
  };
  const ActivityIcon = activity ? ACTIVITY_ICON[activity.kind] : null;

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      style={{ width: PANEL.width, ...panelPosition(anchor, ref.current?.offsetHeight ?? 160) }}
      className={cn(
        "fixed rounded-lg border bg-slate-950/95 p-2 font-mono shadow-xl backdrop-blur transition-[box-shadow] pointer-events-auto",
        HUD_LAYERS.floating,
        flash ? "border-cyan-300 shadow-cyan-500/50" : "border-slate-700",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
          <Brain className="h-3 w-3" /> AI cognition
          <span className="ml-1 font-normal normal-case text-slate-500">· {AI_SCOPE_LABEL[scope.mode]}</span>
        </span>
        <span className="flex items-center gap-1 text-slate-400">
          <button type="button" onClick={toggleCues} title={cues ? "Turn off sound/visual cues" : "Turn on sound/visual cues"}>
            {cues ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setDismissed(true)} title="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {activity && ActivityIcon ? (
        <div className={cn("mt-1 flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold", ACTIVITY_STYLE[activity.kind])}>
          <ActivityIcon className="h-3 w-3" /> {ACTIVITY_LABEL[activity.kind]}
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-slate-100 break-words">{view.thought}</p>
      {!collapsed ? (
        <div className="mt-1 space-y-0.5 border-t border-slate-800 pt-1">
          <Row label="Detail" value={view.detail} />
          <Row label="Goal" value={view.goal} />
          <Row label="Current" value={view.current} />
          <Row label="Next" value={view.next} />
          <Row label="Check" value={view.narration} />
          <Row label="Pipeline" value={view.pipeline} />
          <Row label="Master" value={view.master} />
        </div>
      ) : null}
    </div>
  );
};
