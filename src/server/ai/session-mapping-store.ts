/**
 * Session Mapping Store
 *
 * SQLite-backed persistent store for qraft_ai_session_id <-> claude_session_id mappings.
 * Enables session continuity across server restarts and efficient batch lookups
 * for enriching session lists with qraft session IDs.
 */

import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  QraftAiSessionId,
  ClaudeSessionId,
  WorktreeId,
} from "../../types/ai.js";
import { deriveQraftAiSessionIdFromClaude } from "../../types/ai.js";
import { createLogger } from "../logger.js";

const logger = createLogger("session-mapping-store");

/**
 * Session source type - tracks whether session was created by QraftBox or auto-discovered
 */
export type SessionSource = "qraftbox" | "auto";

/**
 * A single mapping row
 */
export interface SessionMapping {
  readonly qraft_ai_session_id: QraftAiSessionId;
  readonly claude_session_id: ClaudeSessionId;
  readonly project_path: string;
  readonly worktree_id: WorktreeId;
  readonly source: SessionSource;
  readonly created_at: string; // ISO 8601
}

/**
 * Session mapping store interface
 */
export interface SessionMappingStore {
  /**
   * Register a mapping from claude_session_id to qraft_ai_session_id.
   * If a mapping for the same claude_session_id already exists, it is updated.
   * Returns the derived QraftAiSessionId.
   *
   * @param source - Session origin ('qraftbox' for QraftBox-created, 'auto' for auto-discovered)
   */
  upsert(
    claudeSessionId: ClaudeSessionId,
    projectPath: string,
    worktreeId: WorktreeId,
    source?: SessionSource | undefined,
    qraftAiSessionId?: QraftAiSessionId | undefined,
  ): QraftAiSessionId;

  /**
   * Look up the most recent claude_session_id for a given qraft_ai_session_id.
   * Used by resolveResumeSessionId to find the Claude session to resume.
   */
  findClaudeSessionId(
    qraftAiSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined;

  /**
   * Fast lookup without directory scan fallback.
   * Returns undefined when not present in SQLite.
   */
  findClaudeSessionIdSqlOnly(
    qraftAiSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined;

  /**
   * Batch lookup: given an array of claude_session_ids, return a Map
   * from claude_session_id -> QraftAiSessionId.
   * Used to enrich session list responses with qraft IDs.
   */
  batchLookupByClaudeIds(
    claudeSessionIds: readonly ClaudeSessionId[],
  ): Map<ClaudeSessionId, QraftAiSessionId>;

  /**
   * Find the QraftAiSessionId for a specific claude_session_id.
   */
  findByClaudeSessionId(
    claudeSessionId: ClaudeSessionId,
  ): QraftAiSessionId | undefined;

  /**
   * Check if a session was created by QraftBox (as opposed to auto-discovered).
   */
  isQraftBoxSession(claudeSessionId: ClaudeSessionId): boolean;

  /**
   * Close the database connection.
   */
  close(): void;
}

/**
 * Default database path
 */
export function defaultSessionMappingDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "session-mappings.db");
}

/**
 * Maximum number of parameters per SQLite query (chunk size for batch operations)
 */
const BATCH_CHUNK_SIZE = 500;

/**
 * Internal implementation of SessionMappingStore
 */
class SessionMappingStoreImpl implements SessionMappingStore {
  private readonly db: Database;
  private readonly claudeProjectsDir: string;
  private readonly stmtUpsert: ReturnType<Database["prepare"]>;
  private readonly stmtFindByQraftId: ReturnType<Database["prepare"]>;
  private readonly stmtFindByClaudeId: ReturnType<Database["prepare"]>;
  private readonly stmtIsQraftBoxSession: ReturnType<Database["prepare"]>;

