/**
 * Gitignore Filter
 *
 * Provides gitignore-aware file filtering using git check-ignore command.
 * Caches results for performance optimization.
 */

import { execGit } from "../git/executor.js";

/**
 * Gitignore filter interface for checking if files are ignored by git
 */
export interface GitignoreFilter {
  /**
   * Check if a single file path is ignored by gitignore
   * Results are cached for performance.
   *
   * @param filePath - File path relative to project root
   * @returns Promise resolving to true if file is ignored
   */
  isIgnored(filePath: string): Promise<boolean>;

  /**
   * Check multiple file paths efficiently using git check-ignore --stdin
   * Results are cached individually.
   *
   * @param filePaths - Array of file paths relative to project root
   * @returns Promise resolving to array of booleans in same order as input
   */
  isIgnoredBatch(filePaths: readonly string[]): Promise<readonly boolean[]>;

  /**
   * Clear the internal cache
   * Useful when .gitignore file is modified.
   */
  clearCache(): void;
}

/**
 * Create a gitignore filter for a project
 *
 * @param projectPath - Absolute path to project root (git repository)
 * @returns GitignoreFilter instance
 *
 * @example
 * ```typescript
 * const filter = createGitignoreFilter('/path/to/repo');
 *
 * // Check single file
 * if (await filter.isIgnored('node_modules/package/index.js')) {
 *   console.log('File is ignored');
 * }
 *
 * // Check multiple files efficiently
 * const results = await filter.isIgnoredBatch([
 *   'src/main.ts',
 *   'node_modules/dep/index.js',
 *   'dist/bundle.js',
 * ]);
 * ```
 */
export function createGitignoreFilter(projectPath: string): GitignoreFilter {
  // Cache for storing results: path -> isIgnored
  const cache = new Map<string, boolean>();

  /**
   * Check if path is .git/ directory or inside it
   */
  function isGitDirectory(filePath: string): boolean {
    return filePath === ".git" || filePath.startsWith(".git/");
  }

  /**
   * Check if a single file is ignored
   */
  async function isIgnored(filePath: string): Promise<boolean> {
    // Always treat .git/ paths as ignored
    if (isGitDirectory(filePath)) {
      return true;
    }

    // Check cache first
    const cached = cache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    // Run git check-ignore -q (quiet mode, only exit code matters)
    const result = await execGit(["check-ignore", "-q", filePath], {
      cwd: projectPath,
    });

    // Exit code 0 = ignored, exit code 1 = not ignored
    const ignored = result.exitCode === 0;

    // Cache the result
    cache.set(filePath, ignored);

    return ignored;
  }

  /**
   * Check multiple files efficiently using --stdin
   */
  async function isIgnoredBatch(
    filePaths: readonly string[],
  ): Promise<readonly boolean[]> {
    if (filePaths.length === 0) {
      return [];
    }

    // Initialize results array with false (default: not ignored)
    const results: boolean[] = new Array(filePaths.length).fill(false);
    const uncachedIndices: number[] = [];
    const uncachedPaths: string[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      const path = filePaths[i];
      if (path === undefined) {
        continue;
      }

      // Check if .git directory
      if (isGitDirectory(path)) {
        results[i] = true;
        continue;
      }

      // Check cache
      const cached = cache.get(path);
      if (cached !== undefined) {
        results[i] = cached;
        continue;
      }

      // Track uncached paths
      uncachedIndices.push(i);
      uncachedPaths.push(path);
    }

    // If all paths were cached or .git, return early
    if (uncachedPaths.length === 0) {
      return results;
    }

    // Run git check-ignore --stdin with stdin support
    // execGit doesn't support stdin, so we use Bun.spawn directly
    const input = uncachedPaths.join("\n");

    const proc = Bun.spawn(["git", "check-ignore", "--stdin"], {
      cwd: projectPath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Write input to stdin
    proc.stdin.write(input);
    proc.stdin.end();

    // Wait for output
    const [stdout, _stderr, _exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    // Parse output: lines in stdout are ignored files
    const ignoredSet = new Set<string>();
    if (stdout.trim() !== "") {
      const ignoredPaths = stdout.trim().split("\n");
      for (const path of ignoredPaths) {
        ignoredSet.add(path);
      }
    }

    // Fill in results for uncached paths
    for (let i = 0; i < uncachedPaths.length; i++) {
      const path = uncachedPaths[i];
      const index = uncachedIndices[i];

      if (path === undefined || index === undefined) {
        continue;
      }

      const ignored = ignoredSet.has(path);
      results[index] = ignored;

      // Cache the result
      cache.set(path, ignored);
    }

    return results;
  }

  /**
   * Clear the cache
   */
  function clearCache(): void {
    cache.clear();
  }

  return {
    isIgnored,
    isIgnoredBatch,
    clearCache,
  };
}
