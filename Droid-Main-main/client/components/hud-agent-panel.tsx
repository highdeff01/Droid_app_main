import React, { useEffect, useRef, useState } from "react";
import { Bot, FlaskConical, FolderOpen, MessageSquare, Package, Presentation as PresentationIcon, Route, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buildPresentation,
  createPack,
  loadPack,
  type HudStepLike,
  type Presentation,
} from "@/lib/hud-actions";
import {
  runTurnLoop,
  toSequenceSteps,
  type GoalDevice,
  type GoalLoopEvent,
  type SimulatedGoalStep,
  type TurnLoopOptions,
  type TurnLoopResult,
} from "@/lib/qwen-turn-loop";
import { parseProposedSteps, type GoalStep, type PlanProposal, type RunEvidence } from "@shared/goal-loop";
import type { HudPack } from "@shared/api";
import type { ReplayRun } from "@shared/replay";

/** What the result dialog currently shows; each kind is rendered by one function below. */
type PanelResult =
  | { kind: "answer"; question: string; answer: string }
  | { kind: "plan"; steps: GoalStep[]; simulation: SimulatedGoalStep[] }
  | { kind: "simulation"; results: SimulatedGoalStep[] }
  | { kind: "run"; steps: GoalStep[]; evidence: RunEvidence; saved: boolean; saveError?: string }
  | { kind: "pack"; pack: HudPack }
  | { kind: "presentation"; presentation: Presentation };

interface PendingApproval {
  proposal: PlanProposal;
  resolve: (approved: boolean) => void;
}

