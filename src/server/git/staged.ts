/**
 * Git Staged Files Operations
 *
 * Provides functions to detect staged files and changes using native
 * git commands via Bun.spawn.
 */

import type { FileChangeStatus } from "../../types/commit";

/**
 * Represents a staged file with its change status and statistics
 */
export interface StagedFile {
  readonly path: string;
  readonly status: FileChangeStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly oldPath?: string | undefined;
}

/**
 * Error thrown when git operations fail
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

/**
 * Execute a git command and return stdout
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @returns Git command output
 * @throws GitError if command fails
 */
async function execGit(args: readonly string[], cwd: string): Promise<string> {
  let proc;
  try {
    proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new GitError(
      `Failed to spawn git process: ${errorMessage}`,
      `git ${args.join(" ")}`,
      errorMessage,
    );
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new GitError(
      `Git command failed with exit code ${exitCode}`,
      `git ${args.join(" ")}`,
      stderr,
    );
  }

  return stdout;
}

/**
 * Parse git status character to FileChangeStatus
 *
 * @param statusChar - Git status character (A, M, D, R, etc.)
 * @returns FileChangeStatus type
 */
function parseFileStatus(statusChar: string): FileChangeStatus {
  switch (statusChar.charAt(0)) {
    case "A":
      return "A";
    case "M":
      return "M";
    case "D":
      return "D";
    case "R":
      return "R";
    case "C":
      return "C";
    default:
      return "M";
  }
}

/**
 * Parse git diff --cached --numstat output
 *
 * Format: additions deletions path
 *
 * @param numstatOutput - Git numstat output
 * @param statusMap - Map of path to status from --name-status
 * @returns Array of StagedFile objects
 */
function parseNumstat(
  numstatOutput: string,
  statusMap: Map<string, FileChangeStatus>,
): StagedFile[] {
  const files: StagedFile[] = [];
  const lines = numstatOutput.trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const additions = parts[0] === "-" ? 0 : parseInt(parts[0] ?? "0", 10);
    const deletions = parts[1] === "-" ? 0 : parseInt(parts[1] ?? "0", 10);
    const pathPart = parts[2] ?? "";

    // Handle renames (format: oldpath => newpath)
    let path = pathPart;
    let oldPath: string | undefined = undefined;
    let status: FileChangeStatus = "M";

    if (pathPart.includes(" => ")) {
      // Try to parse compact rename format first: {oldname => newname}
      const pathMatch = pathPart.match(/^(.*)\{(.+) => (.+)\}(.*)$/);
      if (pathMatch) {
        const [, prefix, oldName, newName, suffix] = pathMatch;
        oldPath = `${prefix ?? ""}${oldName ?? ""}${suffix ?? ""}`;
        path = `${prefix ?? ""}${newName ?? ""}${suffix ?? ""}`;
        status = "R";
      } else {
        // Full path rename format: oldpath => newpath
        const renameParts = pathPart.split(" => ");
        oldPath = renameParts[0]?.trim();
        path = renameParts[1]?.trim() ?? path;
        status = "R";
      }
    } else {
      // Use status from --name-status, or infer from numstat
      status =
        statusMap.get(pathPart) ??
        (additions > 0 && deletions === 0
          ? "A"
          : additions === 0 && deletions > 0
            ? "D"
            : "M");
    }

    files.push({
      path,
      status,
      additions,
      deletions,
      oldPath,
    });
  }

  return files;
}

/**
 * Get list of staged files with change statistics
 *
 * Uses `git diff --cached --name-status` to get file status codes and
 * `git diff --cached --numstat` to get additions/deletions.
 *
 * @param cwd - Repository working directory
 * @returns Array of StagedFile objects
 */
export async function getStagedFiles(cwd: string): Promise<StagedFile[]> {
  // Get status codes (A, M, D, R)
  const statusArgs = ["diff", "--cached", "--name-status"];
  const statusOutput = await execGit(statusArgs, cwd);

  // Build status map
  const statusMap = new Map<string, FileChangeStatus>();
  const statusLines = statusOutput.trim().split("\n");

  for (const line of statusLines) {
    if (!line.trim()) {
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 2) {
      continue;
    }

    const status = parseFileStatus(parts[0] ?? "M");
    const path = parts[1] ?? "";
    statusMap.set(path, status);

    // Handle renames with two paths
    if (parts.length === 3 && status === "R") {
      const newPath = parts[2] ?? "";
      statusMap.set(newPath, status);
    }
  }

  // Get numstat for additions/deletions
  const numstatArgs = ["diff", "--cached", "--numstat"];
  const numstatOutput = await execGit(numstatArgs, cwd);

  return parseNumstat(numstatOutput, statusMap);
}

/**
 * Get full staged diff output
 *
 * Uses `git diff --cached` to get complete diff output with context.
 *
 * @param cwd - Repository working directory
 * @returns Raw diff output string
 */
export async function getStagedDiff(cwd: string): Promise<string> {
  const args = ["diff", "--cached"];
  return execGit(args, cwd);
}

/**
 * Check if there are any staged changes
 *
 * Uses `git diff --cached --quiet` which exits with status 1 if there are
 * staged changes, and 0 if there are no staged changes.
 *
 * @param cwd - Repository working directory
 * @returns True if there are staged changes, false otherwise
 */
export async function hasStagedChanges(cwd: string): Promise<boolean> {
  let proc;
  try {
    proc = Bun.spawn(["git", "diff", "--cached", "--quiet"], {
      cwd,
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new GitError(
      `Failed to spawn git process: ${errorMessage}`,
      "git diff --cached --quiet",
      errorMessage,
    );
  }

  const exitCode = await proc.exited;

  if (exitCode === 0) {
    return false;
  } else if (exitCode === 1) {
    return true;
  } else {
    throw new GitError(
      `Git command failed with exit code ${exitCode}`,
      "git diff --cached --quiet",
      `exit code: ${exitCode}`,
    );
  }
}
