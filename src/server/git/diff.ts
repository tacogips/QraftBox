/**
 * Git Diff Generation Module
 *
 * Provides diff generation between refs, file content retrieval, and changed file listing.
 * Uses execGit from ./executor.ts for git command execution.
 */

import type {
  DiffFile,
  DiffChunk,
  DiffChange,
  FileStatus,
  FileStatusCode,
} from "../../types/git.js";
import { execGit, unquoteGitPath } from "./executor.js";
import { parseDiff, detectBinary } from "./parser.js";

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
 * Maximum file size (in bytes) to read for untracked files.
 * Files larger than this are treated as binary to avoid memory issues.
 */
const MAX_UNTRACKED_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Automatically detect the appropriate diff base for feature branches.
 *
 * When on a feature branch (not main/master), returns the merge-base
 * with the parent branch to show all branch changes. On main/master
 * or when detection fails, returns undefined to keep default behavior.
 *
 * Logic:
 * - Get current branch name via `git rev-parse --abbrev-ref HEAD`
 * - If on main or master, return undefined (show working tree changes only)
 * - Otherwise, try to find merge-base with main, then master
 * - Return merge-base commit hash or undefined if detection fails
 *
 * @param projectPath - Path to git repository
 * @returns Promise resolving to base commit hash or undefined
 *
 * @example
 * ```typescript
 * const base = await detectDefaultDiffBase('/path/to/repo');
 * if (base !== undefined) {
 *   // On feature branch - base is merge-base with main/master
 *   const diff = await getDiff(projectPath, { base });
 * } else {
 *   // On main/master or detection failed - show working tree changes
 *   const diff = await getDiff(projectPath);
 * }
 * ```
 */
export async function detectDefaultDiffBase(
  projectPath: string,
): Promise<string | undefined> {
  try {
    // Get current branch name
    const branchResult = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectPath,
    });

    if (branchResult.exitCode !== 0) {
      return undefined;
    }

    const currentBranch = branchResult.stdout.trim();

    // If on main or master, return undefined (show working tree changes only)
    if (currentBranch === "main" || currentBranch === "master") {
      return undefined;
    }

    // Try to find merge-base with main first
    const mainResult = await execGit(["merge-base", "main", "HEAD"], {
      cwd: projectPath,
    });

    if (mainResult.exitCode === 0) {
      return mainResult.stdout.trim();
    }

    // If main doesn't exist, try master
    const masterResult = await execGit(["merge-base", "master", "HEAD"], {
      cwd: projectPath,
    });

    if (masterResult.exitCode === 0) {
      return masterResult.stdout.trim();
    }

    // Neither main nor master exists, return undefined
    return undefined;
  } catch {
    // Any errors should be handled gracefully
    return undefined;
  }
}

/**
 * Get DiffFile entries for untracked files in the working tree.
 *
 * Uses `git ls-files --others --exclude-standard` to find untracked files,
 * then reads each file to construct synthetic diff entries showing the
 * entire file content as additions (status: "added").
 *
 * @param projectPath - Path to git repository
 * @param pathFilters - Optional path filters to limit results
 * @returns Array of DiffFile objects for untracked files
 */
async function getUntrackedDiffFiles(
  projectPath: string,
  pathFilters?: readonly string[] | undefined,
): Promise<readonly DiffFile[]> {
  const lsArgs = ["ls-files", "--others", "--exclude-standard"];

  if (pathFilters !== undefined && pathFilters.length > 0) {
    lsArgs.push("--", ...pathFilters);
  }

  const lsResult = await execGit(lsArgs, { cwd: projectPath });

  if (lsResult.exitCode !== 0 || lsResult.stdout.trim() === "") {
    return [];
  }

  const untrackedPaths = lsResult.stdout
    .trim()
    .split("\n")
    .map((p) => unquoteGitPath(p))
    .filter((p) => p.length > 0);

  const results: DiffFile[] = [];

  for (const filePath of untrackedPaths) {
    const fullPath = `${projectPath}/${filePath}`;

    try {
      const file = Bun.file(fullPath);
      const size = file.size;

      // Skip overly large files - treat as binary
      if (size > MAX_UNTRACKED_FILE_SIZE) {
        results.push({
          path: filePath,
          status: "added",
          oldPath: undefined,
          additions: 0,
          deletions: 0,
          chunks: [],
          isBinary: true,
          fileSize: size,
        });
        continue;
      }

      // Check if file is binary by reading a sample
      const sample = await file.slice(0, 8192).arrayBuffer();
      const sampleBytes = new Uint8Array(sample);
      let isBinaryFile = false;
      for (const byte of sampleBytes) {
        if (byte === 0) {
          isBinaryFile = true;
          break;
        }
      }

      if (isBinaryFile || detectBinary("", filePath)) {
        results.push({
          path: filePath,
          status: "added",
          oldPath: undefined,
          additions: 0,
          deletions: 0,
          chunks: [],
          isBinary: true,
          fileSize: size,
        });
        continue;
      }

      // Read text content and build synthetic diff
      const content = await file.text();
      const lines = content.split("\n");

      // Remove trailing empty line from split (file usually ends with newline)
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }

      const changes: DiffChange[] = lines.map((line, i) => ({
        type: "add" as const,
        oldLine: undefined,
        newLine: i + 1,
        content: line,
      }));

      const chunk: DiffChunk = {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        header: `@@ -0,0 +1,${lines.length} @@`,
        changes,
      };

      results.push({
        path: filePath,
        status: "added",
        oldPath: undefined,
        additions: lines.length,
        deletions: 0,
        chunks: [chunk],
        isBinary: false,
        fileSize: size,
      });
    } catch {
      // Skip files that can't be read
      results.push({
        path: filePath,
        status: "added",
        oldPath: undefined,
        additions: 0,
        deletions: 0,
        chunks: [],
        isBinary: true,
        fileSize: undefined,
      });
    }
  }

  return results;
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
      const stagedArgs: string[] = ["diff", `-U${contextLines}`, "--cached"];

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
  const files = parseDiff(result.stdout);

  // When comparing against working tree (no explicit target), also include untracked files.
  // git diff HEAD doesn't show untracked files, so we need to fetch them separately.
  const isWorkingTreeDiff = options?.target === undefined;
  if (isWorkingTreeDiff) {
    const untrackedFiles = await getUntrackedDiffFiles(
      projectPath,
      options?.paths,
    );
    if (untrackedFiles.length > 0) {
      return [...files, ...untrackedFiles];
    }
  }

  return files;
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
          path: unquoteGitPath(newPath),
          status: "renamed",
          oldPath: unquoteGitPath(oldPath),
          staged,
        });
      }
    } else if (statusCode.startsWith("C")) {
      // Copy: C\toldpath\tnewpath
      const oldPath = parts[1];
      const newPath = parts[2];
      if (oldPath !== undefined && newPath !== undefined) {
        files.push({
          path: unquoteGitPath(newPath),
          status: "copied",
          oldPath: unquoteGitPath(oldPath),
          staged,
        });
      }
    } else {
      // Other statuses: STATUS\tfilepath
      const path = unquoteGitPath(parts[1] ?? "");
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
    const path = unquoteGitPath(line.substring(3));

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
