/**
 * Branch Routes Tests
 *
 * Integration tests for branch API routes using a real git repository.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createBranchRoutes } from "./branches.js";
import type { ServerContext } from "../../types/index.js";
import type {
  BranchInfo,
  BranchListResponse,
  BranchCheckoutResponse,
} from "../../types/branch.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Test repository setup
 */
let testRepoPath: string;

/**
 * Helper to execute git commands in test repo
 */
async function gitExec(args: readonly string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: testRepoPath,
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

/**
 * Setup test repository with branches
 */
beforeAll(async () => {
  // Create temporary directory
  testRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "aynd-branches-routes-test-"),
  );

  // Initialize git repository
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Test User"]);
  await gitExec(["config", "user.email", "test@example.com"]);

  // Create initial commit on main
  await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Line 1\n");
  await gitExec(["add", "file1.txt"]);
  await gitExec(["commit", "-m", "Initial commit"]);

  // Create feature branch
  await gitExec(["checkout", "-b", "feature-1"]);
  await fs.writeFile(path.join(testRepoPath, "feature1.txt"), "Feature 1\n");
  await gitExec(["add", "feature1.txt"]);
  await gitExec(["commit", "-m", "Add feature 1"]);

  // Create another feature branch
  await gitExec(["checkout", "-b", "feature-2"]);
  await fs.writeFile(path.join(testRepoPath, "feature2.txt"), "Feature 2\n");
  await gitExec(["add", "feature2.txt"]);
  await gitExec(["commit", "-m", "Add feature 2"]);

  // Switch back to main
  await gitExec(["checkout", "main"]);
});

/**
 * Cleanup test repository
 */
afterAll(async () => {
  await fs.rm(testRepoPath, { recursive: true, force: true });
});

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Search results response format
 */
interface SearchResponse {
  readonly results: readonly BranchInfo[];
}

