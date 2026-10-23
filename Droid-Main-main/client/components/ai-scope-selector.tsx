import React, { useEffect } from "react";
import { Maximize, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_SCOPE_LABEL, clientRectToScreenRegion, setHudRegion, setScopeMode, useAiScope, type AiScopeMode } from "@/lib/ai-scope";

const MODES: AiScopeMode[] = ["hud", "full"];
const MODE_ICON: Record<AiScopeMode, React.ComponentType<{ className?: string }>> = { hud: MonitorSmartphone, full: Maximize };

/** Publishes where the HUD canvas sits on the desktop screen while it is mounted (the "HUD canvas only" region). */
export function useHudScopeRegion(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const measure = () => {
      const element = ref.current;
      setHudRegion(element ? clientRectToScreenRegion(element.getBoundingClientRect(), window) : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // The frame layer can mount, resize or move without a window event (tab switch, size mode).
    const poll = setInterval(measure, 1000);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      clearInterval(poll);
      setHudRegion(null);
    };
  }, [ref]);
}

/** Where the AI may act: the HUD canvas region only, or the entire PC screen. Persisted. */
export const AiScopeSelector: React.FC = () => {
  const scope = useAiScope();
  return (
    <div className="flex items-center gap-0.5 rounded border border-slate-700 p-0.5" role="radiogroup" aria-label="AI operating scope">
      {MODES.map((mode) => {
        const Icon = MODE_ICON[mode];
        const active = scope.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setScopeMode(mode)}
            title={`AI operates within: ${AI_SCOPE_LABEL[mode]}`}
            className={cn("flex items-center gap-1 rounded px-1.5 text-[10px]", active ? "bg-cyan-500/20 text-cyan-200" : "text-slate-500 hover:text-slate-300")}
          >
            <Icon className="h-3 w-3" />
            {AI_SCOPE_LABEL[mode]}
          </button>
        );
      })}
      {scope.mode === "hud" && !scope.region ? <span className="px-1 text-[10px] text-rose-300">no HUD region</span> : null}
    </div>
  );
};
