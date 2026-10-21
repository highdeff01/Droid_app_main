import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface StoredFrameReference {
  frameId: string;
  contentHash: string;
  storagePath: string;
  byteLength: number;
}

export type StoreFrame = (imageData: string) => StoredFrameReference;

// Captures are evidence, not an archive: retain at most 256 images for 7 days.
const MAX_STORED_FRAMES = 256;
const MAX_FRAME_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const STORED_FRAME_PATTERN = /^frame_[a-f0-9]{64}\.(?:png|jpg|webp)$/;

/**
 * Deletes stored frame files older than `MAX_FRAME_AGE_MS` or beyond the
 * `MAX_STORED_FRAMES` retention cap, always preserving `protectedPath`.
 */
function pruneStoredFrames(storageDir: string, protectedPath: string) {
  const entries = fs.readdirSync(storageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && STORED_FRAME_PATTERN.test(entry.name))
    .flatMap((entry) => {
      const filePath = path.join(storageDir, entry.name);
      try {
        return [{ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    })
    .sort((left, right) => left.mtimeMs - right.mtimeMs);

  const cutoff = Date.now() - MAX_FRAME_AGE_MS;
  let retainedCount = entries.length;
  for (const entry of entries) {
    if (entry.filePath === protectedPath) continue;
    if (entry.mtimeMs < cutoff || retainedCount > MAX_STORED_FRAMES) {
      try {
        fs.unlinkSync(entry.filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      retainedCount -= 1;
    }
  }
}

/**
 * Creates a `StoreFrame` function that writes base64 image data URLs to disk
 * under `storageDir`, deduplicating by content hash and pruning old frames
 * on each write.
 */
export function createDiskFrameStore(
  storageDir = path.join(process.cwd(), ".data", "frames"),
): StoreFrame {
  return (imageData) => {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
    if (!match) throw new Error("Frame data must be a base64 image data URL");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0) throw new Error("Frame data is empty");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const extension = match[1] === "jpeg" ? "jpg" : match[1];
    const frameId = `frame_${hash}`;
    const filePath = path.join(storageDir, `${frameId}.${extension}`);
    fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(filePath)) {
      const stamp = new Date();
      fs.utimesSync(filePath, stamp, stamp);
    } else {
      const tempPath = path.join(storageDir, `.${frameId}.${process.pid}.tmp`);
      try {
        fs.writeFileSync(tempPath, bytes, { mode: 0o600 });
        fs.renameSync(tempPath, filePath);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }
    pruneStoredFrames(storageDir, filePath);
    return {
      frameId,
      contentHash: `sha256:${hash}`,
      storagePath: path.relative(process.cwd(), filePath),
      byteLength: bytes.length,
    };
  };
}
