/**
 * Browse API Routes
 *
 * Provides REST API endpoints for directory browsing functionality to support
 * workspace directory selection and navigation.
 */

import { Hono } from "hono";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  DirectoryListingResponse,
  DirectoryEntry,
  ValidationResult,
} from "../../types/workspace";
import {
  validateDirectoryPath,
  sortDirectoryEntries,
} from "../../types/workspace";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Validate directory path response
 */
interface ValidateDirectoryResponse {
  readonly valid: boolean;
  readonly isGitRepo: boolean;
  readonly repositoryRoot?: string | undefined;
  readonly error?: string | undefined;
}

/**
 * Home directory response
 */
interface HomeDirectoryResponse {
  readonly path: string;
}

/**
 * Filesystem roots response
 */
interface FilesystemRootsResponse {
  readonly roots: readonly string[];
}

/**
 * Check if a directory is a git repository by looking for .git folder
 *
 * @param dirPath - Directory path to check
 * @returns True if directory contains .git folder
 */
async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, ".git");
    const stat = await fs.stat(gitPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find the git repository root by traversing up the directory tree
 *
 * @param dirPath - Starting directory path
 * @returns Repository root path if found, undefined otherwise
 */
async function findRepositoryRoot(
  dirPath: string,
): Promise<string | undefined> {
  let currentPath = path.resolve(dirPath);
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    if (await isGitRepository(currentPath)) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  // Check root itself
  if (await isGitRepository(root)) {
    return root;
  }

  return undefined;
}

/**
 * Create browse routes
 *
 * Routes:
 * - GET /api/browse - List directory contents
 * - POST /api/browse/validate - Validate directory path
 * - GET /api/browse/home - Get user home directory
 * - GET /api/browse/roots - Get filesystem roots
 *
 * @returns Hono app with browse routes mounted
 */
export function createBrowseRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /api/browse
   *
   * List directory contents with sorting (directories first, then files).
   *
   * Query parameters:
   * - path (required): Directory path to list
   */
  app.get("/", async (c) => {
    const pathParam = c.req.query("path");

    // Validate required parameter
    if (pathParam === undefined || pathParam.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Missing required parameter: path",
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

    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(pathParam);

      // Check if path exists and is a directory
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        const errorResponse: ErrorResponse = {
          error: `Path is not a directory: ${pathParam}`,
          code: 400,
        };
        return c.json(errorResponse, 400);
      }

      // Read directory contents
      const dirents = await fs.readdir(absolutePath, { withFileTypes: true });

      // Build directory entries
      const entries: DirectoryEntry[] = await Promise.all(
        dirents.map(async (dirent) => {
          const entryPath = path.join(absolutePath, dirent.name);
          const isDirectory = dirent.isDirectory();
          const isSymlink = dirent.isSymbolicLink();
          const isHidden = dirent.name.startsWith(".");

          // Check if directory is a git repo
          let isGitRepo = false;
          if (isDirectory) {
            isGitRepo = await isGitRepository(entryPath);
          }

          // Get modified time
          let modifiedAt = Date.now();
          try {
            const entryStat = await fs.stat(entryPath);
            modifiedAt = entryStat.mtimeMs;
          } catch {
            // Use current time if stat fails
          }

          const entry: DirectoryEntry = {
            name: dirent.name,
            path: entryPath,
            isDirectory,
            isGitRepo,
            isSymlink,
            isHidden,
            modifiedAt,
          };

          return entry;
        }),
      );

      // Sort entries (directories first, then alphabetically)
      const sortedEntries = sortDirectoryEntries(entries);

      // Determine parent path
      const parentPath = path.dirname(absolutePath);
      const canGoUp = absolutePath !== parentPath;

      // Build response
      const response: DirectoryListingResponse = {
        path: absolutePath,
        parentPath: canGoUp ? parentPath : null,
        entries: sortedEntries,
        canGoUp,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to read directory";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /api/browse/validate
   *
   * Validate a directory path and check if it's a git repository.
   *
   * Request body:
   * - path (required): Directory path to validate
   */
  app.post("/validate", async (c) => {
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
      const response: ValidateDirectoryResponse = {
        valid: false,
        isGitRepo: false,
        error: validation.error,
      };
      return c.json(response);
    }

    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(pathParam);

      // Check if path exists and is a directory
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        const response: ValidateDirectoryResponse = {
          valid: false,
          isGitRepo: false,
          error: "Path is not a directory",
        };
        return c.json(response);
      }

      // Check if git repository
      const isGitRepo = await isGitRepository(absolutePath);

      // Find repository root if it's a git repo
      let repositoryRoot: string | undefined;
      if (isGitRepo) {
        repositoryRoot = await findRepositoryRoot(absolutePath);
      }

      const response: ValidateDirectoryResponse = {
        valid: true,
        isGitRepo,
        repositoryRoot,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to validate directory";
      const response: ValidateDirectoryResponse = {
        valid: false,
        isGitRepo: false,
        error: errorMessage,
      };
      return c.json(response);
    }
  });

  /**
   * GET /api/browse/home
   *
   * Get the user's home directory path.
   */
  app.get("/home", (c) => {
    try {
      const homePath = os.homedir();
      const response: HomeDirectoryResponse = {
        path: homePath,
      };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get home directory";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /api/browse/roots
   *
   * Get filesystem roots based on platform.
   *
   * - Linux/Mac: ["/"]
   * - Windows: Drive letters (e.g., ["C:\\", "D:\\"])
   */
  app.get("/roots", (c) => {
    try {
      const platform = process.platform;

      let roots: string[];
      if (platform === "win32") {
        // Windows: enumerate drive letters
        // For simplicity, return common drives (would need system API for complete list)
        roots = ["C:\\"];
      } else {
        // Unix-like: single root
        roots = ["/"];
      }

      const response: FilesystemRootsResponse = {
        roots,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to get filesystem roots";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
