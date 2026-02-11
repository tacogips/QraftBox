/**
 * AI Session Store
 *
 * SQLite-backed persistent store for AI session metadata.
 * Session metadata is stored in SQLite while runtime handles
 * (listeners, SDK objects) remain in memory.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  QraftAiSessionId,
  ClaudeSessionId,
  SessionState,
  AISessionInfo,
  PromptId,
  WorktreeId,
} from "../../types/ai.js";
import { createLogger } from "../logger.js";

const logger = createLogger("AiSessionStore");

/**
 * AI session row stored in SQLite (operational state only)
 */
export interface AiSessionRow {
  readonly id: QraftAiSessionId;
  readonly state: SessionState;
  readonly projectPath: string;
  readonly createdAt: string; // ISO string
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly currentActivity?: string | undefined;
  readonly currentClaudeSessionId?: ClaudeSessionId | undefined;
  readonly promptId?: PromptId | undefined;
  readonly worktreeId?: WorktreeId | undefined;
  readonly message?: string | undefined; // truncated prompt for display
  readonly error?: string | undefined;
  readonly clientSessionId?: QraftAiSessionId | undefined; // client-generated group ID
}

/**
 * AI session store interface
 */
export interface AiSessionStore {
  /** Insert a new session */
  insert(row: AiSessionRow): void;
  /** Get session by ID, returns undefined if not found */
  get(id: QraftAiSessionId): AiSessionRow | undefined;
  /** List all sessions */
  list(): readonly AiSessionRow[];
  /** List sessions with a specific state */
  listByState(state: SessionState): readonly AiSessionRow[];
  /** Update session state and optionally timestamps */
  updateState(
    id: QraftAiSessionId,
    state: SessionState,
    opts?: { startedAt?: string | undefined; completedAt?: string | undefined },
  ): void;
  /** Update current Claude session ID */
  updateClaudeSessionId(
    id: QraftAiSessionId,
    claudeSessionId: ClaudeSessionId,
  ): void;
  /** Update current activity */
  updateActivity(id: QraftAiSessionId, activity: string | undefined): void;
  /** Update error message */
  updateError(id: QraftAiSessionId, error: string | undefined): void;
  /** Find session by prompt ID */
  findByPromptId(promptId: PromptId): AiSessionRow | undefined;
  /** List prompt queue entries (sessions with prompt_id), optionally filtered by worktreeId */
  listPromptQueue(worktreeId?: WorktreeId): readonly AiSessionRow[];
  /** Find most recent completed/failed session's claude ID for a client session group */
  findResumeByClientSessionId(
    clientSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined;
  /** Find most recent completed/failed session's claude ID for a worktree */
  findResumeByWorktreeId(worktreeId: WorktreeId): ClaudeSessionId | undefined;
  /** Delete session by ID */
  delete(id: QraftAiSessionId): void;
  /** Delete sessions completed before maxAgeMs ago */
  cleanup(maxAgeMs: number): number;
  /** Count sessions by state */
  countByState(state: SessionState): number;
  /** Get next queued session (oldest by created_at) */
  nextQueued(): QraftAiSessionId | undefined;
}

/**
 * Convert AiSessionRow to AISessionInfo (with empty defaults for content fields)
 */
export function toSessionInfo(row: AiSessionRow): AISessionInfo {
  return {
    id: row.id,
    state: row.state,
    prompt: row.message ?? "",
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    context: { references: [] },
    lastAssistantMessage: undefined,
    currentActivity: row.currentActivity,
    claudeSessionId: row.currentClaudeSessionId,
  };
}

/**
 * Default database path
 */
export function defaultAiSessionDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "ai-sessions.db");
}

/**
 * Internal implementation of AiSessionStore
 */
