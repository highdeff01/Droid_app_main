import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  ChatUiAction,
  CompanionChatRequest,
  CompanionNote,
  WorkflowProposal,
} from "@shared/companion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureAssistantSession } from "@/lib/assistant-session";
import { companionApi, type CompanionWorkflow } from "@/lib/companion-api";
import { ProposalCard, type RunCompanionSteps } from "@/components/companion-tasks-panel";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  screenshots?: CompanionNote[];
  proposal?: WorkflowProposal;
}

export interface CompanionChatPanelProps {
  currentTab: string;
  /** Latest real frame; only PNG/JPEG data URLs are sent to the vision model. */
  currentScreenshot?: string | null;
  screenSummary?: string;
  workflowHistory?: CompanionChatRequest["workflowHistory"];
  onNavigateTab: (tab: string) => void;
  onShowScreenshot: (screenshot: string) => void;
  onAttachWorkflow: (workflow: CompanionWorkflow) => void;
  onRunSteps: RunCompanionSteps;
}

const REAL_FRAME = /^data:image\/(png|jpeg);base64,/;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Friend-like companion chat backed by the server's memory (notes, event screenshots, history). */
export function CompanionChatPanel(props: CompanionChatPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    ensureAssistantSession({ project: { name: "Sightline Companion" } })
      .then(async (id) => {
        const turns = await companionApi.chatHistory(id);
        if (disposed) return;
        setSessionId(id);
        setEntries(turns.map((t) => ({ id: t.id, role: t.role, content: t.content })));
      })
      .catch((error) => toast.error(`Companion chat unavailable: ${errorText(error)}`));
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [entries]);

  const appendProposal = (proposal: WorkflowProposal) =>
    setEntries((prev) => [
      ...prev,
      { id: proposal.id, role: "assistant", content: `Proposed improvement: ${proposal.summary}`, proposal },
    ]);

  /** Applies one model-requested UI action; device-touching ones only stage or propose. */
  const applyAction = async (action: ChatUiAction, screenshots: CompanionNote[]) => {
    if (action.kind === "navigate_tab" && action.tab) props.onNavigateTab(action.tab);
    if (action.kind === "show_screenshot") {
      const note = screenshots.find((n) => n.id === action.noteId) ?? screenshots[0];
      if (note?.screenshot) props.onShowScreenshot(note.screenshot);
    }
    if (action.kind === "attach_workflow" && action.workflowId)
      props.onAttachWorkflow(await companionApi.workflow(action.workflowId));
    if (action.kind === "propose_improvement" && action.workflowId)
      appendProposal(await companionApi.proposeImprovement(action.workflowId));
  };

  const send = async () => {
    const message = input.trim();
    if (!message || !sessionId || sending) return;
    setInput("");
    setSending(true);
    setEntries((prev) => [...prev, { id: `local_${Date.now()}`, role: "user", content: message }]);
    try {
      const response = await companionApi.sendChat({
        sessionId,
        message,
        currentTab: props.currentTab,
        screenSummary: props.screenSummary || undefined,
        screenshot: props.currentScreenshot && REAL_FRAME.test(props.currentScreenshot) ? props.currentScreenshot : undefined,
        workflowHistory: props.workflowHistory?.slice(0, 20),
      });
      const screenshots = response.screenshots ?? [];
      setEntries((prev) => [
        ...prev,
        { id: response.reply.id, role: "assistant", content: response.reply.content, screenshots },
      ]);
      for (const action of response.actions ?? []) {
        await applyAction(action, screenshots).catch((error) =>
          toast.error(`Companion action ${action.kind} failed: ${errorText(error)}`),
        );
      }
    } catch (error) {
      setEntries((prev) => [
        ...prev,
        { id: `err_${Date.now()}`, role: "assistant", content: `⚠️ ${errorText(error)}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 rounded border border-slate-800 bg-slate-950 p-2 overflow-y-auto space-y-1 mb-2">
        {entries.length === 0 && (
          <div className="text-xs text-slate-500">
            {sessionId ? "Ask about past runs, errors, notes or what is on screen." : "Connecting to companion…"}
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`text-xs p-2 rounded space-y-1 ${entry.role === "user" ? "bg-cyan-950/60 text-cyan-200 ml-8" : "bg-purple-950/40 text-purple-200 mr-8"}`}
          >
            <div className="whitespace-pre-wrap">{entry.content}</div>
            {entry.screenshots?.map((note) => (
              <button
                key={note.id}
                type="button"
                className="block text-left"
                onClick={() => note.screenshot && props.onShowScreenshot(note.screenshot)}
              >
                <img src={note.screenshot} alt={note.title} className="max-h-24 rounded border border-slate-700" />
                <span className="text-[10px] text-slate-400">
                  {note.title} • {new Date(note.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
            {entry.proposal && <ProposalCard proposal={entry.proposal} onRunSteps={props.onRunSteps} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to your AI companion..."
          className="h-9 text-sm bg-slate-900 border-slate-700 flex-1"
          disabled={!sessionId}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <Button size="sm" onClick={() => void send()} disabled={!sessionId || sending} className="h-9 text-sm bg-slate-800">
          {sending ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
