/**
 * GitHub Repository URL Parser
 *
 * Parses GitHub repository information from git remote URLs and provides
 * utilities for extracting owner/repo identifiers.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Repository identifier (owner/repo)
 */
export interface RepoIdentifier {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Parse GitHub remote URL to extract owner and repo
 *
 * Supports the following URL formats:
 * - SSH: git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 * - HTTPS (no .git): https://github.com/owner/repo
 *
 * @param url - Git remote URL
 * @returns Repository identifier or null if parsing fails
 */
export function parseGitRemoteUrl(url: string): RepoIdentifier | null {
  if (!url || url.trim().length === 0) {
    return null;
  }

  const trimmedUrl = url.trim();

  // SSH format: git@github.com:owner/repo.git
  const sshRegex = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;
  const sshMatch = sshRegex.exec(trimmedUrl);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    if (owner && repo) {
      return { owner, repo };
    }
  }

  // HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsRegex = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;
  const httpsMatch = httpsRegex.exec(trimmedUrl);
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    if (owner && repo) {
      return { owner, repo };
    }
  }

  return null;
}

/**
 * Get repository identifier from git remote
 *
 * Executes `git remote get-url <remote>` and parses the result.
 *
 * @param cwd - Working directory (repository root)
 * @param remote - Remote name (default: "origin")
 * @returns Repository identifier or null if not found or parsing fails
 */
export async function getRepoFromRemote(
  cwd: string,
  remote: string = "origin",
): Promise<RepoIdentifier | null> {
  if (!cwd || cwd.trim().length === 0) {
    return null;
  }

  if (!remote || remote.trim().length === 0) {
    return null;
  }

  try {
    const { stdout } = await execAsync(`git remote get-url ${remote}`, {
      cwd,
      encoding: "utf-8",
    });

    const url = stdout.trim();
    return parseGitRemoteUrl(url);
  } catch (error) {
    // Remote not found or git command failed
    return null;
  }
}
