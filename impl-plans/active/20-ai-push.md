# AI Push Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-ai-commit.md
**Phase**: 7
**Created**: 2026-02-04
**Last Updated**: 2026-02-04

---

## Design Document Reference

**Source**: design-docs/specs/design-ai-commit.md

### Summary
AI-powered git push feature. Push button starts Claude Code agent session with customizable push prompt to push commits to remote repository.

### Scope
**Included**: Push executor, push API routes, push store, push UI components
**Excluded**: Commit, PR (separate plans)

---

## Modules

### 1. Push Context Types

#### src/types/push-context.ts

**Status**: COMPLETED

```typescript
export interface PushPromptContext {
  readonly branchName: string;
  readonly remoteName: string;
  readonly remoteBranch: string;
  readonly unpushedCommits: readonly UnpushedCommit[];
  readonly hasUpstream: boolean;
  readonly aheadCount: number;
  readonly behindCount: number;
  readonly customVariables: Record<string, string>;
}

export interface UnpushedCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly author: string;
  readonly date: number;
}

export interface PushRequest {
  readonly promptTemplateId: string;
  readonly remote?: string;
  readonly branch?: string;
  readonly force?: boolean;
  readonly setUpstream?: boolean;
  readonly pushTags?: boolean;
  readonly customVariables?: Record<string, string>;
  readonly dryRun?: boolean;
}

export interface PushResult {
  readonly success: boolean;
  readonly remote: string;
  readonly branch: string;
  readonly pushedCommits: number;
  readonly error?: string;
  readonly sessionId: string;
}

export interface PushStatus {
  readonly canPush: boolean;
  readonly branchName: string;
  readonly remote: RemoteTracking | null;
  readonly hasUpstream: boolean;
  readonly aheadCount: number;
  readonly behindCount: number;
  readonly unpushedCommits: readonly UnpushedCommit[];
  readonly error?: string;
}

export interface RemoteTracking {
  readonly name: string;
  readonly url: string;
  readonly branch: string;
}
```

**Checklist**:
- [x] Define PushPromptContext interface
- [x] Define UnpushedCommit interface
- [x] Define PushRequest interface
- [x] Define PushResult interface
- [x] Define PushStatus interface
- [x] Define RemoteTracking interface
- [x] Export all types
- [x] Unit tests

### 2. Push Git Operations

#### src/server/git/push.ts

**Status**: COMPLETED

```typescript
function getPushStatus(cwd: string): Promise<PushStatus>;
function getUnpushedCommits(cwd: string): Promise<UnpushedCommit[]>;
function getRemotes(cwd: string): Promise<RemoteTracking[]>;
function getAheadBehind(cwd: string): Promise<{ ahead: number; behind: number }>;
```

**Checklist**:
- [x] Implement getPushStatus()
- [x] Implement getUnpushedCommits()
- [x] Implement getRemotes()
- [x] Implement getAheadBehind()
- [x] Unit tests

### 3. Push Executor

#### src/server/push/executor.ts

**Status**: COMPLETED

```typescript
export interface Remote {
  readonly name: string;
  readonly fetchUrl: string;
  readonly pushUrl: string;
}

export interface PushOptions {
  readonly remote?: string | undefined;
  readonly branch?: string | undefined;
  readonly force?: boolean | undefined;
  readonly setUpstream?: boolean | undefined;
  readonly pushTags?: boolean | undefined;
}

export function getPushStatus(cwd: string): Promise<PushStatus>;
export function getRemotes(cwd: string): Promise<Remote[]>;
export function buildContext(cwd: string, options?: PushOptions): Promise<PushPromptContext>;
export function executePush(cwd: string, options: PushOptions): Promise<PushResult>;
export function previewPush(context: PushPromptContext, promptId: string): Promise<string>;
```

**Checklist**:
- [x] Implement getPushStatus() - wraps git/push.ts
- [x] Implement getRemotes() - converts RemoteTracking[] to Remote[]
- [x] Implement buildContext() - builds PushPromptContext
- [x] Implement executePush() - executes git push with options
- [x] Implement previewPush() - generates prompt preview
- [x] Add Remote interface type
- [x] Unit tests (20 tests, all passing)

### 4. Push API Routes

#### src/server/routes/push.ts

**Status**: COMPLETED

```typescript
// POST /api/ctx/:id/push - Execute push with AI
// POST /api/ctx/:id/push/preview - Preview push (dry run)
// GET /api/ctx/:id/push/status - Get push status
// GET /api/ctx/:id/remotes - List remotes
function createPushRoutes(contextManager: ContextManager, deps?: PushRoutesDependencies): Hono;
```

**Checklist**:
- [x] Implement POST /api/ctx/:id/push
- [x] Implement POST /api/ctx/:id/push/preview
- [x] Implement GET /api/ctx/:id/push/status
- [x] Implement GET /api/ctx/:id/remotes
- [x] Dependency injection for testing
- [x] Unit tests (31 tests passing)

### 5. Push Store (Client)

#### client/src/stores/push.ts

**Status**: COMPLETED

