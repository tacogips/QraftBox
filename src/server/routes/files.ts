/**
 * File API Routes
 *
 * Provides REST API endpoints for browsing file trees, retrieving file content,
 * and autocompleting file paths for @ mentions.
 */

import { Hono } from "hono";
import type { ServerContext } from "../../types/index.js";
import type { FileNode } from "../../types/git.js";
import {
  getFileTree,
  getAllFiles,
  getUntrackedFiles,
  getDirectoryChildren,
} from "../git/files.js";
import { getFileContent, getChangedFiles } from "../git/diff.js";
import {
  detectBinary,
  checkLargeFile,
  PARTIAL_CONTENT_LIMIT,
} from "../git/binary.js";

/**
 * Error response format
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

/**
 * Response for GET /files
 */
interface FilesResponse {
  readonly tree: FileNode;
  readonly totalFiles: number;
  readonly changedFiles: number;
}

/**
 * Response for GET /file/*path
 */
interface FileContentResponse {
  readonly path: string;
  readonly content: string;
  readonly language: string;
  readonly lineCount: number;
  readonly size: number;
  readonly isBinary: boolean;
  readonly isImage?: boolean | undefined;
  readonly mimeType?: string | undefined;
  readonly badge?: string | undefined;
  readonly isPartial?: boolean | undefined;
  readonly fullSize?: number | undefined;
}

/**
 * Response for GET /files/autocomplete
 */
interface AutocompleteResponse {
  readonly results: readonly {
    readonly path: string;
    readonly status?: string | undefined;
  }[];
}

/**
 * Detect language from file extension
 *
 * @param filePath - Path to the file
 * @returns Language name for syntax highlighting
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    svelte: "svelte",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
  };
  return langMap[ext] ?? "plaintext";
}

/**
 * Count files in a file tree
 *
 * Recursively counts all file nodes (not directories)
 *
 * @param node - Root FileNode
 * @returns Total number of file nodes
 */
function countFiles(node: FileNode): number {
  if (node.type === "file") {
    return 1;
  }

  let count = 0;
  const children = node.children ?? [];
  for (const child of children) {
    count += countFiles(child);
  }
  return count;
}

/**
 * Create file routes
 *
 * Routes:
 * - GET /files - Get file tree
 * - GET /file/*path - Get file content
 * - GET /files/autocomplete - Autocomplete file paths
 *
 * @param context - Server context with project path
 * @returns Hono app with file routes mounted
 */
