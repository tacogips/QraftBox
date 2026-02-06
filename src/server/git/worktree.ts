/**
 * Git Worktree Operations
 *
 * Provides functions to detect, create, list, and remove git worktrees
 * using native git commands via Bun.spawn.
 */

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFile, mkdir, stat } from "node:fs/promises";
import type {
  WorktreeInfo,
  RepositoryDetectionResult,
  CreateWorktreeRequest,
  CreateWorktreeResult,
  RemoveWorktreeResult,
} from "../../types/worktree";
import {
  encodeProjectPath,
  generateDefaultWorktreePath,
  validateWorktreeName,
} from "../../types/worktree";

/**
 * Error thrown when worktree operations fail
 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "WorktreeError";
  }
}

/**
 * Execute a git command and return stdout
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @returns Git command output
 * @throws WorktreeError if command fails
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
    throw new WorktreeError(
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
    throw new WorktreeError(
      `Git command failed with exit code ${exitCode}`,
      `git ${args.join(" ")}`,
      stderr,
    );
  }

  return stdout;
}

/**
 * Detect repository type and gather information about the directory
 *
 * @param dirPath - Directory path to check
 * @returns Repository detection result
 */
export async function detectRepositoryType(
  dirPath: string,
): Promise<RepositoryDetectionResult> {
  const gitPath = join(dirPath, ".git");

  try {
    const stats = await stat(gitPath);

    // Case 1: .git is a directory -> main repository or bare repo
    if (stats.isDirectory()) {
      // Check if it's a bare repository by looking for config
      const configPath = join(gitPath, "config");
      try {
        const configContent = await readFile(configPath, "utf-8");
        const isBare = configContent.includes("bare = true");

        if (isBare) {
          return {
            type: "bare",
            path: dirPath,
            gitDir: gitPath,
            mainRepositoryPath: null,
            worktreeName: null,
          };
        }

        // Main repository
        return {
          type: "main",
          path: dirPath,
          gitDir: gitPath,
          mainRepositoryPath: null,
          worktreeName: null,
        };
      } catch {
        // If can't read config, assume main repo
        return {
          type: "main",
          path: dirPath,
          gitDir: gitPath,
          mainRepositoryPath: null,
          worktreeName: null,
        };
      }
    }

    // Case 2: .git is a file -> worktree
    if (stats.isFile()) {
      const content = await readFile(gitPath, "utf-8");
      if (content.startsWith("gitdir:")) {
        // Extract gitdir path
        const gitdirLine = content.trim();
        const gitDir = gitdirLine.replace("gitdir:", "").trim();

        // Extract main repository path from worktree git-dir
        // Git-dir format: /path/to/main/repo/.git/worktrees/worktree-name
        const mainRepoPath = await getMainRepositoryPathFromGitDir(gitDir);
        const worktreeName = extractWorktreeNameFromGitDir(gitDir);

        return {
          type: "worktree",
          path: dirPath,
          gitDir,
          mainRepositoryPath: mainRepoPath,
          worktreeName,
        };
      }
    }
  } catch (err) {
    // .git doesn't exist or can't be accessed
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return {
        type: "not-git",
        path: dirPath,
        gitDir: null,
        mainRepositoryPath: null,
        worktreeName: null,
      };
    }

    // Other errors (permission denied, etc.)
    throw err;
  }

  // If .git exists but not directory or file with gitdir
  return {
    type: "not-git",
    path: dirPath,
    gitDir: null,
    mainRepositoryPath: null,
    worktreeName: null,
  };
}

/**
 * Extract main repository path from worktree git-dir
 * Git-dir format: /path/to/main/repo/.git/worktrees/worktree-name
 *
 * @param gitDir - Git directory path from .git file
 * @returns Main repository path
 */
