/**
 * Git Diff Parser
 *
 * Parses unified diff output from git into typed DiffFile structures.
 * Supports all git file operations: add, modify, delete, rename, copy.
 */

import type {
  DiffFile,
  DiffChunk,
  DiffChange,
  FileStatusCode,
} from "../../types/git";

/**
 * Parse unified diff output into DiffFile array
 *
 * Splits the diff by file sections (starting with "diff --git") and
 * parses each section individually.
 *
 * @param rawDiff - Raw unified diff output from git
 * @returns Array of parsed DiffFile objects
 *
 * @example
 * ```typescript
 * const diff = await execGit(['diff', '--cached'], { cwd: repoPath });
 * const files = parseDiff(diff.stdout);
 * ```
 */
export function parseDiff(rawDiff: string): readonly DiffFile[] {
  if (rawDiff.trim() === "") {
    return [];
  }

  const files: DiffFile[] = [];
  const sections = rawDiff.split(/^(?=diff --git )/m);

  for (const section of sections) {
    if (section.trim() === "") {
      continue;
    }

    const file = parseFileDiff(section);
    files.push(file);
  }

  return files;
}

/**
 * Parse a single file's diff section
 *
 * Extracts file metadata (path, status, old path) and parses all chunks.
 * Handles new files, deleted files, renames, copies, and binary files.
 *
 * @param rawFileDiff - Single file section from unified diff
 * @returns Parsed DiffFile object
 *
 * @example
 * ```typescript
 * const fileSection = "diff --git a/file.ts b/file.ts\n...";
 * const diffFile = parseFileDiff(fileSection);
 * ```
 */
export function parseFileDiff(rawFileDiff: string): DiffFile {
  const lines = rawFileDiff.split("\n");

  let path = "";
  let oldPath: string | undefined = undefined;
  let status: FileStatusCode = "modified";
  let isBinary = false;
  const chunks: DiffChunk[] = [];
  let additions = 0;
  let deletions = 0;

  // Parse header lines to extract file information
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }

    // Extract path from diff --git header
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      if (match !== null && match !== undefined) {
        const aPath = match[1];
        const bPath = match[2];
        if (aPath !== undefined && bPath !== undefined) {
          path = bPath;
          if (aPath !== bPath) {
            oldPath = aPath;
          }
        }
      }
      continue;
    }

    // Check for binary files
    if (line.startsWith("Binary files")) {
      isBinary = true;
      continue;
    }

    // Check for file mode headers used by binary add/delete diffs
    if (line.startsWith("new file mode ")) {
      status = "added";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      status = "deleted";
      continue;
    }

    // Check for new file (added)
    if (line.startsWith("--- /dev/null")) {
      status = "added";
      continue;
    }

    // Check for deleted file
    if (line.startsWith("+++ /dev/null")) {
      status = "deleted";
      continue;
    }

    // Extract path from --- a/path
    if (line.startsWith("--- a/")) {
      const pathMatch = line.substring(6);
      if (path === "" && pathMatch !== "") {
        // Only set if not already set from diff --git
        oldPath = pathMatch;
      }
      continue;
    }

    // Extract path from +++ b/path
    if (line.startsWith("+++ b/")) {
      const pathMatch = line.substring(6);
      if (path === "" && pathMatch !== "") {
        path = pathMatch;
      }
      continue;
    }

    // Check for rename
    if (line.startsWith("rename from ")) {
      status = "renamed";
      oldPath = line.substring(12);
      continue;
    }

    if (line.startsWith("rename to ")) {
      status = "renamed";
      path = line.substring(10);
      continue;
    }

    // Check for copy
    if (line.startsWith("copy from ")) {
      status = "copied";
      oldPath = line.substring(10);
      continue;
    }

    if (line.startsWith("copy to ")) {
      status = "copied";
      path = line.substring(8);
      continue;
    }

    // Parse chunk headers
    if (line.startsWith("@@ ")) {
      const chunkHeader = parseChunkHeader(line);
      const chunkChanges: DiffChange[] = [];

      let oldLine = chunkHeader.oldStart;
      let newLine = chunkHeader.newStart;

      // Collect chunk lines
      let j = i + 1;
      let chunkLineCount = 0;

      while (j < lines.length) {
        const chunkLine = lines[j];
        if (chunkLine === undefined) {
          break;
        }

        // Stop at next chunk or file
        if (
          chunkLine.startsWith("@@ ") ||
          chunkLine.startsWith("diff --git ")
        ) {
          break;
        }

        // Skip "\ No newline at end of file"
        if (chunkLine.startsWith("\\")) {
          j++;
          continue;
        }

        const firstChar = chunkLine.charAt(0);

        if (firstChar === "+") {
          // Addition
          chunkChanges.push({
            type: "add",
            oldLine: undefined,
            newLine: newLine,
            content: chunkLine.substring(1),
          });
          newLine++;
          additions++;
          chunkLineCount++;
        } else if (firstChar === "-") {
          // Deletion
          chunkChanges.push({
            type: "delete",
            oldLine: oldLine,
            newLine: undefined,
            content: chunkLine.substring(1),
          });
          oldLine++;
          deletions++;
          chunkLineCount++;
        } else if (firstChar === " ") {
          // Normal (context) line
          chunkChanges.push({
            type: "context",
            oldLine: oldLine,
            newLine: newLine,
            content: chunkLine.substring(1),
          });
          oldLine++;
          newLine++;
          chunkLineCount++;
        } else {
          // Empty or malformed line - treat as context if within chunk
          if (chunkLineCount < chunkHeader.oldLines + chunkHeader.newLines) {
            chunkChanges.push({
              type: "context",
              oldLine: oldLine,
              newLine: newLine,
              content: chunkLine,
            });
            oldLine++;
            newLine++;
            chunkLineCount++;
          }
        }

        j++;
      }

      chunks.push({
        oldStart: chunkHeader.oldStart,
        oldLines: chunkHeader.oldLines,
        newStart: chunkHeader.newStart,
        newLines: chunkHeader.newLines,
        header: line,
        changes: chunkChanges,
      });

      // Skip to next unprocessed line
      i = j - 1;
    }
  }

  return {
    path,
    status,
    oldPath,
    additions,
    deletions,
    chunks,
    isBinary,
    fileSize: undefined,
  };
}