class AiSessionStoreImpl implements AiSessionStore {
  private readonly db: Database;
  private readonly stmtInsert: ReturnType<Database["prepare"]>;
  private readonly stmtGet: ReturnType<Database["prepare"]>;
  private readonly stmtListAll: ReturnType<Database["prepare"]>;
  private readonly stmtListByState: ReturnType<Database["prepare"]>;
  private readonly stmtUpdateState: ReturnType<Database["prepare"]>;
  private readonly stmtUpdateStateWithTimestamps: ReturnType<
    Database["prepare"]
  >;
  private readonly stmtUpdateClaudeSessionId: ReturnType<Database["prepare"]>;
  private readonly stmtUpdateActivity: ReturnType<Database["prepare"]>;
  private readonly stmtUpdateError: ReturnType<Database["prepare"]>;
  private readonly stmtFindByPromptId: ReturnType<Database["prepare"]>;
  private readonly stmtListPromptQueue: ReturnType<Database["prepare"]>;
  private readonly stmtListPromptQueueByWorktree: ReturnType<
    Database["prepare"]
  >;
  private readonly stmtFindResumeByClientSessionId: ReturnType<
    Database["prepare"]
  >;
  private readonly stmtFindResumeByWorktreeId: ReturnType<Database["prepare"]>;
  private readonly stmtDelete: ReturnType<Database["prepare"]>;
  private readonly stmtCountByState: ReturnType<Database["prepare"]>;
  private readonly stmtNextQueued: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements upfront
    this.stmtInsert = db.prepare(`
      INSERT INTO ai_sessions (
        id, state, project_path,
        created_at, started_at, completed_at,
        current_activity, current_claude_session_id,
        prompt_id, worktree_id, message, error, client_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGet = db.prepare(`
      SELECT * FROM ai_sessions WHERE id = ?
    `);

    this.stmtListAll = db.prepare(`
      SELECT * FROM ai_sessions ORDER BY created_at DESC
    `);

    this.stmtListByState = db.prepare(`
      SELECT * FROM ai_sessions WHERE state = ? ORDER BY created_at DESC
    `);

    this.stmtUpdateState = db.prepare(`
      UPDATE ai_sessions SET state = ? WHERE id = ?
    `);

    this.stmtUpdateStateWithTimestamps = db.prepare(`
      UPDATE ai_sessions
      SET state = ?, started_at = ?, completed_at = ?
      WHERE id = ?
    `);

    this.stmtUpdateClaudeSessionId = db.prepare(`
      UPDATE ai_sessions SET current_claude_session_id = ? WHERE id = ?
    `);

    this.stmtUpdateActivity = db.prepare(`
      UPDATE ai_sessions SET current_activity = ? WHERE id = ?
    `);

    this.stmtUpdateError = db.prepare(`
      UPDATE ai_sessions SET error = ? WHERE id = ?
    `);

    this.stmtFindByPromptId = db.prepare(`
      SELECT * FROM ai_sessions WHERE prompt_id = ? LIMIT 1
    `);

    this.stmtListPromptQueue = db.prepare(`
      SELECT * FROM ai_sessions
      WHERE prompt_id IS NOT NULL
      ORDER BY created_at DESC
    `);

    this.stmtListPromptQueueByWorktree = db.prepare(`
      SELECT * FROM ai_sessions
      WHERE prompt_id IS NOT NULL AND worktree_id = ?
      ORDER BY created_at DESC
    `);

    this.stmtFindResumeByClientSessionId = db.prepare(`
      SELECT current_claude_session_id FROM ai_sessions
      WHERE client_session_id = ?
        AND current_claude_session_id IS NOT NULL
        AND current_claude_session_id != ''
      ORDER BY created_at DESC
      LIMIT 1
    `);

    this.stmtFindResumeByWorktreeId = db.prepare(`
      SELECT current_claude_session_id FROM ai_sessions
      WHERE worktree_id = ?
        AND current_claude_session_id IS NOT NULL
        AND current_claude_session_id != ''
      ORDER BY created_at DESC
      LIMIT 1
    `);

    this.stmtDelete = db.prepare(`
      DELETE FROM ai_sessions WHERE id = ?
    `);

    this.stmtCountByState = db.prepare(`
      SELECT COUNT(*) as count FROM ai_sessions WHERE state = ?
    `);

    this.stmtNextQueued = db.prepare(`
      SELECT id FROM ai_sessions
      WHERE state = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
    `);
  }

  insert(row: AiSessionRow): void {
    this.stmtInsert.run(
      row.id,
      row.state,
      row.projectPath,
      row.createdAt,
      row.startedAt ?? null,
      row.completedAt ?? null,
      row.currentActivity ?? null,
      row.currentClaudeSessionId ?? null,
      row.promptId ?? null,
      row.worktreeId ?? null,
      row.message ?? null,
      row.error ?? null,
      row.clientSessionId ?? null,
    );
    logger.debug("Inserted session", { id: row.id, state: row.state });
  }

  get(id: QraftAiSessionId): AiSessionRow | undefined {
    const row = this.stmtGet.get(id) as
      | {
          id: QraftAiSessionId;
          state: SessionState;
          project_path: string;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          current_activity: string | null;
          current_claude_session_id: ClaudeSessionId | null;
          prompt_id: string | null;
          worktree_id: string | null;
          message: string | null;
          error: string | null;
          client_session_id: string | null;
        }
      | undefined
      | null;

    if (row === undefined || row === null) {
      return undefined;
    }

    return this.mapRowToSession(row);
  }

  list(): readonly AiSessionRow[] {
    const rows = this.stmtListAll.all() as Array<{
      id: QraftAiSessionId;
      state: SessionState;
      project_path: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
      current_activity: string | null;
      current_claude_session_id: ClaudeSessionId | null;
      prompt_id: string | null;
      worktree_id: string | null;
      message: string | null;
      error: string | null;
      client_session_id: string | null;
    }>;

    return rows.map((row) => this.mapRowToSession(row));
  }

  listByState(state: SessionState): readonly AiSessionRow[] {
    const rows = this.stmtListByState.all(state) as Array<{
      id: QraftAiSessionId;
      state: SessionState;
      project_path: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
      current_activity: string | null;
      current_claude_session_id: ClaudeSessionId | null;
      prompt_id: string | null;
      worktree_id: string | null;
      message: string | null;
      error: string | null;
      client_session_id: string | null;
    }>;

    return rows.map((row) => this.mapRowToSession(row));
  }

  updateState(
    id: QraftAiSessionId,
    state: SessionState,
    opts?: {
      startedAt?: string | undefined;
      completedAt?: string | undefined;
    },
  ): void {
    if (
      opts !== undefined &&
      (opts.startedAt !== undefined || opts.completedAt !== undefined)
    ) {
      this.stmtUpdateStateWithTimestamps.run(
        state,
        opts.startedAt ?? null,
        opts.completedAt ?? null,
        id,
      );
    } else {
      this.stmtUpdateState.run(state, id);
    }
    logger.debug("Updated session state", { id, state });
  }

  updateClaudeSessionId(
    id: QraftAiSessionId,
    claudeSessionId: ClaudeSessionId,
  ): void {
    this.stmtUpdateClaudeSessionId.run(claudeSessionId, id);
    logger.debug("Updated Claude session ID", { id, claudeSessionId });
  }

  updateActivity(id: QraftAiSessionId, activity: string | undefined): void {
    this.stmtUpdateActivity.run(activity ?? null, id);
  }

  delete(id: QraftAiSessionId): void {
    this.stmtDelete.run(id);
    logger.debug("Deleted session", { id });
  }

  cleanup(maxAgeMs: number): number {
    const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString();
    const result = this.db
      .prepare(
        `
      DELETE FROM ai_sessions
      WHERE (state = 'completed' OR state = 'failed' OR state = 'cancelled')
        AND created_at < ?
    `,
      )
      .run(cutoffTime);

    const deletedCount = result.changes;
    if (deletedCount > 0) {
      logger.info("Cleaned up sessions", { deletedCount, cutoffTime });
    }
    return deletedCount;
  }

  countByState(state: SessionState): number {
    const row = this.stmtCountByState.get(state) as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  }

  nextQueued(): QraftAiSessionId | undefined {
    const row = this.stmtNextQueued.get() as
      | { id: QraftAiSessionId }
      | undefined;
    return row?.id;
  }

  updateError(id: QraftAiSessionId, error: string | undefined): void {
    this.stmtUpdateError.run(error ?? null, id);
  }

  findByPromptId(promptId: PromptId): AiSessionRow | undefined {
    const row = this.stmtFindByPromptId.get(promptId) as
      | {
          id: QraftAiSessionId;
          state: SessionState;
          project_path: string;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          current_activity: string | null;
          current_claude_session_id: ClaudeSessionId | null;
          prompt_id: string | null;
          worktree_id: string | null;
          message: string | null;
          error: string | null;
          client_session_id: string | null;
        }
      | undefined
      | null;
    if (row === undefined || row === null) return undefined;
    return this.mapRowToSession(row);
  }

  listPromptQueue(worktreeId?: WorktreeId): readonly AiSessionRow[] {
    if (worktreeId !== undefined) {
      const rows = this.stmtListPromptQueueByWorktree.all(worktreeId) as Array<{
        id: QraftAiSessionId;
        state: SessionState;
        project_path: string;
        created_at: string;
        started_at: string | null;
        completed_at: string | null;
        current_activity: string | null;
        current_claude_session_id: ClaudeSessionId | null;
        prompt_id: string | null;
        worktree_id: string | null;
        message: string | null;
        error: string | null;
        client_session_id: string | null;
      }>;
      return rows.map((row) => this.mapRowToSession(row));
    }
    const rows = this.stmtListPromptQueue.all() as Array<{
      id: QraftAiSessionId;
      state: SessionState;
      project_path: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
      current_activity: string | null;
      current_claude_session_id: ClaudeSessionId | null;
      prompt_id: string | null;
      worktree_id: string | null;
      message: string | null;
      error: string | null;
      client_session_id: string | null;
    }>;
    return rows.map((row) => this.mapRowToSession(row));
  }

  findResumeByClientSessionId(
    clientSessionId: QraftAiSessionId,
  ): ClaudeSessionId | undefined {
    const row = this.stmtFindResumeByClientSessionId.get(clientSessionId) as
      | { current_claude_session_id: string }
      | undefined
      | null;
    if (row === undefined || row === null) return undefined;
    return row.current_claude_session_id as ClaudeSessionId;
  }

  findResumeByWorktreeId(worktreeId: WorktreeId): ClaudeSessionId | undefined {
    const row = this.stmtFindResumeByWorktreeId.get(worktreeId) as
      | { current_claude_session_id: string }
      | undefined
      | null;
    if (row === undefined || row === null) return undefined;
    return row.current_claude_session_id as ClaudeSessionId;
  }

  /**
   * Map database row to AiSessionRow
   */
  private mapRowToSession(row: {
    id: QraftAiSessionId;
    state: SessionState;
    project_path: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    current_activity: string | null;
    current_claude_session_id: ClaudeSessionId | null;
    prompt_id: string | null;
    worktree_id: string | null;
    message: string | null;
    error: string | null;
    client_session_id: string | null;
  }): AiSessionRow {
    return {
      id: row.id,
      state: row.state,
      projectPath: row.project_path,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      currentActivity: row.current_activity ?? undefined,
      currentClaudeSessionId: row.current_claude_session_id ?? undefined,
      promptId: (row.prompt_id ?? undefined) as PromptId | undefined,
      worktreeId: (row.worktree_id ?? undefined) as WorktreeId | undefined,
      message: row.message ?? undefined,
      error: row.error ?? undefined,
      clientSessionId: (row.client_session_id ?? undefined) as
        | QraftAiSessionId
        | undefined,
    };
  }
}

/**
 * Create an AI session store with the specified database path.
 *
 * @param dbPath - Path to the SQLite database file (defaults to ~/.local/QraftBox/ai-sessions.db)
 * @returns AiSessionStore instance
 */
export function createAiSessionStore(
  dbPath?: string | undefined,
): AiSessionStore {
  const path = dbPath ?? defaultAiSessionDbPath();

  // Ensure parent directory exists
  mkdirSync(dirname(path), { recursive: true });

  // Open database
  const db = new Database(path);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'queued',
      project_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      current_activity TEXT,
      current_claude_session_id TEXT,
      prompt_id TEXT,
      worktree_id TEXT,
      message TEXT,
      error TEXT,
      client_session_id TEXT
    )
  `);

