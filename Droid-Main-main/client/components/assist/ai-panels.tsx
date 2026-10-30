import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { askAi, errorText } from "@/lib/assist-bridge-api";
import { ActionButton, OutcomeView, sendRequest, useOutcome } from "./outcome";

interface ChatMessage {
  role: "user" | "assistant" | "error";
  text: string;
}

const CHAT_SESSION = "assist-chat";

/** Chat with the main app's own Qwen endpoint about what to do or what is going on. */
export function AssistChatPanel() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const forward = useOutcome();

  const send = async () => {
    const text = question.trim();
    if (!text) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const { answer } = await askAi(text, { sessionId: CHAT_SESSION });
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages((m) => [...m, { role: "error", text: `AI unavailable: ${errorText(error)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <ul className="max-h-80 space-y-1 overflow-auto" aria-label="Chat messages">
        {messages.map((m, i) => (
          <li key={i} data-role={m.role} className={m.role === "error" ? "text-xs text-red-300" : "text-xs text-slate-200"}>
            <span className="font-semibold">{m.role === "user" ? "You" : m.role === "assistant" ? "AI" : "Error"}: </span>
            {m.text}
          </li>
        ))}
      </ul>
      <Textarea aria-label="Message" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask what to do or what is going on" />
      <div className="flex gap-1">
        <ActionButton busy={busy} onClick={() => void send()}>Send</ActionButton>
        <ActionButton busy={forward.busy || !question.trim()} onClick={() => void forward.run(() => sendRequest("user_request", { text: question.trim(), source: "droid-main" }))}>
          Send to droid-new
        </ActionButton>
      </div>
      <OutcomeView outcome={forward.outcome} label="droid-new" />
    </div>
  );
}

const SWARM_ROLES = [
  { role: "Observer", prompt: "Describe what is on the current screen and which app or page it is." },
  { role: "Navigator", prompt: "List the clickable controls on the current screen and what each likely does." },
  { role: "Diagnostician", prompt: "Point out any error, warning, blocked state or stuck progress on the current screen." },
  { role: "Planner", prompt: "Suggest the next three concrete steps a user would take on this screen." },
] as const;

type SwarmResult = { role: string; status: "running" | "ok" | "failed"; text: string };

/** Several AI roles analyse the live screen in parallel; each shows its own result or error. */
export function AssistSwarmPanel() {
  const [focus, setFocus] = useState("");
  const [results, setResults] = useState<SwarmResult[]>([]);
  const running = results.some((r) => r.status === "running");

  const settle = (role: string, status: SwarmResult["status"], text: string) =>
    setResults((all) => all.map((r) => (r.role === role ? { role, status, text } : r)));

  const analyze = () => {
    setResults(SWARM_ROLES.map(({ role }) => ({ role, status: "running", text: "Analyzing…" })));
    const extra = focus.trim() ? ` Focus: ${focus.trim()}` : "";
    for (const { role, prompt } of SWARM_ROLES) {
      askAi(`${prompt}${extra}`, { sessionId: `assist-swarm-${role.toLowerCase()}` })
        .then(({ answer, usedFrame }) => settle(role, "ok", usedFrame ? answer : `${answer}\n(no live frame was available)`))
        .catch((error) => settle(role, "failed", errorText(error)));
    }
  };

  return (
    <div className="space-y-2">
      <Textarea aria-label="Swarm focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional: what should the swarm look for?" />
      <ActionButton busy={running} onClick={analyze}>Analyze current screen</ActionButton>
      <div className="grid gap-2 md:grid-cols-2">
        {results.map((r) => (
          <section key={r.role} data-status={r.status} className="rounded border border-slate-800 p-2 text-xs">
            <h4 className="font-semibold text-slate-300">{r.role} · {r.status}</h4>
            <p className={r.status === "failed" ? "text-red-300" : "whitespace-pre-wrap text-slate-200"}>{r.text}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Uploads a screenshot and asks the main app's Qwen to analyse it. */
export function AssistScreenshotPanel() {
  const [image, setImage] = useState<string | null>(null);
  const [question, setQuestion] = useState("What is on this screenshot and what should I do next?");
  const { busy, outcome, run } = useOutcome();

  const load = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <input aria-label="Screenshot file" type="file" accept="image/png,image/jpeg" onChange={(e) => load(e.target.files?.[0])} className="text-xs" />
      {image && <img src={image} alt="Uploaded screenshot" className="max-h-48 rounded border border-slate-800" />}
      <Textarea aria-label="Screenshot question" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <ActionButton busy={busy || !image} onClick={() => void run(async () => (await askAi(question, { imageData: image!, sessionId: "assist-screenshot" })).answer)}>
        Analyze screenshot
      </ActionButton>
      <OutcomeView outcome={outcome} label="Analysis failed" />
    </div>
  );
}