export function createFileRoutes(context: ServerContext): Hono {
  const app = new Hono();

  /**
   * GET /files
   *
   * Get file tree with optional diff-only mode and shallow loading.
   *
   * Query parameters:
   * - mode (optional): "diff-only" | "all" (default: "all")
   * - shallow (optional): "true" to load only top-level entries (ignored in diff-only mode)
   */
  app.get("/", async (c) => {
    const mode = c.req.query("mode");
    const diffOnly = mode === "diff-only";
    const shallow = c.req.query("shallow") === "true";

    try {
      let tree: FileNode;
      let totalFiles: number;

      const showIgnored = c.req.query("showIgnored") === "true";

      if (shallow && !diffOnly) {
        // Lazy loading: return only top-level entries
        const children = await getDirectoryChildren(context.projectPath, "", {
          showIgnored,
        });
        tree = {
          name: "",
          path: "",
          type: "directory" as const,
          children,
          status: undefined,
          isBinary: undefined,
        };
        // Count total files for display (tracked + untracked)
        const [allFiles, untrackedFiles] = await Promise.all([
          getAllFiles(context.projectPath),
          getUntrackedFiles(context.projectPath),
        ]);
        totalFiles = allFiles.length + untrackedFiles.length;
      } else {
        tree = await getFileTree(context.projectPath, diffOnly);
        totalFiles = countFiles(tree);
      }

      // Count changed files
      let changedFiles = 0;
      if (diffOnly) {
        // In diff-only mode, all files in tree are changed
        changedFiles = totalFiles;
      } else {
        // Count changed files from git status
        const changed = await getChangedFiles(context.projectPath);
        changedFiles = changed.length;
      }

      const response: FilesResponse = {
        tree,
        totalFiles,
        changedFiles,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to retrieve file tree";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /children
   *
   * Get immediate children of a directory (for lazy loading).
   *
   * Query parameters:
   * - path (optional): Directory path relative to repo root, empty for root
   */
  app.get("/children", async (c) => {
    const dirPath = c.req.query("path") ?? "";
    const showIgnored = c.req.query("showIgnored") === "true";

    try {
      const children = await getDirectoryChildren(
        context.projectPath,
        dirPath,
        { showIgnored },
      );
      return c.json({ children });
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to list directory children";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /file/*
   *
   * Get file content with metadata.
   * The wildcard captures the full file path after /file/
   *
   * Query parameters:
   * - ref (optional): Git ref (commit/branch/tag), or undefined for working tree
   * - full (optional): "true" to force full content loading for large files
   */
  app.get("/file/*", async (c) => {
    // Extract path from wildcard parameter
    // Hono's wildcard captures everything after the base path
    const filePath = c.req.path.replace("/file/", "");

    if (filePath.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "File path is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const ref = c.req.query("ref");
    const fullParam = c.req.query("full");
    const loadFullContent = fullParam === "true";

    try {
      // Get raw file content
      let rawContent = await getFileContent(
        context.projectPath,
        filePath,
        ref ?? undefined,
      );

      // Convert to buffer for binary detection
      const contentBuffer = new TextEncoder().encode(rawContent);

      // Detect binary file type
      const binaryInfo = detectBinary(filePath, contentBuffer);
      const isBinary = binaryInfo.isBinary;
      const isImage = binaryInfo.isImage;
      const mimeType = binaryInfo.mimeType;

      // Determine badge based on binary type
      let badge: string | undefined = undefined;
      if (isBinary) {
        badge = isImage ? "IMG" : "BIN";
      }

      // For binary images, convert content to base64
      if (isBinary && isImage) {
        const base64Content = Buffer.from(contentBuffer).toString("base64");
        rawContent = base64Content;
      }

      // For non-image binary files, clear content
      if (isBinary && !isImage) {
        rawContent = "";
      }

      // Check if file is large (only for text files or when loading full content)
      let isPartial = false;
      let fullSize: number | undefined = undefined;

      if (!isBinary && !loadFullContent) {
        const largeFileInfo = await checkLargeFile(
          filePath,
          context.projectPath,
        );

        if (largeFileInfo.isLarge) {
          // Return partial content (first PARTIAL_CONTENT_LIMIT bytes)
          const partialBuffer = contentBuffer.slice(0, PARTIAL_CONTENT_LIMIT);
          rawContent = new TextDecoder().decode(partialBuffer);
          isPartial = true;
          fullSize = largeFileInfo.size;
        }
      }

      const lineCount =
        isBinary || rawContent.length === 0 ? 0 : rawContent.split("\n").length;
      const size = contentBuffer.length;
      const language = detectLanguage(filePath);

      const response: FileContentResponse = {
        path: filePath,
        content: rawContent,
        language,
        lineCount,
        size,
        isBinary,
        isImage: isImage ? true : undefined,
        mimeType,
        badge,
        isPartial: isPartial ? true : undefined,
        fullSize,
      };

      return c.json(response);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const isNotFound =
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("No such file") ||
        errorMessage.includes("ENOENT");

      const errorResponse: ErrorResponse = {
        error: isNotFound ? `File not found: ${filePath}` : errorMessage,
        code: isNotFound ? 404 : 500,
      };
      return c.json(errorResponse, isNotFound ? 404 : 500);
    }
  });

  /**
   * GET /files/autocomplete
   *
   * Autocomplete file paths for @ mentions.
   *
   * Query parameters:
   * - q (required): Search term (partial file path)
   * - limit (optional): Maximum number of results (default: 10)
   */
  app.get("/autocomplete", async (c) => {
    const query = c.req.query("q");
    const limitParam = c.req.query("limit");

    if (query === undefined || query.trim().length === 0) {
      const errorResponse: ErrorResponse = {
        error: "Query parameter 'q' is required",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    const limit = limitParam !== undefined ? parseInt(limitParam, 10) : 10;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      const errorResponse: ErrorResponse = {
        error: "Limit must be between 1 and 100",
        code: 400,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const allFiles = await getAllFiles(context.projectPath);

      // Filter files by partial path match (case-insensitive)
      const queryLower = query.toLowerCase();
      const matches = allFiles
        .filter((path) => path.toLowerCase().includes(queryLower))
        .slice(0, limit);

      // Get status information for matched files
      const changedFiles = await getChangedFiles(context.projectPath);
      const statusMap = new Map<string, string>();
      for (const file of changedFiles) {
        statusMap.set(file.path, file.status);
      }

      const results = matches.map((path) => ({
        path,
        status: statusMap.get(path),
      }));

      const response: AutocompleteResponse = { results };
      return c.json(response);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to autocomplete file paths";
      const errorResponse: ErrorResponse = {
        error: errorMessage,
        code: 500,
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