  constructor(db: Database, claudeProjectsDir?: string) {
    this.db = db;
    this.claudeProjectsDir =
      claudeProjectsDir ?? join(homedir(), ".claude", "projects");

    // Prepare all statements upfront
    this.stmtUpsert = db.prepare(`
      INSERT INTO session_mappings (claude_session_id, qraft_ai_session_id, project_path, worktree_id, source, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(claude_session_id) DO UPDATE SET
        qraft_ai_session_id = excluded.qraft_ai_session_id,
        project_path = excluded.project_path,
        worktree_id = excluded.worktree_id,
        source = CASE WHEN excluded.source = 'qraftbox' THEN 'qraftbox' ELSE session_mappings.source END,
        created_at = excluded.created_at
    `);

    this.stmtFindByQraftId = db.prepare(`
      SELECT claude_session_id
      FROM session_mappings
      WHERE qraft_ai_session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    this.stmtFindByClaudeId = db.prepare(`
      SELECT qraft_ai_session_id
      FROM session_mappings
      WHERE claude_session_id = ?
    `);

    this.stmtIsQraftBoxSession = db.prepare(`
      SELECT 1
      FROM session_mappings
      WHERE claude_session_id = ? AND source = 'qraftbox'
      LIMIT 1
    `);
  }

  upsert(
    claudeSessionId: ClaudeSessionId,
    projectPath: string,
    worktreeId: WorktreeId,
    source?: SessionSource | undefined,
    qraftAiSessionId?: QraftAiSessionId | undefined,
  ): QraftAiSessionId {
    const qraftId =
      qraftAiSessionId ?? deriveQraftAiSessionIdFromClaude(claudeSessionId);
    const sourceValue: SessionSource = source ?? "auto";
    this.stmtUpsert.run(
      claudeSessionId,
      qraftId,
      projectPath,
      worktreeId,
      sourceValue,
    );
    logger.debug("Upserted session mapping", {
      claudeSessionId,
      qraftId,
      projectPath,
      worktreeId,
      source: sourceValue,
    });
    return qraftId;
  }

  findClaudeSessionId(
    qraftAiSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined {
    // Fast path: SQLite lookup
    const row = this.stmtFindByQraftId.get(qraftAiSessionId) as
      | { claude_session_id: ClaudeSessionId }
      | undefined
      | null;
    if (row !== undefined && row !== null) {
      return row.claude_session_id;
    }

    // Fallback: scan ~/.claude/projects/ directory
    return this.scanClaudeDirectoryForMatch(qraftAiSessionId);
  }

  findClaudeSessionIdSqlOnly(
    qraftAiSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined {
    const row = this.stmtFindByQraftId.get(qraftAiSessionId) as
      | { claude_session_id: ClaudeSessionId }
      | undefined
      | null;
    if (row === undefined || row === null) {
      return undefined;
    }
    return row.claude_session_id;
  }

  /**
   * Scan ~/.claude/projects/ directory to find a matching Claude session ID.
   * This fallback is used when SQLite lookup fails, typically for sessions
   * created outside QraftBox (e.g., via claude-cli).
   *
   * @param qraftAiSessionId - The QraftAiSessionId to search for
   * @returns Claude session ID if found, undefined otherwise
   */
  private scanClaudeDirectoryForMatch(
    qraftAiSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined {
    try {
      // List all project directories
      const projectDirs = readdirSync(this.claudeProjectsDir, {
        withFileTypes: true,
      });

      for (const projectDir of projectDirs) {
        if (!projectDir.isDirectory()) {
          continue;
        }

        const projectPath = join(this.claudeProjectsDir, projectDir.name);

        try {
          // List all .jsonl files in this project directory
          const files = readdirSync(projectPath, { withFileTypes: true });
          const jsonlFiles = files.filter(
            (file) => file.isFile() && file.name.endsWith(".jsonl"),
          );

          for (const jsonlFile of jsonlFiles) {
            // Extract session ID from filename (remove .jsonl extension)
            const claudeSessionId = jsonlFile.name.slice(
              0,
              -6,
            ) as ClaudeSessionId; // Remove ".jsonl"
            const derivedQraftId =
              deriveQraftAiSessionIdFromClaude(claudeSessionId);

            if (derivedQraftId === qraftAiSessionId) {
              // Match found! Persist it to SQLite for future fast lookups
              const decodedProjectPath = this.decodeProjectPath(
                projectDir.name,
              );
              this.stmtUpsert.run(
                claudeSessionId,
                qraftAiSessionId,
                decodedProjectPath,
                "unknown" as WorktreeId,
                "auto",
              );

              logger.info("Discovered Claude session via directory scan", {
                claudeSessionId,
                qraftAiSessionId,
                projectPath: decodedProjectPath,
              });

              return claudeSessionId;
            }
          }
        } catch (error: unknown) {
          // Skip directories that can't be read (permissions, etc.)
          logger.debug("Failed to scan project directory", {
            projectDir: projectDir.name,
            error:
              error instanceof Error
                ? error.message
                : "Unknown error during directory scan",
          });
          continue;
        }
      }

      // No match found
      logger.debug("No matching Claude session found via directory scan", {
        qraftAiSessionId,
      });
      return undefined;
    } catch (error: unknown) {
      // Claude projects directory doesn't exist or can't be read
      logger.debug("Failed to scan Claude projects directory", {
        directory: this.claudeProjectsDir,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error accessing directory",
      });
      return undefined;
    }
  }

  /**
   * Decode project path from directory name.
   * Claude encodes paths by replacing "/" with "-" and prefixing with "-".
   * Example: "-g-gits-tacogips-QraftBox" -> "/g/gits/tacogips/QraftBox"
   *
   * @param encoded - Encoded directory name
   * @returns Decoded project path
   */
  private decodeProjectPath(encoded: string): string {
    return encoded.replace(/-/g, "/");
  }

  findByClaudeSessionId(
    claudeSessionId: ClaudeSessionId,
  ): QraftAiSessionId | undefined {
    const row = this.stmtFindByClaudeId.get(claudeSessionId) as
      | { qraft_ai_session_id: string }
      | undefined;
    return row?.qraft_ai_session_id as QraftAiSessionId | undefined;
  }

  isQraftBoxSession(claudeSessionId: ClaudeSessionId): boolean {
    const row = this.stmtIsQraftBoxSession.get(claudeSessionId) as
      | { 1: number }
      | undefined
      | null;
    return row !== undefined && row !== null;
  }

  batchLookupByClaudeIds(
    claudeSessionIds: readonly ClaudeSessionId[],
  ): Map<ClaudeSessionId, QraftAiSessionId> {
    if (claudeSessionIds.length === 0) {
      return new Map();
    }

    const result = new Map<ClaudeSessionId, QraftAiSessionId>();

    // Process in chunks to avoid SQLite variable limit
    for (let i = 0; i < claudeSessionIds.length; i += BATCH_CHUNK_SIZE) {
      const chunk = claudeSessionIds.slice(i, i + BATCH_CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(", ");
      const query = `
        SELECT claude_session_id, qraft_ai_session_id
        FROM session_mappings
        WHERE claude_session_id IN (${placeholders})
      `;

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...chunk) as Array<{
        claude_session_id: ClaudeSessionId;
        qraft_ai_session_id: string;
      }>;

      for (const row of rows) {
        result.set(
          row.claude_session_id,
          row.qraft_ai_session_id as QraftAiSessionId,
        );
      }
    }

    return result;
  }

  close(): void {
    this.db.close();
    logger.debug("Database connection closed");
  }
}

/**
 * Create a session mapping store with the specified database path.
 *
 * @param dbPath - Path to the SQLite database file (defaults to ~/.local/QraftBox/session-mappings.db)
 * @param claudeProjectsDir - Path to Claude projects directory (defaults to ~/.claude/projects)
 * @returns SessionMappingStore instance
 */
export function createSessionMappingStore(
  dbPath?: string | undefined,
  claudeProjectsDir?: string | undefined,
): SessionMappingStore {
  const path = dbPath ?? defaultSessionMappingDbPath();

  // Ensure parent directory exists
  mkdirSync(dirname(path), { recursive: true });

  // Open database
  const db = new Database(path);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_mappings (
      claude_session_id TEXT PRIMARY KEY,
      qraft_ai_session_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: Add source column to existing databases
  try {
    db.exec(
      `ALTER TABLE session_mappings ADD COLUMN source TEXT NOT NULL DEFAULT 'auto'`,
    );
    logger.debug("Added source column via migration");
  } catch (error: unknown) {
    // Column already exists - ignore (duplicate column error is expected)
    logger.debug("Source column already exists or migration failed", {
      error: error instanceof Error ? error.message : "Unknown migration error",
    });
  }

  // Composite index for efficient qraft_ai_session_id lookups with ORDER BY created_at DESC
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qraft_ai_session_id
    ON session_mappings(qraft_ai_session_id, created_at DESC)
  `);

  logger.info("Session mapping store initialized", { dbPath: path });

  return new SessionMappingStoreImpl(db, claudeProjectsDir);
}

/**
 * Create an in-memory session mapping store for testing.
 *
 * @param claudeProjectsDir - Path to Claude projects directory (defaults to ~/.claude/projects)
 * @returns SessionMappingStore instance backed by in-memory database
 */
export function createInMemorySessionMappingStore(
  claudeProjectsDir?: string | undefined,
): SessionMappingStore {
  const db = new Database(":memory:");

  // Enable WAL mode
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_mappings (
      claude_session_id TEXT PRIMARY KEY,
      qraft_ai_session_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Composite index for efficient qraft_ai_session_id lookups with ORDER BY created_at DESC
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qraft_ai_session_id
    ON session_mappings(qraft_ai_session_id, created_at DESC)
  `);

  logger.debug("In-memory session mapping store initialized");

  return new SessionMappingStoreImpl(db, claudeProjectsDir);
}
