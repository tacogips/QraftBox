# Branch Switching Implementation Plan

**Status**: Ready
**Phase**: 11
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#branch-switching
**Replaces**: 15-branch-switching (SUPERSEDED, server-side tasks 1-3 only)
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Server-side branch operations including listing branches with metadata, searching branches, getting current branch, and performing branch checkout with uncommitted changes handling (stash/force).

### Scope
**Included**: Branch types, git branch operations (list, search, checkout), branch API routes
**Excluded**: Client-side branch UI components (already implemented in Plan 15 tasks 4-7 as client stores/components), diff base/target selection (client-side concern)

---

## Modules

### 1. Branch Types

#### src/types/branch.ts

**Status**: COMPLETED

```typescript
interface BranchInfo {
  readonly name: string;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly isRemote: boolean;
  readonly lastCommit: {
    readonly hash: string;
    readonly message: string;
    readonly author: string;
    readonly date: number;
  };
  readonly aheadBehind?: {
    readonly ahead: number;
    readonly behind: number;
  };
}

interface BranchListResponse {
  readonly branches: readonly BranchInfo[];
  readonly current: string;
  readonly defaultBranch: string;
}

interface BranchSearchRequest {
  readonly query: string;
  readonly limit?: number;
  readonly includeRemote?: boolean;
}

interface BranchCheckoutRequest {
  readonly branch: string;
  readonly force?: boolean;
  readonly stash?: boolean;
}

interface BranchCheckoutResponse {
  readonly success: boolean;
  readonly previousBranch: string;
  readonly currentBranch: string;
  readonly stashCreated?: string;
  readonly error?: string;
}
```

**Checklist**:
- [x] Define BranchInfo interface
- [x] Define BranchListResponse interface
- [x] Define BranchSearchRequest interface
- [x] Define BranchCheckoutRequest interface
- [x] Define BranchCheckoutResponse interface
- [x] Export all types
- [x] Unit tests for type validation helpers

---

### 2. Git Branch Operations

#### src/server/git/branch.ts

**Status**: COMPLETED

```typescript
function listBranches(projectPath: string, includeRemote?: boolean): Promise<readonly BranchInfo[]>;
function getCurrentBranch(projectPath: string): Promise<string>;
function getDefaultBranch(projectPath: string): Promise<string>;
function searchBranches(projectPath: string, query: string, limit?: number): Promise<readonly BranchInfo[]>;
function checkoutBranch(projectPath: string, request: BranchCheckoutRequest): Promise<BranchCheckoutResponse>;
function getAheadBehind(projectPath: string, branch: string, upstream?: string): Promise<{ ahead: number; behind: number }>;
```

**Checklist**:
- [x] listBranches via `git for-each-ref --format`
- [x] getCurrentBranch via `git rev-parse --abbrev-ref HEAD`
- [x] getDefaultBranch detecting main/master
- [x] searchBranches filtering by partial name match
- [x] checkoutBranch with stash/force support
- [x] getAheadBehind via `git rev-list --count`
- [x] Parse last commit info for each branch
- [x] Unit tests (28 tests)

---

### 3. Branch Routes

#### src/server/routes/branches.ts

**Status**: COMPLETED

```typescript
// GET /api/ctx/:contextId/branches
// Query params: ?includeRemote=false
// Response: BranchListResponse

// GET /api/ctx/:contextId/branches/search
// Query params: ?q=feature&limit=20&includeRemote=false
// Response: { results: BranchInfo[] }

// POST /api/ctx/:contextId/branches/checkout
// Body: BranchCheckoutRequest
// Response: BranchCheckoutResponse

function createBranchRoutes(): Hono;
```

**Checklist**:
- [x] GET /api/ctx/:id/branches listing all branches
- [x] GET /api/ctx/:id/branches/search with query filtering
- [x] POST /api/ctx/:id/branches/checkout with stash/force support
- [x] Error handling for checkout conflicts
- [x] Integration with git branch module
- [x] Unit tests (19 integration tests)

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Branch Types | `src/types/branch.ts` | COMPLETED | PASS (35 tests) |
| Git Branch Ops | `src/server/git/branch.ts` | COMPLETED | PASS (28 tests) |
| Branch Routes | `src/server/routes/branches.ts` | COMPLETED | PASS (19 tests) |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Branch Types | None | - |
| Git Branch Ops | Plan 26 (git executor) | NOT_STARTED |
| Branch Routes | Branch Types, Git Branch Ops | - |
| Must integrate with | Existing workspace context system | Exists |

## Completion Criteria

- [x] All 3 modules implemented (3/3 complete)
- [x] All tests passing (82 tests total: 35 types + 28 branch ops + 19 routes)
- [x] Type checking passes
- [x] Can list all local and optionally remote branches
- [x] Branch search filters correctly by partial name
- [x] Checkout works with clean working tree
- [x] Checkout handles uncommitted changes (stash/force options)
- [x] Error messages are clear for checkout failures

## Progress Log

### Session: 2026-02-07 03:00

**Task Completed**: TASK-001 Branch Types (Module 1)

