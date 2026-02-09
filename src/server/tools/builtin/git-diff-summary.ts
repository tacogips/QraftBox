/**
 * Git Diff Summary Built-in Tool
 *
 * Returns a summary of uncommitted changes using git diff --stat.
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
 * Create git-diff-summary tool
 *
 * Returns a summary of uncommitted changes.
 *
 * @param projectPath - Absolute path to the project root
 * @returns SdkTool-compatible object
 */
export function createGitDiffSummaryTool(projectPath: string) {
  return {
    name: "git-diff-summary",
    description: "Returns a summary of uncommitted changes",
    inputSchema: {
      type: "object" as const,
      properties: {
        staged: {
          type: "boolean" as const,
          description: "If true, show staged diff; otherwise show unstaged",
        },
      },
    },
    handler: async (
      args: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      try {
        const staged = args["staged"];
        const gitArgs: string[] = ["diff", "--stat"];

        if (staged === true) {
          gitArgs.push("--staged");
        }

        const result = await execGit(gitArgs, { cwd: projectPath });

        if (result.exitCode !== 0) {
          return textResult(
            `git diff failed with exit code ${result.exitCode}:\n${result.stderr}`,
            true,
          );
        }

        return textResult(result.stdout);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return textResult(`Git diff summary tool error: ${errorMessage}`, true);
      }
    },
  };
}
