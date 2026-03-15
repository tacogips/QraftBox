/**
 * Search Service
 *
 * Provides regex-based search functionality for the diff viewer.
 * Supports three scopes: file, changed, and all (entire repository).
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  SearchScope,
  SearchResult,
  SearchResultContext,
  ValidationResult,
} from "../../types/search";
import { getChangedFiles } from "../git/diff.js";
import { execGit, unquoteGitPath } from "../git/executor.js";
import { getAllFiles, getUntrackedFiles } from "../git/files.js";

/**
 * Diff target for determining changed files
 */
export interface DiffTarget {
  readonly type: "branch" | "commit" | "working";
  readonly ref?: string | undefined;
}

/**
 * Search options
 */
export interface SearchOptions {
  readonly pattern: string;
  readonly caseSensitive?: boolean | undefined;
  readonly contextLines?: number | undefined;
  readonly excludeFileNames?: readonly string[] | undefined;
  readonly maxResults?: number | undefined;
  readonly showIgnored?: boolean | undefined;
  readonly showAllFiles?: boolean | undefined;
}

/**
 * Default maximum number of results to return
 */
const DEFAULT_MAX_RESULTS = 1000;

/**
 * Default number of context lines
 */
const DEFAULT_CONTEXT_LINES = 2;

/**
 * Maximum file size to search (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Validate regex pattern
 *
 * @param pattern - The regex pattern to validate
 * @returns Validation result with error message if invalid
 */
export function validatePattern(pattern: string): ValidationResult {
  if (pattern.length === 0) {
    return {
      valid: false,
      error: "Pattern cannot be empty",
    };
  }

  // Pattern length validation (prevent ReDoS)
  if (pattern.length > 500) {
    return {
      valid: false,
      error: "Pattern exceeds maximum length of 500 characters",
    };
  }

  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "Invalid regular expression";
    return {
      valid: false,
      error: `Invalid regex pattern: ${errorMessage}`,
    };
  }
}

/**
 * Get context lines around a match
 *
 * @param lines - All lines of the file
 * @param lineIndex - Index of the matching line (0-based)
 * @param contextLines - Number of context lines to include
 * @returns Context before and after the match
 */
function getContextLines(
  lines: readonly string[],
  lineIndex: number,
  contextLines: number,
): SearchResultContext {
  const before: string[] = [];
  const after: string[] = [];

  // Get lines before
  for (let i = Math.max(0, lineIndex - contextLines); i < lineIndex; i++) {
    before.push(lines[i] ?? "");
  }

  // Get lines after
  for (
    let i = lineIndex + 1;
    i <= Math.min(lines.length - 1, lineIndex + contextLines);
    i++
  ) {
    after.push(lines[i] ?? "");
  }

  return { before, after };
}

/**
 * Search within file content
 *
 * @param content - The file content to search in
 * @param filePath - Path of the file being searched
 * @param options - Search options
 * @returns Array of search results
 */
export function searchInFile(
  content: string,
  filePath: string,
  options: SearchOptions,
): readonly SearchResult[] {
  const {
    pattern,
    caseSensitive = false,
    contextLines = DEFAULT_CONTEXT_LINES,
    maxResults = DEFAULT_MAX_RESULTS,
  } = options;

  // Validate pattern
  const validation = validatePattern(pattern);
  if (!validation.valid) {
    return [];
  }

  // Skip files that are too large
  if (content.length > MAX_FILE_SIZE) {
    return [];
  }

  const results: SearchResult[] = [];
  const flags = caseSensitive ? "g" : "gi";

  try {
    const regex = new RegExp(pattern, flags);
    const lines = content.split("\n");

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (line === undefined) continue;

      // Find all matches on this line
      regex.lastIndex = 0; // Reset regex state
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        // Prevent infinite loop for zero-width matches
        if (match[0].length === 0) {
          regex.lastIndex++;
          continue;
        }

        const result: SearchResult = {
          filePath,
          lineNumber: lineIndex + 1, // 1-based
          content: line,
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        };

        // Add context if requested
        if (contextLines > 0) {
          const context = getContextLines(lines, lineIndex, contextLines);
          results.push({
            ...result,
            context,
          });
        } else {
          results.push(result);
        }

        // Check if we've reached the limit
        if (results.length >= maxResults) {
          return results;
        }
      }
    }
  } catch {
    // Invalid regex - return empty results
    return [];
  }

  return results;
}

