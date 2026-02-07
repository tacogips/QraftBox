/**
 * Git Diff Generation Module
 *
 * Provides diff generation between refs, file content retrieval, and changed file listing.
 * Uses execGit from ./executor.ts for git command execution.
 */

import type { DiffFile, FileStatus, FileStatusCode } from "../../types/git.js";
import { execGit } from "./executor.js";
import { parseDiff } from "./parser.js";

/**
 * Options for generating diffs
 */
export interface DiffOptions {
  readonly base?: string | undefined;
  readonly target?: string | undefined;
  readonly paths?: readonly string[] | undefined;
  readonly contextLines?: number | undefined;
}

/**
 * Generate full diff between base and target (or working tree)
 *
 * - If no base specified, diff against HEAD
 * - If no target specified, diff working tree (including staged + unstaged)
 * - Supports contextLines option (default 3, maps to -U flag)
 * - Supports paths filter to limit diff to specific files
 *
 * @param projectPath - Path to git repository
 * @param options - Diff options (base, target, paths, contextLines)
 * @returns Promise resolving to array of DiffFile objects
 *
 * @example
 * ```typescript
 * // Diff working tree vs HEAD
 * const diff = await getDiff('/path/to/repo');
 *
 * // Diff between two commits
 * const diff = await getDiff('/path/to/repo', { base: 'main', target: 'feature' });
 *
 * // Diff specific files
 * const diff = await getDiff('/path/to/repo', { paths: ['src/main.ts'] });
 * ```
 */
export async function getDiff(
  projectPath: string,
  options?: DiffOptions | undefined,
): Promise<readonly DiffFile[]> {
  const contextLines = options?.contextLines ?? 3;
  const args: string[] = ["diff", `-U${contextLines}`];

  // Build ref arguments
  if (options?.base !== undefined && options?.target !== undefined) {
    // Compare two refs: base..target
    args.push(`${options.base}..${options.target}`);
  } else if (options?.base !== undefined) {
    // Compare base vs working tree
    args.push(options.base);
  } else {
    // Default: compare HEAD vs working tree
    args.push("HEAD");
  }

  // Add path filters if specified
  if (options?.paths !== undefined && options.paths.length > 0) {
    args.push("--", ...options.paths);
  }

  const result = await execGit(args, { cwd: projectPath });

  if (result.exitCode !== 0) {
    // Special case: no HEAD in repository (no commits yet)
    if (
      result.stderr.includes("unknown revision") ||
      result.stderr.includes("bad revision 'HEAD'")
    ) {
      // For repositories with no commits, use --cached to show staged files
      const stagedArgs: string[] = [
        "diff",
        `-U${contextLines}`,
        "--cached",
      ];

      if (options?.paths !== undefined && options.paths.length > 0) {
        stagedArgs.push("--", ...options.paths);
      }

      const stagedResult = await execGit(stagedArgs, { cwd: projectPath });
      return parseDiff(stagedResult.stdout);
    }

    // Other fatal errors should be thrown
    if (result.stderr.includes("fatal") || result.stderr.includes("error")) {
      throw new Error(`Git diff failed: ${result.stderr}`);
    }
  }

  // Parse the unified diff output using full parser
  return parseDiff(result.stdout);
}

/**
 * Get diff for a single file
 *
 * Like getDiff but for a single file only.
 *
 * @param projectPath - Path to git repository
 * @param filePath - Path to the file (relative to repo root)
 * @param options - Diff options (base, target, contextLines)
 * @returns Promise resolving to DiffFile or undefined if file has no changes
 *
 * @example
 * ```typescript
 * const fileDiff = await getFileDiff('/path/to/repo', 'src/main.ts');
 * if (fileDiff) {
 *   console.log(`${fileDiff.additions} additions, ${fileDiff.deletions} deletions`);
 * }
 * ```
 */
export async function getFileDiff(
  projectPath: string,
  filePath: string,
  options?: DiffOptions | undefined,
): Promise<DiffFile | undefined> {
  const diffOptions: DiffOptions = {
    ...options,
    paths: [filePath],
  };

  const diffs = await getDiff(projectPath, diffOptions);
  return diffs[0];
}

/**
 * Read file content at a specific ref (commit/branch)
 *
 * - If ref provided: `git show <ref>:<filePath>`
 * - If no ref: read from working tree using Bun.file()
 *
 * @param projectPath - Path to git repository
 * @param filePath - Path to the file (relative to repo root)
 * @param ref - Git ref (commit/branch/tag), or undefined for working tree
 * @returns Promise resolving to file content as string
 * @throws Error if file does not exist or cannot be read
 *
 * @example
 * ```typescript
 * // Read from working tree
 * const content = await getFileContent('/path/to/repo', 'src/main.ts');
 *
 * // Read from specific commit
 * const content = await getFileContent('/path/to/repo', 'src/main.ts', 'HEAD~1');
 * ```
 */
export async function getFileContent(
  projectPath: string,
  filePath: string,
  ref?: string | undefined,
): Promise<string> {
  if (ref !== undefined) {
    // Read from git ref using git show
    const result = await execGit(["show", `${ref}:${filePath}`], {
      cwd: projectPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to read file ${filePath} at ref ${ref}: ${result.stderr}`,
      );
    }

    return result.stdout;
  } else {
    // Read from working tree using Bun.file()
    const fullPath = `${projectPath}/${filePath}`;
    try {
      const file = Bun.file(fullPath);
      return await file.text();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to read file ${filePath} from working tree: ${errorMessage}`,
      );
    }
  }
}

