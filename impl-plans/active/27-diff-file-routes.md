# Diff & File API Routes Implementation Plan

**Status**: Ready
**Phase**: 11
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#api-design
**Replaces**: 04-api-routes (SUPERSEDED)
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
REST API routes for diff viewing, file content access, file tree navigation, working tree status, and file autocomplete. These routes are the primary API surface for the client-side diff viewer.

### Scope
**Included**: Diff routes, file routes, status route, route registry/mounting, file autocomplete endpoint
**Excluded**: Comment routes (Plan 30), branch routes (Plan 29), AI routes (existing), commit routes (existing), push routes (existing), workspace routes (existing)

---

## Modules

### 1. Diff Routes

#### src/server/routes/diff.ts

**Status**: NOT_STARTED

```typescript
// GET /api/ctx/:contextId/diff
// Query params: ?base=main&target=HEAD&path=src/main.ts
interface DiffQueryParams {
  readonly base?: string;
  readonly target?: string;
  readonly path?: string;
  readonly contextLines?: string;
}

interface DiffResponse {
  readonly files: readonly DiffFile[];
  readonly stats: {
    readonly totalFiles: number;
    readonly additions: number;
    readonly deletions: number;
  };
}

// GET /api/ctx/:contextId/diff/file/:path
// Single file diff
interface FileDiffResponse {
  readonly file: DiffFile;
}

function createDiffRoutes(): Hono;
```

**Checklist**:
- [ ] GET /api/ctx/:id/diff returning full diff
- [ ] Query parameter parsing (base, target, path, contextLines)
- [ ] GET /api/ctx/:id/diff/file/:path for single file diff
- [ ] Error handling for invalid refs, missing files
- [ ] Integration with git diff module
- [ ] Unit tests

---

### 2. File Routes

#### src/server/routes/files.ts

**Status**: NOT_STARTED

```typescript
// GET /api/ctx/:contextId/files
// Query params: ?mode=diff-only|all
interface FilesQueryParams {
  readonly mode?: "diff-only" | "all";
}

interface FilesResponse {
  readonly tree: FileNode;
  readonly totalFiles: number;
  readonly changedFiles: number;
}

// GET /api/ctx/:contextId/file/*path
// Raw file content with metadata
interface FileContentResponse {
  readonly path: string;
  readonly content: string;
  readonly language: string;
  readonly lineCount: number;
  readonly size: number;
  readonly isBinary: boolean;
}

// GET /api/ctx/:contextId/files/autocomplete
// Query params: ?q=search-term&limit=10
interface AutocompleteResponse {
  readonly results: readonly {
    readonly path: string;
    readonly status?: FileStatusCode;
  }[];
}

function createFileRoutes(): Hono;
```

**Checklist**:
- [ ] GET /api/ctx/:id/files returning tree
- [ ] Diff-only vs all-files mode
- [ ] GET /api/ctx/:id/file/*path for file content
- [ ] Language detection from file extension
- [ ] GET /api/ctx/:id/files/autocomplete for @ mentions
- [ ] Binary file detection and appropriate response
- [ ] Large file handling (size check, partial content)
- [ ] Unit tests

---

### 3. Status Route

#### src/server/routes/status.ts

**Status**: COMPLETED

```typescript
// GET /api/ctx/:contextId/status
interface StatusResponse {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly modified: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicts: readonly string[];
  readonly branch: string;
}

function createStatusRoutes(): Hono;
```

**Checklist**:
- [x] GET /api/ctx/:id/status returning working tree status
- [x] Include current branch name
- [x] Integration with git executor
- [x] Unit tests

---

### 4. Route Registry

#### src/server/routes/index.ts

**Status**: NOT_STARTED

```typescript
interface RouteGroup {
  readonly prefix: string;
  readonly routes: Hono;
}

function getAllRouteGroups(): readonly RouteGroup[];
function mountAllRoutes(app: Hono, contextManager: ContextManager): void;
```

**Checklist**:
- [ ] Registry of all route groups (diff, files, status, commits, search, etc.)
- [ ] mountAllRoutes attaching all route groups to main app
- [ ] Context middleware applied to /api/ctx/:contextId/* routes
- [ ] Non-context routes (workspace, browse) mounted separately
- [ ] Integration with all existing route files
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Diff Routes | `src/server/routes/diff.ts` | NOT_STARTED | - |
| File Routes | `src/server/routes/files.ts` | NOT_STARTED | - |
| Status Route | `src/server/routes/status.ts` | COMPLETED | PASSED |
| Route Registry | `src/server/routes/index.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Diff Routes | Plan 26 (git diff module) | NOT_STARTED |
| File Routes | Plan 26 (git files module) | NOT_STARTED |
| Status Route | Plan 26 (git executor) | NOT_STARTED |
| Route Registry | Plan 25 (server setup) | NOT_STARTED |
| Must integrate with | `src/server/routes/commits.ts` | Exists |
| Must integrate with | `src/server/routes/search.ts` | Exists |
| Must integrate with | `src/server/routes/workspace.ts` | Exists |
| Must integrate with | `src/server/routes/browse.ts` | Exists |
| Must integrate with | `src/server/routes/ai.ts` | Exists |
| Must integrate with | `src/server/routes/push.ts` | Exists |
| Must integrate with | `src/server/routes/commit.ts` | Exists |
| Must integrate with | `src/server/routes/github.ts` | Exists |
| Must integrate with | `src/server/routes/pr.ts` | Exists |
| Must integrate with | `src/server/routes/worktree.ts` | Exists |
| Must integrate with | `src/server/routes/claude-sessions.ts` | Exists |
| Must integrate with | `src/server/middleware/context.ts` | Exists |

## Completion Criteria

- [ ] All 4 modules implemented
- [ ] All tests passing
- [ ] Type checking passes
- [ ] Diff route returns correct diff data
- [ ] File routes serve file content and tree
- [ ] Status route returns accurate working tree status
- [ ] Autocomplete searches files by partial name
- [ ] Route registry mounts all routes including existing ones
- [ ] All existing routes continue to work

## Progress Log

### Session: 2026-02-07
**Agent**: ts-coding
**Task**: TASK-003 Status Route
**Status**: COMPLETED

**Summary**:
Implemented src/server/routes/status.ts providing working tree status API. The route returns staged, modified, untracked, conflict files, and current branch name. Includes comprehensive test coverage with 9 passing tests covering clean repos, dirty repos, conflicts, and mixed status.

**Files Modified**:
- src/server/routes/status.ts (created)
- src/server/routes/status.test.ts (created)

**Test Results**: All 9 tests passed
**Type Check**: No errors in status route files

## Related Plans

- **Replaces**: 04-api-routes (SUPERSEDED - source files never existed)
- **Depends On**: Plan 25 (server), Plan 26 (git operations)
- **Depended on by**: Plan 30 (comments routes), Plan 31 (binary file routes)
