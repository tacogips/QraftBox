# Branch Switching Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#branch-switching
**Phase**: 2
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

**Status**: NOT_STARTED

```typescript
// Branch information
interface Branch {
  name: string;
  isCurrent: boolean;
  isDefault: boolean;
  isRemote: boolean;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: number;
  };
  aheadBehind?: {
    ahead: number;
    behind: number;
  };
}

interface BranchListResponse {
  branches: Branch[];
  current: string;
  default: string;
}

interface BranchSearchRequest {
  query: string;
  limit?: number;
  includeRemote?: boolean;
}

interface BranchCheckoutRequest {
  branch: string;
  force?: boolean;
  stash?: boolean;
}

interface BranchCheckoutResponse {
  success: boolean;
  previousBranch: string;
  currentBranch: string;
  stashCreated?: string;
  error?: string;
}

interface WorkingTreeStatus {
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicts: string[];
}
```

**Checklist**:
- [ ] Define Branch interface
- [ ] Define BranchListResponse interface
- [ ] Define BranchSearchRequest interface
- [ ] Define BranchCheckoutRequest interface
- [ ] Define BranchCheckoutResponse interface
- [ ] Define WorkingTreeStatus interface
- [ ] Export all types

### 2. Branch Git Operations

#### src/server/git/branch.ts

**Status**: NOT_STARTED

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
- [ ] Implement listBranches()
- [ ] Implement getCurrentBranch()
- [ ] Implement getDefaultBranch()
- [ ] Implement searchBranches()
- [ ] Implement checkoutBranch()
- [ ] Implement getWorkingTreeStatus()
- [ ] Implement stashChanges()
- [ ] Implement popStash()
- [ ] Unit tests

### 3. Branch API Routes

#### src/server/routes/branches.ts

**Status**: NOT_STARTED

```typescript
// GET /api/branches - List all branches
// GET /api/branches/current - Get current branch
// GET /api/branches/search?q= - Search branches
// POST /api/branches/checkout - Checkout branch
// GET /api/status - Get working tree status

function createBranchRoutes(context: ServerContext): Hono;
```

**Checklist**:
- [ ] Implement GET /api/branches
- [ ] Implement GET /api/branches/current
- [ ] Implement GET /api/branches/search
- [ ] Implement POST /api/branches/checkout
- [ ] Implement GET /api/status
- [ ] Return proper errors
- [ ] Unit tests

### 4. Branch Store (Client)

#### client/stores/branches.ts

**Status**: NOT_STARTED

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
- [ ] Implement branch store
- [ ] Add all actions
- [ ] Connect to API
- [ ] Handle search filtering (client-side)
- [ ] Unit tests

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

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let status: WorkingTreeStatus;
  export let targetBranch: string;
  export let onCancel: () => void;
  export let onStashAndSwitch: () => void;
  export let onForceSwitch: () => void;

  // Warning message
  // List of modified files
  // Cancel/Stash/Force buttons
</script>
```

**Checklist**:
- [ ] Display warning message
- [ ] List modified files
- [ ] Cancel button
- [ ] Stash & Switch button
- [ ] Force Switch button
- [ ] Touch-friendly buttons
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Branch Types | `src/types/branch.ts` | NOT_STARTED | - |
| Branch Git Ops | `src/server/git/branch.ts` | NOT_STARTED | - |
| Branch Routes | `src/server/routes/branches.ts` | NOT_STARTED | - |
| Branch Store | `client/stores/branches.ts` | NOT_STARTED | - |
| Branch Header | `client/components/BranchHeader.svelte` | NOT_STARTED | - |
| Branch Selector | `client/components/BranchSelector.svelte` | NOT_STARTED | - |
| Checkout Warning | `client/components/CheckoutWarning.svelte` | NOT_STARTED | - |

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

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 14-search.md
- **Depends On**: 02-server-core.md, 03-git-operations.md, 07-client-core.md