async function getMainRepositoryPathFromGitDir(
  gitDir: string,
): Promise<string> {
  // Read commondir file in the worktree git-dir
  // This file contains the relative path to the main repo's .git directory
  const commonDirPath = join(gitDir, "commondir");

  try {
    const commonDirContent = await readFile(commonDirPath, "utf-8");
    const commonDirRelative = commonDirContent.trim();

    // Resolve the path relative to the worktree git-dir
    const mainGitDir = join(gitDir, commonDirRelative);

    // The main repository path is the parent of the .git directory
    return dirname(mainGitDir);
  } catch {
    // Fallback: extract from git-dir path pattern
    // /path/to/main/repo/.git/worktrees/worktree-name -> /path/to/main/repo
    const parts = gitDir.split("/.git/worktrees/");
    if (parts[0]) {
      return parts[0];
    }

    throw new WorktreeError(
      "Failed to determine main repository path from git-dir",
      "getMainRepositoryPathFromGitDir",
      `gitDir: ${gitDir}`,
    );
  }
}

/**
 * Extract worktree name from git-dir path
 * Git-dir format: /path/to/main/repo/.git/worktrees/worktree-name
 *
 * @param gitDir - Git directory path
 * @returns Worktree name or null
 */
function extractWorktreeNameFromGitDir(gitDir: string): string | null {
  const parts = gitDir.split("/.git/worktrees/");
  const namepart = parts[1];
  if (namepart) {
    // Remove any trailing slashes
    return namepart.replace(/\/$/, "");
  }
  return null;
}

/**
 * Check if directory is a git worktree
 *
 * @param dirPath - Directory path to check
 * @returns True if directory is a worktree
 */
export async function isWorktree(dirPath: string): Promise<boolean> {
  const result = await detectRepositoryType(dirPath);
  return result.type === "worktree";
}

/**
 * Check if directory is a main git repository
 *
 * @param dirPath - Directory path to check
 * @returns True if directory is a main repository
 */
export async function isMainRepository(dirPath: string): Promise<boolean> {
  const result = await detectRepositoryType(dirPath);
  return result.type === "main";
}

/**
 * Get the main repository path for a worktree
 *
 * @param worktreePath - Worktree directory path
 * @returns Main repository path or null if not a worktree
 */
export async function getMainRepositoryPath(
  worktreePath: string,
): Promise<string | null> {
  const result = await detectRepositoryType(worktreePath);
  return result.mainRepositoryPath;
}

/**
 * Parse git worktree list --porcelain output
 *
 * Format:
 * worktree /path/to/worktree
 * HEAD abcd1234...
 * branch refs/heads/branch-name
 * locked (optional)
 * prunable (optional)
 * (blank line separator)
 *
 * @param output - Git worktree list --porcelain output
 * @param mainRepositoryPath - Main repository path (for setting mainRepositoryPath)
 * @returns Array of WorktreeInfo
 */
function parseWorktreeList(
  output: string,
  mainRepositoryPath: string,
): WorktreeInfo[] {
  if (!output.trim()) {
    return [];
  }

  const worktrees: WorktreeInfo[] = [];
  const blocks = output.split("\n\n").filter((block) => block.trim());

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim());

    let path = "";
    let head = "";
    let branch: string | null = null;
    let locked = false;
    let prunable = false;
    let isMain = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.replace("worktree ", "").trim();
        // First entry is the main repository
        if (worktrees.length === 0) {
          isMain = true;
        }
      } else if (line.startsWith("HEAD ")) {
        head = line.replace("HEAD ", "").trim();
      } else if (line.startsWith("branch ")) {
        const branchRef = line.replace("branch ", "").trim();
        // Extract branch name from refs/heads/branch-name
        branch = branchRef.replace("refs/heads/", "");
      } else if (line === "locked") {
        locked = true;
      } else if (line === "prunable") {
        prunable = true;
      } else if (line.startsWith("bare")) {
        // Bare worktree - skip
        continue;
      } else if (line.startsWith("detached")) {
        // Detached HEAD
        branch = null;
      }
    }

    if (path && head) {
      worktrees.push({
        path,
        head,
        branch,
        isMain,
        locked,
        prunable,
        mainRepositoryPath,
      });
    }
  }

  return worktrees;
}

