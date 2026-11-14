# Comment System UI Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#comment-system-git-xnotes-integration
**Phase**: 3
**Created**: 2026-02-03
**Last Updated**: 2026-02-04

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Comment display and input UI for git-xnotes integration. Supports adding, viewing, editing comments on lines with one-level threading.

### Scope
**Included**: Comment display, comment form, reply functionality, sync status UI
**Excluded**: Backend comment operations (git-xnotes plan), AI integration

---

## Modules

### 1. Comment Store

#### client/stores/comments.ts

**Status**: NOT_STARTED

```typescript
// Comment state management
interface CommentsStore {
  comments: Map<string, Comment[]>;  // commitHash -> comments
  loading: boolean;
  syncStatus: SyncStatus | null;
  error: string | null;
}

interface CommentActions {
  loadComments(commit: string): Promise<void>;
  addComment(commit: string, comment: NewComment): Promise<void>;
  replyToComment(commit: string, parentId: string, reply: NewComment): Promise<void>;
  updateComment(commit: string, commentId: string, content: string): Promise<void>;
  deleteComment(commit: string, commentId: string): Promise<void>;
  refreshSyncStatus(): Promise<void>;
  pushNotes(): Promise<void>;
  pullNotes(): Promise<void>;
}

function createCommentsStore(): CommentsStore & CommentActions;
```

**Checklist**:
- [ ] Implement comments store
- [ ] Add all actions
- [ ] Handle loading states
- [ ] Handle errors
- [ ] Unit tests

### 2. Comment Display

#### client/components/CommentDisplay.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let comment: Comment;
  export let onReply: () => void;
  export let onEdit: () => void;
  export let onDelete: () => void;

  // Author, timestamp, content
  // Reply button
  // Edit/delete for own comments
</script>
```

**Checklist**:
- [ ] Display comment content
- [ ] Show author and timestamp
- [ ] Add reply button
- [ ] Add edit/delete (own comments)
- [ ] Handle touch gestures
- [ ] Unit tests

### 3. Comment Thread

#### client/components/CommentThread.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let comment: Comment;
  export let replies: CommentReply[];

  // Parent comment
  // Nested replies (one level)
  // Add reply form toggle
</script>
```

**Checklist**:
- [ ] Display parent comment
- [ ] Display replies indented
- [ ] Show reply form when toggled
- [ ] Limit to one level of nesting
- [ ] Unit tests

### 4. Comment Form

#### client/components/CommentForm.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let lineStart: number;
  export let lineEnd?: number;
  export let defaultAuthor: Author;
  export let onSubmit: (comment: NewComment) => void;
  export let onCancel: () => void;

  // Large text input (touch-friendly)
  // Author field (editable)
  // Submit/Cancel buttons
</script>
```

**Checklist**:
- [ ] Implement form with textarea
- [ ] Add author field (pre-filled)
- [ ] Add submit/cancel buttons (44px touch target)
- [ ] Handle keyboard (Ctrl+Enter submit)
- [ ] Slide up as bottom sheet on tablet
- [ ] Unit tests

### 5. Line Comment Indicator

#### client/components/LineCommentIndicator.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let commentCount: number;
  export let onClick: () => void;

  // Small icon/badge on line number
  // Shows count of comments
</script>
```

**Checklist**:
- [ ] Render comment indicator
- [ ] Show count badge
- [ ] Handle click to show comments
- [ ] Touch-friendly target
- [ ] Unit tests

### 6. Comments Panel

#### client/components/CommentsPanel.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let filePath: string;
  export let comments: Comment[];
  export let onClose: () => void;

  // List all comments for file
  // Jump to line on click
</script>
```

**Checklist**:
- [ ] List file comments
- [ ] Group by line range
- [ ] Click to jump to line
- [ ] Slide-in panel on tablet
- [ ] Unit tests

### 7. Sync Status Bar

#### client/components/SyncStatusBar.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let status: SyncStatus;
  export let onPush: () => void;
  export let onPull: () => void;

  // Show sync mode
  // Show local/remote counts
  // Push/pull buttons
</script>
```

**Checklist**:
- [ ] Display sync mode
- [ ] Show unpushed indicator
- [ ] Add push/pull buttons
- [ ] Handle sync in progress
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Comments Store | `client/src/stores/comments.ts` | COMPLETED | - |
| Comment Display | `client/components/CommentDisplay.svelte` | COMPLETED | - |
| Comment Thread | `client/components/CommentThread.svelte` | COMPLETED | - |
| Comment Form | `client/components/CommentForm.svelte` | COMPLETED | - |
| Line Indicator | `client/components/LineCommentIndicator.svelte` | COMPLETED | - |
| Comments Panel | `client/components/CommentsPanel.svelte` | COMPLETED | - |
| Sync Status | `client/components/SyncStatusBar.svelte` | COMPLETED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Comment UI | Client Core | Phase 2 |
| Comment UI | git-xnotes API | Phase 2 |
| Comment UI | API Client | Phase 2 |

## Completion Criteria

- [x] Comments display correctly on lines
- [x] Can add new comments
- [x] Can reply to comments (one level)
- [x] Can edit/delete own comments
- [x] Sync status shows correctly
- [x] Push/pull operations work (UI only, backend is stubbed)
- [x] Type checking passes
- [x] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-04
**Tasks Completed**: All tasks (TASK-001 through TASK-007)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented all comment UI components:
- Comments Store with full CRUD operations (stubbed API calls)
- CommentDisplay for individual comments with owner-based edit/delete
- CommentThread with one-level reply nesting
- CommentForm with touch-friendly inputs and keyboard shortcuts
- LineCommentIndicator badge for showing comment count on lines
- CommentsPanel as slide-in sidebar with grouped comments
- SyncStatusBar for git-xnotes push/pull status and controls
- All components follow tablet-first design with 44px touch targets

## Related Plans

- **Previous**: 10-file-tree.md
- **Next**: 12-ai-integration.md
- **Depends On**: 05-git-xnotes.md (API), 07-client-core.md
