/**
 * Push Executor
 *
 * Builds push context and executes git push operations.
 */

import type {
  PushPromptContext,
  PushResult,
  UnpushedCommit,
  PushStatus,
  RemoteTracking,
} from "../../types/push-context";
import {
  getPushStatus as gitGetPushStatus,
  getUnpushedCommits,
  getRemotes as gitGetRemotes,
} from "../git/push";

/**
 * Error thrown when push operations fail
 */
export class PushError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "PushError";
  }
}

/**
 * Remote information (distinct from RemoteTracking)
 *
 * This type represents a git remote with fetch and push URLs,
 * as per the design specification.
 */
export interface Remote {
  readonly name: string;
  readonly fetchUrl: string;
  readonly pushUrl: string;
}

/**
 * Options for git push command
 */
export interface PushOptions {
  readonly remote?: string | undefined;
  readonly branch?: string | undefined;
  readonly force?: boolean | undefined;
  readonly setUpstream?: boolean | undefined;
  readonly pushTags?: boolean | undefined;
}

/**
 * Execute a git command and return stdout
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @returns Git command output
 * @throws PushError if command fails
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
    throw new PushError(
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
    throw new PushError(
      `Git command failed with exit code ${exitCode}`,
      `git ${args.join(" ")}`,
      stderr,
    );
  }

  return stdout;
}

/**
 * Get push status
 *
 * Wrapper around git/push.ts getPushStatus() for consistent executor API.
 *
 * @param cwd - Repository working directory
 * @returns Push status information
 */
export async function getPushStatus(cwd: string): Promise<PushStatus> {
  return gitGetPushStatus(cwd);
}

/**
 * Get list of remotes
 *
 * Converts RemoteTracking[] from git/push.ts to Remote[] as per design spec.
 * Remote has fetchUrl/pushUrl while RemoteTracking has url and branch.
 *
 * @param cwd - Repository working directory
 * @returns List of git remotes with fetch/push URLs
 */
export async function getRemotes(cwd: string): Promise<Remote[]> {
  const trackingRemotes = await gitGetRemotes(cwd);

  // Convert RemoteTracking[] to Remote[]
  // RemoteTracking has { name, url, branch }
  // Remote has { name, fetchUrl, pushUrl }
  // For simplicity, we use the same URL for both fetch and push
  return trackingRemotes.map((r: RemoteTracking) => ({
    name: r.name,
    fetchUrl: r.url,
    pushUrl: r.url,
  }));
}

/**
 * Build push prompt context
 *
 * Gathers all information needed for AI push prompt:
 * - Unpushed commits
 * - Push status (ahead/behind)
 * - Remote information
 * - Branch tracking
 *
 * @param cwd - Repository working directory
 * @param options - Optional push options to override defaults
 * @returns Complete push prompt context
 * @throws PushError if unable to build context
 */
export async function buildContext(
  cwd: string,
  options?: PushOptions,
): Promise<PushPromptContext> {
  // Execute all git operations in parallel for performance
  const [unpushedCommits, pushStatus, trackingRemotes] = await Promise.all([
    getUnpushedCommits(cwd),
    gitGetPushStatus(cwd),
    gitGetRemotes(cwd),
  ]);

  // Determine remote and branch for context
  let remoteName = options?.remote ?? "origin"; // Default or from options
  let remoteBranch = pushStatus.branchName; // Default to current branch

  // Use upstream remote if available (unless overridden by options)
  if (options?.remote === undefined && pushStatus.remote !== null) {
    remoteName = pushStatus.remote.name;
    remoteBranch = pushStatus.remote.branch;
  } else if (options?.remote === undefined) {
    // No upstream and no option override, try to find origin remote
    const originRemote = trackingRemotes.find((r) => r.name === "origin");
    if (originRemote !== undefined) {
      remoteName = originRemote.name;
      remoteBranch = originRemote.branch;
    } else if (trackingRemotes.length > 0) {
      // Use first available remote if origin doesn't exist
      const firstRemote = trackingRemotes[0];
      if (firstRemote !== undefined) {
        remoteName = firstRemote.name;
        remoteBranch = firstRemote.branch;
      }
    }
  }

  // Apply branch override from options if provided
  if (options?.branch !== undefined) {
    remoteBranch = options.branch;
  }

  return {
    branchName: pushStatus.branchName,
    remoteName,
    remoteBranch,
    unpushedCommits,
    hasUpstream: pushStatus.hasUpstream,
    aheadCount: pushStatus.aheadCount,
    behindCount: pushStatus.behindCount,
    customVariables: {},
  };
}

