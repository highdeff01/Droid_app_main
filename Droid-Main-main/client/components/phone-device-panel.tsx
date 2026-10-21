import { ReplayMonitor } from "./replay-monitor";
import type { ReplayStep, ReplayRun } from "@shared/replay";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PhoneAction, PhoneFrame, PhoneRecording } from "@shared/phone";

const button = "rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm disabled:opacity-40";
const input = "rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white min-w-0";
/** A mirror frame older than this is shown as stale rather than live. */
const STALE_FRAME_MS = 5000;
type AiState = "idle" | "thinking" | "acting" | "waiting_approval";
interface NativeStatus {
  online: boolean; controlEnabled: boolean; name: string;
  paired?: boolean; pairingExpires?: number; frameAgeMs?: number; aiState?: AiState;
}
interface WorkflowSummary { id: string; name: string; steps: number; executionCount: number }
const aiLabels: Record<AiState, string> = { idle: "AI idle", thinking: "AI thinking", acting: "AI acting", waiting_approval: "AI waiting for your approval" };

/** Pairing, connection and AI state of the native companion, from the server's real session state. */
function NativeStatusLine({ status, now }: { status: NativeStatus; now: number }) {
  if (status.paired === false) {
    const left = Math.ceil(((status.pairingExpires ?? 0) - now) / 1000);
    return <p className="text-sm">{left > 0
      ? `Waiting for the phone to scan the QR · invitation expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
      : "QR invitation expired before the phone paired. Disconnect and create a new QR."}</p>;
  }
  return <p className="text-sm">{status.name}: {status.online ? "online" : "offline — waiting for the phone to reconnect"} · Control {status.controlEnabled ? "enabled" : "requires accessibility"} · {aiLabels[status.aiState || "idle"]}. Native recordings are saved on the phone and can be shared from its Saved recordings screen.</p>;
}

export default function PhoneDevicePanel({ pairedOnly = false, replaySteps = [] }: { pairedOnly?: boolean; replaySteps?: ReplayStep[] }) {
  const [replayRun, setReplayRun] = useState<ReplayRun | null>(null);
  const [token, setToken] = useState(() => {
    if (!pairedOnly) return sessionStorage.getItem("phone-admin-session") || "";
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has("pair")) return "";
    return fragment.get("phone") || sessionStorage.getItem("phone-session") || "";
  });
  const [pairing] = useState(() => new URLSearchParams(location.hash.slice(1)).get("pair") || "");
  const [nativeStatus, setNativeStatus] = useState<NativeStatus | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [iterations, setIterations] = useState(1);
  const [repeat, setRepeat] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [key, setKey] = useState("");
  const [devices, setDevices] = useState<{ id: string; state: string; detail: string }[]>([]);
  const [device, setDevice] = useState("");
  const [origin, setOrigin] = useState(location.origin);
  const [link, setLink] = useState(() => !pairedOnly && sessionStorage.getItem("phone-admin-session") ? sessionStorage.getItem("phone-admin-link") || "" : "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState<PhoneFrame | null>(null);
  const [text, setText] = useState("");
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<{ id?: string; action: PhoneAction | null; explanation: string } | null>(null);
  const [records, setRecords] = useState<PhoneRecording[]>([]);
  const [minutes, setMinutes] = useState(10);
  const [endpoint, setEndpoint] = useState("");
  const [code, setCode] = useState("");
  const [mirror, setMirror] = useState(true);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const pending = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const gesture = useRef<{ x: number; y: number; hash: string } | null>(null);

  useEffect(() => {
    if (pairedOnly && pairing) history.replaceState(null, "", location.pathname + location.search);
    if (token) sessionStorage.setItem(pairedOnly ? "phone-session" : "phone-admin-session", token);
    if (pairedOnly && token) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, [token, pairedOnly, pairing]);

  useEffect(() => {
    if (pairedOnly) return;
    if (token && link) sessionStorage.setItem("phone-admin-link", link);
    else sessionStorage.removeItem("phone-admin-link");
  }, [pairedOnly, token, link]);

  async function api(route: string, body?: unknown, admin = false, method?: string) {
    const response = await fetch(`/api/phone${route}`, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(admin ? { "x-api-key": key } : { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (response.status === 401 && !admin && token) {
      sessionStorage.removeItem(pairedOnly ? "phone-session" : "phone-admin-session");
      setToken(""); setLink(""); setFrame(null); setPlan(null); setNativeStatus(null);
    }
    if (!response.ok) throw new Error(data.error || `Phone request failed (${response.status})`);
    return data;
  }
  useEffect(() => {
    if (!token || !replayRun || !["running", "paused"].includes(replayRun.status)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const data = await api(`/replay/${replayRun.id}`); if (!disposed) setReplayRun(data.run); }
      catch (err) { if (!disposed) setError(err instanceof Error ? err.message : "Replay monitor disconnected"); }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 500);
    return () => { disposed = true; clearTimeout(timer); };
  }, [token, replayRun?.id, replayRun?.status]);
  async function perform(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function refresh() {
    const activeToken = token;
    const next = await api("/frame");
    if (tokenRef.current === activeToken) setFrame(next);
  }
  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!pending.current && !document.hidden) {
        try {
          const state = await api("/session");
          if (!disposed && state.replay) setReplayRun(state.replay);
          if (disposed) return;
          setDevice(state.device); setRecords(state.recordings); setNativeStatus(state.native || null);
          if (mirror && !plan && !gesture.current && (!state.native || state.native.online)) {
            const next = await api("/frame");
            if (!disposed && !plan && !gesture.current) setFrame(next);
          }
        } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : String(e)); }
      }
      if (!disposed) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [token, mirror, plan]);
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    api("/workflows").then(data => setWorkflows(data.workflows), e => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);
  async function runWorkflow(id: string) {
    const data = await api(`/workflows/${id}/run`, { iterations, repeat: repeat > 1 ? repeat : undefined });
    setReplayRun(data.run);
    setNotice(`Workflow started on the phone: ${data.run.total} verified actions.`);
  }
  const frameAge = frame?.capturedAt ? now - frame.capturedAt : undefined;
  const stale = frameAge !== undefined && frameAge > STALE_FRAME_MS;

  async function action(action: PhoneAction, frameHash = frame?.hash) {
    if (!frameHash) throw new Error("Refresh the phone mirror first");
    setPlan(null);
    try { const result = await api("/action", { action, frameHash }); setNotice(result.message); }
    finally { await refresh(); }
  }
  async function download(record: PhoneRecording, part: number) {
    const name = `part-${String(part).padStart(3, "0")}.mp4`;
    const response = await fetch(`/api/phone/recordings/${record.id}/${name}`, { headers: { Authorization: `Bearer ${token}`, "x-api-key": key } });
    if (!response.ok) throw new Error((await response.json()).error || "Download failed");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${record.id}-${name}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const recording = records.some(r => r.state === "recording" || r.state === "stopping");
  const point = (event: React.PointerEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };

  async function createPairing(mode: "adb" | "native") {
    const base = new URL(origin);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(base.hostname)) throw new Error("Enter the server's LAN address or HTTPS URL reachable from your phone; localhost points to the phone itself.");
    if (base.origin !== location.origin && !window.confirm("Confirm this address reaches this same server. The QR grants access to your phone connection.")) return;
    const paired = await api("/sessions", { device: mode === "adb" ? device : undefined, mode }, true);
    setToken(paired.token); setDevice(paired.device); setFrame(null); setPlan(null); setRecords([]); setNativeStatus(null);
    setLink(`${base.origin}/phone-control#${paired.pairing ? `pair=${paired.pairing}` : `phone=${paired.token}`}`);
    setNotice(mode === "native" ? "Install the Android companion, scan this QR, then Open Android app. Enable accessibility and Start sharing on the phone. This invitation expires in 5 minutes." : "Scan to open controls for the selected ADB phone.");
  }

  return <section className="rounded-xl border border-emerald-700 bg-slate-950 p-4 text-slate-100 space-y-4" aria-label="Real Android connection">
    <h2 className="text-lg font-semibold">Android connection, mirror & recording</h2>
    <p className="text-sm text-slate-300">Pair the Android companion by QR for mirroring, control and recording on the phone. USB or wireless ADB is also supported. Recording continues across phone apps after you leave this page.</p>
    {pairedOnly && pairing && <div className="space-y-3">
      <p>Install the Android companion, then open this invitation in it. Enable Sightline accessibility for mirroring and control, and approve screen capture on the phone.</p>
      <a className={`${button} inline-block`} href={`sightline://pair?server=${encodeURIComponent(location.origin)}&pair=${encodeURIComponent(pairing)}`}>Open Android app</a>
      <a className={`${button} inline-block`} href="/api/mobile/download-apk-bundle" download>Download Android project</a>
      <p className="text-xs text-slate-400">Requires Android 11+. Build the downloaded project with Android Studio first. This invitation can be used once and expires in 5 minutes.</p>
    </div>}
    {!pairedOnly && <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className={input} type="password" placeholder="Server API key (remote access)" aria-label="Server API key" value={key} onChange={e => setKey(e.target.value)} />
        <button className={button} disabled={busy} onClick={() => void perform(async () => { setDevices((await api("/devices", undefined, true)).devices); })}>Find devices</button>
        <button className={button} disabled={busy} onClick={() => void perform(async () => { setRecords((await api("/recordings", undefined, true)).recordings); })}>Saved recordings</button>
      </div>
      <details><summary className="cursor-pointer text-sm">Wireless debugging connection</summary>
        <p className="text-xs py-2">In Android Developer options → Wireless debugging, use the pairing address and code first, then Connect with the separate debugging address. USB users must accept the debugging prompt on the phone.</p>
        <div className="flex flex-wrap gap-2"><input className={input} aria-label="ADB address" placeholder="192.168.1.20:port" value={endpoint} onChange={e => setEndpoint(e.target.value)} /><input className={input} aria-label="Pairing code" placeholder="6-digit pairing code" value={code} onChange={e => setCode(e.target.value)} />
          <button className={button} disabled={busy} onClick={() => void perform(async () => { await api("/connect", { endpoint, code }, true); setCode(""); setNotice("Pairing accepted. Connect using the phone's debugging port."); })}>Pair</button>
          <button className={button} disabled={busy} onClick={() => void perform(async () => { await api("/connect", { endpoint }, true); setDevices((await api("/devices", undefined, true)).devices); })}>Connect</button></div>
      </details>
      <div className="flex flex-wrap gap-2">
        <select className={input} aria-label="Android device" value={device} onChange={e => setDevice(e.target.value)} disabled={!!token}><option value="">Choose phone</option>{devices.map(d => <option key={d.id} value={d.id} disabled={d.state !== "device"}>{d.id} — {d.state}</option>)}</select>
        <input className={`${input} flex-1`} aria-label="Phone reachable server URL" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="https://server-reachable-from-phone" />
        <button className={button} disabled={busy || !device || !!token} onClick={() => void perform(() => createPairing("adb"))}>Share device QR</button>
        <button className={button} disabled={busy || !!token} onClick={() => void perform(() => createPairing("native"))}>Pair Android app</button>
        <a className={`${button} inline-block`} href="/api/mobile/download-apk-bundle" download>Android companion source</a>
      </div>
      <p className="text-xs text-slate-400">For LAN access, set ASSISTANT_API_KEY on the server and enter it above. Use HTTPS outside your trusted LAN. Keep QR links private. App invitations expire in 5 minutes; paired controls last 12 hours.</p>
      {link && <div className="flex flex-wrap gap-4 items-center"><div className="bg-white p-3"><QRCodeSVG value={link} size={180} /></div><a className="underline break-all text-sm" href={link} target="_blank" rel="noreferrer">Open paired phone controls</a></div>}
    </div>}
    {pairedOnly && !token && !pairing && <p>Scan a phone QR from the desktop Screen → QR link panel to pair. A QR alone cannot grant Android debugging permissions.</p>}
    {error && <p role="alert" className="text-red-300 whitespace-pre-wrap">{error}</p>}
    {notice && <p role="status" className="text-emerald-300">{notice}</p>}
    {token && <>
      {!pairedOnly && <div className="space-y-3">
        <p className="text-xs text-slate-400">Replay the Screen Hub's recorded steps on this paired phone. Coordinates must refer to phone screenshots.</p>
        <button className={button} disabled={busy || !replaySteps.length || replayRun?.status === "running" || replayRun?.status === "paused"} onClick={() => void perform(async () => {
          const data = await api("/replay", { steps: replaySteps.map(step => ({ ...step, referenceScreenshotUrl: step.referenceScreenshotUrl || undefined })), iterations: 1, confirmation: true });
          setReplayRun(data.run);
        })}>Replay {replaySteps.length} Screen Hub steps on this phone</button>
        <ReplayMonitor run={replayRun} base="/api/phone/replay" token={token} onControl={command => void perform(async () => {
          const data = await api(`/replay/${replayRun!.id}/${command}`, {}); setReplayRun(data.run);
        })} />
      </div>}

      {nativeStatus && <NativeStatusLine status={nativeStatus} now={now} />}
      <div className="space-y-2"><h3 className="font-semibold">Saved workflows</h3>
        <p className="text-xs text-slate-400">Workflows recorded on the phone run through the verified replay engine. Repeat applies to every step; runs repeat the whole workflow.</p>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-sm">Runs <input className={`${input} w-20`} type="number" min={1} max={25} value={iterations} onChange={e => setIterations(Math.max(1, Math.min(25, Number(e.target.value) || 1)))} /></label>
          <label className="text-sm">Repeat each step <input className={`${input} w-20`} type="number" min={1} max={25} value={repeat} onChange={e => setRepeat(Math.max(1, Math.min(25, Number(e.target.value) || 1)))} /></label>
          <button className={button} disabled={busy} onClick={() => void perform(async () => { setWorkflows((await api("/workflows")).workflows); })}>Reload workflows</button>
        </div>
        {!workflows.length && <p className="text-sm text-slate-400">No saved workflows yet. Use "Record workflow" in the Android companion.</p>}
        {workflows.map(w => <div key={w.id} className="flex gap-2 items-center text-sm"><span className="flex-1">{w.name} · {w.steps} step(s) · run {w.executionCount}×</span>
          <button className={button} disabled={busy || replayRun?.status === "running" || replayRun?.status === "paused"} onClick={() => void perform(() => runWorkflow(w.id))}>Run on phone</button></div>)}
        {pairedOnly && <ReplayMonitor run={replayRun} base="/api/phone/replay" token={token} onControl={command => void perform(async () => {
          const data = await api(`/replay/${replayRun!.id}/${command}`, {}); setReplayRun(data.run);
        })} />}
      </div>
      <div className="flex flex-wrap gap-2 items-center"><span className="text-sm">Phone: {device || "Connecting…"}</span><label className="text-sm"><input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} /> Live mirror</label><label className="text-sm"><input type="checkbox" checked={touchEnabled} onChange={e => setTouchEnabled(e.target.checked)} /> Tap / swipe to control</label><button className={button} disabled={busy} onClick={() => void perform(refresh)}>Refresh screen</button><button className={button} disabled={busy} onClick={() => void perform(async () => { await api("/session", undefined, false, "DELETE"); setToken(""); setLink(""); setFrame(null); setPlan(null); setNativeStatus(null); sessionStorage.removeItem(pairedOnly ? "phone-session" : "phone-admin-session"); })}>Disconnect & revoke QR</button></div>
      {frame && stale && <p role="status" className="text-amber-300 text-sm">Stale mirror: this screenshot is {Math.round(frameAge! / 1000)} s old and may not match the phone. Controls act only on a fresh screen.</p>}
      {frame && <img alt="Live Android device screen" src={frame.image} className={`max-h-[65vh] max-w-full w-auto mx-auto border ${stale ? "border-amber-500 opacity-50 grayscale" : "border-slate-700"}`} style={{ touchAction: touchEnabled ? "none" : "auto" }} draggable={false}
        onPointerDown={e => { if (!touchEnabled || busy) return; e.currentTarget.setPointerCapture(e.pointerId); gesture.current = { ...point(e), hash: frame.hash }; }}
        onPointerCancel={() => { gesture.current = null; }}
        onPointerUp={e => { const start = gesture.current; gesture.current = null; if (!start || !touchEnabled || busy) return; const end = point(e); void perform(() => action(Math.hypot(start.x - end.x, start.y - end.y) < .025 ? { type: "tap", x: end.x, y: end.y } : { type: "swipe", x: start.x, y: start.y, endX: end.x, endY: end.y, duration: 350 }, start.hash)); }} />}
      <div className="flex gap-2 flex-wrap">{(["BACK", "HOME", "APP_SWITCH", "ENTER", "COPY", "PASTE"] as const).map(k => <button className={button} key={k} disabled={busy || !frame} onClick={() => void perform(() => action({ type: "key", key: k }))}>{k.replace("_", " ")}</button>)}</div>
      <div className="flex gap-2"><input className={`${input} flex-1`} value={text} onChange={e => setText(e.target.value)} aria-label="Text to type on phone" placeholder="Text for focused phone field (ASCII)" /><button className={button} disabled={busy || !frame || !text} onClick={() => void perform(() => action({ type: "text", text }))}>Type</button></div>
      <div className="space-y-2"><div className="flex gap-2"><input className={`${input} flex-1`} value={goal} onChange={e => { setGoal(e.target.value); setPlan(null); }} aria-label="Phone AI goal" placeholder="Ask configured Qwen vision model for next step" /><button className={button} disabled={busy || !goal} onClick={() => void perform(async () => { setPlan(null); const result = await api("/plan", { goal }); setPlan(result); setFrame(result.frame); })}>Inspect with AI</button></div>
      {plan && <div className="text-sm space-y-2"><p>{plan.explanation}</p>{plan.action && <><pre className="whitespace-pre-wrap">{JSON.stringify(plan.action)}</pre><button className={button} disabled={busy} onClick={() => void perform(async () => { try { await api("/execute-plan", { id: plan.id }); setNotice("Action sent. Check the fresh screen, then inspect the next step."); } finally { setPlan(null); await refresh(); } })}>Approve this action</button></>}</div>}</div>
      <div className="space-y-2"><h3 className="font-semibold">Full phone video recording</h3><p className="text-xs text-slate-400">Records the full Android display as video. No audio. Protected app content may be blank. The limit below stops capture even when this page is closed. Native recordings stay on the phone; ADB recordings are copied here in segments of up to 3 minutes.</p>
        <div className="flex gap-2 items-center flex-wrap"><label>Limit (minutes) <input className={`${input} w-20`} type="number" min={1} max={60} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label><button className={button} disabled={busy || recording} onClick={() => void perform(async () => { const record = await api("/record/start", { minutes }); setRecords(prev => [...prev, record]); setNotice("Recording started. You can leave this page and use other phone apps. Use Stop in the phone notification for native recording."); })}>Record phone</button><button className={button} disabled={busy || !recording} onClick={() => void perform(async () => { await api("/record/stop", {}); setRecords((await api("/session")).recordings); })}>Stop & save</button></div>
      </div>
    </>}
    {records.map(record => <div key={record.id} className="border-t border-slate-700 pt-2 text-sm"><p>{new Date(record.startedAt || Date.now()).toLocaleString()} — {record.state} · {Number(record.segments || 0)} saved segment(s){record.storage === "phone" ? " · Saved on phone — share from the Android companion" : ""}</p>{record.error && <p className="text-red-300">{String(record.error)}</p>}<div className="flex flex-wrap gap-2">{Array.from({ length: record.storage === "phone" ? 0 : Number(record.segments || 0) }, (_, i) => <button className={button} key={i} disabled={busy} onClick={() => void perform(() => download(record, i + 1))}>Download {i + 1}</button>)}</div></div>)}
  </section>;
}
