import React, { useState } from "react";
import {
  History,
  Sparkles,
  Search,
  Star,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  ArrowRight,
  Sliders,
  Share2,
  Smartphone,
  Zap,
  Tag,
  Clock,
  Layers,
  CheckCircle2,
  FileSpreadsheet,
  FileCode2,
  FileText,
  Filter,
  ArrowUpDown,
  BookOpen,
  Edit3,
  Scale,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAppBriefHistory } from "@/hooks/useAppBriefHistory";
import { AppBriefRecord } from "@/lib/app-brief-history-store";
import { WordConstraintMode, CONSTRAINT_PRESETS } from "@/lib/description-constraint-presets";

export interface AppBriefsHistoryViewProps {
  onRevisitBrief?: (brief: AppBriefRecord) => void;
  onApplyPitch?: (title: string, description: string) => void;
  className?: string;
}

export const AppBriefsHistoryView: React.FC<AppBriefsHistoryViewProps> = ({
  onRevisitBrief,
  onApplyPitch,
  className = "",
}) => {
  const {
    briefs,
    filteredBriefs,
    stats,
    searchQuery,
    setSearchQuery,
    constraintFilter,
    setConstraintFilter,
    toneFilter,
    setToneFilter,
    categoryFilter,
    setCategoryFilter,
    favoritesOnly,
    setFavoritesOnly,
    sortBy,
    setSortBy,
    addOrUpdateBrief,
    removeBrief,
    clearAll,
    toggleFav,
    markApplied,
    exportJSON,
    exportCSV,
    exportMD,
    importJSON,
  } = useAppBriefHistory();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  // Quick edit modal state
  const [editingBrief, setEditingBrief] = useState<AppBriefRecord | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");

  // Compare mode state
  const [compareBriefA, setCompareBriefA] = useState<AppBriefRecord | null>(null);
  const [compareBriefB, setCompareBriefB] = useState<AppBriefRecord | null>(null);
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false);

  // Import modal
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>("");

  const handleCopy = (brief: AppBriefRecord) => {
    navigator.clipboard.writeText(brief.description);
    setCopiedId(brief.id);
    toast.success(`Copied "${brief.title}" to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleApply = (brief: AppBriefRecord) => {
    markApplied(brief.id);
    onApplyPitch?.(brief.title, brief.description);
    setAppliedId(brief.id);
    toast.success(`Applied "${brief.title}" as active project pitch!`);
    setTimeout(() => setAppliedId(null), 2500);
  };

  const handleRevisit = (brief: AppBriefRecord) => {
    if (onRevisitBrief) {
      onRevisitBrief(brief);
      toast.success(`Revisited "${brief.title}" in Interactive Pitch Studio!`, {
        description: `Loaded ${brief.wordCount} words (${brief.constraintMode}) with ${brief.tone} tone.`,
      });
    } else {
      toast.info(`Selected "${brief.title}"`);
    }
  };

  const openEditModal = (brief: AppBriefRecord) => {
    setEditingBrief(brief);
    setEditTitle(brief.title);
    setEditDesc(brief.description);
  };

  const handleSaveEdit = () => {
    if (!editingBrief) return;
    const words = editDesc.trim().split(/\s+/).filter(Boolean).length;
    addOrUpdateBrief({
      ...editingBrief,
      title: editTitle.trim() || editingBrief.title,
      description: editDesc.trim(),
      wordCount: words,
      charCount: editDesc.trim().length,
    });
    setEditingBrief(null);
    toast.success("Updated app brief and saved revision history!");
  };

  const handleStartCompare = (brief: AppBriefRecord) => {
    if (!compareBriefA) {
      setCompareBriefA(brief);
      toast.info(`Selected "${brief.title}" as Item A. Now pick Item B to compare.`);
    } else if (compareBriefA.id === brief.id) {
      setCompareBriefA(null);
      toast.info("Unselected Item A.");
    } else {
      setCompareBriefB(brief);
      setIsCompareOpen(true);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Statistics HUD */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-700/60 flex items-center justify-center text-cyan-400 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Total Briefs</span>
            <span className="text-xl font-bold font-mono text-white">{stats.totalCount}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-amber-400 shrink-0">
            <Star className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Starred Favorites</span>
            <span className="text-xl font-bold font-mono text-amber-300">{stats.favoriteCount}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-400 shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Avg Word Count</span>
            <span className="text-xl font-bold font-mono text-purple-300">{stats.avgWords} words</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Most Used Preset</span>
            <span className="text-xs font-bold font-mono text-emerald-300 truncate max-w-[120px] block">
              {stats.mostUsedMode.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Action Toolbar: Search, Filters, Export & Reset */}
      <Card className="bg-slate-950/90 border-slate-800 shadow-xl">
        <CardContent className="p-4 space-y-3">
          {/* Row 1: Search & Favorite Toggle & Export Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
              <Input
                placeholder="Search titles, descriptions, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-slate-900 border-slate-700 text-xs text-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              {/* Favorites toggle */}
              <Button
                variant={favoritesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setFavoritesOnly(!favoritesOnly)}
                className={`h-8 text-xs font-mono font-bold gap-1.5 ${
                  favoritesOnly
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : "bg-slate-900 border-slate-700 text-slate-300 hover:text-amber-300"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${favoritesOnly ? "fill-white" : "text-amber-400"}`} />
                Favorites Only
              </Button>

              {/* Compare Tray Indicator if Item A is picked */}
              {compareBriefA && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (compareBriefB) setIsCompareOpen(true);
                    else toast.info("Click 'Compare' on a second brief to view comparison.");
                  }}
                  className="h-8 text-xs font-mono font-bold bg-purple-600 hover:bg-purple-500 text-white gap-1.5 animate-pulse"
                >
                  <Scale className="w-3.5 h-3.5" />
                  Compare (1/2 Selected)
                </Button>
              )}

              {/* Export dropdown / buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={exportMD}
                title="Export as clean Markdown"
                className="h-8 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-300 gap-1"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                MD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCSV}
                title="Export as CSV for Sheets"
                className="h-8 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-emerald-300 gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportJSON}
                title="Export as raw JSON"
                className="h-8 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-purple-300 gap-1"
              >
                <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
                JSON
              </Button>

              {/* Import Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportOpen(true)}
                className="h-8 text-xs font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-white gap-1"
              >
                <Upload className="w-3.5 h-3.5 text-slate-400" />
                Import
              </Button>

              {/* Reset / Clear History */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Reset App Briefs history to starter baselines?")) {
                    clearAll(true);
                  }
                }}
                className="h-8 text-xs font-mono text-slate-400 hover:text-red-400 hover:border-red-900 bg-slate-900 border-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Row 2: Filter Pills & Sorting */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            {/* Constraint Mode Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" /> Format:
              </span>
              {[
                { id: "all", label: "All Formats" },
                { id: "twitter_brevity", label: "Twitter / X (≤12w)" },
                { id: "app_store_short", label: "App Store (≤30w)" },
                { id: "tagline", label: "Tagline (≤6w)" },
                { id: "standard_pitch", label: "Standard (≤20w)" },
                { id: "detailed_store", label: "Detailed (≤50w)" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setConstraintFilter(pill.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono whitespace-nowrap transition-all ${
                    constraintFilter === pill.id
                      ? "bg-cyan-600 text-white font-bold shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> Sort:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-7 text-[10px] font-mono bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="shortest">Shortest Words</option>
                <option value="longest">Longest Words</option>
                <option value="favorites">Favorites Top</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Briefs Cards Grid */}
      {filteredBriefs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-950/60 border border-dashed border-slate-800 space-y-3">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">No generated app briefs match current filter</h3>
          <p className="text-xs text-slate-500 font-mono max-w-md mx-auto">
            Try adjusting your search terms or format filters, or generate new pitches in the Interactive Studio or Bulk Generator tabs.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setConstraintFilter("all");
              setFavoritesOnly(false);
            }}
            className="h-8 text-xs font-mono bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            Clear All Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBriefs.map((brief) => {
            const isComparingThis = compareBriefA?.id === brief.id;
            const isTargetAdherent = brief.wordCount <= brief.targetLimit;
            const presetConfig = CONSTRAINT_PRESETS.find((p) => p.id === brief.constraintMode);

            return (
              <Card
                key={brief.id}
                className={`bg-slate-950/90 border transition-all duration-200 shadow-md relative overflow-hidden flex flex-col justify-between ${
                  isComparingThis
                    ? "border-purple-500 ring-2 ring-purple-500/30 shadow-purple-950/50"
                    : brief.isApplied
                    ? "border-emerald-500/70 shadow-emerald-950/30"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Top Strip */}
                <div className="p-4 pb-2 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-white tracking-tight">{brief.title}</h4>
                        {brief.isApplied && (
                          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 text-[9px] py-0 px-1.5 font-mono">
                            ✓ ACTIVE DECK
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span>{brief.source}</span>
                        <span>•</span>
                        <span>{brief.savedAtFormatted || new Date(brief.timestamp).toLocaleDateString()}</span>
                        {brief.category && (
                          <>
                            <span>•</span>
                            <span className="text-cyan-400">{brief.category}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Star Favorite Button */}
                    <button
                      type="button"
                      onClick={() => toggleFav(brief.id)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition-colors"
                      title={brief.isFavorite ? "Remove favorite" : "Star as favorite"}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          brief.isFavorite ? "text-amber-400 fill-amber-400" : "text-slate-500 hover:text-amber-300"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Badges bar */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className="bg-slate-900 text-slate-300 border-slate-700 font-mono text-[10px] py-0">
                      {presetConfig?.shortName || brief.constraintMode}
                    </Badge>
                    <Badge
                      className={`font-mono text-[10px] py-0 ${
                        isTargetAdherent
                          ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                          : "bg-amber-950/80 text-amber-300 border-amber-700/60"
                      }`}
                    >
                      {brief.wordCount} words / {brief.charCount} chars (≤{brief.targetLimit})
                    </Badge>
                    <Badge className="bg-blue-950 text-blue-300 border-blue-700 text-[10px] py-0 font-mono capitalize">
                      {brief.tone}
                    </Badge>
                    {brief.revisions && brief.revisions.length > 0 && (
                      <Badge className="bg-purple-950 text-purple-300 border-purple-700 text-[9px] py-0 font-mono">
                        {brief.revisions.length} revs
                      </Badge>
                    )}
                  </div>

                  {/* Main Pitch Text Quote Box */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 text-xs text-slate-100 font-sans leading-relaxed select-text shadow-inner">
                    "{brief.description}"
                  </div>

                  {/* Key Propositions Chips */}
                  {brief.keyPropositions && brief.keyPropositions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {brief.keyPropositions.map((p, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-900/80 text-cyan-300 border border-cyan-900/50 flex items-center gap-1"
                        >
                          <Tag className="w-2.5 h-2.5 text-cyan-400" />
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Actions Bottom Bar */}
                <div className="p-3 pt-2 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Revisit / Load in Studio */}
                    <Button
                      size="sm"
                      onClick={() => handleRevisit(brief)}
                      className="h-7 px-2.5 text-[10px] font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1 shadow-sm"
                      title="Revisit and edit this prompt & constraint in the Studio"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Revisit Studio
                    </Button>

                    {/* Copy Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(brief)}
                      className="h-7 px-2 text-[10px] font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                      title="Copy pitch description"
                    >
                      {copiedId === brief.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>

                    {/* Quick Edit */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(brief)}
                      className="h-7 px-2 text-[10px] font-mono bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                      title="Edit title or pitch"
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>

                    {/* Compare Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartCompare(brief)}
                      className={`h-7 px-2 text-[10px] font-mono bg-slate-900 border-slate-700 ${
                        isComparingThis ? "text-purple-400 border-purple-500 font-bold" : "text-slate-300 hover:text-purple-300"
                      }`}
                      title="Compare against another brief"
                    >
                      <Scale className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Apply to Active Deck */}
                    <Button
                      variant={brief.isApplied ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleApply(brief)}
                      className={`h-7 px-2.5 text-[10px] font-mono font-bold ${
                        brief.isApplied
                          ? "bg-emerald-700 text-white cursor-default"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:text-emerald-300 hover:border-emerald-600"
                      }`}
                    >
                      {appliedId === brief.id ? "Applied!" : brief.isApplied ? "Applied" : "Apply Pitch"}
                    </Button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => removeBrief(brief.id)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete from history"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Quick Edit Brief & Save Revision */}
      <Dialog open={Boolean(editingBrief)} onOpenChange={(open) => !open && setEditingBrief(null)}>
        <DialogContent className="max-w-lg bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-cyan-400" />
              Edit App Brief & Record Revision
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 font-mono">
              Modify the pitch text or title. Previous versions are saved in this brief's revision history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Brief Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="bg-slate-900 border-slate-700 text-xs text-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono text-slate-400">Pitch Description</label>
                <span className="text-[10px] font-mono text-cyan-400">
                  {editDesc.trim().split(/\s+/).filter(Boolean).length} words • {editDesc.trim().length} chars
                </span>
              </div>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-sans"
              />
            </div>

            {/* Revision History Listing */}
            {editingBrief?.revisions && editingBrief.revisions.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <label className="text-[10px] font-mono text-purple-300 block uppercase">
                  Past Revisions ({editingBrief.revisions.length})
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {editingBrief.revisions.map((rev, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between"
                    >
                      <span className="truncate max-w-[280px]">"{rev.description}"</span>
                      <button
                        type="button"
                        onClick={() => setEditDesc(rev.description)}
                        className="text-cyan-400 hover:text-cyan-300 underline text-[9px] shrink-0"
                      >
                        Restore ({rev.wordCount}w)
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingBrief(null)}
              className="text-xs font-mono bg-slate-900 border-slate-700"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              className="text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Side-by-Side Comparison */}
      <Dialog open={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <DialogContent className="max-w-3xl bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-purple-400" />
              Side-by-Side Brief Comparison
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 font-mono">
              Compare two saved outputs side-by-side to evaluate length, punchiness, and value proposition density.
            </DialogDescription>
          </DialogHeader>

          {compareBriefA && compareBriefB && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3">
              {/* Item A */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-purple-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-purple-950 text-purple-300 border-purple-700 font-mono text-[10px]">
                    Item A: {compareBriefA.constraintMode}
                  </Badge>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {compareBriefA.wordCount} words • {compareBriefA.charCount} chars
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white">{compareBriefA.title}</h4>
                <p className="text-xs text-slate-200 leading-relaxed p-3 rounded-xl bg-slate-950 border border-slate-800">
                  "{compareBriefA.description}"
                </p>
                <div className="flex flex-wrap gap-1">
                  {compareBriefA.keyPropositions?.map((p, i) => (
                    <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-950 text-purple-300 rounded border border-purple-900">
                      {p}
                    </span>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    handleRevisit(compareBriefA);
                    setIsCompareOpen(false);
                  }}
                  className="w-full h-7 text-[10px] font-mono bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Load Item A into Studio
                </Button>
              </div>

              {/* Item B */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-cyan-950 text-cyan-300 border-cyan-700 font-mono text-[10px]">
                    Item B: {compareBriefB.constraintMode}
                  </Badge>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {compareBriefB.wordCount} words • {compareBriefB.charCount} chars
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white">{compareBriefB.title}</h4>
                <p className="text-xs text-slate-200 leading-relaxed p-3 rounded-xl bg-slate-950 border border-slate-800">
                  "{compareBriefB.description}"
                </p>
                <div className="flex flex-wrap gap-1">
                  {compareBriefB.keyPropositions?.map((p, i) => (
                    <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-950 text-cyan-300 rounded border border-cyan-900">
                      {p}
                    </span>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    handleRevisit(compareBriefB);
                    setIsCompareOpen(false);
                  }}
                  className="w-full h-7 text-[10px] font-mono bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  Load Item B into Studio
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCompareBriefA(null);
                setCompareBriefB(null);
                setIsCompareOpen(false);
              }}
              className="text-xs font-mono bg-slate-900 border-slate-700"
            >
              Close & Clear Comparison
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Import Briefs from JSON */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-lg bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              Import App Briefs from JSON
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 font-mono">
              Paste exported JSON array of briefs to restore or merge into your local history vault.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste JSON array here..."
              rows={6}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(false)}
              className="text-xs font-mono bg-slate-900 border-slate-700"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const res = importJSON(importText);
                if (res.success) {
                  setIsImportOpen(false);
                  setImportText("");
                }
              }}
              className="text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Import Vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