/**
 * Search across multiple files
 *
 * @param files - Array of file paths to search
 * @param cwd - Working directory
 * @param options - Search options
 * @param readFile - Function to read file content
 * @returns Promise resolving to array of search results
 */
export async function searchInFiles(
  files: readonly string[],
  cwd: string,
  options: SearchOptions,
  readFile: (path: string) => Promise<string>,
): Promise<readonly SearchResult[]> {
  const { maxResults = DEFAULT_MAX_RESULTS } = options;
  const results: SearchResult[] = [];

  for (const filePath of files) {
    if (results.length >= maxResults) {
      break;
    }

    try {
      const fullPath = filePath.startsWith("/")
        ? filePath
        : `${cwd}/${filePath}`;
      const content = await readFile(fullPath);

      // Calculate remaining results allowed
      const remainingResults = maxResults - results.length;
      const fileResults = searchInFile(content, filePath, {
        ...options,
        maxResults: remainingResults,
      });

      results.push(...fileResults);
    } catch {
      // Skip files that can't be read (deleted, binary, etc.)
      continue;
    }
  }

  return results;
}

/**
 * Get list of files to search based on scope
 *
 * This is a stub that should be connected to actual git operations.
 *
 * @param scope - Search scope (file, changed, or all)
 * @param filePath - File path for 'file' scope
 * @param _diffTarget - Diff target for determining changed files
 * @param _cwd - Working directory
 * @returns Promise resolving to array of file paths
 */
export async function getFilesForScope(
  scope: SearchScope,
  filePath: string | undefined,
  diffTarget: DiffTarget,
  cwd: string,
  options: Pick<SearchOptions, "showIgnored" | "showAllFiles">,
): Promise<readonly string[]> {
  switch (scope) {
    case "file": {
      if (filePath === undefined || filePath.length === 0) {
        return [];
      }
      return [filePath];
    }

    case "changed": {
      return listChangedSearchFiles(cwd, diffTarget);
    }

    case "all": {
      return listAllSearchFiles(cwd, options);
    }
  }
}

function normalizeSearchFilePaths(
  filePaths: readonly string[],
): readonly string[] {
  return [...new Set(filePaths)].sort((leftPath, rightPath) =>
    leftPath.localeCompare(rightPath),
  );
}

function normalizeExcludedFileNames(
  excludeFileNames: readonly string[] | undefined,
): readonly string[] {
  if (excludeFileNames === undefined) {
    return [];
  }

  return excludeFileNames
    .map((excludeFileName) => excludeFileName.trim().toLocaleLowerCase())
    .filter((excludeFileName) => excludeFileName.length > 0);
}

function shouldExcludeSearchFile(
  filePath: string,
  excludedFileNames: readonly string[],
): boolean {
  if (excludedFileNames.length === 0) {
    return false;
  }

  const normalizedFilePath = filePath.toLocaleLowerCase();
  const normalizedFileName =
    normalizedFilePath.split("/").at(-1) ?? normalizedFilePath;

  return excludedFileNames.some((excludedFileName) =>
    excludedFileName.includes("/")
      ? normalizedFilePath.includes(excludedFileName)
      : normalizedFileName === excludedFileName,
  );
}

async function listIgnoredFiles(
  projectPath: string,
): Promise<readonly string[]> {
  const gitResult = await execGit(
    ["ls-files", "--others", "--ignored", "--exclude-standard"],
    { cwd: projectPath },
  );

  if (gitResult.exitCode !== 0) {
    return [];
  }

  return gitResult.stdout
    .split("\n")
    .map((rawPath) => unquoteGitPath(rawPath.trim()))
    .filter((normalizedPath) => normalizedPath.length > 0);
}

