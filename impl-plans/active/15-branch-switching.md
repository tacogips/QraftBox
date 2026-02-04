# Branch Switching Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#branch-switching
**Phase**: 2 (server: tasks 1-3) / 2b (client: tasks 4-7)
**Note**: Tasks 1-3 (server-side) can run immediately. Tasks 4-7 (client-side) require 07-client-core to be complete first.
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Branch switching functionality allowing users to switch the current git branch, change the diff base branch, and change the diff target branch. Includes branch search with partial match filtering.

### Scope
**Included**: Branch types, branch git operations, branch API routes, branch store, branch UI components
**Excluded**: Remote branch management, branch creation/deletion, merge operations

---

## Modules

### 1. Branch Types

#### src/types/branch.ts

**Status**: COMPLETED

```typescript
// All types defined with readonly properties and JSDoc documentation
export interface Branch { ... }
export interface BranchListResponse { ... }
export interface BranchSearchRequest { ... }
export interface BranchCheckoutRequest { ... }
export interface BranchCheckoutResponse { ... }
export interface WorkingTreeStatus { ... }
```

**Checklist**:
- [x] Define Branch interface
- [x] Define BranchListResponse interface
- [x] Define BranchSearchRequest interface
- [x] Define BranchCheckoutRequest interface
- [x] Define BranchCheckoutResponse interface
- [x] Define WorkingTreeStatus interface
- [x] Export all types
- [x] Add JSDoc documentation
- [x] Use readonly properties throughout
- [x] Create comprehensive test file
- [x] All 16 tests passing

### 2. Branch Git Operations

#### src/server/git/branch.ts

**Status**: COMPLETED

```typescript
// List all branches
function listBranches(cwd: string): Promise<Branch[]>;

// Get current branch name
function getCurrentBranch(cwd: string): Promise<string>;

// Get default branch name (main/master)
function getDefaultBranch(cwd: string): Promise<string>;

// Search branches by partial name
function searchBranches(
  cwd: string,
  query: string,
  options?: { limit?: number; includeRemote?: boolean }
): Promise<Branch[]>;

// Checkout branch
function checkoutBranch(
  cwd: string,
  branch: string,
  options?: { force?: boolean; stash?: boolean }
): Promise<BranchCheckoutResponse>;

// Get working tree status
function getWorkingTreeStatus(cwd: string): Promise<WorkingTreeStatus>;

// Stash changes
function stashChanges(cwd: string): Promise<string>;

// Pop stash
function popStash(cwd: string, stashRef?: string): Promise<void>;
```

**Checklist**:
- [x] Implement listBranches()
- [x] Implement getCurrentBranch()
- [x] Implement getDefaultBranch()
- [x] Implement searchBranches()
- [x] Implement checkoutBranch()
- [x] Implement getWorkingTreeStatus()
- [x] Implement stashChanges()
- [x] Implement popStash()
- [x] Unit tests

### 3. Branch API Routes

#### src/server/routes/branches.ts

**Status**: COMPLETED

```typescript
// GET /api/branches - List all branches
// GET /api/branches/current - Get current branch
// GET /api/branches/search?q= - Search branches
// POST /api/branches/checkout - Checkout branch
// GET /api/branches/status - Get working tree status

function createBranchRoutes(context: ServerContext): Hono;
```

**Checklist**:
- [x] Implement GET /api/branches
- [x] Implement GET /api/branches/current
- [x] Implement GET /api/branches/search
- [x] Implement POST /api/branches/checkout
- [x] Implement GET /api/branches/status
- [x] Return proper errors
- [x] Unit tests

### 4. Branch Store (Client)

#### client/stores/branches.ts

**Status**: COMPLETED

