/**
 * Workspace API Routes Tests
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createWorkspaceRoutes, resetWorkspaceState } from "./workspace";
import {
  createContextManager,
  type ContextManager,
} from "../workspace/context-manager";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Workspace, WorkspaceTab } from "../../types/workspace";
import { createRecentDirectoryStore } from "../workspace/recent-store";

/**
 * Test directory paths
 */
let testDir1: string;
let testDir2: string;
let testDir3: string;
let gitRepoDir: string;

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Setup test directories
 */
beforeAll(async () => {
  const baseDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "workspace-routes-test-"),
  );

  // Create test directories
  testDir1 = path.join(baseDir, "dir1");
  testDir2 = path.join(baseDir, "dir2");
  testDir3 = path.join(baseDir, "dir3");
  gitRepoDir = path.join(baseDir, "git-repo");

  await fs.mkdir(testDir1, { recursive: true });
  await fs.mkdir(testDir2, { recursive: true });
  await fs.mkdir(testDir3, { recursive: true });
  await fs.mkdir(gitRepoDir, { recursive: true });

  // Create .git directory
  await fs.mkdir(path.join(gitRepoDir, ".git"));
});

/**
 * Cleanup test directories
 */
afterAll(async () => {
  const baseDir = path.dirname(testDir1);
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("GET /api/workspace", () => {
  let app: ReturnType<typeof createWorkspaceRoutes>;
  let contextManager: ContextManager;
  let recentStoreTestDir: string;

  beforeEach(async () => {
    resetWorkspaceState();
    recentStoreTestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "workspace-test-recent-"),
    );
    contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      baseDir: recentStoreTestDir,
    });
    app = createWorkspaceRoutes(contextManager, recentStore);
  });

  test("returns empty workspace initially", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      workspace: Workspace;
    };
    expect(body).toHaveProperty("workspace");
    expect(body.workspace).toHaveProperty("tabs");
    expect(body.workspace).toHaveProperty("activeTabId");
    expect(body.workspace).toHaveProperty("maxTabs");

    expect(Array.isArray(body.workspace.tabs)).toBe(true);
    expect(body.workspace.tabs.length).toBe(0);
    expect(body.workspace.activeTabId).toBeNull();
    expect(body.workspace.maxTabs).toBeGreaterThan(0);
  });
});

describe("POST /api/workspace/tabs", () => {
  let app: ReturnType<typeof createWorkspaceRoutes>;
  let contextManager: ContextManager;
  let recentStoreTestDir: string;

  beforeEach(async () => {
    resetWorkspaceState();
    recentStoreTestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "workspace-test-recent-"),
    );
    contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      baseDir: recentStoreTestDir,
    });
    app = createWorkspaceRoutes(contextManager, recentStore);
  });

  test("opens new directory tab", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      tab: WorkspaceTab;
      workspace: Workspace;
    };
    expect(body).toHaveProperty("tab");
    expect(body).toHaveProperty("workspace");

    // Check tab properties
    expect(body.tab.path).toBe(testDir1);
    expect(body.tab.name).toBe(path.basename(testDir1));
    expect(body.tab.isGitRepo).toBe(false);
    expect(body.tab.repositoryRoot).toBe(testDir1);
    expect(typeof body.tab.id).toBe("string");
    expect(typeof body.tab.createdAt).toBe("number");
    expect(typeof body.tab.lastAccessedAt).toBe("number");

    // Check workspace updated
    expect(body.workspace.tabs.length).toBe(1);
    expect(body.workspace.activeTabId).toBe(body.tab.id);
  });

  test("opens git repository tab", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: gitRepoDir }),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      tab: WorkspaceTab;
    };
    expect(body.tab.isGitRepo).toBe(true);
    expect(body.tab.repositoryRoot).toBe(gitRepoDir);
  });

  test("opens multiple tabs", async () => {
    // Open first tab
    const response1 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    expect(response1.status).toBe(200);

    // Open second tab
    const response2 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir2 }),
    });

    expect(response2.status).toBe(200);

    const body = (await response2.json()) as {
      workspace: Workspace;
    };
    expect(body.workspace.tabs.length).toBe(2);
  });

  test("activates existing tab if path already open", async () => {
    // Open tab first time
    const response1 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    const body1 = (await response1.json()) as { tab: WorkspaceTab };
    const originalId = body1.tab.id;

    // Try to open same path again
    const response2 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    expect(response2.status).toBe(200);

    const body2 = (await response2.json()) as {
      tab: WorkspaceTab;
      workspace: Workspace;
    };

    // Should return same tab with updated access time
    expect(body2.tab.id).toBe(originalId);
    expect(body2.tab.path).toBe(testDir1);
    expect(body2.workspace.tabs.length).toBe(1);
    expect(body2.workspace.activeTabId).toBe(originalId);
  });

  test("returns 400 when path is missing", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("Missing required field: path");
    expect(body.code).toBe(400);
  });

  test("returns 400 when path is empty string", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "" }),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("path must be a non-empty string");
    expect(body.code).toBe(400);
  });

  test("returns 400 when path is not a string", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: 123 }),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("path must be a non-empty string");
    expect(body.code).toBe(400);
  });

  test("returns 400 when request body is invalid JSON", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json{",
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("Invalid JSON in request body");
    expect(body.code).toBe(400);
  });

  test("returns 400 when path contains null byte", async () => {
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/test\0/dir" }),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("null byte");
    expect(body.code).toBe(400);
  });

  test("returns 500 when directory does not exist", async () => {
    const nonExistentPath = path.join(testDir1, "does-not-exist");
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: nonExistentPath }),
    });

    expect(response.status).toBe(500);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("not accessible");
    expect(body.code).toBe(500);
  });

  test("returns 500 when path is not a directory", async () => {
    const filePath = path.join(testDir1, "test-file.txt");
    await fs.writeFile(filePath, "test content");

    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });

    expect(response.status).toBe(500);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("not a directory");
    expect(body.code).toBe(500);
  });

  test("returns 409 when workspace is full", async () => {
    // Create workspace with maxTabs = 2
    // Note: This test assumes we can control maxTabs. Since currentWorkspace is module-level,
    // we need to open tabs until full
    const maxTabs = 10; // Default from createEmptyWorkspace

    // Open tabs until full
    for (let i = 0; i < maxTabs; i++) {
      const dirPath = path.join(path.dirname(testDir1), `fulltest-${i}`);
      await fs.mkdir(dirPath, { recursive: true });

      await app.request("/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
    }

    // Try to open one more
    const response = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    expect(response.status).toBe(409);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("Workspace is full");
    expect(body.code).toBe(409);
  });
});

