# AI Commit Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-ai-commit.md
**Phase**: 7
**Created**: 2026-02-04
**Last Updated**: 2026-02-04

---

## Design Document Reference

**Source**: design-docs/specs/design-ai-commit.md

### Summary
AI-powered git commit feature. Commit button starts Claude Code agent session with customizable commit prompt to analyze changes and create appropriate commit.

### Scope
**Included**: Commit executor, commit API routes, commit store, commit UI components
**Excluded**: Push, PR (separate plans)

---

## Modules

### 1. Commit Context Types

#### src/types/commit-context.ts

**Status**: COMPLETED

```typescript
export interface CommitPromptContext {
  readonly stagedFiles: readonly StagedFile[];
  readonly stagedDiff: string;
  readonly branchName: string;
  readonly recentCommits: readonly CommitInfo[];
  readonly repositoryRoot: string;
}

export interface CommitRequest {
  readonly promptId: string;
  readonly variables: Record<string, string>;
  readonly dryRun: boolean;
}

export interface CommitResult {
  readonly success: boolean;
  readonly commitHash: string | null;
  readonly message: string;
  readonly error: string | null;
}
```

**Checklist**:
- [x] Define CommitPromptContext interface
- [x] Define CommitRequest interface
- [x] Define CommitResult interface
- [x] Define StagedFile interface and StagedFileStatus type
- [x] Add validation functions for all types
- [x] Add helper functions (create, calculate, count)
- [x] Export all types
- [x] Unit tests (48 tests passing)

### 2. Commit Executor

#### src/server/commit/executor.ts

**Status**: COMPLETED

```typescript
interface CommitExecutor {
  buildContext(cwd: string): Promise<CommitPromptContext>;
  executeCommit(contextId: ContextId, request: CommitRequest): Promise<{ sessionId: string }>;
  previewCommit(contextId: ContextId, request: CommitRequest): Promise<{ sessionId: string }>;
}

function createCommitExecutor(
  promptLoader: PromptLoader,
  promptBuilder: PromptBuilder,
  sessionManager: SessionManager
): CommitExecutor;
```

**Checklist**:
- [x] Implement buildContext()
- [x] Implement executeCommit()
- [x] Implement previewCommit()
- [ ] Integrate with AI session manager
- [x] Unit tests

### 3. Commit API Routes

#### src/server/routes/commit.ts

**Status**: NOT_STARTED

```typescript
// POST /api/ctx/:id/commit - Execute commit with AI
// POST /api/ctx/:id/commit/preview - Preview commit (dry run)
// GET /api/ctx/:id/staged - Get staged files info
function createCommitRoutes(executor: CommitExecutor): Hono;
```

**Checklist**:
- [ ] Implement POST /api/ctx/:id/commit
- [ ] Implement POST /api/ctx/:id/commit/preview
- [ ] Implement GET /api/ctx/:id/staged
- [ ] Mount routes in index.ts
- [ ] Unit tests

### 4. Commit Store (Client)

#### client/src/stores/commit.ts

**Status**: COMPLETED

```typescript
interface CommitStoreState {
  readonly stagedFiles: readonly StagedFile[];
  readonly stagedDiff: string;
  readonly selectedPromptId: string | null;
  readonly commitMessage: string;
  readonly isCommitting: boolean;
  readonly commitResult: CommitResult | null;
  readonly status: 'idle' | 'loading' | 'committing' | 'success' | 'error';
  readonly error: string | null;
  readonly sessionId: string | null;
}

interface CommitActions {
  loadStagedFiles(): Promise<void>;
  selectPrompt(id: string): void;
  previewCommit(): Promise<void>;
  executeCommit(): Promise<void>;
  cancel(): void;
  reset(): void;
}

function createCommitStore(contextId?: string): CommitStore;
```

