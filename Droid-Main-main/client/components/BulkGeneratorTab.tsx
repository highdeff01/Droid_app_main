import React, { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Wand2,
  Download,
  Share2,
  Smartphone,
  Zap,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileCode2,
  BookmarkPlus,
  Trash2,
  Search,
  Edit3,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { WordConstraintMode, CONSTRAINT_PRESETS } from "@/lib/description-constraint-presets";
import { bulkSaveAppBriefs, saveAppBrief } from "@/lib/app-brief-history-store";

export interface BulkItemResult {
  id: string;
  keyword: string;
  name: string;
  description: string;
  wordCount: number;
  charCount: number;
  keyPropositions: string[];
  constraintMode: string;
  targetWords: number;
  category?: string;
}

interface BulkGeneratorTabProps {
  onApplyPitch?: (title: string, description: string) => void;
  onSaveToDeck?: (item: {
    title: string;
    description: string;
    wordCount: number;
    charCount: number;
    constraintMode: string;
    targetLimit: number;
    style: string;
    keyPropositions: string[];
    source: string;
  }) => void;
}

const PRESET_KEYWORD_SETS = [
  {
    name: "AI & Autonomous Vision",
    keywords: [
      "AI Game Vision Bot",
      "Autonomous Screen Perception",
      "PyAutoGUI Hardware Automator",
      "Neural Clickpoint Engine",
      "Real-time Drift Recalibrator",
    ],
  },
  {
    name: "Cloud & DevOps Observability",
    keywords: [
      "Cloud Cluster Monitor",
      "Kubernetes Auto-Scaler",
      "Distributed Trace Explorer",
      "Serverless Incident Triager",
      "Log Stream Anomaly Detector",
    ],
  },
  {
    name: "FinTech & Crypto Portfolio",
    keywords: [
      "AI Personal Budget Tracker",
      "DeFi Liquidity Optimizer",
      "Real-Time Crypto Arbitrage Bot",
      "Expense Receipt Scanner",
      "Subscription Burn Rate Monitor",
    ],
  },
  {
    name: "Productivity & Collaboration",
    keywords: [
      "Infinite Architecture Canvas",
      "Meeting Transcript Action Extractor",
      "Markdown Knowledge Graph",
      "Developer Code Snippet Vault",
      "Focus Pomodoro Companion",
    ],
  },
];

export const BulkGeneratorTab: React.FC<BulkGeneratorTabProps> = ({
  onApplyPitch,
  onSaveToDeck,
}) => {
  const [keywordsText, setKeywordsText] = useState<string>(
    "AI Game Vision Bot\nCloud Cluster Monitor\nAutonomous Mouse Replayer\nCrypto Arbitrage Scanner\nInfinite Architecture Canvas"
  );
  const [constraintMode, setConstraintMode] = useState<WordConstraintMode>("twitter_brevity");
  const [customWordLimit, setCustomWordLimit] = useState<number>(18);
  const [tone, setTone] = useState<"high-impact" | "technical" | "minimalist" | "marketing">("high-impact");
  const [namingStyle, setNamingStyle] = useState<string>("modern-saas");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<BulkItemResult[]>(() => {
    try {
      const cached = localStorage.getItem("bulk_generated_pitches_v1");
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const activePreset = CONSTRAINT_PRESETS.find((p) => p.id === constraintMode) || CONSTRAINT_PRESETS[0];
  const effectiveWordLimit = constraintMode === "custom" ? customWordLimit : activePreset.maxWords;

  const handleBulkGenerate = async () => {
    const rawList = keywordsText
      .split(/[\n,;]+/)
      .map((k) => k.trim().replace(/^[-*•0-9.)\s]+/, "").trim())
      .filter(Boolean);

    if (rawList.length === 0) {
      toast.error("Please enter at least one keyword or phrase.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/ai/bulk-generate-names-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: rawList,
          targetWords: effectiveWordLimit,
          constraintMode,
          tone,
          namingStyle,
        }),
      });

      const data = await response.json();
      if (data.success && Array.isArray(data.items)) {
        setResults(data.items);
        try {
          localStorage.setItem("bulk_generated_pitches_v1", JSON.stringify(data.items));
        } catch {}

        // Persist to App Briefs History Vault
        try {
          bulkSaveAppBriefs(
            data.items.map((it: BulkItemResult) => ({
              id: it.id,
              title: it.name,
              description: it.description,
              wordCount: it.wordCount,
              charCount: it.charCount,
              constraintMode: it.constraintMode || constraintMode,
              targetLimit: it.targetWords || effectiveWordLimit,
              tone,
              source: "Bulk Generator",
              keyPropositions: it.keyPropositions || [],
              category: it.category || "Bulk Generation",
              originalInput: it.keyword,
            }))
          );
        } catch {}

        toast.success(`Generated ${data.items.length} name & description pairs!`, {
          description: `All descriptions strictly under ≤ ${effectiveWordLimit} words and saved to history.`,
        });
      } else {
        toast.error("Failed to generate bulk items", {
          description: data.error || "Unknown server response",
        });
      }
    } catch (err: any) {
      toast.error("Network error during bulk generation", {
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPair = (item: BulkItemResult) => {
    const text = `${item.name}\n${item.description}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    toast.success(`Copied "${item.name}" pair to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleApplySingle = (item: BulkItemResult) => {
    onApplyPitch?.(item.name, item.description);
    setAppliedId(item.id);
    toast.success(`Applied "${item.name}" as active project pitch!`);
    setTimeout(() => setAppliedId(null), 2500);
  };

  const handleSaveItemToDeck = (item: BulkItemResult) => {
    onSaveToDeck?.({
      title: item.name,
      description: item.description,
      wordCount: item.wordCount,
      charCount: item.charCount,
      constraintMode: item.constraintMode || constraintMode,
      targetLimit: item.targetWords || effectiveWordLimit,
      style: tone,
      keyPropositions: item.keyPropositions || ["Core Value", "Fast Delivery"],
      source: "Bulk AI Generator",
    });
    try {
      saveAppBrief({
        title: item.name,
        description: item.description,
        wordCount: item.wordCount,
        charCount: item.charCount,
        constraintMode: item.constraintMode || constraintMode,
        targetLimit: item.targetWords || effectiveWordLimit,
        tone,
        source: "Bulk Generator",
        keyPropositions: item.keyPropositions || [],
        category: item.category || "Bulk Generation",
        originalInput: item.keyword,
      });
    } catch {}
    toast.success(`Saved "${item.name}" to your Pitch Deck & History Vault!`);
  };

  const handleSaveAllToDeck = () => {
    if (results.length === 0) return;
    results.forEach((item) => {
      onSaveToDeck?.({
        title: item.name,
        description: item.description,
        wordCount: item.wordCount,
        charCount: item.charCount,
        constraintMode: item.constraintMode || constraintMode,
        targetLimit: item.targetWords || effectiveWordLimit,
        style: tone,
        keyPropositions: item.keyPropositions || [],
        source: "Bulk AI Generator",
      });
      try {
        saveAppBrief({
          title: item.name,
          description: item.description,
          wordCount: item.wordCount,
          charCount: item.charCount,
          constraintMode: item.constraintMode || constraintMode,
          targetLimit: item.targetWords || effectiveWordLimit,
          tone,
          source: "Bulk Generator",
          keyPropositions: item.keyPropositions || [],
          category: item.category || "Bulk Generation",
          originalInput: item.keyword,
        });
      } catch {}
    });
    toast.success(`Saved all ${results.length} pairs to your Pitch Deck & History Vault!`);
  };

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(results, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-names-descriptions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported results as JSON file!");
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;
    const headers = ["Name", "Description", "Keyword", "WordCount", "CharCount", "Category", "KeyPropositions"];
    const rows = results.map((r) => [
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.description.replace(/"/g, '""')}"`,
      `"${r.keyword.replace(/"/g, '""')}"`,
      r.wordCount,
      r.charCount,
      `"${r.category || ""}"`,
      `"${(r.keyPropositions || []).join("; ").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-names-descriptions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported results as CSV file!");
  };

  const handleCopyAllMarkdown = () => {
    if (results.length === 0) return;
    const md = results
      .map(
        (r, idx) =>
          `### ${idx + 1}. ${r.name}\n**Keyword:** ${r.keyword}\n**Pitch (${r.wordCount} words):** ${r.description}\n`
      )
      .join("\n");
    navigator.clipboard.writeText(md);
    toast.success("Copied all items as formatted Markdown!");
  };

  const handleStartEdit = (item: BulkItemResult) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDesc(item.description);
  };

  const handleSaveEdit = (id: string) => {
    const words = editDesc.trim().split(/\s+/).filter(Boolean).length;
    setResults((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              name: editName,
              description: editDesc,
              wordCount: words,
              charCount: editDesc.length,
            }
          : it
      )
    );
    setEditingId(null);
    toast.success("Updated item details!");
  };

  const handleRegenerateSingleItem = async (item: BulkItemResult) => {
    setRegeneratingId(item.id);
    try {
      const promptText = `Brand product or feature: ${item.keyword}. Refine a high-impact name and strict description.`;
      const res = await fetch("/api/ai/refine-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roughDescription: promptText,
          constraintMode,
          customWordLimit: effectiveWordLimit,
          tone,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const refined = data.refinedDescription || item.description;
        const words = refined.trim().split(/\s+/).filter(Boolean).length;
        setResults((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  description: refined,
                  wordCount: words,
                  charCount: refined.length,
                  keyPropositions: data.keyPropositions && data.keyPropositions.length > 0 ? data.keyPropositions : it.keyPropositions,
                }
              : it
          )
        );
        toast.success(`Regenerated pitch for "${item.name}"!`);
      } else {
        toast.error("Failed to regenerate pitch for item");
      }
    } catch (err: any) {
      toast.error(`Regeneration error: ${err.message}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  const categories = Array.from(new Set(results.map((r) => r.category).filter(Boolean))) as string[];

  const filteredResults = results.filter((item) => {
    const matchesSearch =
      !searchFilter ||
      item.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.keyword.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Input Configuration Card */}
      <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Bulk Keyword to Name & Description Generator
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 font-mono mt-0.5">
                Provide a list of keywords or app concepts to generate distinct, brandable names and word-constrained descriptions in one batch.
              </CardDescription>
            </div>

            {/* Constraint Preset Selector */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              {CONSTRAINT_PRESETS.map((p) => {
                const isSelected = constraintMode === p.id;
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setConstraintMode(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? `${p.bgActive} ${p.borderActive} ${p.textActive} border shadow-sm`
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{p.shortName}</span>
                    <span className="text-[10px] opacity-70">(&le;{p.maxWords}w)</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {/* Preset Sample Kits */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Load Starter Keyword Packs:
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_KEYWORD_SETS.map((pack) => (
                <button
                  key={pack.name}
                  onClick={() => setKeywordsText(pack.keywords.join("\n"))}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-700/60 transition-colors"
                >
                  + {pack.name} ({pack.keywords.length})
                </button>
              ))}
            </div>
          </div>

          {/* Keywords Text Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span>Keywords or App Topics (One per line or comma-separated):</span>
              <span className="text-slate-500">
                {keywordsText.split(/[\n,;]+/).filter((k) => k.trim()).length} keywords entered
              </span>
            </div>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={`e.g.\nAI Game Vision Bot\nAutonomous Mouse Orchestrator\nCloud Observability Hub\nCrypto Portfolio Tracker\nCollaborative Whiteboard`}
              rows={5}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-y"
            />
          </div>

          {/* Style & Tone Options Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Tone */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-400">Tone & Voice:</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-cyan-500"
              >
                <option value="high-impact">High-Impact & Punchy</option>
                <option value="technical">Technical & Architectural</option>
                <option value="minimalist">Minimalist & Direct</option>
                <option value="marketing">App Store Promo</option>
              </select>
            </div>

            {/* Naming Style */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-400">Naming Persona:</label>
              <select
                value={namingStyle}
                onChange={(e) => setNamingStyle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-cyan-500"
              >
                <option value="modern-saas">Modern SaaS (e.g. DroidVision, OmniFlow)</option>
                <option value="high-tech">High-Tech & Neural (e.g. QuantumSight, CortexAI)</option>
                <option value="minimalist">Minimalist (e.g. Sightline, Apex, Beacon)</option>
                <option value="cyber">Cyber / Gaming (e.g. Overdrive, BotForge)</option>
              </select>
            </div>

            {/* Custom Word Limit (if custom) */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-400">
                Word Constraint Limit: <span className="text-cyan-400 font-bold">&le; {effectiveWordLimit} words</span>
              </label>
              {constraintMode === "custom" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={4}
                    max={60}
                    value={customWordLimit}
                    onChange={(e) => setCustomWordLimit(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400"
                  />
                  <span className="text-xs font-mono text-cyan-300 w-8">{customWordLimit}w</span>
                </div>
              ) : (
                <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80 text-xs font-mono text-slate-400 flex items-center justify-between">
                  <span>{activePreset.label}</span>
                  <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 text-[10px]">
                    Max {activePreset.maxWords}w
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] font-mono text-slate-500">
              Generates paired brand names, strict &le;{effectiveWordLimit}-word summaries, and key propositions.
            </div>
            <Button
              onClick={handleBulkGenerate}
              disabled={isLoading}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs h-9 px-5 gap-2 shadow-lg shadow-cyan-900/30"
            >
              {isLoading ? (
                <>
                  <Wand2 className="w-3.5 h-3.5 animate-spin" />
                  Generating Batch ({effectiveWordLimit}w limit)...
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  Generate Bulk Name & Pitch Pairs
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Results Card & Scrollable List */}
      {results.length > 0 && (
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="p-5 border-b border-slate-800/80 bg-slate-950/60">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Generated Pairs
                </CardTitle>
                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 font-mono text-xs">
                  {results.length} Generated
                </Badge>
                <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 font-mono text-xs">
                  &le; {effectiveWordLimit} Words Strict
                </Badge>
              </div>

              {/* Batch Export & Deck Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  id="btn-bulk-regenerate-batch"
                  variant="outline"
                  size="sm"
                  onClick={handleBulkGenerate}
                  disabled={isLoading}
                  className="h-7 text-xs font-mono bg-cyan-950 border-cyan-700 text-cyan-300 hover:bg-cyan-900 hover:text-white gap-1 font-bold shadow-sm"
                  title="Regenerate all pairs with current keyword list and constraints"
                >
                  <RotateCcw className={`w-3 h-3 text-cyan-400 ${isLoading ? "animate-spin" : ""}`} />
                  {isLoading ? "Regenerating..." : "Regenerate Batch"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAllMarkdown}
                  className="h-7 text-xs font-mono bg-slate-950 border-slate-800 text-slate-300 hover:text-white gap-1"
                >
                  <Copy className="w-3 h-3 text-cyan-400" />
                  Copy All (MD)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  className="h-7 text-xs font-mono bg-slate-950 border-slate-800 text-slate-300 hover:text-white gap-1"
                >
                  <FileCode2 className="w-3 h-3 text-amber-400" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="h-7 text-xs font-mono bg-slate-950 border-slate-800 text-slate-300 hover:text-white gap-1"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAllToDeck}
                  className="h-7 text-xs font-mono bg-slate-950 border-purple-800/70 text-purple-300 hover:text-white hover:bg-purple-950/60 gap-1"
                >
                  <BookmarkPlus className="w-3 h-3 text-purple-400" />
                  Save All to Deck
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResults([]);
                    localStorage.removeItem("bulk_generated_pitches_v1");
                  }}
                  className="h-7 px-2 text-xs font-mono text-slate-500 hover:text-red-400"
                  title="Clear Results"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-1 border-t border-slate-800/60">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <Input
                  type="text"
                  placeholder="Filter by name, pitch, or keyword..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-8 pl-8 text-xs font-mono bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-cyan-500"
                />
              </div>

              {/* Category Chips */}
              {categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      selectedCategory === "all"
                        ? "bg-cyan-950 text-cyan-300 border border-cyan-700"
                        : "text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800"
                    }`}
                  >
                    All ({results.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                        selectedCategory === cat
                          ? "bg-cyan-950 text-cyan-300 border border-cyan-700"
                          : "text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Scrollable List of Generated Pairs */}
            <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-800/80 p-4 space-y-3">
              {filteredResults.length === 0 ? (
                <div className="text-center py-10 text-xs font-mono text-slate-500">
                  No items match the active search filter "{searchFilter}".
                </div>
              ) : (
                filteredResults.map((item, index) => {
                  const isEditing = editingId === item.id;
                  const isUnderLimit = item.wordCount <= effectiveWordLimit;

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition-all space-y-3"
                    >
                      {/* Item Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono text-slate-500 font-bold w-5">
                            #{index + 1}
                          </span>
                          {isEditing ? (
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-7 text-xs font-mono font-bold bg-slate-900 border-cyan-500 text-white w-56"
                            />
                          ) : (
                            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                              {item.name}
                              {item.category && (
                                <Badge className="bg-slate-900 text-slate-400 border-slate-800 text-[10px] font-mono">
                                  {item.category}
                                </Badge>
                              )}
                            </h3>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-400">
                            Keyword: <span className="text-cyan-400 font-medium">"{item.keyword}"</span>
                          </span>
                          <Badge
                            className={`text-[10px] font-mono ${
                              isUnderLimit
                                ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                                : "bg-amber-950 text-amber-300 border-amber-700"
                            }`}
                          >
                            {item.wordCount} words / {item.charCount} chars
                          </Badge>
                        </div>
                      </div>

                      {/* Description Text */}
                      {isEditing ? (
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          className="w-full bg-slate-900 border border-cyan-500 rounded-lg p-2 text-xs font-mono text-slate-100 focus:outline-none"
                        />
                      ) : (
                        <p className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                          {item.description}
                        </p>
                      )}

                      {/* Key Propositions & Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        {/* Key Propositions */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.keyPropositions?.map((prop, pIdx) => (
                            <span
                              key={pIdx}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300"
                            >
                              ✓ {prop}
                            </span>
                          ))}
                        </div>

                        {/* Interactive Buttons */}
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          {isEditing ? (
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(item.id)}
                              className="h-7 text-xs font-mono bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                            >
                              <Check className="w-3 h-3" />
                              Save
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(item)}
                              className="h-7 px-2 text-xs font-mono text-slate-400 hover:text-white"
                              title="Edit item"
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRegenerateSingleItem(item)}
                            disabled={regeneratingId === item.id || isLoading}
                            className="h-7 text-xs font-mono bg-slate-900 border-cyan-800/60 text-cyan-300 hover:text-white hover:bg-cyan-950/60 gap-1"
                            title="Regenerate this single pitch with current AI parameters"
                          >
                            <RotateCcw className={`w-3 h-3 text-cyan-400 ${regeneratingId === item.id ? "animate-spin" : ""}`} />
                            <span className="hidden sm:inline">{regeneratingId === item.id ? "Re-rolling..." : "Re-roll"}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyPair(item)}
                            className="h-7 text-xs font-mono bg-slate-900 border-slate-800 text-slate-200 hover:text-white gap-1"
                          >
                            {copiedId === item.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-cyan-400" />
                                Copy
                              </>
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveItemToDeck(item)}
                            className="h-7 text-xs font-mono bg-slate-900 border-purple-900/60 text-purple-300 hover:text-white hover:bg-purple-950/50 gap-1"
                          >
                            <BookmarkPlus className="w-3 h-3 text-purple-400" />
                            Deck
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => handleApplySingle(item)}
                            className={`h-7 text-xs font-mono font-bold gap-1 ${
                              appliedId === item.id
                                ? "bg-emerald-600 text-white"
                                : "bg-cyan-600 hover:bg-cyan-500 text-white"
                            }`}
                          >
                            {appliedId === item.id ? (
                              <>
                                <Check className="w-3 h-3" />
                                Applied
                              </>
                            ) : (
                              <>
                                <ArrowRight className="w-3 h-3" />
                                Apply Pitch
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
