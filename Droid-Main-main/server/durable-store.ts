import fs from "fs";
import path from "path";

export interface StorageOptions {
  storageDir?: string;
  filePath?: string;
  inMemory?: boolean;
  mode?: "memory" | "disk" | string;
}

/**
 * Persists named collections as JSON files on disk (or in memory), with
 * atomic writes, corruption quarantine, and explicit recovery-error
 * tracking so callers never silently lose or overwrite unreadable data.
 */
export class DurableStore {
  private inMemory: boolean;
  private storageDir: string;
  private memoryStore: Map<string, any[]> = new Map();
  private recoveryErrors = new Map<string, string>();

  /**
   * Creates the store, provisioning and locking down the storage directory
   * (mode 0700) unless running in-memory. Throws if the directory cannot be
   * created or restricted.
   */
  constructor(options: StorageOptions = {}) {
    this.inMemory = options.inMemory ?? (options.mode === "memory");
    this.storageDir = options.storageDir ?? path.join(process.cwd(), ".data");
    if (!this.inMemory) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") {
          try {
            fs.chmodSync(this.storageDir, 0o700);
          } catch (error) {
            let currentMode: number;
            try {
              currentMode = fs.statSync(this.storageDir).mode & 0o777;
            } catch {
              throw error;
            }
            if (currentMode !== 0o700) throw error;
          }
        }
      } catch (error) {
        throw new Error(
          `Durable storage is unavailable or cannot be restricted at ${this.storageDir}; refusing an implicit in-memory fallback.`,
          { cause: error },
        );
      }
    }
  }

  /**
   * Reads a named collection, returning `[]` if it does not exist. Unreadable
   * or corrupt files are quarantined (renamed aside) and the error recorded
   * so a subsequent write is refused rather than silently discarding data.
   */
  readCollection<T>(name: string): T[] {
    if (this.inMemory) {
      return (this.memoryStore.get(name) as T[]) || [];
    }
    const filePath = path.join(this.storageDir, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      this.recoveryErrors.delete(name);
      return [];
    }
    let contents: string;
    try {
      contents = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.recoveryErrors.set(name, `Durable collection "${name}" could not be read: ${detail}`);
      console.error(this.recoveryErrors.get(name));
      return [];
    }
    try {
      const parsed = JSON.parse(contents) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("collection root is not an array");
      }
      this.recoveryErrors.delete(name);
      return parsed as T[];
    } catch (error) {
      const quarantinePath = `${filePath}.corrupt.${Date.now()}`;
      const detail = error instanceof Error ? error.message : String(error);
      try {
        fs.renameSync(filePath, quarantinePath);
        this.recoveryErrors.delete(name);
        console.error(`Durable collection "${name}" was quarantined at ${quarantinePath}: ${detail}`);
      } catch (renameError) {
        this.recoveryErrors.set(name, `Durable collection "${name}" is unreadable and could not be quarantined: ${detail}; ${renameError instanceof Error ? renameError.message : String(renameError)}`);
        console.error(this.recoveryErrors.get(name));
      }
      return [];
    }
  }

  /**
   * Reads a collection for a subsequent write, throwing if a prior read
   * recorded a recovery error (so a broken collection is never overwritten
   * with an empty result).
   */
  readCollectionForWrite<T>(name: string): T[] {
    const items = this.readCollection<T>(name);
    const recoveryError = this.recoveryErrors.get(name);
    if (recoveryError) {
      throw new Error(`${recoveryError}. Restore access to the collection before writing.`);
    }
    return items;
  }

  /**
   * Writes a named collection to disk (or memory) atomically, via a
   * temp-file-then-rename, refusing the write if the collection has an
   * unresolved recovery error.
   */
  writeCollection<T>(name: string, items: T[]): void {
    const filePath = path.join(this.storageDir, `${name}.json`);
    if (this.recoveryErrors.has(name)) {
      this.readCollection(name);
      const retryError = this.recoveryErrors.get(name);
      if (retryError) {
        throw new Error(`${retryError}. Restore access to the collection before writing.`);
      }
    }
    if (this.inMemory) {
      this.memoryStore.set(name, items);
      return;
    }
    const tempPath = path.join(
      this.storageDir,
      `.${name}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      fs.writeFileSync(tempPath, JSON.stringify(items, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      fs.renameSync(tempPath, filePath);
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Temporary-file cleanup is best effort; preserve the original write error.
      }
    }
  }
}
