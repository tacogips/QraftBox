# Commit Log Viewer Design Specification

## Overview

This document describes the design of a commit log viewing feature for aynd. The feature allows users to browse the git commit history and view diffs for any selected commit, integrating seamlessly with the existing file tree and diff view components.

## Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| CL1 | Display commit log list below file tree | Must |
| CL2 | Select commit to view changed files in file tree | Must |
| CL3 | Display commit diff in diff view | Must |
| CL4 | Pagination for large commit histories | Must |
| CL5 | Commit metadata display (author, date, message) | Must |
| CL6 | Filter commits by branch | Should |
| CL7 | Search commits by message/author | Should |
| CL8 | Commit stats (files changed, additions, deletions) | Should |
| CL9 | Integration with existing comments system | Future |

## Architecture

### Component Integration

```
+------------------+     +------------------+     +------------------+
|   Commit Log     | --> |   File Tree      | --> |   Diff View      |
|   (new component)|     |   (existing)     |     |   (existing)     |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +------------------+     +------------------+
|  Commit Store    | --> |   Files Store    | --> |   Diff Store     |
|   (new)          |     |   (existing)     |     |   (existing)     |
+------------------+     +------------------+     +------------------+
        |
        v
+------------------+
|   Git Operations |
|   commit-log.ts  |
+------------------+
```

### Data Flow

1. User scrolls/loads commit log
2. Commit log store fetches commits from `/api/commits`
3. User selects a commit
4. File tree updates to show files changed in that commit
5. Diff view shows the diff for the selected commit
6. User can click files to view individual file diffs

## Type Definitions

### Commit Types

```typescript
// src/types/commit.ts

/**
 * Basic commit information for list display
 */
interface CommitInfo {
  readonly hash: string;           // Full commit hash
  readonly shortHash: string;      // Short hash (7 chars)
  readonly message: string;        // First line of commit message
  readonly body: string;           // Full commit message body
  readonly author: CommitAuthor;
  readonly committer: CommitAuthor;
  readonly date: number;           // Unix timestamp (author date)
  readonly parentHashes: readonly string[];  // Parent commit hashes
}

interface CommitAuthor {
  readonly name: string;
  readonly email: string;
}

/**
 * Extended commit information with file statistics
 */
interface CommitDetail extends CommitInfo {
  readonly stats: CommitStats;
  readonly files: readonly CommitFileChange[];
}

interface CommitStats {
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
}

interface CommitFileChange {
  readonly path: string;
  readonly status: FileChangeStatus;  // 'A' | 'M' | 'D' | 'R' | 'C'
  readonly additions: number;
  readonly deletions: number;
  readonly oldPath?: string;         // For renames/copies
}

type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C';

/**
 * API response for paginated commit list
 */
interface CommitLogResponse {
  readonly commits: readonly CommitInfo[];
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
  readonly branch: string;
}

/**
 * Query parameters for commit log
 */
interface CommitLogQuery {
  readonly branch?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly search?: string;         // Search in message/author
  readonly since?: string;          // ISO date
  readonly until?: string;          // ISO date
}
```

