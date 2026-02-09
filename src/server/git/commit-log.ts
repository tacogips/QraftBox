/**
 * Git Commit Log Operations
 *
 * Provides functions to retrieve and parse git commit history using native
 * git commands via Bun.spawn.
 */

import type {
  CommitInfo,
  CommitAuthor,
  CommitDetail,
  CommitStats,
  CommitFileChange,
  CommitLogResponse,
  CommitPagination,
  CommitLogQuery,
  FileChangeStatus,
} from "../../types/commit";

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
 * Parse commit author from git log format
 *
 * @param name - Author name
 * @param email - Author email
 * @returns CommitAuthor object
 */
function parseAuthor(name: string, email: string): CommitAuthor {
  return {
    name: name.trim(),
    email: email.trim(),
  };
}

/**
 * Parse git log output into CommitInfo objects
 *
 * Format: %H%n%h%n%s%n%b%n---BODY-END---%n%an%n%ae%n%cn%n%ce%n%at%n%P%n---END---
 *
 * @param output - Git log output
 * @returns Array of CommitInfo objects
 */
function parseGitLog(output: string): CommitInfo[] {
  if (!output.trim()) {
    return [];
  }

  const commits: CommitInfo[] = [];
  const commitBlocks = output
    .split("---END---\n")
    .filter((block) => block.trim());

  for (const block of commitBlocks) {
    const lines = block.split("\n");
    if (lines.length < 10) {
      continue;
    }

    const hash = lines[0]?.trim() ?? "";
    const shortHash = lines[1]?.trim() ?? "";
    const message = lines[2]?.trim() ?? "";

    // Find the body-end marker
    let bodyEndIndex = lines.indexOf("---BODY-END---");
    if (bodyEndIndex === -1) {
      bodyEndIndex = 3; // Fallback if marker not found
    }

    // Body is everything between message and body-end marker
    const bodyLines: string[] = [];
    for (let i = 3; i < bodyEndIndex; i++) {
      const line = lines[i];
      if (line !== undefined) {
        bodyLines.push(line);
      }
    }
    const body = bodyLines.join("\n").trim();

    // Metadata starts after body-end marker
    const metaStart = bodyEndIndex + 1;
    const authorName = lines[metaStart] ?? "";
    const authorEmail = lines[metaStart + 1] ?? "";
    const committerName = lines[metaStart + 2] ?? "";
    const committerEmail = lines[metaStart + 3] ?? "";
    const timestamp = lines[metaStart + 4]?.trim() ?? "0";
    const parents = lines[metaStart + 5]?.trim() ?? "";

    const author = parseAuthor(authorName, authorEmail);
    const committer = parseAuthor(committerName, committerEmail);
    const date = parseInt(timestamp, 10) * 1000; // Convert to milliseconds
    const parentHashes = parents ? parents.split(" ") : [];

    commits.push({
      hash,
      shortHash,
      message,
      body,
      author,
      committer,
      date,
      parentHashes,
    });
  }

  return commits;
}

/**
 * Parse git numstat output for file statistics
 *
 * Format: additions deletions path
 *
 * @param output - Git numstat output
 * @returns Array of file changes with statistics
 */
