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
  sortRecentDirectories,
} from "../../types/workspace";

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
 * In-memory recent directories
 * In a production app, this would be persisted and per-user
 */
const recentDirectories: RecentDirectory[] = [];

/**
 * Maximum number of recent directories to track
 */
const MAX_RECENT_DIRECTORIES = 20;

/**
 * Reset workspace state (for testing)
 *
 * @internal
 */
export function resetWorkspaceState(): void {
  currentWorkspace = createEmptyWorkspace(10);
  recentDirectories.length = 0;
}

/**
 * Add directory to recent list
 *
 * @param tab - Workspace tab to add to recent list
 */
function addToRecentDirectories(tab: WorkspaceTab): void {
  const existingIndex = recentDirectories.findIndex(
    (dir) => dir.path === tab.path,
  );

  // Update existing entry
  if (existingIndex !== -1) {
    const existing = recentDirectories[existingIndex];
    if (existing !== undefined) {
      recentDirectories[existingIndex] = {
        ...existing,
        lastOpened: Date.now(),
      };
    }
  } else {
    // Add new entry
    const newEntry: RecentDirectory = {
      path: tab.path,
      name: tab.name,
      lastOpened: Date.now(),
      isGitRepo: tab.isGitRepo,
    };

    recentDirectories.push(newEntry);

    // Trim to max size
    if (recentDirectories.length > MAX_RECENT_DIRECTORIES) {
      // Remove oldest entries
      const sorted = sortRecentDirectories(recentDirectories);
      recentDirectories.length = 0;
      recentDirectories.push(...sorted.slice(0, MAX_RECENT_DIRECTORIES));
    }
  }
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
 * @returns Hono app with workspace routes mounted
 */
export function createWorkspaceRoutes(contextManager: ContextManager): Hono {
  const app = new Hono();

  /**
   * GET /api/workspace
   *
   * Get current workspace state including all tabs and active tab ID.
   */
  app.get("/", (c) => {
    const response: WorkspaceResponse = {
      workspace: currentWorkspace,
    };
    return c.json(response);
  });

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
      addToRecentDirectories(updatedTab);

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
      addToRecentDirectories(tab);

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
  app.delete("/tabs/:id", (c) => {
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
  app.post("/tabs/:id/activate", (c) => {
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
  app.get("/recent", (c) => {
    const sorted = sortRecentDirectories(recentDirectories);
    const response: RecentDirectoriesResponse = {
      recent: sorted.slice(0, MAX_RECENT_DIRECTORIES),
    };
    return c.json(response);
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
