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
import {
  hasQraftboxInternalPrompt,
  isInjectedSessionSystemPrompt,
  stripSystemTags,
} from "../../utils/strip-system-tags";
import {
  deriveQraftAiSessionIdFromClaude,
  type ClaudeSessionId,
  type QraftAiSessionId,
} from "../../types/ai";
import { AIAgent } from "../../types/ai-agent";
import { SessionReader as AgentSessionReader } from "claude-code-agent/src/sdk/index";
import { createProductionContainer } from "claude-code-agent/src/container";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");
const MAX_SESSION_INDEX_SIZE = 10 * 1024 * 1024; // 10MB
const LEGACY_INTERNAL_PURPOSE_PREFIX =
  "You summarize a coding session's current objective.";

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
  private readonly codexSessionsDir: string;
  private readonly mappingStore: SessionMappingStore | undefined;
  private readonly agentSessionReader: AgentSessionReader;

  constructor(
    projectsDir?: string,
    mappingStore?: SessionMappingStore | undefined,
    codexSessionsDir?: string,
  ) {
    this.projectsDir = projectsDir ?? CLAUDE_PROJECTS_DIR;
    this.codexSessionsDir = codexSessionsDir ?? CODEX_SESSIONS_DIR;
    this.mappingStore = mappingStore;
    const container = createProductionContainer();
    this.agentSessionReader = new AgentSessionReader(container);
  }

  private isInternalSessionPrompt(text: string): boolean {
    if (hasQraftboxInternalPrompt(text)) {
      return true;
    }
    const stripped = stripSystemTags(text);
    return stripped.startsWith(LEGACY_INTERNAL_PURPOSE_PREFIX);
  }

  /**
   * Encode an absolute path into Claude project directory naming style.
   * Example: "/g/learning-contents" -> "-g-learning-contents"
   */
  private encodeProjectPath(path: string): string {
    return path.replace(/\//g, "-");
  }

  /**
   * List all Claude projects with session metadata
   *
   * @param pathFilter - Optional path prefix to filter projects (e.g., "/g/gits/tacogips")
   */
  async listProjects(pathFilter?: string): Promise<ProjectInfo[]> {
    if (!existsSync(this.projectsDir)) {
      return [];
    }

    const entries = await readdir(this.projectsDir, { withFileTypes: true });
    const projects: ProjectInfo[] = [];
    const encodedPathFilter =
      pathFilter !== undefined ? this.encodeProjectPath(pathFilter) : undefined;

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      // Early filtering: avoid scanning unrelated project directories.
      // Match either encoded directory prefix or simple decoded prefix.
      if (pathFilter !== undefined) {
        const simpleDecoded = entry.name.replace(/-/g, "/");
        const matchesEncodedPrefix =
          encodedPathFilter !== undefined &&
          entry.name.startsWith(encodedPathFilter);
        const matchesSimpleDecodedPrefix = simpleDecoded.startsWith(pathFilter);

        if (!matchesEncodedPrefix && !matchesSimpleDecodedPrefix) {
          continue;
        }
      }

      const projectDir = join(this.projectsDir, entry.name);
      const indexPath = join(projectDir, "sessions-index.json");

      let projectInfo: ProjectInfo | null = null;

      try {
        // Try reading sessions-index.json first
        const index = await this.readSessionIndex(indexPath);
        projectInfo = {
          path: index.originalPath,
          encoded: entry.name,
          sessionCount: index.entries.length,
          lastModified: this.getLatestModified(index.entries),
        };
      } catch (error: unknown) {
        // If index doesn't exist, try building from JSONL files
        try {
          projectInfo = await this.buildProjectFromJsonl(
            projectDir,
            entry.name,
          );
        } catch (buildError: unknown) {
          // Skip projects that can't be processed either way
          continue;
        }
      }

      // Final pathFilter check with actual decoded path from index
      if (projectInfo !== null) {
        if (
          pathFilter !== undefined &&
          !projectInfo.path.startsWith(pathFilter)
        ) {
          continue;
        }
        projects.push(projectInfo);
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

    // Pass workingDirectoryPrefix as path filter to avoid scanning ALL projects
    const projects = await this.listProjects(options.workingDirectoryPrefix);

    // Read sessions from projects (filtering already done in listProjects)
    for (const project of projects) {
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
            aiAgent: AIAgent.CLAUDE,
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
              aiAgent: AIAgent.CLAUDE,
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

    // Merge Codex CLI sessions from ~/.codex/sessions.
    const codexSessions = await this.listCodexSessions(options);
    allSessions.push(...codexSessions);

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
    const codexSession = await this.getCodexSessionById(sessionId);
    if (codexSession !== null) {
      return codexSession;
    }

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
            aiAgent: AIAgent.CLAUDE,
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
              aiAgent: AIAgent.CLAUDE,
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

  private async listCodexSessions(
    options: ListSessionsOptions,
  ): Promise<ExtendedSessionEntry[]> {
    if (!existsSync(this.codexSessionsDir)) {
      return [];
    }

    const files = await this.listCodexJsonlFiles(this.codexSessionsDir);
    const sessions: ExtendedSessionEntry[] = [];
    for (const file of files) {
      const session = await this.readCodexSessionEntry(file);
      if (session === null) {
        continue;
      }
      if (this.matchesFilters(session, options)) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  private async getCodexSessionById(
    sessionId: string,
  ): Promise<ExtendedSessionEntry | null> {
    if (!existsSync(this.codexSessionsDir)) {
      return null;
    }

    const files = await this.listCodexJsonlFiles(this.codexSessionsDir);
    for (const file of files) {
      const session = await this.readCodexSessionEntry(file);
      if (session?.sessionId === sessionId) {
        return session;
      }
    }
    return null;
  }

  private async listCodexJsonlFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listCodexJsonlFiles(fullPath)));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private extractCodexMessageText(payload: Record<string, unknown>): string {
    if (payload["type"] !== "message" || !Array.isArray(payload["content"])) {
      return "";
    }

    const textParts: string[] = [];
    for (const contentItem of payload["content"]) {
      if (typeof contentItem !== "object" || contentItem === null) {
        continue;
      }
      const contentObj = contentItem as Record<string, unknown>;
      if (
        (contentObj["type"] === "input_text" ||
          contentObj["type"] === "output_text") &&
        typeof contentObj["text"] === "string"
      ) {
        textParts.push(contentObj["text"]);
      }
    }

    return textParts.join("\n").trim();
  }

  private async readCodexSessionEntry(
    jsonlPath: string,
  ): Promise<ExtendedSessionEntry | null> {
    try {
      const fileStat = await stat(jsonlPath);
      const content = await readFile(jsonlPath, "utf-8");
      const lines = content
        .split("\n")
        .filter((line) => line.trim().length > 0);
      if (lines.length === 0) {
        return null;
      }

      let codexId = "";
      let created = new Date(fileStat.birthtimeMs).toISOString();
      let modified = new Date(fileStat.mtimeMs).toISOString();
      let projectPath = "";
      let gitBranch = "";
      let firstPrompt = "";
      let summary = "";
      let messageCount = 0;

      for (const line of lines) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof parsed !== "object" || parsed === null) {
          continue;
        }

        const raw = parsed as Record<string, unknown>;
        if (typeof raw["timestamp"] === "string") {
          modified = raw["timestamp"];
        }

        if (raw["type"] === "session_meta") {
          const payload =
            typeof raw["payload"] === "object" && raw["payload"] !== null
              ? (raw["payload"] as Record<string, unknown>)
              : undefined;
          if (payload !== undefined) {
            if (typeof payload["id"] === "string") {
              codexId = payload["id"];
            }
            if (typeof payload["timestamp"] === "string") {
              created = payload["timestamp"];
            }
            if (typeof payload["cwd"] === "string") {
              projectPath = payload["cwd"];
            }
            if (
              typeof payload["git"] === "object" &&
              payload["git"] !== null &&
              typeof (payload["git"] as Record<string, unknown>)["branch"] ===
                "string"
            ) {
              const branchValue = (payload["git"] as Record<string, unknown>)[
                "branch"
              ];
              if (typeof branchValue === "string") {
                gitBranch = branchValue;
              }
            }
          }
        }

        if (raw["type"] === "response_item") {
          const payload =
            typeof raw["payload"] === "object" && raw["payload"] !== null
              ? (raw["payload"] as Record<string, unknown>)
              : undefined;
          if (payload === undefined) {
            continue;
          }
          if (payload["type"] !== "message") {
            continue;
          }

          messageCount += 1;
          const role =
            typeof payload["role"] === "string"
              ? payload["role"].toLowerCase()
              : "";
          const text = this.extractCodexMessageText(payload);

          if (
            role === "user" &&
            firstPrompt.length === 0 &&
            text.length > 0 &&
            !isInjectedSessionSystemPrompt(text) &&
            !this.isInternalSessionPrompt(text)
          ) {
            firstPrompt = stripSystemTags(text);
          }
          if (role === "assistant" && text.length > 0) {
            summary = stripSystemTags(text).slice(0, 240);
          }
        }
      }

      const fallbackId = jsonlPath.replace(/^.*\//, "").replace(/\.jsonl$/, "");
      const sessionId = `codex-session-${codexId || fallbackId}`;
      return {
        sessionId,
        fullPath: jsonlPath,
        fileMtime: fileStat.mtimeMs,
        firstPrompt:
          firstPrompt.length > 0 ? firstPrompt : "(No user prompt found)",
        summary,
        messageCount,
        created,
        modified,
        gitBranch,
        projectPath,
        isSidechain: false,
        source: "codex-cli",
        projectEncoded: "codex-sessions",
        qraftAiSessionId: sessionId as QraftAiSessionId,
        aiAgent: AIAgent.CODEX,
        hasUserPrompt: firstPrompt.length > 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Read and validate a session index file
   */
  private async readSessionIndex(path: string): Promise<ClaudeSessionIndex> {
    if (!existsSync(path)) {
      throw new Error(`Session index not found: ${path}`);
    }

    const indexStat = await stat(path);
    if (indexStat.size > MAX_SESSION_INDEX_SIZE) {
      throw new Error(`Session index too large: ${path}`);
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
    if (this.isInternalSessionPrompt(entry.firstPrompt)) {
      entry.firstPrompt = "";
      entry.summary = "";
      entry.hasUserPrompt = false;
      return;
    }

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
      let sawInternalPrompt = false;
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
                if (this.isInternalSessionPrompt(message["content"])) {
                  sawInternalPrompt = true;
                  continue;
                }
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

                if (this.isInternalSessionPrompt(allText)) {
                  sawInternalPrompt = true;
                  continue;
                }
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
      if (sawInternalPrompt) {
        entry.firstPrompt = "";
        entry.summary = "";
        entry.hasUserPrompt = false;
        return;
      }

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
    let sawInternalPrompt = false;

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
              if (this.isInternalSessionPrompt(message["content"])) {
                sawInternalPrompt = true;
              }
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
                  if (this.isInternalSessionPrompt(firstBlock["text"])) {
                    sawInternalPrompt = true;
                  }
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
                if (this.isInternalSessionPrompt(message["content"])) {
                  sawInternalPrompt = true;
                  continue;
                }
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
                    if (this.isInternalSessionPrompt(firstBlock["text"])) {
                      sawInternalPrompt = true;
                      continue;
                    }
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

    const isInternalOnly = sawInternalPrompt && firstPrompt.length === 0;

    return {
      sessionId,
      fullPath: jsonlPath,
      fileMtime: fileStat.mtimeMs,
      firstPrompt: isInternalOnly
        ? ""
        : firstPrompt || "(No user prompt found)",
      summary: isInternalOnly ? "" : stripSystemTags(summary),
      messageCount: lines.length,
      created,
      modified,
      gitBranch,
      projectPath,
      isSidechain,
      hasUserPrompt:
        isInternalOnly === true
          ? false
          : firstPrompt.length > 0 || hasAssistantMessage,
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
    if (this.isInternalSessionPrompt(session.firstPrompt)) {
      return false;
    }

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

    // Working directory prefix filter
    if (options.workingDirectoryPrefix !== undefined) {
      if (!session.projectPath.startsWith(options.workingDirectoryPrefix)) {
        return false;
      }
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

    if (session.aiAgent === AIAgent.CODEX) {
      return await this.readCodexTranscript(jsonlPath, offset, limit);
    }

    const content = await readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    const events: TranscriptEvent[] = [];
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed === "object" && parsed !== null) {
          const obj = parsed as Record<string, unknown>;
          if (this.shouldHideClaudeTranscriptEvent(obj)) {
            continue;
          }
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

  private async readCodexTranscript(
    jsonlPath: string,
    offset: number,
    limit: number,
  ): Promise<{ events: TranscriptEvent[]; total: number }> {
    const content = await readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    const events: TranscriptEvent[] = [];
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof parsed !== "object" || parsed === null) {
        continue;
      }

      const raw = parsed as Record<string, unknown>;
      if (raw["type"] !== "response_item") {
        continue;
      }

      const payload =
        typeof raw["payload"] === "object" && raw["payload"] !== null
          ? (raw["payload"] as Record<string, unknown>)
          : undefined;
      if (payload === undefined || payload["type"] !== "message") {
        continue;
      }

      const role =
        typeof payload["role"] === "string"
          ? payload["role"].toLowerCase()
          : "unknown";
      const text = this.extractCodexMessageText(payload);
      if (text.length === 0) {
        continue;
      }
      if (role === "user" && this.isInternalSessionPrompt(text)) {
        continue;
      }

      events.push({
        type:
          role === "assistant" ? "assistant" : role === "user" ? "user" : role,
        timestamp:
          typeof raw["timestamp"] === "string" ? raw["timestamp"] : undefined,
        content: text,
        raw: parsed as object,
      });
    }

    const total = events.length;
    return {
      events: events.slice(offset, offset + limit),
      total,
    };
  }

  private extractClaudeUserMessageText(
    event: Record<string, unknown>,
  ): string {
    const message =
      typeof event["message"] === "object" && event["message"] !== null
        ? (event["message"] as Record<string, unknown>)
        : undefined;

    const content = message?.["content"];
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      const textParts: string[] = [];
      for (const block of content) {
        if (typeof block !== "object" || block === null) {
          continue;
        }
        const blockObj = block as Record<string, unknown>;
        if (
          (blockObj["type"] === "text" ||
            blockObj["type"] === "input_text") &&
          typeof blockObj["text"] === "string"
        ) {
          textParts.push(blockObj["text"]);
        }
      }
      return textParts.join(" ").trim();
    }

    if (typeof event["content"] === "string") {
      return event["content"];
    }
    return "";
  }

  private shouldHideClaudeTranscriptEvent(
    event: Record<string, unknown>,
  ): boolean {
    if (event["type"] !== "user") {
      return false;
    }
    const text = this.extractClaudeUserMessageText(event);
    return text.length > 0 && this.isInternalSessionPrompt(text);
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
