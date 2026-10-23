import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HUD_LAYERS, hudModalRect } from "@/lib/hud-layout";

export interface HudModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Largest size the box takes; it shrinks to fit narrow or short windows. */
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  children: React.ReactNode;
}

function useWindowSize() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/**
 * Centred, non-fullscreen HUD dialog: no backdrop, so the screen canvas and HUD
 * controls around it stay visible and clickable; it sits below every control
 * layer and is dismissed with its close button or Escape.
 */
export const HudModal: React.FC<HudModalProps> = ({ open, onClose, title, maxWidth = 960, maxHeight = 720, className, children }) => {
  const windowSize = useWindowSize();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const rect = hudModalRect(windowSize, { width: maxWidth, height: maxHeight });
  return (
    <div
      role="dialog"
      aria-modal="false"
      style={rect}
      className={cn(
        "fixed flex flex-col overflow-hidden rounded-2xl border border-cyan-500/50 bg-slate-950/95 shadow-2xl backdrop-blur-md animate-in fade-in",
        HUD_LAYERS.modal,
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <div className="min-w-0 truncate font-mono text-sm font-bold text-cyan-300">{title}</div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
};
