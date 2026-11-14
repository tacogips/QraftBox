# git-xnotes Comments Implementation Plan

**Status**: Ready
**Phase**: 12
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#comment-system
**Replaces**: 05-git-xnotes (SUPERSEDED)
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Server-side integration with the git-xnotes library for persistent commit comments. Provides a bridge layer for reading/writing comments, sync management for push/pull operations, and REST API routes for CRUD and sync.

### Scope
**Included**: Comment types, git-xnotes bridge (read/write), sync manager (push/pull), comment API routes
**Excluded**: Client-side comment UI components (Plan 11, already exists), comment inline display in diff view

---

## Modules

### 1. Comment Types

#### src/types/comments.ts

**Status**: COMPLETED

```typescript
interface Author {
  readonly name: string;
  readonly email: string;
}

interface Comment {
  readonly id: string;
  readonly commitHash: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly endLineNumber?: number;
  readonly body: string;
  readonly author: Author;
  readonly createdAt: number;
  readonly updatedAt?: number;
  readonly replies: readonly CommentReply[];
}

interface CommentReply {
  readonly id: string;
  readonly body: string;
  readonly author: Author;
  readonly createdAt: number;
}

interface NewComment {
  readonly filePath: string;
  readonly lineNumber: number;
  readonly endLineNumber?: number;
  readonly body: string;
  readonly author?: Author;
}

interface NewReply {
  readonly body: string;
  readonly author?: Author;
}

type SyncMode = "manual" | "auto-push" | "auto-pull" | "auto";

interface SyncStatus {
  readonly localCount: number;
  readonly remoteCount: number;
  readonly syncMode: SyncMode;
  readonly lastSyncAt: number | null;
  readonly hasUnsyncedChanges: boolean;
}
```

**Checklist**:
- [x] Define Author interface
- [x] Define Comment interface
- [x] Define CommentReply interface
- [x] Define NewComment interface
- [x] Define NewReply interface
- [x] Define SyncMode type
- [x] Define SyncStatus interface
- [x] Export all types
- [x] Unit tests

---

### 2. Comment Bridge

#### src/server/comments/bridge.ts

**Status**: COMPLETED

```typescript
interface CommentBridge {
  getComments(commitHash: string): Promise<readonly Comment[]>;
  getFileComments(commitHash: string, filePath: string): Promise<readonly Comment[]>;
  addComment(commitHash: string, comment: NewComment): Promise<Comment>;
  updateComment(commitHash: string, commentId: string, body: string): Promise<Comment>;
  deleteComment(commitHash: string, commentId: string): Promise<boolean>;
  replyToComment(commitHash: string, commentId: string, reply: NewReply): Promise<CommentReply>;
  getDefaultAuthor(): Promise<Author>;
}

function createCommentBridge(projectPath: string): CommentBridge;
```

**Checklist**:
- [x] createCommentBridge wrapping git notes commands via execGit
- [x] getComments reading all comments for a commit
- [x] getFileComments filtering by file path
- [x] addComment writing new comment via git notes
- [x] updateComment modifying existing comment body
- [x] deleteComment removing comment (returns boolean instead of void)
- [x] replyToComment adding reply (one level only)
- [x] getDefaultAuthor from git config user.name/email
- [x] Unit tests (27 tests, all passing)

---

### 3. Sync Manager

#### src/server/comments/sync.ts

**Status**: COMPLETED

```typescript
interface SyncManager {
  getSyncStatus(): Promise<SyncStatus>;
  pushNotes(): Promise<void>;
  pullNotes(): Promise<void>;
  setSyncMode(mode: SyncMode): void;
  getSyncMode(): SyncMode;
  markAsChanged(): void;
}

function createSyncManager(projectPath: string, initialMode?: SyncMode): SyncManager;
```

**Checklist**:
- [x] createSyncManager wrapping git push/pull operations
- [x] getSyncStatus returning local/remote counts and sync state
- [x] pushNotes pushing git notes to remote
- [x] pullNotes pulling git notes from remote
- [x] setSyncMode/getSyncMode for configuring sync behavior
- [x] markAsChanged for tracking unsynced changes
- [x] Unit tests (18 tests, all passing)

---

### 4. Comment Routes

#### src/server/routes/comments.ts

**Status**: COMPLETED

```typescript
// GET /api/ctx/:contextId/comments/:commitHash
// Response: { comments: Comment[] }

// GET /api/ctx/:contextId/comments/:commitHash/file/*path
// Response: { comments: Comment[] }

// POST /api/ctx/:contextId/comments/:commitHash
// Body: NewComment
// Response: { comment: Comment }

// PUT /api/ctx/:contextId/comments/:commitHash/:commentId
// Body: { body: string }
// Response: { comment: Comment }

// DELETE /api/ctx/:contextId/comments/:commitHash/:commentId
// Response: { success: boolean }

// POST /api/ctx/:contextId/comments/:commitHash/:commentId/reply
// Body: NewReply
// Response: { reply: CommentReply }

// GET /api/ctx/:contextId/notes/status
// Response: SyncStatus

// POST /api/ctx/:contextId/notes/push
// Response: { success: boolean }

// POST /api/ctx/:contextId/notes/pull
// Response: { success: boolean }

function createCommentRoutes(): Hono;
```

