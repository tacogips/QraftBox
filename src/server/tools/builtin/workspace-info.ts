/**
 * Workspace Info Built-in Tool
 *
 * Returns metadata about the current workspace including project path,
 * git branch, and remote URL.
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
 * Workspace information object
 */
interface WorkspaceInfo {
  readonly projectPath: string;
  readonly branch?: string | undefined;
  readonly branchError?: string | undefined;
  readonly remoteUrl?: string | undefined;
  readonly remoteUrlError?: string | undefined;
}

/**
 * Create workspace-info tool
 *
 * Returns metadata about the current workspace.
 *
 * @param projectPath - Absolute path to the project root
 * @returns SdkTool-compatible object
 */
export function createWorkspaceInfoTool(projectPath: string) {
  return {
    name: "workspace-info",
    description: "Returns metadata about the current workspace",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    handler: async (
      _args: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      try {
        // Build info object incrementally using mutable temporary
        const infoBuilder: {
          projectPath: string;
          branch?: string | undefined;
          branchError?: string | undefined;
          remoteUrl?: string | undefined;
          remoteUrlError?: string | undefined;
        } = {
          projectPath,
        };

        // Get current branch
        try {
          const branchResult = await execGit(
            ["rev-parse", "--abbrev-ref", "HEAD"],
            { cwd: projectPath },
          );

          if (branchResult.exitCode === 0) {
            infoBuilder.branch = branchResult.stdout.trim();
          } else {
            infoBuilder.branchError =
              branchResult.stderr.trim() || "Unknown error";
          }
        } catch (e) {
          infoBuilder.branchError =
            e instanceof Error ? e.message : "Failed to get branch";
        }

        // Get remote URL
        try {
          const remoteResult = await execGit(["remote", "get-url", "origin"], {
            cwd: projectPath,
          });

          if (remoteResult.exitCode === 0) {
            infoBuilder.remoteUrl = remoteResult.stdout.trim();
          } else {
            infoBuilder.remoteUrlError =
              remoteResult.stderr.trim() || "Unknown error";
          }
        } catch (e) {
          infoBuilder.remoteUrlError =
            e instanceof Error ? e.message : "Failed to get remote URL";
        }

        // Create readonly info object
        const info: WorkspaceInfo = infoBuilder;

        return textResult(JSON.stringify(info, null, 2));
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return textResult(`Workspace info tool error: ${errorMessage}`, true);
      }
    },
  };
}
