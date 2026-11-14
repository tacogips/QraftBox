/**
 * Context Manager Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createContextManager,
  type ContextManager,
  type DirectoryValidation,
} from "./context-manager";
import type { WorkspaceTab } from "../../types/workspace";

describe("ContextManager", () => {
  let contextManager: ContextManager;
  let testDir: string;
  let gitRepoDir: string;
  let nonGitDir: string;
  let nestedGitDir: string;

  beforeEach(async () => {
    contextManager = createContextManager();

    // Create test directory structure
    testDir = join(tmpdir(), `context-manager-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create a git repository directory
    gitRepoDir = join(testDir, "git-repo");
    await mkdir(gitRepoDir, { recursive: true });
    await mkdir(join(gitRepoDir, ".git"), { recursive: true });

    // Create a non-git directory
    nonGitDir = join(testDir, "non-git");
    await mkdir(nonGitDir, { recursive: true });

    // Create a nested directory within git repo
    nestedGitDir = join(gitRepoDir, "src", "components");
    await mkdir(nestedGitDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("createContext", () => {
    test("creates context for valid git repository", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      expect(tab.id).toBeDefined();
      expect(tab.path).toBe(gitRepoDir);
      expect(tab.name).toBe("git-repo");
      expect(tab.repositoryRoot).toBe(gitRepoDir);
      expect(tab.isGitRepo).toBe(true);
      expect(tab.createdAt).toBeGreaterThan(0);
      expect(tab.lastAccessedAt).toBe(tab.createdAt);
    });

    test("creates context for non-git directory", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(nonGitDir);

      expect(tab.id).toBeDefined();
      expect(tab.path).toBe(nonGitDir);
      expect(tab.name).toBe("non-git");
      expect(tab.repositoryRoot).toBe(nonGitDir);
      expect(tab.isGitRepo).toBe(false);
    });

    test("creates context for nested directory in git repo", async () => {
      const tab: WorkspaceTab =
        await contextManager.createContext(nestedGitDir);

      expect(tab.id).toBeDefined();
      expect(tab.path).toBe(nestedGitDir);
      expect(tab.name).toBe("components");
      expect(tab.repositoryRoot).toBe(gitRepoDir);
      expect(tab.isGitRepo).toBe(false); // Directory itself is not a repo
    });

    test("throws error for non-existent directory", async () => {
      const nonExistent = join(testDir, "does-not-exist");

      await expect(contextManager.createContext(nonExistent)).rejects.toThrow(
        "Directory not accessible",
      );
    });

    test("throws error for file instead of directory", async () => {
      const filePath = join(testDir, "file.txt");
      await writeFile(filePath, "test content");

      await expect(contextManager.createContext(filePath)).rejects.toThrow(
        "Path is not a directory",
      );
    });

    test("throws error for empty path", async () => {
      await expect(contextManager.createContext("")).rejects.toThrow(
        "path cannot be empty",
      );
    });

    test("throws error for path with null byte", async () => {
      const invalidPath = join(testDir, "test\0null");

      await expect(contextManager.createContext(invalidPath)).rejects.toThrow(
        "path contains invalid null byte",
      );
    });

    test("resolves relative paths to absolute", async () => {
      // Use a relative path
      const relativePath = "./";
      const tab: WorkspaceTab =
        await contextManager.createContext(relativePath);

      // Path should be resolved to absolute
      expect(tab.path).not.toBe(relativePath);
      expect(tab.path).toMatch(/^\//); // Starts with /
    });

    test("generates unique IDs for different contexts", async () => {
      const tab1: WorkspaceTab = await contextManager.createContext(gitRepoDir);
      const tab2: WorkspaceTab = await contextManager.createContext(nonGitDir);

      expect(tab1.id).not.toBe(tab2.id);
    });

    test("stores created context in manager", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      const retrieved = contextManager.getContext(tab.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(tab.id);
      expect(retrieved?.path).toBe(tab.path);
    });

    test("creates temporary context without persisting project registry mapping", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir, {
        persistInRegistry: false,
      });

      expect(tab.projectSlug).toStartWith("tmp-");

      const resolved = await contextManager
        .getProjectRegistry()
        .resolveSlug(tab.projectSlug);
      expect(resolved).toBeUndefined();
    });
  });

  describe("getContext", () => {
    test("returns context by ID", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      const retrieved = contextManager.getContext(tab.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(tab.id);
      expect(retrieved?.path).toBe(gitRepoDir);
    });

    test("returns undefined for non-existent ID", () => {
      const nonExistentId = "550e8400-e29b-41d4-a716-446655440000";

      const result = contextManager.getContext(nonExistentId);
      expect(result).toBeUndefined();
    });

    test("returns undefined for invalid ID format", () => {
      const invalidId = "not-a-uuid";

      const result = contextManager.getContext(invalidId);
      expect(result).toBeUndefined();
    });

    test("returns undefined for empty ID", () => {
      const result = contextManager.getContext("");
      expect(result).toBeUndefined();
    });
  });

  describe("removeContext", () => {
    test("removes context by ID", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      contextManager.removeContext(tab.id);

      const retrieved = contextManager.getContext(tab.id);
      expect(retrieved).toBeUndefined();
    });

    test("does nothing for non-existent ID", () => {
      const nonExistentId = "550e8400-e29b-41d4-a716-446655440000";

      // Should not throw
      expect(() => contextManager.removeContext(nonExistentId)).not.toThrow();
    });

    test("does nothing for invalid ID format", () => {
      const invalidId = "not-a-uuid";

      // Should not throw
      expect(() => contextManager.removeContext(invalidId)).not.toThrow();
    });

    test("removes only specified context", async () => {
      const tab1: WorkspaceTab = await contextManager.createContext(gitRepoDir);
      const tab2: WorkspaceTab = await contextManager.createContext(nonGitDir);

      contextManager.removeContext(tab1.id);

      expect(contextManager.getContext(tab1.id)).toBeUndefined();
      expect(contextManager.getContext(tab2.id)).toBeDefined();
    });
  });

  describe("getAllContexts", () => {
    test("returns empty array when no contexts", () => {
      const contexts = contextManager.getAllContexts();

      expect(contexts).toEqual([]);
    });

    test("returns all created contexts", async () => {
      const tab1: WorkspaceTab = await contextManager.createContext(gitRepoDir);
      const tab2: WorkspaceTab = await contextManager.createContext(nonGitDir);

      const contexts = contextManager.getAllContexts();

      expect(contexts).toHaveLength(2);
      expect(contexts.map((t) => t.id)).toContain(tab1.id);
      expect(contexts.map((t) => t.id)).toContain(tab2.id);
    });

    test("returns readonly array", async () => {
      await contextManager.createContext(gitRepoDir);

      const contexts = contextManager.getAllContexts();

      // TypeScript enforces readonly, but verify at runtime
      expect(Array.isArray(contexts)).toBe(true);
    });

    test("updates after removing context", async () => {
      const tab1: WorkspaceTab = await contextManager.createContext(gitRepoDir);
      const tab2: WorkspaceTab = await contextManager.createContext(nonGitDir);

      contextManager.removeContext(tab1.id);

      const contexts = contextManager.getAllContexts();

      expect(contexts).toHaveLength(1);
      expect(contexts[0]?.id).toBe(tab2.id);
    });
  });

  describe("validateDirectory", () => {
    test("validates git repository directory", async () => {
      const validation: DirectoryValidation =
        await contextManager.validateDirectory(gitRepoDir);

      expect(validation.valid).toBe(true);
      expect(validation.path).toBe(gitRepoDir);
      expect(validation.isGitRepo).toBe(true);
      expect(validation.repositoryRoot).toBe(gitRepoDir);
      expect(validation.error).toBeUndefined();
    });

    test("validates non-git directory", async () => {
      const validation: DirectoryValidation =
        await contextManager.validateDirectory(nonGitDir);

      expect(validation.valid).toBe(true);
      expect(validation.path).toBe(nonGitDir);
      expect(validation.isGitRepo).toBe(false);
      expect(validation.repositoryRoot).toBeUndefined();
      expect(validation.error).toBeUndefined();
    });

    test("validates nested directory in git repo", async () => {
      const validation: DirectoryValidation =
        await contextManager.validateDirectory(nestedGitDir);

      expect(validation.valid).toBe(true);
      expect(validation.path).toBe(nestedGitDir);
      expect(validation.isGitRepo).toBe(false);
      expect(validation.repositoryRoot).toBe(gitRepoDir);
    });

    test("returns error for non-existent directory", async () => {
      const nonExistent = join(testDir, "does-not-exist");

      const validation: DirectoryValidation =
        await contextManager.validateDirectory(nonExistent);

      expect(validation.valid).toBe(false);
      expect(validation.isGitRepo).toBe(false);
      expect(validation.error).toBeDefined();
      expect(validation.error).toContain("Directory not accessible");
    });

    test("returns error for file instead of directory", async () => {
      const filePath = join(testDir, "file.txt");
      await writeFile(filePath, "test content");

      const validation: DirectoryValidation =
        await contextManager.validateDirectory(filePath);

      expect(validation.valid).toBe(false);
      expect(validation.isGitRepo).toBe(false);
      expect(validation.error).toBe("Path is not a directory");
    });

    test("returns error for empty path", async () => {
      const validation: DirectoryValidation =
        await contextManager.validateDirectory("");

      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });

    test("returns error for path with null byte", async () => {
      const invalidPath = join(testDir, "test\0null");

      const validation: DirectoryValidation =
        await contextManager.validateDirectory(invalidPath);

      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });

    test("resolves relative paths", async () => {
      const validation: DirectoryValidation =
        await contextManager.validateDirectory("./");

      expect(validation.valid).toBe(true);
      expect(validation.path).toMatch(/^\//); // Absolute path
    });
  });

  describe("getServerContext", () => {
    test("returns server context for valid ID", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      const serverContext = contextManager.getServerContext(tab.id);

      expect(serverContext.projectPath).toBe(gitRepoDir);
    });

    test("throws error for non-existent ID", () => {
      const nonExistentId = "550e8400-e29b-41d4-a716-446655440000";

      expect(() => contextManager.getServerContext(nonExistentId)).toThrow(
        "Context not found",
      );
    });

    test("throws error for invalid ID format", () => {
      const invalidId = "not-a-uuid";

      expect(() => contextManager.getServerContext(invalidId)).toThrow(
        "Context not found",
      );
    });

    test("returns correct path for different contexts", async () => {
      const tab1: WorkspaceTab = await contextManager.createContext(gitRepoDir);
      const tab2: WorkspaceTab = await contextManager.createContext(nonGitDir);

      const context1 = contextManager.getServerContext(tab1.id);
      const context2 = contextManager.getServerContext(tab2.id);

      expect(context1.projectPath).toBe(gitRepoDir);
      expect(context2.projectPath).toBe(nonGitDir);
    });
  });

  describe("edge cases", () => {
    test("handles very long paths", async () => {
      // Create a deeply nested directory
      const deepPath = join(
        testDir,
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
        "i",
        "j",
      );
      await mkdir(deepPath, { recursive: true });

      const tab: WorkspaceTab = await contextManager.createContext(deepPath);

      expect(tab.path).toBe(deepPath);
      expect(tab.name).toBe("j");
    });

    test("handles directory names with spaces", async () => {
      const dirWithSpaces = join(testDir, "directory with spaces");
      await mkdir(dirWithSpaces, { recursive: true });

      const tab: WorkspaceTab =
        await contextManager.createContext(dirWithSpaces);

      expect(tab.path).toBe(dirWithSpaces);
      expect(tab.name).toBe("directory with spaces");
    });

    test("handles directory names with special characters", async () => {
      const dirWithSpecial = join(testDir, "dir-with_special.chars");
      await mkdir(dirWithSpecial, { recursive: true });

      const tab: WorkspaceTab =
        await contextManager.createContext(dirWithSpecial);

      expect(tab.path).toBe(dirWithSpecial);
      expect(tab.name).toBe("dir-with_special.chars");
    });

    test("handles symlinks to directories", async () => {
      const { symlink } = await import("node:fs/promises");
      const symlinkPath = join(testDir, "symlink-to-git");

      try {
        await symlink(gitRepoDir, symlinkPath);
      } catch (e) {
        // Skip test if symlinks not supported
        console.log("Skipping symlink test:", e);
        return;
      }

      const tab: WorkspaceTab = await contextManager.createContext(symlinkPath);

      expect(tab.id).toBeDefined();
      expect(tab.name).toBe("symlink-to-git");
    });
  });

  describe("concurrent operations", () => {
    test("handles concurrent context creation", async () => {
      const dirs = [gitRepoDir, nonGitDir, nestedGitDir];

      const tabs = await Promise.all(
        dirs.map((dir) => contextManager.createContext(dir)),
      );

      expect(tabs).toHaveLength(3);
      expect(new Set(tabs.map((t) => t.id)).size).toBe(3); // All unique IDs
    });

    test("handles concurrent getContext calls", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      const results = await Promise.all(
        Array(10)
          .fill(null)
          .map(() => contextManager.getContext(tab.id)),
      );

      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.id).toBe(tab.id);
      });
    });
  });

  describe("worktree support", () => {
    let worktreeDir: string;

    beforeEach(async () => {
      // Create a worktree directory with .git file (not directory)
      worktreeDir = join(testDir, "worktree");
      await mkdir(worktreeDir, { recursive: true });

      // Create .git file with gitdir reference
      const gitFilePath = join(worktreeDir, ".git");
      await writeFile(
        gitFilePath,
        "gitdir: /path/to/main/repo/.git/worktrees/feature-branch\n",
      );
    });

    test("recognizes worktree as git repository", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(worktreeDir);

      expect(tab.isGitRepo).toBe(true);
      expect(tab.isWorktree).toBe(true);
    });

    test("extracts worktree metadata in createContext", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(worktreeDir);

      expect(tab.isWorktree).toBe(true);
      expect(tab.mainRepositoryPath).toBe("/path/to/main/repo");
      expect(tab.worktreeName).toBe("feature-branch");
      expect(tab.name).toBe("repo:feature-branch");
    });

    test("validateDirectory detects worktree", async () => {
      const validation: DirectoryValidation =
        await contextManager.validateDirectory(worktreeDir);

      expect(validation.valid).toBe(true);
      expect(validation.isGitRepo).toBe(true);
      expect(validation.isWorktree).toBe(true);
      expect(validation.mainRepositoryPath).toBe("/path/to/main/repo");
    });

    test("main repository has isWorktree=false", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(gitRepoDir);

      expect(tab.isGitRepo).toBe(true);
      expect(tab.isWorktree).toBe(false);
      expect(tab.mainRepositoryPath).toBeNull();
      expect(tab.worktreeName).toBeNull();
    });

    test("non-git directory has isWorktree=false", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(nonGitDir);

      expect(tab.isGitRepo).toBe(false);
      expect(tab.isWorktree).toBe(false);
      expect(tab.mainRepositoryPath).toBeNull();
      expect(tab.worktreeName).toBeNull();
    });

    test("handles invalid .git file (not gitdir format)", async () => {
      const invalidWorktreeDir = join(testDir, "invalid-worktree");
      await mkdir(invalidWorktreeDir, { recursive: true });
      await writeFile(
        join(invalidWorktreeDir, ".git"),
        "not a valid gitdir reference",
      );

      const tab: WorkspaceTab =
        await contextManager.createContext(invalidWorktreeDir);

      expect(tab.isGitRepo).toBe(false);
      expect(tab.isWorktree).toBe(false);
    });

    test("stores worktree context in manager", async () => {
      const tab: WorkspaceTab = await contextManager.createContext(worktreeDir);

      const retrieved = contextManager.getContext(tab.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.isWorktree).toBe(true);
      expect(retrieved?.mainRepositoryPath).toBe("/path/to/main/repo");
      expect(retrieved?.worktreeName).toBe("feature-branch");
    });
  });
});
