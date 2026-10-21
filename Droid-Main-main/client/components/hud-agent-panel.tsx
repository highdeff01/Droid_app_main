import React, { useState } from "react";
import { Bot, FlaskConical, FolderOpen, MessageSquare, Package, Presentation as PresentationIcon, Route } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  askQwen,
  buildPresentation,
  createPack,
  createPlan,
  loadPack,
  planNextStep,
  simulateSequence,
  type CreatedPlan,
  type HudStepLike,
  type Presentation,
  type SimulatedStep,
} from "@/lib/hud-actions";
import type { HudPack } from "@shared/api";
import type { ReplayRun } from "@shared/replay";

/** What the result dialog currently shows; each kind is rendered by one function below. */
type PanelResult =
  | { kind: "answer"; question: string; answer: string }
  | { kind: "proposal"; plan: CreatedPlan; step: HudStepLike | null }
  | { kind: "simulation"; results: SimulatedStep[] }
  | { kind: "plan"; plan: CreatedPlan }
  | { kind: "pack"; pack: HudPack }
  | { kind: "presentation"; presentation: Presentation };

export interface HudAgentPanelProps {
  /** Current HUD frame (data URL) or null when nothing is captured. */
  frame: string | null;
  steps: HudStepLike[];
  replayRun: ReplayRun | null;
  /** AI-initiated execution: every step goes through the action gate; resolves when done, rejects on failure. */
  runGated: (steps: HudStepLike[]) => Promise<void>;
  /** Load a pack's steps into the HUD sequence. */
  onLoadSteps: (steps: HudStepLike[]) => void;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const HudAgentPanel: React.FC<HudAgentPanelProps> = ({ frame, steps, replayRun, runGated, onLoadSteps }) => {
  const [question, setQuestion] = useState("What is on screen and what should I do next?");
  const [objective, setObjective] = useState("Complete the recorded task");
  const [name, setName] = useState("hud_plan");
  const [packId, setPackId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PanelResult | null>(null);
  const [lastPlan, setLastPlan] = useState<CreatedPlan | null>(null);

  /** Run one awaited operation: show its result and a success toast, or the real error. */
  const perform = async (label: string, op: () => Promise<PanelResult>, success: (r: PanelResult) => string) => {
    setBusy(label);
    try {
      const outcome = await op();
      setResult(outcome);
      toast.success(success(outcome));
    } catch (error) {
      toast.error(`${label} failed: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleAsk = () =>
    perform("Ask Qwen", async () => ({ kind: "answer", question, answer: await askQwen(frame ?? "", question) }), () => "Qwen answered");

  const handleAutoActions = () =>
    perform(
      "Auto Actions",
      async () => {
        const plan = await createPlan(`${name}_auto`, frame ?? "", steps, objective);
        return { kind: "proposal", plan, step: planNextStep(plan.decision) };
      },
      (r) => (r.kind === "proposal" && r.step ? `Agent proposed: ${r.step.name}` : "Agent proposed no executable action"),
    );

  const handleApprove = async (step: HudStepLike) => {
    setBusy("Execute");
    try {
      await runGated([step]);
      toast.success(`Executed "${step.name}" through the action gate`);
      setResult(null);
    } catch (error) {
      toast.error(`Execution failed: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSimulate = () =>
    perform(
      "Test/Simulate",
      async () => ({ kind: "simulation", results: await simulateSequence(frame ?? "", steps) }),
      (r) => (r.kind === "simulation" ? `${r.results.filter((s) => s.wouldPass).length}/${r.results.length} steps would pass the gate` : ""),
    );

  const handleCreatePlan = () =>
    perform(
      "Create Plan",
      async () => {
        const plan = await createPlan(name, frame ?? "", steps, objective);
        setLastPlan(plan);
        return { kind: "plan", plan };
      },
      () => `Plan "${name}" saved to workflows`,
    );

  const handleCreatePack = () =>
    perform("Create Pack", async () => ({ kind: "pack", pack: await createPack(name, steps, lastPlan) }), (r) =>
      r.kind === "pack" ? `Pack saved (id ${r.pack.id})` : "",
    );

  const handleLoadPack = () =>
    perform(
      "Load Pack",
      async () => {
        const pack = await loadPack(packId.trim());
        onLoadSteps(pack.sequence as HudStepLike[]);
        return { kind: "pack", pack };
      },
      (r) => (r.kind === "pack" ? `Loaded ${r.pack.sequence.length} steps from pack "${r.pack.name}"` : ""),
    );

  const handlePresentation = () =>
    perform(
      "Presentation",
      async () => {
        if (!replayRun) throw new Error("No completed run yet. Run the sequence first.");
        return { kind: "presentation", presentation: buildPresentation(replayRun, steps) };
      },
      () => "Presentation ready",
    );

  const controls: Array<{ label: string; icon: React.ElementType; onClick: () => void; disabled?: boolean }> = [
    { label: "Ask Qwen", icon: MessageSquare, onClick: handleAsk },
    { label: "Auto Actions", icon: Bot, onClick: handleAutoActions },
    { label: "Test/Simulate", icon: FlaskConical, onClick: handleSimulate, disabled: steps.length === 0 },
    { label: "Create Plan", icon: Route, onClick: handleCreatePlan },
    { label: "Create Pack", icon: Package, onClick: handleCreatePack, disabled: steps.length === 0 },
    { label: "Load Pack", icon: FolderOpen, onClick: handleLoadPack, disabled: !packId.trim() },
    { label: "Presentation", icon: PresentationIcon, onClick: handlePresentation },
  ];

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-slate-950/80 p-2 space-y-2" data-testid="hud-agent-panel">
      <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Qwen / Agent fast-path</div>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question for Qwen" className="h-7 text-xs" />
        <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective" className="h-7 text-xs" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan / pack name" className="h-7 text-xs" />
        <Input value={packId} onChange={(e) => setPackId(e.target.value)} placeholder="Pack id to load" className="h-7 text-xs" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {controls.map(({ label, icon: Icon, onClick, disabled }) => (
          <Button key={label} size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!busy || disabled} onClick={onClick}>
            <Icon className="mr-1 h-3.5 w-3.5" />
            {busy === label ? `${label}…` : label}
          </Button>
        ))}
      </div>
      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          {result && <ResultView result={result} busy={!!busy} onApprove={handleApprove} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ResultView: React.FC<{ result: PanelResult; busy: boolean; onApprove: (step: HudStepLike) => void }> = ({ result, busy, onApprove }) => {
  switch (result.kind) {
    case "answer":
      return <AnswerView question={result.question} answer={result.answer} />;
    case "proposal":
      return <ProposalView plan={result.plan} step={result.step} busy={busy} onApprove={onApprove} />;
    case "simulation":
      return <SimulationView results={result.results} />;
    case "plan":
      return <PlanView plan={result.plan} />;
    case "pack":
      return <PackView pack={result.pack} />;
    case "presentation":
      return <PresentationView presentation={result.presentation} />;
  }
};

const AnswerView: React.FC<{ question: string; answer: string }> = ({ question, answer }) => (
  <>
    <DialogHeader><DialogTitle>Qwen answer</DialogTitle></DialogHeader>
    <p className="text-xs text-muted-foreground">{question}</p>
    <p className="whitespace-pre-wrap text-sm">{answer}</p>
  </>
);

const ProposalView: React.FC<{ plan: CreatedPlan; step: HudStepLike | null; busy: boolean; onApprove: (step: HudStepLike) => void }> = ({
  plan,
  step,
  busy,
  onApprove,
}) => (
  <>
    <DialogHeader><DialogTitle>Agent proposal</DialogTitle></DialogHeader>
    <p className="text-sm">{plan.decision.thinking?.reasoning || plan.decision.statusSummary}</p>
    {step ? (
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          {step.action} "{step.name}" at ({step.x}, {step.y}){step.text ? ` text "${step.text}"` : ""}
        </p>
        <Button size="sm" disabled={busy} onClick={() => onApprove(step)}>Approve and execute (gated)</Button>
      </div>
    ) : (
      <p className="text-sm text-amber-500">The planner proposed no action with screen coordinates; nothing to execute.</p>
    )}
  </>
);

const SimulationView: React.FC<{ results: SimulatedStep[] }> = ({ results }) => (
  <>
    <DialogHeader><DialogTitle>Dry run (no device dispatch)</DialogTitle></DialogHeader>
    <ul className="space-y-1 text-sm">
      {results.map((r) => (
        <li key={r.stepId} className={r.wouldPass ? "text-emerald-500" : "text-red-500"}>
          {r.wouldPass ? "PASS" : "BLOCK"} {r.name}: {r.reason}
          {r.confidence !== undefined ? ` (confidence ${Math.round(r.confidence * 100)}%)` : ""}
        </li>
      ))}
    </ul>
  </>
);

const PlanView: React.FC<{ plan: CreatedPlan }> = ({ plan }) => (
  <>
    <DialogHeader><DialogTitle>Plan "{plan.name}" saved</DialogTitle></DialogHeader>
    <p className="text-sm">{plan.decision.thinking?.reasoning || plan.decision.statusSummary}</p>
    <ol className="list-decimal pl-5 text-sm">
      {(plan.decision.goals ?? []).map((goal) => (
        <li key={goal.id}>
          {goal.title}
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {goal.subtasks.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  </>
);

const PackView: React.FC<{ pack: HudPack }> = ({ pack }) => (
  <>
    <DialogHeader><DialogTitle>Pack "{pack.name}"</DialogTitle></DialogHeader>
    <p className="text-sm">
      Id <code>{pack.id}</code>: {pack.sequence.length} steps, {pack.screenshots.length} reference screenshots, {pack.plan ? "with plan" : "no plan"}.
    </p>
  </>
);

const PresentationView: React.FC<{ presentation: Presentation }> = ({ presentation }) => (
  <>
    <DialogHeader>
      <DialogTitle>
        Run {presentation.runId}: {presentation.status} ({presentation.completed}/{presentation.total})
      </DialogTitle>
    </DialogHeader>
    {presentation.error && <p className="text-sm text-red-500">{presentation.error}</p>}
    {presentation.slides.map((slide) => (
      <section key={slide.stepId} className="space-y-1 border-t pt-2">
        <h4 className="text-sm font-semibold">
          {slide.name}: {slide.status}
          {slide.confidence !== undefined ? ` (confidence ${Math.round(slide.confidence * 100)}%)` : ""}
        </h4>
        {slide.screenshotUrl && <img src={slide.screenshotUrl} alt={slide.name} className="max-h-40 rounded border" />}
        <ul className="text-xs text-muted-foreground">
          {slide.events.map((e) => (
            <li key={`${e.at}-${e.phase}`}>
              {new Date(e.at).toLocaleTimeString()} {e.phase}: {e.detail}
            </li>
          ))}
        </ul>
      </section>
    ))}
  </>
);
