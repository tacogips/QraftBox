# git-xnotes Integration Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#comment-system-git-xnotes-integration
**Phase**: 2
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Integration with git-xnotes TypeScript library for persistent commit comments. Provides comment storage, retrieval, and sync functionality.

### Scope
**Included**: Comment bridge, API routes for comments, sync status and operations
**Excluded**: Comment UI components (separate plan), AI integration

---

## Modules

### 1. Comment Types

#### src/types/comments.ts

**Status**: COMPLETED

```typescript
// Comment data structures
interface Comment {
  id: string;
  commitHash: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  author: Author;
  content: string;
  createdAt: string;
  updatedAt?: string;
  replies?: CommentReply[];
}

interface CommentReply {
  id: string;
  author: Author;
  content: string;
  createdAt: string;
}

interface Author {
  name: string;
  email: string;
}

interface NewComment {
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  content: string;
  author?: Author;  // Optional, defaults to git config
}

type SyncMode = 'manual' | 'auto-push' | 'auto-pull' | 'auto';

interface SyncStatus {
  localCount: number;
  remoteCount: number;
  syncMode: SyncMode;
  lastSync?: string;
  hasUnpushed: boolean;
}
```

**Checklist**:
- [x] Define Comment interface
- [x] Define CommentReply interface
- [x] Define Author interface
- [x] Define NewComment interface
- [x] Define SyncStatus interface
- [x] Export all types
- [x] Add comprehensive unit tests
- [x] Verify type checking passes
- [x] Apply readonly modifiers for immutability

### 2. Comment Bridge

#### src/server/comments/bridge.ts

**Status**: COMPLETED

```typescript
import { readComments, appendComment, pushAllNotes } from 'git-xnotes';

interface CommentBridge {
  // Read comments for a commit
  getComments(commit: string): Promise<Comment[]>;

  // Get comments for a specific file
  getFileComments(commit: string, filePath: string): Promise<Comment[]>;

  // Add new comment
  addComment(commit: string, comment: NewComment): Promise<Comment>;

  // Reply to existing comment (one level only)
  replyToComment(commit: string, parentId: string, reply: NewComment): Promise<CommentReply>;

  // Update comment
  updateComment(commit: string, commentId: string, content: string): Promise<Comment>;

  // Delete comment
  deleteComment(commit: string, commentId: string): Promise<void>;

  // Get default author from git config
  getDefaultAuthor(): Promise<Author>;
}

// Create comment bridge instance
function createCommentBridge(cwd: string): CommentBridge;
```

**Checklist**:
- [x] Implement createCommentBridge()
- [x] Implement getComments()
- [x] Implement getFileComments()
- [x] Implement addComment()
- [x] Implement replyToComment()
- [x] Implement updateComment()
- [x] Implement deleteComment()
- [x] Implement getDefaultAuthor()
- [x] Unit tests with mocked git-xnotes

### 3. Sync Manager

#### src/server/comments/sync.ts

**Status**: COMPLETED

```typescript
interface SyncManager {
  // Get sync status
  getStatus(): Promise<SyncStatus>;

  // Push notes to remote
  push(): Promise<void>;

  // Pull notes from remote
  pull(): Promise<void>;

  // Configure sync mode
  setSyncMode(mode: SyncMode): void;

  // Handle auto-sync after comment operations
  handleAutoSync(): Promise<void>;
}

// Create sync manager
function createSyncManager(cwd: string, mode: SyncMode): SyncManager;
```

**Checklist**:
- [x] Implement createSyncManager()
- [x] Implement getStatus()
- [x] Implement push()
- [x] Implement pull()
- [x] Implement setSyncMode()
- [x] Implement handleAutoSync()
- [x] Unit tests

### 4. Comment API Routes

#### src/server/routes/comments.ts

**Status**: COMPLETED

```typescript
// GET /api/comments/:commit - Get comments for commit
// POST /api/comments/:commit - Add comment to commit
// PUT /api/comments/:commit/:id - Update comment
// DELETE /api/comments/:commit/:id - Delete comment
// POST /api/comments/:commit/:id/reply - Reply to comment

// GET /api/notes/status - Get sync status
// POST /api/notes/push - Push notes to remote
// POST /api/notes/pull - Pull notes from remote

// Create comment routes
function createCommentRoutes(context: ServerContext): Hono;
```

**Checklist**:
- [x] Implement createCommentRoutes()
- [x] Implement GET /api/comments/:commit
- [x] Implement POST /api/comments/:commit
- [x] Implement PUT /api/comments/:commit/:id
- [x] Implement DELETE /api/comments/:commit/:id
- [x] Implement POST /api/comments/:commit/:id/reply
- [x] Implement GET /api/notes/status
- [x] Implement POST /api/notes/push
- [x] Implement POST /api/notes/pull
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Comment Types | `src/types/comments.ts` | COMPLETED | 16 passing |
| Comment Bridge | `src/server/comments/bridge.ts` | COMPLETED | 21 passing |
| Sync Manager | `src/server/comments/sync.ts` | COMPLETED | 19 passing |
| Comment Routes | `src/server/routes/comments.ts` | COMPLETED | 21 passing |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Comments | git-xnotes package | To install |
| Comments | Server Core | Phase 1 |
| Routes | API Routes pattern | Phase 1 |

