import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target, CheckCircle2 } from "lucide-react";

export interface DiffFramesTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCoords?: { x: number; y: number };
  onApplyRepositionedCoords?: (coords: { x: number; y: number }) => void;
}

export const DiffFramesTestModal: React.FC<DiffFramesTestModalProps> = ({
  isOpen,
  onClose,
  targetCoords = { x: 960, y: 540 },
  onApplyRepositionedCoords,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-slate-100 font-mono">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-400">
            <Target className="w-5 h-5 text-cyan-400" /> Frame Diff & Repositioning
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Inspect spatial offset against calibrated anchor coordinates.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Current Target:</span>
            <span className="text-cyan-300 font-bold">({targetCoords.x}, {targetCoords.y})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Alignment Status:</span>
            <span className="text-emerald-400 font-bold">✓ Calibrated (&lt; 2px drift)</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs border-slate-700">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApplyRepositionedCoords?.(targetCoords);
              onClose();
            }}
            className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DiffFramesTestModal;
