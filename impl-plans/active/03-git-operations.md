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

**Status**: NOT_STARTED

```typescript
// Diff data structures (from design doc)
interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  additions: number;
  deletions: number;
  chunks: DiffChunk[];
}

interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

interface DiffChange {
  type: 'add' | 'del' | 'normal';
  oldLine?: number;
  newLine?: number;
  content: string;
}

// File tree types
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  status?: 'added' | 'modified' | 'deleted';
  children?: FileNode[];
}
```

**Checklist**:
- [ ] Define DiffFile interface
- [ ] Define DiffChunk interface
- [ ] Define DiffChange interface
- [ ] Define FileNode interface
- [ ] Export all types

### 2. Git Command Execution

#### src/server/git/executor.ts

**Status**: NOT_STARTED

```typescript
// Execute git command and return stdout
function execGit(args: string[], cwd: string): Promise<string>;

// Execute git command with streaming output
function execGitStream(args: string[], cwd: string): AsyncIterable<string>;

// Check if path is a git repository
function isGitRepository(path: string): Promise<boolean>;

// Get repository root from any subdirectory
function getRepoRoot(path: string): Promise<string>;
```

**Checklist**:
- [ ] Implement execGit() using Bun.spawn
- [ ] Implement execGitStream()
- [ ] Implement isGitRepository()
- [ ] Implement getRepoRoot()
- [ ] Handle git errors properly
- [ ] Unit tests

### 3. Diff Generation

#### src/server/git/diff.ts

**Status**: NOT_STARTED

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
- [ ] Implement getDiff()
- [ ] Implement getFileDiff()
- [ ] Implement getFileContent()
- [ ] Implement getChangedFiles()
- [ ] Handle untracked files
- [ ] Unit tests

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

**Status**: NOT_STARTED

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
- [ ] Implement getFileTree()
- [ ] Implement getAllFiles()
- [ ] Implement mergeStatusIntoTree()
- [ ] Handle nested directories
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Git Types | `src/types/git.ts` | NOT_STARTED | - |
| Git Executor | `src/server/git/executor.ts` | NOT_STARTED | - |
| Diff Generation | `src/server/git/diff.ts` | NOT_STARTED | - |
| Diff Parser | `src/server/git/parser.ts` | NOT_STARTED | - |
| File Tree | `src/server/git/files.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Git operations | Bun.spawn | Available |
| Git operations | git CLI | System requirement |
| Types | src/types/index.ts | Phase 1 |

## Completion Criteria

- [ ] Can generate diff between any two refs
- [ ] Can parse unified diff output
- [ ] Can generate file tree with status
- [ ] Untracked files included for working tree
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 02-server-core.md
- **Next**: 04-api-routes.md
- **Depends On**: 02-server-core.md (ServerContext)
