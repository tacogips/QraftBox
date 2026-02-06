/**
 * Commit Executor
 *
 * Builds commit context and executes git commits.
 */

import type {
  CommitPromptContext,
  CommitResult,
  StagedFile,
} from "../../types/commit-context";
import type { CommitInfo } from "../../types/commit";
import { getStagedFiles, getStagedDiff } from "../git/staged";
import { getCommitLog } from "../git/commit-log";

/**
 * Error thrown when commit operations fail
 */
export class CommitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "CommitError";
  }
}

/**
 * Execute a git command and return stdout
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @returns Git command output
 * @throws CommitError if command fails
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
    throw new CommitError(
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
    throw new CommitError(
      `Git command failed with exit code ${exitCode}`,
      `git ${args.join(" ")}`,
      stderr,
    );
  }

  return stdout;
}

/**
 * Get current branch name
 *
 * @param cwd - Repository working directory
 * @returns Current branch name
 * @throws CommitError if unable to get branch name
 */
export async function getCurrentBranchName(cwd: string): Promise<string> {
  const args = ["rev-parse", "--abbrev-ref", "HEAD"];
  const output = await execGit(args, cwd);
  return output.trim();
}

/**
 * Build commit prompt context
 *
 * Gathers all information needed for AI commit prompt:
 * - Staged files with change statistics
 * - Full staged diff
 * - Current branch name
 * - Recent commit history
 *
 * @param cwd - Repository working directory
 * @returns Complete commit prompt context
 * @throws CommitError if unable to build context
 */
export async function buildContext(cwd: string): Promise<CommitPromptContext> {
  // Execute all git operations in parallel for performance
  const [stagedFiles, stagedDiff, branchName, commitLogResponse] =
    await Promise.all([
      getStagedFiles(cwd),
      getStagedDiff(cwd),
      getCurrentBranchName(cwd),
      getCommitLog(cwd, { limit: 10, offset: 0 }),
    ]);

  // Convert StagedFile from git/staged.ts to StagedFile from commit-context.ts
  // Map 'C' (Copied) to 'A' (Added) since StagedFileStatus doesn't include 'C'
  const contextStagedFiles: readonly StagedFile[] = stagedFiles.map((file) => ({
    path: file.path,
    status: file.status === "C" ? "A" : file.status,
    additions: file.additions,
    deletions: file.deletions,
  }));

  const recentCommits: readonly CommitInfo[] = commitLogResponse.commits;

  return {
    stagedFiles: contextStagedFiles,
    stagedDiff,
    branchName,
    recentCommits,
    repositoryRoot: cwd,
  };
}

/**
 * Execute git commit with the provided message
 *
 * @param cwd - Repository working directory
 * @param message - Commit message
 * @returns Commit result with success status and commit hash
 */
export async function executeCommit(
  cwd: string,
  message: string,
): Promise<CommitResult> {
  // Validate message
  if (!message || message.trim().length === 0) {
    return {
      success: false,
      commitHash: null,
      message: "",
      error: "Commit message cannot be empty",
    };
  }

  try {
    // Execute git commit
    const args = ["commit", "-m", message];
    await execGit(args, cwd);

    // Get the commit hash of the just-created commit
    const hashArgs = ["rev-parse", "HEAD"];
    const commitHash = (await execGit(hashArgs, cwd)).trim();

    return {
      success: true,
      commitHash,
      message,
      error: null,
    };
  } catch (e) {
    if (e instanceof CommitError) {
      return {
        success: false,
        commitHash: null,
        message,
        error: `Commit failed: ${e.stderr || e.message}`,
      };
    }

    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      commitHash: null,
      message,
      error: `Commit failed: ${errorMessage}`,
    };
  }
}

/**
 * Preview commit prompt
 *
 * Builds the commit context and returns a preview of what would be
 * sent to the AI without actually executing the commit.
 *
 * This function is intended for dry-run/preview functionality.
 * The actual prompt building should be done by the prompt system.
 *
 * @param context - Commit prompt context
 * @param promptId - Prompt template ID to use
 * @returns Preview text of the prompt
 */
export async function previewCommit(
  context: CommitPromptContext,
  promptId: string,
): Promise<string> {
  // Build a basic preview text
  // Note: The actual prompt template substitution should be done by
  // the prompt builder system (not yet implemented in TASK-002).
  // This is a placeholder that returns the raw context information.

  const filesList = context.stagedFiles
    .map((f) => `  ${f.status} ${f.path} (+${f.additions} -${f.deletions})`)
    .join("\n");

  const recentCommitsList = context.recentCommits
    .slice(0, 5)
    .map((c) => `  ${c.shortHash} ${c.message}`)
    .join("\n");

  const preview = `Commit Prompt Preview
Template: ${promptId}

Branch: ${context.branchName}
Repository: ${context.repositoryRoot}

Staged Files (${context.stagedFiles.length}):
${filesList}

Recent Commits:
${recentCommitsList}

Staged Diff:
${context.stagedDiff.slice(0, 500)}${context.stagedDiff.length > 500 ? "\n...(truncated)" : ""}

---
Note: This is a preview. The actual prompt will be built by the prompt system
using the selected template with these values substituted.
`;

  return preview;
}