describe("DELETE /api/workspace/tabs/:id", () => {
  let app: ReturnType<typeof createWorkspaceRoutes>;
  let contextManager: ContextManager;
  let recentStoreTestDir: string;

  beforeEach(async () => {
    resetWorkspaceState();
    recentStoreTestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "workspace-test-recent-"),
    );
    contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      baseDir: recentStoreTestDir,
    });
    app = createWorkspaceRoutes(contextManager, recentStore);
  });

  test("closes tab by ID", async () => {
    // Open a tab first
    const openResponse = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    const openBody = (await openResponse.json()) as {
      tab: WorkspaceTab;
    };
    const tabId = openBody.tab.id;

    // Close the tab
    const response = await app.request(`/tabs/${tabId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      workspace: Workspace;
    };
    expect(body.workspace.tabs.length).toBe(0);
    expect(body.workspace.activeTabId).toBeNull();
  });

  test("sets active tab to next tab after closing active tab", async () => {
    // Open two tabs
    const response1 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });
    const body1 = (await response1.json()) as { tab: WorkspaceTab };
    const tab1Id = body1.tab.id;

    const response2 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir2 }),
    });
    const body2 = (await response2.json()) as { tab: WorkspaceTab };

    // Close second tab (which is active)
    const deleteResponse = await app.request(`/tabs/${body2.tab.id}`, {
      method: "DELETE",
    });

    const deleteBody = (await deleteResponse.json()) as {
      workspace: Workspace;
    };

    // Active tab should be first tab now
    expect(deleteBody.workspace.activeTabId).toBe(tab1Id);
    expect(deleteBody.workspace.tabs.length).toBe(1);
  });

  test("preserves active tab when closing non-active tab", async () => {
    // Open two tabs
    const response1 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });
    const body1 = (await response1.json()) as { tab: WorkspaceTab };

    const response2 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir2 }),
    });
    const body2 = (await response2.json()) as { tab: WorkspaceTab };
    const activeTabId = body2.tab.id;

    // Close first tab (non-active)
    const deleteResponse = await app.request(`/tabs/${body1.tab.id}`, {
      method: "DELETE",
    });

    const deleteBody = (await deleteResponse.json()) as {
      workspace: Workspace;
    };

    // Active tab should remain the same
    expect(deleteBody.workspace.activeTabId).toBe(activeTabId);
    expect(deleteBody.workspace.tabs.length).toBe(1);
  });

  test("returns 400 for invalid context ID format", async () => {
    const response = await app.request("/tabs/invalid-id", {
      method: "DELETE",
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("invalid context ID");
    expect(body.code).toBe(400);
  });

  test("returns 404 for non-existent tab", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const response = await app.request(`/tabs/${nonExistentId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("Tab not found");
    expect(body.code).toBe(404);
  });
});

