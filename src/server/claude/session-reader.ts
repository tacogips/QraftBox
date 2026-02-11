/**
 * Claude Session Reader
 *
 * Reads and filters Claude Code sessions from ~/.claude/projects/
 * Provides methods for listing projects, sessions, and detecting session sources.
 */

import { readdir, readFile, stat } from "fs/promises";
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
import type { SessionMappingStore } from "../ai/session-mapping-store.js";
import { stripSystemTags } from "../../utils/strip-system-tags";
import {
  deriveQraftAiSessionIdFromClaude,
  type ClaudeSessionId,
} from "../../types/ai";
import { SessionReader as AgentSessionReader } from "claude-code-agent/src/sdk/index";
import { createProductionContainer } from "claude-code-agent/src/container";

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
  private readonly mappingStore: SessionMappingStore | undefined;
  private readonly agentSessionReader: AgentSessionReader;

  constructor(
    projectsDir?: string,
    mappingStore?: SessionMappingStore | undefined,
  ) {
    this.projectsDir = projectsDir ?? CLAUDE_PROJECTS_DIR;
    this.mappingStore = mappingStore;
    const container = createProductionContainer();
    this.agentSessionReader = new AgentSessionReader(container);
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

      const projectDir = join(this.projectsDir, entry.name);
      const indexPath = join(projectDir, "sessions-index.json");

      try {
        // Try reading sessions-index.json first
        const index = await this.readSessionIndex(indexPath);
        projects.push({
          path: index.originalPath,
          encoded: entry.name,
          sessionCount: index.entries.length,
          lastModified: this.getLatestModified(index.entries),
        });
      } catch (error: unknown) {
        // If index doesn't exist, try building from JSONL files
        try {
          const projectInfo = await this.buildProjectFromJsonl(
            projectDir,
            entry.name,
          );
          if (projectInfo !== null) {
            projects.push(projectInfo);
          }
        } catch (buildError: unknown) {
          // Skip projects that can't be processed either way
          continue;
        }
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
      const projectDir = join(this.projectsDir, project.encoded);
      const indexPath = join(projectDir, "sessions-index.json");

      try {
        // Try reading from sessions-index.json first
        const index = await this.readSessionIndex(indexPath);

        for (const entry of index.entries) {
          // Strip system tags and fix empty firstPrompt
          await this.fixSystemTagFirstPrompt(entry);

          const extended: ExtendedSessionEntry = {
            ...entry,
            source: await this.detectSource(entry),
            projectEncoded: project.encoded,
            qraftAiSessionId: deriveQraftAiSessionIdFromClaude(
              entry.sessionId as ClaudeSessionId,
            ),
          };

          // Apply additional filters
          if (this.matchesFilters(extended, options)) {
            allSessions.push(extended);
          }
        }
      } catch (error: unknown) {
        // If index doesn't exist, build entries from JSONL files
        try {
          const entries = await this.buildEntriesFromJsonlFiles(
            projectDir,
            project.encoded,
          );

          for (const entry of entries) {
            const extended: ExtendedSessionEntry = {
              ...entry,
              source: await this.detectSource(entry),
              projectEncoded: project.encoded,
              qraftAiSessionId: deriveQraftAiSessionIdFromClaude(
                entry.sessionId as ClaudeSessionId,
              ),
            };

            // Apply additional filters
            if (this.matchesFilters(extended, options)) {
              allSessions.push(extended);
            }
          }
        } catch (buildError: unknown) {
          // Skip projects that can't be processed
          continue;
        }
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
      const projectDir = join(this.projectsDir, project.encoded);
      const indexPath = join(projectDir, "sessions-index.json");

      try {
        // Try reading from sessions-index.json first
        const index = await this.readSessionIndex(indexPath);
        const entry = index.entries.find((e) => e.sessionId === sessionId);

        if (entry) {
          // Strip system tags and fix empty firstPrompt
          await this.fixSystemTagFirstPrompt(entry);

          return {
            ...entry,
            source: await this.detectSource(entry),
            projectEncoded: project.encoded,
            qraftAiSessionId: deriveQraftAiSessionIdFromClaude(
              entry.sessionId as ClaudeSessionId,
            ),
          };
        }
      } catch (error: unknown) {
        // If index doesn't exist, build entries from JSONL files
        try {
          const entries = await this.buildEntriesFromJsonlFiles(
            projectDir,
            project.encoded,
          );
          const entry = entries.find((e) => e.sessionId === sessionId);

          if (entry) {
            return {
              ...entry,
              source: await this.detectSource(entry),
              projectEncoded: project.encoded,
              qraftAiSessionId: deriveQraftAiSessionIdFromClaude(
                entry.sessionId as ClaudeSessionId,
              ),
            };
          }
        } catch (buildError: unknown) {
          // Skip projects that can't be processed
          continue;
        }
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
   * Build project info from JSONL files when sessions-index.json is missing
   */
  private async buildProjectFromJsonl(
    projectDir: string,
    encodedName: string,
  ): Promise<ProjectInfo | null> {
    const dirEntries = await readdir(projectDir, { withFileTypes: true });
    const jsonlFiles = dirEntries.filter(
      (e) => e.isFile() && e.name.endsWith(".jsonl"),
    );

    if (jsonlFiles.length === 0) {
      return null;
    }

    // Decode project path
    const decodedPath = this.decodeProjectPath(encodedName);

    // Get most recent mtime from JSONL files
    let latestMtime = 0;
    for (const file of jsonlFiles) {
      const filePath = join(projectDir, file.name);
      const fileStat = await stat(filePath);
      const mtime = fileStat.mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
      }
    }

    return {
      path: decodedPath,
      encoded: encodedName,
      sessionCount: jsonlFiles.length,
      lastModified: new Date(latestMtime).toISOString(),
    };
  }

  /**
   * Decode encoded project path (e.g., "-g-gits-tacogips-QraftBox" -> "/g/gits/tacogips/QraftBox")
   */
  private decodeProjectPath(encoded: string): string {
    // Encoded format: leading `-` then path separators also `-`
    // e.g., `-g-gits-tacogips-QraftBox` -> `/g/gits/tacogips/QraftBox`
    const decoded = encoded.replace(/-/g, "/");

    // Validate: check if decoded path exists as a directory
    // Use existsSync which is synchronous and safe for this use case
    if (existsSync(decoded)) {
      return decoded;
    }

    // Fallback: return the encoded string if path doesn't exist
    // This handles edge cases where directory names contain hyphens
    return encoded;
  }

  /**
   * Fix firstPrompt that contains only system tags by reading JSONL file
   * to find the first real user prompt.
   *
   * This method:
   * 1. Strips system tags from entry.firstPrompt
   * 2. If the stripped result is empty, reads the JSONL file to find the first real user prompt
   * 3. Updates entry.firstPrompt with the found prompt (already stripped)
   * 4. If no real prompt found, sets firstPrompt to the stripped summary, or keeps it empty
   */
  private async fixSystemTagFirstPrompt(
    entry: ClaudeSessionEntry,
  ): Promise<void> {
    // Strip system tags from firstPrompt
    const strippedFirstPrompt = stripSystemTags(entry.firstPrompt);

    // If stripped prompt is non-empty, update and return
    if (strippedFirstPrompt.length > 0) {
      entry.firstPrompt = strippedFirstPrompt;
      return;
    }

    // firstPrompt is empty after stripping - need to search JSONL file
    const jsonlPath = entry.fullPath;
    if (!existsSync(jsonlPath)) {
      // File doesn't exist, use stripped summary as fallback
      const strippedSummary = stripSystemTags(entry.summary);
      entry.firstPrompt = strippedSummary;
      // Mark as no user prompt if summary is also empty
      if (strippedSummary.length === 0) {
        entry.hasUserPrompt = false;
      }
      return;
    }

    try {
      const fileStat = await stat(jsonlPath);
      const fileSize = fileStat.size;

      // Skip files larger than 10MB to avoid memory issues
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (fileSize > MAX_FILE_SIZE) {
        entry.firstPrompt = "(Large session - content not indexed)";
        entry.hasUserPrompt = false;
        return;
      }

      // Read the file content
      const content = await readFile(jsonlPath, "utf-8");
      const lines = content
        .split("\n")
        .filter((line) => line.trim().length > 0);

      // Search for the first real user message and track assistant activity
      let hasAssistantMessage = false;
      for (const line of lines) {
        try {
          const event: unknown = JSON.parse(line);
          if (typeof event === "object" && event !== null) {
            const obj = event as Record<string, unknown>;

            // Track assistant messages to detect agent-driven sessions
            if (obj["type"] === "assistant") {
              hasAssistantMessage = true;
            }

            if (obj["type"] === "user" && typeof obj["message"] === "object") {
              const message = obj["message"] as Record<string, unknown>;

              // Handle string content
              if (typeof message["content"] === "string") {
                const stripped = stripSystemTags(message["content"]);
                if (stripped.length > 0) {
                  entry.firstPrompt = stripped;
                  return;
                }
              }
              // Handle array content (content blocks)
              else if (Array.isArray(message["content"])) {
                const textBlocks = message["content"].filter(
                  (block: unknown) =>
                    typeof block === "object" &&
                    block !== null &&
                    (block as Record<string, unknown>)["type"] === "text",
                );

                // Concatenate all text blocks
                const allText = textBlocks
                  .map((block) => {
                    const textBlock = block as Record<string, unknown>;
                    return typeof textBlock["text"] === "string"
                      ? textBlock["text"]
                      : "";
                  })
                  .join("\n");

                const stripped = stripSystemTags(allText);
                if (stripped.length > 0) {
                  entry.firstPrompt = stripped;
                  return;
                }
              }
            }
          }
        } catch (error: unknown) {
          // Skip parse errors
          continue;
        }
      }

      // No real user prompt found, use stripped summary as fallback
      const strippedSummary = stripSystemTags(entry.summary);
      entry.firstPrompt =
        strippedSummary.length > 0 ? strippedSummary : "(No user prompt found)";
      // Only mark as empty if there are no assistant messages and no summary
      if (!hasAssistantMessage && strippedSummary.length === 0) {
        entry.hasUserPrompt = false;
      }
    } catch (error: unknown) {
      // Error reading file, use stripped summary as fallback
      const strippedSummary = stripSystemTags(entry.summary);
      entry.firstPrompt =
        strippedSummary.length > 0 ? strippedSummary : "(No user prompt found)";
      entry.hasUserPrompt = false;
    }
  }

  /**
   * Build session entries from JSONL files when sessions-index.json is missing
   */
  private async buildEntriesFromJsonlFiles(
    projectDir: string,
    encodedName: string,
  ): Promise<ClaudeSessionEntry[]> {
    const dirEntries = await readdir(projectDir, { withFileTypes: true });
    const jsonlFiles = dirEntries.filter(
      (e) => e.isFile() && e.name.endsWith(".jsonl"),
    );

    const entries: ClaudeSessionEntry[] = [];
    const decodedPath = this.decodeProjectPath(encodedName);

    for (const file of jsonlFiles) {
      const sessionId = file.name.replace(".jsonl", "");
      const fullPath = join(projectDir, file.name);

      try {
        const entry = await this.buildEntryFromJsonl(
          fullPath,
          sessionId,
          decodedPath,
        );
        if (entry !== null) {
          entries.push(entry);
        }
      } catch (error: unknown) {
        // Skip files that can't be parsed
        continue;
      }
    }

    return entries;
  }

  /**
   * Build a single session entry from a JSONL file
   */
  private async buildEntryFromJsonl(
    jsonlPath: string,
    sessionId: string,
    projectPath: string,
  ): Promise<ClaudeSessionEntry | null> {
    const fileStat = await stat(jsonlPath);
    const fileSize = fileStat.size;

    // Skip files larger than 10MB to avoid memory issues
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (fileSize > MAX_FILE_SIZE) {
      // For large files, use minimal metadata
      return {
        sessionId,
        fullPath: jsonlPath,
        fileMtime: fileStat.mtimeMs,
        firstPrompt: "(Large session - content not indexed)",
        summary: "",
        messageCount: 0,
        created: new Date(fileStat.birthtimeMs).toISOString(),
        modified: new Date(fileStat.mtimeMs).toISOString(),
        gitBranch: "",
        projectPath,
        isSidechain: false,
        hasUserPrompt: false,
      };
    }

    // Read the file content
    const content = await readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return null;
    }

    // Parse first line to get session metadata
    let firstPrompt = "";
    let gitBranch = "";
    let isSidechain = false;
    let created = new Date(fileStat.birthtimeMs).toISOString();

    const firstLine = lines[0];
    if (firstLine !== undefined) {
      try {
        const firstEvent: unknown = JSON.parse(firstLine);
        if (typeof firstEvent === "object" && firstEvent !== null) {
          const obj = firstEvent as Record<string, unknown>;

          // Extract timestamp
          if (typeof obj["timestamp"] === "string") {
            created = obj["timestamp"];
          }

          // Extract git branch
          if (typeof obj["gitBranch"] === "string") {
            gitBranch = obj["gitBranch"];
          }

          // Extract isSidechain
          if (typeof obj["isSidechain"] === "boolean") {
            isSidechain = obj["isSidechain"];
          }

          // Extract first user message (skip if entirely system tags)
          if (obj["type"] === "user" && typeof obj["message"] === "object") {
            const message = obj["message"] as Record<string, unknown>;
            if (typeof message["content"] === "string") {
              const stripped = stripSystemTags(message["content"]);
              if (stripped.length > 0) {
                firstPrompt = stripped;
              }
            } else if (Array.isArray(message["content"])) {
              // Handle array content (e.g., text blocks)
              const textBlocks = message["content"].filter(
                (block: unknown) =>
                  typeof block === "object" &&
                  block !== null &&
                  (block as Record<string, unknown>)["type"] === "text",
              );
              if (textBlocks.length > 0) {
                const firstBlock = textBlocks[0] as Record<string, unknown>;
                if (typeof firstBlock["text"] === "string") {
                  const stripped = stripSystemTags(firstBlock["text"]);
                  if (stripped.length > 0) {
                    firstPrompt = stripped;
                  }
                }
              }
            }
          }
        }
      } catch (error: unknown) {
        // Skip parse errors for first line
      }
    }

    // If first line wasn't a user message (or was entirely system tags),
    // search for the first real user event
    let hasAssistantMessage = false;
    if (firstPrompt === "") {
      for (const line of lines) {
        try {
          const event: unknown = JSON.parse(line);
          if (typeof event === "object" && event !== null) {
            const obj = event as Record<string, unknown>;

            // Track assistant messages to detect agent-driven sessions
            if (obj["type"] === "assistant") {
              hasAssistantMessage = true;
            }

            if (obj["type"] === "user" && typeof obj["message"] === "object") {
              const message = obj["message"] as Record<string, unknown>;
              if (typeof message["content"] === "string") {
                const stripped = stripSystemTags(message["content"]);
                if (stripped.length > 0) {
                  firstPrompt = stripped;
                  break;
                }
              } else if (Array.isArray(message["content"])) {
                const textBlocks = message["content"].filter(
                  (block: unknown) =>
                    typeof block === "object" &&
                    block !== null &&
                    (block as Record<string, unknown>)["type"] === "text",
                );
                if (textBlocks.length > 0) {
                  const firstBlock = textBlocks[0] as Record<string, unknown>;
                  if (typeof firstBlock["text"] === "string") {
                    const stripped = stripSystemTags(firstBlock["text"]);
                    if (stripped.length > 0) {
                      firstPrompt = stripped;
                      break;
                    }
                  }
                }
              }
            }
          }
        } catch (error: unknown) {
          // Skip parse errors
          continue;
        }
      }
    }

    // Parse last lines to find summary
    let summary = "";
    let modified = new Date(fileStat.mtimeMs).toISOString();

    // Search last 20 lines for summary event
    const lastLines = lines.slice(Math.max(0, lines.length - 20));
    for (let i = lastLines.length - 1; i >= 0; i--) {
      const line = lastLines[i];
      if (line === undefined) continue;

      try {
        const event: unknown = JSON.parse(line);
        if (typeof event === "object" && event !== null) {
          const obj = event as Record<string, unknown>;

          // Update modified timestamp from last event
          if (typeof obj["timestamp"] === "string") {
            modified = obj["timestamp"];
          }

          // Look for summary event
          if (obj["type"] === "summary" && typeof obj["summary"] === "string") {
            summary = obj["summary"];
            break;
          }
        }
      } catch (error: unknown) {
        // Skip parse errors
        continue;
      }
    }

    return {
      sessionId,
      fullPath: jsonlPath,
      fileMtime: fileStat.mtimeMs,
      firstPrompt: firstPrompt || "(No user prompt found)",
      summary: stripSystemTags(summary),
      messageCount: lines.length,
      created,
      modified,
      gitBranch,
      projectPath,
      isSidechain,
      hasUserPrompt: firstPrompt.length > 0 || hasAssistantMessage,
    };
  }

  /**
   * Detect session source (qraftbox, claude-cli, or unknown)
   */
  private async detectSource(
    entry: ClaudeSessionEntry,
  ): Promise<SessionSource> {
    // Primary detection: Check SQLite mapping store for qraftbox-created sessions
    if (this.mappingStore !== undefined) {
      try {
        const isQraftBox = this.mappingStore.isQraftBoxSession(
          entry.sessionId as ClaudeSessionId,
        );
        if (isQraftBox) {
          return "qraftbox";
        }
      } catch {
        // Best-effort: continue to fallback detection
      }
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
    // Exclude sessions without user prompts (undefined treated as true for backward compat)
    if (session.hasUserPrompt === false) {
      return false;
    }

    // Source filter
    if (options.source !== undefined && session.source !== options.source) {
      return false;
    }

    // Branch filter
    if (options.branch !== undefined && session.gitBranch !== options.branch) {
      return false;
    }

    // Search filter (case-insensitive, using stripped text)
    if (options.search !== undefined) {
      const searchLower = options.search.toLowerCase();
      const matchesPrompt = stripSystemTags(session.firstPrompt)
        .toLowerCase()
        .includes(searchLower);
      const matchesSummary = stripSystemTags(session.summary)
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

  /**
   * Get session summary with tool usage, tasks, and file modifications
   *
   * @param sessionId - Session ID to get summary for
   * @returns Session summary or null if session not found
   */
  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    const session = await this.getSession(sessionId);
    if (session === null) {
      return null;
    }

    const jsonlPath = session.fullPath;
    if (!existsSync(jsonlPath)) {
      return null;
    }

    const fileStat = await stat(jsonlPath);
    const fileSize = fileStat.size;

    // Skip files larger than 10MB to avoid memory issues
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (fileSize > MAX_FILE_SIZE) {
      // Still fetch usage from library even for large files
      const largeFileUsageResult =
        await this.agentSessionReader.readSessionUsage(sessionId);
      const largeFileUsage = largeFileUsageResult.isOk()
        ? largeFileUsageResult.value
        : undefined;

      return {
        sessionId,
        toolUsage: [],
        tasks: [],
        filesModified: [],
        usage:
          largeFileUsage !== undefined
            ? {
                inputTokens: largeFileUsage.input,
                outputTokens: largeFileUsage.output,
                cacheCreationTokens: largeFileUsage.cacheWrite ?? 0,
                cacheReadTokens: largeFileUsage.cacheRead ?? 0,
              }
            : {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
              },
      };
    }

    const content = await readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    // Track tool usage counts
    const toolCounts = new Map<string, number>();

    // Track tasks with their current status
    const tasksMap = new Map<string, SessionTask>();
    let taskIdCounter = 1;

    // Track unique file modifications
    const filesModifiedSet = new Map<
      string,
      { path: string; tool: "Edit" | "Write" }
    >();

    // Parse each line to extract tool usage and tasks
    for (const line of lines) {
      try {
        const event: unknown = JSON.parse(line);
        if (typeof event !== "object" || event === null) {
          continue;
        }

        const obj = event as Record<string, unknown>;

        // Process assistant events with message.content array
        if (obj["type"] === "assistant" && typeof obj["message"] === "object") {
          const message = obj["message"] as Record<string, unknown>;
          const content = message["content"];

          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === "object" &&
                block !== null &&
                (block as Record<string, unknown>)["type"] === "tool_use"
              ) {
                const toolUse = block as Record<string, unknown>;
                const toolName =
                  typeof toolUse["name"] === "string"
                    ? toolUse["name"]
                    : undefined;
                const toolInput =
                  typeof toolUse["input"] === "object"
                    ? toolUse["input"]
                    : null;

                // Count tool usage
                if (toolName !== undefined) {
                  const currentCount = toolCounts.get(toolName) ?? 0;
                  toolCounts.set(toolName, currentCount + 1);

                  // Extract file paths from Edit and Write tools
                  if (
                    (toolName === "Edit" || toolName === "Write") &&
                    toolInput !== null
                  ) {
                    const input = toolInput as Record<string, unknown>;
                    const filePath =
                      typeof input["file_path"] === "string"
                        ? input["file_path"]
                        : undefined;

                    if (filePath !== undefined) {
                      filesModifiedSet.set(filePath, {
                        path: filePath,
                        tool: toolName,
                      });
                    }
                  }

                  // Extract tasks from TaskCreate
                  if (toolName === "TaskCreate" && toolInput !== null) {
                    const input = toolInput as Record<string, unknown>;
                    const subject =
                      typeof input["subject"] === "string"
                        ? input["subject"]
                        : "";

                    if (subject !== "") {
                      const taskId = `task-${taskIdCounter}`;
                      taskIdCounter++;
                      tasksMap.set(taskId, {
                        id: taskId,
                        subject,
                        status: "pending",
                      });
                    }
                  }

                  // Update task status from TaskUpdate
                  if (toolName === "TaskUpdate" && toolInput !== null) {
                    const input = toolInput as Record<string, unknown>;
                    const taskId =
                      typeof input["taskId"] === "string"
                        ? input["taskId"]
                        : undefined;
                    const status =
                      typeof input["status"] === "string"
                        ? input["status"]
                        : undefined;

                    if (taskId !== undefined && status !== undefined) {
                      const existingTask = tasksMap.get(taskId);
                      if (existingTask !== undefined) {
                        tasksMap.set(taskId, {
                          ...existingTask,
                          status,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error: unknown) {
        // Skip malformed lines
        continue;
      }
    }

    // Get token usage from claude-code-agent library
    const usageResult =
      await this.agentSessionReader.readSessionUsage(sessionId);
    const tokenUsage = usageResult.isOk() ? usageResult.value : undefined;

    // Also check ~/.claude/todos/{sessionId}-agent-*.json files
    const todosDir = join(homedir(), ".claude", "todos");
    if (existsSync(todosDir)) {
      try {
        const todoFiles = await readdir(todosDir);
        const sessionTodoFiles = todoFiles.filter((filename) =>
          filename.startsWith(`${sessionId}-agent-`),
        );

        for (const todoFile of sessionTodoFiles) {
          try {
            const todoPath = join(todosDir, todoFile);
            const todoContent = await readFile(todoPath, "utf-8");
            const todoData: unknown = JSON.parse(todoContent);

            if (Array.isArray(todoData)) {
              for (const task of todoData) {
                if (typeof task === "object" && task !== null) {
                  const taskObj = task as Record<string, unknown>;
                  const id =
                    typeof taskObj["id"] === "string" ? taskObj["id"] : "";
                  const content =
                    typeof taskObj["content"] === "string"
                      ? taskObj["content"]
                      : "";
                  const status =
                    typeof taskObj["status"] === "string"
                      ? taskObj["status"]
                      : "pending";

                  if (id !== "" && content !== "") {
                    // Use content as subject for todo tasks
                    tasksMap.set(id, {
                      id,
                      subject: content,
                      status,
                    });
                  }
                }
              }
            }
          } catch (error: unknown) {
            // Skip files that can't be parsed
            continue;
          }
        }
      } catch (error: unknown) {
        // Skip if todos directory can't be read
      }
    }

    // Convert maps to arrays
    const toolUsage: ToolUsageEntry[] = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const tasks: SessionTask[] = Array.from(tasksMap.values());
    const filesModified: FileModEntry[] = Array.from(filesModifiedSet.values());

    return {
      sessionId,
      toolUsage,
      tasks,
      filesModified,
      usage:
        tokenUsage !== undefined
          ? {
              inputTokens: tokenUsage.input,
              outputTokens: tokenUsage.output,
              cacheCreationTokens: tokenUsage.cacheWrite ?? 0,
              cacheReadTokens: tokenUsage.cacheRead ?? 0,
            }
          : {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
            },
    };
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

/**
 * Tool usage entry extracted from session
 */
export interface ToolUsageEntry {
  readonly name: string;
  readonly count: number;
}

/**
 * Task extracted from session
 */
export interface SessionTask {
  readonly id: string;
  readonly subject: string;
  readonly status: string;
}

/**
 * File modification entry
 */
export interface FileModEntry {
  readonly path: string;
  readonly tool: "Edit" | "Write";
}

/**
 * Token usage data for a session
 */
export interface SessionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
}

/**
 * Session summary with activity details
 */
export interface SessionSummary {
  readonly sessionId: string;
  readonly toolUsage: readonly ToolUsageEntry[];
  readonly tasks: readonly SessionTask[];
  readonly filesModified: readonly FileModEntry[];
  readonly usage: SessionUsage;
}
