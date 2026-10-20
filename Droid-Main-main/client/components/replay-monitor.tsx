import { useState, useEffect } from "react";
import type { ReplayRun } from "@shared/replay";
import { Button } from "@/components/ui/button";
export function ReplayMonitor({
  run,
  onControl,
  apiKey = "",
  base = "/api/replay",
  token = "",
}: {
  run: ReplayRun | null;
  onControl: (command: "pause" | "resume" | "cancel") => void;
  apiKey?: string;
  base?: string;
  token?: string;
}) {
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (evidence) URL.revokeObjectURL(evidence);
    },
    [evidence],
  );
  const show = async (hash: string) => {
    try {
      const response = await fetch(`${base}/${run!.id}/frames/${hash}`, {
        headers: {
          ...(apiKey ? { "x-api-key": apiKey } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error("Screenshot unavailable or expired");
      setEvidence(URL.createObjectURL(await response.blob()));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screenshot failed");
    }
  };
  return (
    <section
      className="rounded-lg border border-cyan-800 bg-slate-950 p-4 space-y-3"
      aria-label="Replay agent monitor"
    >
      <h3 className="font-semibold text-cyan-200">Replay agent monitor</h3>
      {!run ? (
        <p className="text-sm text-slate-400">
          Run recorded steps to inspect planning, execution and screenshot
          verification.
        </p>
      ) : (
        <>
          <p role="status" className="text-sm">
            {run.target} · {run.status} · {run.completed}/{run.total} verified ·
            iteration {run.iteration}
          </p>
          {run.error && (
            <p role="alert" className="text-amber-300 text-sm">
              {run.error}
            </p>
          )}
          {["running", "paused"].includes(run.status) && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  onControl(run.status === "paused" ? "resume" : "pause")
                }
              >
                {run.status === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onControl("cancel")}
              >
                Stop replay
              </Button>
            </div>
          )}
          <ol className="max-h-64 overflow-auto space-y-2 text-xs">
            {run.events
              .slice(-30)
              .reverse()
              .map((event) => (
                <li key={event.id} className="border-t border-slate-800 pt-2">
                  <strong>{event.phase}</strong>
                  {event.attempt ? ` · inspection ${event.attempt}` : ""}:{" "}
                  {event.detail}
                  <div className="flex gap-3 text-cyan-400">
                    {event.beforeHash && (
                      <button onClick={() => void show(event.beforeHash!)}>
                        Before screenshot
                      </button>
                    )}
                    {event.afterHash && (
                      <button onClick={() => void show(event.afterHash!)}>
                        After screenshot
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ol>
          <p className="text-xs text-slate-500">
            Latest 12 screenshots are retained until a new run or server
            restart. An uncertain action is never repeated automatically.
          </p>
          {error && <p role="alert">{error}</p>}
          {evidence && (
            <div>
              <button onClick={() => setEvidence("")}>Close screenshot</button>
              <img
                src={evidence}
                alt="Replay screenshot evidence"
                className="max-h-96 object-contain"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
