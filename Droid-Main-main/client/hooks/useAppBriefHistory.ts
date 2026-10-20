import { useState, useEffect, useCallback, useMemo } from "react";
import { getAppBriefs, saveAppBrief, AppBriefRecord } from "@/lib/app-brief-history-store";
import { toast } from "sonner";

const STORAGE_KEY = "sightline_app_briefs_history_vault";

export function useAppBriefHistory() {
  const [briefs, setBriefs] = useState<AppBriefRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [constraintFilter, setConstraintFilter] = useState("all");
  const [toneFilter, setToneFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "words_asc" | "words_desc">("newest");

  const refresh = useCallback(() => {
    setBriefs(getAppBriefs());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addOrUpdateBrief = useCallback(
    (brief: Partial<AppBriefRecord>) => {
      const saved = saveAppBrief(brief);
      refresh();
      return saved;
    },
    [refresh]
  );

  const removeBrief = useCallback(
    (id: string) => {
      if (typeof window !== "undefined") {
        const current = getAppBriefs().filter((b) => b.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        refresh();
      }
    },
    [refresh]
  );

  const clearAll = useCallback((_resetToBaseline?: boolean) => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      refresh();
    }
  }, [refresh]);

  const toggleFav = useCallback(
    (id: string) => {
      const target = briefs.find((b) => b.id === id);
      if (target) {
        addOrUpdateBrief({ ...target, isFavorite: !target.isFavorite });
      }
    },
    [briefs, addOrUpdateBrief]
  );

  const markApplied = useCallback(
    (id: string) => {
      const target = briefs.find((b) => b.id === id);
      if (target) {
        addOrUpdateBrief({ ...target, isApplied: true });
      }
    },
    [briefs, addOrUpdateBrief]
  );

  const exportJSON = useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(briefs, null, 2));
    const dl = document.createElement("a");
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `app_briefs_${Date.now()}.json`);
    dl.click();
    toast.success("Exported briefs as JSON!");
  }, [briefs]);

  const exportCSV = useCallback(() => {
    const header = "id,title,wordCount,charCount,constraintMode,category,createdAt\n";
    const rows = briefs
      .map(
        (b) =>
          `"${b.id || ""}","${(b.title || "").replace(/"/g, '""')}",${b.wordCount || 0},${b.charCount || 0},"${b.constraintMode || ""}","${b.category || ""}","${b.createdAt || ""}"`
      )
      .join("\n");
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(header + rows);
    const dl = document.createElement("a");
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `app_briefs_${Date.now()}.csv`);
    dl.click();
    toast.success("Exported briefs as CSV!");
  }, [briefs]);

  const exportMD = useCallback(() => {
    const md = briefs
      .map((b) => `## ${b.title}\n\n**Category:** ${b.category || "General"} | **Words:** ${b.wordCount || 0}\n\n${b.description}\n\n---\n`)
      .join("\n");
    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const dl = document.createElement("a");
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `app_briefs_${Date.now()}.md`);
    dl.click();
    toast.success("Exported briefs as Markdown!");
  }, [briefs]);

  const importJSON = useCallback(
    (fileOrText: any): { success: boolean; count?: number } => {
      try {
        const parsed = typeof fileOrText === "string" ? JSON.parse(fileOrText) : fileOrText;
        if (Array.isArray(parsed)) {
          const current = getAppBriefs();
          const combined = [...parsed, ...current];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(combined.slice(0, 200)));
          refresh();
          toast.success(`Imported ${parsed.length} briefs successfully!`);
          return { success: true, count: parsed.length };
        }
      } catch (e) {
        toast.error("Failed to parse JSON file");
      }
      return { success: false };
    },
    [refresh]
  );

  const filteredBriefs = useMemo(() => {
    return briefs
      .filter((b) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (b.title || "").toLowerCase().includes(q);
          const matchDesc = (b.description || "").toLowerCase().includes(q);
          const matchCat = (b.category || "").toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchCat) return false;
        }
        if (constraintFilter !== "all" && b.constraintMode !== constraintFilter) return false;
        if (toneFilter !== "all" && b.tone !== toneFilter) return false;
        if (categoryFilter !== "all" && b.category !== categoryFilter) return false;
        if (favoritesOnly && !b.isFavorite) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") return (a.timestamp || 0) - (b.timestamp || 0);
        if (sortBy === "words_asc") return (a.wordCount || 0) - (b.wordCount || 0);
        if (sortBy === "words_desc") return (b.wordCount || 0) - (a.wordCount || 0);
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
  }, [briefs, searchQuery, constraintFilter, toneFilter, categoryFilter, favoritesOnly, sortBy]);

  const totalWords = briefs.reduce((acc, b) => acc + (b.wordCount || 0), 0);
  const avgWords = briefs.length ? Math.round(totalWords / briefs.length) : 0;
  const categories = new Set(briefs.map((b) => b.category || "Pitch"));
  const favoriteCount = briefs.filter((b) => b.isFavorite).length;

  // Calculate most used constraint mode
  const modeCounts: Record<string, number> = {};
  for (const b of briefs) {
    if (b.constraintMode) {
      modeCounts[b.constraintMode] = (modeCounts[b.constraintMode] || 0) + 1;
    }
  }
  let mostUsedMode = "elevator";
  let maxCount = 0;
  for (const [mode, cnt] of Object.entries(modeCounts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      mostUsedMode = mode;
    }
  }

  const stats = {
    totalBriefs: briefs.length,
    totalCount: briefs.length,
    totalWords,
    avgWords,
    categoriesCount: categories.size,
    favoriteCount,
    mostUsedMode,
  };

  return {
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
    refresh,
  };
}
