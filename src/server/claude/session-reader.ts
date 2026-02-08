/**
 * Claude Session Reader
 *
 * Reads and filters Claude Code sessions from ~/.claude/projects/
 * Provides methods for listing projects, sessions, and detecting session sources.
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import type {
  ClaudeSessionIndex,
  ClaudeSessionEntry,
  ExtendedSessionEntry,
  SessionSource,
  SessionListResponse,
  ProjectInfo,
} from "../../types/claude-session";
import {
  isClaudeSessionIndex,
  isClaudeSessionEntry,
} from "../../types/claude-session";
import { SessionRegistry } from "./session-registry";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

/**
 * Options for listing sessions
 */
export interface ListSessionsOptions {
  /** Filter by working directory prefix */
  workingDirectoryPrefix?: string;
  /** Filter by session source */
  source?: SessionSource;
  /** Filter by git branch */
  branch?: string;
  /** Search query for firstPrompt and summary */
  search?: string;
  /** Date range filter */
  dateRange?: {
    from?: string;
    to?: string;
  };
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
  /** Sort field */
  sortBy?: "modified" | "created";
  /** Sort order */
  sortOrder?: "asc" | "desc";
}

/**
 * ClaudeSessionReader reads and filters Claude Code sessions
 */
export class ClaudeSessionReader {
  private readonly projectsDir: string;
  private readonly sessionRegistry: SessionRegistry;

  constructor(projectsDir?: string, sessionRegistry?: SessionRegistry) {
    this.projectsDir = projectsDir ?? CLAUDE_PROJECTS_DIR;
    this.sessionRegistry = sessionRegistry ?? new SessionRegistry();
  }

  /**
   * List all Claude projects with session metadata
   */
  async listProjects(): Promise<ProjectInfo[]> {
    if (!existsSync(this.projectsDir)) {
      return [];
    }

    const entries = await readdir(this.projectsDir, { withFileTypes: true });
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const indexPath = join(
        this.projectsDir,
        entry.name,
        "sessions-index.json",
      );

      try {
        const index = await this.readSessionIndex(indexPath);
        projects.push({
          path: index.originalPath,
          encoded: entry.name,
          sessionCount: index.entries.length,
          lastModified: this.getLatestModified(index.entries),
        });
      } catch (error: unknown) {
        // Skip projects without valid index or with read errors
        // Silently continue to allow partial results
        continue;
      }
    }

