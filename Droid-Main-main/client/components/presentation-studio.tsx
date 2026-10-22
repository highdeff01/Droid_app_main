import React, { useState } from "react";
import { GraduationCap, Loader2, Presentation, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type {
  GeneratedPresentation,
  PresentationGenerateRequest,
  PresentationKind,
  StruggleTopic,
} from "@shared/story";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchRecentRuns,
  fetchStruggles,
  generatePresentation,
  type RecentRun,
} from "@/lib/story-client";

const KIND_LABELS: Record<PresentationKind, string> = {
  task: "Computer task",
  web: "From the web",
  user: "My content",
  teach: "Help me learn",
};

/** Task kind: pick a finished replay run. */
const RunPicker: React.FC<{ runId: string; onChange: (id: string) => void }> = ({ runId, onChange }) => {
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const load = () =>
    fetchRecentRuns()
      .then((list) => {
        setRuns(list);
        if (!runId && list[0]) onChange(list[0].id);
      })
      .catch((err) => toast.error(`Could not load runs: ${err.message}`));
  if (runs === null) {
    return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Load recent runs</Button>;
  }
  if (runs.length === 0) return <p className="text-slate-400">No finished replay runs are held in memory yet.</p>;
  return (
    <select value={runId} onChange={(e) => onChange(e.target.value)} className="w-full h-8 rounded bg-slate-950 border border-slate-800 text-xs">
      {runs.map((run) => (
        <option key={run.id} value={run.id}>
          {run.target} — {run.status} ({run.completed}/{run.total})
        </option>
      ))}
    </select>
  );
};

/** Teach kind: struggles detected from the error ledger and retries; choosing one asks for approval. */
const StruggleList: React.FC<{ onOffer: (topic: StruggleTopic) => void }> = ({ onOffer }) => {
  const [topics, setTopics] = useState<StruggleTopic[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setTopics(await fetchStruggles());
    } catch (err) {
      toast.error(`Could not detect struggles: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load} disabled={loading}>
        <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Find what I keep struggling with
      </Button>
      {topics?.length === 0 && <p className="text-slate-400">No repeated failures or retries recorded — nothing to teach yet.</p>}
      {topics?.map((topic) => (
        <div key={topic.id} className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
          <div>
            <p className="text-slate-200 font-bold">{topic.label}</p>
            <p className="text-[10px] text-slate-400">
              {topic.occurrences} recorded failures/retries • {topic.sources.join(", ")}
              {topic.examples[0] ? ` • "${topic.examples[0]}"` : ""}
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => onOffer(topic)}>
            <GraduationCap className="w-3 h-3 mr-1" /> Teach me
          </Button>
        </div>
      ))}
    </div>
  );
};

const SlideDeck: React.FC<{ presentation: GeneratedPresentation }> = ({ presentation }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <h4 className="text-sm font-bold text-white">{presentation.title}</h4>
      <Badge variant="outline" className="text-[9px]">source: {presentation.source}</Badge>
    </div>
    {presentation.slides.map((slide, i) => (
      <div key={i} className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
        <p className="text-cyan-300 font-bold">{i + 1}. {slide.title}</p>
        <ul className="list-disc pl-5 text-slate-200 space-y-0.5">
          {slide.bullets.map((bullet, j) => <li key={j}>{bullet}</li>)}
        </ul>
        {slide.notes && <p className="text-[10px] text-slate-400">Notes: {slide.notes}</p>}
      </div>
    ))}
  </div>
);

/** Qwen-generated presentations: task runs, web pages/topics, user content, and approved teaching topics. */
export const PresentationStudio: React.FC = () => {
  const [kind, setKind] = useState<PresentationKind>("task");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [runId, setRunId] = useState("");
  const [offer, setOffer] = useState<StruggleTopic | null>(null);
  const [generating, setGenerating] = useState(false);
  const [presentation, setPresentation] = useState<GeneratedPresentation | null>(null);

  const run = async (request: PresentationGenerateRequest) => {
    setGenerating(true);
    try {
      setPresentation(await generatePresentation(request));
    } catch (err) {
      toast.error(`Presentation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const requestForKind: Record<Exclude<PresentationKind, "teach">, () => PresentationGenerateRequest | null> = {
    task: () => (runId ? { kind: "task", runId } : null),
    web: () => (url.trim() ? { kind: "web", url: url.trim() } : text.trim() ? { kind: "web", text: text.trim() } : null),
    user: () => (text.trim() ? { kind: "user", text: text.trim() } : null),
  };
  const request = kind === "teach" ? null : requestForKind[kind]();

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono text-amber-300 flex items-center gap-2">
          <Presentation className="w-4 h-4" /> Presentations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-xs">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_LABELS) as PresentationKind[]).map((k) => (
            <Button key={k} size="sm" variant={k === kind ? "default" : "outline"} className="h-7 text-xs" onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </Button>
          ))}
        </div>
        {kind === "task" && <RunPicker runId={runId} onChange={setRunId} />}
        {kind === "web" && (
          <>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (page to summarize)" className="h-8 text-xs bg-slate-950" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="…or a topic, summarized from the model's own knowledge" className="h-8 text-xs bg-slate-950" />
          </>
        )}
        {kind === "user" && (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the content to turn into slides" className="text-xs bg-slate-950" />
        )}
        {kind === "teach" ? (
          <StruggleList onOffer={setOffer} />
        ) : (
          <Button size="sm" className="h-8 text-xs" disabled={!request || generating} onClick={() => request && run(request)}>
            {generating && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Generate presentation
          </Button>
        )}
        {generating && kind === "teach" && <p className="text-slate-400">Generating teaching presentation…</p>}
        {presentation && <SlideDeck presentation={presentation} />}
      </CardContent>

      <AlertDialog open={!!offer} onOpenChange={(open) => !open && setOffer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Want a short lesson on this?</AlertDialogTitle>
            <AlertDialogDescription>
              "{offer?.label}" has come up {offer?.occurrences} times in your recorded failures and retries.
              Qwen can generate a teaching presentation about it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => offer && run({ kind: "teach", topicId: offer.id })}>
              Yes, teach me
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