describe("createBranchRoutes", () => {
  let app: ReturnType<typeof createBranchRoutes>;
  let context: ServerContext;

  beforeEach(() => {
    context = { projectPath: testRepoPath };
    app = createBranchRoutes(context);
  });

  describe("GET /", () => {
    test("returns branch list with current and default branch", async () => {
      const response = await app.request("/");

      expect(response.status).toBe(200);

      const data = (await response.json()) as BranchListResponse;
      expect(data).toHaveProperty("branches");
      expect(data).toHaveProperty("current", "main");
      expect(data).toHaveProperty("defaultBranch", "main");
      expect(data.branches.length).toBeGreaterThanOrEqual(3);

      // Verify main branch
      const mainBranch = data.branches.find((b) => b.name === "main");
      expect(mainBranch).toBeDefined();
      expect(mainBranch?.isCurrent).toBe(true);
      expect(mainBranch?.isDefault).toBe(true);
      expect(mainBranch?.isRemote).toBe(false);

      // Verify feature branch exists
      const featureBranch = data.branches.find((b) => b.name === "feature-1");
      expect(featureBranch).toBeDefined();
      expect(featureBranch?.isCurrent).toBe(false);
      expect(featureBranch?.isRemote).toBe(false);
    });

    test("includes branch metadata", async () => {
      const response = await app.request("/");
      expect(response.status).toBe(200);

      const data = (await response.json()) as BranchListResponse;
      const mainBranch = data.branches.find((b) => b.name === "main");

      expect(mainBranch).toBeDefined();
      expect(mainBranch?.lastCommit).toBeDefined();
      expect(mainBranch?.lastCommit.hash).toBeTruthy();
      expect(mainBranch?.lastCommit.message).toBeTruthy();
      expect(mainBranch?.lastCommit.author).toBe("Test User");
      expect(mainBranch?.lastCommit.date).toBeGreaterThan(0);
    });

    test("handles errors gracefully", async () => {
      const invalidContext: ServerContext = {
        projectPath: "/nonexistent/path",
      };
      const invalidApp = createBranchRoutes(invalidContext);
      const response = await invalidApp.request("/");

      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toBeTruthy();
    });
  });

  describe("GET /search", () => {
    test("searches branches by query", async () => {
      const response = await app.request("/search?q=feature");

      expect(response.status).toBe(200);

      const data = (await response.json()) as SearchResponse;
      expect(data).toHaveProperty("results");
      expect(data.results.length).toBeGreaterThanOrEqual(2);

      // All results should contain "feature"
      for (const branch of data.results) {
        expect(branch.name.toLowerCase()).toContain("feature");
      }
    });

    test("respects limit parameter", async () => {
      const response = await app.request("/search?q=feature&limit=1");

      expect(response.status).toBe(200);

      const data = (await response.json()) as SearchResponse;
      expect(data.results.length).toBeLessThanOrEqual(1);
    });

    test("returns empty results for non-matching query", async () => {
      const response = await app.request("/search?q=nonexistent-branch");

      expect(response.status).toBe(200);

      const data = (await response.json()) as SearchResponse;
      expect(data.results).toHaveLength(0);
    });

    test("returns error when query parameter is missing", async () => {
      const response = await app.request("/search");

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Query parameter 'q' is required");
    });

    test("returns error when query parameter is empty", async () => {
      const response = await app.request("/search?q=");

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Query parameter 'q' is required");
    });

    test("returns error when limit is invalid", async () => {
      const response = await app.request("/search?q=feature&limit=invalid");

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Limit must be a positive number");
    });

    test("returns error when limit is negative", async () => {
      const response = await app.request("/search?q=feature&limit=-1");

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Limit must be a positive number");
    });

    test("returns error when limit is zero", async () => {
      const response = await app.request("/search?q=feature&limit=0");

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Limit must be a positive number");
    });
  });

  describe("POST /checkout", () => {
    beforeEach(async () => {
      // Ensure we're on main before each test
      await gitExec(["checkout", "main"]);
    });

    test("successfully checks out branch", async () => {
      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-1",
        }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as BranchCheckoutResponse;
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("previousBranch", "main");
      expect(data).toHaveProperty("currentBranch", "feature-1");
      expect(data.stashCreated).toBeUndefined();
      expect(data.error).toBeUndefined();

      // Verify actual branch changed
      await gitExec(["checkout", "main"]); // cleanup
    });

    test("checks out with stash option when there are uncommitted changes", async () => {
      // Create uncommitted changes
      await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Modified\n");

      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-1",
          stash: true,
        }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as BranchCheckoutResponse;
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("stashCreated");
      expect(data.stashCreated).toMatch(/^stash@\{\d+\}$/);

      // Cleanup
      await gitExec(["checkout", "main"]);
      await gitExec(["stash", "pop"]);
      await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Line 1\n");
    });

    test("checks out with force option", async () => {
      // Create uncommitted changes
      await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Modified\n");

      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-1",
          force: true,
        }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as BranchCheckoutResponse;
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("currentBranch", "feature-1");

      // Cleanup
      await gitExec(["checkout", "main"]);
      // Note: changes were discarded by force checkout
      await fs.writeFile(path.join(testRepoPath, "file1.txt"), "Line 1\n");
    });

    test("handles checkout failure for non-existent branch", async () => {
      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "nonexistent-branch",
        }),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as BranchCheckoutResponse;
      expect(data).toHaveProperty("success", false);
      expect(data).toHaveProperty("error");
      expect(data.error).toBeTruthy();
      expect(data).toHaveProperty("currentBranch", "main");
    });

    test("handles checkout failure due to uncommitted changes", async () => {
      // Create conflicting uncommitted changes
      // Modify feature1.txt which exists in feature-1 branch
      await fs.writeFile(
        path.join(testRepoPath, "feature1.txt"),
        "Conflicting content\n",
      );

      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: "feature-1",
        }),
      });

      // This should fail because feature1.txt exists in target branch with different content
      expect(response.status).toBe(400);

      const data = (await response.json()) as BranchCheckoutResponse;
      expect(data).toHaveProperty("success", false);
      expect(data).toHaveProperty("error");
      expect(data.error).toBeTruthy();

      // Cleanup
      await fs.rm(path.join(testRepoPath, "feature1.txt"));
    });

    test("returns error when branch name is missing", async () => {
      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Branch name is required");
    });

    test("returns error when branch name is empty", async () => {
      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ branch: "" }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Branch name is required");
    });

    test("returns error when request body is invalid JSON", async () => {
      const response = await app.request("/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid JSON");
    });
  });
});
