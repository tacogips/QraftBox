/**
 * Git Push Operations
 *
 * Provides functions to retrieve push-related information and manage remotes
 * using native git commands via Bun.spawn.
 */

import type {
  PushStatus,
  UnpushedCommit,
  RemoteTracking,
} from "../../types/push-context";

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
 * Execute a git command that may fail without throwing
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @returns Git command output or null if command failed
 */
async function execGitSafe(
  args: readonly string[],
  cwd: string,
): Promise<string | null> {
  try {
    return await execGit(args, cwd);
  } catch {
    return null;
  }
}

/**
 * Get current branch name
 *
 * @param cwd - Repository working directory
 * @returns Current branch name
 */
async function getCurrentBranch(cwd: string): Promise<string> {
  const output = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return output.trim();
}

/**
 * Get upstream tracking information for current branch
 *
 * @param cwd - Repository working directory
 * @param branch - Branch name (defaults to current branch)
 * @returns Upstream remote and branch, or null if no upstream
 */
async function getUpstreamInfo(
  cwd: string,
  branch?: string,
): Promise<{ remote: string; branch: string } | null> {
  const currentBranch = branch ?? (await getCurrentBranch(cwd));

  // Get upstream remote
  const remoteOutput = await execGitSafe(
    ["config", `branch.${currentBranch}.remote`],
    cwd,
  );
  if (remoteOutput === null) {
    return null;
  }
  const remote = remoteOutput.trim();

  // Get upstream branch
  const branchOutput = await execGitSafe(
    ["config", `branch.${currentBranch}.merge`],
    cwd,
  );
  if (branchOutput === null) {
    return null;
  }
  const upstreamBranch = branchOutput.trim().replace("refs/heads/", "");

  return { remote, branch: upstreamBranch };
}

/**
 * Get ahead/behind counts for current branch compared to upstream
 *
 * @param cwd - Repository working directory
 * @returns Object with ahead and behind counts
 */
export async function getAheadBehind(
  cwd: string,
): Promise<{ ahead: number; behind: number }> {
  const upstream = await getUpstreamInfo(cwd);
  if (upstream === null) {
    // No upstream, check if there are any commits
    const commitCountOutput = await execGitSafe(
      ["rev-list", "--count", "HEAD"],
      cwd,
    );
    const ahead = commitCountOutput
      ? parseInt(commitCountOutput.trim(), 10)
      : 0;
    return { ahead, behind: 0 };
  }

  // Get ahead/behind counts
  const branch = await getCurrentBranch(cwd);
  const upstreamRef = `${upstream.remote}/${upstream.branch}`;

  const output = await execGitSafe(
    ["rev-list", "--left-right", "--count", `${upstreamRef}...${branch}`],
    cwd,
  );

  if (output === null) {
    // Upstream branch doesn't exist on remote yet
    const commitCountOutput = await execGitSafe(
      ["rev-list", "--count", "HEAD"],
      cwd,
    );
    const ahead = commitCountOutput
      ? parseInt(commitCountOutput.trim(), 10)
      : 0;
    return { ahead, behind: 0 };
  }

  const parts = output.trim().split(/\s+/);
  const behind = parts[0] ? parseInt(parts[0], 10) : 0;
  const ahead = parts[1] ? parseInt(parts[1], 10) : 0;

  return { ahead, behind };
}

/**
 * Get list of unpushed commits
 *
 * @param cwd - Repository working directory
 * @returns Array of unpushed commits
 */
