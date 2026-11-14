/**
 * Tests for ClaudeSessionReader
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeSessionReader } from "./session-reader";
import {
  createInMemorySessionMappingStore,
  type SessionMappingStore,
} from "../ai/session-mapping-store";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type {
  ClaudeSessionIndex,
  ClaudeSessionEntry,
} from "../../types/claude-session";
import type { ClaudeSessionId, WorktreeId } from "../../types/ai";

describe("ClaudeSessionReader", () => {
  let tempDir: string;
  let projectsDir: string;
  let reader: ClaudeSessionReader;
  let mappingStore: SessionMappingStore;

  beforeEach(async () => {
    // Create temporary test directory
    tempDir = join(tmpdir(), `qraftbox-test-${Date.now()}`);
    projectsDir = join(tempDir, ".claude", "projects");

    await mkdir(projectsDir, { recursive: true });

    mappingStore = createInMemorySessionMappingStore();
    reader = new ClaudeSessionReader(projectsDir, mappingStore);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("listProjects", () => {
    it("should return empty array when projects directory does not exist", async () => {
      const nonExistentDir = join(tempDir, "non-existent");
      const readerWithNonExistent = new ClaudeSessionReader(nonExistentDir);

      const projects = await readerWithNonExistent.listProjects();

      expect(projects).toEqual([]);
    });

    it("should return empty array when no projects exist", async () => {
      const projects = await reader.listProjects();

      expect(projects).toEqual([]);
    });

    it("should list all projects with session metadata", async () => {
      // Create test project directories with indices
      const project1Dir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      const project2Dir = join(projectsDir, "-home-user-other");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });

      const index1: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [
          createMockSessionEntry(
            "session-1",
            "2026-02-05T10:00:00Z",
            "2026-02-05T11:00:00Z",
          ),
          createMockSessionEntry(
            "session-2",
            "2026-02-05T09:00:00Z",
            "2026-02-05T12:00:00Z",
          ),
        ],
      };

      const index2: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/home/user/other",
        entries: [
          createMockSessionEntry(
            "session-3",
            "2026-02-04T10:00:00Z",
            "2026-02-04T11:00:00Z",
          ),
        ],
      };

      await writeFile(
        join(project1Dir, "sessions-index.json"),
        JSON.stringify(index1, null, 2),
      );
      await writeFile(
        join(project2Dir, "sessions-index.json"),
        JSON.stringify(index2, null, 2),
      );

      const projects = await reader.listProjects();

      expect(projects).toHaveLength(2);

      // Sort for predictable order
      projects.sort((a, b) => a.path.localeCompare(b.path));

      expect(projects[0]).toEqual({
        path: "/g/gits/tacogips/qraftbox",
        encoded: "-g-gits-tacogips-qraftbox",
        sessionCount: 2,
        lastModified: "2026-02-05T12:00:00Z", // Latest modified
      });

      expect(projects[1]).toEqual({
        path: "/home/user/other",
        encoded: "-home-user-other",
        sessionCount: 1,
        lastModified: "2026-02-04T11:00:00Z",
      });
    });

    it("should skip projects with corrupted indices", async () => {
      const project1Dir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      const project2Dir = join(projectsDir, "-g-gits-tacogips-bad");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });

      // Valid index
      const validIndex: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(project1Dir, "sessions-index.json"),
        JSON.stringify(validIndex, null, 2),
      );

      // Corrupted index (invalid JSON)
      await writeFile(
        join(project2Dir, "sessions-index.json"),
        "{ invalid json",
      );

      const projects = await reader.listProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0]?.path).toBe("/g/gits/tacogips/qraftbox");
    });

    it("should skip directories without sessions-index.json", async () => {
      const project1Dir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      const project2Dir = join(projectsDir, "-g-gits-tacogips-no-index");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });

      // Only project1 has index
      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(project1Dir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const projects = await reader.listProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0]?.path).toBe("/g/gits/tacogips/qraftbox");
    });

    it("should filter projects by pathFilter prefix", async () => {
      // Create three projects with different paths
      const project1Dir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      const project2Dir = join(projectsDir, "-g-gits-tacogips-other");
      const project3Dir = join(projectsDir, "-home-user-project");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await mkdir(project3Dir, { recursive: true });

      const index1: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      const index2: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/other",
        entries: [createMockSessionEntry("session-2", "2026-02-05T10:00:00Z")],
      };

      const index3: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/home/user/project",
        entries: [createMockSessionEntry("session-3", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(project1Dir, "sessions-index.json"),
        JSON.stringify(index1, null, 2),
      );
      await writeFile(
        join(project2Dir, "sessions-index.json"),
        JSON.stringify(index2, null, 2),
      );
      await writeFile(
        join(project3Dir, "sessions-index.json"),
        JSON.stringify(index3, null, 2),
      );

      // Filter by "/g/gits/tacogips" prefix
      const projects = await reader.listProjects("/g/gits/tacogips");

      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.path).sort()).toEqual([
        "/g/gits/tacogips/other",
        "/g/gits/tacogips/qraftbox",
      ]);
    });

    it("should return all projects when pathFilter is not provided", async () => {
      const project1Dir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      const project2Dir = join(projectsDir, "-home-user-project");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });

      const index1: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      const index2: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/home/user/project",
        entries: [createMockSessionEntry("session-2", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(project1Dir, "sessions-index.json"),
        JSON.stringify(index1, null, 2),
      );
      await writeFile(
        join(project2Dir, "sessions-index.json"),
        JSON.stringify(index2, null, 2),
      );

      const projects = await reader.listProjects();

      expect(projects).toHaveLength(2);
    });

    it("should handle pathFilter that matches no projects", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const projects = await reader.listProjects("/non/existent/path");

      expect(projects).toHaveLength(0);
    });

    it("should filter correctly when pathFilter contains hyphens", async () => {
      const matchingDir = join(projectsDir, "-g-learning-contents");
      const nonMatchingDir = join(projectsDir, "-g-learning-other");

      await mkdir(matchingDir, { recursive: true });
      await mkdir(nonMatchingDir, { recursive: true });

      const matchingIndex: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/learning-contents",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      const nonMatchingIndex: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/learning-other",
        entries: [createMockSessionEntry("session-2", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(matchingDir, "sessions-index.json"),
        JSON.stringify(matchingIndex, null, 2),
      );
      await writeFile(
        join(nonMatchingDir, "sessions-index.json"),
        JSON.stringify(nonMatchingIndex, null, 2),
      );

      const projects = await reader.listProjects("/g/learning-contents");

      expect(projects).toHaveLength(1);
      expect(projects[0]?.path).toBe("/g/learning-contents");
    });
  });

  describe("listSessions", () => {
    beforeEach(async () => {
      // Setup test projects
      const project1Dir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      const project2Dir = join(projectsDir, "-home-user-other");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });

      const index1: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [
          createMockSessionEntry(
            "session-1",
            "2026-02-05T10:00:00Z",
            "2026-02-05T12:00:00Z",
            "main",
            "Implement feature X",
          ),
          createMockSessionEntry(
            "session-2",
            "2026-02-04T10:00:00Z",
            "2026-02-04T11:00:00Z",
            "feature/auth",
            "Fix authentication bug",
          ),
        ],
      };

      const index2: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/home/user/other",
        entries: [
          createMockSessionEntry(
            "session-3",
            "2026-02-03T10:00:00Z",
            "2026-02-03T11:00:00Z",
            "main",
            "Update README",
          ),
        ],
      };

      await writeFile(
        join(project1Dir, "sessions-index.json"),
        JSON.stringify(index1, null, 2),
      );
      await writeFile(
        join(project2Dir, "sessions-index.json"),
        JSON.stringify(index2, null, 2),
      );

      // Register session-1 as qraftbox session
      mappingStore.upsert(
        "session-1" as ClaudeSessionId,
        "/g/gits/tacogips/qraftbox",
        "test_worktree" as WorktreeId,
        "qraftbox",
      );
    });

    it("should list all sessions by default", async () => {
      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(50);
    });

    it("should sort sessions by modified date descending by default", async () => {
      const result = await reader.listSessions();

      expect(result.sessions[0]?.sessionId).toBe("session-1"); // Latest
      expect(result.sessions[1]?.sessionId).toBe("session-2");
      expect(result.sessions[2]?.sessionId).toBe("session-3"); // Oldest
    });

    it("should sort sessions by created date ascending", async () => {
      const result = await reader.listSessions({
        sortBy: "created",
        sortOrder: "asc",
      });

      expect(result.sessions[0]?.sessionId).toBe("session-3"); // Oldest created
      expect(result.sessions[1]?.sessionId).toBe("session-2");
      expect(result.sessions[2]?.sessionId).toBe("session-1"); // Latest created
    });

    it("should filter sessions by working directory prefix", async () => {
      const result = await reader.listSessions({
        workingDirectoryPrefix: "/g/gits/tacogips",
      });

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0]?.projectPath).toBe("/g/gits/tacogips/qraftbox");
      expect(result.sessions[1]?.projectPath).toBe("/g/gits/tacogips/qraftbox");
    });

    it("should only process matching projects when workingDirectoryPrefix is provided", async () => {
      // Create an additional unrelated project
      const project3Dir = join(projectsDir, "-var-lib-data");
      await mkdir(project3Dir, { recursive: true });

      const index3: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/var/lib/data",
        entries: [
          createMockSessionEntry(
            "session-4",
            "2026-02-06T10:00:00Z",
            "2026-02-06T11:00:00Z",
            "main",
            "Some other project",
          ),
        ],
      };

      await writeFile(
        join(project3Dir, "sessions-index.json"),
        JSON.stringify(index3, null, 2),
      );

      // Filter by /g/gits/tacogips - should only process project1, not project2 or project3
      const result = await reader.listSessions({
        workingDirectoryPrefix: "/g/gits/tacogips",
      });

      // Should only get sessions from /g/gits/tacogips/qraftbox (session-1, session-2)
      expect(result.sessions).toHaveLength(2);
      expect(
        result.sessions.every((s) =>
          s.projectPath.startsWith("/g/gits/tacogips"),
        ),
      ).toBe(true);
      expect(
        result.sessions.find((s) => s.sessionId === "session-3"),
      ).toBeUndefined();
      expect(
        result.sessions.find((s) => s.sessionId === "session-4"),
      ).toBeUndefined();
    });

    it("should filter sessions by source (qraftbox)", async () => {
      const result = await reader.listSessions({
        source: "qraftbox",
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.sessionId).toBe("session-1");
      expect(result.sessions[0]?.source).toBe("qraftbox");
    });

    it("should filter sessions by source (claude-cli)", async () => {
      const result = await reader.listSessions({
        source: "claude-cli",
      });

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((s) => s.source === "claude-cli")).toBe(
        true,
      );
    });

    it("should filter sessions by branch", async () => {
      const result = await reader.listSessions({
        branch: "main",
      });

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((s) => s.gitBranch === "main")).toBe(true);
    });

    it("should search sessions by firstPrompt content", async () => {
      const result = await reader.listSessions({
        search: "authentication",
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.sessionId).toBe("session-2");
    });

    it("should search sessions case-insensitively", async () => {
      const result = await reader.listSessions({
        search: "AUTHENTICATION",
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.sessionId).toBe("session-2");
    });

    it("should filter sessions by date range (from)", async () => {
      const result = await reader.listSessions({
        dateRange: {
          from: "2026-02-04T00:00:00Z",
        },
      });

      expect(result.sessions).toHaveLength(2); // session-1 and session-2
      expect(
        result.sessions.every(
          (s) => new Date(s.modified) >= new Date("2026-02-04T00:00:00Z"),
        ),
      ).toBe(true);
    });

    it("should filter sessions by date range (to)", async () => {
      const result = await reader.listSessions({
        dateRange: {
          to: "2026-02-04T12:00:00Z",
        },
      });

      expect(result.sessions).toHaveLength(2); // session-2 and session-3
      expect(
        result.sessions.every(
          (s) => new Date(s.modified) <= new Date("2026-02-04T12:00:00Z"),
        ),
      ).toBe(true);
    });

    it("should filter sessions by date range (from and to)", async () => {
      const result = await reader.listSessions({
        dateRange: {
          from: "2026-02-04T00:00:00Z",
          to: "2026-02-04T23:59:59Z",
        },
      });

      expect(result.sessions).toHaveLength(1); // Only session-2
      expect(result.sessions[0]?.sessionId).toBe("session-2");
    });

    it("should combine multiple filters", async () => {
      const result = await reader.listSessions({
        workingDirectoryPrefix: "/g/gits/tacogips",
        branch: "main",
        source: "qraftbox",
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.sessionId).toBe("session-1");
    });

    it("should paginate results", async () => {
      const result = await reader.listSessions({
        offset: 1,
        limit: 1,
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(1);
      expect(result.sessions[0]?.sessionId).toBe("session-2"); // Second item
    });

    it("should handle offset beyond total results", async () => {
      const result = await reader.listSessions({
        offset: 10,
        limit: 10,
      });

      expect(result.sessions).toHaveLength(0);
      expect(result.total).toBe(3);
      expect(result.offset).toBe(10);
    });
  });

  describe("getSession", () => {
    beforeEach(async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [
          createMockSessionEntry("session-1", "2026-02-05T10:00:00Z"),
          createMockSessionEntry("session-2", "2026-02-04T10:00:00Z"),
        ],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );
    });

    it("should return session by ID", async () => {
      const session = await reader.getSession("session-1");

      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe("session-1");
      expect(session?.projectEncoded).toBe("-g-gits-tacogips-qraftbox");
    });

    it("should return null for non-existent session", async () => {
      const session = await reader.getSession("non-existent-id");

      expect(session).toBeNull();
    });

    it("should include source in returned session", async () => {
      mappingStore.upsert(
        "session-1" as ClaudeSessionId,
        "/g/gits/tacogips/qraftbox",
        "test_worktree" as WorktreeId,
        "qraftbox",
      );

      const session = await reader.getSession("session-1");

      expect(session?.source).toBe("qraftbox");
    });
  });

  describe("source detection", () => {
    it("should detect qraftbox sessions from registry", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [createMockSessionEntry("session-1", "2026-02-05T10:00:00Z")],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );
      mappingStore.upsert(
        "session-1" as ClaudeSessionId,
        "/g/gits/tacogips/qraftbox",
        "test_worktree" as WorktreeId,
        "qraftbox",
      );

      const result = await reader.listSessions();

      expect(result.sessions[0]?.source).toBe("qraftbox");
    });

    it("should detect qraftbox sessions from prompt pattern [qraftbox-context]", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const entry = createMockSessionEntry(
        "session-1",
        "2026-02-05T10:00:00Z",
        "2026-02-05T11:00:00Z",
        "main",
        "[qraftbox-context] Implement feature",
      );

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [entry],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions[0]?.source).toBe("qraftbox");
    });

    it('should detect qraftbox sessions from prompt pattern "context from qraftbox"', async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const entry = createMockSessionEntry(
        "session-1",
        "2026-02-05T10:00:00Z",
        "2026-02-05T11:00:00Z",
        "main",
        "Context from qraftbox: Implement feature",
      );

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [entry],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions[0]?.source).toBe("qraftbox");
    });

    it("should default to claude-cli for sessions without markers", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [
          createMockSessionEntry(
            "session-1",
            "2026-02-05T10:00:00Z",
            "2026-02-05T11:00:00Z",
            "main",
            "Regular prompt",
          ),
        ],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions[0]?.source).toBe("claude-cli");
    });
  });

  describe("error handling", () => {
    it("should handle corrupted session indices gracefully", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      // Write invalid JSON
      await writeFile(
        join(projectDir, "sessions-index.json"),
        "{ invalid json",
      );

      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should skip sessions with invalid entry format", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      // Create index with invalid entry
      const invalidIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [
          {
            sessionId: "session-1",
            // Missing required fields
          },
        ],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(invalidIndex, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(0);
    });

    it("should strip system tags from firstPrompt in index entries", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [
          createMockSessionEntry(
            "session-with-tags",
            "2026-02-05T10:00:00Z",
            "2026-02-05T11:00:00Z",
            "main",
            "<local-command-caveat>System command</local-command-caveat>Real user prompt",
          ),
        ],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.firstPrompt).toBe("Real user prompt");
    });

    it("should find real user prompt from JSONL when firstPrompt contains only system tags", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      // Create JSONL file with the real prompt further down
      const jsonlPath = join(projectDir, "session-only-tags.jsonl");
      const jsonlContent = [
        JSON.stringify({
          type: "user",
          message: {
            content:
              "<local-command-caveat>System command</local-command-caveat>",
          },
          timestamp: "2026-02-05T10:00:00Z",
        }),
        JSON.stringify({
          type: "user",
          message: {
            content: "This is the real user prompt",
          },
          timestamp: "2026-02-05T10:01:00Z",
        }),
      ].join("\n");

      await writeFile(jsonlPath, jsonlContent);

      // Create index with system-tag-only firstPrompt and correct fullPath
      const mockEntry = createMockSessionEntry(
        "session-only-tags",
        "2026-02-05T10:00:00Z",
        "2026-02-05T11:00:00Z",
        "main",
        "<local-command-caveat>Only system tags here</local-command-caveat>",
      );
      mockEntry.fullPath = jsonlPath;

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [mockEntry],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.firstPrompt).toBe(
        "This is the real user prompt",
      );
    });

    it("should handle array content blocks when finding real user prompt", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      // Create JSONL file with array content
      const jsonlPath = join(projectDir, "session-array-content.jsonl");
      const jsonlContent = [
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: "<local-command-caveat>System</local-command-caveat>",
              },
            ],
          },
          timestamp: "2026-02-05T10:00:00Z",
        }),
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: "First block text",
              },
              {
                type: "text",
                text: "Second block text",
              },
            ],
          },
          timestamp: "2026-02-05T10:01:00Z",
        }),
      ].join("\n");

      await writeFile(jsonlPath, jsonlContent);

      const mockEntry = createMockSessionEntry(
        "session-array-content",
        "2026-02-05T10:00:00Z",
        "2026-02-05T11:00:00Z",
        "main",
        "<local-command-caveat>Only system tags</local-command-caveat>",
      );
      mockEntry.fullPath = jsonlPath;

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [mockEntry],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.firstPrompt).toBe(
        "First block text\nSecond block text",
      );
    });

    it("should fallback to stripped summary when no real prompt found in JSONL", async () => {
      const projectDir = join(projectsDir, "-g-gits-tacogips-qraftbox");
      await mkdir(projectDir, { recursive: true });

      // Create JSONL file with only system tag messages
      const jsonlPath = join(projectDir, "session-no-prompt.jsonl");
      const jsonlContent = JSON.stringify({
        type: "user",
        message: {
          content: "<local-command-caveat>System only</local-command-caveat>",
        },
        timestamp: "2026-02-05T10:00:00Z",
      });

      await writeFile(jsonlPath, jsonlContent);

      const mockEntry = createMockSessionEntry(
        "session-no-prompt",
        "2026-02-05T10:00:00Z",
        "2026-02-05T11:00:00Z",
        "main",
        "<local-command-caveat>Only system tags</local-command-caveat>",
      );
      mockEntry.fullPath = jsonlPath;
      mockEntry.summary =
        "<system-reminder>System note</system-reminder>Summary text";

      const index: ClaudeSessionIndex = {
        version: 1,
        originalPath: "/g/gits/tacogips/qraftbox",
        entries: [mockEntry],
      };

      await writeFile(
        join(projectDir, "sessions-index.json"),
        JSON.stringify(index, null, 2),
      );

      const result = await reader.listSessions();

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.firstPrompt).toBe("Summary text");
    });
  });
});

/**
 * Helper to create mock session entries
 */
function createMockSessionEntry(
  sessionId: string,
  created: string,
  modified?: string,
  branch = "main",
  firstPrompt = "Test prompt",
): ClaudeSessionEntry {
  return {
    sessionId,
    fullPath: `/home/user/.claude/projects/test/${sessionId}.jsonl`,
    fileMtime: new Date(modified ?? created).getTime(),
    firstPrompt,
    summary: `Summary for ${sessionId}`,
    messageCount: 10,
    created,
    modified: modified ?? created,
    gitBranch: branch,
    projectPath: "/g/gits/tacogips/qraftbox",
    isSidechain: false,
  };
}