    return projects;
  }

  /**
   * List sessions with filtering and pagination
   */
  async listSessions(
    options: ListSessionsOptions = {},
  ): Promise<SessionListResponse> {
    const allSessions: ExtendedSessionEntry[] = [];
    const projects = await this.listProjects();

    // Filter projects by working directory prefix if specified
    const filteredProjects = options.workingDirectoryPrefix
      ? projects.filter((p) =>
          p.path.startsWith(options.workingDirectoryPrefix!),
        )
      : projects;

    // Read sessions from filtered projects
    for (const project of filteredProjects) {
      const indexPath = join(
        this.projectsDir,
        project.encoded,
        "sessions-index.json",
      );

      try {
        const index = await this.readSessionIndex(indexPath);

        for (const entry of index.entries) {
          const extended: ExtendedSessionEntry = {
            ...entry,
            source: await this.detectSource(entry),
            projectEncoded: project.encoded,
          };

          // Apply additional filters
          if (this.matchesFilters(extended, options)) {
            allSessions.push(extended);
          }
        }
      } catch (error: unknown) {
        // Skip projects with corrupted indices
        continue;
      }
    }

    // Sort sessions
    allSessions.sort((a, b) => {
      const field = options.sortBy ?? "modified";
      const order = options.sortOrder === "asc" ? 1 : -1;
      const aTime = new Date(a[field]).getTime();
      const bTime = new Date(b[field]).getTime();
      return order * (aTime - bTime);
    });

    // Paginate
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    const paginated = allSessions.slice(offset, offset + limit);

    return {
      sessions: paginated,
      total: allSessions.length,
      offset,
      limit,
    };
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<ExtendedSessionEntry | null> {
    const projects = await this.listProjects();

    for (const project of projects) {
      const indexPath = join(
        this.projectsDir,
        project.encoded,
        "sessions-index.json",
      );

      try {
        const index = await this.readSessionIndex(indexPath);
        const entry = index.entries.find((e) => e.sessionId === sessionId);

        if (entry) {
          return {
            ...entry,
            source: await this.detectSource(entry),
            projectEncoded: project.encoded,
          };
        }
      } catch (error: unknown) {
        // Skip projects with errors
        continue;
      }
    }

    return null;
  }

  /**
   * Read and validate a session index file
   */
  private async readSessionIndex(path: string): Promise<ClaudeSessionIndex> {
    if (!existsSync(path)) {
      throw new Error(`Session index not found: ${path}`);
    }

    const content = await readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(content);

    // Validate structure
    if (!isClaudeSessionIndex(parsed)) {
      throw new Error(`Invalid session index format: ${path}`);
    }

    // Validate entries
    for (const entry of parsed.entries) {
      if (!isClaudeSessionEntry(entry)) {
        throw new Error(`Invalid session entry in index: ${path}`);
      }
    }

    return parsed;
  }

  /**
   * Detect session source (qraftbox, claude-cli, or unknown)
   */
  private async detectSource(
    entry: ClaudeSessionEntry,
  ): Promise<SessionSource> {
    // Primary detection: Check qraftbox session registry
    const isQraftBox = await this.sessionRegistry.isQraftBoxSession(
      entry.sessionId,
    );
    if (isQraftBox) {
      return "qraftbox";
    }

    // Fallback detection: Pattern matching for qraftbox context markers
    const prompt = entry.firstPrompt.toLowerCase();
    if (
      prompt.includes("[qraftbox-context]") ||
      prompt.includes("context from qraftbox:") ||
      prompt.includes("qraftbox session")
    ) {
      return "qraftbox";
    }

    // Default to claude-cli for sessions without qraftbox markers
    return "claude-cli";
  }

  /**
   * Check if a session matches the provided filters
   */
  private matchesFilters(
    session: ExtendedSessionEntry,
    options: ListSessionsOptions,
  ): boolean {
    // Source filter
    if (options.source !== undefined && session.source !== options.source) {
      return false;
    }

    // Branch filter
    if (options.branch !== undefined && session.gitBranch !== options.branch) {
      return false;
    }

    // Search filter (case-insensitive)
    if (options.search !== undefined) {
      const searchLower = options.search.toLowerCase();
      const matchesPrompt = session.firstPrompt
        .toLowerCase()
        .includes(searchLower);
      const matchesSummary = session.summary
        .toLowerCase()
        .includes(searchLower);

      if (!matchesPrompt && !matchesSummary) {
        return false;
      }
    }

    // Date range filter
    if (options.dateRange !== undefined) {
      const modified = new Date(session.modified);

      if (options.dateRange.from !== undefined) {
        const from = new Date(options.dateRange.from);
        if (modified < from) {
          return false;
        }
      }

      if (options.dateRange.to !== undefined) {
        const to = new Date(options.dateRange.to);
        if (modified > to) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Read transcript events from a session JSONL file
   *
   * @param sessionId - Session ID to read transcript from
   * @param offset - Number of events to skip (default: 0)
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Array of transcript events with pagination metadata
   */
  async readTranscript(
    sessionId: string,
    offset: number = 0,
    limit: number = 100,
  ): Promise<{ events: TranscriptEvent[]; total: number } | null> {
    const session = await this.getSession(sessionId);
    if (session === null) {
      return null;
    }

    const jsonlPath = session.fullPath;
    if (!existsSync(jsonlPath)) {
      throw new Error(`Transcript file not found: ${jsonlPath}`);
    }

    const content = await readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    const events: TranscriptEvent[] = [];
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed === "object" && parsed !== null) {
          const obj = parsed as Record<string, unknown>;
          events.push({
            type: typeof obj["type"] === "string" ? obj["type"] : "unknown",
            uuid: typeof obj["uuid"] === "string" ? obj["uuid"] : undefined,
            timestamp:
              typeof obj["timestamp"] === "string"
                ? obj["timestamp"]
                : undefined,
            content: obj["content"],
            raw: parsed as object,
          });
        }
      } catch (error: unknown) {
        // Skip malformed lines
        continue;
      }
    }

    // Apply pagination
    const total = events.length;
    const paginated = events.slice(offset, offset + limit);

    return { events: paginated, total };
  }

  /**
   * Get the latest modification timestamp from session entries
   */
  private getLatestModified(entries: ClaudeSessionEntry[]): string {
    if (entries.length === 0) {
      return new Date().toISOString();
    }

    const latest = entries.reduce((max, entry) => {
      const entryTime = new Date(entry.modified).getTime();
      const maxTime = new Date(max.modified).getTime();
      return entryTime > maxTime ? entry : max;
    });

    return latest.modified;
  }
}

/**
 * Transcript event structure (simplified)
 */
export interface TranscriptEvent {
  readonly type: string;
  readonly uuid?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly content?: unknown;
  readonly raw: object;
}