  // Create index for state-based queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_state ON ai_sessions(state)
  `);

  // Create index for prompt_id lookup
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_prompt_id ON ai_sessions(prompt_id)
  `);

  // Create index for worktree_id + state queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_worktree_id ON ai_sessions(worktree_id, state)
  `);

  // Create index for client_session_id lookup
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_client_session_id ON ai_sessions(client_session_id)
  `);

  // Migration: Add prompt queue columns to existing databases
  for (const columnDef of [
    "prompt_id TEXT",
    "worktree_id TEXT",
    "message TEXT",
    "error TEXT",
    "client_session_id TEXT",
  ]) {
    try {
      db.exec(`ALTER TABLE ai_sessions ADD COLUMN ${columnDef}`);
    } catch {
      // Column already exists - ignore
    }
  }

  logger.info("AI session store initialized", { dbPath: path });

  return new AiSessionStoreImpl(db);
}

/**
 * Create an in-memory AI session store for testing.
 *
 * @returns AiSessionStore instance backed by in-memory database
 */
export function createInMemoryAiSessionStore(): AiSessionStore {
  const db = new Database(":memory:");

  // Enable WAL mode
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'queued',
      project_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      current_activity TEXT,
      current_claude_session_id TEXT,
      prompt_id TEXT,
      worktree_id TEXT,
      message TEXT,
      error TEXT,
      client_session_id TEXT
    )
  `);

  // Create index for state-based queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_state ON ai_sessions(state)
  `);

  // Create index for prompt_id lookup
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_prompt_id ON ai_sessions(prompt_id)
  `);

  // Create index for worktree_id + state queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_worktree_id ON ai_sessions(worktree_id, state)
  `);

  // Create index for client_session_id lookup
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_client_session_id ON ai_sessions(client_session_id)
  `);

  logger.debug("In-memory AI session store initialized");

  return new AiSessionStoreImpl(db);
}