function parseNumstat(output: string): CommitFileChange[] {
  const files: CommitFileChange[] = [];
  const lines = output.trim().split("\n");

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
      const pathMatch = pathPart.match(/^(.*)\{(.+) => (.+)\}(.*)$/);
      if (pathMatch) {
        const [, prefix, oldName, newName, suffix] = pathMatch;
        oldPath = `${prefix ?? ""}${oldName ?? ""}${suffix ?? ""}`;
        path = `${prefix ?? ""}${newName ?? ""}${suffix ?? ""}`;
        status = "R";
      } else {
        const renameParts = pathPart.split(" => ");
        oldPath = renameParts[0]?.trim();
        path = renameParts[1]?.trim() ?? path;
        status = "R";
      }
    } else if (additions > 0 && deletions === 0) {
      status = "A";
    } else if (additions === 0 && deletions > 0) {
      status = "D";
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
 * Parse file status from git diff --name-status
 *
 * @param statusChar - Git status character
 * @returns FileChangeStatus
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
 * Get list of commits with pagination
 *
 * @param cwd - Repository working directory
 * @param options - Query options for filtering and pagination
 * @returns Commit log response with pagination info
 */
export async function getCommitLog(
  cwd: string,
  options?: CommitLogQuery,
): Promise<CommitLogResponse> {
  const branch = options?.branch ?? "HEAD";
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const search = options?.search;

  // If search is provided, use OR logic (message OR author)
  if (search && search.trim()) {
    return getCommitLogWithSearch(cwd, branch, search.trim(), limit, offset);
  }

  // No search: standard pagination
  const args = [
    "log",
    branch,
    "--format=%H%n%h%n%s%n%b%n---BODY-END---%n%an%n%ae%n%cn%n%ce%n%at%n%P%n---END---",
    `--skip=${offset}`,
    `--max-count=${limit}`,
  ];

  const output = await execGit(args, cwd);
  const commits = parseGitLog(output);

  // Get total count for pagination
  const total = await getCommitCount(cwd, branch);

  const pagination: CommitPagination = {
    offset,
    limit,
    total,
    hasMore: offset + commits.length < total,
  };

  return {
    commits,
    pagination,
    branch,
  };
}

/**
 * Get commits with search filter using OR logic (message OR author OR hash)
 *
 * @param cwd - Repository working directory
 * @param branch - Branch name
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @param offset - Number of results to skip
 * @returns Commit log response with search results
 */
async function getCommitLogWithSearch(
  cwd: string,
  branch: string,
  query: string,
  limit: number,
  offset: number,
): Promise<CommitLogResponse> {
  // Over-fetch to ensure we have enough results after deduplication and pagination
  const fetchLimit = Math.max(limit * 4, offset + limit + 100);
  const format =
    "--format=%H%n%h%n%s%n%b%n---BODY-END---%n%an%n%ae%n%cn%n%ce%n%at%n%P%n---END---";

  // Perform parallel searches: message, author, and optionally hash
  const messageArgs = [
    "log",
    branch,
    format,
    `--max-count=${fetchLimit}`,
    "-i",
    `--grep=${query}`,
  ];

  const authorArgs = [
    "log",
    branch,
    format,
    `--max-count=${fetchLimit}`,
    "-i",
    `--author=${query}`,
  ];

  const searches: Promise<string>[] = [
    execGit(messageArgs, cwd).catch(() => ""),
    execGit(authorArgs, cwd).catch(() => ""),
  ];

  // If query looks like a hex hash prefix (4-40 chars), also search by commit hash
  if (/^[0-9a-f]{4,40}$/i.test(query)) {
    const hashArgs = ["log", "-1", query, format];
    searches.push(execGit(hashArgs, cwd).catch(() => ""));
  }

  const outputs = await Promise.all(searches);

  // Merge and deduplicate by hash
  const seenHashes = new Set<string>();
  const allResults: CommitInfo[] = [];

  for (const output of outputs) {
    for (const commit of parseGitLog(output)) {
      if (!seenHashes.has(commit.hash)) {
        seenHashes.add(commit.hash);
        allResults.push(commit);
      }
    }
  }

  // Sort by date (newest first)
  allResults.sort((a, b) => b.date - a.date);

  // Apply pagination manually
  const total = allResults.length;
  const commits = allResults.slice(offset, offset + limit);

  const pagination: CommitPagination = {
    offset,
    limit,
    total,
    hasMore: offset + commits.length < total,
  };

  return {
    commits,
    pagination,
    branch,
  };
}

/**
 * Get detailed commit information including stats and file changes
 *
 * @param cwd - Repository working directory
 * @param hash - Commit hash (full or short)
 * @returns Detailed commit information
 */
export async function getCommitDetail(
  cwd: string,
  hash: string,
): Promise<CommitDetail> {
  // Get basic commit info
  const commitArgs = [
    "log",
    "-1",
    hash,
    "--format=%H%n%h%n%s%n%b%n---BODY-END---%n%an%n%ae%n%cn%n%ce%n%at%n%P%n---END---",
  ];
  const commitOutput = await execGit(commitArgs, cwd);
  const commits = parseGitLog(commitOutput);

  const commitInfo = commits[0];
  if (commitInfo === undefined) {
    throw new GitError(`Commit not found: ${hash}`, `git log -1 ${hash}`, "");
  }

  // Get file changes with statistics
  const files = await getCommitFiles(cwd, hash);

  // Calculate stats
  const stats: CommitStats = {
    filesChanged: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };

  return {
    ...commitInfo,
    stats,
    files,
  };
}

/**
 * Get files changed in a commit with statistics
 *
 * @param cwd - Repository working directory
 * @param hash - Commit hash
 * @returns Array of file changes
 */
export async function getCommitFiles(
  cwd: string,
  hash: string,
): Promise<CommitFileChange[]> {
  // Get numstat for additions/deletions
  const numstatArgs = ["show", hash, "--numstat", "--format="];
  const numstatOutput = await execGit(numstatArgs, cwd);
  const filesWithStats = parseNumstat(numstatOutput);

  // Get name-status for accurate status codes
  const statusArgs = ["show", hash, "--name-status", "--format="];
  const statusOutput = await execGit(statusArgs, cwd);
  const statusLines = statusOutput.trim().split("\n");

  // Create a map of path to status
  const statusMap = new Map<string, FileChangeStatus>();
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

    // Handle renames
    if (parts.length === 3 && status === "R") {
      const newPath = parts[2] ?? "";
      statusMap.set(newPath, status);
    }
  }

  // Merge status information into files with stats
  return filesWithStats.map((file) => ({
    ...file,
    status: statusMap.get(file.path) ?? file.status,
  }));
}