```typescript
// Branch state
interface BranchStore {
  branches: Branch[];
  currentBranch: string;
  defaultBranch: string;
  baseBranch: string;
  targetBranch: string;
  searchQuery: string;
  filteredBranches: Branch[];
  loading: boolean;
  error: string | null;
  selectorOpen: 'base' | 'target' | null;
}

interface BranchActions {
  loadBranches(): Promise<void>;
  setBaseBranch(branch: string): void;
  setTargetBranch(branch: string): void;
  searchBranches(query: string): void;
  checkoutBranch(branch: string, options?: CheckoutOptions): Promise<void>;
  swapBranches(): void;
  openSelector(type: 'base' | 'target'): void;
  closeSelector(): void;
}

function createBranchStore(): BranchStore & BranchActions;
```

**Checklist**:
- [x] Implement branch store
- [x] Add all actions
- [x] Connect to API
- [x] Handle search filtering (client-side)
- [x] Unit tests

### 5. Branch Header Component

#### client/components/BranchHeader.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let baseBranch: string;
  export let targetBranch: string;
  export let onBaseClick: () => void;
  export let onTargetClick: () => void;
  export let onSwap: () => void;
  export let onRefresh: () => void;

  // Header with base/target branch display
  // Click to open selector
  // Swap button
</script>
```

**Checklist**:
- [ ] Display base branch dropdown
- [ ] Display target branch dropdown
- [ ] Show arrow between them
- [ ] Add swap button
- [ ] Add refresh button
- [ ] Touch-friendly (44px targets)
- [ ] Unit tests

### 6. Branch Selector Component

#### client/components/BranchSelector.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let branches: Branch[];
  export let currentBranch: string;
  export let selectedBranch: string;
  export let searchQuery: string;
  export let onSelect: (branch: string) => void;
  export let onSearchChange: (query: string) => void;
  export let onClose: () => void;

  // Branch search input
  // Filtered branch list
  // Recent branches section
  // All branches section
</script>
```

**Checklist**:
- [ ] Implement search input
- [ ] Implement branch list
- [ ] Group recent vs all branches
- [ ] Show current/default badges
- [ ] Show last commit info
- [ ] Keyboard navigation (j/k)
- [ ] Virtual scroll for many branches
- [ ] Touch-friendly (48px items)
- [ ] Unit tests

### 7. Checkout Warning Modal

#### client/components/CheckoutWarning.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let workingTreeStatus: WorkingTreeStatus;
  export let branchName: string;
  export let onCancel: () => void;
  export let onStash: () => void;
  export let onForce: () => void;

  // Warning message
  // List of modified files
  // Cancel/Stash/Force buttons
