/**
 * Prompt Builder
 *
 * Builds prompts with context for claude-code-agent.
 * Handles file references, @ mentions, and context formatting.
 */

import type { FileReference } from "../../types/ai";
import {
  buildPromptWithContext,
  formatContext,
} from "../../utils/ai-prompt-format";

/**
 * File content with metadata
 */
export interface ResolvedFileContent {
  readonly path: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
}

/**
 * File reader function type
 */
export type FileReader = (path: string) => Promise<string>;

/**
 * Regex pattern for @ file mentions
 * Matches: @file.ts, @path/to/file.ts, @file.ts:L10, @file.ts:L10-L20
 */
const FILE_MENTION_PATTERN =
  /@([\w./-]+(?:\.[\w]+)?(?::L(\d+)(?:-L?(\d+))?)?)/g;

/**
 * Parse @ file mentions from prompt text
 *
 * @param prompt - The prompt text to parse
 * @returns Array of parsed file mentions with optional line ranges
 */
export function parseFileMentions(
  prompt: string,
): readonly { path: string; startLine?: number; endLine?: number }[] {
  const mentions: { path: string; startLine?: number; endLine?: number }[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  FILE_MENTION_PATTERN.lastIndex = 0;

  while ((match = FILE_MENTION_PATTERN.exec(prompt)) !== null) {
    const fullMatch = match[1];
    if (fullMatch === undefined) continue;

    // Parse the path and optional line range
    const colonIndex = fullMatch.indexOf(":L");
    let path: string;
    let startLine: number | undefined;
    let endLine: number | undefined;

    if (colonIndex !== -1) {
      path = fullMatch.slice(0, colonIndex);
      const startStr = match[2];
      const endStr = match[3];

      if (startStr !== undefined) {
        startLine = parseInt(startStr, 10);
        endLine = endStr !== undefined ? parseInt(endStr, 10) : startLine;
      }
    } else {
      path = fullMatch;
    }

    // Deduplicate by path + line range
    const key = `${path}:${startLine ?? ""}:${endLine ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      const mention: { path: string; startLine?: number; endLine?: number } = {
        path,
      };
      if (startLine !== undefined) {
        mention.startLine = startLine;
      }
      if (endLine !== undefined) {
        mention.endLine = endLine;
      }
      mentions.push(mention);
    }
  }

  return mentions;
}

/**
 * Read file content and extract specific lines
 *
 * @param path - File path
 * @param cwd - Working directory
 * @param readFile - Function to read file content
 * @param startLine - Optional start line (1-based)
 * @param endLine - Optional end line (1-based, inclusive)
 * @returns Resolved file content or null if file cannot be read
 */
export async function readFileLines(
  path: string,
  cwd: string,
  readFile: FileReader,
  startLine?: number,
  endLine?: number,
): Promise<ResolvedFileContent | null> {
  try {
    const fullPath = path.startsWith("/") ? path : `${cwd}/${path}`;
    const content = await readFile(fullPath);
    const lines = content.split("\n");
    const totalLines = lines.length;

    // If no line range specified, return entire file
    if (startLine === undefined) {
      return {
        path,
        content,
        startLine: 1,
        endLine: totalLines,
        totalLines,
      };
    }

    // Extract specific lines
    const start = Math.max(1, startLine);
    const end = Math.min(totalLines, endLine ?? start);
    const selectedLines = lines.slice(start - 1, end);

    return {
      path,
      content: selectedLines.join("\n"),
      startLine: start,
      endLine: end,
      totalLines,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve file references by fetching their content
 *
 * @param refs - File references to resolve
 * @param cwd - Working directory
 * @param readFile - Function to read file content
 * @returns Array of resolved file references with content
 */
export async function resolveFileReferences(
  refs: readonly FileReference[],
  cwd: string,
  readFile: FileReader,
): Promise<readonly FileReference[]> {
  const resolved: FileReference[] = [];

  for (const ref of refs) {
    // Skip if content is already provided
    if (ref.content !== undefined && ref.content.length > 0) {
      resolved.push(ref);
      continue;
    }

    const result = await readFileLines(
      ref.path,
      cwd,
      readFile,
      ref.startLine,
      ref.endLine,
    );

    if (result !== null) {
      resolved.push({
        path: ref.path,
        startLine: result.startLine,
        endLine: result.endLine,
        content: result.content,
      });
    } else {
      // Keep the reference even if file couldn't be read
      // This allows the AI to know the user wanted this file
      resolved.push({
        path: ref.path,
        startLine: ref.startLine,
        endLine: ref.endLine,
        content: `[File not found or could not be read: ${ref.path}]`,
      });
    }
  }

  return resolved;
}

export { buildPromptWithContext, formatContext };

/**
 * Extract and merge file mentions from prompt into context
 *
 * @param prompt - The prompt text with @ mentions
 * @param existingRefs - Existing file references in context
 * @returns Merged array of file references
 */
export function extractAndMergeFileMentions(
  prompt: string,
  existingRefs: readonly FileReference[],
): readonly FileReference[] {
  const mentions = parseFileMentions(prompt);

  // Create a map of existing refs by path
  const refMap = new Map<string, FileReference>();
  for (const ref of existingRefs) {
    refMap.set(ref.path, ref);
  }

  // Add new mentions that aren't already referenced
  for (const mention of mentions) {
    if (!refMap.has(mention.path)) {
      refMap.set(mention.path, {
        path: mention.path,
        startLine: mention.startLine,
        endLine: mention.endLine,
      });
    }
  }

  return Array.from(refMap.values());
}
