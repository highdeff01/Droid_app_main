import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  MousePointer,
  Keyboard,
  Clock,
  Zap,
  Play,
  Trash2,
  Copy,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  Sparkles,
  Layers,
  Camera,
  CheckCircle2,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { DiffFramesTestModal } from "../../src/components/DiffFramesTestModal";

export interface WorkflowStep {
  id: string;
  stepNumber?: number;
  name: string;
  action: string;
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  text?: string;
  keyPayload?: string;
  delayMs?: number;
  referenceScreenshotUrl?: string;
  [key: string]: any;
}

export interface StepManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps?: WorkflowStep[];
  sequence?: WorkflowStep[];
  activeStepId?: string | null;
  clickedCoords?: { x: number; y: number } | null;
  onAddStep?: (step: any) => void;
  onUpdateStep?: (indexOrId: any, updates: any) => void;
  onDeleteStep?: (indexOrId: any) => void;
  onReorderSteps?: (reorderedSteps: WorkflowStep[]) => void;
  onExecuteSingleStepOnPC?: (step: WorkflowStep) => void;
  onExecuteStepOnPC?: (step: WorkflowStep) => void;
  screenshotUrl?: string;
}

export const StepManagerModal: React.FC<StepManagerModalProps> = ({
  isOpen,
  onClose,
  steps: passedSteps,
  sequence,
  activeStepId,
  clickedCoords,
  onAddStep,
  onUpdateStep,
  onDeleteStep,
  onReorderSteps,
  onExecuteSingleStepOnPC,
  onExecuteStepOnPC,
  screenshotUrl,
}) => {
  const steps = passedSteps || sequence || [];
  const handleExecutePC = onExecuteSingleStepOnPC || onExecuteStepOnPC;
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    activeStepId || (steps.length > 0 ? steps[0].id : null)
  );
  const [checkedStepIds, setCheckedStepIds] = useState<Set<string>>(new Set());

  // Toggle single step selection for clearing
  const handleToggleCheckStep = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCheckedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllSteps = () => {
    if (checkedStepIds.size === steps.length) {
      setCheckedStepIds(new Set());
    } else {
      setCheckedStepIds(new Set(steps.map((s) => s.id)));
    }
  };

  const handleClearSelectedCheckedSteps = () => {
    if (checkedStepIds.size === 0) return;
    const idsToClear = Array.from(checkedStepIds);
    if (onReorderSteps) {
      const remaining = steps.filter((s) => !checkedStepIds.has(s.id));
      onReorderSteps(remaining);
    } else if (onDeleteStep) {
      idsToClear.forEach((id) => onDeleteStep(id));
    }
    toast.success(`Cleared ${idsToClear.length} selected step(s)`);
    setCheckedStepIds(new Set());
  };

  // Form state for creating / editing step
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(!activeStepId && !!clickedCoords);
  const [name, setName] = useState(
    clickedCoords ? `Step #${steps.length + 1} (${clickedCoords.x}, ${clickedCoords.y})` : `Step #${steps.length + 1}`
  );
  const [action, setAction] = useState<WorkflowStep["action"]>("click");
  const [x, setX] = useState<number>(clickedCoords?.x ?? 960);
  const [y, setY] = useState<number>(clickedCoords?.y ?? 540);
  const [toX, setToX] = useState<number | undefined>(undefined);
  const [toY, setToY] = useState<number | undefined>(undefined);
  const [text, setText] = useState<string>("");
  const [keyPayload, setKeyPayload] = useState<string>("Enter");
  const [delayMs, setDelayMs] = useState<number>(400);
  const [dwellDurationMs, setDwellDurationMs] = useState<number>(300);

  // Diff frame test modal state
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(false);

  // Sync when activeStepId or clickedCoords changes
  React.useEffect(() => {
    if (clickedCoords) {
      setIsCreatingNew(true);
      setX(clickedCoords.x);
      setY(clickedCoords.y);
      setName(`Step #${steps.length + 1} (${clickedCoords.x}, ${clickedCoords.y})`);
      setAction("click");
    } else if (activeStepId) {
      const existing = steps.find((s) => s.id === activeStepId);
      if (existing) {
        setIsCreatingNew(false);
        setSelectedStepId(existing.id);
        setName(existing.name || "");
        setAction(existing.action);
        setX(existing.x);
        setY(existing.y);
        setToX(existing.toX);
        setToY(existing.toY);
        setText(existing.text || "");
        setKeyPayload(existing.keyPayload || "Enter");
        setDelayMs(existing.delayMs || 400);
      }
    }
  }, [clickedCoords, activeStepId, steps]);

  if (!isOpen) return null;

  const currentStep = steps.find((s) => s.id === selectedStepId);

  const handleSelectExisting = (s: WorkflowStep) => {
    setIsCreatingNew(false);
    setSelectedStepId(s.id);
    setName(s.name || "");
    setAction(s.action);
    setX(s.x);
    setY(s.y);
    setToX(s.toX);
    setToY(s.toY);
    setText(s.text || "");
    setKeyPayload(s.keyPayload || "Enter");
    setDelayMs(s.delayMs || 400);
  };

  const handleSave = () => {
    if (isCreatingNew) {
      const newStep: Partial<WorkflowStep> = {
        name: name.trim() || `Step #${steps.length + 1}`,
        action,
        x: Number(x) || 960,
        y: Number(y) || 540,
        toX: toX !== undefined ? Number(toX) : undefined,
        toY: toY !== undefined ? Number(toY) : undefined,
        text: (action === "type_text" || action === "clear_and_type") ? text : undefined,
        keyPayload: action === "press_key" ? keyPayload : undefined,
        delayMs: Number(delayMs) || 400,
        referenceScreenshotUrl: screenshotUrl || undefined,
        status: "pending",
      };
      onAddStep?.(newStep);
      toast.success(`Step created: ${newStep.name}`);
    } else if (selectedStepId) {
      onUpdateStep?.(selectedStepId, {
        name,
        action,
        x: Number(x) || 960,
        y: Number(y) || 540,
        toX: toX !== undefined ? Number(toX) : undefined,
        toY: toY !== undefined ? Number(toY) : undefined,
        text: (action === "type_text" || action === "clear_and_type") ? text : undefined,
        keyPayload: action === "press_key" ? keyPayload : undefined,
        delayMs: Number(delayMs) || 400,
      });
      toast.success(`Step #${currentStep?.stepNumber || ""} updated.`);
    }
    onClose();
  };

  const handleMoveStep = (idx: number, dir: -1 | 1) => {
    if (!onReorderSteps) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);
    onReorderSteps(reordered);
  };

  return (
    <>
      <DiffFramesTestModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        targetCoords={{ x: Number(x) || 960, y: Number(y) || 540 }}
        onApplyRepositionedCoords={(coords) => {
          setX(coords.x);
          setY(coords.y);
          toast.success(`Applied compensated coordinates: (${coords.x}, ${coords.y})`);
        }}
      />

      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-cyan-500/70 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
          {/* Header */}
          <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-950/80 border border-cyan-500/50 rounded-lg text-cyan-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Step Action Manager & Configurator</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                    {steps.length} Steps
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  {clickedCoords
                    ? `Configuring target at coordinate (${clickedCoords.x}, ${clickedCoords.y})`
                    : "Create, inspect, modify coordinates, timing, and execute steps on PC"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body (2 Columns) */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden">
            {/* Left Column: Sequence Step List */}
            <div className="md:col-span-5 border-r border-slate-800 flex flex-col bg-slate-950/60 overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300 uppercase text-[11px]">Workflow Steps ({steps.length})</span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsCreatingNew(true);
                        setSelectedStepId(null);
                        setName(`Step #${steps.length + 1}`);
                        setAction("click");
                        setX(960);
                        setY(540);
                      }}
                      className="h-6 px-2 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white font-bold gap-1"
                    >
                      <Plus className="w-3 h-3" /> New Step
                    </Button>
                  </div>
                </div>

                {/* Selection & Clear Controls */}
                {steps.length > 0 && (
                  <div className="flex items-center justify-between text-[10px] bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                    <button
                      onClick={handleSelectAllSteps}
                      className="text-slate-400 hover:text-cyan-300 font-bold transition-colors"
                    >
                      {checkedStepIds.size === steps.length ? "Deselect All" : "Select All"}
                    </button>
                    {checkedStepIds.size > 0 && (
                      <button
                        onClick={handleClearSelectedCheckedSteps}
                        className="px-2 py-0.5 rounded bg-rose-950/90 border border-rose-600/70 text-rose-300 hover:text-white hover:bg-rose-900 font-bold flex items-center gap-1 transition-all"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                        Clear Selected ({checkedStepIds.size})
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {steps.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <MousePointer className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p>No steps in workflow sequence.</p>
                    <p className="text-[10px] mt-1">Right-click screen or click '+ New Step'.</p>
                  </div>
                ) : (
                  steps.map((s, idx) => {
                    const isChecked = checkedStepIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleSelectExisting(s)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          !isCreatingNew && selectedStepId === s.id
                            ? "bg-cyan-950/80 border-cyan-400 text-white shadow-md ring-1 ring-cyan-500/50"
                            : isChecked
                              ? "bg-rose-950/30 border-rose-600/50 text-slate-200"
                              : "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          {/* Selection Checkbox */}
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleCheckStep(s.id);
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-950 text-rose-500 accent-rose-500 cursor-pointer shrink-0"
                            title="Select to clear"
                          />
                          <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-cyan-400 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="truncate">
                            <div className="font-bold truncate text-[11px]">{s.name || `Step #${idx + 1}`}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                              <span className="uppercase text-cyan-300 font-semibold">{s.action}</span>
                              <span>•</span>
                              <span>({s.x}, {s.y})</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {onReorderSteps && (
                            <>
                              <button
                                disabled={idx === 0}
                                onClick={() => handleMoveStep(idx, -1)}
                                className="p-1 hover:text-cyan-300 disabled:opacity-30 rounded hover:bg-slate-800"
                                title="Move Step Up (Order -1)"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                disabled={idx === steps.length - 1}
                                onClick={() => handleMoveStep(idx, 1)}
                                className="p-1 hover:text-cyan-300 disabled:opacity-30 rounded hover:bg-slate-800"
                                title="Move Step Down (Order +1)"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              onDeleteStep?.(s.id);
                              toast.info(`Step removed.`);
                            }}
                            className="p-1 hover:text-red-400 text-slate-500 rounded hover:bg-slate-800"
                            title="Delete Step"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Step Configuration Form */}
            <div className="md:col-span-7 p-5 flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm font-bold text-cyan-300">
                    {isCreatingNew ? "➕ Create New Step" : `✏️ Edit Step #${currentStep?.stepNumber || ""}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setIsDiffModalOpen(true)}
                      className="h-7 px-2 text-[10px] bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/60 font-bold gap-1 shadow-sm"
                      title="Test movement across changing frames & similar reference screenshots"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-400" /> Test on Diff Frames
                    </Button>

                    {handleExecutePC && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const stepObj: WorkflowStep = {
                            id: selectedStepId || `temp_${Date.now()}`,
                            name,
                            action,
                            x: Number(x) || 960,
                            y: Number(y) || 540,
                            toX,
                            toY,
                            text,
                            keyPayload,
                            delayMs: Number(delayMs) || 400,
                            status: "pending",
                          };
                          handleExecutePC(stepObj);
                          toast.success(`Executed action '${action}' at (${x}, ${y}) on PC.`);
                        }}
                        className="h-7 px-2.5 text-[10px] bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold gap-1 shadow-md"
                      >
                        <Zap className="w-3 h-3 text-yellow-300" /> Test on PC
                      </Button>
                    )}
                  </div>
                </div>

                {/* Step Name */}
                <div className="space-y-1">
                  <Label className="text-slate-300 text-[11px]">Step Title / Description</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Click Search Button"
                    className="bg-slate-950 border-slate-800 text-white h-8 text-xs"
                  />
                </div>

                {/* Action Type Selector */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-[11px]">Action Type</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {[
                      { id: "click", label: "Left Click", icon: MousePointer },
                      { id: "right_click", label: "Right Click", icon: MousePointer },
                      { id: "double_click", label: "Double Click", icon: MousePointer },
                      { id: "swipe_up", label: "Swipe Up ⬆️", icon: ArrowUp },
                      { id: "swipe_down", label: "Swipe Down ⬇️", icon: ArrowDown },
                      { id: "swipe_left", label: "Swipe Left ⬅️", icon: ArrowLeft },
                      { id: "swipe_right", label: "Swipe Right ➡️", icon: ArrowRight },
                      { id: "drag", label: "Drag & Drop", icon: Play },
                      { id: "type_text", label: "Type Text", icon: Keyboard },
                      { id: "press_key", label: "Press Key", icon: Keyboard },
                      { id: "wait", label: "Wait Delay", icon: Clock },
                      { id: "launch_app", label: "Launch App", icon: Zap },
                    ].map((act) => {
                      const Icon = act.icon;
                      const isSelected = action === act.id;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => setAction(act.id as any)}
                          className={`p-2 rounded-lg border text-left flex items-center gap-1.5 transition-all ${
                            isSelected
                              ? "bg-cyan-600 border-cyan-300 text-white font-bold shadow-md shadow-cyan-950"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate text-[11px]">{act.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Coordinates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-[11px]">Target X (px)</Label>
                    <Input
                      type="number"
                      value={x}
                      onChange={(e) => setX(Number(e.target.value))}
                      className="bg-slate-950 border-slate-800 text-cyan-400 font-bold h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-[11px]">Target Y (px)</Label>
                    <Input
                      type="number"
                      value={y}
                      onChange={(e) => setY(Number(e.target.value))}
                      className="bg-slate-950 border-slate-800 text-cyan-400 font-bold h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Drag / Swipe destination coords if drag or swipe */}
                {(action === "drag" || action.startsWith("swipe_")) && (
                  <div className="grid grid-cols-2 gap-3 p-2 rounded-lg bg-slate-950 border border-cyan-800/50">
                    <div className="space-y-1">
                      <Label className="text-cyan-300 text-[11px]">Release To X (px)</Label>
                      <Input
                        type="number"
                        value={
                          toX ??
                          (action === "swipe_left"
                            ? x - 250
                            : action === "swipe_right"
                            ? x + 250
                            : x)
                        }
                        onChange={(e) => setToX(Number(e.target.value))}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-cyan-300 text-[11px]">Release To Y (px)</Label>
                      <Input
                        type="number"
                        value={
                          toY ??
                          (action === "swipe_up"
                            ? y - 250
                            : action === "swipe_down"
                            ? y + 250
                            : y)
                        }
                        onChange={(e) => setToY(Number(e.target.value))}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Text payload if typing */}
                {(action === "type_text" || action === "clear_and_type") && (
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-[11px]">Text Payload to Type</Label>
                    <Input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Enter string to type..."
                      className="bg-slate-950 border-slate-800 text-white h-8 text-xs font-sans"
                    />
                  </div>
                )}

                {/* Key payload if press key */}
                {(action === "press_key" || action === "hotkey") && (
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-[11px]">Key Name / Combination</Label>
                    <Input
                      value={keyPayload}
                      onChange={(e) => setKeyPayload(e.target.value)}
                      placeholder="e.g. Enter, Tab, Escape, ctrl+c"
                      className="bg-slate-950 border-slate-800 text-white h-8 text-xs"
                    />
                  </div>
                )}

                {/* Delay and Dwell */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-[11px]">Post-Action Delay (ms)</Label>
                    <Input
                      type="number"
                      value={delayMs}
                      onChange={(e) => setDelayMs(Number(e.target.value))}
                      className="bg-slate-950 border-slate-800 text-white h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-[11px]">Hold / Dwell Time (ms)</Label>
                    <Input
                      type="number"
                      value={dwellDurationMs}
                      onChange={(e) => setDwellDurationMs(Number(e.target.value))}
                      className="bg-slate-950 border-slate-800 text-white h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 gap-1.5 shadow-lg shadow-cyan-950"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isCreatingNew ? "Add Step to Sequence" : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
