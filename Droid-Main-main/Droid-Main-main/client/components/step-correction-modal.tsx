import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  ShieldAlert,
  ArrowRight,
  Crosshair,
  CheckCircle2,
  RefreshCw,
  Play,
  SkipForward,
  XCircle,
  Camera,
  Layers,
} from "lucide-react";

export interface StepCorrectionData {
  stepIndex: number;
  stepName: string;
  expectedAction: string;
  expectedCoords: { x: number; y: number };
  detectedCoords?: { x: number; y: number };
  driftDistancePx: number;
  shiftVector?: { dx: number; dy: number };
  evidenceId: string;
  reasoning: string;
  referenceScreenshotUrl?: string;
  currentLiveScreenshotUrl?: string;
}

export interface StepCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  correctionData?: StepCorrectionData | null;
  data?: StepCorrectionData | null;
  onAutoRecalibrateAndResume?: (newCoords: { x: number; y: number }) => void;
  onAdoptCurrentFrameAndResume?: () => void;
  onAdoptNewFrameAndResume?: () => void;
  onExecuteOriginalAndResume?: () => void;
  onExecuteOriginalCoords?: () => void;
  onSkipStep?: () => void;
  onAbortReplay?: () => void;
}

export const StepCorrectionModal: React.FC<StepCorrectionModalProps> = ({
  isOpen,
  onClose,
  correctionData: passedCorrectionData,
  data,
  onAutoRecalibrateAndResume,
  onAdoptCurrentFrameAndResume,
  onAdoptNewFrameAndResume,
  onExecuteOriginalAndResume,
  onExecuteOriginalCoords,
  onSkipStep,
  onAbortReplay,
}) => {
  const correctionData = data || passedCorrectionData;
  const handleAdopt = onAdoptNewFrameAndResume || onAdoptCurrentFrameAndResume || (() => {});
  const handleExecuteOriginal = onExecuteOriginalCoords || onExecuteOriginalAndResume || (() => {});
  const handleAbort = onAbortReplay || onClose;
  const handleSkip = onSkipStep || (() => {});
  const handleRecalibrate = onAutoRecalibrateAndResume || (() => {});
  if (!correctionData) return null;

  const candidateX = correctionData.detectedCoords?.x ?? correctionData.expectedCoords.x;
  const candidateY = correctionData.detectedCoords?.y ?? correctionData.expectedCoords.y;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-slate-950 border-2 border-amber-500/80 text-slate-100 p-6 shadow-2xl shadow-amber-950/60 font-mono">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500 text-amber-400">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-amber-300 flex items-center gap-2">
                  SCREENSHOT INTEGRITY VALIDATOR • REPLAY PAUSED
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Step #{correctionData.stepIndex + 1}: "{correctionData.stepName}" requires manual verification due to UI frame shift.
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-indigo-400 text-indigo-300 font-mono text-xs">
              🔍 {correctionData.evidenceId}
            </Badge>
          </div>
        </DialogHeader>

        {/* Drift & Reasoning Alert Banner */}
        <div className="my-3 p-3 rounded-lg bg-amber-950/40 border border-amber-500/50 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">Shift Distance:</span>
              <span className="px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 font-bold border border-amber-600">
                {correctionData.driftDistancePx.toFixed(1)} px
              </span>
              {correctionData.shiftVector && (
                <span className="text-slate-400 text-[11px]">
                  (ΔX: {correctionData.shiftVector.dx > 0 ? `+${correctionData.shiftVector.dx}` : correctionData.shiftVector.dx}px, 
                   ΔY: {correctionData.shiftVector.dy > 0 ? `+${correctionData.shiftVector.dy}` : correctionData.shiftVector.dy}px)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Original:</span>
              <span className="text-cyan-300 font-bold">({correctionData.expectedCoords.x}, {correctionData.expectedCoords.y})</span>
              <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Detected:</span>
              <span className="text-emerald-400 font-bold">({candidateX}, {candidateY})</span>
            </div>
          </div>

          <div className="text-xs text-slate-200 bg-slate-900/80 p-2 rounded border border-slate-800">
            <span className="text-cyan-400 font-bold">AI Reasoning: </span>
            {correctionData.reasoning}
          </div>
        </div>

        {/* Visual Comparison: Reference Recording vs Live Screen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-2">
          {/* Reference Image */}
          <div className="p-2 rounded bg-slate-900/70 border border-slate-800 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold text-cyan-400 flex items-center gap-1">
                <Camera className="w-3.5 h-3.5" /> Source Recording Reference
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Original Target</span>
            </div>
            <div className="relative aspect-video bg-black rounded overflow-hidden border border-cyan-900/40 flex items-center justify-center">
              {correctionData.referenceScreenshotUrl ? (
                <img
                  src={correctionData.referenceScreenshotUrl}
                  alt="Expected Recording Frame"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-slate-600 text-xs">No reference snapshot available</div>
              )}
              {/* Expected Coordinate Marker */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="px-2 py-1 bg-cyan-950/90 text-cyan-300 text-[10px] rounded border border-cyan-500 font-bold">
                  Target: ({correctionData.expectedCoords.x}, {correctionData.expectedCoords.y})
                </div>
              </div>
            </div>
          </div>

          {/* Current Live Screen */}
          <div className="p-2 rounded bg-slate-900/70 border border-slate-800 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <Crosshair className="w-3.5 h-3.5" /> Current Live Frame
              </span>
              <span className="text-[10px] text-emerald-500 font-mono">AI Detected Element</span>
            </div>
            <div className="relative aspect-video bg-black rounded overflow-hidden border border-emerald-900/40 flex items-center justify-center">
              {correctionData.currentLiveScreenshotUrl ? (
                <img
                  src={correctionData.currentLiveScreenshotUrl}
                  alt="Current Live Frame"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-slate-600 text-xs">Live frame available</div>
              )}
              {/* Detected Coordinate Marker */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="px-2 py-1 bg-emerald-950/90 text-emerald-300 text-[10px] rounded border border-emerald-500 font-bold animate-pulse">
                  Candidate: ({candidateX}, {candidateY})
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-between items-center pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAbort}
              className="text-red-400 hover:text-red-300 hover:bg-red-950/50 border-red-900 text-xs gap-1"
            >
              <XCircle className="w-3.5 h-3.5" /> Abort Replay
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              className="text-slate-400 hover:text-slate-200 border-slate-700 text-xs gap-1"
            >
              <SkipForward className="w-3.5 h-3.5" /> Skip Step
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExecuteOriginal}
              className="text-cyan-300 border-cyan-700 hover:bg-cyan-950 text-xs gap-1"
              title="Ignore drift and execute at original recorded position"
            >
              <Play className="w-3.5 h-3.5" /> Execute Original Coord
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAdopt}
              className="text-amber-300 border-amber-700 hover:bg-amber-950 text-xs gap-1"
              title="Update step reference screenshot to current frame and continue"
            >
              <Camera className="w-3.5 h-3.5" /> Adopt Current Frame
            </Button>

            <Button
              size="sm"
              onClick={() => handleRecalibrate({ x: candidateX, y: candidateY })}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1 border border-emerald-400 shadow-lg shadow-emerald-950"
              title="Update step coordinate to AI detected location and resume replay"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Auto-Recalibrate & Resume
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