/**
 * List all worktrees for a repository
 *
 * @param cwd - Repository directory path (main repo or worktree)
 * @returns Array of worktree information
 * @throws WorktreeError if git command fails
 */
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  const output = await execGit(["worktree", "list", "--porcelain"], cwd);

  // Detect the main repository path
  // The first entry in the list is always the main repository
  const lines = output.split("\n");
  const firstWorktreeLine = lines.find((line) => line.startsWith("worktree "));
  const mainRepoPath = firstWorktreeLine
    ? firstWorktreeLine.replace("worktree ", "").trim()
    : cwd;

  return parseWorktreeList(output, mainRepoPath);
}

/**
 * Create a new git worktree
 *
 * @param cwd - Main repository directory path
 * @param request - Worktree creation request
 * @returns Creation result with path and branch
 * @throws WorktreeError if creation fails
 */
export async function createWorktree(
  cwd: string,
  request: CreateWorktreeRequest,
): Promise<CreateWorktreeResult> {
  const { branch, worktreeName, createBranch, baseBranch, customPath } =
    request;

  // Generate path
  let worktreePath: string;
  if (customPath) {
    worktreePath = customPath;
  } else {
    // Validate worktree name
    const nameToUse = worktreeName ?? branch;
    const validation = validateWorktreeName(nameToUse);
    if (!validation.valid) {
      return {
        success: false,
        path: "",
        branch,
        error: validation.error ?? "Invalid worktree name",
      };
    }

    // Ensure base directory exists
    await ensureWorktreeBaseDir();

    // Generate default path
    worktreePath = generateDefaultWorktreePath(cwd, nameToUse);
  }

  // Build git worktree add command
  const args: string[] = ["worktree", "add"];

  if (createBranch) {
    args.push("-b", branch);
  }

  args.push(worktreePath);

  if (baseBranch) {
    args.push(baseBranch);
  } else if (!createBranch) {
    // If not creating a new branch, specify the branch to checkout
    args.push(branch);
  }

  try {
    await execGit(args, cwd);

    return {
      success: true,
      path: worktreePath,
      branch,
    };
  } catch (err) {
    const error = err instanceof WorktreeError ? err.stderr : String(err);
    return {
      success: false,
      path: worktreePath,
      branch,
      error,
    };
  }
}

/**
 * Remove a git worktree
 *
 * @param cwd - Main repository directory path
 * @param path - Worktree path to remove
 * @param force - Force removal even if worktree has uncommitted changes
 * @returns Removal result
 * @throws WorktreeError if removal fails
 */
export async function removeWorktree(
  cwd: string,
  path: string,
  force = false,
): Promise<RemoveWorktreeResult> {
  const args: string[] = ["worktree", "remove"];

  if (force) {
    args.push("--force");
  }

  args.push(path);

  try {
    await execGit(args, cwd);

    return {
      success: true,
      removed: true,
    };
  } catch (err) {
    const error = err instanceof WorktreeError ? err.stderr : String(err);
    return {
      success: false,
      removed: false,
      error,
    };
  }
}

/**
 * Ensure the worktree base directory exists
 * Creates ~/.local/aynd/worktrees/ if it doesn't exist
 *
 * @returns Base directory path
 */
export async function ensureWorktreeBaseDir(): Promise<string> {
  const baseDir = join(homedir(), ".local", "aynd", "worktrees");

  try {
    await stat(baseDir);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      // Directory doesn't exist, create it
      await mkdir(baseDir, { recursive: true });
    } else {
      throw err;
    }
  }

  return baseDir;
}

/**
 * Get worktree path configuration for a project
 *
 * @param projectPath - Absolute project path
 * @param worktreeName - Name for the worktree
 * @returns Object with basePath and fullPath
 */
export function getWorktreePathConfig(
  projectPath: string,
  worktreeName: string,
): {
  basePath: string;
  fullPath: string;
} {
  const encoded = encodeProjectPath(projectPath);
  const basePath = join(homedir(), ".local", "aynd", "worktrees", encoded);
  const fullPath = generateDefaultWorktreePath(projectPath, worktreeName);

  return {
    basePath,
    fullPath,
  };
}
