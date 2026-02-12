/**
 * Open Tabs Store
 *
 * SQLite-backed persistent store for currently open workspace tabs.
 * Stores tab order, active tab state, and basic directory metadata.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../logger.js";

const logger = createLogger("OpenTabsStore");

/**
 * A single open tab entry with position and state information
 */
export interface OpenTabEntry {
  readonly path: string;
  readonly name: string;
  readonly tabOrder: number;
  readonly isActive: boolean;
  readonly isGitRepo: boolean;
}

/**
 * Manages currently open tabs with persistent storage.
 * Stores tab order and active tab state in SQLite database.
 */
export interface OpenTabsStore {
  /**
   * Save all open tabs in a single transaction.
   * Replaces all existing tabs with the provided list.
   * Also marks the store as initialized.
   *
   * @param tabs - All open tabs to persist (order matters)
   * @returns Promise that resolves when save is complete
   */
  save(tabs: readonly OpenTabEntry[]): Promise<void>;

  /**
   * Get all open tabs sorted by tab order ascending.
   *
   * @returns Promise resolving to readonly array of open tabs
   */
  getAll(): Promise<readonly OpenTabEntry[]>;

  /**
   * Check if the store has ever been saved to.
   * Used to distinguish "first run ever" from "user closed all tabs".
   *
   * @returns Promise resolving to true if save() has been called at least once
   */
  isInitialized(): Promise<boolean>;

  /**
   * Remove all open tabs.
   *
   * @returns Promise that resolves when clear is complete
   */
  clear(): Promise<void>;
}

/**
 * Options for creating an open tabs store
 */
export interface OpenTabsStoreOptions {
  /**
   * Path to SQLite database file. Defaults to ~/.local/QraftBox/open-tabs.db
   * Mainly for testing purposes.
   */
  readonly dbPath?: string | undefined;
}

/**
 * Default database path
 */
export function defaultOpenTabsDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "open-tabs.db");
}

/**
 * Internal implementation of OpenTabsStore
 */
class OpenTabsStoreImpl implements OpenTabsStore {
  private readonly db: Database;
  private readonly stmtInsert: ReturnType<Database["prepare"]>;
  private readonly stmtGetAll: ReturnType<Database["prepare"]>;
  private readonly stmtClear: ReturnType<Database["prepare"]>;
  private readonly stmtSetMeta: ReturnType<Database["prepare"]>;
  private readonly stmtGetMeta: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements upfront
    this.stmtInsert = db.prepare(`
      INSERT INTO open_tabs (path, name, tab_order, is_active, is_git_repo)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtGetAll = db.prepare(`
      SELECT path, name, tab_order, is_active, is_git_repo
      FROM open_tabs
      ORDER BY tab_order ASC
    `);

    this.stmtClear = db.prepare(`
      DELETE FROM open_tabs
    `);

    this.stmtSetMeta = db.prepare(`
      INSERT OR REPLACE INTO open_tabs_meta (key, value) VALUES (?, ?)
    `);

    this.stmtGetMeta = db.prepare(`
      SELECT value FROM open_tabs_meta WHERE key = ?
    `);
  }

  async save(tabs: readonly OpenTabEntry[]): Promise<void> {
    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      // Clear existing tabs
      this.stmtClear.run();

      // Insert new tabs
      for (const tab of tabs) {
        const isActive = tab.isActive ? 1 : 0;
        const isGitRepo = tab.isGitRepo ? 1 : 0;
        this.stmtInsert.run(
          tab.path,
          tab.name,
          tab.tabOrder,
          isActive,
          isGitRepo,
        );
      }

      // Mark store as initialized
      this.stmtSetMeta.run("initialized", "1");
    });

    transaction();

    logger.debug("Saved open tabs", { count: tabs.length });
  }

  async isInitialized(): Promise<boolean> {
    const row = this.stmtGetMeta.get("initialized") as { value: string } | null;
    return row !== null && row.value === "1";
  }

  async getAll(): Promise<readonly OpenTabEntry[]> {
    const rows = this.stmtGetAll.all() as Array<{
      path: string;
      name: string;
      tab_order: number;
      is_active: number;
      is_git_repo: number;
    }>;

    return rows.map(
      (row): OpenTabEntry => ({
        path: row.path,
        name: row.name,
        tabOrder: row.tab_order,
        isActive: row.is_active === 1,
        isGitRepo: row.is_git_repo === 1,
      }),
    );
  }

  async clear(): Promise<void> {
    this.stmtClear.run();
    logger.debug("Cleared all open tabs");
  }
}

/**
 * Create an open tabs store instance.
 *
 * @param options - Store options
 * @returns OpenTabsStore implementation
 */
export function createOpenTabsStore(
  options?: OpenTabsStoreOptions,
): OpenTabsStore {
  const dbPath = options?.dbPath ?? defaultOpenTabsDbPath();

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  // Open database
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_tabs (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tab_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_git_repo INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create index for tab_order ordering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_open_tabs_tab_order
    ON open_tabs(tab_order ASC)
  `);

  // Create metadata table for tracking initialization state
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_tabs_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  logger.info("Open tabs store initialized", { dbPath });

  return new OpenTabsStoreImpl(db);
}

/**
 * Create an in-memory open tabs store for testing.
 *
 * @returns OpenTabsStore instance backed by in-memory database
 */
export function createInMemoryOpenTabsStore(): OpenTabsStore {
  const db = new Database(":memory:");

  // Enable WAL mode
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_tabs (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tab_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_git_repo INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create index for tab_order ordering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_open_tabs_tab_order
    ON open_tabs(tab_order ASC)
  `);

  // Create metadata table for tracking initialization state
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_tabs_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  logger.debug("In-memory open tabs store initialized");

  return new OpenTabsStoreImpl(db);
}
