import { useState, useEffect } from "react";
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Wand2,
  FileText,
  Sliders,
  Flame,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Hash,
  Layers,
  Bookmark,
  BookmarkCheck,
  Trash2,
  ListFilter,
  Eye,
  CheckCheck,
  Settings2,
  Smartphone,
  Share2,
  Zap,
  Info,
  SlidersHorizontal,
  ChevronRight,
  Gauge,
  HelpCircle,
  LayoutGrid,
  Scale,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BulkGeneratorTab } from "./BulkGeneratorTab";
import { AppBriefsHistoryView } from "./AppBriefsHistoryView";
import { saveAppBrief, AppBriefRecord } from "@/lib/app-brief-history-store";
import { useAppBriefHistory } from "@/hooks/useAppBriefHistory";
import {
  WordConstraintMode,
  ConstraintPresetConfig,
  CONSTRAINT_PRESETS,
} from "@/lib/description-constraint-presets";

export type {
  WordConstraintMode,
  ConstraintPresetConfig,
};
export {
  CONSTRAINT_PRESETS,
};

interface Variation {
  text: string;
  wordCount: number;
  charCount?: number;
  style: string;
}

export interface SavedDescriptionItem {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  charCount: number;
  constraintMode: WordConstraintMode;
  targetLimit: number;
  style: string;
  savedAt: string;
  keyPropositions: string[];
  source: string;
  isApplied?: boolean;
}

interface RefineResponse {
  success: boolean;
  refinedDescription: string;
  wordCount: number;
  charCount?: number;
  targetWordLimit?: number;
  constraintMode?: string;
  keyPropositions: string[];
  rationale: string;
  variations: Variation[];
  originalWordCount: number;
  originalCharCount?: number;
  source: "qwen" | "heuristic-engine";
  error?: string;
}

const SAMPLE_PRESETS = [
  {
    title: "AI Game Automation (Current App)",
    rough:
      "This is a unified AI automation master platform and game vision control hub with autonomous screen perception, real pyautogui mouse movements, and master workflow orchestrator for cross-platform desktop and mobile games.",
  },
  {
    title: "Cloud Infrastructure Monitor",
    rough:
      "An all-in-one devops observability platform that helps engineering teams track Kubernetes clusters, detect anomalous memory spikes across microservices in real-time, and execute automated rollback procedures before outages happen.",
  },
  {
    title: "Infinite Collaborative Canvas",
    rough:
      "We have built a digital whiteboard tool designed to allow remote cross-functional product designers and engineers to brainstorm system architectures, draw intuitive flowcharts collaboratively, and export diagrams directly into GitHub code repositories.",
  },
  {
    title: "Personal AI Finance Manager",
    rough:
      "Basically an application designed to help everyday consumers connect multiple bank accounts, automatically categorize monthly transactions using machine learning, and deliver smart alerts to prevent overspending on subscriptions.",
  },
];

