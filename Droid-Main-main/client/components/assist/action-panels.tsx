import { useState } from "react";
import type { ScriptStep } from "@shared/assist-bridge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { assistBridgeApi } from "@/lib/assist-bridge-api";
import { ActionButton, OutcomeView, optionalInt, sendRequest, useOutcome } from "./outcome";

const OPS = ["click", "type", "key", "wait"] as const;
type Op = (typeof OPS)[number];

/** Builds one script step from the form fields; throws on missing values. */
export function buildStep(op: Op, fields: { x: string; y: string; value: string }): ScriptStep {
  const x = optionalInt(fields.x);
  const y = optionalInt(fields.y);
  if (op === "click") {
    if (x === undefined || y === undefined) throw new Error("A click needs x and y");
    return { op, x, y };
  }
  if (op === "wait") return { op, ms: optionalInt(fields.value) ?? 0 };
  if (!fields.value.trim()) throw new Error(`A ${op} step needs a value`);
  const at = x !== undefined && y !== undefined ? { x, y } : {};
  return op === "type" ? { op, text: fields.value, ...at } : { op, key: fields.value.trim(), ...at };
}

const describeStep = (s: ScriptStep) => JSON.stringify(s);

/** Step-by-step workflow builder: save as a workflow file, or ask droid-new to plan/create/run. */
export function AssistWorkflowPanel() {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [op, setOp] = useState<Op>("click");
  const [fields, setFields] = useState({ x: "", y: "", value: "" });
  const [steps, setSteps] = useState<ScriptStep[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const { busy, outcome, run } = useOutcome();

  const addStep = () => {
    try {
      setSteps((s) => [...s, buildStep(op, fields)]);
      setFields({ x: "", y: "", value: "" });
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };
  const workflow = () => ({ name: name.trim(), goal: goal.trim() || undefined, steps });

  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-2">
        <Input aria-label="Workflow name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
        <Input aria-label="Workflow goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal" />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <select aria-label="Step action" value={op} onChange={(e) => setOp(e.target.value as Op)} className="h-8 rounded bg-slate-900 text-xs text-slate-200">
          {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Input aria-label="Step x" className="h-8 w-20 text-xs" value={fields.x} onChange={(e) => setFields({ ...fields, x: e.target.value })} placeholder="x" />
        <Input aria-label="Step y" className="h-8 w-20 text-xs" value={fields.y} onChange={(e) => setFields({ ...fields, y: e.target.value })} placeholder="y" />
        <Input aria-label="Step value" className="h-8 w-48 text-xs" value={fields.value} onChange={(e) => setFields({ ...fields, value: e.target.value })} placeholder="text / key / ms" />
        <ActionButton busy={false} onClick={addStep}>Add step</ActionButton>
      </div>
      {formError && <p role="alert" className="text-xs text-red-300">{formError}</p>}
      <ol className="list-decimal pl-5 text-xs text-slate-300" aria-label="Workflow steps">
        {steps.map((s, i) => <li key={i}>{describeStep(s)}</li>)}
      </ol>
      <div className="flex flex-wrap gap-1">
        <ActionButton busy={busy || !name.trim() || !steps.length} onClick={() => void run(() => assistBridgeApi.createFile({ kind: "workflow", workflow: workflow() }))}>
          Save workflow file
        </ActionButton>
        <ActionButton busy={busy || !name.trim() || !steps.length} onClick={() => void run(() => sendRequest("create_workflow", { workflow: workflow() }))}>
          Create in droid-new
        </ActionButton>
        <ActionButton busy={busy || !goal.trim()} onClick={() => void run(() => sendRequest("plan_workflow", { goal: goal.trim() }))}>
          Plan from goal
        </ActionButton>
        <ActionButton busy={busy || !name.trim()} onClick={() => void run(() => sendRequest("run_workflow", { name: name.trim() }))}>
          Run in droid-new
        </ActionButton>
        <ActionButton busy={busy || !steps.length} onClick={() => void run(() => assistBridgeApi.runScript(steps.slice(0, 20)))}>
          Run here
        </ActionButton>
        <ActionButton busy={false} onClick={() => setSteps([])}>Clear</ActionButton>
      </div>
      <OutcomeView outcome={outcome} label="Workflow" />
    </div>
  );
}

/** Coordinate input: click, or type text at a point, on this machine through the bounded runner. */
export function AssistCoordinatePanel() {
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [text, setText] = useState("");
  const { busy, outcome, run } = useOutcome();
  const fields = { x, y, value: text };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Input aria-label="X" className="h-8 w-24 text-xs" value={x} onChange={(e) => setX(e.target.value)} placeholder="x" />
        <Input aria-label="Y" className="h-8 w-24 text-xs" value={y} onChange={(e) => setY(e.target.value)} placeholder="y" />
        <Input aria-label="Text to type" className="h-8 w-56 text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="optional text to type" />
      </div>
      <div className="flex gap-1">
        <ActionButton busy={busy} onClick={() => void run(() => assistBridgeApi.runScript([buildStep("click", fields)]))}>Click</ActionButton>
        <ActionButton busy={busy} onClick={() => void run(() => assistBridgeApi.runScript([buildStep("type", fields)]))}>Type at point</ActionButton>
        <ActionButton busy={busy || !x || !y} onClick={() => void run(() => sendRequest("verify_target", { target: `point ${x},${y}`, x: optionalInt(x), y: optionalInt(y) }))}>
          Ask droid-new to verify
        </ActionButton>
      </div>
      <OutcomeView outcome={outcome} label="Coordinate action" />
    </div>
  );
}

/** One target panel (verify / watch): target text and optional coordinates sent to droid-new. */
function TargetPanel({ kind, title }: { kind: "verify_target" | "watch_element"; title: string }) {
  const [target, setTarget] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [seconds, setSeconds] = useState("30");
  const { busy, outcome, run } = useOutcome();
  const params = () => {
    const base = { target: target.trim(), x: optionalInt(x), y: optionalInt(y) };
    return kind === "watch_element" ? { ...base, durationMs: (optionalInt(seconds) ?? 30) * 1000 } : base;
  };
  return (
    <section className="space-y-1 rounded border border-slate-800 p-2" aria-label={title}>
      <h4 className="text-xs font-semibold text-slate-300">{title}</h4>
      <Input aria-label={`${title} target`} className="h-8 text-xs" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Element or target description" />
      <div className="flex gap-1">
        <Input aria-label={`${title} x`} className="h-8 w-20 text-xs" value={x} onChange={(e) => setX(e.target.value)} placeholder="x" />
        <Input aria-label={`${title} y`} className="h-8 w-20 text-xs" value={y} onChange={(e) => setY(e.target.value)} placeholder="y" />
        {kind === "watch_element" && (
          <Input aria-label="Watch seconds" className="h-8 w-24 text-xs" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="seconds" />
        )}
      </div>
      <ActionButton busy={busy || !target.trim()} onClick={() => void run(() => sendRequest(kind, params()))}>{title}</ActionButton>
      <OutcomeView outcome={outcome} label={title} />
    </section>
  );
}

/** Free-text panel (assist / error help) sent to droid-new as assist_error. */
function AssistErrorPanel({ title, source }: { title: string; source: string }) {
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("");
  const { busy, outcome, run } = useOutcome();
  return (
    <section className="space-y-1 rounded border border-slate-800 p-2" aria-label={title}>
      <h4 className="text-xs font-semibold text-slate-300">{title}</h4>
      <Textarea aria-label={`${title} message`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What is wrong or what do you need help with?" />
      <Textarea aria-label={`${title} context`} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Optional context" />
      <ActionButton
        busy={busy || !message.trim()}
        onClick={() => void run(() => sendRequest("assist_error", { message: message.trim(), source, context: context.trim() || undefined }))}
      >
        {title}
      </ActionButton>
      <OutcomeView outcome={outcome} label={title} />
    </section>
  );
}

/** Verify / watch / assist / error-help panels, each a real request to droid-new. */
export function AssistVerifyPanels() {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <TargetPanel kind="verify_target" title="Verify target" />
      <TargetPanel kind="watch_element" title="Watch element" />
      <AssistErrorPanel title="Assist" source="droid-main:assist" />
      <AssistErrorPanel title="Error help" source="droid-main:error-help" />
    </div>
  );
}
