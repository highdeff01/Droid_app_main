export interface AppBriefRecord {
  id?: string;
  title: string;
  description: string;
  wordCount?: number;
  charCount?: number;
  constraintMode?: string;
  targetLimit?: number;
  tone?: string;
  source?: string;
  keyPropositions?: string[];
  category?: string;
  originalInput?: string;
  timestamp?: number;
  createdAt?: string;
  [key: string]: any;
}

const STORAGE_KEY = "sightline_app_briefs_history_vault";

export function getAppBriefs(): AppBriefRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAppBrief(brief: Partial<AppBriefRecord>): AppBriefRecord {
  const newRecord: AppBriefRecord = {
    id: brief.id || `brief_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: brief.title || "Untitled App Brief",
    description: brief.description || "",
    wordCount: brief.wordCount,
    charCount: brief.charCount,
    constraintMode: brief.constraintMode,
    targetLimit: brief.targetLimit,
    tone: brief.tone,
    source: brief.source || "Pitch Studio",
    keyPropositions: brief.keyPropositions || [],
    category: brief.category || "Pitch",
    originalInput: brief.originalInput,
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    ...brief,
  };

  if (typeof window !== "undefined") {
    try {
      const briefs = getAppBriefs();
      const updated = [newRecord, ...briefs.filter((b) => b.id !== newRecord.id)].slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }

  return newRecord;
}

export function bulkSaveAppBriefs(briefsList: Partial<AppBriefRecord>[]): void {
  for (const b of briefsList) {
    saveAppBrief(b);
  }
}