## Completion Criteria

- [x] Can read comments from git-xnotes
- [x] Can add/update/delete comments
- [x] Can reply to comments (one level)
- [x] Sync status displays correctly
- [x] Push/pull operations work
- [x] Auto-sync modes work
- [x] Type checking passes
- [x] Unit tests passing (77 tests total: 16 types + 21 bridge + 19 sync + 21 routes)

## Progress Log

### Session: 2026-02-03 (Initial)
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-03 (TASK-001: Comment Types)
**Tasks Completed**: Comment Types implementation
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented all comment type interfaces with readonly properties
- Created comprehensive test suite (16 tests, all passing)
- Followed TypeScript strict mode guidelines from .claude/skills/ts-coding-standards/
- Applied type safety patterns: readonly modifiers, proper optional handling
- Type checking passes without errors
- Tests verify type safety with noUncheckedIndexedAccess
- Files created: src/types/comments.ts, src/types/comments.test.ts

### Session: 2026-02-03 (TASK-002: Comment Bridge)
**Tasks Completed**: Comment Bridge implementation
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented createCommentBridge factory function with full CommentBridge interface
- All 8 interface methods implemented: getComments, getFileComments, addComment, replyToComment, updateComment, deleteComment, getDefaultAuthor
- Uses git notes (refs/notes/qraftbox-comments) for persistent comment storage
- Comprehensive test suite with mocked git executor (21 tests, all passing)
- Type safety: properly handles exactOptionalPropertyTypes, noPropertyAccessFromIndexSignature
- Error handling: uses GitError for git command failures, proper error messages
- JSON storage format with type guards for runtime validation
- Implements one-level comment threading (replies to comments only)
- getDefaultAuthor reads from git config user.name and user.email
- Type checking passes without errors (bun run typecheck: 0 errors)
- Full test suite passes: 584 tests total, all passing
- Files created: src/server/comments/bridge.ts, src/server/comments/bridge.test.ts

### Session: 2026-02-03 (TASK-003: Sync Manager)
**Tasks Completed**: Sync Manager implementation
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented createSyncManager factory function with full SyncManager interface
- All 5 interface methods implemented: getStatus, push, pull, setSyncMode, handleAutoSync
- Sync status tracking: localCount, remoteCount, hasUnpushed, lastSync, syncMode
- Auto-sync modes: manual (no auto), auto-push (push after changes), auto-pull (pull before read), auto (both)
- Git commands: notes list (count), fetch (remote sync), notes merge (pull), push (publish)
- Comprehensive test suite with mocked git executor (19 tests, all passing)
- Type safety: properly handles exactOptionalPropertyTypes by conditionally including optional properties
- Error handling: uses GitError for git command failures, handles "Already up to date" gracefully
- Exhaustive switch case for sync modes with never type check
- Type checking passes without errors (sync files have no errors)
- Full test suite passes: 648 tests total, all passing
- Files created: src/server/comments/sync.ts, src/server/comments/sync.test.ts

### Session: 2026-02-03 (TASK-004: Comment API Routes)
**Tasks Completed**: Comment Routes implementation
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented createCommentRoutes factory function with Hono app
- All 9 API endpoints implemented:
  - GET /api/comments/:commit - Get all comments for a commit
  - POST /api/comments/:commit - Add new comment with validation
  - PUT /api/comments/:commit/:id - Update existing comment content
  - DELETE /api/comments/:commit/:id - Delete comment by ID
  - POST /api/comments/:commit/:id/reply - Reply to parent comment (one level)
  - GET /api/notes/status - Get sync status from SyncManager
  - POST /api/notes/push - Push notes to remote
  - POST /api/notes/pull - Pull notes from remote
- Request/response types defined: CommentListResponse, CommentResponse, ReplyResponse, SyncStatusResponse, SyncOperationResponse
- Proper error handling with 400 (validation), 404 (not found), 500 (server error) responses
- Validates request bodies and parameters before processing
- Uses CommentBridge for all comment CRUD operations
- Uses SyncManager for sync operations and auto-sync after write operations
- Auto-sync triggered after addComment, updateComment, deleteComment, replyToComment
- Comprehensive test suite with mocked bridge and sync manager (21 tests, all passing)
- Tests cover: success cases, validation errors, not found errors, git errors, auto-sync behavior
- Type safety: properly handles exactOptionalPropertyTypes with conditional property spreading
- Error messages include context for debugging
- Type checking passes without errors (bun run typecheck: 0 errors)
- Files created: src/server/routes/comments.ts, src/server/routes/comments.test.ts

## Related Plans

- **Previous**: 04-api-routes.md
- **Next**: 06-file-watcher.md
- **Depends On**: 02-server-core.md, 04-api-routes.md
