/**
 * Built-in Tools Module
 *
 * Provides default tools shipped with aynd:
 * - git-status: Working tree status
 * - git-diff-summary: Uncommitted changes summary
 * - workspace-info: Project metadata
 * - file-reader: File content reader
 */

import { createGitStatusTool } from "./git-status.js";
import { createGitDiffSummaryTool } from "./git-diff-summary.js";
import { createWorkspaceInfoTool } from "./workspace-info.js";
import { createFileReaderTool } from "./file-reader.js";
import type { ToolHandler } from "../handler-strategies.js";

/**
 * SdkTool-compatible interface
 *
 * This matches the claude-code-agent SdkTool type without importing it.
 */
export interface SdkTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: string;
    readonly properties?: Record<string, unknown> | undefined;
    readonly required?: readonly string[] | undefined;
  };
  readonly handler: ToolHandler;
}

/**
 * Create all built-in tools
 *
 * Returns an array of SdkTool-compatible objects that can be registered
 * in the tool registry.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of built-in tools
 */
export function createBuiltinTools(projectPath: string): readonly SdkTool[] {
  return [
    createGitStatusTool(projectPath),
    createGitDiffSummaryTool(projectPath),
    createWorkspaceInfoTool(projectPath),
    createFileReaderTool(projectPath),
  ];
}
