/**
 * File Reader Built-in Tool
 *
 * Reads file content from the project directory with path traversal protection.
 * Supports optional line range extraction.
 */

import * as path from "node:path";
import type { ToolResult, ToolContext } from "../handler-strategies.js";

/**
 * Helper function to create a text ToolResult
 */
function textResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

/**
 * Default maximum file size (1MB)
 */
const DEFAULT_MAX_FILE_SIZE = 1048576;

/**
 * Extract line range from file content
 *
 * @param content - Full file content
 * @param startLine - Starting line number (1-indexed, inclusive)
 * @param endLine - Ending line number (1-indexed, inclusive)
 * @returns Content with only the specified line range
 */
function extractLineRange(
  content: string,
  startLine?: number | undefined,
  endLine?: number | undefined,
): string {
  if (startLine === undefined && endLine === undefined) {
    return content;
  }

  const lines = content.split("\n");

  // Convert to 0-indexed
  const start = startLine !== undefined ? Math.max(0, startLine - 1) : 0;
  const end =
    endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;

  return lines.slice(start, end).join("\n");
}

/**
 * Create file-reader tool
 *
 * Reads file content from the project directory.
 *
 * Security:
 * - Uses path.resolve + startsWith check to prevent directory traversal
 * - Enforces 1MB file size limit
 *
 * @param projectPath - Absolute path to the project root
 * @returns SdkTool-compatible object
 */
export function createFileReaderTool(projectPath: string) {
  return {
    name: "file-reader",
    description: "Reads file content from the project directory",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "File path relative to project root",
        },
        startLine: {
          type: "number" as const,
          description: "Optional starting line number (1-indexed, inclusive)",
        },
        endLine: {
          type: "number" as const,
          description: "Optional ending line number (1-indexed, inclusive)",
        },
      },
      required: ["path"] as const,
    },
    handler: async (
      args: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      try {
        const requestedPath = args["path"];
        if (typeof requestedPath !== "string") {
          return textResult(
            "Missing or invalid 'path' parameter: must be a string",
            true,
          );
        }

        // Resolve path relative to projectPath
        const resolvedPath = path.resolve(projectPath, requestedPath);

        // Verify resolved path is within projectPath (prevent directory traversal)
        if (!resolvedPath.startsWith(projectPath)) {
          return textResult(
            `Path traversal detected: ${requestedPath} resolves outside project path`,
            true,
          );
        }

        // Check if file exists and get size
        const file = Bun.file(resolvedPath);
        const fileSize = file.size;

        if (fileSize > DEFAULT_MAX_FILE_SIZE) {
          return textResult(
            `File size (${fileSize} bytes) exceeds maximum allowed size (${DEFAULT_MAX_FILE_SIZE} bytes)`,
            true,
          );
        }

        // Read file content
        const content = await file.text();

        // Extract line range if specified
        const startLine = args["startLine"];
        const endLine = args["endLine"];

        const startLineNum =
          typeof startLine === "number" ? startLine : undefined;
        const endLineNum = typeof endLine === "number" ? endLine : undefined;

        const result = extractLineRange(content, startLineNum, endLineNum);

        return textResult(result);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return textResult(`File reader tool error: ${errorMessage}`, true);
      }
    },
  };
}