export interface HudAgentPanelProps {
  steps: HudStepLike[];
  replayRun: ReplayRun | null;
  /** Device every AI turn captures from and dispatches to (through the action gate). */
  device: GoalDevice;
  /** Turn phases, forwarded to the HUD's thinking indicator and verification badge. */
  onEvent?: (event: GoalLoopEvent) => void;
  /** The live operation chain text, surfaced in the intentions panel. */
  onChain?: (text: string) => void;
  /** Load steps into the HUD sequence. */
  onLoadSteps: (steps: HudStepLike[]) => void;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The HUD sequence as goal steps; a step the turn loop cannot verify is reported, never dropped silently. */
function toGoalSteps(steps: HudStepLike[]): GoalStep[] {
  const goalSteps = parseProposedSteps(
    steps.map((step) => ({
      id: step.id,
      name: step.name,
      action: step.action,
      x: Math.max(0, Math.round(step.x)),
      y: Math.max(0, Math.round(step.y)),
      targetLabel: step.targetOcrLabel,
      text: step.text,
      delayMs: step.delayMs === undefined ? undefined : Math.min(5000, Math.max(0, Math.round(step.delayMs))),
    })),
    "hud_step",
  );
  if (goalSteps.length !== steps.length) {
    throw new Error(`${steps.length - goalSteps.length} step(s) have an action or value the turn loop cannot verify`);
  }
  return goalSteps;
}

async function saveVerifiedRun(device: GoalDevice, goal: string, run: { steps: GoalStep[]; evidence: RunEvidence }) {
  const response = await fetch("/api/goal-workflows/flows", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(device.apiKey ? { "x-api-key": device.apiKey } : {}) },
    body: JSON.stringify({ name: goal.slice(0, 120), goal, steps: run.steps, evidence: run.evidence }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) throw new Error(data?.error || "Saving the verified run failed");
}

/** A finished turn as the dialog content; a failed turn throws its reason. */
function turnResult(result: TurnLoopResult, question: string): PanelResult {
  switch (result.status) {
    case "answered":
      return { kind: "answer", question, answer: result.answer };
    case "planned":
      return { kind: "plan", steps: result.state.plan, simulation: result.simulation };
    case "completed":
      return { kind: "run", steps: result.steps, evidence: result.evidence, saved: result.saved, saveError: result.saveError };
    case "failed":
      throw new Error(result.reason);
  }
}

const SUCCESS_TOAST: Record<PanelResult["kind"], (r: any) => string> = {
  answer: () => "Qwen answered from a fresh screenshot",
  plan: (r: Extract<PanelResult, { kind: "plan" }>) => `Plan of ${r.steps.length} step(s) verified by dry run`,
  simulation: (r: Extract<PanelResult, { kind: "simulation" }>) =>
    `${r.results.filter((s) => s.verdict === "pass" || s.verdict === "moved").length}/${r.results.length} steps passed the dry run`,
  run: (r: Extract<PanelResult, { kind: "run" }>) => `Goal reached: ${r.steps.length} step(s) verified`,
  pack: (r: Extract<PanelResult, { kind: "pack" }>) => `Pack "${r.pack.name}" (id ${r.pack.id})`,
  presentation: () => "Presentation ready",
};

export const HudAgentPanel: React.FC<HudAgentPanelProps> = ({ steps, replayRun, device, onEvent, onChain, onLoadSteps }) => {
  const [question, setQuestion] = useState("What is on screen and what should I do next?");
  const [objective, setObjective] = useState("Complete the recorded task");
  const [name, setName] = useState("hud_plan");
  const [packId, setPackId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PanelResult | null>(null);
  const [lastPlan, setLastPlan] = useState<GoalStep[] | null>(null);
  const [chain, setChain] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Run one awaited operation: show its result and a success toast, or the real error. */
  const perform = async (label: string, op: () => Promise<PanelResult>) => {
    setBusy(label);
    try {
      const outcome = await op();
      setResult(outcome);
      toast.success(SUCCESS_TOAST[outcome.kind](outcome));
    } catch (error) {
      toast.error(`${label} failed: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const askApproval = (proposal: PlanProposal) => new Promise<boolean>((resolve) => setPending({ proposal, resolve }));

  const answerApproval = (approved: boolean) => {
    pending?.resolve(approved);
    setPending(null);
  };

  /** One Qwen turn through the shared operation graph; cancellable with Stop. */
  const runTurn = async (goal: string, turn: Partial<TurnLoopOptions>) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setChain("");
    const result = await runTurnLoop(goal, {
      device,
      signal: controller.signal,
      onEvent: (event) => onEvent?.(event),
      onChain: (_links, text) => {
        setChain(text);
        onChain?.(text);
      },
      approve: askApproval,
      autoApprove,
      ...turn,
    });
    abortRef.current = null;
    return turnResult(result, turn.question ?? "");
  };

  const handleStop = () => {
    abortRef.current?.abort();
    answerApproval(false);
  };

  const handleAsk = () => perform("Ask Qwen", () => runTurn(question, { entry: "answer", question }));

  const handleAutoActions = () =>
    perform("Auto Actions", () =>
      runTurn(objective, { entry: "think", saveBest: (run) => saveVerifiedRun(device, objective.trim(), run) }),
    );

  const handleSimulate = () =>
    perform("Test/Simulate", async () => {
      const outcome = await runTurn(objective, { entry: "apply_plan", initialSteps: toGoalSteps(steps), stopBefore: "start" });
      return outcome.kind === "plan" ? { kind: "simulation", results: outcome.simulation } : outcome;
    });

  const handleCreatePlan = () =>
    perform("Create Plan", async () => {
      const outcome = await runTurn(objective, { entry: "think", stopBefore: "start" });
      if (outcome.kind === "plan") setLastPlan(outcome.steps);
      return outcome;
    });

  const handleCreatePack = () =>
    perform("Create Pack", async () => ({ kind: "pack", pack: await createPack(name, steps, lastPlan) }));

  const handleLoadPack = () =>
    perform("Load Pack", async () => {
      const pack = await loadPack(packId.trim());
      onLoadSteps(pack.sequence as HudStepLike[]);
      return { kind: "pack", pack };
    });

  const handlePresentation = () =>
    perform("Presentation", async () => {
      if (!replayRun) throw new Error("No completed run yet. Run the sequence first.");
      return { kind: "presentation", presentation: buildPresentation(replayRun, steps) };
    });

  /** A verified plan forwards to the HUD sequence, where Test/Simulate and Run pick it up. */
  const handleLoadPlan = (planned: GoalStep[]) => {
    onLoadSteps(toSequenceSteps(planned));
    setResult(null);
    toast.success(`Loaded ${planned.length} planned step(s) into the HUD sequence`);
  };

  const controls: Array<{ label: string; icon: React.ElementType; onClick: () => void; disabled?: boolean }> = [
    { label: "Ask Qwen", icon: MessageSquare, onClick: handleAsk, disabled: !question.trim() },
    { label: "Auto Actions", icon: Bot, onClick: handleAutoActions, disabled: !objective.trim() },
    { label: "Test/Simulate", icon: FlaskConical, onClick: handleSimulate, disabled: steps.length === 0 },
    { label: "Create Plan", icon: Route, onClick: handleCreatePlan, disabled: !objective.trim() },
    { label: "Create Pack", icon: Package, onClick: handleCreatePack, disabled: steps.length === 0 },
    { label: "Load Pack", icon: FolderOpen, onClick: handleLoadPack, disabled: !packId.trim() },
    { label: "Presentation", icon: PresentationIcon, onClick: handlePresentation },
  ];

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-slate-950/80 p-2 space-y-2" data-testid="hud-agent-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Qwen / Agent fast-path</span>
        <label className="flex items-center gap-1 text-[10px] text-slate-400">
          <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} disabled={!!busy} />
          Auto-approve fixes
        </label>
      </div>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question for Qwen" className="h-7 text-xs" />
        <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective (goal)" className="h-7 text-xs" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pack name" className="h-7 text-xs" />
        <Input value={packId} onChange={(e) => setPackId(e.target.value)} placeholder="Pack id to load" className="h-7 text-xs" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {controls.map(({ label, icon: Icon, onClick, disabled }) => (
          <Button key={label} size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!busy || disabled} onClick={onClick}>
            <Icon className="mr-1 h-3.5 w-3.5" />
            {busy === label ? `${label}…` : label}
          </Button>
        ))}
        {busy && (
          <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={handleStop}>
            <Square className="mr-1 h-3.5 w-3.5" /> Stop
          </Button>
        )}
      </div>
      {chain && (
        <p className="text-[10px] text-amber-300" data-turn-chain>
          {chain}
        </p>
      )}
      {pending && <ApprovalView pending={pending.proposal} onAnswer={answerApproval} />}
      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          {result && <ResultView result={result} onLoadPlan={handleLoadPlan} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ApprovalView: React.FC<{ pending: PlanProposal; onAnswer: (approved: boolean) => void }> = ({ pending, onAnswer }) => (
  <div className="rounded border border-amber-600 bg-amber-950/40 p-2 space-y-1 text-xs">
    <div className="font-semibold text-amber-200">Qwen proposes a fix — {pending.reason}</div>
    <div className="text-slate-400">Goal (unchanged): {pending.goal}</div>
    <StepList steps={pending.steps} />
    <div className="flex gap-2">
      <Button size="sm" className="h-6 text-[11px]" onClick={() => onAnswer(true)}>Approve fix</Button>
      <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onAnswer(false)}>Reject</Button>
    </div>
  </div>
);

const StepList: React.FC<{ steps: GoalStep[] }> = ({ steps }) => (
  <ol className="list-decimal pl-5 text-xs">
    {steps.map((step) => (
      <li key={step.id}>
        {step.name} <span className="text-muted-foreground">({step.action} @ {Math.round(step.x)},{Math.round(step.y)})</span>
      </li>
    ))}
  </ol>
);

const ResultView: React.FC<{ result: PanelResult; onLoadPlan: (steps: GoalStep[]) => void }> = ({ result, onLoadPlan }) => {
  switch (result.kind) {
    case "answer":
      return <AnswerView question={result.question} answer={result.answer} />;
    case "plan":
      return <PlanView steps={result.steps} simulation={result.simulation} onLoadPlan={onLoadPlan} />;
    case "simulation":
      return <SimulationView results={result.results} />;
    case "run":
      return <RunView run={result} />;
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

const VERDICT_CLASS: Record<SimulatedGoalStep["verdict"], string> = {
  pass: "text-emerald-500",
  moved: "text-emerald-400",
  block: "text-red-500",
  unchecked: "text-slate-400",
};

const SimulationList: React.FC<{ results: SimulatedGoalStep[] }> = ({ results }) => (
  <ul className="space-y-1 text-sm">
    {results.map((r) => (
      <li key={r.stepId} className={VERDICT_CLASS[r.verdict]}>
        {r.verdict.toUpperCase()} {r.name}: {r.reason}
      </li>
    ))}
  </ul>
);

const SimulationView: React.FC<{ results: SimulatedGoalStep[] }> = ({ results }) => (
  <>
    <DialogHeader><DialogTitle>Dry run on a fresh screenshot (no device dispatch)</DialogTitle></DialogHeader>
    <SimulationList results={results} />
  </>
);

const PlanView: React.FC<{ steps: GoalStep[]; simulation: SimulatedGoalStep[]; onLoadPlan: (steps: GoalStep[]) => void }> = ({
  steps,
  simulation,
  onLoadPlan,
}) => (
  <>
    <DialogHeader><DialogTitle>Qwen plan ({steps.length} steps), verified by dry run</DialogTitle></DialogHeader>
    <StepList steps={steps} />
    <SimulationList results={simulation} />
    <Button size="sm" onClick={() => onLoadPlan(steps)}>Load plan into HUD sequence</Button>
  </>
);

const RunView: React.FC<{ run: Extract<PanelResult, { kind: "run" }> }> = ({ run }) => (
  <>
    <DialogHeader><DialogTitle>Goal reached: {run.steps.length} step(s) verified</DialogTitle></DialogHeader>
    <p className="text-sm">{run.evidence.goalAssessment.reason}</p>
    <StepList steps={run.steps} />
    {run.saved ? (
      <p className="text-sm text-emerald-500">Saved as a new flow version; confirm it in the goal workflow panel to make it the best flow.</p>
    ) : (
      <p className="text-sm text-amber-500">Not saved{run.saveError ? `: ${run.saveError}` : ""}</p>
    )}
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