/**
 * Execute git push with the provided options
 *
 * @param cwd - Repository working directory
 * @param options - Push options (remote, branch, flags)
 * @returns Push result with success status and metadata
 */
export async function executePush(
  cwd: string,
  options: PushOptions,
): Promise<PushResult> {
  try {
    // Get push context to determine defaults
    const context = await buildContext(cwd, options);

    // Determine remote and branch
    const remote = options.remote ?? context.remoteName;
    const branch = options.branch ?? context.branchName;

    // Build git push arguments
    const args: string[] = ["push"];

    // Add flags
    if (options.setUpstream === true) {
      args.push("--set-upstream");
    }
    if (options.force === true) {
      args.push("--force");
    }
    if (options.pushTags === true) {
      args.push("--tags");
    }

    // Add remote and branch
    args.push(remote);
    args.push(branch);

    // Execute push
    await execGit(args, cwd);

    // Generate a mock session ID (in real implementation, this would come from session manager)
    const sessionId = `push-${Date.now()}`;

    return {
      success: true,
      remote,
      branch,
      pushedCommits: context.aheadCount,
      sessionId,
    };
  } catch (e) {
    // Generate a mock session ID for error case
    const sessionId = `push-error-${Date.now()}`;

    if (e instanceof PushError) {
      return {
        success: false,
        remote: options.remote ?? "unknown",
        branch: options.branch ?? "unknown",
        pushedCommits: 0,
        error: `Push failed: ${e.stderr || e.message}`,
        sessionId,
      };
    }

    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      remote: options.remote ?? "unknown",
      branch: options.branch ?? "unknown",
      pushedCommits: 0,
      error: `Push failed: ${errorMessage}`,
      sessionId,
    };
  }
}

/**
 * Preview push prompt
 *
 * Builds the push context and returns a preview of what would be
 * sent to the AI without actually executing the push.
 *
 * This function is intended for dry-run/preview functionality.
 * The actual prompt building should be done by the prompt system.
 *
 * @param context - Push prompt context
 * @param promptId - Prompt template ID to use
 * @returns Preview text of the prompt
 */
export async function previewPush(
  context: PushPromptContext,
  promptId: string,
): Promise<string> {
  // Build a basic preview text
  // Note: The actual prompt template substitution should be done by
  // the prompt builder system (not yet implemented in TASK-003).
  // This is a placeholder that returns the raw context information.

  const commitsList = context.unpushedCommits
    .map(
      (c: UnpushedCommit) =>
        `  ${c.shortHash} ${c.message} (${c.author}, ${new Date(c.date).toISOString()})`,
    )
    .join("\n");

  const statusInfo = context.hasUpstream
    ? `Tracking: ${context.remoteName}/${context.remoteBranch}`
    : "No upstream tracking";

  const divergenceInfo =
    context.behindCount > 0
      ? `WARNING: Local branch is ${context.behindCount} commit(s) behind remote`
      : "";

  const preview = `Push Prompt Preview
Template: ${promptId}

Branch: ${context.branchName}
Remote: ${context.remoteName}
Target Branch: ${context.remoteBranch}
${statusInfo}

Ahead: ${context.aheadCount} commit(s)
Behind: ${context.behindCount} commit(s)
${divergenceInfo}

Unpushed Commits (${context.unpushedCommits.length}):
${commitsList || "  (no unpushed commits)"}

---
Note: This is a preview. The actual prompt will be built by the prompt system
using the selected template with these values substituted.
`;

  return preview;
}
