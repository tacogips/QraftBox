/**
 * Unit tests for GitHub URL parser
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseGitRemoteUrl, getRepoFromRemote } from "./url-parser.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("parseGitRemoteUrl", () => {
  describe("SSH format", () => {
    it("should parse SSH URL with .git extension", () => {
      const result = parseGitRemoteUrl("git@github.com:octocat/Hello-World.git");

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");
    });

    it("should parse SSH URL without .git extension", () => {
      const result = parseGitRemoteUrl("git@github.com:octocat/Hello-World");

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");
    });

    it("should parse SSH URL with special characters in repo name", () => {
      const result = parseGitRemoteUrl("git@github.com:org/repo-name_123.git");

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("org");
      expect(result?.repo).toBe("repo-name_123");
    });
  });

  describe("HTTPS format", () => {
    it("should parse HTTPS URL with .git extension", () => {
      const result = parseGitRemoteUrl(
        "https://github.com/octocat/Hello-World.git",
      );

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");
    });

    it("should parse HTTPS URL without .git extension", () => {
      const result = parseGitRemoteUrl(
        "https://github.com/octocat/Hello-World",
      );

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");
    });

    it("should parse HTTPS URL with special characters in repo name", () => {
      const result = parseGitRemoteUrl(
        "https://github.com/org/repo-name_123.git",
      );

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("org");
      expect(result?.repo).toBe("repo-name_123");
    });
  });

  describe("invalid URLs", () => {
    it("should return null for empty string", () => {
      const result = parseGitRemoteUrl("");

      expect(result).toBeNull();
    });

    it("should return null for whitespace-only string", () => {
      const result = parseGitRemoteUrl("   ");

      expect(result).toBeNull();
    });

    it("should return null for non-GitHub URL", () => {
      const result = parseGitRemoteUrl(
        "https://gitlab.com/owner/repo.git",
      );

      expect(result).toBeNull();
    });

    it("should return null for invalid SSH format", () => {
      const result = parseGitRemoteUrl("git@github.com/owner/repo.git");

      expect(result).toBeNull();
    });

    it("should return null for incomplete URL", () => {
      const result = parseGitRemoteUrl("https://github.com/owner");

      expect(result).toBeNull();
    });

    it("should return null for URL with extra path segments", () => {
      const result = parseGitRemoteUrl(
        "https://github.com/owner/repo/extra",
      );

      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle URL with leading/trailing whitespace", () => {
      const result = parseGitRemoteUrl(
        "  https://github.com/octocat/Hello-World.git  ",
      );

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");
    });

    it("should handle repo name with dots", () => {
      const result = parseGitRemoteUrl(
        "git@github.com:owner/repo.with.dots.git",
      );

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("owner");
      expect(result?.repo).toBe("repo.with.dots");
    });

    it("should handle repo name with hyphens", () => {
      const result = parseGitRemoteUrl(
        "git@github.com:owner/repo-with-hyphens.git",
      );

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("owner");
      expect(result?.repo).toBe("repo-with-hyphens");
    });
  });
});

describe("getRepoFromRemote", () => {
  let tempDir: string;
  let repoDir: string;

  beforeAll(async () => {
    // Create temporary directory for test repository
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aynd-test-"));
    repoDir = path.join(tempDir, "test-repo");
    await fs.mkdir(repoDir);

    // Initialize git repository
    await execAsync("git init", { cwd: repoDir });
    await execAsync('git config user.email "test@example.com"', {
      cwd: repoDir,
    });
    await execAsync('git config user.name "Test User"', { cwd: repoDir });
  });

  afterAll(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("with valid remote", () => {
    it("should get repo from origin remote (SSH)", async () => {
      await execAsync(
        "git remote add origin git@github.com:octocat/Hello-World.git",
        { cwd: repoDir },
      );

      const result = await getRepoFromRemote(repoDir, "origin");

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");

      // Clean up
      await execAsync("git remote remove origin", { cwd: repoDir });
    });

    it("should get repo from origin remote (HTTPS)", async () => {
      await execAsync(
        "git remote add origin https://github.com/octocat/Spoon-Knife.git",
        { cwd: repoDir },
      );

      const result = await getRepoFromRemote(repoDir, "origin");

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Spoon-Knife");

      // Clean up
      await execAsync("git remote remove origin", { cwd: repoDir });
    });

    it("should get repo from custom remote", async () => {
      await execAsync(
        "git remote add upstream git@github.com:upstream/repo.git",
        { cwd: repoDir },
      );

      const result = await getRepoFromRemote(repoDir, "upstream");

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("upstream");
      expect(result?.repo).toBe("repo");

      // Clean up
      await execAsync("git remote remove upstream", { cwd: repoDir });
    });

    it("should default to origin when no remote specified", async () => {
      await execAsync(
        "git remote add origin git@github.com:test/default.git",
        { cwd: repoDir },
      );

      const result = await getRepoFromRemote(repoDir);

      expect(result).not.toBeNull();
      expect(result?.owner).toBe("test");
      expect(result?.repo).toBe("default");

      // Clean up
      await execAsync("git remote remove origin", { cwd: repoDir });
    });
  });

  describe("error cases", () => {
    it("should return null for non-existent remote", async () => {
      const result = await getRepoFromRemote(repoDir, "nonexistent");

      expect(result).toBeNull();
    });

    it("should return null for empty cwd", async () => {
      const result = await getRepoFromRemote("", "origin");

      expect(result).toBeNull();
    });

    it("should return null for whitespace cwd", async () => {
      const result = await getRepoFromRemote("   ", "origin");

      expect(result).toBeNull();
    });

    it("should return null for empty remote name", async () => {
      const result = await getRepoFromRemote(repoDir, "");

      expect(result).toBeNull();
    });

    it("should return null for whitespace remote name", async () => {
      const result = await getRepoFromRemote(repoDir, "   ");

      expect(result).toBeNull();
    });

    it("should return null for non-existent directory", async () => {
      const result = await getRepoFromRemote("/nonexistent/path", "origin");

      expect(result).toBeNull();
    });

    it("should return null for non-GitHub remote", async () => {
      await execAsync(
        "git remote add gitlab https://gitlab.com/owner/repo.git",
        { cwd: repoDir },
      );

      const result = await getRepoFromRemote(repoDir, "gitlab");

      expect(result).toBeNull();

      // Clean up
      await execAsync("git remote remove gitlab", { cwd: repoDir });
    });
  });
});