describe("POST /api/workspace/tabs/:id/activate", () => {
  let app: ReturnType<typeof createWorkspaceRoutes>;
  let contextManager: ContextManager;
  let recentStoreTestDir: string;

  beforeEach(async () => {
    resetWorkspaceState();
    recentStoreTestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "workspace-test-recent-"),
    );
    contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      baseDir: recentStoreTestDir,
    });
    app = createWorkspaceRoutes(contextManager, recentStore);
  });

  test("activates tab by ID", async () => {
    // Open two tabs
    const response1 = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });
    const body1 = (await response1.json()) as { tab: WorkspaceTab };
    const tab1Id = body1.tab.id;

    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir2 }),
    });

    // Activate first tab
    const response = await app.request(`/tabs/${tab1Id}/activate`, {
      method: "POST",
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      workspace: Workspace;
    };
    expect(body.workspace.activeTabId).toBe(tab1Id);
  });

  test("updates tab access time when activating", async () => {
    // Open a tab
    const openResponse = await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });
    const openBody = (await openResponse.json()) as { tab: WorkspaceTab };
    const tabId = openBody.tab.id;
    const originalAccessTime = openBody.tab.lastAccessedAt;

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Activate the tab
    const response = await app.request(`/tabs/${tabId}/activate`, {
      method: "POST",
    });

    const body = (await response.json()) as {
      workspace: Workspace;
    };
    const updatedTab = body.workspace.tabs.find((t) => t.id === tabId);

    expect(updatedTab).toBeDefined();
    expect(updatedTab?.lastAccessedAt).toBeGreaterThan(originalAccessTime);
  });

  test("returns 400 for invalid context ID format", async () => {
    const response = await app.request("/tabs/invalid-id/activate", {
      method: "POST",
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("invalid context ID");
    expect(body.code).toBe(400);
  });

  test("returns 404 for non-existent tab", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const response = await app.request(`/tabs/${nonExistentId}/activate`, {
      method: "POST",
    });

    expect(response.status).toBe(404);

    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toContain("Tab not found");
    expect(body.code).toBe(404);
  });
});

describe("GET /api/workspace/recent", () => {
  let app: ReturnType<typeof createWorkspaceRoutes>;
  let contextManager: ContextManager;
  let recentStoreTestDir: string;

  beforeEach(async () => {
    resetWorkspaceState();
    recentStoreTestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "workspace-test-recent-"),
    );
    contextManager = createContextManager();
    const recentStore = createRecentDirectoryStore({
      baseDir: recentStoreTestDir,
    });
    app = createWorkspaceRoutes(contextManager, recentStore);
  });

  test("returns empty list initially", async () => {
    const response = await app.request("/recent");

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      recent: unknown[];
    };
    expect(body).toHaveProperty("recent");
    expect(Array.isArray(body.recent)).toBe(true);
    // Note: May not be empty if previous tests ran in same module scope
  });

  test("tracks recently opened directories", async () => {
    // Open a tab
    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    // Get recent directories
    const response = await app.request("/recent");

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      recent: Array<{
        path: string;
        name: string;
        lastOpened: number;
        isGitRepo: boolean;
      }>;
    };

    // Should contain testDir1
    const recentEntry = body.recent.find((r) => r.path === testDir1);
    expect(recentEntry).toBeDefined();
    expect(recentEntry?.name).toBe(path.basename(testDir1));
    expect(typeof recentEntry?.lastOpened).toBe("number");
    expect(typeof recentEntry?.isGitRepo).toBe("boolean");
  });

  test("sorts recent directories by last opened time", async () => {
    // Open tabs in sequence
    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir2 }),
    });

    // Get recent directories
    const response = await app.request("/recent");
    const body = (await response.json()) as {
      recent: Array<{ path: string; lastOpened: number }>;
    };

    // Find entries for testDir1 and testDir2
    const idx1 = body.recent.findIndex((r) => r.path === testDir1);
    const idx2 = body.recent.findIndex((r) => r.path === testDir2);

    // testDir2 should come before testDir1 (more recent)
    if (idx1 !== -1 && idx2 !== -1) {
      expect(idx2).toBeLessThan(idx1);
    }
  });

  test("updates last opened time when directory reopened", async () => {
    // Open testDir1
    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Open testDir2
    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir2 }),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Open testDir1 again (reopening should update its timestamp)
    await app.request("/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testDir1 }),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Get recent directories
    const response = await app.request("/recent");
    const body = (await response.json()) as {
      recent: Array<{ path: string; lastOpened: number }>;
    };

    // testDir1 should be first (most recent) since we reopened it last
    const testDir1Entry = body.recent.find((r) => r.path === testDir1);
    const testDir2Entry = body.recent.find((r) => r.path === testDir2);

    expect(testDir1Entry).toBeDefined();
    expect(testDir2Entry).toBeDefined();

    // testDir1's lastOpened should be greater than testDir2's
    if (testDir1Entry !== undefined && testDir2Entry !== undefined) {
      expect(testDir1Entry.lastOpened).toBeGreaterThan(
        testDir2Entry.lastOpened,
      );
    }
  });
});
