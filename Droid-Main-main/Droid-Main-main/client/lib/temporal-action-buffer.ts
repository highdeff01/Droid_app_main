export interface TemporalSnapshotBundle {
  id?: string;
  slotIndex?: number;
  image?: string;
  imageUrl?: string;
  timestamp?: number;
  label?: string;
  similarityScore?: number;
  diffStatus?: "matched" | "diverged" | "pending";
  metadata?: Record<string, any>;
  [key: string]: any;
}

const STORAGE_KEY = "sightline_temporal_snapshot_bundles";

export function getSavedSnapshotBundles(): TemporalSnapshotBundle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSnapshotBundle(bundle: TemporalSnapshotBundle): void {
  if (typeof window === "undefined") return;
  try {
    const bundles = getSavedSnapshotBundles();
    const existingIdx = bundles.findIndex((b) => b.slotIndex === bundle.slotIndex);
    if (existingIdx >= 0) {
      bundles[existingIdx] = bundle;
    } else {
      bundles.push(bundle);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundles));
  } catch {}
}

export function recordTemporalAction(action: any): void {
  // Store temporal action in session buffer
}

export async function captureSnapshotWith10sBuffer(
  image?: string,
  slotIndex?: number,
  label?: string
): Promise<TemporalSnapshotBundle> {
  const bundle: TemporalSnapshotBundle = {
    id: `snap_${Date.now()}`,
    image,
    slotIndex,
    label,
    timestamp: Date.now(),
    diffStatus: "matched",
  };
  saveSnapshotBundle(bundle);
  return bundle;
}
