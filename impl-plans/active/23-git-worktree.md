# Git Worktree Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-git-worktree.md
**Phase**: 9
**Created**: 2026-02-05
**Last Updated**: 2026-02-05
**Completed**: 2026-02-05

---

## Design Document Reference

**Source**: design-docs/specs/design-git-worktree.md

### Summary

Git worktree support for aynd: create worktrees with consistent path convention, detect repository type (main/worktree/bare/not-git), navigate between worktrees and main repository. **Key feature**: When in a worktree, user can navigate back to the original main repository using the stored `mainRepositoryPath`.

### Scope

**Included**: Worktree types, git operations, context manager fix, API routes, workspace integration, bidirectional navigation (worktree <-> main repo)
**Excluded**: Client UI components (future plan)

---

## Modules

### 1. Worktree Types

#### src/types/worktree.ts

**Status**: NOT_STARTED

```typescript
export type RepositoryType = "main" | "worktree" | "bare" | "not-git";

export interface WorktreeInfo {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly isMain: boolean;
  readonly locked: boolean;
  readonly prunable: boolean;
  readonly mainRepositoryPath: string; // Path to main repo (for navigation)
}

export interface RepositoryDetectionResult {
  readonly type: RepositoryType;
  readonly path: string;
  readonly gitDir: string | null;
  readonly mainRepositoryPath: string | null;
  readonly worktreeName: string | null;
}

export interface CreateWorktreeRequest {
  readonly branch: string;
  readonly worktreeName?: string;
  readonly createBranch?: boolean;
  readonly baseBranch?: string;
  readonly customPath?: string;
}

export interface CreateWorktreeResult {
  readonly success: boolean;
  readonly path: string;
  readonly branch: string;
  readonly error?: string;
}

export interface RemoveWorktreeResult {
  readonly success: boolean;
  readonly removed: boolean;
  readonly error?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

// Utility functions
export function encodeProjectPath(projectPath: string): string;
export function decodeProjectPath(encoded: string): string;
export function generateDefaultWorktreePath(
  projectPath: string,
  worktreeName: string,
): string;
export function validateWorktreeName(name: string): ValidationResult;
```

**Checklist**:

- [ ] Define RepositoryType type
- [ ] Define WorktreeInfo interface
- [ ] Define RepositoryDetectionResult interface
- [ ] Define CreateWorktreeRequest interface
- [ ] Define CreateWorktreeResult interface
- [ ] Define RemoveWorktreeResult interface
- [ ] Implement encodeProjectPath()
- [ ] Implement decodeProjectPath()
- [ ] Implement generateDefaultWorktreePath()
- [ ] Implement validateWorktreeName()
- [ ] Export all types
- [ ] Unit tests

### 2. Workspace Types Extension

#### src/types/workspace.ts

**Status**: NOT_STARTED

Extend existing WorkspaceTab interface:

```typescript
export interface WorkspaceTab {
  readonly id: ContextId;
  readonly path: string;
  readonly name: string;
  readonly repositoryRoot: string;
  readonly isGitRepo: boolean;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
  // NEW: Worktree fields
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly worktreeName: string | null;
}

// Update createWorkspaceTab signature
export function createWorkspaceTab(
  path: string,
  name: string,
  repositoryRoot: string,
  isGitRepo: boolean,
  isWorktree?: boolean,
  mainRepositoryPath?: string | null,
  worktreeName?: string | null,
): WorkspaceTab;
```

**Checklist**:

- [ ] Add isWorktree to WorkspaceTab
- [ ] Add mainRepositoryPath to WorkspaceTab
- [ ] Add worktreeName to WorkspaceTab
- [ ] Update createWorkspaceTab() signature
- [ ] Update existing tests
- [ ] Add new tests for worktree fields

### 3. Git Worktree Operations

#### src/server/git/worktree.ts

**Status**: NOT_STARTED

```typescript
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  );
}

// Detection
export async function detectRepositoryType(dirPath: string): Promise<RepositoryDetectionResult>;
export async function isWorktree(dirPath: string): Promise<boolean>;
export async function isMainRepository(dirPath: string): Promise<boolean>;
export async function getMainRepositoryPath(worktreePath: string): Promise<string | null>;

// CRUD operations
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]>;
export async function createWorktree(cwd: string, request: CreateWorktreeRequest): Promise<CreateWorktreeResult>;
export async function removeWorktree(cwd: string, path: string, force?: boolean): Promise<RemoveWorktreeResult>;

// Utilities
export async function ensureWorktreeBaseDir(): Promise<string>;
export function getWorktreePathConfig(projectPath: string, worktreeName: string): {
  basePath: string;
  fullPath: string;
};
```

**Checklist**:

