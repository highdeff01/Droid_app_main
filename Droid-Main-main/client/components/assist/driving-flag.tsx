import { useEffect, useState } from "react";
import type { DrivingPayload } from "@shared/assist-bridge";
import { assistBridgeApi, errorText } from "@/lib/assist-bridge-api";

const POLL_MS = 3000;

/** "Who's driving": the executor flag droid-new broadcasts, shown here so both apps agree on it. */
export function DrivingFlag({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [driving, setDriving] = useState<DrivingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const next = await assistBridgeApi.driving();
        if (live) {
          setDriving(next);
          setError(null);
        }
      } catch (err) {
        if (live) setError(errorText(err));
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [refreshSignal]);

  if (error) return <span className="text-[11px] text-rose-300" role="alert">Driving flag unavailable</span>;
  if (!driving) return <span className="text-[11px] text-slate-400">Checking who's driving…</span>;
  const mine = driving.driver === "droid-main";
  return (
    <span
      title={driving.reason}
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium " +
        (mine ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-slate-600/40 bg-slate-500/10 text-slate-300")
      }
    >
      <span className={"h-2 w-2 rounded-full " + (mine ? "bg-cyan-400" : "bg-emerald-400")} />
      <span>Driving: {driving.driver}</span>
    </span>
  );
}