```typescript
interface PushState {
  readonly isOpen: boolean;
  readonly pushStatus: PushStatus | null;
  readonly selectedTemplateId: string;
  readonly selectedRemote: string;
  readonly customVariables: Record<string, string>;
  readonly availableTemplates: readonly PromptTemplate[];
  readonly options: PushOptions;
  readonly status: 'idle' | 'loading' | 'pushing' | 'success' | 'error';
  readonly sessionId: string | null;
  readonly result: PushResult | null;
  readonly error: string | null;
}

interface PushOptions {
  readonly setUpstream: boolean;
  readonly pushTags: boolean;
  readonly force: boolean;
}

function createPushStore(): PushStore;
```

**Checklist**:
- [x] Implement push store
- [x] Add all actions
- [x] Connect to API
- [x] Integrate with session queue
- [x] Unit tests (47 tests passing)

### 6. Push UI Components

#### client/src/components/push/

**Status**: COMPLETED

**Files**:
- PushButton.svelte
- PushPanel.svelte
- UnpushedCommitsList.svelte
- RemoteSelector.svelte
- PushBehindWarning.svelte
- PushProgress.svelte
- PushSuccess.svelte

**Checklist**:
- [x] Create PushButton component
- [x] Create PushPanel component
- [x] Create UnpushedCommitsList component
- [x] Create RemoteSelector component
- [x] Create PushBehindWarning component
- [x] Create PushProgress component
- [x] Create PushSuccess component
- [x] Touch-friendly
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Push Context Types | `src/types/push-context.ts` | COMPLETED | 51/51 ✓ |
| Push Git Ops | `src/server/git/push.ts` | COMPLETED | 14/14 ✓ |
| Push Executor | `src/server/push/executor.ts` | COMPLETED | 20/20 ✓ |
| Push Routes | `src/server/routes/push.ts` | COMPLETED | 31/31 ✓ |
| Push Store | `client/src/stores/push.ts` | COMPLETED | 47/47 ✓ |
| Push UI | `client/src/components/push/` | COMPLETED | 152/152 ✓ |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| AI Push | 18-prompt-system | Ready |
| AI Push | 19-ai-commit | Ready |

## Completion Criteria

- [x] Push button shows unpushed count
- [x] Can select remote and branch
- [x] Behind warning shown when needed
- [x] Push executes via API routes
- [x] Force push requires confirmation
- [x] Type checking passes
- [x] Unit tests passing (315+ tests total)

## Progress Log

### Session: 2026-02-04 (Initial)
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-04 (TASK-001)
**Tasks Completed**: TASK-001 - Push Context Types
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented all push context types with full validation functions and comprehensive unit tests. All 51 tests passing.

### Session: 2026-02-04 (TASK-002)
**Tasks Completed**: TASK-002 - Push Git Operations
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented git operations for push status, unpushed commits, remotes, and ahead/behind counts. All functions follow the Bun.spawn pattern from staged.ts and commit-log.ts. Created comprehensive unit tests covering all functionality including edge cases for branches without upstream, multiple remotes, and behind status. All 14 tests passing.

### Session: 2026-02-04 (TASK-006)
**Tasks Completed**: TASK-006 - Push UI Components
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented all 7 push UI components (PushButton, PushPanel, UnpushedCommitsList, RemoteSelector, PushBehindWarning, PushProgress, PushSuccess) following CommitButton.svelte patterns. All components use Svelte 5 syntax with $props() and $derived(). Components are touch-friendly with 44px minimum height, use Tailwind CSS for styling, and include comprehensive animations. Created 152 unit tests covering all component functionality. All tests passing. Type checking passes without errors.

### Session: 2026-02-05 (TASK-003)
**Tasks Completed**: TASK-003 - Push Executor
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented Push Executor service following commit executor pattern. Added Remote interface type (distinct from RemoteTracking). Implemented getPushStatus() wrapper, getRemotes() with type conversion from RemoteTracking[] to Remote[], buildContext() for building PushPromptContext, executePush() for git push execution, and previewPush() for prompt preview. All functions follow the pattern from commit executor. Added comprehensive unit tests including tests for new getPushStatus() and getRemotes() functions. All 20 tests passing. Type checking passes without errors. Note: Session manager integration deferred to 18-prompt-system implementation as per design dependencies.

### Session: 2026-02-05 (TASK-004)
**Tasks Completed**: TASK-004 - Push API Routes
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented Push API Routes following commit routes pattern. Created createPushRoutes() factory with dependency injection for testing. Implemented all 4 endpoints: POST /:contextId (execute push), POST /:contextId/preview (dry run), GET /:contextId/status (push status), GET /:contextId/remotes (list remotes). Added validatePushRequest() function with comprehensive validation. All routes use ContextManager for context lookup and return proper error responses. Created comprehensive unit tests with mocked dependencies. All 31 tests passing. Type checking passes without errors. Plan COMPLETED - all 6 modules implemented.

## Related Plans

- **Depends On**: 18-prompt-system.md, 19-ai-commit.md
- **Next**: 21-github-integration.md
