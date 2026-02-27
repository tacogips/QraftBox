import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../logger";

const logger = createLogger("AiCommentQueueStore");

export const AI_COMMENT_SIDES = ["old", "new"] as const;
export type AiCommentSide = (typeof AI_COMMENT_SIDES)[number];

export function isAiCommentSide(value: unknown): value is AiCommentSide {
  return (
    typeof value === "string" &&
    (AI_COMMENT_SIDES as readonly string[]).includes(value)
  );
}

export type QueuedAiCommentRecord = {
  readonly id: string;
  readonly projectPath: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly side: AiCommentSide;
  readonly source: "diff" | "current-state" | "full-file";
  readonly prompt: string;
  readonly createdAt: number;
};

export type NewQueuedAiComment = {
  readonly projectPath: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly side: AiCommentSide;
  readonly source: "diff" | "current-state" | "full-file";
  readonly prompt: string;
};

export interface AiCommentQueueStore {
  list(projectPath: string): Promise<readonly QueuedAiCommentRecord[]>;
  add(comment: NewQueuedAiComment): Promise<QueuedAiCommentRecord>;
  updatePrompt(
    projectPath: string,
    id: string,
    prompt: string,
  ): Promise<QueuedAiCommentRecord | null>;
  remove(projectPath: string, id: string): Promise<boolean>;
  clear(projectPath: string): Promise<number>;
}

export interface AiCommentQueueStoreOptions {
  readonly dbPath?: string | undefined;
}

export function defaultAiCommentQueueDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "ai-comment-queue.db");
}

class AiCommentQueueStoreImpl implements AiCommentQueueStore {
  private readonly stmtListByProject: ReturnType<Database["prepare"]>;
  private readonly stmtInsert: ReturnType<Database["prepare"]>;
  private readonly stmtGetById: ReturnType<Database["prepare"]>;
  private readonly stmtUpdatePromptById: ReturnType<Database["prepare"]>;
  private readonly stmtDeleteById: ReturnType<Database["prepare"]>;
  private readonly stmtDeleteByProject: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.stmtListByProject = db.prepare(`
      SELECT
        id,
        project_path,
        file_path,
        start_line,
        end_line,
        side,
        source,
        prompt,
        created_at
      FROM ai_comment_queue
      WHERE project_path = ?
      ORDER BY created_at ASC, id ASC
    `);

    this.stmtInsert = db.prepare(`
      INSERT INTO ai_comment_queue (
        project_path,
        file_path,
        start_line,
        end_line,
        side,
        source,
        prompt,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetById = db.prepare(`
      SELECT
        id,
        project_path,
        file_path,
        start_line,
        end_line,
        side,
        source,
        prompt,
        created_at
      FROM ai_comment_queue
      WHERE project_path = ? AND id = ?
    `);

    this.stmtUpdatePromptById = db.prepare(`
      UPDATE ai_comment_queue
      SET prompt = ?
      WHERE project_path = ? AND id = ?
    `);

    this.stmtDeleteById = db.prepare(`
      DELETE FROM ai_comment_queue
      WHERE project_path = ? AND id = ?
    `);

    this.stmtDeleteByProject = db.prepare(`
      DELETE FROM ai_comment_queue
      WHERE project_path = ?
    `);
  }

  async list(projectPath: string): Promise<readonly QueuedAiCommentRecord[]> {
    const rows = this.stmtListByProject.all(projectPath) as Array<{
      id: number;
      project_path: string;
      file_path: string;
      start_line: number;
      end_line: number;
      side: AiCommentSide;
      source: "diff" | "current-state" | "full-file";
      prompt: string;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: String(row.id),
      projectPath: row.project_path,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      side: row.side,
      source: row.source,
      prompt: row.prompt,
      createdAt: row.created_at,
    }));
  }

  async add(comment: NewQueuedAiComment): Promise<QueuedAiCommentRecord> {
    const createdAt = Date.now();
    const result = this.stmtInsert.run(
      comment.projectPath,
      comment.filePath,
      comment.startLine,
      comment.endLine,
      comment.side,
      comment.source,
      comment.prompt,
      createdAt,
    );

    const insertedId = String(result.lastInsertRowid);
    const row = this.stmtGetById.get(comment.projectPath, insertedId) as
      | {
          id: number;
          project_path: string;
          file_path: string;
          start_line: number;
          end_line: number;
          side: AiCommentSide;
          source: "diff" | "current-state" | "full-file";
          prompt: string;
          created_at: number;
        }
      | undefined;

    if (row === undefined) {
      throw new Error("Failed to persist queued AI comment");
    }

    return {
      id: String(row.id),
      projectPath: row.project_path,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      side: row.side,
      source: row.source,
      prompt: row.prompt,
      createdAt: row.created_at,
    };
  }

  async remove(projectPath: string, id: string): Promise<boolean> {
    const result = this.stmtDeleteById.run(projectPath, id);
    return result.changes > 0;
  }

  async updatePrompt(
    projectPath: string,
    id: string,
    prompt: string,
  ): Promise<QueuedAiCommentRecord | null> {
    const result = this.stmtUpdatePromptById.run(prompt, projectPath, id);
    if (result.changes <= 0) {
      return null;
    }
    const row = this.stmtGetById.get(projectPath, id) as
      | {
          id: number;
          project_path: string;
          file_path: string;
          start_line: number;
          end_line: number;
          side: AiCommentSide;
          source: "diff" | "current-state" | "full-file";
          prompt: string;
          created_at: number;
        }
      | undefined;
    if (row === undefined) {
      return null;
    }
    return {
      id: String(row.id),
      projectPath: row.project_path,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      side: row.side,
      source: row.source,
      prompt: row.prompt,
      createdAt: row.created_at,
    };
  }

  async clear(projectPath: string): Promise<number> {
    const result = this.stmtDeleteByProject.run(projectPath);
    return result.changes;
  }
}

function initializeSchema(db: Database): void {
  db.exec("PRAGMA journal_mode=WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_comment_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      side TEXT NOT NULL,
      source TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_comment_queue_project_created
    ON ai_comment_queue(project_path, created_at ASC, id ASC)
  `);
}

export function createAiCommentQueueStore(
  options?: AiCommentQueueStoreOptions,
): AiCommentQueueStore {
  const dbPath = options?.dbPath ?? defaultAiCommentQueueDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  initializeSchema(db);

  logger.info("AI comment queue store initialized", { dbPath });
  return new AiCommentQueueStoreImpl(db);
}

export function createInMemoryAiCommentQueueStore(): AiCommentQueueStore {
  const db = new Database(":memory:");
  initializeSchema(db);

  logger.debug("In-memory AI comment queue store initialized");
  return new AiCommentQueueStoreImpl(db);
}