**Files Created**:
- `src/types/branch.ts` - Type definitions for branch operations
- `src/types/branch.test.ts` - Comprehensive test suite (35 tests)

**Implementation Details**:
- Defined all required interfaces: BranchInfo, BranchListResponse, BranchSearchRequest, BranchCheckoutRequest, BranchCheckoutResponse
- Implemented helper functions: createBranchInfo, createCheckoutSuccess, createCheckoutFailure, isValidBranchName
- All interfaces use readonly fields following project standards
- Optional properties use `prop?: type | undefined` for exactOptionalPropertyTypes
- Comprehensive JSDoc comments on all exports
- isValidBranchName validates according to git naming rules (rejects spaces, .., ~, ^, :, ?, *, [, \, @{, etc.)

**Tests**:
- All 35 tests passing
- 73 expect() assertions
- Tests cover: factory functions, validation, type safety, edge cases
- Code formatted with prettier

**Next Steps**:
- TASK-002: Implement Git Branch Operations (src/server/git/branch.ts)
- TASK-003: Implement Branch Routes (src/server/routes/branches.ts)

---

### Session: 2026-02-07 04:30

**Task Completed**: TASK-002 Git Branch Operations (Module 2)

**Files Created**:
- `src/server/git/branch.ts` - Git branch operations implementation (458 lines)
- `src/server/git/branch.test.ts` - Comprehensive test suite (28 tests)

**Implementation Details**:
- Implemented 6 functions: listBranches, getCurrentBranch, getDefaultBranch, searchBranches, checkoutBranch, getAheadBehind
- Uses `git for-each-ref` for branch listing (more efficient than `git branch -a --format`)
- Parses commit metadata: hash, message, author, date for each branch
- getCurrentBranch detects and rejects detached HEAD state
- getDefaultBranch uses multi-step detection:
  1. Check `git symbolic-ref refs/remotes/origin/HEAD`
  2. Fallback to 'main' if it exists
  3. Fallback to 'master' if it exists
  4. Ultimate fallback to current branch
- searchBranches supports case-insensitive partial matching with configurable limit (default: 20)
- checkoutBranch supports:
  - Automatic stashing with `git stash push -m "auto-stash before checkout"`
  - Force checkout with `--force` flag
  - Returns stash reference (e.g., `stash@{0}`) when stash is created
  - Comprehensive error handling with descriptive messages
- getAheadBehind auto-detects upstream or accepts explicit upstream parameter
- All functions use execGit from ./executor.ts
- All parameters and return types are readonly following project standards
- Comprehensive JSDoc comments on all exports

**Tests**:
- All 28 tests passing
- 59 expect() assertions
- Tests use real temporary git repositories (integration tests)
- Test coverage:
  - getCurrentBranch: normal operation, after checkout, detached HEAD error
  - getDefaultBranch: main exists, master exists, custom branch
  - listBranches: single branch, multiple branches, current branch marking, last commit info, remote branch handling
  - searchBranches: partial match, case-insensitive, no matches, limit parameter, default limit
  - checkoutBranch: successful checkout, non-existent branch, stash option, force option, no uncommitted changes
  - getAheadBehind: no divergence, commits ahead, commits behind, both ahead and behind, no upstream error, explicit upstream
- Code formatted with prettier

**Next Steps**:
- TASK-003: Implement Branch Routes (src/server/routes/branches.ts)

---

### Session: 2026-02-07 05:50

**Task Completed**: TASK-003 Branch Routes (Module 3)

**Files Created**:
- `src/server/routes/branches.ts` - Hono routes for branch operations (289 lines)
- `src/server/routes/branches.test.ts` - Integration test suite (19 tests)

**Implementation Details**:
- Implemented 3 endpoints following same pattern as diff.ts:
  - GET / - List all branches with metadata
  - GET /search - Search branches by partial name match
  - POST /checkout - Checkout branch with uncommitted changes handling
- Routes accept optional ServerContext parameter or extract from Hono context variables
- Error handling returns { error, code } format consistently
- Supports includeRemote query parameter for branch listing (default: false)
- Search endpoint validates query parameter and limit (default: 20, minimum: 1)
- Checkout endpoint validates branch name and handles JSON parsing errors
- Returns appropriate HTTP status codes: 200 (success), 400 (client error), 500 (server error)
- All parameters and return types are readonly following project standards
- Comprehensive JSDoc comments on all exports

**Tests**:
- All 19 tests passing with 77 expect() assertions
- Integration tests using real temporary git repositories
- Test coverage:
  - GET /: branch list with metadata, current/default branch marking, error handling
  - GET /search: query filtering, limit parameter, empty results, validation errors
  - POST /checkout: successful checkout, stash option, force option, error handling
  - Validates all error cases: missing parameters, invalid input, non-existent branches, conflicts
- Code formatted with prettier
- Type checking passes

**Total Implementation**:
- 3 modules completed
- 82 tests passing (35 types + 28 branch ops + 19 routes)
- All completion criteria met

## Related Plans

- **Replaces**: 15-branch-switching server-side tasks (SUPERSEDED - source files never existed)
- **Depends On**: Plan 26 (git executor)
- **Related**: Plan 15 client-side tasks (stores, components) exist but server was missing
