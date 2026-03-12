# Full-File Review Queue Parity Implementation Plan

**Status**: Completed
**Design Reference**: client-legacy/components/FileViewer.svelte, client-legacy/components/app/DiffScreen.svelte
**Created**: 2026-03-11
**Last Updated**: 2026-03-11

---

## Design Document Reference

**Source**: `client-legacy/components/FileViewer.svelte`, `client-legacy/components/app/DiffScreen.svelte`

### Summary
Restore the Solid full-file review behavior that exists in the legacy Svelte viewer and diff screen: local line/range selection, inline comment drafting, a persistent queued-comment dock, and starting a consolidated AI session from queued comments.

### Scope
**Included**: Full-file view selection/composer behavior, project-scoped queued-comment CRUD, batch AI session launch from queued comments, model-profile selection for batch submit, app callback wiring to open the session overview.
**Excluded**: Inline/side-by-side/current-state comment composition, server API changes, persistence of inline composer state in the route.

---

## Modules

### 1. Full-File Viewer Interaction And Queue Dock

#### client/src/features/diff/DiffScreen.tsx

**Status**: COMPLETE

```typescript
interface DiffScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly projectPath: string;
  readonly selectedLineNumber: number | null;
  onSelectLine(lineNumber: number | null): void;
  onOpenAiSession(sessionId: string): void;
}

interface FullFileLineRange {
  readonly startLine: number;
  readonly endLine: number;
}
```

**Checklist**:
- [x] Add local full-file range state
- [x] Add inline composer state for prompt/error/notices
- [x] Prevent inline composer open from mutating route state
- [x] Focus textarea when a selection opens
- [x] Queue comments from selected full-file lines
- [x] Start a new AI session from selected full-file lines
- [x] Load persisted queued comments for the active project
- [x] Add queue dock with edit/remove/clear actions
- [x] Submit queued comments as one AI session
- [x] Add model-profile selection for queued batch submit
- [x] Keep plain preview row selection available separately
- [x] Browser-verify queue visibility and batch submit flow

### 2. Full-File Selection Helpers

#### client/src/features/diff/full-file-ai.ts

**Status**: COMPLETE

```typescript
interface FullFileLineRange {
  readonly startLine: number;
  readonly endLine: number;
}

function resolveFullFileLineRange(params: {
  readonly currentRange: FullFileLineRange | null;
  readonly lineNumber: number;
  readonly extendRange: boolean;
}): FullFileLineRange;

function createFullFilePromptContext(params: {
  readonly fileContent: FileContent;
  readonly range: FullFileLineRange;
}): AIPromptContext;
```

**Checklist**:
- [x] Extract pure range-selection helpers
- [x] Build prompt context from the selected line slice
- [x] Build consolidated queued-comment batch message/context helpers
- [x] Cover helper behavior with unit tests

### 3. Shared AI Comment API

#### client-shared/src/api/ai-comments.ts

**Status**: COMPLETE

```typescript
type AiCommentSource = "diff" | "current-state" | "full-file";
type AiCommentSide = "old" | "new";

interface QueueAiCommentInput {
  readonly projectPath: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly side: AiCommentSide;
  readonly source: AiCommentSource;
  readonly prompt: string;
}

interface AiCommentsApiClient {
  listComments(projectPath: string): Promise<readonly QueuedAiComment[]>;
  addComment(input: QueueAiCommentInput): Promise<QueuedAiComment>;
  updateComment(
    projectPath: string,
    commentId: string,
    prompt: string,
  ): Promise<QueuedAiComment>;
  removeComment(projectPath: string, commentId: string): Promise<boolean>;
  clearComments(projectPath: string): Promise<number>;
}
```

**Checklist**:
- [x] Add shared client wrapper for `/api/ai-comments`
- [x] Cover list/update/remove/clear queue operations
- [x] Keep request shape aligned to the existing server route
- [x] Cover request construction with a unit test

### 4. App Wiring

#### client/src/App.tsx

**Status**: COMPLETE

```typescript
interface DiffScreenProps {
  readonly projectPath: string;
  onOpenAiSession(sessionId: string): void;
}
```

**Checklist**:
- [x] Pass project path into `DiffScreen`
- [x] Add a session-opening callback that routes to `#/.../ai-session?ai_session_id=...`

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Full-file review UI and queue dock | `client/src/features/diff/DiffScreen.tsx` | COMPLETE | Focused browser verification complete |
| Full-file helper logic | `client/src/features/diff/full-file-ai.ts` | COMPLETE | `full-file-ai.test.ts` |
| Shared AI comment API | `client-shared/src/api/ai-comments.ts` | COMPLETE | `ai-comments.test.ts` |
| App session wiring | `client/src/App.tsx` | COMPLETE | Covered by focused browser verification |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Full-file inline composer | Existing `/api/ai-comments` route | Available |
| Full-file AI session start | Existing shared AI sessions API | Available |
| Session-open callback | Existing `ai-session` screen route | Available |

## Completion Criteria

- [x] Full-file view exposes line/range selection controls
- [x] Full-file inline composer can queue comments
- [x] Full-file inline composer can start a new AI session
- [x] Project-scoped queued comments are visible and editable from the files screen
- [x] Queued comments can be submitted as one AI session
- [x] Inline range state is local and not encoded into the route
- [x] Focused unit tests pass
- [x] Browser verification confirms the textarea accepts input and the queue submit flow works

## Progress Log

### Session: 2026-03-11 17:00
**Tasks Completed**: Added initial Solid full-file inline controls, shared AI comment client, full-file helper module, and app session-opening callback.
**Tasks In Progress**: Fixing the remount/input regression in the full-file inline composer.
**Blockers**: None.
**Notes**: The first pass incorrectly tied inline composer open to route state, which recreated `DiffScreen` and made the textarea unusable.

### Session: 2026-03-11 17:30
**Tasks Completed**: Isolated the root cause to route-driven screen recreation and changed the inline full-file selection flow to remain local to `DiffScreen`.
**Tasks In Progress**: Final browser verification of typing, queueing, and session-start behavior.
**Blockers**: Root-wide typecheck remains blocked by unrelated pre-existing errors outside this feature.
**Notes**: Browser verification must explicitly type into the textarea, not just confirm the control exists.

### Session: 2026-03-11 18:10
**Tasks Completed**: Matched the Svelte queue workflow by adding server-backed queued-comment loading, editing, clearing, and consolidated batch submission with model-profile selection to the Solid `files` screen.
**Tasks In Progress**: None.
**Blockers**: Root-wide typecheck still reports unrelated pre-existing errors in `bootstrap-state.test.ts`, `ai-session/presentation.test.ts`, `ai-session/presentation.ts`, and `ai-session/state.ts`.
**Notes**: Browser verification on `#/qraftbox-dd412c/files?tree=all&path=AGENTS.md&view=full-file` confirmed the queue dock rendered existing comments, `Submit comments` drained the queue, and the post-submit `Open session` notice appeared.

## Related Plans

- **Previous**: `impl-plans/solid-frontend-migration.md`
- **Next**: None
- **Depends On**: Existing Solid files screen and shared AI routes