**Checklist**:
- [x] GET comments by commit hash
- [x] GET comments filtered by file path
- [x] POST new comment
- [x] PUT update comment body
- [x] DELETE comment
- [x] POST reply to comment
- [x] GET sync status
- [x] POST push notes
- [x] POST pull notes
- [x] Input validation for all endpoints
- [x] Error handling
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Comment Types | `src/types/comments.ts` | COMPLETED | 46 pass |
| Comment Bridge | `src/server/comments/bridge.ts` | COMPLETED | 27 pass |
| Sync Manager | `src/server/comments/sync.ts` | COMPLETED | 18 pass |
| Comment Routes | `src/server/routes/comments.ts` | COMPLETED | 27 pass |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Comment Types | None | - |
| Comment Bridge | git-xnotes library (npm) | Available |
| Comment Bridge | Plan 26 (git executor for git config) | NOT_STARTED |
| Sync Manager | git-xnotes library (npm) | Available |
| Comment Routes | Comment Bridge, Sync Manager | - |
| Comment Routes | Plan 27 (route registry) | NOT_STARTED |

## Completion Criteria

- [x] All 4 modules implemented (4/4 complete)
- [x] All tests passing (118 tests total, 0 failures)
- [x] Type checking passes
- [x] Can read/write comments via git notes
- [x] Reply threading works (one level)
- [x] Sync push/pull operations work
- [x] Sync status accurately reflects local/remote state
- [x] API routes handle all CRUD operations

## Progress Log

### Session: 2026-02-07

**Module Completed**: Module 1: Comment Types

**Files Created**:
- `src/types/comments.ts` - All type definitions with factory functions and type guards
- `src/types/comments.test.ts` - Comprehensive test suite with 46 tests

**Completion Status**:
- [x] All interfaces defined (Author, Comment, CommentReply, NewComment, NewReply, SyncStatus)
- [x] SyncMode type defined
- [x] Factory functions for all types (createAuthor, createComment, createCommentReply, etc.)
- [x] Type guards (isSyncMode, isValidAuthor, isValidComment, isValidLineNumber, isValidLineRange)
- [x] Helper functions (isCommentUpdated, hasReplies, isMultiLineComment)
- [x] All tests passing (46 pass, 0 fail, 132 expect() calls)
- [x] Type checking passes (bun run typecheck)
- [x] Code formatted with prettier

**Notes**:
- Followed established patterns from src/types/branch.ts and src/types/watcher.ts
- Used `import type` for verbatimModuleSyntax compliance
- All interfaces use readonly fields for immutability
- Optional properties use `| undefined` for exactOptionalPropertyTypes compliance
- Comprehensive validation functions for runtime type safety

---

### Session: 2026-02-07 (TASK-002)

**Module Completed**: Module 2: Comment Bridge

**Files Created**:
- `src/server/comments/bridge.ts` - Comment Bridge implementation using git notes
- `src/server/comments/bridge.test.ts` - Comprehensive test suite with 27 tests

**Implementation Details**:
- Uses `git notes --ref=qraftbox-comments` for storage (NOT npm git-xnotes library)
- Comments stored as JSON arrays in git notes
- All CRUD operations: getComments, getFileComments, addComment, updateComment, deleteComment, replyToComment
- Default author fetched from git config user.name/user.email
- Unique IDs generated with crypto.randomUUID()
- Timestamps using Date.now()

**Completion Status**:
- [x] createCommentBridge factory function
- [x] All 6 CRUD operations implemented
- [x] getDefaultAuthor reading from git config
- [x] Tests use real temporary git repositories (not mocks)
- [x] All 27 tests passing (0 failures)
- [x] Type checking passes (bun run typecheck)
- [x] Code formatted with prettier

**Key Design Decisions**:
- deleteComment returns boolean (true if deleted, false if not found) instead of void
- Uses execGit from src/server/git/executor.ts for all git operations
- Empty notes return empty array (not error) for graceful handling
- Follows patterns from src/server/git/branch.ts for git command wrapping
- Tests verify persistence across bridge instances for data integrity

**Test Coverage**:
- getComments: empty notes, multiple comments
- getFileComments: filtering by file path
- addComment: ID generation, timestamps, default author, custom author, multi-line comments, persistence
- updateComment: body update, updatedAt timestamp, field preservation, error on not found, persistence
- deleteComment: removal, returns boolean, selective deletion, persistence
- replyToComment: reply creation, default author, custom author, multiple replies, error on not found, persistence
- getDefaultAuthor: reads from git config, local config override
- Integration scenarios: multiple operations, multiple commits

---

### Session: 2026-02-07 (TASK-003)

**Module Completed**: Module 3: Sync Manager

**Files Created**:
- `src/server/comments/sync.ts` - Sync Manager implementation for git notes push/pull
- `src/server/comments/sync.test.ts` - Comprehensive test suite with 18 tests

