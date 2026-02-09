# Git Worktree Support Design Specification

## Overview

Add git worktree support to qraftbox to enable working with multiple branches simultaneously in separate directories. This feature provides:
1. Create worktrees with a consistent default path structure
2. Detect whether current directory is a worktree or main repository
3. Navigate between worktrees and main repository

## Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| W1 | Create worktrees with default path convention | Must |
| W2 | Detect repository type (main/worktree/bare/not-git) | Must |
| W3 | Provide main repository path when in worktree | Must |
| W4 | List all worktrees for a repository | Must |
| W5 | Remove worktrees via API | Must |
| W6 | Extend workspace tab with worktree information | Must |
| W7 | Fix context-manager to recognize worktrees as valid git repos | Must |
| W8 | Navigate back from worktree to main repository | Must |
| W9 | Track bidirectional relationship (worktree <-> main repo) | Must |

## Path Encoding Strategy

### Default Worktree Location

Worktrees are stored under a consistent path structure:
```
~/.local/qraftbox/worktrees/{encoded_project_path}/{worktree_name}
```

### Path Encoding

Project paths are converted using double underscore replacement to create filesystem-safe directory names:

| Original Path | Encoded Name |
|---------------|--------------|
| `/home/user/projects/my-app` | `home__user__projects__my-app` |
| `/g/gits/tacogips/qraftbox` | `g__gits__tacogips__qraftbox` |

**Encoding Rules**:
- Leading `/` is removed
- All `/` are replaced with `__`
- Decode reverses: replace `__` with `/`, prepend `/`

### Full Worktree Path Example

```
Main repo: /home/user/projects/my-app
Worktree for branch "feature-auth":
  ~/.local/qraftbox/worktrees/home__user__projects__my-app/feature-auth
```

## Worktree Detection Logic

Git worktrees have a `.git` **file** (not directory) containing:
```
gitdir: /path/to/main/repo/.git/worktrees/<worktree-name>
```

### Detection Algorithm

```
1. Check if `.git` exists at path
2. If `.git` is a directory -> Main repository
3. If `.git` is a file:
   a. Read content
   b. If starts with "gitdir:" -> Worktree
   c. Parse gitdir path to extract main repository location
4. If no `.git` -> Not a git repository (or traverse up for nested dirs)
```

### Repository Types

| Type | `.git` | Description |
|------|--------|-------------|
| `main` | Directory | Standard git repository |
| `worktree` | File with gitdir | Git worktree |
| `bare` | Directory (no working tree) | Bare repository |
| `not-git` | None | Not a git repository |

## Data Models

### RepositoryType

```typescript
type RepositoryType = 'main' | 'worktree' | 'bare' | 'not-git';
```

### WorktreeInfo

```typescript
interface WorktreeInfo {
  readonly path: string;           // Worktree directory path
  readonly head: string;           // Current HEAD commit hash
  readonly branch: string | null;  // Branch name (null if detached)
  readonly isMain: boolean;        // Is this the main worktree
  readonly locked: boolean;        // Is worktree locked
  readonly prunable: boolean;      // Can be pruned
}
```

### RepositoryDetectionResult

```typescript
interface RepositoryDetectionResult {
  readonly type: RepositoryType;
  readonly path: string;                    // Resolved directory path
  readonly gitDir: string | null;           // Path to .git directory
  readonly mainRepositoryPath: string | null; // Main repo path (for worktrees)
  readonly worktreeName: string | null;     // Worktree name (for worktrees)
}
```

### CreateWorktreeRequest

```typescript
interface CreateWorktreeRequest {
  readonly branch: string;              // Branch to checkout
  readonly worktreeName?: string;       // Custom name (defaults to branch name)
  readonly createBranch?: boolean;      // Create branch if not exists
  readonly baseBranch?: string;         // Base for new branch
  readonly customPath?: string;         // Override default path
}
```

### CreateWorktreeResult

```typescript
interface CreateWorktreeResult {
  readonly success: boolean;
  readonly path: string;                // Created worktree path
  readonly branch: string;              // Checked out branch
  readonly error?: string;
}
```

### RemoveWorktreeResult

```typescript
interface RemoveWorktreeResult {
  readonly success: boolean;
  readonly removed: boolean;
  readonly error?: string;
}
```

## API Design

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ctx/:id/worktree` | List all worktrees |
| GET | `/api/ctx/:id/worktree/detect` | Detect current repo type |
| GET | `/api/ctx/:id/worktree/main` | Get main repository path (for navigation from worktree) |
| GET | `/api/worktree/default-path` | Get default path for new worktree |
| POST | `/api/ctx/:id/worktree` | Create worktree |
| DELETE | `/api/ctx/:id/worktree` | Remove worktree |

### Query Parameters

| Endpoint | Parameter | Description |
|----------|-----------|-------------|
| `/api/worktree/default-path` | `projectPath` | Project root path |
| `/api/worktree/default-path` | `name` | Worktree name |
| DELETE `/api/ctx/:id/worktree` | `path` | Worktree path to remove |
| DELETE `/api/ctx/:id/worktree` | `force` | Force removal (optional) |

### Response Types

**GET /api/ctx/:id/worktree**
```typescript
interface WorktreeListResponse {
  readonly worktrees: readonly WorktreeInfo[];
  readonly mainRepository: string;
}
```

**GET /api/ctx/:id/worktree/detect**
```typescript
interface DetectResponse {
  readonly detection: RepositoryDetectionResult;
}
```

**GET /api/worktree/default-path**
```typescript
interface DefaultPathResponse {
  readonly path: string;
  readonly exists: boolean;
}
```

**POST /api/ctx/:id/worktree**
```typescript
// Request body: CreateWorktreeRequest
// Response: CreateWorktreeResult
```

## Workspace Integration

### Extended WorkspaceTab

Add worktree fields to existing WorkspaceTab interface:

```typescript
interface WorkspaceTab {
  // ... existing fields
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly worktreeName: string | null;
}
```

### Extended DirectoryValidation

Add worktree fields to DirectoryValidation in context-manager:

```typescript
interface DirectoryValidation {
  // ... existing fields
  readonly isWorktree: boolean;
  readonly mainRepositoryPath?: string;
}
```

## Navigation Between Worktree and Main Repository

### Use Case

When a user opens a worktree directory as a workspace tab:
1. The working directory becomes the worktree path
2. The user should be able to navigate back to the original (main) git repository
3. The relationship between worktree and main repository must be preserved

### Navigation Flow

```
Main Repository (/home/user/projects/my-app)
    |
    +-- [Create Worktree] --> Worktree (/home/user/.local/qraftbox/worktrees/.../feature-auth)
    |                              |
    +-- [List Worktrees]           +-- [Go to Main Repository] --> Main Repository
    |                              |
    +-- [Open Worktree Tab]        +-- mainRepositoryPath = "/home/user/projects/my-app"
