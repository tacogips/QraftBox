# Git Core Operations Implementation Plan

**Status**: Ready
**Phase**: 11
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#data-models
**Replaces**: 03-git-operations (SUPERSEDED)
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Core git operation layer providing typed git command execution, diff generation and parsing, file tree building, and change detection. This layer wraps native git commands via Bun's spawn API and provides typed results.

### Scope
**Included**: Git executor (spawn wrapper), diff generation, diff parsing, file tree operations, working tree status, git type definitions
**Excluded**: Branch switching (Plan 29), commit operations (existing), push operations (existing), worktree operations (existing)

---

## Modules

### 1. Git Types

#### src/types/git.ts

**Status**: COMPLETED

```typescript
type FileStatusCode = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";

interface FileStatus {
  readonly path: string;
  readonly status: FileStatusCode;
  readonly oldPath?: string;
  readonly staged: boolean;
}

interface DiffFile {
  readonly path: string;
  readonly status: FileStatusCode;
  readonly oldPath?: string;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly DiffChunk[];
  readonly isBinary: boolean;
  readonly fileSize?: number;
}

interface DiffChunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly header: string;
  readonly changes: readonly DiffChange[];
}

interface DiffChange {
  readonly type: "add" | "del" | "normal";
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: string;
}

interface FileNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: readonly FileNode[];
  readonly status?: FileStatusCode;
  readonly isBinary?: boolean;
}

interface WorkingTreeStatus {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
}
```

**Checklist**:
- [x] Define FileStatusCode type
- [x] Define FileStatus interface
- [x] Define DiffFile interface (with binary/size metadata)
- [x] Define DiffChunk interface
- [x] Define DiffChange interface
- [x] Define FileNode interface
- [x] Define WorkingTreeStatus interface
- [x] Export all types
- [x] Unit tests for type validation helpers

---

### 2. Git Executor

#### src/server/git/executor.ts

**Status**: COMPLETED

```typescript
interface GitExecOptions {
  readonly cwd: string;
  readonly timeout?: number;
  readonly maxBuffer?: number;
}

interface GitExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function execGit(args: readonly string[], options: GitExecOptions): Promise<GitExecResult>;
function execGitStream(args: readonly string[], options: GitExecOptions): ReadableStream<Uint8Array>;
function isGitRepository(path: string): Promise<boolean>;
function getRepoRoot(path: string): Promise<string>;
```

**Checklist**:
- [x] execGit using Bun.spawn with timeout
- [x] execGitStream for large outputs (streaming)
- [x] isGitRepository checking .git existence
- [x] getRepoRoot via git rev-parse --show-toplevel
- [x] Error handling for non-zero exit codes
- [x] Unit tests

---

### 3. Diff Generation

#### src/server/git/diff.ts

**Status**: NOT_STARTED

```typescript
interface DiffOptions {
  readonly base?: string;
  readonly target?: string;
  readonly paths?: readonly string[];
  readonly contextLines?: number;
}

function getDiff(projectPath: string, options?: DiffOptions): Promise<readonly DiffFile[]>;
function getFileDiff(projectPath: string, filePath: string, options?: DiffOptions): Promise<DiffFile | undefined>;
function getFileContent(projectPath: string, filePath: string, ref?: string): Promise<string>;
function getChangedFiles(projectPath: string, base?: string): Promise<readonly FileStatus[]>;
```

**Checklist**:
- [ ] getDiff generating full diff between base and target
- [ ] getFileDiff for single file diff
- [ ] getFileContent reading file at specific ref (or working tree)
- [ ] getChangedFiles listing changed files with status
- [ ] Support for working tree, branch, and commit comparisons
- [ ] Unit tests

---

### 4. Diff Parser

#### src/server/git/parser.ts

**Status**: COMPLETED

```typescript
function parseDiff(rawDiff: string): readonly DiffFile[];
function parseFileDiff(rawFileDiff: string): DiffFile;
function parseChunkHeader(header: string): { oldStart: number; oldLines: number; newStart: number; newLines: number };
function detectBinary(rawDiff: string, filePath: string): boolean;
```

