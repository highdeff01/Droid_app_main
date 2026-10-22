import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Film,
  ImageOff,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type {
  GeneratedStory,
  StoryGenerateRequest,
  StoryPerspective,
  StoryScene,
  StorySourceKind,
} from "@shared/story";
import { STORY_PERSPECTIVES } from "@shared/story";
import { describeDeviceOutcome } from "@shared/device-execution";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionGate } from "@/hooks/use-action-gate";
import { gateFailure } from "@/lib/gated-dispatch";
import { captureScreenFrame } from "@/lib/automation-runner";
import {
  fetchRecentRuns,
  generateStory,
  sceneActionPlan,
  type RecentRun,
} from "@/lib/story-client";
import { PresentationStudio } from "./presentation-studio";

type PerspectiveChoice = StoryPerspective | "mixed";
type PerspectiveFilter = StoryPerspective | "all";

const SOURCE_LABELS: Record<StorySourceKind, string> = {
  premise: "Typed premise",
  topic: "Topic",
  screen: "Current screen",
  run: "Recent run",
};

const perspectiveLabel = (p: string) => p.replace("_viewpoint", "").replace("_", " ");

const AUTO_PLAY_MS = 3500;

/** Builds the request for the chosen source; screen stories capture a fresh frame first. */
async function buildStoryRequest(
  source: StorySourceKind,
  text: string,
  runId: string,
  perspective: PerspectiveChoice,
): Promise<StoryGenerateRequest> {
  if (source === "screen") return { source, perspective, imageData: await captureScreenFrame() };
  if (source === "run") return { source, perspective, runId };
  return { source, perspective, text };
}

/** A real screenshot, or clearly labeled placeholder art when the story has none. */
const SceneBackdrop: React.FC<{ scene: StoryScene; dim?: boolean }> = ({ scene, dim }) =>
  scene.backgroundImage ? (
    <img
      src={scene.backgroundImage}
      alt={`Screenshot for ${scene.title}`}
      className={`w-full h-full object-cover ${dim ? "opacity-90" : ""}`}
    />
  ) : (
    <div className="w-full h-full bg-gradient-to-br from-slate-800 via-indigo-950 to-slate-900 flex items-start justify-end p-3">
      <span className="flex items-center gap-1 text-[10px] text-slate-300 bg-slate-950/70 rounded px-2 py-1">
        <ImageOff className="w-3 h-3" /> Placeholder art — no screenshot
      </span>
    </div>
  );

/** The scene's suggested device move; executed only through the action gate. */
const SceneActionBridge: React.FC<{
  scene: StoryScene;
  busy: boolean;
  onExecute: () => void;
}> = ({ scene, busy, onExecute }) => {
  const action = scene.inAppAction;
  if (!action) {
    return (
      <p className="text-[11px] text-slate-400">
        No in-app action: only stories built from the current screen can suggest one.
      </p>
    );
  }
  return (
    <div className="p-3 rounded-xl bg-slate-950 border border-purple-900/60 flex items-center justify-between gap-3 text-xs">
      <div className="space-y-0.5">
        <span className="text-[9px] text-purple-400 font-bold uppercase flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" /> Story ➔ In-App Action Bridge
        </span>
        <p className="text-[11px] text-slate-200">
          <strong>{action.description}</strong> — {action.actionType} at ({action.x}, {action.y})
          {action.payload ? ` "${action.payload}"` : ""}
        </p>
      </div>
      <Button
        size="sm"
        onClick={onExecute}
        disabled={busy}
        className="h-8 text-xs font-mono font-bold bg-purple-600 hover:bg-purple-500 text-white"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
        Execute in App
      </Button>
    </div>
  );
};

const SceneNav: React.FC<{
  index: number;
  count: number;
  onChange: (index: number) => void;
}> = ({ index, count, onChange }) => (
  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
    <Button size="sm" variant="outline" onClick={() => onChange(index - 1)} disabled={index === 0} className="h-8 text-xs border-slate-700">
      <ChevronLeft className="w-4 h-4 mr-1" /> Previous
    </Button>
    <div className="flex gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          aria-label={`Scene ${i + 1}`}
          onClick={() => onChange(i)}
          className={`w-2.5 h-2.5 rounded-full transition-all ${i === index ? "bg-cyan-400 w-6" : "bg-slate-700 hover:bg-slate-500"}`}
        />
      ))}
    </div>
    <Button size="sm" variant="outline" onClick={() => onChange(index + 1)} disabled={index >= count - 1} className="h-8 text-xs border-slate-700">
      Next <ChevronRight className="w-4 h-4 ml-1" />
    </Button>
  </div>
);

