import { useState } from "react";
import { Link } from "react-router-dom";
import type { AssistRemoteSettings } from "@shared/assist-bridge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AssistBridgeBadge } from "@/components/assist-bridge-status";
import { ActionButton, OutcomeView, useOutcome } from "@/components/assist/outcome";
import { getRemoteSettings, setRemoteSettings } from "@/lib/assist-bridge-api";

type Section = "bridge" | "ai" | "monitor";

/** Text fields per section; numeric ones are converted on save. */
const FIELDS: { section: Section; key: string; label: string; numeric?: boolean; secret?: boolean }[] = [
  { section: "bridge", key: "mode", label: "Bridge mode (listen / dial)" },
  { section: "bridge", key: "host", label: "Bridge host" },
  { section: "bridge", key: "port", label: "Bridge port", numeric: true },
  { section: "bridge", key: "url", label: "Bridge URL" },
  { section: "bridge", key: "token", label: "Bridge token", secret: true },
  { section: "ai", key: "endpoint", label: "AI endpoint" },
  { section: "ai", key: "model", label: "AI model" },
  { section: "monitor", key: "mode", label: "Monitor mode (off / standard / advanced)" },
  { section: "monitor", key: "intervalMs", label: "Monitor interval (ms)", numeric: true },
];

type Draft = Record<string, string>;
const fieldId = (section: Section, key: string) => `${section}.${key}`;

function toDraft(settings: AssistRemoteSettings): Draft {
  const draft: Draft = {};
  for (const { section, key } of FIELDS) {
    const value = (settings[section] as Record<string, unknown> | undefined)?.[key];
    draft[fieldId(section, key)] = value === undefined ? "" : String(value);
  }
  return draft;
}

/** Builds the settings to send: only filled fields; the server validates ranges and enums. */
export function fromDraft(draft: Draft, enabled: boolean | undefined, agents: Record<string, boolean>): AssistRemoteSettings {
  const out: Record<string, Record<string, unknown>> = {};
  for (const { section, key, numeric } of FIELDS) {
    const raw = draft[fieldId(section, key)]?.trim();
    if (!raw) continue;
    const value = numeric ? Number(raw) : raw;
    if (numeric && !Number.isInteger(value)) throw new Error(`${section}.${key} must be a whole number`);
    out[section] = { ...out[section], [key]: value };
  }
  if (enabled !== undefined) out.bridge = { ...out.bridge, enabled };
  return { ...out, ...(Object.keys(agents).length ? { agents } : {}) } as AssistRemoteSettings;
}

/** Manage droid-new's settings remotely over the bridge while it runs. */
export default function AssistSettings() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  const [agents, setAgents] = useState<Record<string, boolean>>({});
  const [newAgent, setNewAgent] = useState("");
  const load = useOutcome();
  const save = useOutcome();

  const fetchSettings = () =>
    load.run(async () => {
      const settings = await getRemoteSettings();
      setDraft(toDraft(settings));
      setEnabled(settings.bridge?.enabled);
      setAgents(settings.agents ?? {});
      return "Loaded droid-new's settings";
    });

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">droid-new settings</h1>
        <AssistBridgeBadge />
        <Link to="/assist" className="text-xs text-cyan-400 underline">Assist</Link>
      </header>
      <ActionButton busy={load.busy} onClick={() => void fetchSettings()}>Load from droid-new</ActionButton>
      <OutcomeView outcome={load.outcome} label="Load failed" />
      {draft && (
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <label className="flex items-center gap-2 text-xs">
            <Switch aria-label="Bridge enabled" checked={enabled ?? false} onCheckedChange={setEnabled} />
            Bridge enabled
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            {FIELDS.map(({ section, key, label, secret }) => (
              <label key={fieldId(section, key)} className="space-y-1 text-xs text-slate-300">
                <span>{label}</span>
                <Input
                  aria-label={label}
                  type={secret ? "password" : "text"}
                  value={draft[fieldId(section, key)]}
                  onChange={(e) => setDraft({ ...draft, [fieldId(section, key)]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <section aria-label="Agents" className="space-y-1">
            <h2 className="text-[11px] font-semibold uppercase text-slate-400">Agents</h2>
            {Object.entries(agents).map(([name, on]) => (
              <label key={name} className="flex items-center gap-2 text-xs">
                <Switch aria-label={`Agent ${name}`} checked={on} onCheckedChange={(v) => setAgents({ ...agents, [name]: v })} />
                {name}
              </label>
            ))}
            <div className="flex gap-1">
              <Input aria-label="New agent name" className="h-8 w-48 text-xs" value={newAgent} onChange={(e) => setNewAgent(e.target.value)} placeholder="agent name" />
              <ActionButton busy={!newAgent.trim()} onClick={() => { setAgents({ ...agents, [newAgent.trim()]: true }); setNewAgent(""); }}>
                Add agent toggle
              </ActionButton>
            </div>
          </section>
          <ActionButton busy={save.busy} onClick={() => void save.run(() => setRemoteSettings(fromDraft(draft, enabled, agents)))}>
            Apply to droid-new
          </ActionButton>
          <OutcomeView outcome={save.outcome} label="Apply failed" />
        </form>
      )}
    </div>
  );
}