- [ ] Implement WorktreeError class
- [ ] Implement detectRepositoryType()
- [ ] Implement isWorktree()
- [ ] Implement isMainRepository()
- [ ] Implement getMainRepositoryPath()
- [ ] Implement listWorktrees() - parse `git worktree list --porcelain`
- [ ] Implement createWorktree() - run `git worktree add`
- [ ] Implement removeWorktree() - run `git worktree remove`
- [ ] Implement ensureWorktreeBaseDir()
- [ ] Implement getWorktreePathConfig()
- [ ] Unit tests for detection
- [ ] Unit tests for CRUD operations

### 4. Context Manager Fix

#### src/server/workspace/context-manager.ts

**Status**: NOT_STARTED

Fix `isGitRepository()` function to recognize worktrees:

```typescript
// Current (broken for worktrees):
async function isGitRepository(dirPath: string): Promise<boolean> {
  const gitPath = resolve(dirPath, ".git");
  const stats = await stat(gitPath);
  return stats.isDirectory();
}

// New (supports worktrees):
async function isGitRepository(dirPath: string): Promise<boolean> {
  const gitPath = resolve(dirPath, ".git");
  const stats = await stat(gitPath);

  if (stats.isDirectory()) return true; // Main repo

  if (stats.isFile()) {
    const content = await readFile(gitPath, "utf-8");
    return content.startsWith("gitdir:"); // Worktree
  }

  return false;
}
```

Extend `DirectoryValidation` interface:

```typescript
export interface DirectoryValidation {
  readonly valid: boolean;
  readonly path: string;
  readonly isGitRepo: boolean;
  readonly repositoryRoot?: string | undefined;
  readonly error?: string | undefined;
  // NEW: Worktree fields
  readonly isWorktree: boolean;
  readonly mainRepositoryPath?: string | undefined;
}
```

**Checklist**:

- [ ] Fix isGitRepository() to handle worktrees
- [ ] Add isWorktree field to DirectoryValidation
- [ ] Add mainRepositoryPath field to DirectoryValidation
- [ ] Update validateDirectory() to detect worktrees
- [ ] Update createContext() to populate worktree info
- [ ] Unit tests for worktree detection
- [ ] Unit tests for worktree context creation

### 5. Worktree API Routes

#### src/server/routes/worktree.ts

**Status**: NOT_STARTED

```typescript
// GET /api/ctx/:id/worktree - List all worktrees
// GET /api/ctx/:id/worktree/detect - Detect current repo type
// GET /api/ctx/:id/worktree/main - Get main repository path (for navigation back)
// GET /api/worktree/default-path?projectPath=&name= - Get default path
// POST /api/ctx/:id/worktree - Create worktree
// DELETE /api/ctx/:id/worktree?path= - Remove worktree

export interface WorktreeRoutesDependencies {
  readonly detectRepositoryType: typeof detectRepositoryType;
  readonly listWorktrees: typeof listWorktrees;
  readonly createWorktree: typeof createWorktree;
  readonly removeWorktree: typeof removeWorktree;
  readonly generateDefaultWorktreePath: typeof generateDefaultWorktreePath;
  readonly getMainRepositoryPath: typeof getMainRepositoryPath;
}

export function createWorktreeRoutes(
  contextManager: ContextManager,
  deps?: WorktreeRoutesDependencies,
): Hono;
```

**Response Types**:

```typescript
interface WorktreeListResponse {
  readonly worktrees: readonly WorktreeInfo[];
  readonly mainRepository: string;
}

interface DetectResponse {
  readonly detection: RepositoryDetectionResult;
}

interface DefaultPathResponse {
  readonly path: string;
  readonly exists: boolean;
}

// NEW: For navigation from worktree back to main repository
interface MainRepositoryResponse {
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly mainRepositoryName: string | null;
}
```

**Checklist**:

- [ ] Implement GET /:contextId (list worktrees)
- [ ] Implement GET /:contextId/detect (detect repo type)
- [ ] Implement GET /:contextId/main (get main repository for navigation)
- [ ] Implement GET /default-path (get default path)
- [ ] Implement POST /:contextId (create worktree)
- [ ] Implement DELETE /:contextId (remove worktree)
- [ ] Request validation
- [ ] Error handling
- [ ] Dependency injection for testing
- [ ] Unit tests for all endpoints

---

## Module Status

| Module              | File Path                                 | Status    | Tests           |
| ------------------- | ----------------------------------------- | --------- | --------------- |
| Worktree Types      | `src/types/worktree.ts`                   | COMPLETED | Pass (41 tests) |
| Workspace Extension | `src/types/workspace.ts`                  | COMPLETED | Pass (72 tests) |
| Git Worktree Ops    | `src/server/git/worktree.ts`              | COMPLETED | Pass (26 tests) |
| Context Manager     | `src/server/workspace/context-manager.ts` | COMPLETED | Pass (47 tests) |
| Worktree Routes     | `src/server/routes/worktree.ts`           | COMPLETED | Pass (32 tests) |

