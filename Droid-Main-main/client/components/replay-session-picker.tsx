import React, { useEffect, useState } from "react";
import { Film, MousePointer2, Monitor, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_RECORDING_SESSIONS, type MouseRecordingSession } from "@/lib/mouse-trajectory-store";

export interface ReplaySessionPickerProps {
  sessions: MouseRecordingSession[];
  /** Replays the session's recorded waypoints on the overlay, and on the PC when `onHardware`. */
  onReplayTrail: (session: MouseRecordingSession, onHardware: boolean) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}

/** Fastest a frame is shown in frame-sequence playback, and the slowest gap kept between frames. */
const MIN_FRAME_MS = 250;
const MAX_FRAME_MS = 3000;

function describeSession(session: MouseRecordingSession): string {
  const when = new Date(session.recordedAt ?? session.createdAt ?? Date.now()).toLocaleString();
  const seconds = ((session.durationMs ?? 0) / 1000).toFixed(1);
  return `${when} · ${session.stepCount ?? 0} step(s) · ${seconds}s · ${session.points.length} pts`;
}

/** Plays a session's captured frames in order at their recorded spacing, like a short video. */
function useFramePlayback(session: MouseRecordingSession | null) {
  const [index, setIndex] = useState<number | null>(null);
  const frames = session?.thumbnails ?? [];
  useEffect(() => {
    if (index === null || index >= frames.length - 1) return;
    const gap = frames[index + 1].timestamp - frames[index].timestamp;
    const timer = setTimeout(() => setIndex(index + 1), Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, gap)));
    return () => clearTimeout(timer);
  }, [index, frames]);
  return { frames, index, play: () => setIndex(0), stop: () => setIndex(null) };
}

/** Replay picker: every saved recording session, newest first, replayable as frames or as a mouse trail. */
export const ReplaySessionPicker: React.FC<ReplaySessionPickerProps> = ({ sessions, onReplayTrail, onDelete, busy }) => {
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const playback = useFramePlayback(selected);

  if (sessions.length === 0) {
    return <p className="p-4 text-xs font-mono text-slate-400">No recordings yet. Press RECORD MOUSE TRAIL, move on the canvas, then stop to save a session.</p>;
  }

  return (
    <div className="flex gap-3 p-3 text-xs font-mono text-slate-200 min-h-0">
      <ul className="w-1/2 max-h-[520px] overflow-y-auto space-y-1">
        <li className="text-[10px] text-slate-500">{sessions.length} / {MAX_RECORDING_SESSIONS} sessions (oldest evicted)</li>
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              onClick={() => {
                setSelectedId(session.id);
                playback.stop();
              }}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded border flex gap-2 items-center",
                session.id === selectedId ? "border-amber-500 bg-amber-950/40" : "border-slate-800 hover:bg-slate-900",
              )}
            >
              {session.thumbnails?.[0] ? (
                <img src={session.thumbnails[0].imageData} alt="" className="w-12 h-8 object-cover rounded" />
              ) : (
                <span className="w-12 h-8 rounded bg-slate-900 text-[9px] text-slate-500 flex items-center justify-center">no frame</span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-slate-100">{session.name}</span>
                <span className="block text-[10px] text-slate-400">{describeSession(session)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="w-1/2 space-y-2">
          <div className="aspect-video bg-black rounded border border-slate-800 flex items-center justify-center overflow-hidden">
            {playback.frames.length > 0 ? (
              <img src={playback.frames[playback.index ?? 0].imageData} alt="Recorded frame" className="w-full h-full object-contain" />
            ) : (
              <span className="text-slate-500">No frames were captured for this session</span>
            )}
          </div>
          <p className="text-[10px] text-slate-400">
            {playback.index === null ? `${playback.frames.length} frame(s)` : `Frame ${playback.index + 1} / ${playback.frames.length}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={playback.frames.length === 0} onClick={playback.play} className="h-7 text-[11px] gap-1 bg-purple-700 hover:bg-purple-600">
              <Film className="w-3 h-3" /> Play frames
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onReplayTrail(selected, false)} className="h-7 text-[11px] gap-1 bg-cyan-700 hover:bg-cyan-600">
              <MousePointer2 className="w-3 h-3" /> Trail on overlay
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onReplayTrail(selected, true)} className="h-7 text-[11px] gap-1 bg-amber-700 hover:bg-amber-600">
              <Monitor className="w-3 h-3" /> Trail on PC
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(selected.id!)} className="h-7 text-[11px] gap-1 border-slate-700 text-slate-300">
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
