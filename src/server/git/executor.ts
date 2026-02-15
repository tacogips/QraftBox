/**
 * Git Command Executor
 *
 * Centralized module for executing git commands using Bun.spawn.
 * Provides both standard execution and streaming interfaces with timeout support.
 */

/**
 * Options for executing git commands
 */
export interface GitExecOptions {
  readonly cwd: string;
  readonly timeout?: number | undefined;
  readonly maxBuffer?: number | undefined;
}

/**
 * Result of a git command execution
 */
export interface GitExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Error thrown when git command execution fails
 */
export class GitExecutorError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "GitExecutorError";
  }
}

/**
 * Default timeout for git operations (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Execute a git command and return stdout, stderr, and exit code
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param options - Execution options (cwd, timeout, maxBuffer)
 * @returns Promise resolving to command result
 * @throws GitExecutorError if command fails or times out
 *
 * @example
 * ```typescript
 * const result = await execGit(['status', '--porcelain'], { cwd: '/path/to/repo' });
 * if (result.exitCode === 0) {
 *   console.log(result.stdout);
 * }
 * ```
 */
export async function execGit(
  args: readonly string[],
  options: GitExecOptions,
): Promise<GitExecResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const command = `git ${args.join(" ")}`;

  let proc;
  try {
    proc = Bun.spawn(["git", ...args], {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new GitExecutorError(
      `Failed to spawn git process: ${errorMessage}`,
      command,
      errorMessage,
      -1,
    );
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    clearTimeout(timeoutId);

    return {
      stdout,
      stderr,
      exitCode,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    // Ensure the process is killed and reaped to prevent zombie processes
    try {
      proc.kill();
    } catch {
      // Process may have already exited
    }
    await proc.exited.catch(() => {});
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new GitExecutorError(
      `Git command execution failed: ${errorMessage}`,
      command,
      errorMessage,
      -1,
    );
  }
}

/**
 * Execute a git command and return a readable stream of stdout
 *
 * Use this for large outputs (like git log with many commits) to avoid
 * buffering the entire output in memory.
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param options - Execution options (cwd, timeout)
 * @returns ReadableStream of stdout bytes
 * @throws GitExecutorError if command fails to start
 *
 * @example
 * ```typescript
 * const stream = execGitStream(['log', '--all', '--oneline'], { cwd: '/path/to/repo' });
 * const reader = stream.getReader();
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   // Process chunk...
 * }
 * ```
 */
export function execGitStream(
  args: readonly string[],
  options: GitExecOptions,
): ReadableStream<Uint8Array> {
  const command = `git ${args.join(" ")}`;

  let proc;
  try {
    proc = Bun.spawn(["git", ...args], {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "ignore",
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new GitExecutorError(
      `Failed to spawn git process: ${errorMessage}`,
      command,
      errorMessage,
      -1,
    );
  }

  // Ensure the process is always reaped even if the caller doesn't await exited
  void proc.exited.catch(() => {});

  return proc.stdout;
}

/**
 * Unquote a git-quoted file path
 *
 * Git quotes filenames containing special characters (non-ASCII, spaces, etc.)
 * by wrapping them in double quotes and using octal escape sequences for
 * non-ASCII bytes (UTF-8). For example:
 * - "dir/\343\201\202.txt" -> dir/あ.txt
 * - "spaces in name.txt" is returned as-is (not quoted)
 * - "\"quoted\".txt" -> "quoted".txt
 *
 * @param line - A line from git output that may be a quoted path
 * @returns Unquoted, decoded path string
 */
export function unquoteGitPath(line: string): string {
  if (!line.startsWith('"') || !line.endsWith('"')) {
    return line;
  }

  const inner = line.slice(1, -1);
  const bytes: number[] = [];
  let i = 0;

  while (i < inner.length) {
    if (inner[i] === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1]!;
      if (next === "\\") {
        bytes.push(0x5c);
        i += 2;
      } else if (next === '"') {
        bytes.push(0x22);
        i += 2;
      } else if (next === "n") {
        bytes.push(0x0a);
        i += 2;
      } else if (next === "t") {
        bytes.push(0x09);
        i += 2;
      } else if (next === "a") {
        bytes.push(0x07);
        i += 2;
      } else if (next === "b") {
        bytes.push(0x08);
        i += 2;
      } else if (next === "r") {
        bytes.push(0x0d);
        i += 2;
      } else if (next >= "0" && next <= "7") {
        // Octal escape: \NNN (up to 3 digits)
        let octal = next;
        let j = i + 2;
        while (
          j < inner.length &&
          j < i + 4 &&
          inner[j]! >= "0" &&
          inner[j]! <= "7"
        ) {
          octal += inner[j]!;
          j++;
        }
        bytes.push(parseInt(octal, 8));
        i = j;
      } else {
        // Unknown escape - keep as-is
        bytes.push(inner.charCodeAt(i));
        i++;
      }
    } else {
      const ch = inner[i]!;
      const code = ch.charCodeAt(0);
      if (code < 0x80) {
        bytes.push(code);
      } else {
        const encoded = new TextEncoder().encode(ch);
        for (const b of encoded) {
          bytes.push(b);
        }
      }
      i++;
    }
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Check if a directory is a git repository
 *
 * Uses `git rev-parse --git-dir` which succeeds (exit code 0) if inside a git repository.
 *
 * @param path - Directory path to check
 * @returns Promise resolving to true if path is in a git repository
 *
 * @example
 * ```typescript
 * if (await isGitRepository('/path/to/maybe-repo')) {
 *   console.log('This is a git repository');
 * }
 * ```
 */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const result = await execGit(["rev-parse", "--git-dir"], { cwd: path });
    return result.exitCode === 0;
  } catch (e) {
    // Command failed - not a git repository
    return false;
  }
}

/**
 * Get the root directory of a git repository
 *
 * Uses `git rev-parse --show-toplevel` to find the repository root.
 *
 * @param path - Any path within the repository
 * @returns Promise resolving to absolute path of repository root
 * @throws GitExecutorError if not in a git repository or command fails
 *
 * @example
 * ```typescript
 * const root = await getRepoRoot('/path/to/repo/subdir');
 * console.log(root); // '/path/to/repo'
 * ```
 */
export async function getRepoRoot(path: string): Promise<string> {
  const result = await execGit(["rev-parse", "--show-toplevel"], { cwd: path });

  if (result.exitCode !== 0) {
    throw new GitExecutorError(
      "Not a git repository or git command failed",
      "git rev-parse --show-toplevel",
      result.stderr,
      result.exitCode,
    );
  }

  return result.stdout.trim();
}