```

### Bidirectional Relationship

| Current Location | Available Actions |
|------------------|-------------------|
| Main Repository | List all worktrees, Create worktree, Open worktree as new tab |
| Worktree | Go to main repository, View main repository path |

### WorkspaceTab Fields for Navigation

When a worktree is opened as a workspace tab:

```typescript
// Worktree tab example
{
  id: "ctx-456",
  path: "/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/feature-auth",
  name: "feature-auth",
  repositoryRoot: "/home/user/.local/qraftbox/worktrees/home__user__projects__my-app/feature-auth",
  isGitRepo: true,
  isWorktree: true,
  mainRepositoryPath: "/home/user/projects/my-app",  // <-- Navigate back to this
  worktreeName: "feature-auth"
}
```

When the main repository is opened:

```typescript
// Main repository tab example
{
  id: "ctx-123",
  path: "/home/user/projects/my-app",
  name: "my-app",
  repositoryRoot: "/home/user/projects/my-app",
  isGitRepo: true,
  isWorktree: false,
  mainRepositoryPath: null,  // Not a worktree
  worktreeName: null
}
```

### API for Navigation

**GET /api/ctx/:id/worktree/main** - Get main repository info (for worktree context)

```typescript
interface MainRepositoryResponse {
  readonly isWorktree: boolean;
  readonly mainRepositoryPath: string | null;
  readonly mainRepositoryName: string | null;
}
```

### Client-Side Navigation

The client can use `mainRepositoryPath` from WorkspaceTab to:
1. Display "Go to Main Repository" button when `isWorktree === true`
2. Open the main repository as a new tab or switch to existing tab
3. Show the relationship in the UI (e.g., "Worktree of: my-app")

## Context Manager Fix

### Current Problem

The `isGitRepository()` function only checks if `.git` is a directory:

```typescript
// BROKEN for worktrees
const stats = await stat(gitPath);
return stats.isDirectory();
```

### Fixed Implementation

```typescript
async function isGitRepository(dirPath: string): Promise<boolean> {
  const gitPath = resolve(dirPath, ".git");
  const stats = await stat(gitPath);

  if (stats.isDirectory()) return true;  // Main repo

  if (stats.isFile()) {
    const content = await readFile(gitPath, 'utf-8');
    return content.startsWith('gitdir:');  // Worktree
  }

  return false;
}
```

## File Structure

```
src/
├── types/
│   ├── worktree.ts          # Worktree types and utilities
│   └── worktree.test.ts     # Type tests
├── server/
│   ├── git/
│   │   ├── worktree.ts      # Git worktree operations
│   │   └── worktree.test.ts # Operation tests
│   ├── routes/
│   │   ├── worktree.ts      # API routes
│   │   └── worktree.test.ts # Route tests
│   └── workspace/
│       └── context-manager.ts  # MODIFY: Fix worktree detection
└── types/
    └── workspace.ts            # MODIFY: Add worktree fields
```

## Implementation Phases

### Phase 1: Types (Parallelizable)
- Create `src/types/worktree.ts` with all types and utilities
- Extend `src/types/workspace.ts` with worktree fields

### Phase 2: Git Operations (Depends on Phase 1)
- Create `src/server/git/worktree.ts` with detection and CRUD operations

### Phase 3: Context Manager Fix (Depends on Phase 2)
- Modify `src/server/workspace/context-manager.ts` to recognize worktrees

### Phase 4: API Routes (Depends on Phase 2, 3)
- Create `src/server/routes/worktree.ts` with REST endpoints

## Git Commands Used

| Operation | Command |
|-----------|---------|
| List worktrees | `git worktree list --porcelain` |
| Create worktree | `git worktree add <path> <branch>` |
| Create with new branch | `git worktree add -b <branch> <path> <base>` |
| Remove worktree | `git worktree remove <path>` |
| Force remove | `git worktree remove --force <path>` |
| Prune | `git worktree prune` |

## Validation Rules

### Worktree Name

| Rule | Constraint |
|------|------------|
| Not empty | Required |
| No slashes | Cannot contain `/` or `\` |
| No double underscore | Reserved for path encoding |
| Max length | 100 characters |
| Valid characters | alphanumeric, `-`, `_`, `.` |

## References

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- design-docs/specs/design-multi-directory-workspace.md
