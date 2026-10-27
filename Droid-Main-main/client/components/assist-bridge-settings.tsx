import { useEffect, useState } from "react";
import { AlertTriangle, Cable, Loader2, OctagonX } from "lucide-react";
import { toast } from "sonner";
import {
  ASSIST_BRIDGE_MAX_INTERVAL_MS,
  ASSIST_BRIDGE_MIN_INTERVAL_MS,
  type AssistBridgeStatus,
} from "@shared/assist-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AssistBridgeBadge, useAssistBridgeStatus } from "@/components/assist-bridge-status";

interface BridgeForm {
  host: string;
  port: string;
  token: string;
  intervalMs: string;
}

async function postBridge(path: string, body: unknown): Promise<AssistBridgeStatus> {
  const res = await fetch(`/api/assist-bridge/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data?.success) throw new Error(data?.error || `Bridge request failed (${res.status})`);
  return data.status as AssistBridgeStatus;
}

/** Only fields the user actually filled in; an empty token field keeps the current token. */
function formToUpdate(form: BridgeForm, clearToken: boolean) {
  return {
    host: form.host.trim(),
    port: Number(form.port),
    intervalMs: Number(form.intervalMs),
    ...(clearToken ? { token: "" } : form.token ? { token: form.token } : {}),
  };
}

function LanWarning({ status }: { status: AssistBridgeStatus }) {
  if (!status.insecure) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-700 bg-amber-950/70 p-2.5 text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <span>
        Plain HTTP on the LAN: frames and commands travel unencrypted to {status.settings.host}. Use it only on a trusted network
        {status.settings.tokenSet ? "." : ", and set a token — without one any device on the network can drive input."}
      </span>
    </div>
  );
}

/** Settings card for the assist bridge: host/port/token/interval, kill switch, LAN warning. */
export function AssistBridgeSettings() {
  const { status, error, setStatus } = useAssistBridgeStatus();
  const [form, setForm] = useState<BridgeForm | null>(null);
  const [clearToken, setClearToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status && !form) {
      const s = status.settings;
      setForm({ host: s.host, port: String(s.port), token: "", intervalMs: String(s.intervalMs) });
    }
  }, [status, form]);

  const run = async (path: string, body: unknown, success: string) => {
    setSaving(true);
    try {
      setStatus(await postBridge(path, body));
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof BridgeForm) => ({
    value: form?.[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f)),
    className: "bg-slate-950 border-slate-700 text-white font-mono text-xs h-8",
  });

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-300 font-bold">
          <Cable className="w-4 h-4 text-sky-400" />
          <span>Assist App Bridge</span>
        </div>
        <AssistBridgeBadge />
      </div>
      {error && <p className="text-rose-300">Bridge status unavailable: {error}</p>}
      {status && <LanWarning status={status} />}
      {form && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Host</Label>
            <Input {...field("host")} placeholder="127.0.0.1" />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Port</Label>
            <Input {...field("port")} type="number" min={1} max={65535} />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">
              Token {status?.settings.tokenSet ? "(set — leave empty to keep)" : "(optional)"}
            </Label>
            <Input {...field("token")} type="password" autoComplete="off" disabled={clearToken} />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">
              Frame interval ms ({ASSIST_BRIDGE_MIN_INTERVAL_MS}–{ASSIST_BRIDGE_MAX_INTERVAL_MS})
            </Label>
            <Input {...field("intervalMs")} type="number" min={ASSIST_BRIDGE_MIN_INTERVAL_MS} max={ASSIST_BRIDGE_MAX_INTERVAL_MS} step={50} />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-slate-300">
          <Switch checked={clearToken} onCheckedChange={setClearToken} disabled={!status?.settings.tokenSet} />
          Remove token
        </label>
        <Button
          type="button"
          size="sm"
          disabled={!form || saving}
          onClick={() => void run("settings", formToUpdate(form, clearToken), "Bridge settings applied; listener restarted")}
          className="h-8 bg-sky-700 hover:bg-sky-600 text-white text-xs gap-1.5"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Apply bridge settings
        </Button>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-rose-900 bg-slate-950 p-2.5">
        <div className="flex items-center gap-2">
          <OctagonX className="w-4 h-4 text-rose-400" />
          <div>
            <p className="font-bold text-[11px] text-slate-200">Kill switch</p>
            <p className="text-[10px] text-slate-400">Refuses assist run_script commands and stops a running one</p>
          </div>
        </div>
        <Switch
          checked={Boolean(status?.killSwitch)}
          disabled={!status || saving}
          onCheckedChange={(tripped) => void run("kill-switch", { tripped }, tripped ? "Bridge kill switch tripped" : "Bridge kill switch reset")}
        />
      </div>
    </div>
  );
}
