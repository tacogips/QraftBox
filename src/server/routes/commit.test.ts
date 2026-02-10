/**
 * Commit Routes Tests
 *
 * Tests for commit API routes using dependency injection.
 * This approach avoids mock.module() which causes global test pollution.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createCommitRoutes } from "./commit";
import type { CommitRoutesDependencies } from "./commit";
import type { ContextManager } from "../workspace/context-manager";
import type { WorkspaceTab } from "../../types/workspace";
import type {
  CommitPromptContext,
  CommitResult,
} from "../../types/commit-context";
import type { StagedFile as GitStagedFile } from "../git/staged";

/**
 * Create mock dependencies for testing
 */
function createMockDependencies(): CommitRoutesDependencies & {
  mockBuildContext: ReturnType<typeof mock>;
  mockExecuteCommit: ReturnType<typeof mock>;
  mockPreviewCommit: ReturnType<typeof mock>;
  mockGetStagedFiles: ReturnType<typeof mock>;
  mockHasStagedChanges: ReturnType<typeof mock>;
} {
  const mockBuildContext = mock(
    async (): Promise<CommitPromptContext> => ({
      stagedFiles: [
        { path: "src/file1.ts", status: "M", additions: 10, deletions: 5 },
        { path: "src/file2.ts", status: "A", additions: 20, deletions: 0 },
      ],
      stagedDiff: "diff --git a/src/file1.ts b/src/file1.ts\n...",
      branchName: "main",
      recentCommits: [],
      repositoryRoot: "/test/repo",
    }),
  );

  const mockExecuteCommit = mock(
    async (): Promise<CommitResult> => ({
      success: true,
      commitHash: "abc123def456",
      message: "Auto-commit: 2 files changed",
      error: null,
    }),
  );

  const mockPreviewCommit = mock(
    async (): Promise<string> => "Preview of commit prompt",
  );

  const mockGetStagedFiles = mock(
    async (): Promise<GitStagedFile[]> => [
      {
        path: "src/file1.ts",
        status: "M",
        additions: 10,
        deletions: 5,
      },
      {
        path: "src/file2.ts",
        status: "A",
        additions: 20,
        deletions: 0,
      },
    ],
  );

  const mockHasStagedChanges = mock(async (): Promise<boolean> => true);

  return {
    buildContext: mockBuildContext,
    executeCommit: mockExecuteCommit,
    previewCommit: mockPreviewCommit,
    getStagedFiles: mockGetStagedFiles,
    hasStagedChanges: mockHasStagedChanges,
    mockBuildContext,
    mockExecuteCommit,
    mockPreviewCommit,
    mockGetStagedFiles,
    mockHasStagedChanges,
  };
}

/**
 * Create mock context manager
 */
function createMockContextManager(): ContextManager {
  const mockTab: WorkspaceTab = {
    id: "ctx-123",
    projectSlug: "test-abc123",
    path: "/test/repo",
    name: "test-repo",
    repositoryRoot: "/test/repo",
    isGitRepo: true,
    lastAccessedAt: Date.now(),
    createdAt: Date.now(),
    isWorktree: false,
    mainRepositoryPath: null,
    worktreeName: null,
  };

  return {
    createContext: mock(async () => mockTab),
    getContext: mock((id: string) => (id === "ctx-123" ? mockTab : undefined)),
    removeContext: mock(() => {}),
    getAllContexts: mock(() => [mockTab]),
    validateDirectory: mock(async () => ({
      valid: true,
      path: "/test/repo",
      isGitRepo: true,
      repositoryRoot: "/test/repo",
      isWorktree: false,
    })),
    getServerContext: mock(() => ({
      projectPath: "/test/repo",
    })),
    getProjectRegistry: mock(() => ({
      getOrCreateSlug: async () => "test-abc123",
      resolveSlug: async () => undefined,
      removeSlug: async () => {},
      getAllProjects: async () => new Map(),
    })),
  };
}

