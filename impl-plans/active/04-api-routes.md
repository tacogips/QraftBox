# API Routes Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#api-design
**Phase**: 1
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
REST API endpoints for diff data, file operations, and system status. Core API layer connecting server to client.

### Scope
**Included**: Diff API, Files API, basic status endpoints
**Excluded**: Comment API (git-xnotes plan), AI API (AI integration plan)

---

## Modules

### 1. Diff Routes

#### src/server/routes/diff.ts

**Status**: NOT_STARTED

```typescript
import { Hono } from 'hono';

// GET /api/diff - Get diff data for specified range
interface DiffQueryParams {
  base?: string;
  target?: string;
  file?: string;
}

interface DiffResponse {
  files: DiffFile[];
  summary: { additions: number; deletions: number; filesChanged: number };
}

// Create diff routes
function createDiffRoutes(context: ServerContext): Hono;

// Route handlers
function handleGetDiff(c: Context): Promise<Response>;
```

**Checklist**:
- [ ] Implement createDiffRoutes()
- [ ] Implement GET /api/diff
- [ ] Handle query parameters
- [ ] Return proper error responses
- [ ] Unit tests

### 2. Files Routes

#### src/server/routes/files.ts

**Status**: NOT_STARTED

```typescript
// GET /api/files - Get file tree
interface FilesQueryParams {
  mode?: 'diff' | 'all';
}

interface FilesResponse {
  tree: FileNode;
  mode: 'diff' | 'all';
  changedCount: number;
  totalCount: number;
}

// GET /api/file/:path - Get file content
interface FileContentResponse {
  path: string;
  content: string;
  lineCount: number;
}

// GET /api/files/autocomplete - Search files for @ mentions
interface AutocompleteResponse {
  files: Array<{ path: string; status?: FileStatus }>;
}

// Create files routes
function createFilesRoutes(context: ServerContext): Hono;

// Route handlers
function handleGetFiles(c: Context): Promise<Response>;
function handleGetFileContent(c: Context): Promise<Response>;
function handleAutocomplete(c: Context): Promise<Response>;
```

**Checklist**:
- [ ] Implement createFilesRoutes()
- [ ] Implement GET /api/files
- [ ] Implement GET /api/file/:path
- [ ] Implement GET /api/files/autocomplete
- [ ] Handle path encoding
- [ ] Unit tests

### 3. Status Routes

#### src/server/routes/status.ts

**Status**: COMPLETED

```typescript
// GET /status - Health check and server info
interface StatusResponse {
  readonly status: 'ok';
  readonly version: string;
  readonly projectPath: string;
  readonly diffTarget: DiffTarget;
  readonly watchEnabled: boolean;
}

// Create status routes
function createStatusRoutes(context: ServerContext): Hono;
```

**Checklist**:
- [x] Implement createStatusRoutes()
- [x] Implement GET /status
- [x] Return version info
- [x] Unit tests (4 tests passing)

### 4. Route Index

#### src/server/routes/index.ts

**Status**: NOT_STARTED

```typescript
// Create and mount all API routes
function createApiRoutes(context: ServerContext): Hono;

// Register all route groups
function registerRoutes(api: Hono, context: ServerContext): void;
```

**Checklist**:
- [ ] Implement createApiRoutes()
- [ ] Mount all route groups under /api
- [ ] Add API versioning prefix if needed
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Diff Routes | `src/server/routes/diff.ts` | NOT_STARTED | - |
| Files Routes | `src/server/routes/files.ts` | NOT_STARTED | - |
| Status Routes | `src/server/routes/status.ts` | COMPLETED | 4 tests |
| Route Index | `src/server/routes/index.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Routes | Server Core | Phase 1 |
| Routes | Git Operations | Phase 1 |
| Routes | Hono package | To install |

## Completion Criteria

- [ ] GET /api/diff returns diff data
- [ ] GET /api/files returns file tree
- [ ] GET /api/file/:path returns file content
- [ ] GET /api/status returns server status
- [ ] All endpoints return proper error codes
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created

### Session: 2026-02-03 (Impl)
**Tasks Completed**: TASK-003 Status Routes
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented src/server/routes/status.ts with createStatusRoutes function. Returns StatusResponse with health check and server configuration. 4 unit tests passing.

## Related Plans

- **Previous**: 03-git-operations.md
- **Next**: 05-git-xnotes.md
- **Depends On**: 02-server-core.md, 03-git-operations.md