**Checklist**:
- [x] Implement commit store
- [x] Add all actions (loadStagedFiles, selectPrompt, previewCommit, executeCommit, cancel, reset)
- [x] Connect to API (stubbed, ready for API routes)
- [x] Error handling with proper state management
- [x] Unit tests (46 tests passing)

### 5. Commit Button Component

#### client/src/components/CommitButton.svelte

**Status**: NOT_STARTED

```svelte
<!-- Button with staged count badge -->
<!-- Disabled when no staged changes -->
<!-- Loading state during commit -->
```

**Checklist**:
- [ ] Create CommitButton component
- [ ] Show staged count badge
- [ ] Handle disabled state
- [ ] Touch-friendly (44px)
- [ ] Unit tests

### 6. Commit Panel Component

#### client/src/components/CommitPanel.svelte

**Status**: NOT_STARTED

```svelte
<!-- Bottom sheet panel -->
<!-- Staged files list -->
<!-- Template selector -->
<!-- Variable inputs -->
<!-- Commit button -->
```

**Checklist**:
- [ ] Create CommitPanel component
- [ ] Create StagedFilesList component
- [ ] Create PromptTemplateSelector component
- [ ] Create VariableInputs component
- [ ] Touch-friendly
- [ ] Unit tests

### 7. Commit Progress/Success Components

#### client/src/components/commit/

**Status**: NOT_STARTED

**Files**:
- CommitProgress.svelte
- CommitSuccess.svelte

**Checklist**:
- [ ] Create CommitProgress component
- [ ] Create CommitSuccess component
- [ ] Show progress bar
- [ ] Show result details
- [ ] Post-commit actions
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Commit Context Types | `src/types/commit-context.ts` | COMPLETED | 48 passing |
| Commit Executor | `src/server/commit/executor.ts` | COMPLETED | 21 passing |
| Commit Routes | `src/server/routes/commit.ts` | NOT_STARTED | - |
| Commit Store | `client/src/stores/commit.ts` | COMPLETED | 46 passing |
| CommitButton | `client/src/components/CommitButton.svelte` | NOT_STARTED | - |
| CommitPanel | `client/src/components/CommitPanel.svelte` | NOT_STARTED | - |
| Commit Progress/Success | `client/src/components/commit/` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| AI Commit | 18-prompt-system | Ready |
| AI Commit | 12-ai-integration | Completed |
| AI Commit | 13-session-queue | Completed |

## Completion Criteria

- [ ] Commit button shows staged count
- [ ] Can select prompt template
- [ ] Can set template variables
- [ ] Commit executes via AI session
- [ ] Progress shows in session queue
- [ ] Success shows commit hash
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-04 (Initial)
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-04 (TASK-001 Implementation)
**Tasks Completed**: TASK-001 Commit Context Types
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented all type definitions, validation functions, and helper utilities. Added comprehensive unit tests (48 tests passing). Type checking passes without errors.

### Session: 2026-02-04 (TASK-002 Implementation)
**Tasks Completed**: TASK-002 Commit Executor
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented buildContext(), executeCommit(), and previewCommit() functions in src/server/commit/executor.ts. Added getCurrentBranchName() helper function. All git operations in buildContext() run in parallel for performance. Added comprehensive unit tests (21 tests passing). Type checking passes. Note: AI session manager integration (TASK-003) still pending.

### Session: 2026-02-04 (TASK-004 Implementation)
**Tasks Completed**: TASK-004 Commit Store (Client)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented client-side commit store in client/src/stores/commit.ts following workspace store patterns. Features include: state management with CommitStoreState interface, actions for loadStagedFiles(), selectPrompt(), previewCommit(), executeCommit(), cancel(), and reset(). Added CommitStatus type for status tracking (idle, loading, committing, success, error). API calls are stubbed and ready for integration. Includes _setStagedFiles() helper for testing. Comprehensive unit tests (46 tests passing). Code follows strict TypeScript guidelines with readonly properties and proper error handling.

## Related Plans

- **Depends On**: 18-prompt-system.md
- **Next**: 20-ai-push.md