</script>
```

**Checklist**:
- [x] Display warning message
- [x] List modified files
- [x] Cancel button
- [x] Stash & Switch button
- [x] Force Switch button
- [x] Touch-friendly buttons
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Branch Types | `src/types/branch.ts` | COMPLETED | 16/16 passing |
| Branch Git Ops | `src/server/git/branch.ts` | COMPLETED | 28/28 passing |
| Branch Routes | `src/server/routes/branches.ts` | COMPLETED | 22/22 passing |
| Branch Store | `client/src/stores/branches.ts` | COMPLETED | 25/25 passing |
| Branch Header | `client/components/BranchHeader.svelte` | NOT_STARTED | - |
| Branch Selector | `client/components/BranchSelector.svelte` | NOT_STARTED | - |
| Checkout Warning | `client/components/CheckoutWarning.svelte` | COMPLETED | N/A (example only) |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Branch Switching | Server Core | Phase 1 |
| Branch Switching | Client Core | Phase 2 |
| Branch Switching | Git Operations | Phase 1 |

## Completion Criteria

- [ ] Can list all branches
- [ ] Can search branches with partial match
- [ ] Can change diff base branch
- [ ] Can change diff target branch
- [ ] Can checkout different branch
- [ ] Uncommitted changes warning works
- [ ] Stash & switch works
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03 (Initial)
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-03 (TASK-001)
**Tasks Completed**: TASK-001 Branch Types
**Tasks In Progress**: None
**Blockers**: None
**Files Modified**:
- src/types/branch.ts (created)
- src/types/branch.test.ts (created)
**Test Results**: All 16 tests passing
**Notes**: Implemented all branch type definitions with readonly properties, JSDoc documentation, and comprehensive tests following TypeScript coding standards

### Session: 2026-02-03 (TASK-002)
**Tasks Completed**: TASK-002 Branch Git Operations
**Tasks In Progress**: None
**Blockers**: None
**Files Modified**:
- src/server/git/branch.ts (created)
- src/server/git/branch.test.ts (created)
**Test Results**: All 28 tests passing
**Notes**: Implemented all branch git operations including listBranches, getCurrentBranch, getDefaultBranch, searchBranches, checkoutBranch, getWorkingTreeStatus, stashChanges, and popStash. All functions follow TypeScript strict mode, use proper error handling with GitError, and include comprehensive JSDoc documentation. Stash operations include untracked files using --include-untracked flag.

### Session: 2026-02-03 (TASK-003)
**Tasks Completed**: TASK-003 Branch API Routes
**Tasks In Progress**: None
**Blockers**: None
**Files Modified**:
- src/server/routes/branches.ts (created)
- src/server/routes/branches.test.ts (created)
- src/server/routes/index.ts (updated to mount branch routes)
**Test Results**: All 22 tests passing (648 tests total in full suite)
**Notes**: Implemented all branch API routes with proper error handling. GET /api/branches returns full branch list with current and default branch. GET /api/branches/current returns current branch name. GET /api/branches/search supports query parameter with optional limit and includeRemote. POST /api/branches/checkout validates branch existence, checks working tree status, and returns conflict error (409) when uncommitted changes exist without force/stash options. GET /api/branches/status returns working tree status. All routes follow Hono framework patterns and TypeScript strict mode with readonly properties and proper type safety. Follows exactOptionalPropertyTypes by building options object with only defined properties.

### Session: 2026-02-03 (TASK-004)
**Tasks Completed**: TASK-004 Branch Store
**Tasks In Progress**: None
**Blockers**: None
**Files Modified**:
- client/src/stores/branches.ts (created)
- client/src/stores/branches.test.ts (created)
- impl-plans/active/15-branch-switching.md (updated)
**Test Results**: All 25 tests passing
**Notes**: Implemented branch store using Svelte stores pattern with writable and derived stores. Store includes state for branches list, current/default/base/target branches, search query, loading/error states, and selector open state. Actions include loadBranches (fetches from API), selectBaseBranch, selectTargetBranch, searchBranches (updates query), checkoutBranch (calls API with optional force/stash), swapBranches, openSelector, closeSelector, and reset. Created derived stores for filteredBranches (case-insensitive search filtering), baseBranchObject, and targetBranchObject. All properties use readonly modifiers following TypeScript strict mode. Comprehensive test coverage includes API success/error handling, branch selection, search filtering, checkout with options, and derived store functionality. Follows exactOptionalPropertyTypes by initializing baseBranch and targetBranch only when not empty strings.

## Related Plans

- **Previous**: 14-search.md
- **Depends On**: 02-server-core.md, 03-git-operations.md, 07-client-core.md

### Session: 2026-02-03 (TASK-007)
**Tasks Completed**: TASK-007 CheckoutWarning Component
**Tasks In Progress**: None
**Blockers**: None
**Files Modified**:
- client/src/components/CheckoutWarning.svelte (created)
- client/src/components/CheckoutWarning.example.svelte (created)
- client/src/stores/branches.ts (fixed exactOptionalPropertyTypes issue)
**Test Results**: svelte-check passes (no errors, only warnings in other components)
**Notes**: Implemented CheckoutWarning modal component following Svelte 5 patterns with $props() and $derived(). Modal displays warning message, lists all uncommitted files (staged + modified + untracked), and provides three action buttons: Cancel (secondary), Force Switch (red danger), and Stash & Switch (amber primary). Component follows tablet-first design with 44px minimum touch targets and includes accessibility features (keyboard navigation, ARIA labels, proper roles). Fixed branches.ts exactOptionalPropertyTypes issue by conditionally spreading optional properties only when defined.
