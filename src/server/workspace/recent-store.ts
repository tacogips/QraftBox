/**
 * Recent Directory Store
 *
 * SQLite-backed persistent store for recently opened directories.
 * Stores up to 20 most recent directories in ~/.local/QraftBox/recent.db.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { RecentDirectory } from "../../types/workspace.js";
import { createLogger } from "../logger.js";

const logger = createLogger("RecentDirectoryStore");

/**
 * Maximum number of recent directories to store
 */
const MAX_RECENT = 20;

/**
 * Manages recently opened directories with persistent storage.
 * Stores up to 20 most recent directories in SQLite database.
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
   * Path to SQLite database file. Defaults to ~/.local/QraftBox/recent.db
   * Mainly for testing purposes.
   */
  readonly dbPath?: string | undefined;
}

/**
 * Default database path
 */
export function defaultRecentDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "recent.db");
}

/**
 * Internal implementation of RecentDirectoryStore
 */
class RecentDirectoryStoreImpl implements RecentDirectoryStore {
  private readonly stmtUpsert: ReturnType<Database["prepare"]>;
  private readonly stmtRemove: ReturnType<Database["prepare"]>;
  private readonly stmtGetAll: ReturnType<Database["prepare"]>;
  private readonly stmtCleanup: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    // Prepare all statements upfront
    this.stmtUpsert = db.prepare(`
      INSERT OR REPLACE INTO recent_directories (path, name, last_opened, is_git_repo)
      VALUES (?, ?, ?, ?)
    `);

    this.stmtRemove = db.prepare(`
      DELETE FROM recent_directories WHERE path = ?
    `);

    this.stmtGetAll = db.prepare(`
      SELECT path, name, last_opened, is_git_repo
      FROM recent_directories
      ORDER BY last_opened DESC
      LIMIT ?
    `);

    this.stmtCleanup = db.prepare(`
      DELETE FROM recent_directories
      WHERE path NOT IN (
        SELECT path FROM recent_directories
        ORDER BY last_opened DESC
        LIMIT ?
      )
    `);
  }

  async add(entry: RecentDirectory): Promise<void> {
    const lastOpened = Date.now();
    const isGitRepo = entry.isGitRepo ? 1 : 0;

    this.stmtUpsert.run(entry.path, entry.name, lastOpened, isGitRepo);
    logger.debug("Added recent directory", {
      path: entry.path,
      name: entry.name,
    });

    // Cleanup excess rows beyond MAX_RECENT
    const result = this.stmtCleanup.run(MAX_RECENT);
    if (result.changes > 0) {
      logger.debug("Cleaned up old entries", { deletedCount: result.changes });
    }
  }

  async remove(path: string): Promise<void> {
    this.stmtRemove.run(path);
    logger.debug("Removed recent directory", { path });
  }

  async getAll(): Promise<readonly RecentDirectory[]> {
    const rows = this.stmtGetAll.all(MAX_RECENT) as Array<{
      path: string;
      name: string;
      last_opened: number;
      is_git_repo: number;
    }>;

    return rows.map(
      (row): RecentDirectory => ({
        path: row.path,
        name: row.name,
        lastOpened: row.last_opened,
        isGitRepo: row.is_git_repo === 1,
      }),
    );
  }
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
  const dbPath = options?.dbPath ?? defaultRecentDbPath();

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  // Open database
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS recent_directories (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_opened INTEGER NOT NULL,
      is_git_repo INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create index for last_opened ordering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_recent_directories_last_opened
    ON recent_directories(last_opened DESC)
  `);

  logger.info("Recent directory store initialized", { dbPath });

  return new RecentDirectoryStoreImpl(db);
}

/**
 * Create an in-memory recent directory store for testing.
 *
 * @returns RecentDirectoryStore instance backed by in-memory database
 */
export function createInMemoryRecentDirectoryStore(): RecentDirectoryStore {
  const db = new Database(":memory:");

  // Enable WAL mode
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS recent_directories (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_opened INTEGER NOT NULL,
      is_git_repo INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create index for last_opened ordering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_recent_directories_last_opened
    ON recent_directories(last_opened DESC)
  `);

  logger.debug("In-memory recent directory store initialized");

  return new RecentDirectoryStoreImpl(db);
}