---

## Tasks

### TASK-001: Worktree Types

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/worktree.ts`, `src/types/worktree.test.ts`
**Dependencies**: None

**Description**:
Create worktree types and utility functions: RepositoryType, WorktreeInfo, RepositoryDetectionResult, CreateWorktreeRequest, CreateWorktreeResult, RemoveWorktreeResult, ValidationResult. Implement encodeProjectPath(), decodeProjectPath(), generateDefaultWorktreePath(), validateWorktreeName().

**Completion Criteria**:

- [x] All types defined
- [x] All utility functions implemented
- [x] Unit tests passing (41 tests, 94 assertions)
- [x] Type checking passes

### TASK-002: Workspace Types Extension

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `src/types/workspace.ts` (modified)
**Dependencies**: None

**Description**:
Extend WorkspaceTab interface with isWorktree, mainRepositoryPath, worktreeName fields. Update createWorkspaceTab() function signature to accept optional worktree parameters.

**Completion Criteria**:

- [x] WorkspaceTab extended
- [x] createWorkspaceTab() updated
- [x] Existing tests updated (3 test files fixed)
- [x] New tests added (6 new tests for worktree support)
- [x] Type checking passes

### TASK-003: Git Worktree Operations

**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src/server/git/worktree.ts`, `src/server/git/worktree.test.ts`
**Dependencies**: TASK-001

**Description**:
Implement git worktree operations: WorktreeError class, detectRepositoryType(), isWorktree(), isMainRepository(), getMainRepositoryPath(), listWorktrees(), createWorktree(), removeWorktree(), ensureWorktreeBaseDir(), getWorktreePathConfig().

**Completion Criteria**:

- [x] All functions implemented
- [x] Detection logic correct
- [x] CRUD operations working
- [x] Unit tests passing (26 tests, 73 assertions)
- [x] Type checking passes

### TASK-004: Context Manager Fix

**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src/server/workspace/context-manager.ts` (modified)
**Dependencies**: TASK-003

**Description**:
Fix isGitRepository() to recognize worktrees. Extend DirectoryValidation with isWorktree and mainRepositoryPath. Update validateDirectory() and createContext() to handle worktrees.

**Completion Criteria**:

- [x] isGitRepository() handles worktrees
- [x] DirectoryValidation extended
- [x] validateDirectory() detects worktrees
- [x] createContext() populates worktree info
- [x] Unit tests passing (47 tests, 130 assertions)
- [x] Type checking passes

### TASK-005: Worktree API Routes

**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src/server/routes/worktree.ts`, `src/server/routes/worktree.test.ts`
**Dependencies**: TASK-003, TASK-004

**Description**:
Create REST endpoints for worktree operations:

- GET /:id/worktree (list worktrees)
- GET /:id/worktree/detect (detect repo type)
- GET /:id/worktree/main (get main repository path for navigation back from worktree)
- GET /default-path (get default worktree path)
- POST /:id/worktree (create worktree)
- DELETE /:id/worktree (remove worktree)

Use dependency injection for testing. The `/main` endpoint is critical for enabling navigation from a worktree back to its parent main repository.

**Completion Criteria**:

- [x] All 6 endpoints implemented
- [x] /main endpoint returns mainRepositoryPath for worktrees
- [x] Request validation
- [x] Error handling
- [x] Unit tests passing (32 tests, 74 assertions)
- [x] Type checking passes

---

## Dependencies

| Feature            | Depends On         | Status  |
| ------------------ | ------------------ | ------- |
| TASK-003           | TASK-001           | Blocked |
| TASK-004           | TASK-003           | Blocked |
| TASK-005           | TASK-003, TASK-004 | Blocked |
| TASK-001, TASK-002 | None               | Ready   |

---

## Completion Criteria

- [x] Worktree types defined with validation
- [x] Workspace tab extended with worktree fields (isWorktree, mainRepositoryPath, worktreeName)
- [x] Git worktree operations implemented
- [x] Context manager recognizes worktrees as valid git repos
- [x] API routes implemented (including /main endpoint for navigation)
- [x] Navigation from worktree to main repository works via mainRepositoryPath
- [x] All tests passing (2218 total, including 32 worktree route tests)
- [x] Type checking passes

---

## Progress Log

### Session: 2026-02-05 (Initial)

**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-05 (Update)

**Tasks Completed**: Design update
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Added W8/W9 requirements for bidirectional navigation. Added GET /worktree/main endpoint for navigating from worktree back to main repository. Updated WorktreeInfo to include mainRepositoryPath. Key feature: when a worktree is selected as working directory, user can navigate back to original main repository.