/**
 * Parse chunk header line (@@ -oldStart,oldLines +newStart,newLines @@)
 *
 * Handles both standard format (@@ -1,3 +1,4 @@) and single-line format (@@ -1 +1 @@).
 *
 * @param header - Chunk header line
 * @returns Parsed chunk location info
 *
 * @example
 * ```typescript
 * const info = parseChunkHeader("@@ -10,5 +12,7 @@ function foo()");
 * // { oldStart: 10, oldLines: 5, newStart: 12, newLines: 7 }
 * ```
 */
export function parseChunkHeader(header: string): {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
} {
  // Match @@ -oldStart,oldLines +newStart,newLines @@ or @@ -oldStart +newStart @@
  const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);

  if (match === null || match === undefined) {
    // Fallback to defaults if parsing fails
    return { oldStart: 0, oldLines: 0, newStart: 0, newLines: 0 };
  }

  const oldStart = parseInt(match[1] ?? "0", 10);
  const oldLines = match[2] !== undefined ? parseInt(match[2], 10) : 1;
  const newStart = parseInt(match[3] ?? "0", 10);
  const newLines = match[4] !== undefined ? parseInt(match[4], 10) : 1;

  return { oldStart, oldLines, newStart, newLines };
}

/**
 * Detect if a file is binary based on diff output
 *
 * Checks for "Binary files" marker and optionally validates file extension.
 *
 * @param rawDiff - Raw diff output for the file
 * @param filePath - Path to the file
 * @returns True if file is binary
 *
 * @example
 * ```typescript
 * const isBin = detectBinary(diffOutput, "image.png");
 * ```
 */
export function detectBinary(rawDiff: string, filePath: string): boolean {
  // Primary check: git marks binary files explicitly
  if (rawDiff.includes("Binary files")) {
    return true;
  }

  // Secondary check: common binary extensions
  const binaryExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".wasm",
    ".bin",
    ".dat",
  ];

  const lowerPath = filePath.toLowerCase();
  for (const ext of binaryExtensions) {
    if (lowerPath.endsWith(ext)) {
      return true;
    }
  }

  return false;
}
