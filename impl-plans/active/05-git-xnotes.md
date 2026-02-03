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

**Status**: NOT_STARTED

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
- [ ] Define Comment interface
- [ ] Define CommentReply interface
- [ ] Define Author interface
- [ ] Define NewComment interface
- [ ] Define SyncStatus interface
- [ ] Export all types

### 2. Comment Bridge

#### src/server/comments/bridge.ts

**Status**: NOT_STARTED

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
- [ ] Implement createCommentBridge()
- [ ] Implement getComments()
- [ ] Implement getFileComments()
- [ ] Implement addComment()
- [ ] Implement replyToComment()
- [ ] Implement updateComment()
- [ ] Implement deleteComment()
- [ ] Implement getDefaultAuthor()
- [ ] Unit tests with mocked git-xnotes

### 3. Sync Manager

#### src/server/comments/sync.ts

**Status**: NOT_STARTED

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
- [ ] Implement createSyncManager()
- [ ] Implement getStatus()
- [ ] Implement push()
- [ ] Implement pull()
- [ ] Implement setSyncMode()
- [ ] Implement handleAutoSync()
- [ ] Unit tests

### 4. Comment API Routes

#### src/server/routes/comments.ts

**Status**: NOT_STARTED

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
- [ ] Implement createCommentRoutes()
- [ ] Implement GET /api/comments/:commit
- [ ] Implement POST /api/comments/:commit
- [ ] Implement PUT /api/comments/:commit/:id
- [ ] Implement DELETE /api/comments/:commit/:id
- [ ] Implement POST /api/comments/:commit/:id/reply
- [ ] Implement GET /api/notes/status
- [ ] Implement POST /api/notes/push
- [ ] Implement POST /api/notes/pull
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Comment Types | `src/types/comments.ts` | NOT_STARTED | - |
| Comment Bridge | `src/server/comments/bridge.ts` | NOT_STARTED | - |
| Sync Manager | `src/server/comments/sync.ts` | NOT_STARTED | - |
| Comment Routes | `src/server/routes/comments.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Comments | git-xnotes package | To install |
| Comments | Server Core | Phase 1 |
| Routes | API Routes pattern | Phase 1 |

## Completion Criteria

- [ ] Can read comments from git-xnotes
- [ ] Can add/update/delete comments
- [ ] Can reply to comments (one level)
- [ ] Sync status displays correctly
- [ ] Push/pull operations work
- [ ] Auto-sync modes work
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 04-api-routes.md
- **Next**: 06-file-watcher.md
- **Depends On**: 02-server-core.md, 04-api-routes.md
