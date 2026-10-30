import { useState } from "react";
import type { AssistRequestKind } from "@shared/assist-bridge";
import { Button } from "@/components/ui/button";
import { assistBridgeApi, errorText } from "@/lib/assist-bridge-api";

/** The outcome of one action: what came back, or the real error. */
export type Outcome = { ok: true; value: unknown } | { ok: false; error: string } | null;

/** Runs an async action, keeps busy state and records its real outcome. */
export function useOutcome() {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome({ ok: true, value: await action() });
    } catch (error) {
      setOutcome({ ok: false, error: errorText(error) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, outcome, run };
}

const describe = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));

/** Shows a result or an error; nothing is shown until an action finished. */
export function OutcomeView({ outcome, label }: { outcome: Outcome; label?: string }) {
  if (!outcome) return null;
  if ("error" in outcome) {
    return (
      <p role="alert" className="text-xs text-red-300">
        {label ? `${label}: ` : ""}
        {outcome.error}
      </p>
    );
  }
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-200">
      {describe(outcome.value)}
    </pre>
  );
}

/** Sends one main → assist request and returns droid-new's result. */
export const sendRequest = async (kind: AssistRequestKind, params: unknown) =>
  (await assistBridgeApi.request(kind, params)).result ?? "droid-new answered with no result";

export function ActionButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Parses an optional integer coordinate field; empty means absent. */
export function optionalInt(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`"${value}" is not a whole number`);
  return parsed;
}