**Checklist**:
- [x] parseDiff splitting unified diff output into DiffFile array
- [x] parseFileDiff parsing single file diff section
- [x] parseChunkHeader parsing @@ -a,b +c,d @@ format
- [x] detectBinary identifying binary file markers in diff
- [x] Handle edge cases: empty files, renames, binary files
- [x] Unit tests with real git diff samples

---

### 5. File Tree Operations

#### src/server/git/files.ts

**Status**: COMPLETED

```typescript
function getFileTree(projectPath: string, diffOnly?: boolean): Promise<FileNode>;
function getAllFiles(projectPath: string): Promise<readonly string[]>;
function mergeStatusIntoTree(tree: FileNode, statuses: readonly FileStatus[]): FileNode;
function buildTreeFromPaths(paths: readonly string[]): FileNode;
```

**Checklist**:
- [x] getFileTree building hierarchical tree from git ls-files
- [x] getAllFiles flat listing via git ls-files
- [x] mergeStatusIntoTree annotating tree nodes with diff status
- [x] buildTreeFromPaths converting flat paths to tree structure
- [x] Diff-only mode filtering to changed files
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Git Types | `src/types/git.ts` | COMPLETED | 31 pass |
| Git Executor | `src/server/git/executor.ts` | COMPLETED | 19 pass |
| Diff Generation | `src/server/git/diff.ts` | NOT_STARTED | - |
| Diff Parser | `src/server/git/parser.ts` | COMPLETED | 27 pass |
| File Tree Ops | `src/server/git/files.ts` | COMPLETED | 17 pass |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Git Types | None | COMPLETED |
| Git Executor | None | COMPLETED |
| Diff Generation | Git Executor, Git Types | READY |
| Diff Parser | Git Types | READY |
| File Tree Ops | Git Executor, Git Types | READY |
| Must integrate with | `src/server/git/commit-log.ts` | Exists |
| Must integrate with | `src/server/git/staged.ts` | Exists |
| Must integrate with | `src/server/git/push.ts` | Exists |
| Must integrate with | `src/server/git/worktree.ts` | Exists |

## Completion Criteria

- [ ] All 5 modules implemented
- [ ] All tests passing
- [ ] Type checking passes
- [ ] Can execute git commands and parse results
- [ ] Diff parsing produces correct DiffFile structures
- [ ] File tree correctly represents repository structure
- [ ] Working tree status accurately reflects git state
- [ ] Integrates with existing git modules without conflicts

## Progress Log

### Session: 2026-02-07 (TASK-001: Git Types)

**Completed**:
- Created `src/types/git.ts` with all core git data types
- Implemented 7 interfaces/types: FileStatusCode, FileStatus, DiffFile, DiffChunk, DiffChange, FileNode, WorkingTreeStatus
- Added helper functions: isFileStatusCode, createEmptyDiffFile, createFileNode, createCleanWorkingTreeStatus, isWorkingTreeClean, isDirectory, isFile, getTotalChanges, getTotalChunks, filterBinaryFiles, filterTextFiles, groupByStatus
- Created comprehensive test suite in `src/types/git.test.ts` with 31 passing tests
- All fields marked as readonly following project standards
- Optional properties use `| undefined` for exactOptionalPropertyTypes compliance
- JSDoc comments added to all types and functions
- Type checking passes without errors
- All tests pass (31 pass, 0 fail, 68 expect() calls)

**Notes**:
- Followed patterns from existing `src/types/workspace.ts` and `src/types/commit.ts`
- Used strict TypeScript settings (readonly, explicit undefined, no index access)
- Helper functions provide type guards and factory methods for safe type construction
- Ready for use by Git Executor, Diff Parser, and File Tree modules

### Session: 2026-02-07 (TASK-002: Git Executor)

**Completed**:
- Created `src/server/git/executor.ts` with centralized git command execution (217 lines)
- Implemented `execGit` function: Bun.spawn wrapper with timeout support (default 30s)
- Implemented `execGitStream` function: returns ReadableStream for large outputs
- Implemented `isGitRepository` using `git rev-parse --git-dir`
- Implemented `getRepoRoot` using `git rev-parse --show-toplevel`
- Created `GitExecutorError` class with command, stderr, and exitCode properties
- Created comprehensive test suite in `src/server/git/executor.test.ts` (316 lines)
- All 19 tests passing with coverage for: command execution, timeout handling, streaming, repository validation, error handling