export function DescriptionRefiner({
  onApplyDescription,
}: {
  onApplyDescription?: (desc: string) => void;
}) {
  const [roughText, setRoughText] = useState(
    "This is a unified AI automation master platform and game vision control hub with autonomous screen perception, real pyautogui mouse movements, and master workflow orchestrator for cross-platform desktop and mobile games."
  );

  // Settings & Constraint Toggle State
  const [constraintMode, setConstraintMode] = useState<WordConstraintMode>(() => {
    try {
      const saved = localStorage.getItem("preferred_word_constraint_mode");
      if (saved && ["twitter_brevity", "app_store_short", "tagline", "standard_pitch", "detailed_store", "custom"].includes(saved)) {
        return saved as WordConstraintMode;
      }
    } catch {}
    return "twitter_brevity";
  });

  const [customWordLimit, setCustomWordLimit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("preferred_custom_word_limit");
      if (saved) return parseInt(saved, 10) || 24;
    } catch {}
    return 24;
  });

  const [autoRefineOnToggle, setAutoRefineOnToggle] = useState<boolean>(true);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isCompareDrawerOpen, setIsCompareDrawerOpen] = useState<boolean>(false);

  const [tone, setTone] = useState<"high-impact" | "technical" | "minimalist" | "marketing">("high-impact");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [result, setResult] = useState<RefineResponse | null>(null);
  const [history, setHistory] = useState<RefineResponse[]>([]);
  const [activeAppliedDesc, setActiveAppliedDesc] = useState<string>("");
  const [deckFilter, setDeckFilter] = useState<string>("all");

  // Comparison matrix state for multi-constraint preview
  const [comparativeOutputs, setComparativeOutputs] = useState<Record<string, { text: string; wordCount: number; charCount: number }>>({});
  const [isGeneratingComparison, setIsGeneratingComparison] = useState<boolean>(false);

  // Get active preset configuration
  const activePreset = CONSTRAINT_PRESETS.find((p) => p.id === constraintMode) || CONSTRAINT_PRESETS[0];
  const effectiveWordLimit = constraintMode === "custom" ? customWordLimit : activePreset.maxWords;

  // Persisted Saved Pitches & Names Deck State
  const [activeMainTab, setActiveMainTab] = useState<"studio" | "bulk" | "history">("studio");
  const { stats: historyStats } = useAppBriefHistory();

  const handleRevisitFromHistory = (brief: AppBriefRecord) => {
    setActiveMainTab("studio");
    setRoughText(brief.originalInput || brief.description);
    if (
      brief.constraintMode &&
      ["twitter_brevity", "app_store_short", "tagline", "standard_pitch", "detailed_store", "custom"].includes(
        brief.constraintMode
      )
    ) {
      setConstraintMode(brief.constraintMode as WordConstraintMode);
    }
    if (brief.tone && ["high-impact", "technical", "minimalist", "marketing"].includes(brief.tone)) {
      setTone(brief.tone as any);
    }
    if (brief.targetLimit) {
      setCustomWordLimit(brief.targetLimit);
    }
    setResult({
      success: true,
      refinedDescription: brief.description,
      wordCount: brief.wordCount,
      charCount: brief.charCount,
      keyPropositions: brief.keyPropositions,
      constraintMode: brief.constraintMode,
      targetWordLimit: brief.targetLimit,
      rationale: `Revisited from History Vault (${brief.source})`,
      variations: [],
      originalWordCount: brief.wordCount,
      source: "heuristic-engine",
    });
    setActiveAppliedDesc(brief.description);
    toast.success(`Loaded "${brief.title}" into Interactive Pitch Studio!`);
  };

  const [savedPitches, setSavedPitches] = useState<SavedDescriptionItem[]>(() => {
    try {
      const cached = localStorage.getItem("saved_description_pitches_deck");
      if (cached) return JSON.parse(cached);
    } catch {}
    return [
      {
        id: "init_pitch_twitter",
        title: "Twitter Brevity Pitch",
        description: "Autonomous AI game vision hub with real pyautogui mouse execution and workflow orchestration.",
        wordCount: 13,
        charCount: 95,
        constraintMode: "twitter_brevity",
        targetLimit: 12,
        style: "High-Impact",
        savedAt: "Saved Baseline",
        keyPropositions: ["Autonomous Screen Perception", "PyAutoGUI Mouse Control", "Workflow Orchestrator"],
        source: "Qwen 3.5 2B",
        isApplied: true,
      },
      {
        id: "init_pitch_appstore",
        title: "App Store Short Description",
        description: "Autonomous AI master automation and computer vision hub. Features deep screen perception, natural human drift mouse execution, and adaptive multi-task workflow orchestration across desktop and mobile apps.",
        wordCount: 28,
        charCount: 212,
        constraintMode: "app_store_short",
        targetLimit: 30,
        style: "App Store Short",
        savedAt: "Saved Baseline",
        keyPropositions: ["Deep Screen Perception", "Human Drift Execution", "Multi-Task Orchestration"],
        source: "Qwen 3.5 2B",
        isApplied: false,
      },
      {
        id: "init_pitch_tagline",
        title: "Hero Banner Tagline",
        description: "Autonomous game vision control hub.",
        wordCount: 5,
        charCount: 36,
        constraintMode: "tagline",
        targetLimit: 6,
        style: "Punchy Tagline",
        savedAt: "Saved Baseline",
        keyPropositions: ["Autonomous Vision", "Game Automation"],
        source: "Qwen 3.5 2B",
        isApplied: false,
      },
    ];
  });

  // Calculate live words & chars of input
  const countInputWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const inputWords = countInputWords(roughText);
  const inputChars = roughText.trim().length;

  // Main Refine Execution Handler
  const handleRefine = async (
    customText?: string,
    overrideConstraint?: WordConstraintMode,
    overrideLimit?: number
  ) => {
    const textToRefine = (customText ?? roughText).trim();
    if (!textToRefine) {
      toast.error("Please enter a rough description first.");
      return;
    }

    const currentConstraint = overrideConstraint ?? constraintMode;
    const currentLimit = overrideLimit ?? (currentConstraint === "custom" ? customWordLimit : (CONSTRAINT_PRESETS.find(p => p.id === currentConstraint)?.maxWords || 20));

    setIsLoading(true);
    try {
      const response = await fetch("/api/ai/refine-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: textToRefine,
          targetWords: currentLimit,
          tone,
          constraintMode: currentConstraint,
        }),
      });

      const data: RefineResponse = await response.json();

      if (data.success) {
        setResult(data);
        setHistory((prev) => [data, ...prev.filter((item) => item.refinedDescription !== data.refinedDescription)].slice(0, 8));

        // Auto-persist to local state App Briefs History Vault
        try {
          saveAppBrief({
            title: `${activePreset.label} (${data.wordCount}w)`,
            description: data.refinedDescription,
            wordCount: data.wordCount,
            charCount: data.charCount || data.refinedDescription.length,
            constraintMode: currentConstraint,
            targetLimit: currentLimit,
            tone,
            source: "Interactive Pitch Studio",
            keyPropositions: data.keyPropositions || [],
            category: "Interactive Studio",
            originalInput: textToRefine,
          });
        } catch {}

        toast.success(`Refined to ${data.wordCount} words for ${activePreset.label} (${data.charCount || data.refinedDescription.length} chars)!`);
      } else {
        toast.error(data.error || "Failed to refine description");
      }
    } catch (err: any) {
      toast.error("Error communicating with server: " + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Generate All Comparative Constraints
  const handleGenerateAllComparisons = async () => {
    if (!roughText.trim()) {
      toast.error("Please provide a description to compare.");
      return;
    }

    setIsGeneratingComparison(true);
    const results: Record<string, { text: string; wordCount: number; charCount: number }> = {};

    const modesToRun: WordConstraintMode[] = ["tagline", "twitter_brevity", "standard_pitch", "app_store_short", "detailed_store"];

    for (const mode of modesToRun) {
      const preset = CONSTRAINT_PRESETS.find((p) => p.id === mode)!;
      try {
        const response = await fetch("/api/ai/refine-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: roughText.trim(),
            targetWords: preset.maxWords,
            tone,
            constraintMode: mode,
          }),
        });
        const data: RefineResponse = await response.json();
        if (data.success) {
          results[mode] = {
            text: data.refinedDescription,
            wordCount: data.wordCount,
            charCount: data.charCount || data.refinedDescription.length,
          };
        }
      } catch {}
    }

    setComparativeOutputs(results);
    setIsGeneratingComparison(false);
    toast.success("Generated side-by-side pitch matrix across all constraint formats!");
  };

  // Switch constraint mode with persistence and optional auto-refine
  const handleSelectConstraintMode = (mode: WordConstraintMode) => {
    setConstraintMode(mode);
    try {
      localStorage.setItem("preferred_word_constraint_mode", mode);
    } catch {}

    const newLimit = mode === "custom" ? customWordLimit : (CONSTRAINT_PRESETS.find(p => p.id === mode)?.maxWords || 20);

    if (autoRefineOnToggle && roughText.trim()) {
      handleRefine(roughText, mode, newLimit);
    }
  };

  // Handle custom word limit change
  const handleCustomLimitChange = (limit: number) => {
    setCustomWordLimit(limit);
    try {
      localStorage.setItem("preferred_custom_word_limit", String(limit));
    } catch {}
  };

  // Run refinement on initial mount
  useEffect(() => {
    handleRefine();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = (text: string) => {
    setActiveAppliedDesc(text);
    if (onApplyDescription) {
      onApplyDescription(text);
    }
    // Update active status in saved list
    setSavedPitches((prev) => {
      const updated = prev.map((item) => ({
        ...item,
        isApplied: item.description.trim() === text.trim(),
      }));
      try {
        localStorage.setItem("saved_description_pitches_deck", JSON.stringify(updated));
      } catch {}
      return updated;
    });
    toast.success("Applied description to application context!");
  };

  const handleSavePitch = (
    description: string,
    style: string = activePreset.label,
    keyPropositions: string[] = [],
    source: string = "AI Refiner",
    customTitle?: string,
    forcedConstraint?: WordConstraintMode,
    forcedLimit?: number
  ) => {
    const words = countInputWords(description);
    const chars = description.trim().length;
    const exists = savedPitches.some((p) => p.description.trim() === description.trim());
    if (exists) {
      toast.info("This description is already saved in your comparison deck.");
      return;
    }

    const mode = forcedConstraint || constraintMode;
    const limit = forcedLimit || effectiveWordLimit;

    const newItem: SavedDescriptionItem = {
      id: `pitch_${Date.now()}`,
      title: customTitle || `${style} (${words}w / ${chars}c)`,
      description,
      wordCount: words,
      charCount: chars,
      constraintMode: mode,
      targetLimit: limit,
      style,
      savedAt: new Date().toLocaleTimeString(),
      keyPropositions: keyPropositions.length > 0 ? keyPropositions : ["Concise Pitch", `${mode} Target`],
      source,
      isApplied: false,
    };

    const updated = [newItem, ...savedPitches];
    setSavedPitches(updated);
    try {
      localStorage.setItem("saved_description_pitches_deck", JSON.stringify(updated));
    } catch {}

    // Save to App Briefs History Vault
    try {
      saveAppBrief({
        title: newItem.title,
        description: newItem.description,
        wordCount: newItem.wordCount,
        charCount: newItem.charCount,
        constraintMode: newItem.constraintMode,
        targetLimit: newItem.targetLimit,
        tone,
        source: newItem.source || "Saved Pitch Deck",
        keyPropositions: newItem.keyPropositions,
        category: "Saved Pitch Deck",
        originalInput: roughText,
      });
    } catch {}

    toast.success(`Saved to comparison list & history vault (${words}w / ${chars}c)!`);
  };

  const handleDeleteSavedPitch = (id: string) => {
    const updated = savedPitches.filter((p) => p.id !== id);
    setSavedPitches(updated);
    try {
      localStorage.setItem("saved_description_pitches_deck", JSON.stringify(updated));
    } catch {}
    toast.info("Removed description from saved list.");
  };

  const handleClearAllSaved = () => {
    setSavedPitches([]);
    try {
      localStorage.removeItem("saved_description_pitches_deck");
    } catch {}
    toast.info("Cleared all saved descriptions.");
  };

  const isPitchSaved = (desc: string) => {
    return savedPitches.some((p) => p.description.trim() === desc.trim());
  };

  const currentWords = result ? result.wordCount : 0;
  const currentChars = result ? (result.charCount || result.refinedDescription.length) : 0;
  const isStrictlyUnderLimit = currentWords <= effectiveWordLimit;

  // Filtered saved pitches
  const filteredSavedPitches = savedPitches.filter((p) => {
    if (deckFilter === "all") return true;
    return p.constraintMode === deckFilter;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner with Constraint Status & Quick Settings Modal */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-inner">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Generated Text Constraint Studio
              </h2>
              <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 font-mono text-[11px] px-2.5 py-0.5">
                {activePreset.label}
              </Badge>
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 font-mono text-[11px] px-2.5 py-0.5">
                &le; {effectiveWordLimit} Words
              </Badge>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl font-mono">
              Switch effortlessly between Twitter-style post brevity (≤ 12 words), App Store short descriptions (≤ 30 words),
              punchy hero taglines, and custom publishing constraints.
            </p>
          </div>

          {/* Quick Action Tools & Settings Button */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Compare All Drawer Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCompareDrawerOpen(true);
                if (Object.keys(comparativeOutputs).length === 0) {
                  handleGenerateAllComparisons();
                }
              }}
              className="h-8 text-xs font-mono font-bold bg-slate-950 border-purple-800/80 text-purple-300 hover:bg-purple-950/60 hover:text-white gap-1.5"
            >
              <Scale className="w-3.5 h-3.5 text-purple-400" />
              Compare Constraints Matrix
            </Button>

            {/* Constraint Settings Modal */}
            <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-mono font-bold bg-slate-950 border-slate-700 text-slate-200 hover:text-cyan-300 hover:border-cyan-500 gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                  Constraint Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-100">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    Word Count & Platform Constraint Settings
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-400 font-mono">
                    Configure default length budgets, platform formatting rules, and auto-regeneration behaviors.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2 text-xs font-mono">
                  {/* Platform Rules Comparison Table */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                    <div className="p-2.5 bg-slate-900 border-b border-slate-800 font-bold text-slate-200 flex items-center justify-between">
                      <span>Platform Constraints Reference</span>
                      <span className="text-[10px] text-slate-500 font-normal">Standard Specifications</span>
                    </div>
                    <div className="divide-y divide-slate-800/70">
                      {CONSTRAINT_PRESETS.map((preset) => (
                        <div
                          key={preset.id}
                          onClick={() => {
                            handleSelectConstraintMode(preset.id);
                            setIsSettingsModalOpen(false);
                          }}
                          className={`p-3 flex items-center justify-between hover:bg-slate-800/40 cursor-pointer transition-all ${
                            constraintMode === preset.id ? "bg-cyan-950/40 border-l-2 border-cyan-400" : ""
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <preset.icon className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="font-bold text-white">{preset.label}</span>
                              {constraintMode === preset.id && (
                                <Badge className="bg-cyan-600 text-white text-[9px] px-1.5 py-0">ACTIVE</Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{preset.platformGuideline}</p>
                          </div>
                          <div className="text-right shrink-0 pl-3">
                            <span className="font-bold text-emerald-400 block">{preset.badge}</span>
                            <span className="text-[10px] text-slate-500">~{preset.maxCharsEstimate} chars</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Settings toggles */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white block">Auto-Refine on Preset Switch</span>
                        <span className="text-[11px] text-slate-400">
                          Automatically regenerate and synthesize output when toggling between Twitter/App Store presets.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoRefineOnToggle}
                        onChange={(e) => setAutoRefineOnToggle(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Tab Switcher: Interactive Studio vs Bulk Keyword Generator vs Saved History */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-2 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeMainTab === "studio" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainTab("studio")}
            className={`h-9 px-4 text-xs font-mono font-bold gap-2 ${
              activeMainTab === "studio"
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Interactive Pitch Studio
          </Button>
          <Button
            variant={activeMainTab === "bulk" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainTab("bulk")}
            className={`h-9 px-4 text-xs font-mono font-bold gap-2 ${
              activeMainTab === "bulk"
                ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Bulk Keyword Generator
          </Button>
          <Button
            variant={activeMainTab === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMainTab("history")}
            className={`h-9 px-4 text-xs font-mono font-bold gap-2 ${
              activeMainTab === "history"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5 text-purple-400" />
            Briefs History &amp; Revisit
            <Badge className="bg-purple-950 text-purple-300 border-purple-600 text-[10px] px-1.5 py-0">
              {historyStats.totalCount}
            </Badge>
          </Button>
        </div>

        <div className="text-xs font-mono text-slate-500 hidden sm:block">
          {activeMainTab === "studio"
            ? "Fine-tune single descriptions with live slider & comparison"
            : activeMainTab === "bulk"
            ? "Generate multiple paired names & descriptions in batches"
            : "Persisted vault of generated briefs, versions, and outputs"}
        </div>
      </div>

      {activeMainTab === "history" ? (
        <AppBriefsHistoryView
          onRevisitBrief={handleRevisitFromHistory}
          onApplyPitch={(name, desc) => {
            onApplyDescription?.(desc);
            setActiveAppliedDesc(desc);
          }}
        />
      ) : activeMainTab === "bulk" ? (
        <BulkGeneratorTab
          onApplyPitch={(name, desc) => {
            onApplyDescription?.(desc);
            setActiveAppliedDesc(desc);
          }}
          onSaveToDeck={(item) => {
            handleSavePitch(
              item.description,
              item.style || "Bulk Generator",
              item.keyPropositions || [],
              item.source || "Bulk Generator",
              item.title,
              item.constraintMode as any,
              item.targetLimit
            );
          }}
        />
      ) : (
        <>
          {/* Primary Word Count Constraint Switcher / Segmented Toggle Bar */}
          <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            SELECT WORD COUNT CONSTRAINT / PUBLISHING FORMAT
          </label>
          <span className="text-[11px] font-mono text-slate-400">
            Current Target: <strong className="text-cyan-300">&le; {effectiveWordLimit} words</strong> (~{activePreset.maxCharsEstimate} chars)
          </span>
        </div>

        {/* Segmented Toggle Buttons Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {CONSTRAINT_PRESETS.map((preset) => {
            const isSelected = constraintMode === preset.id;
            const Icon = preset.icon;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectConstraintMode(preset.id)}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 shadow-sm ${
                  isSelected
                    ? "bg-slate-900 border-cyan-500 ring-2 ring-cyan-500/30 shadow-md shadow-cyan-950"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-400 hover:text-slate-200"
                }`}
                title={preset.tooltip}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-4 h-4 ${isSelected ? "text-cyan-400" : "text-slate-400"}`} />
                  <span className={`text-xs font-mono font-bold truncate ${isSelected ? "text-white" : "text-slate-300"}`}>
                    {preset.shortName}
                  </span>
                </div>
                <div>
                  <span className={`text-[11px] font-mono font-bold block ${isSelected ? "text-emerald-400" : "text-slate-400"}`}>
                    {preset.id === "custom" ? `≤ ${customWordLimit} words` : preset.badge}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 truncate block">
                    ~{preset.maxCharsEstimate} chars
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Slider Bar (Visible when Custom is selected or to fine tune) */}
        {constraintMode === "custom" && (
          <div className="p-3 rounded-xl bg-slate-900/90 border border-pink-500/40 space-y-2 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-pink-300 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Custom Word Ceiling Adjustment
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Word Limit:</span>
                <span className="px-2 py-0.5 rounded bg-pink-950 text-pink-300 border border-pink-700 font-bold">
                  {customWordLimit} Words
                </span>
                <span className="text-slate-400">Estimated ~{customWordLimit * 7} characters</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={4}
                max={75}
                value={customWordLimit}
                onChange={(e) => handleCustomLimitChange(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <div className="flex gap-1 shrink-0">
                {[8, 12, 20, 30, 45, 60].map((stepVal) => (
                  <button
                    key={stepVal}
                    type="button"
                    onClick={() => handleCustomLimitChange(stepVal)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border transition-all ${
                      customWordLimit === stepVal
                        ? "bg-pink-600 text-white border-pink-400"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    {stepVal}w
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preset Rough Pitch Pills */}
      <div className="space-y-2">
        <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          SAMPLE ROUGH PITCHES (LOAD UNEDITED FEATURE DUMPS)
        </label>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setRoughText(preset.rough);
                handleRefine(preset.rough);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900/90 border border-slate-800 hover:border-cyan-500/60 hover:bg-slate-800/90 text-slate-300 hover:text-white transition-all text-left flex items-center gap-1.5 shadow-sm"
            >
              <FileText className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>{preset.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input and Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Rough Input & Controls */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="bg-slate-900/90 border-slate-800 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Rough Input Description
                </CardTitle>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className={`px-2 py-0.5 rounded font-bold ${inputWords > effectiveWordLimit ? "bg-amber-950 text-amber-300 border border-amber-800" : "bg-slate-800 text-slate-300"}`}>
                    {inputWords} words
                  </span>
                  <span className="text-slate-400">{inputChars} chars</span>
                </div>
              </div>
              <CardDescription className="text-xs text-slate-400">
                Paste raw feature lists, release notes, or elevator drafts to distill under your chosen constraint.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={roughText}
                onChange={(e) => setRoughText(e.target.value)}
                rows={5}
                placeholder="Enter rough, long, or unpolished app description here..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-sm font-mono text-slate-100 placeholder:text-slate-600 outline-none resize-none transition-all leading-relaxed"
              />

              {/* Controls bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1.5 font-bold">
                    Tone / Copywriting Style
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:border-cyan-500 outline-none cursor-pointer"
                  >
                    <option value="high-impact">High-Impact (Punchy & Direct)</option>
                    <option value="technical">Technical (Architecture & Stack)</option>
                    <option value="minimalist">Minimalist (Essential Core)</option>
                    <option value="marketing">Product Store (Outcome & Utility)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1.5 font-bold">
                    Active Constraint Mode
                  </label>
                  <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono flex items-center justify-between">
                    <span className="text-cyan-300 font-bold truncate">{activePreset.shortName}</span>
                    <span className="text-emerald-400 font-bold">&le; {effectiveWordLimit}w</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={() => handleRefine()}
                  disabled={isLoading || !roughText.trim()}
                  className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs h-10 shadow-lg shadow-cyan-900/20 gap-2"
                >
                  {isLoading ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      Synthesizing for {activePreset.shortName}...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 text-amber-300" />
                      Generate ({activePreset.shortName}: &le; {effectiveWordLimit} Words)
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRoughText("");
                    setResult(null);
                  }}
                  className="h-10 px-3 bg-slate-950 border-slate-800 text-slate-400 hover:text-white font-mono text-xs"
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Refined Output & Value Propositions */}
        <div className="lg:col-span-6 space-y-4">
          {result ? (
            <Card className="bg-slate-900/90 border-slate-800 shadow-xl relative overflow-hidden">
              {/* Highlight ribbon */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-400 to-blue-500" />

              <CardHeader className="pb-3 pt-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Refined Output ({activePreset.shortName})
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm ${
                        isStrictlyUnderLimit
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                          : "bg-red-950 text-red-300 border border-red-700"
                      }`}
                    >
                      <Hash className="w-3 h-3" />
                      {result.wordCount} / {effectiveWordLimit} WORDS
                    </span>
                    <span className="px-2 py-1 rounded text-[10px] font-mono uppercase bg-slate-950 text-slate-400 border border-slate-800">
                      {result.source === "qwen" ? "Qwen 3.5 2B" : "NLP Heuristic"}
                    </span>

                    {/* Quick Regenerate Button in Header */}
                    <Button
                      id="btn-regenerate-header"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefine()}
                      disabled={isLoading}
                      className="h-7 px-2.5 text-xs font-mono font-bold bg-slate-950 border-cyan-500/70 text-cyan-300 hover:bg-cyan-950/80 hover:text-white hover:border-cyan-400 gap-1.5 shadow-sm transition-all"
                      title="Regenerate with same input criteria (re-runs AI synthesis with current text, tone, and constraint)"
                    >
                      <RotateCcw className={`w-3 h-3 text-cyan-400 ${isLoading ? "animate-spin" : ""}`} />
                      <span>{isLoading ? "Regenerating..." : "Regenerate"}</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Main Refined Output Box */}
                <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 shadow-inner space-y-3">
                  <p className="text-base font-semibold text-white tracking-wide leading-relaxed selection:bg-cyan-500 selection:text-black font-mono">
                    "{result.refinedDescription}"
                  </p>

                  {/* Word-by-word visual chips */}
                  <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-1">
                    {result.refinedDescription
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((word, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-300 border border-slate-800"
                        >
                          <span className="text-slate-600 mr-1">{idx + 1}</span>
                          {word}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Constraint & Character Metrics Bar */}
                <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Constraint</span>
                    <span className="text-xs font-bold text-cyan-300">{activePreset.shortName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Word Budget</span>
                    <span className={`text-xs font-bold ${result.wordCount <= effectiveWordLimit ? "text-emerald-400" : "text-red-400"}`}>
                      {result.wordCount} / {effectiveWordLimit}w
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Characters</span>
                    <span className="text-xs font-bold text-purple-300">
                      {currentChars} chars
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Reduction</span>
                    <span className="text-xs font-bold text-cyan-400">
                      -{Math.max(0, Math.round(((result.originalWordCount - result.wordCount) / (result.originalWordCount || 1)) * 100))}%
                    </span>
                  </div>
                </div>

                {/* Extracted Core Value Propositions */}
                <div className="space-y-2">
                  <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    PRESERVED VALUE PROPOSITIONS
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keyPropositions.map((prop, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-cyan-950/60 text-cyan-200 border border-cyan-800/60 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3 text-cyan-400" />
                        {prop}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Rationale */}
                {result.rationale && (
                  <p className="text-[11px] font-mono text-slate-300 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-cyan-400 font-bold">Constraint Compliance: </span>
                    {result.rationale}
                  </p>
                )}

                {/* Action buttons with Regenerate, Copy, Save to Deck, and Apply */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Dedicated Regenerate Button */}
                  <Button
                    id="btn-regenerate-action-bar"
                    variant="outline"
                    onClick={() => handleRefine()}
                    disabled={isLoading}
                    className="h-9 px-3.5 bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-200 hover:text-white border-cyan-600/80 hover:border-cyan-400 text-xs font-mono font-bold gap-1.5 shadow-md shadow-cyan-950/40 transition-all"
                    title="Regenerate with same input criteria (prompt, word limit, tone, and constraint)"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? "animate-spin" : ""}`} />
                    <span>{isLoading ? "Regenerating..." : "Regenerate"}</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => handleCopy(result.refinedDescription)}
                    className="flex-1 min-w-[90px] h-9 bg-slate-950 border-slate-700 hover:bg-slate-800 text-xs font-mono font-bold text-white gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        Copy
                      </>
                    )}
                  </Button>

                  {/* Save to Deck Button with constraint tag */}
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleSavePitch(
                        result.refinedDescription,
                        activePreset.label,
                        result.keyPropositions,
                        result.source === "qwen" ? "Qwen 3.5 2B" : "NLP Heuristic",
                        undefined,
                        constraintMode,
                        effectiveWordLimit
                      )
                    }
                    className={`h-9 px-3 text-xs font-mono font-bold border transition-all gap-1.5 ${
                      isPitchSaved(result.refinedDescription)
                        ? "bg-amber-950/80 border-amber-500 text-amber-300"
                        : "bg-slate-950 border-amber-600/60 hover:bg-amber-950/40 text-amber-300"
                    }`}
                    title="Save to state list for easy comparison and later selection"
                  >
                    {isPitchSaved(result.refinedDescription) ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5 text-amber-400" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                        Save to Deck
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => handleApply(result.refinedDescription)}
                    className="flex-1 min-w-[130px] h-9 bg-emerald-600 hover:bg-emerald-500 text-xs font-mono font-bold text-white gap-1.5 shadow-md shadow-emerald-900/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Use as Active Pitch
                  </Button>
                </div>

                {/* Unsatisfied Feedback / Quick Re-roll Banner */}
                <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Unsatisfied with this phrasing or word choice?</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRefine()}
                    disabled={isLoading}
                    className="text-cyan-300 hover:text-cyan-100 font-bold flex items-center gap-1 underline underline-offset-2 hover:no-underline transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RotateCcw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                    <span>Re-roll new generation</span>
                  </button>
                </div>

                {/* Variations under current constraint */}
                {result.variations && result.variations.length > 0 && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      ALTERNATIVE VARIATIONS (&le; {effectiveWordLimit} WORDS)
                    </span>
                    <div className="space-y-2">
                      {result.variations.map((v, i) => {
                        const isVarSaved = isPitchSaved(v.text);
                        return (
                          <div
                            key={i}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-purple-500/40 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                          >
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                  {v.style}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  {v.wordCount} words / {v.charCount || v.text.length} chars
                                </span>
                              </div>
                              <p className="text-xs text-slate-200 font-mono">
                                "{v.text}"
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 self-end sm:self-start">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSavePitch(v.text, v.style, [], "AI Variation", undefined, constraintMode, effectiveWordLimit)}
                                className={`h-7 text-xs font-mono px-2 gap-1 ${
                                  isVarSaved
                                    ? "border-amber-600 bg-amber-950 text-amber-300"
                                    : "border-slate-700 bg-slate-900 text-slate-300 hover:text-amber-300"
                                }`}
                                title="Save variation to comparison deck"
                              >
                                {isVarSaved ? (
                                  <BookmarkCheck className="w-3 h-3 text-amber-400" />
                                ) : (
                                  <Bookmark className="w-3 h-3" />
                                )}
                                <span>Save</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setResult({
                                    ...result,
                                    refinedDescription: v.text,
                                    wordCount: v.wordCount,
                                    charCount: v.charCount || v.text.length,
                                  });
                                  handleCopy(v.text);
                                }}
                                className="h-7 text-xs font-mono text-purple-300 hover:text-white hover:bg-purple-950 px-2"
                              >
                                <Copy className="w-3 h-3 mr-1" />
                                Use
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-900/50 border-dashed border-slate-800 text-center py-12">
              <CardContent className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-mono font-bold text-slate-300">Ready to Refine</h3>
                <p className="text-xs font-mono text-slate-400 max-w-sm mx-auto">
                  Click "Generate" to distill your rough input under the <strong>{activePreset.label}</strong> constraint (&le; {effectiveWordLimit} words).
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Comparative Constraint Matrix Drawer / Panel */}
      {isCompareDrawerOpen && (
        <Card className="bg-slate-900/95 border-2 border-purple-500/40 shadow-2xl overflow-hidden mt-6 animate-in fade-in slide-in-from-top-4">
          <CardHeader className="p-4 bg-slate-950 border-b border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-mono font-bold text-white flex items-center gap-2">
                    <span>Multi-Constraint Comparative Matrix</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 border border-purple-700 text-purple-300">
                      All Formats Side-by-Side
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 font-mono">
                    See how your current rough pitch adapts simultaneously across Twitter Brevity, App Store Short, Hero Taglines, and Pitch Decks.
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateAllComparisons}
                  disabled={isGeneratingComparison || !roughText.trim()}
                  className="h-7 text-xs font-mono bg-slate-900 border-purple-700 text-purple-200 hover:text-white"
                >
                  {isGeneratingComparison ? (
                    <>
                      <RotateCcw className="w-3 h-3 animate-spin mr-1" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1 text-purple-400" />
                      Refresh All Constraints
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsCompareDrawerOpen(false)}
                  className="h-7 text-xs font-mono text-slate-400 hover:text-white"
                >
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {CONSTRAINT_PRESETS.filter(p => p.id !== "custom").map((preset) => {
                const comparisonData = comparativeOutputs[preset.id];
                const Icon = preset.icon;
                return (
                  <div
                    key={preset.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-xs font-mono font-bold text-white">
                            {preset.label}
                          </span>
                        </div>
                        <Badge className="bg-slate-900 text-slate-300 border-slate-700 text-[9px] font-mono">
                          {preset.badge}
                        </Badge>
                      </div>

                      {comparisonData ? (
                        <p className="text-xs font-mono text-slate-200 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                          "{comparisonData.text}"
                        </p>
                      ) : (
                        <div className="py-6 text-center text-xs font-mono text-slate-500">
                          {isGeneratingComparison ? (
                            <span className="flex items-center justify-center gap-1.5 text-purple-300 animate-pulse">
                              <RotateCcw className="w-3 h-3 animate-spin" /> Synthesizing...
                            </span>
                          ) : (
                            <span>Click 'Refresh All Constraints' to generate</span>
                          )}
                        </div>
                      )}

                      {comparisonData && (
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span className="text-emerald-400 font-bold">{comparisonData.wordCount} words</span>
                          <span className="text-purple-300">{comparisonData.charCount} characters</span>
                        </div>
                      )}
                    </div>

                    {comparisonData && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-900 gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(comparisonData.text)}
                          className="h-7 px-2 text-xs font-mono text-slate-400 hover:text-white bg-slate-900 border-slate-800"
                        >
                          <Copy className="w-3 h-3 mr-1" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApply(comparisonData.text)}
                          className="h-7 px-2.5 text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <Check className="w-3 h-3 mr-1" /> Select
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSavePitch(comparisonData.text, preset.label, [], "Comparison Matrix", undefined, preset.id, preset.maxWords)}
                          className="h-7 px-2 text-xs font-mono text-amber-400 hover:text-amber-300"
                        >
                          <Bookmark className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Descriptions & Names Comparison Deck */}
      {savedPitches.length > 0 && (
        <Card className="bg-slate-900/95 border-2 border-amber-500/40 shadow-2xl overflow-hidden mt-6">
          <CardHeader className="p-4 bg-slate-950 border-b border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <BookmarkCheck className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-mono font-bold text-white flex items-center gap-2">
                    <span>Saved Descriptions & Constraints Deck</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 border border-amber-700 text-amber-300">
                      {savedPitches.length} SAVED
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 font-mono">
                    Compare candidate pitches side-by-side across Twitter brevity, App Store, and Tagline constraints.
                  </CardDescription>
                </div>
              </div>

              {/* Filter pills & Clear */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px] font-mono">
                  <span className="text-slate-500 px-1.5">Filter:</span>
                  <button
                    onClick={() => setDeckFilter("all")}
                    className={`px-2 py-0.5 rounded ${deckFilter === "all" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
                  >
                    All ({savedPitches.length})
                  </button>
                  <button
                    onClick={() => setDeckFilter("twitter_brevity")}
                    className={`px-2 py-0.5 rounded ${deckFilter === "twitter_brevity" ? "bg-cyan-600 text-white font-bold" : "text-slate-400 hover:text-white"}`}
                  >
                    Twitter ({savedPitches.filter(p => p.constraintMode === "twitter_brevity").length})
                  </button>
                  <button
                    onClick={() => setDeckFilter("app_store_short")}
                    className={`px-2 py-0.5 rounded ${deckFilter === "app_store_short" ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:text-white"}`}
                  >
                    App Store ({savedPitches.filter(p => p.constraintMode === "app_store_short").length})
                  </button>
                  <button
                    onClick={() => setDeckFilter("tagline")}
                    className={`px-2 py-0.5 rounded ${deckFilter === "tagline" ? "bg-amber-600 text-white font-bold" : "text-slate-400 hover:text-white"}`}
                  >
                    Taglines ({savedPitches.filter(p => p.constraintMode === "tagline").length})
                  </button>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearAllSaved}
                  className="h-7 text-xs font-mono text-slate-400 hover:text-red-400 border-slate-800 bg-slate-950"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear Deck
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSavedPitches.map((item) => {
                const isActive = item.isApplied || (activeAppliedDesc && activeAppliedDesc.trim() === item.description.trim());
                const itemPreset = CONSTRAINT_PRESETS.find(p => p.id === item.constraintMode);
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl bg-slate-950 border transition-all flex flex-col justify-between gap-3 relative ${
                      isActive
                        ? "border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-950"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded bg-emerald-600 text-slate-950 text-[9px] font-mono font-black uppercase tracking-wider shadow-md">
                        ACTIVE APP CONTEXT
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-slate-200 truncate">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                            {item.wordCount}w
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-purple-300 bg-purple-950/60 border border-purple-800/60">
                            {item.charCount}c
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                        <span>Format:</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-300">
                          {itemPreset ? itemPreset.shortName : item.style}
                        </Badge>
                      </div>

                      <p className="text-xs font-mono text-slate-200 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                        "{item.description}"
                      </p>

                      {item.keyPropositions && item.keyPropositions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.keyPropositions.slice(0, 3).map((kp, kIdx) => (
                            <span
                              key={kIdx}
                              className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-900 text-slate-400 border border-slate-800"
                            >
                              • {kp}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs font-mono">
                      <span className="text-[10px] text-slate-500">
                        {item.savedAt}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(item.description)}
                          className="h-7 px-2 text-xs font-mono text-slate-400 hover:text-white"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleApply(item.description)}
                          className={`h-7 px-2.5 text-xs font-mono font-bold ${
                            isActive
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-800 hover:bg-emerald-700 text-slate-200 hover:text-white"
                          }`}
                        >
                          {isActive ? (
                            <>
                              <CheckCheck className="w-3 h-3 mr-1" />
                              Selected
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Select
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSavedPitch(item.id)}
                          className="h-7 px-1.5 text-slate-500 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}

export default DescriptionRefiner;