async function listFilesystemFiles(
  projectPath: string,
  directoryPath = "",
): Promise<readonly string[]> {
  const absoluteDirectoryPath =
    directoryPath.length > 0 ? join(projectPath, directoryPath) : projectPath;

  let directoryEntries: readonly import("node:fs").Dirent[];
  try {
    directoryEntries = await readdir(absoluteDirectoryPath, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  const discoveredPaths: string[] = [];

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.name === ".git" || directoryEntry.isSymbolicLink()) {
      continue;
    }

    const relativePath =
      directoryPath.length > 0
        ? `${directoryPath}/${directoryEntry.name}`
        : directoryEntry.name;

    if (directoryEntry.isDirectory()) {
      const nestedPaths = await listFilesystemFiles(projectPath, relativePath);
      discoveredPaths.push(...nestedPaths);
      continue;
    }

    if (directoryEntry.isFile()) {
      discoveredPaths.push(relativePath);
    }
  }

  return discoveredPaths;
}

async function listChangedSearchFiles(
  projectPath: string,
  diffTarget: DiffTarget,
): Promise<readonly string[]> {
  try {
    const changedFileStatuses =
      diffTarget.type === "working" || diffTarget.ref === undefined
        ? await getChangedFiles(projectPath)
        : await getChangedFiles(projectPath, diffTarget.ref);

    return normalizeSearchFilePaths(
      changedFileStatuses
        .filter((fileStatus) => fileStatus.status !== "deleted")
        .map((fileStatus) => fileStatus.path),
    );
  } catch {
    return [];
  }
}

async function listAllSearchFiles(
  projectPath: string,
  options: Pick<SearchOptions, "showIgnored" | "showAllFiles">,
): Promise<readonly string[]> {
  if (options.showAllFiles === true) {
    return normalizeSearchFilePaths(await listFilesystemFiles(projectPath));
  }

  try {
    const [trackedFiles, untrackedFiles, ignoredFiles] = await Promise.all([
      getAllFiles(projectPath),
      getUntrackedFiles(projectPath),
      options.showIgnored === true
        ? listIgnoredFiles(projectPath)
        : Promise.resolve([]),
    ]);

    return normalizeSearchFilePaths([
      ...trackedFiles,
      ...untrackedFiles,
      ...ignoredFiles,
    ]);
  } catch {
    return normalizeSearchFilePaths(await listFilesystemFiles(projectPath));
  }
}

function filterExcludedSearchFiles(
  filePaths: readonly string[],
  excludedFileNames: readonly string[],
): readonly string[] {
  if (excludedFileNames.length === 0) {
    return filePaths;
  }

  return filePaths.filter(
    (filePath) => !shouldExcludeSearchFile(filePath, excludedFileNames),
  );
}

/**
 * Execute a search with the given parameters
 *
 * @param scope - Search scope
 * @param filePath - File path for 'file' scope
 * @param diffTarget - Diff target for determining changed files
 * @param cwd - Working directory
 * @param options - Search options
 * @param readFile - Function to read file content
 * @returns Promise resolving to search results with metadata
 */
export async function executeSearch(
  scope: SearchScope,
  filePath: string | undefined,
  diffTarget: DiffTarget,
  cwd: string,
  options: SearchOptions,
  readFile: (path: string) => Promise<string>,
): Promise<{
  results: readonly SearchResult[];
  filesSearched: number;
  truncated: boolean;
}> {
  const { maxResults = DEFAULT_MAX_RESULTS } = options;
  const excludedFileNames = normalizeExcludedFileNames(
    options.excludeFileNames,
  );

  // Get files to search
  const files = filterExcludedSearchFiles(
    await getFilesForScope(scope, filePath, diffTarget, cwd, {
      showIgnored: options.showIgnored,
      showAllFiles: options.showAllFiles,
    }),
    excludedFileNames,
  );
  const filesSearched = files.length;

  // Search in files
  const results = await searchInFiles(files, cwd, options, readFile);

  // Determine if results were truncated
  const truncated = results.length >= maxResults;

  return {
    results,
    filesSearched,
    truncated,
  };
}