## API Design

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/commits` | GET | List commits with pagination |
| `/api/commits/:hash` | GET | Get commit detail with stats |
| `/api/commits/:hash/diff` | GET | Get diff for a commit |
| `/api/commits/:hash/files` | GET | Get files changed in commit |

### GET /api/commits

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| branch | string | HEAD | Branch to list commits from |
| limit | number | 50 | Number of commits per page |
| offset | number | 0 | Pagination offset |
| search | string | - | Search in message/author |
| since | string | - | Filter commits after date (ISO) |
| until | string | - | Filter commits before date (ISO) |

**Response:**

```json
{
  "commits": [
    {
      "hash": "7711341abc...",
      "shortHash": "7711341",
      "message": "feat: complete session queue system",
      "body": "Full commit message...",
      "author": {
        "name": "Author Name",
        "email": "author@example.com"
      },
      "committer": {
        "name": "Author Name",
        "email": "author@example.com"
      },
      "date": 1738656000,
      "parentHashes": ["bbfc280..."]
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total": 125,
    "hasMore": true
  },
  "branch": "main"
}
```

### GET /api/commits/:hash

**Response:**

```json
{
  "hash": "7711341abc...",
  "shortHash": "7711341",
  "message": "feat: complete session queue system",
  "body": "Full commit message with details...",
  "author": { "name": "...", "email": "..." },
  "committer": { "name": "...", "email": "..." },
  "date": 1738656000,
  "parentHashes": ["bbfc280..."],
  "stats": {
    "filesChanged": 5,
    "additions": 150,
    "deletions": 30
  },
  "files": [
    {
      "path": "src/server/ai/session-manager.ts",
      "status": "M",
      "additions": 80,
      "deletions": 10
    },
    {
      "path": "src/types/ai.ts",
      "status": "A",
      "additions": 50,
      "deletions": 0
    }
  ]
}
```

### GET /api/commits/:hash/diff

Returns the same format as existing `/api/diff` endpoint, but for a specific commit (comparing commit with its parent).

## Git Operations

### New Module: src/server/git/commit-log.ts

```typescript
// Key functions (signatures only)

/**
 * Get paginated commit log
 */
async function getCommitLog(
  cwd: string,
  options?: CommitLogQuery
): Promise<CommitLogResponse>

/**
 * Get detailed commit information with stats
 */
async function getCommitDetail(
  cwd: string,
  hash: string
): Promise<CommitDetail>

/**
 * Get files changed in a commit
 */
async function getCommitFiles(
  cwd: string,
  hash: string
): Promise<CommitFileChange[]>

/**
 * Get total commit count for branch (for pagination)
 */
async function getCommitCount(
  cwd: string,
  branch?: string
): Promise<number>

/**
 * Search commits by message or author
 */
async function searchCommits(
  cwd: string,
  query: string,
  options?: { limit?: number; branch?: string }
): Promise<CommitInfo[]>
```

### Git Commands Used

| Operation | Git Command |
|-----------|-------------|
| List commits | `git log --format=<format> --skip=N -n M [branch]` |
| Commit detail | `git show --stat --format=<format> <hash>` |
| Commit files | `git diff-tree --no-commit-id --name-status -r <hash>` |
| Commit count | `git rev-list --count [branch]` |
| Search | `git log --grep=<query> --author=<query>` |

### Log Format String

```
--format=format:'%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%cn%x00%ce%x00%at%x00%P'
```

| Placeholder | Field |
|-------------|-------|
| %H | Full hash |
| %h | Short hash |
| %s | Subject (first line) |
| %b | Body |
| %an | Author name |
| %ae | Author email |
| %cn | Committer name |
| %ce | Committer email |
| %at | Author date (Unix timestamp) |
| %P | Parent hashes |
| %x00 | Null byte delimiter |

## UI Design

### Layout Structure

The commit log appears below the file tree in the left sidebar:

```
+------------------------------------------+-------------------------+
| [=] Branch: main | main...feature | [...]|                         |
+----------------------+-------------------+                         |
| File Tree            |                   |                         |
| (collapsible)        |                   |                         |
|                      |   Diff View       |                         |
| src/                 |   (existing)      |                         |
| +-- main.ts [M]      |                   |                         |
| +-- lib.ts           |                   |                         |
|                      |                   |                         |
+----------------------+                   |                         |
| Commit Log           |                   |                         |
| (collapsible)        |                   |                         |
|                      |                   |                         |
| * 7711341 feat: ...  |                   |                         |
|   bbfc280 feat: ...  |                   |                         |
|   0a2d5a7 feat: ...  |                   |                         |
|   1e149c6 docs: ...  |                   |                         |
|   [Load more...]     |                   |                         |
+----------------------+-------------------+-------------------------+
```

### View Modes

The commit log panel supports two modes:

| Mode | Description |
|------|-------------|
| Branch Diff Mode (default) | Normal operation - shows diff between base and target branches |
| Commit Mode | Shows diff for a single selected commit |

### Mode Switching

When user selects a commit:
1. File tree switches to show only files changed in that commit
2. Diff view shows the commit diff (vs parent)
3. A "Back to branch diff" button appears to return to normal mode

### Commit Log Component

```
+--------------------------------------------------+
| Commit Log                    [v] [Search] [X]   |
+--------------------------------------------------+
| * 7711341 feat: complete session queue system    |
|   taco  |  2 hours ago  |  +150 -30  |  5 files  |
+--------------------------------------------------+
|   bbfc280 feat: add branch switching             |
|   taco  |  5 hours ago  |  +80 -20   |  3 files  |
+--------------------------------------------------+
|   0a2d5a7 feat: add implementation plans         |
|   taco  |  1 day ago    |  +500 -0   |  15 files |
+--------------------------------------------------+
|              [Load more commits...]              |
+--------------------------------------------------+
```

### Commit List Item

Each commit item displays:

| Element | Description |
|---------|-------------|
| Selected indicator | `*` for selected, space for others |
| Short hash | 7-character abbreviated hash |
| Message | First line of commit message |
| Author | Author name (abbreviated if long) |
| Relative date | "2 hours ago", "5 days ago", etc. |
| Stats | `+N -M` additions/deletions |
| File count | Number of files changed |

### Touch Interactions

| Gesture | Action |
|---------|--------|
| Tap commit | Select commit, update file tree and diff |
| Long-press | Show commit detail popup |
| Swipe down | Refresh commit list |
| Scroll to bottom | Trigger "load more" |
| Tap search icon | Open search input |
| Tap collapse icon | Collapse/expand commit log panel |

### Search UI

When search is active:

```
+--------------------------------------------------+
| Commit Log                          [Search] [X] |
+--------------------------------------------------+
| [search: authentication_______________] [Clear]  |
+--------------------------------------------------+
|   abc1234 feat: add user authentication          |
|   def5678 fix: authentication token expiry       |
|   ghi9012 docs: authentication guide             |
+--------------------------------------------------+
|              [3 commits found]                   |
+--------------------------------------------------+
```

### Mobile/Tablet Adaptations

| Screen Size | Adaptation |
|-------------|------------|
| < 768px | Commit log as bottom sheet, swipe up to reveal |
| 768px - 1024px | Commit log below file tree, collapsible |
| > 1024px | Commit log always visible, resizable |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `g` + `l` | Focus commit log |
| `j` / `k` | Navigate commits (vim-style) |
| `Enter` | Select highlighted commit |
| `/` | Open search (when log focused) |
| `Escape` | Return to branch diff mode |
| `q` | Collapse commit log |

## Client Store

### Commit Log Store

```typescript
// client/stores/commit-log.ts

interface CommitLogState {
  readonly commits: readonly CommitInfo[];
  readonly selectedCommit: CommitInfo | null;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
  readonly search: string;
  readonly branch: string;
  readonly mode: 'branch-diff' | 'commit';
}

interface CommitLogActions {
  loadCommits(options?: CommitLogQuery): Promise<void>;
  loadMore(): Promise<void>;
  selectCommit(hash: string): Promise<void>;
  clearSelection(): void;
  setSearch(query: string): void;
  setBranch(branch: string): void;
  refresh(): Promise<void>;
}
```

### Integration with Existing Stores

When a commit is selected:

1. **Files Store**: Updates to show files from `CommitDetail.files`
2. **Diff Store**: Fetches diff from `/api/commits/:hash/diff`
3. **UI Store**: Sets mode to 'commit' for UI adaptations

## Component Hierarchy

```
CommitLogPanel.svelte
+-- CommitLogHeader.svelte
|   +-- CollapseButton
|   +-- SearchToggle
|   +-- RefreshButton
+-- CommitSearchInput.svelte (conditional)
+-- CommitList.svelte
|   +-- VirtualCommitList.svelte (for performance)
|   |   +-- CommitListItem.svelte (repeated)
|   |       +-- CommitHash.svelte
|   |       +-- CommitMessage.svelte
|   |       +-- CommitMeta.svelte (author, date, stats)
|   +-- LoadMoreButton.svelte
+-- CommitDetailPopup.svelte (on long-press)
```

## Implementation Phases

### Phase 1: Core Backend

| Task | Description |
|------|-------------|
| CL-001 | Create commit types in `src/types/commit.ts` |
| CL-002 | Implement `src/server/git/commit-log.ts` |
| CL-003 | Create API routes in `src/server/routes/commits.ts` |
| CL-004 | Add route mounting in routes/index.ts |

### Phase 2: Client Core

| Task | Description |
|------|-------------|
| CL-005 | Create commit-log store |
| CL-006 | Add API client functions |
| CL-007 | Integrate with existing files and diff stores |

### Phase 3: UI Components

| Task | Description |
|------|-------------|
| CL-008 | Create CommitLogPanel component |
| CL-009 | Create CommitListItem component |
| CL-010 | Implement virtual scrolling for commit list |
| CL-011 | Add commit search functionality |
| CL-012 | Create CommitDetailPopup component |

### Phase 4: Integration

| Task | Description |
|------|-------------|
| CL-013 | Integrate commit log into sidebar layout |
| CL-014 | Implement mode switching (branch-diff / commit) |
| CL-015 | Add keyboard shortcuts |
| CL-016 | Touch gesture support |

## Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid commit hash | Show error toast, clear selection |
| Network failure | Show retry button, preserve last state |
| Empty repository | Show "No commits" message |
| Large repository | Progressive loading with "Load more" |

## Performance Considerations

| Consideration | Solution |
|---------------|----------|
| Large commit history | Virtual scrolling, pagination (50 per page) |
| Commit detail fetch | Lazy load on selection |
| Search debounce | 300ms debounce on search input |
| Cache | Cache recent commit details in store |

## Future Enhancements

| Enhancement | Description |
|-------------|-------------|
| Commit graph | Visual git graph showing branches/merges |
| Commit comparison | Compare two commits directly |
| File history | View history for a specific file |
| Blame view | Git blame integration |
| Comments on commits | Link comments to specific commits |

## References

See `design-docs/references/README.md` for:
- Git log format documentation
- Virtual list implementation references
- Date formatting libraries