/**
 * List changed files with their status
 *
 * - Use `git status --porcelain=v1` for working tree
 * - Or `git diff --name-status <base>` for comparison against a base
 *
 * Status codes: A=added, M=modified, D=deleted, R=renamed, C=copied, ?=untracked
 *
 * @param projectPath - Path to git repository
 * @param base - Base ref to compare against, or undefined for working tree status
 * @returns Promise resolving to array of FileStatus objects
 *
 * @example
 * ```typescript
 * // Get working tree status
 * const files = await getChangedFiles('/path/to/repo');
 *
 * // Get changes since main branch
 * const files = await getChangedFiles('/path/to/repo', 'main');
 * ```
 */
export async function getChangedFiles(
  projectPath: string,
  base?: string | undefined,
): Promise<readonly FileStatus[]> {
  if (base !== undefined) {
    // Compare against base using git diff --name-status
    const result = await execGit(["diff", "--name-status", base], {
      cwd: projectPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Git diff --name-status failed: ${result.stderr}`);
    }

    return parseNameStatus(result.stdout, false);
  } else {
    // Get working tree status using git status --porcelain=v1
    const result = await execGit(["status", "--porcelain=v1"], {
      cwd: projectPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Git status --porcelain failed: ${result.stderr}`);
    }

    return parsePorcelainStatus(result.stdout);
  }
}

/**
 * Parse git diff --name-status output into FileStatus array
 *
 * Format: "STATUS\tfilename" or "R\toldname\tnewname" for renames
 *
 * @param rawStatus - Raw git diff --name-status output
 * @param staged - Whether these are staged changes
 * @returns Array of FileStatus objects
 */
function parseNameStatus(
  rawStatus: string,
  staged: boolean,
): readonly FileStatus[] {
  const files: FileStatus[] = [];
  const lines = rawStatus.split("\n");

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 2) {
      continue;
    }

    const statusCode = parts[0] ?? "";
    const status = mapGitStatusCode(statusCode);

    if (statusCode.startsWith("R")) {
      // Rename: R\toldpath\tnewpath
      const oldPath = parts[1];
      const newPath = parts[2];
      if (oldPath !== undefined && newPath !== undefined) {
        files.push({
          path: newPath,
          status: "renamed",
          oldPath,
          staged,
        });
      }
    } else if (statusCode.startsWith("C")) {
      // Copy: C\toldpath\tnewpath
      const oldPath = parts[1];
      const newPath = parts[2];
      if (oldPath !== undefined && newPath !== undefined) {
        files.push({
          path: newPath,
          status: "copied",
          oldPath,
          staged,
        });
      }
    } else {
      // Other statuses: STATUS\tfilepath
      const path = parts[1] ?? "";
      files.push({
        path,
        status,
        oldPath: undefined,
        staged,
      });
    }
  }

  return files;
}

/**
 * Parse git status --porcelain=v1 output into FileStatus array
 *
 * Format: "XY path" where X=staged status, Y=unstaged status
 *
 * @param rawStatus - Raw git status --porcelain=v1 output
 * @returns Array of FileStatus objects
 */
function parsePorcelainStatus(rawStatus: string): readonly FileStatus[] {
  const files: FileStatus[] = [];
  const lines = rawStatus.split("\n");

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    // Porcelain v1 format: "XY path"
    const statusPart = line.substring(0, 2);
    const path = line.substring(3);

    const stagedCode = statusPart[0] ?? " ";
    const unstagedCode = statusPart[1] ?? " ";

    // Process staged changes
    if (stagedCode !== " " && stagedCode !== "?") {
      const status = mapPorcelainStatusCode(stagedCode);
      files.push({
        path,
        status,
        oldPath: undefined,
        staged: true,
      });
    }

    // Process unstaged changes
    if (unstagedCode !== " ") {
      const status = mapPorcelainStatusCode(unstagedCode);
      files.push({
        path,
        status,
        oldPath: undefined,
        staged: false,
      });
    }
  }

  return files;
}

/**
 * Map git status code to FileStatusCode
 *
 * @param code - Git status code (A, M, D, R, C, etc.)
 * @returns FileStatusCode
 */
function mapGitStatusCode(code: string): FileStatusCode {
  if (code.startsWith("A")) {
    return "added";
  } else if (code.startsWith("M")) {
    return "modified";
  } else if (code.startsWith("D")) {
    return "deleted";
  } else if (code.startsWith("R")) {
    return "renamed";
  } else if (code.startsWith("C")) {
    return "copied";
  } else if (code === "??" || code === "?") {
    return "untracked";
  } else {
    return "modified"; // Default fallback
  }
}

/**
 * Map git porcelain status code to FileStatusCode
 *
 * @param code - Git porcelain status code (A, M, D, R, C, ?)
 * @returns FileStatusCode
 */
function mapPorcelainStatusCode(code: string): FileStatusCode {
  switch (code) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    default:
      return "modified";
  }
}