export async function getUnpushedCommits(
  cwd: string,
): Promise<UnpushedCommit[]> {
  const upstream = await getUpstreamInfo(cwd);

  let logArgs: string[];
  if (upstream === null) {
    // No upstream, show all commits
    logArgs = ["log", "HEAD", "--format=%H%n%h%n%s%n%an%n%at%n---END---"];
  } else {
    // Show commits ahead of upstream
    const upstreamRef = `${upstream.remote}/${upstream.branch}`;
    const upstreamExists = await execGitSafe(
      ["rev-parse", "--verify", upstreamRef],
      cwd,
    );

    if (upstreamExists === null) {
      // Upstream doesn't exist, show all commits
      logArgs = ["log", "HEAD", "--format=%H%n%h%n%s%n%an%n%at%n---END---"];
    } else {
      // Show commits from upstream to HEAD
      logArgs = [
        "log",
        `${upstreamRef}..HEAD`,
        "--format=%H%n%h%n%s%n%an%n%at%n---END---",
      ];
    }
  }

  const output = await execGit(logArgs, cwd);

  if (!output.trim()) {
    return [];
  }

  const commits: UnpushedCommit[] = [];
  const commitBlocks = output
    .split("---END---\n")
    .filter((block) => block.trim());

  for (const block of commitBlocks) {
    const lines = block.split("\n");
    if (lines.length < 5) {
      continue;
    }

    const hash = lines[0]?.trim() ?? "";
    const shortHash = lines[1]?.trim() ?? "";
    const message = lines[2]?.trim() ?? "";
    const author = lines[3]?.trim() ?? "";
    const timestamp = lines[4]?.trim() ?? "0";

    if (!hash || !shortHash) {
      continue;
    }

    commits.push({
      hash,
      shortHash,
      message,
      author,
      date: parseInt(timestamp, 10) * 1000, // Convert to milliseconds
    });
  }

  return commits;
}

/**
 * Get list of remotes with their URLs
 *
 * @param cwd - Repository working directory
 * @returns Array of remote tracking information
 */
export async function getRemotes(cwd: string): Promise<RemoteTracking[]> {
  const output = await execGit(["remote", "-v"], cwd);

  if (!output.trim()) {
    return [];
  }

  const lines = output.trim().split("\n");
  const remoteMap = new Map<string, { url: string; branch: string }>();

  // Parse remote output: origin https://github.com/user/repo.git (fetch)
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      continue;
    }

    const name = parts[0] ?? "";
    const url = parts[1] ?? "";
    const type = parts[2] ?? "";

    // Only process fetch entries to avoid duplicates
    if (!name || !url || !type.includes("fetch")) {
      continue;
    }

    // Get default branch for this remote if possible
    const defaultBranch = await getRemoteDefaultBranch(cwd, name);

    remoteMap.set(name, {
      url,
      branch: defaultBranch,
    });
  }

  // Convert map to array
  const remotes: RemoteTracking[] = [];
  for (const [name, info] of remoteMap) {
    remotes.push({
      name,
      url: info.url,
      branch: info.branch,
    });
  }

  return remotes;
}

/**
 * Get default branch for a remote
 *
 * @param cwd - Repository working directory
 * @param remoteName - Remote name
 * @returns Default branch name
 */
async function getRemoteDefaultBranch(
  cwd: string,
  remoteName: string,
): Promise<string> {
  // Try to get HEAD ref for remote
  const output = await execGitSafe(
    ["symbolic-ref", `refs/remotes/${remoteName}/HEAD`],
    cwd,
  );

  if (output !== null) {
    // Parse: refs/remotes/origin/main -> main
    const branch = output.trim().replace(`refs/remotes/${remoteName}/`, "");
    return branch;
  }

  // Fallback: try common default branches
  const commonBranches = ["main", "master"];
  for (const branch of commonBranches) {
    const exists = await execGitSafe(
      ["rev-parse", "--verify", `${remoteName}/${branch}`],
      cwd,
    );
    if (exists !== null) {
      return branch;
    }
  }

  // Final fallback
  return "main";
}

/**
 * Get push status for current branch
 *
 * @param cwd - Repository working directory
 * @returns Push status information
 */
export async function getPushStatus(cwd: string): Promise<PushStatus> {
  try {
    const branchName = await getCurrentBranch(cwd);
    const upstream = await getUpstreamInfo(cwd);
    const { ahead, behind } = await getAheadBehind(cwd);
    const unpushedCommits = await getUnpushedCommits(cwd);

    let remote: RemoteTracking | null = null;
    if (upstream !== null) {
      // Get remote URL
      const remotes = await getRemotes(cwd);
      const matchingRemote = remotes.find((r) => r.name === upstream.remote);

      if (matchingRemote !== undefined) {
        remote = {
          name: upstream.remote,
          url: matchingRemote.url,
          branch: upstream.branch,
        };
      }
    }

    return {
      canPush: ahead > 0,
      branchName,
      remote,
      hasUpstream: upstream !== null,
      aheadCount: ahead,
      behindCount: behind,
      unpushedCommits,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      canPush: false,
      branchName: "",
      remote: null,
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      unpushedCommits: [],
      error: errorMessage,
    };
  }
}
