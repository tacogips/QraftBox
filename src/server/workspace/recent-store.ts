import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { RecentDirectory } from "../../types/workspace";
import { sortRecentDirectories } from "../../types/workspace";

/**
 * Maximum number of recent directories to store
 */
const MAX_RECENT = 20;

/**
 * Data structure stored in recent.json
 */
interface RecentRegistryData {
  readonly recent: readonly RecentDirectory[];
}

/**
 * Manages recently opened directories with persistent storage.
 * Stores up to 20 most recent directories in ~/.local/QraftBox/recent.json.
 */
export interface RecentDirectoryStore {
  /**
   * Add or update a recent directory entry.
   * Updates lastOpened if entry exists. Persists immediately.
   *
   * @param entry - Recent directory entry to add or update
   * @returns Promise that resolves when operation is complete
   */
  add(entry: RecentDirectory): Promise<void>;

  /**
   * Remove a recent directory by path.
   * Persists immediately.
   *
   * @param path - Absolute path to remove from recent list
   * @returns Promise that resolves when removal is complete
   */
  remove(path: string): Promise<void>;

  /**
   * Get all recent directories sorted by lastOpened descending.
   *
   * @returns Promise resolving to readonly array of recent directories
   */
  getAll(): Promise<readonly RecentDirectory[]>;
}

/**
 * Options for creating a recent directory store
 */
export interface RecentDirectoryStoreOptions {
  /**
   * Base directory for storage. Defaults to ~/.local/QraftBox
   * Mainly for testing purposes.
   */
  readonly baseDir?: string;
}

/**
 * In-memory cache of recent directory data
 */
interface RecentCache {
  data: RecentRegistryData | null;
}

/**
 * Get the path to the recent.json file.
 *
 * @param baseDir - Base directory override (for testing)
 * @returns Absolute path to recent.json
 */
function getRecentFilePath(baseDir?: string): string {
  const dir = baseDir ?? join(homedir(), ".local", "QraftBox");
  return join(dir, "recent.json");
}

/**
 * Ensure the storage directory exists.
 *
 * @param baseDir - Base directory override (for testing)
 * @returns Promise that resolves when directory is created
 */
async function ensureRecentDir(baseDir?: string): Promise<void> {
  const dir = baseDir ?? join(homedir(), ".local", "QraftBox");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Read recent directory data from disk.
 *
 * @param baseDir - Base directory override (for testing)
 * @returns Promise resolving to recent directory data
 */
async function readRecent(baseDir?: string): Promise<RecentRegistryData> {
  const filePath = getRecentFilePath(baseDir);

  if (!existsSync(filePath)) {
    return { recent: [] };
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as unknown;

    // Validate structure
    if (
      typeof data === "object" &&
      data !== null &&
      "recent" in data &&
      Array.isArray(data.recent)
    ) {
      return data as RecentRegistryData;
    }

    // Invalid format, return empty
    return { recent: [] };
  } catch (error) {
    // Failed to read or parse, return empty
    return { recent: [] };
  }
}

/**
 * Write recent directory data to disk.
 *
 * @param data - Recent directory data to write
 * @param baseDir - Base directory override (for testing)
 * @returns Promise that resolves when write is complete
 */
async function writeRecent(
  data: RecentRegistryData,
  baseDir?: string,
): Promise<void> {
  await ensureRecentDir(baseDir);
  const filePath = getRecentFilePath(baseDir);
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Create a recent directory store instance.
 *
 * @param options - Store options
 * @returns RecentDirectoryStore implementation
 */
export function createRecentDirectoryStore(
  options?: RecentDirectoryStoreOptions,
): RecentDirectoryStore {
  const baseDir = options?.baseDir;
  const cache: RecentCache = {
    data: null,
  };

  /**
   * Load recent directory data into cache if not already loaded.
   *
   * @returns Promise that resolves when cache is populated
   */
  async function ensureLoaded(): Promise<void> {
    if (cache.data === null) {
      cache.data = await readRecent(baseDir);
    }
  }

  return {
    async add(entry: RecentDirectory): Promise<void> {
      await ensureLoaded();

      if (cache.data === null) {
        return;
      }

      // Find existing entry with same path
      const existingIndex = cache.data.recent.findIndex(
        (r) => r.path === entry.path,
      );

      let updatedRecent: RecentDirectory[];

      if (existingIndex !== -1) {
        // Update existing entry (merge fields, set new lastOpened)
        const existing = cache.data.recent[existingIndex];
        if (existing === undefined) {
          return;
        }
        const updated: RecentDirectory = {
          ...existing,
          ...entry,
          lastOpened: Date.now(),
        };
        updatedRecent = [...cache.data.recent];
        updatedRecent[existingIndex] = updated;
      } else {
        // Add new entry
        updatedRecent = [...cache.data.recent, entry];
      }

      // Sort by most recent and trim to MAX_RECENT
      const sorted = sortRecentDirectories(updatedRecent);
      const trimmed = sorted.slice(0, MAX_RECENT);

      // Update cache and persist
      cache.data = { recent: trimmed };
      await writeRecent(cache.data, baseDir);
    },

    async remove(path: string): Promise<void> {
      await ensureLoaded();

      if (cache.data === null) {
        return;
      }

      // Filter out the entry with matching path
      const filtered = cache.data.recent.filter((r) => r.path !== path);

      // Update cache and persist
      cache.data = { recent: filtered };
      await writeRecent(cache.data, baseDir);
    },

    async getAll(): Promise<readonly RecentDirectory[]> {
      await ensureLoaded();

      if (cache.data === null) {
        return [];
      }

      // Return sorted by lastOpened descending
      return sortRecentDirectories(cache.data.recent);
    },
  };
}