**Implementation Details**:
- Wraps git push/pull commands for `refs/notes/qraftbox-comments` ref
- getSyncStatus: Returns local/remote note counts via `git notes list` and `git ls-remote`
- pushNotes: Pushes notes ref to origin with `git push origin refs/notes/qraftbox-comments`
- pullNotes: Fetches notes ref from origin with `git fetch origin refs/notes/qraftbox-comments:refs/notes/qraftbox-comments`
- setSyncMode/getSyncMode: Store mode in memory (manual, auto-push, auto-pull, auto)
- markAsChanged: Track hasUnsyncedChanges flag for bridge integration
- lastSyncAt: Timestamp updated after successful push/pull operations
- Graceful error handling: Throws descriptive error if no remote configured
- Empty notes handling: Push/pull succeed even with no notes (no-op for push)

**Completion Status**:
- [x] createSyncManager factory function
- [x] getSyncStatus with accurate local/remote counts
- [x] pushNotes pushing to remote
- [x] pullNotes fetching from remote
- [x] setSyncMode/getSyncMode
- [x] markAsChanged for tracking unsynced changes
- [x] All 18 tests passing (0 failures)
- [x] Type checking passes (bun run typecheck)
- [x] Code formatted with prettier

**Key Design Decisions**:
- Auto-sync scheduling NOT implemented (only mode storage)
- markAsChanged() method added for bridge integration (not in original plan)
- Uses execGit from src/server/git/executor.ts for all git operations
- Follows patterns from src/server/comments/bridge.ts for consistency
- Tests use real temporary git repositories with bare remotes and clones
- Push with no notes succeeds (returns early) to avoid git error

**Test Coverage**:
- getSyncMode/setSyncMode: default mode, round-trip, initial mode in constructor
- getSyncStatus: no notes, with local notes, reflects sync mode
- markAsChanged: sets hasUnsyncedChanges flag, persists until sync
- pushNotes: error on no remote, updates lastSyncAt, clears hasUnsyncedChanges, pushes to remote
- pullNotes: error on no remote, updates lastSyncAt, clears hasUnsyncedChanges, pulls from remote
- Integration scenarios: push/pull workflow with multiple comments, mode changes reflected in status

**Notes**:
- All 4 modules now COMPLETED
- Total test count: 118 tests (46 types + 27 bridge + 18 sync + 27 routes)
- All modules follow strict TypeScript patterns from .claude/skills/ts-coding-standards/
- Implementation ready for integration with server

---

### Session: 2026-02-07 (TASK-004)

**Module Completed**: Module 4: Comment Routes

**Files Created**:
- `src/server/routes/comments.ts` - Comment API routes with CRUD and sync endpoints
- `src/server/routes/comments.test.ts` - Comprehensive test suite with 27 tests

**Implementation Details**:
- All 9 endpoints implemented (6 comment CRUD + 3 sync operations)
- GET /comments/:commitHash - List all comments for commit
- GET /comments/:commitHash/file/* - List comments for specific file
- POST /comments/:commitHash - Add new comment
- PUT /comments/:commitHash/:commentId - Update comment body
- DELETE /comments/:commitHash/:commentId - Delete comment
- POST /comments/:commitHash/:commentId/reply - Reply to comment
- GET /notes/status - Get sync status
- POST /notes/push - Push notes to remote
- POST /notes/pull - Pull notes from remote
- Follows Hono route pattern from branches.ts and diff.ts
- Context extraction via middleware or constructor parameter
- Input validation on all POST/PUT endpoints
- Error handling with proper HTTP status codes (200, 201, 400, 404, 500)

**Completion Status**:
- [x] All 9 endpoints implemented
- [x] Input validation (filePath, lineNumber, body non-empty checks)
- [x] Error handling (404 for not found, 400 for validation, 500 for errors)
- [x] All 27 tests passing (0 failures)
- [x] Type checking passes (bun run typecheck)
- [x] Code formatted with prettier

**Test Coverage**:
- GET /comments/:commitHash: empty list, with comments
- GET /comments/:commitHash/file/*: file filtering, empty path validation
- POST /comments/:commitHash: success, multi-line, missing/invalid fields
- PUT /comments/:commitHash/:commentId: update success, not found, missing/empty body
- DELETE /comments/:commitHash/:commentId: delete success, non-existent comment
- POST /comments/:commitHash/:commentId/reply: reply success, not found, missing/empty body
- GET /notes/status: returns sync status
- POST /notes/push: handles push operation
- POST /notes/pull: handles pull operation
- Integration: complete workflow (add, reply, update, delete)

**Notes**:
- Implementation complete - Plan 30 all modules done
- Total project test count: 3032 tests passing (full suite)
- Ready for server integration and route mounting

## Related Plans

- **Replaces**: 05-git-xnotes (SUPERSEDED - source files never existed)
- **Depends On**: Plan 26 (git executor), Plan 27 (route registry)
- **Related**: Plan 11 (Comment UI) - client-side components exist