/**
 * Get total number of commits for pagination
 *
 * @param cwd - Repository working directory
 * @param branch - Branch name (optional, defaults to HEAD)
 * @returns Total commit count
 */
export async function getCommitCount(
  cwd: string,
  branch?: string,
): Promise<number> {
  const ref = branch ?? "HEAD";
  const args = ["rev-list", "--count", ref];
  const output = await execGit(args, cwd);
  return parseInt(output.trim(), 10);
}

/**
 * Search commits by message or author
 *
 * @param cwd - Repository working directory
 * @param query - Search query string
 * @param options - Search options (limit, branch)
 * @returns Array of matching commits
 */
export async function searchCommits(
  cwd: string,
  query: string,
  options?: { readonly limit?: number; readonly branch?: string },
): Promise<CommitInfo[]> {
  const branch = options?.branch ?? "HEAD";
  const limit = options?.limit ?? 100;

  // Perform two searches and merge results: message search and author search
  const messageArgs = [
    "log",
    branch,
    "--format=%H%n%h%n%s%n%b%n---BODY-END---%n%an%n%ae%n%cn%n%ce%n%at%n%P%n---END---",
    `--max-count=${limit}`,
    "-i", // Case insensitive
    `--grep=${query}`,
  ];

  const authorArgs = [
    "log",
    branch,
    "--format=%H%n%h%n%s%n%b%n---BODY-END---%n%an%n%ae%n%cn%n%ce%n%at%n%P%n---END---",
    `--max-count=${limit}`,
    "-i", // Case insensitive
    `--author=${query}`,
  ];

  // Execute both searches in parallel
  const [messageOutput, authorOutput] = await Promise.all([
    execGit(messageArgs, cwd).catch(() => ""),
    execGit(authorArgs, cwd).catch(() => ""),
  ]);

  const messageCommits = parseGitLog(messageOutput);
  const authorCommits = parseGitLog(authorOutput);

  // Merge and deduplicate by hash
  const seenHashes = new Set<string>();
  const results: CommitInfo[] = [];

  for (const commit of [...messageCommits, ...authorCommits]) {
    if (!seenHashes.has(commit.hash)) {
      seenHashes.add(commit.hash);
      results.push(commit);
    }
  }

  // Sort by date (newest first) and limit
  results.sort((a, b) => b.date - a.date);
  return results.slice(0, limit);
}
