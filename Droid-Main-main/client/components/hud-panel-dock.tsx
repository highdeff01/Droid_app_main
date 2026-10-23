import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HUD_DOCK_STORAGE_KEY,
  hudDockMaxHeight,
  parseDockState,
  type HudDockPanel,
  type HudDockState,
} from "@/lib/hud-layout";

export interface HudDockSection {
  id: HudDockPanel;
  title: string;
  content: React.ReactNode;
}

function readDockState(): HudDockState {
  try {
    return parseDockState(localStorage.getItem(HUD_DOCK_STORAGE_KEY));
  } catch {
    return parseDockState(null);
  }
}

/** Open/collapsed state per panel, remembered across reloads. */
export function useDockState() {
  const [state, setState] = useState<HudDockState>(readDockState);
  useEffect(() => {
    try {
      localStorage.setItem(HUD_DOCK_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable (private mode): the state still applies for this session.
    }
  }, [state]);
  const toggle = (panel: HudDockPanel) => setState((prev) => ({ ...prev, [panel]: !prev[panel] }));
  return { state, toggle };
}

/**
 * The HUD's panel drawer: one bounded, scrollable strip under the viewport with a
 * header tab per panel. It sits in the layout flow (never over the screen canvas
 * or bottom bar) and its height is capped so the viewport keeps the window.
 */
export const HudPanelDock: React.FC<{ sections: HudDockSection[] }> = ({ sections }) => {
  const { state, toggle } = useDockState();
  const openSections = sections.filter((s) => state[s.id]);
  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-950" data-testid="hud-panel-dock">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        {sections.map(({ id, title }) => (
          <button
            key={id}
            type="button"
            aria-expanded={state[id]}
            onClick={() => toggle(id)}
            className={cn(
              "flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px]",
              state[id] ? "border-cyan-600 bg-cyan-950/60 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200",
            )}
          >
            {state[id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {title}
          </button>
        ))}
      </div>
      {openSections.length > 0 && (
        <div className="space-y-1 overflow-y-auto px-2 pb-1" style={{ maxHeight: hudDockMaxHeight(window.innerHeight) }}>
          {openSections.map(({ id, content }) => (
            <section key={id} data-dock-panel={id}>
              {content}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
