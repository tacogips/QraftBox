/**
 * Claude Session Types
 *
 * Types for Claude Code session browsing, filtering, and management.
 * Sessions are stored in ~/.claude/projects/ with indices and JSONL content.
 */

/**
 * Claude session index structure
 * Read from ~/.claude/projects/{encoded-path}/sessions-index.json
 */
export interface ClaudeSessionIndex {
  /** Index format version */
  version: number;
  /** All session entries for this project */
  entries: ClaudeSessionEntry[];
  /** Original working directory path */
  originalPath: string;
}

/**
 * Individual session entry from sessions-index.json
 */
export interface ClaudeSessionEntry {
  /** Unique session identifier (UUID) */
  sessionId: string;
  /** Full path to session .jsonl file */
  fullPath: string;
  /** File modification time (Unix milliseconds) */
  fileMtime: number;
  /** First user prompt in session */
  firstPrompt: string;
  /** AI-generated session summary */
  summary: string;
  /** Total number of messages */
  messageCount: number;
  /** Session creation timestamp (ISO 8601) */
  created: string;
  /** Session modification timestamp (ISO 8601) */
  modified: string;
  /** Git branch at session creation */
  gitBranch: string;
  /** Working directory path */
  projectPath: string;
  /** Whether this is a sidechain session */
  isSidechain: boolean;
  /** Whether the session contains at least one real user prompt (undefined for backward compatibility) */
  hasUserPrompt?: boolean;
}

/**
 * Session source identifier
 * - qraftbox: Created by qraftbox
 * - claude-cli: Created by Claude CLI directly
 * - unknown: Cannot determine source
 */
export type SessionSource = "qraftbox" | "claude-cli" | "unknown";

/**
 * Extended session entry with source tracking
 */
export interface ExtendedSessionEntry extends ClaudeSessionEntry {
  /** How this session was created */
  source: SessionSource;
  /** Encoded project directory name (path with / replaced by -) */
  projectEncoded: string;
}

/**
 * Filter criteria for session listing
 */
export interface SessionFilters {
  /** Filter by working directory prefix (e.g., "/g/gits/tacogips") */
  workingDirectoryPrefix?: string;
  /** Filter by session source */
  source?: SessionSource;
  /** Filter by git branch name */
  branch?: string;
  /** Search in firstPrompt and summary */
  searchQuery?: string;
  /** Filter by date range */
  dateRange?: {
    /** Start date (ISO 8601) */
    from?: string;
    /** End date (ISO 8601) */
    to?: string;
  };
}

/**
 * Paginated session list response
 */
export interface SessionListResponse {
  /** Session entries for current page */
  sessions: ExtendedSessionEntry[];
  /** Total matching sessions (before pagination) */
  total: number;
  /** Current offset */
  offset: number;
  /** Page size limit */
  limit: number;
}

/**
 * Project information with session count
 */
export interface ProjectInfo {
  /** Original working directory path */
  path: string;
  /** Encoded directory name (used in ~/.claude/projects/) */
  encoded: string;
  /** Number of sessions in this project */
  sessionCount: number;
  /** Most recent session modification timestamp (ISO 8601) */
  lastModified: string;
}

/**
 * Type guard for ClaudeSessionIndex
 */
export function isClaudeSessionIndex(
  value: unknown,
): value is ClaudeSessionIndex {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj["version"] === "number" &&
    Array.isArray(obj["entries"]) &&
    typeof obj["originalPath"] === "string"
  );
}

/**
 * Type guard for ClaudeSessionEntry
 */
export function isClaudeSessionEntry(
  value: unknown,
): value is ClaudeSessionEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj["sessionId"] === "string" &&
    typeof obj["fullPath"] === "string" &&
    typeof obj["fileMtime"] === "number" &&
    typeof obj["firstPrompt"] === "string" &&
    typeof obj["summary"] === "string" &&
    typeof obj["messageCount"] === "number" &&
    typeof obj["created"] === "string" &&
    typeof obj["modified"] === "string" &&
    typeof obj["gitBranch"] === "string" &&
    typeof obj["projectPath"] === "string" &&
    typeof obj["isSidechain"] === "boolean" &&
    // hasUserPrompt is optional for backward compatibility with existing index files
    (typeof obj["hasUserPrompt"] === "boolean" ||
      obj["hasUserPrompt"] === undefined)
  );
}

/**
 * Type guard for SessionSource
 */
export function isSessionSource(value: unknown): value is SessionSource {
  return value === "qraftbox" || value === "claude-cli" || value === "unknown";
}

/**
 * Type guard for ExtendedSessionEntry
 */
export function isExtendedSessionEntry(
  value: unknown,
): value is ExtendedSessionEntry {
  if (!isClaudeSessionEntry(value)) {
    return false;
  }

  const obj = value as unknown as Record<string, unknown>;

  return (
    isSessionSource(obj["source"]) && typeof obj["projectEncoded"] === "string"
  );
}
