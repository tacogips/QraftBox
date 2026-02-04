# Git Operations Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#data-models
**Phase**: 1
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Git operations using native Bun spawn for diff generation, file listing, and branch information. Core data provider for the diff viewer.

### Scope
**Included**: Git diff generation, diff parsing, file tree generation, branch/commit resolution
**Excluded**: git-xnotes integration (separate plan), file watching

---

## Modules

### 1. Git Types

#### src/types/git.ts

**Status**: COMPLETED

```typescript
// File status type
type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

// Diff data structures (from design doc)
interface DiffFile {
  readonly path: string;
  readonly status: FileStatus;
  readonly oldPath?: string;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: DiffChunk[];
}

interface DiffChunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly changes: DiffChange[];
}

interface DiffChange {
  readonly type: 'add' | 'del' | 'normal';
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: string;
}

// File tree types
interface FileNode {
  readonly name: string;
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly status?: FileStatus;
  readonly children?: FileNode[];
}
```

**Checklist**:
- [x] Define FileStatus type
- [x] Define DiffFile interface
- [x] Define DiffChunk interface
- [x] Define DiffChange interface
- [x] Define FileNode interface
- [x] Export all types

### 2. Git Command Execution

#### src/server/git/executor.ts

**Status**: COMPLETED

```typescript
// Execute git command and return stdout
function execGit(args: readonly string[], cwd: string): Promise<string>;

// Execute git command with streaming output
async function* execGitStream(args: readonly string[], cwd: string): AsyncIterable<string>;

// Check if path is a git repository
function isGitRepository(path: string): Promise<boolean>;

// Get repository root from any subdirectory
function getRepoRoot(path: string): Promise<string>;
```

**Checklist**:
- [x] Implement execGit() using Bun.spawn
- [x] Implement execGitStream()
- [x] Implement isGitRepository()
- [x] Implement getRepoRoot()
- [x] Handle git errors properly (throws GitError with command info)
- [x] Unit tests (13 tests passing)

### 3. Diff Generation

#### src/server/git/diff.ts

**Status**: COMPLETED

```typescript
interface DiffOptions {
  base: string;
  target: string;
  contextLines?: number;
  includeUntracked?: boolean;
}

// Generate diff between two refs
function getDiff(options: DiffOptions, cwd: string): Promise<DiffFile[]>;

// Get diff for a single file
function getFileDiff(path: string, options: DiffOptions, cwd: string): Promise<DiffFile | null>;

// Get file content at specific ref
function getFileContent(path: string, ref: string, cwd: string): Promise<string>;

// List changed files without full diff
function getChangedFiles(options: DiffOptions, cwd: string): Promise<string[]>;
```

**Checklist**:
- [x] Implement getDiff()
- [x] Implement getFileDiff()
- [x] Implement getFileContent()
- [x] Implement getChangedFiles()
- [x] Handle untracked files
- [x] Unit tests (17 tests passing)

### 4. Diff Parser

#### src/server/git/parser.ts

**Status**: NOT_STARTED

```typescript
// Parse unified diff output into structured data
function parseDiff(diffOutput: string): DiffFile[];

// Parse a single file's diff
function parseFileDiff(fileDiff: string): DiffFile;

// Parse chunk header (@@ -a,b +c,d @@)
function parseChunkHeader(header: string): { oldStart: number; oldLines: number; newStart: number; newLines: number };

// Parse diff lines into changes
function parseChanges(lines: string[], chunkInfo: ChunkInfo): DiffChange[];
```

**Checklist**:
- [ ] Implement parseDiff()
- [ ] Implement parseFileDiff()
- [ ] Implement parseChunkHeader()
- [ ] Implement parseChanges()
- [ ] Handle edge cases (binary files, renames)
- [ ] Unit tests with sample diffs

### 5. File Tree Generation

#### src/server/git/files.ts

**Status**: COMPLETED

```typescript
interface FileTreeOptions {
  includeUnchanged: boolean;
  diffTarget?: DiffTarget;
}

// Generate file tree from repository
function getFileTree(options: FileTreeOptions, cwd: string): Promise<FileNode>;

// Get list of all files (flat)
function getAllFiles(cwd: string): Promise<string[]>;

// Merge diff status into file tree
function mergeStatusIntoTree(tree: FileNode, changedFiles: Map<string, FileStatus>): FileNode;
```

**Checklist**:
- [x] Implement getFileTree()
- [x] Implement getAllFiles()
- [x] Implement mergeStatusIntoTree()
- [x] Handle nested directories
- [x] Unit tests (16 tests passing)

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Git Types | `src/types/git.ts` | COMPLETED | - |
| Git Executor | `src/server/git/executor.ts` | COMPLETED | 13 tests |
| Diff Generation | `src/server/git/diff.ts` | COMPLETED | 17 tests |
| Diff Parser | `src/server/git/parser.ts` | NOT_STARTED | - |
| File Tree | `src/server/git/files.ts` | COMPLETED | 16 tests |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Git operations | Bun.spawn | Available |
| Git operations | git CLI | System requirement |
| Types | src/types/index.ts | Phase 1 |

## Completion Criteria

- [x] Can generate diff between any two refs
- [ ] Can parse unified diff output (stub implementation)
- [x] Can generate file tree with status
- [x] Untracked files included for working tree
- [x] Type checking passes (files module)
- [x] Unit tests passing (files module: 16 tests)

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created

### Session: 2026-02-03 (Impl)
**Tasks Completed**: TASK-001 Git Types, TASK-002 Git Executor
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/types/git.ts with FileStatus, DiffChange, DiffChunk, DiffFile, FileNode types. Implemented src/server/git/executor.ts with execGit, execGitStream, isGitRepository, getRepoRoot functions. All use readonly properties. 13 unit tests passing.

### Session: 2026-02-03 (Diff Module)
**Tasks Completed**: TASK-003 Diff Generation
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/server/git/diff.ts with getDiff, getFileDiff, getFileContent, getChangedFiles functions. All functions use readonly DiffOptions interface. Handles working tree diffs (target='working'). Handles untracked files via git status --porcelain. Implements stub parser (stubParseDiff) until parser module is ready. 17 unit tests passing. All use readonly properties and proper error handling with GitError.

### Session: 2026-02-03 (File Tree Module)
**Tasks Completed**: TASK-005 File Tree Generation
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/server/git/files.ts with getFileTree, getAllFiles, mergeStatusIntoTree functions. Uses `git ls-files` for tracked file list. Builds hierarchical tree structure from flat file list. Sorts directories before files, both alphabetically. mergeStatusIntoTree adds FileStatus to matching nodes. All functions use readonly properties. Mutable structure used during construction for efficiency, then returned as immutable FileNode. 16 unit tests passing covering flat files, nested directories, sorting, status merging, and edge cases.

## Related Plans

- **Previous**: 02-server-core.md
- **Next**: 04-api-routes.md
- **Depends On**: 02-server-core.md (ServerContext)
