/**
 * Git Status Built-in Tool
 *
 * Returns working tree status for the current project using git status --porcelain.
 */

import { execGit } from "../../git/executor.js";
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
 * Create git-status tool
 *
 * Returns working tree status for the current project.
 *
 * @param projectPath - Absolute path to the project root
 * @returns SdkTool-compatible object
 */
export function createGitStatusTool(projectPath: string) {
  return {
    name: "git-status",
    description: "Returns working tree status for the current project",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "Optional subdirectory to check status for",
        },
      },
    },
    handler: async (
      args: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      try {
        const subPath = args["path"];
        const gitArgs: string[] = ["status", "--porcelain"];

        if (subPath !== undefined && subPath !== null) {
          if (typeof subPath !== "string") {
            return textResult(
              "Invalid 'path' parameter: must be a string",
              true,
            );
          }
          gitArgs.push(subPath);
        }

        const result = await execGit(gitArgs, { cwd: projectPath });

        if (result.exitCode !== 0) {
          return textResult(
            `git status failed with exit code ${result.exitCode}:\n${result.stderr}`,
            true,
          );
        }

        return textResult(result.stdout);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return textResult(`Git status tool error: ${errorMessage}`, true);
      }
    },
  };
}