/** Source picker and generate button. */
const StorySourcePanel: React.FC<{
  generating: boolean;
  onGenerate: (request: () => Promise<StoryGenerateRequest>) => void;
}> = ({ generating, onGenerate }) => {
  const [source, setSource] = useState<StorySourceKind>("premise");
  const [text, setText] = useState("");
  const [perspective, setPerspective] = useState<PerspectiveChoice>("mixed");
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [runId, setRunId] = useState("");

  useEffect(() => {
    if (source !== "run") return;
    fetchRecentRuns()
      .then((list) => {
        setRuns(list);
        setRunId((current) => current || list[0]?.id || "");
      })
      .catch((err) => toast.error(`Could not load runs: ${err.message}`));
  }, [source]);

  const needsText = source === "premise" || source === "topic";
  const ready = needsText ? text.trim().length > 0 : source === "run" ? !!runId : true;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono text-cyan-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Generate a story with Qwen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-xs">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SOURCE_LABELS) as StorySourceKind[]).map((kind) => (
            <Button key={kind} size="sm" variant={kind === source ? "default" : "outline"} className="h-7 text-xs" onClick={() => setSource(kind)}>
              {SOURCE_LABELS[kind]}
            </Button>
          ))}
        </div>
        {source === "premise" && (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="A premise for a fun story…" className="text-xs bg-slate-950" />
        )}
        {source === "topic" && (
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Topic, e.g. how keyboard shortcuts work" className="h-8 text-xs bg-slate-950" />
        )}
        {source === "screen" && <p className="text-slate-400">A fresh screenshot is captured and narrated; it becomes every scene's background.</p>}
        {source === "run" && (
          runs.length === 0 ? (
            <p className="text-slate-400">No finished replay runs are held in memory yet.</p>
          ) : (
            <select value={runId} onChange={(e) => setRunId(e.target.value)} className="w-full h-8 rounded bg-slate-950 border border-slate-800 text-xs">
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.target} — {run.status} ({run.completed}/{run.total}) {new Date(run.startedAt).toLocaleString()}
                </option>
              ))}
            </select>
          )
        )}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Narrator:</span>
          <select value={perspective} onChange={(e) => setPerspective(e.target.value as PerspectiveChoice)} className="h-7 rounded bg-slate-950 border border-slate-800 text-xs">
            <option value="mixed">mixed</option>
            {STORY_PERSPECTIVES.map((p) => (
              <option key={p} value={p}>{perspectiveLabel(p)}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="ml-auto h-8 text-xs"
            disabled={!ready || generating}
            onClick={() => onGenerate(() => buildStoryRequest(source, text.trim(), runId, perspective))}
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            Generate story
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/** Fullscreen slideshow with auto-play. */
const SlideshowOverlay: React.FC<{
  scenes: StoryScene[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  bridge: React.ReactNode;
}> = ({ scenes, index, onIndex, onClose, bridge }) => {
  const [autoPlay, setAutoPlay] = useState(false);
  const scene = scenes[index];

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => onIndex((index + 1) % scenes.length), AUTO_PLAY_MS);
    return () => clearInterval(timer);
  }, [autoPlay, index, scenes.length, onIndex]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 font-mono">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-cyan-500/40 rounded-2xl overflow-hidden">
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">{scene.title}</h3>
            <p className="text-xs text-cyan-400">
              Scene {index + 1} of {scenes.length} • {perspectiveLabel(scene.perspective)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => setAutoPlay(!autoPlay)} className="h-8 text-xs">
              {autoPlay ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
              {autoPlay ? "Pause Slideshow" : "Auto-Play"}
            </Button>
            <button aria-label="Close slideshow" onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="relative w-full aspect-video bg-black overflow-hidden">
          <SceneBackdrop scene={scene} dim />
          <div className="absolute inset-x-0 bottom-0 p-8">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 max-w-2xl space-y-2">
              <p className="text-sm text-slate-100 font-sans leading-relaxed">{scene.narrativeDescription}</p>
              <p className="text-xs text-cyan-300"><strong>Decision:</strong> {scene.decisionTurn}</p>
              <p className="text-xs text-purple-300"><strong>Predicted next turn:</strong> {scene.predictedNextTurn}</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-950 space-y-3">
          {bridge}
          <SceneNav index={index} count={scenes.length} onChange={onIndex} />
        </div>
      </div>
    </div>
  );
};

export const StorySceneCreationStudio: React.FC = () => {
  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<PerspectiveFilter>("all");
  const [slideIndex, setSlideIndex] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [status, setStatus] = useState("No story yet — pick a source and generate one.");
  const gate = useActionGate({ targetDevice: "desktop" });

  const scenes = useMemo(
    () => (story?.scenes ?? []).filter((s) => filter === "all" || s.perspective === filter),
    [story, filter],
  );
  const scene = scenes[Math.min(slideIndex, scenes.length - 1)];
  const goTo = (index: number) => setSlideIndex(Math.max(0, Math.min(scenes.length - 1, index)));

  const handleGenerate = async (buildRequest: () => Promise<StoryGenerateRequest>) => {
    setGenerating(true);
    setStatus("Asking Qwen to write the story…");
    try {
      const result = await generateStory(await buildRequest());
      setStory(result);
      setSlideIndex(0);
      setFilter("all");
      setStatus(`Generated "${result.title}" (${result.scenes.length} scenes) from ${SOURCE_LABELS[result.source].toLowerCase()}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Story generation failed: ${message}`);
      toast.error(`Story generation failed: ${message}`);
    } finally {
      setGenerating(false);
    }
  };

  /** Routes the scene's move through the action gate and reports what really happened. */
  const handleDispatchInAppAction = async () => {
    const action = scene?.inAppAction;
    if (!action) return;
    const result = await gate.run(sceneActionPlan(action));
    const blocked = gateFailure(result);
    if (blocked) {
      setStatus(`${action.description} was not dispatched: ${blocked}`);
      return;
    }
    const outcome = describeDeviceOutcome((result!.results[0] ?? {}) as Parameters<typeof describeDeviceOutcome>[0], action.description);
    setStatus(outcome.text);
    toast[outcome.level](outcome.text);
  };

  const bridge = scene && (
    <SceneActionBridge scene={scene} busy={gate.isGating} onExecute={handleDispatchInAppAction} />
  );

  return (
    <div className="space-y-4">
      <StorySourcePanel generating={generating} onGenerate={handleGenerate} />

      {story && (
        <Card className="bg-slate-900 border-slate-800 overflow-hidden">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 font-mono">
            <div className="flex items-center gap-2 text-xs text-slate-200 font-bold">
              <Film className="w-4 h-4 text-cyan-400" />
              <span>{story.title}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(["all", ...STORY_PERSPECTIVES] as PerspectiveFilter[]).map((p) => (
                <Button key={p} size="sm" variant={p === filter ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => { setFilter(p); setSlideIndex(0); }}>
                  {p === "all" ? "all viewpoints" : perspectiveLabel(p)}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={!scene} onClick={() => setOverlayOpen(true)} className="h-7 text-xs gap-1">
                <Maximize2 className="w-3.5 h-3.5" /> Slideshow
              </Button>
            </div>
          </div>
          <CardContent className="p-4 space-y-3 font-mono">
            {scene ? (
              <>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <SceneBackdrop scene={scene} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 to-transparent p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                      Scene {scene.sceneNumber} • {perspectiveLabel(scene.perspective)}
                    </span>
                    <h4 className="text-sm font-bold text-white">{scene.title}</h4>
                    <p className="text-xs text-slate-200 mt-1">{scene.narrativeDescription}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <p className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-200"><strong className="text-cyan-300">Decision turn:</strong> {scene.decisionTurn}</p>
                  <p className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-200"><strong className="text-purple-300">Predicted next turn:</strong> {scene.predictedNextTurn}</p>
                </div>
                {bridge}
                <SceneNav index={slideIndex} count={scenes.length} onChange={goTo} />
              </>
            ) : (
              <p className="text-xs text-slate-400">No scenes from this viewpoint.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-2">
        <strong>Story status:</strong> {status}
        {story?.endpoint && <Badge variant="outline" className="ml-auto text-[9px]">{story.endpoint}</Badge>}
      </div>

      <PresentationStudio />

      {overlayOpen && scene && (
        <SlideshowOverlay scenes={scenes} index={slideIndex} onIndex={goTo} onClose={() => setOverlayOpen(false)} bridge={bridge} />
      )}
    </div>
  );
};