**Notes**:
- Followed existing patterns from `src/server/git/staged.ts` and `src/server/git/commit-log.ts`
- Uses Bun.spawn for all git command execution
- Timeout implemented via setTimeout + proc.kill()
- Error handling includes command context and stderr output
- Stream interface enables handling large git outputs without memory buffering
- TASK-003 (Diff Generation) and TASK-004 (Diff Parser) are now unblocked

### Session: 2026-02-07 (TASK-004: Diff Parser)

**Completed**:
- Created `src/server/git/parser.ts` with unified diff parsing functions (327 lines)
- Implemented `parseDiff` function: splits unified diff output by file sections, parses each
- Implemented `parseFileDiff` function: extracts file metadata (path, status, old path), handles new/deleted/renamed/copied/binary files, parses all chunks
- Implemented `parseChunkHeader` function: parses `@@ -oldStart,oldLines +newStart,newLines @@` format, handles single-line hunks
- Implemented `detectBinary` function: checks for "Binary files" marker and common binary extensions
- Created comprehensive test suite in `src/server/git/parser.test.ts` (27 tests, 127 expect() calls)
- All tests passing: simple modification, new file, deleted file, renamed file, copied file, binary file, multiple chunks, no newline marker, line number tracking, multiple files, edge cases
- Code formatted with prettier
- Handles all edge cases: empty diffs, single-line chunks, "\ No newline at end of file", multiple chunks per file, renamed files with content changes

**Notes**:
- Followed TypeScript strict mode patterns (readonly, explicit undefined, noUncheckedIndexedAccess)
- Line number tracking: "normal" lines increment both oldLine and newLine, "add" increments only newLine, "del" increments only oldLine
- Status detection priority: new file (--- /dev/null), deleted file (+++ /dev/null), renamed (rename from/to), copied (copy from/to), modified (default)
- Binary detection via git marker or file extension check
- Change types: "add" (+), "del" (-), "normal" (space), with content stripped of prefix character
- Skips "\ No newline at end of file" markers during parsing
- Ready for integration with TASK-003 (Diff Generation) module

### Session: 2026-02-07 (TASK-005: File Tree Operations)

**Completed**:
- Created `src/server/git/files.ts` with file tree operations (293 lines)
- Implemented `getFileTree`: builds hierarchical tree from git ls-files with optional diffOnly filter
- Implemented `getAllFiles`: returns flat array of all tracked files via git ls-files
- Implemented `mergeStatusIntoTree`: immutably annotates tree nodes with FileStatus, bubbles status to parent directories
- Implemented `buildTreeFromPaths`: converts flat path array to hierarchical FileNode tree with sorting (directories first, alphabetical)
- Created comprehensive test suite in `src/server/git/files.test.ts` with 17 passing tests
- All tests pass (17 pass, 0 fail, 69 expect() calls)
- Type checking passes without errors
- Formatted with prettier
- All functions exported and documented with JSDoc
- Integration tests use real temporary git repositories

**Notes**:
- buildTreeFromPaths correctly handles nested directories and builds complete tree structure
- mergeStatusIntoTree creates new objects (immutable), does not mutate input tree
- getFileTree with diffOnly=true uses `git diff --name-only HEAD` to filter changed files
- Handles edge cases: empty repos, repos with no HEAD, empty path arrays
- Tree sorting ensures consistent structure: directories first, then alphabetically
- Status bubbling allows directories to show "modified" if any descendant has changes
- Uses type assertions carefully for tree mutation during construction phase
- Ready for use by diff viewer and file navigation components
- TASK-003 (Diff Generation) is next priority

## Related Plans

- **Replaces**: 03-git-operations (SUPERSEDED - source files never existed)
- **Depends On**: Plan 25 (ServerContext type)
- **Depended on by**: Plans 27, 28, 29, 30, 31
