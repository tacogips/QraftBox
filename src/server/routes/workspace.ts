/**
 * Workspace API Routes
 *
 * Provides REST API endpoints for managing workspace tabs and contexts.
 * Allows opening multiple directories in tabs, switching between contexts,
 * and tracking recent directories.
 */

import { Hono } from "hono";
import type { ContextManager } from "../workspace/context-manager";
import type {
  Workspace,
  WorkspaceTab,
  RecentDirectory,
  ValidationResult,
} from "../../types/workspace";
import {
  createEmptyWorkspace,
  validateContextId,
  validateDirectoryPath,
  findTabById,
  findTabByPath,
  findTabBySlug,
  isWorkspaceFull,
  updateTabAccessTime,
} from "../../types/workspace";
import type { RecentDirectoryStore } from "../workspace/recent-store";
import type { OpenTabsStore, OpenTabEntry } from "../workspace/open-tabs-store";
import type { ProjectWatcherManager } from "../watcher/manager";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for workspace state
 */
interface WorkspaceResponse {
  readonly workspace: Workspace;
  readonly metadata?: {
    readonly temporaryProjectMode: boolean;
    readonly canManageProjects: boolean;
  };
}

/**
 * Response for opening a new tab
 */
interface OpenTabResponse {
  readonly tab: WorkspaceTab;
  readonly workspace: Workspace;
}

/**
 * Response for recent directories
 */
interface RecentDirectoriesResponse {
  readonly recent: readonly RecentDirectory[];
}

/**
 * In-memory workspace state
 * In a production app, this would be stored per-user/session
 */
let currentWorkspace: Workspace = createEmptyWorkspace(10);

/**
 * Reset workspace state (for testing)
 *
 * @internal
 */
export function resetWorkspaceState(): void {
  currentWorkspace = createEmptyWorkspace(10);
}

/**
 * Add directory to recent list
 *
 * @param tab - Workspace tab to add to recent list
 * @param recentStore - Recent directory store
 * @returns Promise that resolves when operation completes
 */
async function addToRecentDirectories(
  tab: WorkspaceTab,
  recentStore: RecentDirectoryStore,
): Promise<void> {
  await recentStore.add({
    path: tab.path,
    name: tab.name,
    lastOpened: Date.now(),
    isGitRepo: tab.isGitRepo,
  });
}

/**
 * Persist workspace state to open tabs store
 *
 * Converts current workspace tabs into OpenTabEntry format and saves to store.
 * Only persists if openTabsStore is provided.
 *
 * @param workspace - Current workspace state
 * @param openTabsStore - Open tabs store instance
 * @returns Promise that resolves when save is complete
 */
async function persistWorkspaceState(
  workspace: Workspace,
  openTabsStore: OpenTabsStore | undefined,
): Promise<void> {
  if (openTabsStore === undefined) {
    return;
  }

  const openTabEntries: OpenTabEntry[] = workspace.tabs.map(
    (tab, tabIndex): OpenTabEntry => ({
      path: tab.path,
      name: tab.name,
      tabOrder: tabIndex,
      isActive: workspace.activeTabId === tab.id,
      isGitRepo: tab.isGitRepo,
    }),
  );

  await openTabsStore.save(openTabEntries);
}

/**
 * Create workspace routes
 *
 * Routes:
 * - GET /api/workspace - Get workspace state
 * - POST /api/workspace/tabs - Open new directory tab
 * - DELETE /api/workspace/tabs/:id - Close tab
 * - POST /api/workspace/tabs/:id/activate - Set active tab
 * - GET /api/workspace/recent - Get recent directories
 *
 * @param contextManager - Context manager instance
 * @param recentStore - Recent directory store
 * @param initialTabs - Optional initial tabs to populate workspace at startup
 * @param openTabsStore - Optional open tabs store for persistence
 * @param activeTabPath - Optional path to the active tab from restored state
 * @param watcherManager - Optional project watcher manager for file watching
 * @returns Hono app with workspace routes mounted
 */
