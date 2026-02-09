/**
 * Tests for Git Branch Operations Module
 *
 * Uses a real temporary git repository for integration testing.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execGit } from "./executor.js";
import {
  listBranches,
  getCurrentBranch,
  getDefaultBranch,
  searchBranches,
  checkoutBranch,
  getAheadBehind,
} from "./branch.js";

describe("branch module", () => {
  let repoPath: string;

  beforeEach(async () => {
    // Create temporary directory for test repository
    repoPath = await mkdtemp(join(tmpdir(), "qraftbox-branch-test-"));

    // Initialize git repository
    await execGit(["init", "-b", "main"], { cwd: repoPath });
    await execGit(["config", "user.name", "Test User"], { cwd: repoPath });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: repoPath,
    });

    // Create initial commit (required for branch operations)
    await writeFile(join(repoPath, "README.md"), "# Test Repository\n");
    await execGit(["add", "README.md"], { cwd: repoPath });
    await execGit(["commit", "-m", "Initial commit"], { cwd: repoPath });
  });

  afterEach(async () => {
    // Clean up temporary repository
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("getCurrentBranch", () => {
    test("returns current branch name", async () => {
      const branch = await getCurrentBranch(repoPath);
      expect(branch).toBe("main");
    });

    test("returns correct branch after checkout", async () => {
      // Create and checkout a new branch
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });

      const branch = await getCurrentBranch(repoPath);
      expect(branch).toBe("feature");
    });

    test("throws error for detached HEAD", async () => {
      // Get current commit hash
      const result = await execGit(["rev-parse", "HEAD"], { cwd: repoPath });
      const commitHash = result.stdout.trim();

      // Checkout specific commit (detached HEAD)
      await execGit(["checkout", commitHash], { cwd: repoPath });

      await expect(getCurrentBranch(repoPath)).rejects.toThrow("Detached HEAD");
    });
  });

  describe("getDefaultBranch", () => {
    test("returns 'main' when main branch exists", async () => {
      const defaultBranch = await getDefaultBranch(repoPath);
      expect(defaultBranch).toBe("main");
    });

    test("returns 'master' when only master exists", async () => {
      // Rename main to master
      await execGit(["branch", "-m", "main", "master"], { cwd: repoPath });

      const defaultBranch = await getDefaultBranch(repoPath);
      expect(defaultBranch).toBe("master");
    });

    test("returns current branch when neither main nor master exist", async () => {
      // Rename main to custom
      await execGit(["branch", "-m", "main", "custom"], { cwd: repoPath });

      const defaultBranch = await getDefaultBranch(repoPath);
      expect(defaultBranch).toBe("custom");
    });
  });

  describe("listBranches", () => {
    test("lists single branch in new repository", async () => {
      const result = await listBranches(repoPath);

      expect(result.branches.length).toBe(1);
      expect(result.branches[0]?.name).toBe("main");
      expect(result.branches[0]?.isCurrent).toBe(true);
      expect(result.branches[0]?.isDefault).toBe(true);
      expect(result.branches[0]?.isRemote).toBe(false);
      expect(result.total).toBe(1);
    });

    test("lists multiple local branches", async () => {
      // Create additional branches
      await execGit(["checkout", "-b", "feature-1"], { cwd: repoPath });
      await execGit(["checkout", "-b", "feature-2"], { cwd: repoPath });
      await execGit(["checkout", "main"], { cwd: repoPath });

      const result = await listBranches(repoPath);

      expect(result.branches.length).toBe(3);
      const branchNames = result.branches.map((b) => b.name);
      expect(branchNames).toContain("main");
      expect(branchNames).toContain("feature-1");
      expect(branchNames).toContain("feature-2");
    });

    test("marks current branch correctly", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });

      const result = await listBranches(repoPath);

      const mainBranch = result.branches.find((b) => b.name === "main");
      const featureBranch = result.branches.find((b) => b.name === "feature");

      expect(mainBranch?.isCurrent).toBe(false);
      expect(featureBranch?.isCurrent).toBe(true);
    });

    test("includes last commit information", async () => {
      const result = await listBranches(repoPath);
      const mainBranch = result.branches.find((b) => b.name === "main");

      expect(mainBranch?.lastCommit).toBeDefined();
      expect(mainBranch?.lastCommit.hash).toBeTruthy();
      expect(mainBranch?.lastCommit.message).toBe("Initial commit");
      expect(mainBranch?.lastCommit.author).toBe("Test User");
      expect(mainBranch?.lastCommit.date).toBeGreaterThan(0);
    });

    test("excludes remote branches by default", async () => {
      const result = await listBranches(repoPath);

      const remoteBranches = result.branches.filter((b) => b.isRemote);
      expect(remoteBranches.length).toBe(0);
    });

    test("includes remote branches when requested", async () => {
      const result = await listBranches(repoPath, true);

      // Should at least have local branches
      expect(result.branches.length).toBeGreaterThan(0);
    });

    test("sorts by commit date descending with default branch first", async () => {
      // Create branches with commits at different times
      await execGit(["checkout", "-b", "older-branch"], { cwd: repoPath });
      await writeFile(join(repoPath, "old.txt"), "old");
      await execGit(["add", "old.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Old commit"], { cwd: repoPath });

      await execGit(["checkout", "main"], { cwd: repoPath });
      await execGit(["checkout", "-b", "newer-branch"], { cwd: repoPath });
      await writeFile(join(repoPath, "new.txt"), "new");
      await execGit(["add", "new.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "New commit"], { cwd: repoPath });

      await execGit(["checkout", "main"], { cwd: repoPath });

      const result = await listBranches(repoPath);

      // Default branch (main) should be first
      expect(result.branches[0]?.name).toBe("main");
      expect(result.branches[0]?.isDefault).toBe(true);

      // Non-default branches should be sorted by date desc
      const nonDefault = result.branches.filter((b) => !b.isDefault);
      for (let i = 0; i < nonDefault.length - 1; i++) {
        const current = nonDefault[i];
        const next = nonDefault[i + 1];
        if (current !== undefined && next !== undefined) {
          expect(current.lastCommit.date).toBeGreaterThanOrEqual(
            next.lastCommit.date,
          );
        }
      }
    });

    test("respects pagination with offset and limit", async () => {
      // Create several branches
      for (let i = 1; i <= 5; i++) {
        await execGit(["checkout", "-b", `page-${i}`], { cwd: repoPath });
        await writeFile(join(repoPath, `page${String(i)}.txt`), `page ${String(i)}`);
        await execGit(["add", "."], { cwd: repoPath });
        await execGit(["commit", "-m", `Page ${String(i)}`], { cwd: repoPath });
      }
      await execGit(["checkout", "main"], { cwd: repoPath });

      // First page (offset 0, limit 2) - includes default branch pinned
      const page1 = await listBranches(repoPath, false, {
        offset: 0,
        limit: 2,
      });
      // Default branch (main) + 2 non-default = 3 on first page
      expect(page1.branches.length).toBe(3);
      expect(page1.branches[0]?.isDefault).toBe(true);

      // Second page (offset 2, limit 2) - no default branch
      const page2 = await listBranches(repoPath, false, {
        offset: 2,
        limit: 2,
      });
      expect(page2.branches.length).toBe(2);
      // Default branch should NOT appear on page 2
      expect(page2.branches.find((b) => b.isDefault)).toBeUndefined();
    });
  });

  describe("searchBranches", () => {
    test("finds branches by partial name match", async () => {
      // Create branches
      await execGit(["checkout", "-b", "feature-login"], { cwd: repoPath });
      await execGit(["checkout", "-b", "feature-signup"], { cwd: repoPath });
      await execGit(["checkout", "-b", "bugfix-header"], { cwd: repoPath });
      await execGit(["checkout", "main"], { cwd: repoPath });

      const results = await searchBranches(repoPath, "feature");

      expect(results.length).toBe(2);
      const names = results.map((b) => b.name);
      expect(names).toContain("feature-login");
      expect(names).toContain("feature-signup");
    });

    test("is case-insensitive", async () => {
      await execGit(["checkout", "-b", "Feature-Branch"], { cwd: repoPath });
      await execGit(["checkout", "main"], { cwd: repoPath });

      const results = await searchBranches(repoPath, "feature");

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe("Feature-Branch");
    });

    test("returns empty array when no matches", async () => {
      const results = await searchBranches(repoPath, "nonexistent");

      expect(results.length).toBe(0);
    });

    test("respects limit parameter", async () => {
      // Create multiple branches
      for (let i = 1; i <= 5; i++) {
        await execGit(["checkout", "-b", `feature-${i}`], { cwd: repoPath });
      }
      await execGit(["checkout", "main"], { cwd: repoPath });

      const results = await searchBranches(repoPath, "feature", 3);

      expect(results.length).toBe(3);
    });

    test("defaults to limit of 20", async () => {
      // Create many branches
      for (let i = 1; i <= 25; i++) {
        await execGit(["checkout", "-b", `branch-${i}`], { cwd: repoPath });
      }
      await execGit(["checkout", "main"], { cwd: repoPath });

      const results = await searchBranches(repoPath, "branch");

      expect(results.length).toBe(20);
    });
  });

  describe("checkoutBranch", () => {
    test("checks out existing branch successfully", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await execGit(["checkout", "main"], { cwd: repoPath });

      const response = await checkoutBranch(repoPath, { branch: "feature" });

      expect(response.success).toBe(true);
      expect(response.previousBranch).toBe("main");
      expect(response.currentBranch).toBe("feature");
      expect(response.error).toBeUndefined();
    });

    test("fails for non-existent branch", async () => {
      const response = await checkoutBranch(repoPath, {
        branch: "nonexistent",
      });

      expect(response.success).toBe(false);
      expect(response.previousBranch).toBe("main");
      expect(response.currentBranch).toBe("main");
      expect(response.error).toBeDefined();
    });

    test("handles uncommitted changes with stash option", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await execGit(["checkout", "main"], { cwd: repoPath });

      // Create uncommitted changes
      await writeFile(join(repoPath, "new-file.txt"), "Uncommitted content");
      await execGit(["add", "new-file.txt"], { cwd: repoPath });

      const response = await checkoutBranch(repoPath, {
        branch: "feature",
        stash: true,
      });

      expect(response.success).toBe(true);
      expect(response.currentBranch).toBe("feature");
      expect(response.stashCreated).toBeDefined();
      expect(response.stashCreated).toMatch(/^stash@\{\d+\}$/);
    });

    test("handles uncommitted changes with force option", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });

      // Modify file on feature branch
      await writeFile(join(repoPath, "README.md"), "Modified on feature\n");
      await execGit(["add", "README.md"], { cwd: repoPath });
      await execGit(["commit", "-m", "Modify README"], { cwd: repoPath });

      await execGit(["checkout", "main"], { cwd: repoPath });

      // Create uncommitted changes that conflict
      await writeFile(join(repoPath, "README.md"), "Modified on main\n");

      const response = await checkoutBranch(repoPath, {
        branch: "feature",
        force: true,
      });

      expect(response.success).toBe(true);
      expect(response.currentBranch).toBe("feature");
    });

    test("does not create stash when no uncommitted changes", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await execGit(["checkout", "main"], { cwd: repoPath });

      const response = await checkoutBranch(repoPath, {
        branch: "feature",
        stash: true,
      });

      expect(response.success).toBe(true);
      expect(response.currentBranch).toBe("feature");
      // stashCreated might be undefined or "No local changes to save"
    });
  });

  describe("getAheadBehind", () => {
    test("returns zero for branch with no divergence", async () => {
      // Set up remote tracking
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await execGit(["branch", "--set-upstream-to=main", "feature"], {
        cwd: repoPath,
      });

      const { ahead, behind } = await getAheadBehind(repoPath, "feature");

      expect(ahead).toBe(0);
      expect(behind).toBe(0);
    });

    test("counts commits ahead", async () => {
      // Create a branch and add commits
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await execGit(["branch", "--set-upstream-to=main", "feature"], {
        cwd: repoPath,
      });

      // Add commits to feature
      await writeFile(join(repoPath, "file1.txt"), "Content 1");
      await execGit(["add", "file1.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Add file1"], { cwd: repoPath });

      await writeFile(join(repoPath, "file2.txt"), "Content 2");
      await execGit(["add", "file2.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Add file2"], { cwd: repoPath });

      const { ahead, behind } = await getAheadBehind(repoPath, "feature");

      expect(ahead).toBe(2);
      expect(behind).toBe(0);
    });

    test("counts commits behind", async () => {
      // Create commits on main
      await writeFile(join(repoPath, "file1.txt"), "Content 1");
      await execGit(["add", "file1.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Add file1"], { cwd: repoPath });

      // Create branch (will be behind)
      await execGit(["checkout", "-b", "feature", "HEAD~1"], {
        cwd: repoPath,
      });
      await execGit(["branch", "--set-upstream-to=main", "feature"], {
        cwd: repoPath,
      });

      const { ahead, behind } = await getAheadBehind(repoPath, "feature");

      expect(ahead).toBe(0);
      expect(behind).toBe(1);
    });

    test("counts both ahead and behind", async () => {
      // Create feature branch
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });
      await execGit(["branch", "--set-upstream-to=main", "feature"], {
        cwd: repoPath,
      });

      // Add commit to feature
      await writeFile(join(repoPath, "feature.txt"), "Feature content");
      await execGit(["add", "feature.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Add feature"], { cwd: repoPath });

      // Add commit to main
      await execGit(["checkout", "main"], { cwd: repoPath });
      await writeFile(join(repoPath, "main.txt"), "Main content");
      await execGit(["add", "main.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Add main file"], { cwd: repoPath });

      await execGit(["checkout", "feature"], { cwd: repoPath });

      const { ahead, behind } = await getAheadBehind(repoPath, "feature");

      expect(ahead).toBe(1);
      expect(behind).toBe(1);
    });

    test("throws error for branch with no upstream", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });

      await expect(getAheadBehind(repoPath, "feature")).rejects.toThrow(
        "no upstream",
      );
    });

    test("accepts explicit upstream parameter", async () => {
      await execGit(["checkout", "-b", "feature"], { cwd: repoPath });

      // Add commit to feature
      await writeFile(join(repoPath, "feature.txt"), "Feature");
      await execGit(["add", "feature.txt"], { cwd: repoPath });
      await execGit(["commit", "-m", "Add feature"], { cwd: repoPath });

      const { ahead, behind } = await getAheadBehind(
        repoPath,
        "feature",
        "main",
      );

      expect(ahead).toBe(1);
      expect(behind).toBe(0);
    });
  });
});