describe("createCommitRoutes", () => {
  let contextManager: ContextManager;
  let deps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    contextManager = createMockContextManager();
    deps = createMockDependencies();
  });

  describe("POST /:contextId", () => {
    test("executes commit successfully", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: false,
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        result: CommitResult;
      };
      expect(data).toHaveProperty("result");
      expect(data.result.success).toBe(true);
      expect(data.result.commitHash).toBe("abc123def456");
      expect(deps.mockBuildContext).toHaveBeenCalledTimes(1);
      expect(deps.mockExecuteCommit).toHaveBeenCalledTimes(1);
    });

    test("returns 404 for non-existent context", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: false,
      };

      const response = await app.request("/ctx-999", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 400 for invalid JSON", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid JSON");
    });

    test("returns 400 for missing required fields", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        // Missing variables and dryRun
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Missing required fields");
    });

    test("returns 400 for invalid commit request", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "", // Empty promptId is invalid
        variables: {},
        dryRun: false,
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
    });

    test("returns 400 when no staged changes", async () => {
      // Override buildContext to return empty staged files
      deps.mockBuildContext.mockResolvedValueOnce({
        stagedFiles: [],
        stagedDiff: "",
        branchName: "main",
        recentCommits: [],
        repositoryRoot: "/test/repo",
      });

      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: false,
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("No staged changes");
    });

    test("returns 500 on commit execution error", async () => {
      // Override executeCommit to throw error
      deps.mockExecuteCommit.mockRejectedValueOnce(new Error("Git error"));

      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: false,
      };

      const response = await app.request("/ctx-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Git error");
    });
  });

  describe("POST /:contextId/preview", () => {
    test("generates commit preview successfully", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: true,
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        preview: string;
        context: CommitPromptContext;
      };
      expect(data).toHaveProperty("preview");
      expect(data).toHaveProperty("context");
      expect(data.preview).toBe("Preview of commit prompt");
      expect(data.context.stagedFiles).toHaveLength(2);
      expect(deps.mockBuildContext).toHaveBeenCalledTimes(1);
      expect(deps.mockPreviewCommit).toHaveBeenCalledTimes(1);
    });

    test("returns 404 for non-existent context", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: true,
      };

      const response = await app.request("/ctx-999/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 400 for invalid JSON", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid JSON");
    });

    test("returns 400 for missing promptId", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        variables: {},
        dryRun: true,
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Missing required field");
    });

    test("returns 400 when no staged changes to preview", async () => {
      // Override buildContext to return empty staged files
      deps.mockBuildContext.mockResolvedValueOnce({
        stagedFiles: [],
        stagedDiff: "",
        branchName: "main",
        recentCommits: [],
        repositoryRoot: "/test/repo",
      });

      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: true,
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("No staged changes");
    });

    test("returns 500 on preview generation error", async () => {
      // Override previewCommit to throw error
      deps.mockPreviewCommit.mockRejectedValueOnce(new Error("Preview error"));

      const app = createCommitRoutes(contextManager, deps);

      const requestBody = {
        promptId: "default-commit",
        variables: {},
        dryRun: true,
      };

      const response = await app.request("/ctx-123/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Preview error");
    });
  });

  describe("GET /:contextId/staged", () => {
    test("returns staged files successfully", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/staged", {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        files: Array<{
          path: string;
          status: string;
          additions: number;
          deletions: number;
        }>;
        hasStagedChanges: boolean;
      };
      expect(data).toHaveProperty("files");
      expect(data).toHaveProperty("hasStagedChanges");
      expect(data.files).toHaveLength(2);
      expect(data.hasStagedChanges).toBe(true);
      expect(data.files[0]).toMatchObject({
        path: "src/file1.ts",
        status: "M",
        additions: 10,
        deletions: 5,
      });
      expect(deps.mockGetStagedFiles).toHaveBeenCalledTimes(1);
      expect(deps.mockHasStagedChanges).toHaveBeenCalledTimes(1);
    });

    test("returns empty files array when no staged changes", async () => {
      // Override mock for empty staged files
      deps.mockGetStagedFiles.mockResolvedValueOnce([]);
      deps.mockHasStagedChanges.mockResolvedValueOnce(false);

      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/staged", {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        files: Array<{
          path: string;
          status: string;
          additions: number;
          deletions: number;
        }>;
        hasStagedChanges: boolean;
      };
      expect(data).toHaveProperty("files");
      expect(data).toHaveProperty("hasStagedChanges");
      expect(data.files).toHaveLength(0);
      expect(data.hasStagedChanges).toBe(false);
    });

    test("maps copied files to added status", async () => {
      // Override mock with 'C' (Copied) status
      deps.mockGetStagedFiles.mockResolvedValueOnce([
        {
          path: "src/copy.ts",
          status: "C",
          additions: 50,
          deletions: 0,
          oldPath: "src/original.ts",
        },
      ]);

      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/staged", {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        files: Array<{
          path: string;
          status: string;
          additions: number;
          deletions: number;
        }>;
        hasStagedChanges: boolean;
      };
      expect(data.files).toHaveLength(1);
      expect(data.files[0]).toMatchObject({
        path: "src/copy.ts",
        status: "A", // Mapped from 'C' to 'A'
        additions: 50,
        deletions: 0,
      });
    });

    test("returns 404 for non-existent context", async () => {
      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-999/staged", {
        method: "GET",
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Context not found");
    });

    test("returns 500 on git error", async () => {
      // Override getStagedFiles to throw error
      deps.mockGetStagedFiles.mockRejectedValueOnce(
        new Error("Git command failed"),
      );

      const app = createCommitRoutes(contextManager, deps);

      const response = await app.request("/ctx-123/staged", {
        method: "GET",
      });

      expect(response.status).toBe(500);

      const data = (await response.json()) as { error: string };
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Git command failed");
    });
  });
});