export function createWorkspaceRoutes(
  contextManager: ContextManager,
  recentStore: RecentDirectoryStore,
  initialTabs?: readonly WorkspaceTab[] | undefined,
  openTabsStore?: OpenTabsStore | undefined,
  activeTabPath?: string | undefined,
  watcherManager?: ProjectWatcherManager | undefined,
  temporaryProjectMode = false,
): Hono {
  // Initialize workspace with initial tabs if provided
  if (initialTabs !== undefined && initialTabs.length > 0) {
    // Find active tab: prefer activeTabPath, fall back to first tab
    let activeTab: WorkspaceTab | undefined;
    if (activeTabPath !== undefined) {
      activeTab = initialTabs.find((tab) => tab.path === activeTabPath);
    }
    if (activeTab === undefined) {
      activeTab = initialTabs[0];
    }

    currentWorkspace = {
      tabs: [...initialTabs],
      activeTabId: activeTab !== undefined ? activeTab.id : null,
      maxTabs: 10,
    };

    // Persist initial workspace state
    void persistWorkspaceState(currentWorkspace, openTabsStore);
  }

  const app = new Hono();

  /**
   * GET /api/workspace
   *
   * Get current workspace state including all tabs and active tab ID.
   */
  app.get("/", (c) => {
    const response: WorkspaceResponse = {
      workspace: currentWorkspace,
      metadata: {
        temporaryProjectMode,
        canManageProjects: !temporaryProjectMode,
      },
    };
    return c.json(response);
  });

  const ensureProjectManagementEnabled = (): ErrorResponse | null => {
    if (!temporaryProjectMode) {
      return null;
    }
    return {
      error:
        "Project management is disabled in temporary project mode (qraftbox <path>)",
      code: 403,
    };
  };

  /**
   * POST /api/workspace/tabs
   *
   * Open a new directory in a workspace tab.
   *
   * Request body:
   * - path (required): Absolute path to directory
   *
   * Returns:
   * - tab: The newly created workspace tab
   * - workspace: Updated workspace state
   *
   * Error cases:
   * - 400: Missing path, invalid path format, path already open
   * - 409: Workspace is full (max tabs reached)
   * - 500: Failed to create context (directory inaccessible, not a directory, etc.)
   */
  app.post("/tabs", async (c) => {
    const managementError = ensureProjectManagementEnabled();
    if (managementError !== null) {
      return c.json(managementError, 403);
    }

    let requestBody: unknown;
    try {
      requestBody = await c.req.json();
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Extract path from request body
    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      !("path" in requestBody)
    ) {
      const errorResponse: ErrorResponse = {
        error: "Missing required field: path",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const pathParam = (requestBody as { path: unknown }).path;

    if (typeof pathParam !== "string" || pathParam.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "path must be a non-empty string",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Validate path format
    const validation: ValidationResult = validateDirectoryPath(pathParam);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid directory path",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Check if workspace is full
    if (isWorkspaceFull(currentWorkspace)) {
      const errorResponse: ErrorResponse = {
        error: `Workspace is full (maximum ${currentWorkspace.maxTabs} tabs)`,
        code: 409,
      };
      return c.json(errorResponse, 409);
    }

    // Check if path is already open
    const existingTab = findTabByPath(currentWorkspace, pathParam);
    if (existingTab !== undefined) {
      // Update access time and make it active
      const updatedTab = updateTabAccessTime(existingTab);
      currentWorkspace = {
        ...currentWorkspace,
        tabs: currentWorkspace.tabs.map((tab) =>
          tab.id === updatedTab.id ? updatedTab : tab,
        ),
        activeTabId: updatedTab.id,
      };

      // Update recent directories (reopening counts as recent access)
      await addToRecentDirectories(updatedTab, recentStore);

      // Persist workspace state
      await persistWorkspaceState(currentWorkspace, openTabsStore);

      const response: OpenTabResponse = {
        tab: updatedTab,
        workspace: currentWorkspace,
      };
      return c.json(response);
    }

    try {
      // Create new context
      const tab: WorkspaceTab = await contextManager.createContext(pathParam);

      // Add to workspace
      currentWorkspace = {
        ...currentWorkspace,
        tabs: [...currentWorkspace.tabs, tab],
        activeTabId: tab.id,
      };

      // Add to recent directories
      await addToRecentDirectories(tab, recentStore);

      // Persist workspace state
      await persistWorkspaceState(currentWorkspace, openTabsStore);

      // Add watcher for this project path
      if (watcherManager !== undefined) {
        await watcherManager.addProject(tab.path);
      }

      const response: OpenTabResponse = {
        tab,
        workspace: currentWorkspace,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to create context";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/workspace/tabs/by-slug/:slug
   *
   * Open or activate a workspace tab by registered project slug.
   *
   * Path parameters:
   * - slug: Project slug (e.g. qraftbox-dd412c)
   *
   * Returns:
   * - tab: The opened or activated workspace tab
   * - workspace: Updated workspace state
   *
   * Error cases:
   * - 400: Missing/invalid slug
   * - 404: Slug is not registered
   * - 409: Workspace is full
   * - 500: Failed to create context
   */
  app.post("/tabs/by-slug/:slug", async (c) => {
    const managementError = ensureProjectManagementEnabled();
    if (managementError !== null) {
      return c.json(managementError, 403);
    }

    const slug = c.req.param("slug").trim();
    if (slug.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "slug must be a non-empty string",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const resolvedPath = await contextManager
      .getProjectRegistry()
      .resolveSlug(slug);
    if (resolvedPath === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Unknown project slug: ${slug}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Check if path is already open
    const existingTab = findTabByPath(currentWorkspace, resolvedPath);
    if (existingTab !== undefined) {
      const updatedTab = updateTabAccessTime(existingTab);
      currentWorkspace = {
        ...currentWorkspace,
        tabs: currentWorkspace.tabs.map((tab) =>
          tab.id === updatedTab.id ? updatedTab : tab,
        ),
        activeTabId: updatedTab.id,
      };

      await addToRecentDirectories(updatedTab, recentStore);
      await persistWorkspaceState(currentWorkspace, openTabsStore);

      const response: OpenTabResponse = {
        tab: updatedTab,
        workspace: currentWorkspace,
      };
      return c.json(response);
    }

    if (isWorkspaceFull(currentWorkspace)) {
      const errorResponse: ErrorResponse = {
        error: `Workspace is full (maximum ${currentWorkspace.maxTabs} tabs)`,
        code: 409,
      };
      return c.json(errorResponse, 409);
    }

    try {
      const tab: WorkspaceTab =
        await contextManager.createContext(resolvedPath);
      currentWorkspace = {
        ...currentWorkspace,
        tabs: [...currentWorkspace.tabs, tab],
        activeTabId: tab.id,
      };

      await addToRecentDirectories(tab, recentStore);
      await persistWorkspaceState(currentWorkspace, openTabsStore);

      if (watcherManager !== undefined) {
        await watcherManager.addProject(tab.path);
      }

      const response: OpenTabResponse = {
        tab,
        workspace: currentWorkspace,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to create context";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * DELETE /api/workspace/tabs/:id
   *
   * Close a workspace tab and remove its context.
   *
   * Path parameters:
   * - id: Context ID of the tab to close
   *
   * Returns:
   * - workspace: Updated workspace state
   *
   * Error cases:
   * - 400: Invalid context ID format
   * - 404: Tab not found
   */
  app.delete("/tabs/:id", async (c) => {
    const managementError = ensureProjectManagementEnabled();
    if (managementError !== null) {
      return c.json(managementError, 403);
    }

    const id = c.req.param("id");

    // Validate context ID format
    const validation: ValidationResult = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Find tab
    const tab = findTabById(currentWorkspace, id);
    if (tab === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Tab not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Remove context from manager
    contextManager.removeContext(id);

    // Remove tab from workspace
    const remainingTabs = currentWorkspace.tabs.filter((t) => t.id !== id);

    // Update active tab if necessary
    let newActiveTabId = currentWorkspace.activeTabId;
    if (currentWorkspace.activeTabId === id) {
      // Set active tab to the first remaining tab, or null if none
      const firstTab = remainingTabs[0];
      newActiveTabId = firstTab !== undefined ? firstTab.id : null;
    }

    currentWorkspace = {
      ...currentWorkspace,
      tabs: remainingTabs,
      activeTabId: newActiveTabId,
    };

    // Persist workspace state
    await persistWorkspaceState(currentWorkspace, openTabsStore);

    // Remove watcher if no other tabs share the same path
    if (watcherManager !== undefined) {
      const otherTabsWithSamePath = remainingTabs.some(
        (remainingTab) => remainingTab.path === tab.path,
      );
      if (!otherTabsWithSamePath) {
        await watcherManager.removeProject(tab.path);
      }
    }

    const response: WorkspaceResponse = {
      workspace: currentWorkspace,
    };
    return c.json(response);
  });

  /**
   * POST /api/workspace/tabs/:id/activate
   *
   * Set the active tab in the workspace.
   *
   * Path parameters:
   * - id: Context ID of the tab to activate
   *
   * Returns:
   * - workspace: Updated workspace state
   *
   * Error cases:
   * - 400: Invalid context ID format
   * - 404: Tab not found
   */
  app.post("/tabs/:id/activate", async (c) => {
    const managementError = ensureProjectManagementEnabled();
    if (managementError !== null) {
      return c.json(managementError, 403);
    }

    const id = c.req.param("id");

    // Validate context ID format
    const validation: ValidationResult = validateContextId(id);
    if (!validation.valid) {
      const errorResponse: ErrorResponse = {
        error: validation.error ?? "Invalid context ID",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    // Find tab
    const tab = findTabById(currentWorkspace, id);
    if (tab === undefined) {
      const errorResponse: ErrorResponse = {
        error: `Tab not found: ${id}`,
        code: 404,
      };
      return c.json(errorResponse, 404);
    }

    // Update tab access time
    const updatedTab = updateTabAccessTime(tab);

    // Update workspace
    currentWorkspace = {
      ...currentWorkspace,
      tabs: currentWorkspace.tabs.map((t) =>
        t.id === updatedTab.id ? updatedTab : t,
      ),
      activeTabId: updatedTab.id,
    };

    // Persist workspace state
    await persistWorkspaceState(currentWorkspace, openTabsStore);

    const response: WorkspaceResponse = {
      workspace: currentWorkspace,
    };
    return c.json(response);
  });

  /**
   * GET /api/workspace/recent
   *
   * Get list of recently opened directories, sorted by most recent first.
   *
   * Returns up to 20 most recently opened directories.
   */
  app.get("/recent", async (c) => {
    const recent = await recentStore.getAll();
    const response: RecentDirectoriesResponse = {
      recent,
    };
    return c.json(response);
  });

  /**
   * DELETE /api/workspace/recent
   *
   * Remove a directory from the recent list by path.
   *
   * Request body:
   * - path (required): Absolute path to remove
   */
  app.delete("/recent", async (c) => {
    const managementError = ensureProjectManagementEnabled();
    if (managementError !== null) {
      return c.json(managementError, 403);
    }

    let requestBody: unknown;
    try {
      requestBody = await c.req.json();
    } catch {
      const errorResponse: ErrorResponse = {
        error: "Invalid JSON in request body",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      !("path" in requestBody)
    ) {
      const errorResponse: ErrorResponse = {
        error: "Missing required field: path",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const pathParam = (requestBody as { path: unknown }).path;
    if (typeof pathParam !== "string" || pathParam.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "path must be a non-empty string",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    await recentStore.remove(pathParam);
    return c.json({ ok: true });
  });

  /**
   * GET /api/workspace/by-slug/:slug
   *
   * Find a workspace tab by its project slug.
   * Used by the client to resolve URL hash slugs to context IDs.
   *
   * Returns:
   * - tab: The matching workspace tab (or null if not found)
   */
  app.get("/by-slug/:slug", (c) => {
    const slug = c.req.param("slug");
    const tab = findTabBySlug(currentWorkspace, slug);
    if (tab === undefined) {
      return c.json({ tab: null });
    }
    return c.json({ tab });
  });

  return app;
}