### Session: 2026-02-05 (Implementation)

**Tasks Completed**: TASK-001, TASK-002
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- TASK-001: Implemented all worktree types and utility functions (RepositoryType, WorktreeInfo, RepositoryDetectionResult, CreateWorktreeRequest, CreateWorktreeResult, RemoveWorktreeResult, ValidationResult)
- TASK-001: Implemented encodeProjectPath(), decodeProjectPath(), generateDefaultWorktreePath(), validateWorktreeName()
- TASK-001: Created comprehensive tests (41 tests, 94 assertions)
- TASK-002: Extended WorkspaceTab interface with isWorktree, mainRepositoryPath, worktreeName fields
- TASK-002: Updated createWorkspaceTab() signature with optional worktree parameters
- TASK-002: Fixed type errors in existing test files (context.test.ts, commit.test.ts, push.test.ts)
- TASK-002: Added 6 new tests for worktree support (total 72 tests)
- All tests passing, type checking passes

### Session: 2026-02-05 (TASK-003 Implementation)

**Tasks Completed**: TASK-003
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- TASK-003: Implemented WorktreeError class extending Error
- TASK-003: Implemented detectRepositoryType() - detects main/worktree/bare/not-git repository types
- TASK-003: Implemented isWorktree() and isMainRepository() detection functions
- TASK-003: Implemented getMainRepositoryPath() - extracts main repo path from worktree .git file
- TASK-003: Implemented listWorktrees() - parses `git worktree list --porcelain` output
- TASK-003: Implemented createWorktree() - validates name, generates path, runs git worktree add
- TASK-003: Implemented removeWorktree() - handles force flag, runs git worktree remove
- TASK-003: Implemented ensureWorktreeBaseDir() - creates ~/.local/aynd/worktrees/
- TASK-003: Implemented getWorktreePathConfig() - computes encoded paths
- TASK-003: Created comprehensive tests (26 tests, 73 assertions)
- TASK-003: All tests passing, type checking passes
- Full test suite: 2093 tests pass (including new 26 worktree tests)

### Session: 2026-02-05 17:29 (TASK-004 Implementation)

**Tasks Completed**: TASK-004
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- TASK-004: Updated isGitRepository() to detect worktrees (checks both .git directory and .git file with gitdir)
- TASK-004: Extended DirectoryValidation interface with isWorktree and mainRepositoryPath fields
- TASK-004: Updated validateDirectory() to call detectRepositoryType() and populate worktree metadata
- TASK-004: Updated createContext() to call detectRepositoryType() and pass worktree info to createWorkspaceTab()
- TASK-004: Fixed test mocks in context.test.ts, commit.test.ts, push.test.ts to include isWorktree field
- TASK-004: Added 7 new worktree tests in context-manager.test.ts (total 47 tests, 130 assertions)
- TASK-004: Tests verify worktree detection, metadata extraction, and differentiation from main repos
- TASK-004: All tests passing (2100 total), type checking passes
- Context manager now correctly recognizes git worktrees as valid git repositories

### Session: 2026-02-05 17:41 (TASK-005 Implementation)

**Tasks Completed**: TASK-005
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- TASK-005: Implemented all 6 REST API endpoints with Hono router
- TASK-005: GET /:id/worktree - Lists all worktrees for a context (returns WorktreeListResponse)
- TASK-005: GET /:id/worktree/detect - Detects repository type (main/worktree/bare/not-git)
- TASK-005: GET /:id/worktree/main - Gets main repository path for worktrees (enables navigation back)
- TASK-005: GET /default-path - Returns default worktree path with exists flag (query params: projectPath, name)
- TASK-005: POST /:id/worktree - Creates new worktree (body: CreateWorktreeRequest)
- TASK-005: DELETE /:id/worktree - Removes worktree (query params: path, force)
- TASK-005: Implemented dependency injection pattern (WorktreeRoutesDependencies) for testing
- TASK-005: Request validation for all inputs (context ID, query params, request body)
- TASK-005: Error handling with appropriate HTTP status codes (200, 400, 404, 500)
- TASK-005: WorktreeError handling from git operations
- TASK-005: Created comprehensive unit tests (32 tests, 74 assertions)
- TASK-005: Tests cover all endpoints with success and error cases
- TASK-005: Tests verify invalid context ID, non-existent context, git errors, validation errors
- TASK-005: All tests passing (2218 total), type checking passes
- Git worktree API routes fully implemented and tested

---

## Related Plans

- **Depends On**: 17-multi-directory-workspace.md
- **Previous Phase**: Phase 8 (21-github-integration, 22-ai-pr)
