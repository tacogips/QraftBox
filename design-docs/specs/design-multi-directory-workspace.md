# Multi-Directory Workspace Design Specification

## Overview

This document describes the design of a multi-directory workspace feature for aynd. The feature allows users to work on multiple git repositories simultaneously using a tab-based interface, with iPad-friendly directory selection.

## Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| MD1 | Switch current working directory dynamically | Must |
| MD2 | Tab-based UI for multiple directories | Must |
| MD3 | "New directory" button with file picker | Must |
| MD4 | iPad-friendly directory selection UI | Must |
| MD5 | Persist workspace state across sessions | Should |
| MD6 | Tab reordering via drag-and-drop | Should |
| MD7 | Close tab with confirmation for unsaved state | Should |
| MD8 | Recent directories list | Should |
| MD9 | Keyboard shortcuts for tab navigation | Should |
| MD10 | Tab limit (prevent memory issues) | Should |

## Architecture

### Current Architecture (Single Directory)

```
CLI (--path ./repo) --> Server (fixed projectPath) --> Client (single view)
```

### New Architecture (Multi-Directory)

```
+------------------+     +------------------+     +------------------+
|   CLI Layer      | --> |   Server Layer   | --> |   Client Layer   |
|   (no fixed path)|     |   (multi-context)|     |   (tab manager)  |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +------------------+     +------------------+
|  Optional        |     | Context Router   |     | Workspace Store  |
|  --path default  |     | /api/:contextId/*|     | Tab State Mgmt   |
+------------------+     +------------------+     +------------------+
```

### Context Model

Each tab represents a "workspace context" with isolated state:

```
Workspace
+-- Tab 1 (Context A: /path/to/repo1)
|   +-- File Tree State
|   +-- Diff State
|   +-- Commit Log State
|   +-- Comments State
|   +-- Branch State
|
+-- Tab 2 (Context B: /path/to/repo2)
|   +-- File Tree State
|   +-- Diff State
|   +-- ... (isolated state)
|
+-- Tab 3 (Context C: /another/repo)
    +-- ...
```

## Type Definitions

### Workspace Types

```typescript
// src/types/workspace.ts

/**
 * Unique identifier for a workspace context
 */
type ContextId = string;  // UUID

/**
 * Represents a single workspace tab
 */
interface WorkspaceTab {
  readonly id: ContextId;
  readonly path: string;              // Absolute path to directory
  readonly name: string;              // Display name (derived from path)
  readonly repositoryRoot: string;    // Git repository root
  readonly isGitRepo: boolean;        // Whether path is a git repository
  readonly createdAt: number;         // Unix timestamp
  readonly lastAccessedAt: number;    // For sorting/cleanup
}

/**
 * Workspace state
 */
interface Workspace {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: ContextId | null;
  readonly maxTabs: number;           // Default: 10
}

/**
 * Request to open a new directory
 */
interface OpenDirectoryRequest {
  readonly path: string;
  readonly setActive?: boolean;       // Default: true
}

/**
 * Response after opening directory
 */
interface OpenDirectoryResponse {
  readonly tab: WorkspaceTab;
  readonly error?: string;
}

/**
 * Directory validation result
 */
interface DirectoryValidation {
  readonly valid: boolean;
  readonly path: string;
  readonly isGitRepo: boolean;
  readonly repositoryRoot?: string;
  readonly error?: string;
}

/**
 * Recent directory entry
 */
interface RecentDirectory {
  readonly path: string;
  readonly name: string;
  readonly lastOpened: number;
  readonly isGitRepo: boolean;
}
```

### Directory Browser Types

```typescript
// src/types/directory-browser.ts

/**
 * Directory entry for file picker
 */
interface DirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly isDirectory: boolean;
  readonly isGitRepo: boolean;        // Has .git folder
  readonly isSymlink: boolean;
  readonly isHidden: boolean;         // Starts with .
  readonly modifiedAt: number;
}

/**
 * Directory listing response
 */
interface DirectoryListingResponse {
  readonly path: string;
  readonly parentPath: string | null;
  readonly entries: readonly DirectoryEntry[];
  readonly canGoUp: boolean;
}

/**
 * Bookmarked/favorite directories
 */
interface DirectoryBookmark {
  readonly id: string;
  readonly path: string;
  readonly name: string;              // Custom name
  readonly icon?: string;             // Optional custom icon
}
```

## API Design

### Workspace Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspace` | GET | Get current workspace state |
| `/api/workspace/tabs` | POST | Open new directory tab |
| `/api/workspace/tabs/:id` | DELETE | Close tab |
| `/api/workspace/tabs/:id/activate` | POST | Set active tab |
| `/api/workspace/recent` | GET | Get recent directories |
| `/api/workspace/bookmarks` | GET/POST/DELETE | Manage bookmarks |

### Directory Browser Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/browse` | GET | List directory contents |
| `/api/browse/validate` | POST | Validate directory path |
| `/api/browse/home` | GET | Get user home directory |
| `/api/browse/roots` | GET | Get filesystem roots |

### Context-Scoped Endpoints

All existing API endpoints become context-scoped:

| Current | New (Context-Scoped) |
|---------|----------------------|
| `/api/diff` | `/api/ctx/:contextId/diff` |
| `/api/files` | `/api/ctx/:contextId/files` |
| `/api/commits` | `/api/ctx/:contextId/commits` |
| `/api/branches` | `/api/ctx/:contextId/branches` |
| `/api/comments` | `/api/ctx/:contextId/comments` |
| `/api/search` | `/api/ctx/:contextId/search` |
| `/api/status` | `/api/ctx/:contextId/status` |

### GET /api/browse

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| path | string | ~ | Directory to list |
| showHidden | boolean | false | Include hidden files/folders |
| dirsOnly | boolean | true | Show only directories |

**Response:**

```json
{
  "path": "/Users/taco/projects",
  "parentPath": "/Users/taco",
  "canGoUp": true,
  "entries": [
    {
      "name": "aynd",
      "path": "/Users/taco/projects/aynd",
      "isDirectory": true,
      "isGitRepo": true,
      "isSymlink": false,
      "isHidden": false,
      "modifiedAt": 1738656000
    },
    {
      "name": "other-project",
      "path": "/Users/taco/projects/other-project",
      "isDirectory": true,
      "isGitRepo": true,
      "isSymlink": false,
      "isHidden": false,
      "modifiedAt": 1738600000
    }
  ]
}
```

### POST /api/workspace/tabs

**Request:**

```json
{
  "path": "/Users/taco/projects/aynd",
  "setActive": true
}
```

**Response:**

```json
{
  "tab": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "path": "/Users/taco/projects/aynd",
    "name": "aynd",
    "repositoryRoot": "/Users/taco/projects/aynd",
    "isGitRepo": true,
    "createdAt": 1738656000,
    "lastAccessedAt": 1738656000
  }
}
```

## Server Architecture

### Context Manager

```typescript
// src/server/workspace/context-manager.ts

interface ContextManager {
  // Create new context for directory
  createContext(path: string): Promise<WorkspaceTab>;

  // Get context by ID
  getContext(id: ContextId): WorkspaceTab | undefined;

  // Remove context
  removeContext(id: ContextId): void;

  // Get all active contexts
  getAllContexts(): readonly WorkspaceTab[];

  // Validate directory
  validateDirectory(path: string): Promise<DirectoryValidation>;

  // Get context-specific server context
  getServerContext(id: ContextId): ServerContext;
}
```

### Route Middleware

```typescript
// Context extraction middleware
app.use('/api/ctx/:contextId/*', async (c, next) => {
  const contextId = c.req.param('contextId');
  const context = contextManager.getContext(contextId);

  if (!context) {
    return c.json({ error: 'Context not found' }, 404);
  }

  c.set('projectPath', context.path);
  c.set('repositoryRoot', context.repositoryRoot);
  await next();
});
```

## UI Design

### Tab Bar Layout

```
+--------------------------------------------------------------------------+
| [+] | [aynd] [x] | [other-repo] [x] | [my-lib] [x] |      [New Dir]     |
+--------------------------------------------------------------------------+
|  File Tree        |                                                      |
|  (for active tab) |           Diff View (for active tab)                 |
|                   |                                                      |
+-------------------+                                                      |
|  Commit Log       |                                                      |
|  (for active tab) |                                                      |
+-------------------+------------------------------------------------------+
```

### Tab Component

Each tab displays:

| Element | Description |
|---------|-------------|
| Icon | Folder icon, git icon if repo |
| Name | Directory name (last path segment) |
| Close button | [x] to close tab |
| Modified indicator | Dot if uncommitted changes |

```
+---------------------------+
| [git-icon] aynd [*] [x]   |  <-- Active tab (highlighted)
+---------------------------+
| [folder] other-repo  [x]  |  <-- Inactive tab
+---------------------------+
```

### Directory Picker UI (iPad-Optimized)

Full-screen modal optimized for touch:

```
+------------------------------------------------------------------+
|  Select Directory                                        [Cancel] |
+------------------------------------------------------------------+
|  [Home] [Desktop] [Documents] [Recent] [Bookmarks]               |
+------------------------------------------------------------------+
|  Current: /Users/taco/projects                           [Go Up] |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+  |
|  | [git] aynd/                              2 hours ago    [>] |  |  <- 60px row
|  +------------------------------------------------------------+  |
|  | [git] other-project/                     1 day ago      [>] |  |
|  +------------------------------------------------------------+  |
|  | [   ] documents/                         3 days ago     [>] |  |
|  +------------------------------------------------------------+  |
|  | [git] my-library/                        1 week ago     [>] |  |
|  +------------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
|  Path: /Users/taco/projects/aynd                                 |
|                                                                  |
|  [                    Open This Directory                      ] |  <- 56px button
+------------------------------------------------------------------+
```

### Quick Access Bar

Top bar with common locations:

| Button | Action |
|--------|--------|
| Home | Go to user home directory |
| Desktop | Go to Desktop |
| Documents | Go to Documents |
| Recent | Show recently opened directories |
| Bookmarks | Show bookmarked directories |

### Directory Entry Row (Touch-Optimized)

Each row is 60px tall for easy touch:

```
+------------------------------------------------------------------+
| [icon]  Directory Name                  Modified Date        [>] |
|         /full/path/shown/on/second/line                          |
+------------------------------------------------------------------+
```

| Element | Description |
|---------|-------------|
| Icon | Git icon if repo, folder icon otherwise |
| Name | Directory name (bold) |
| Path | Full path (smaller, gray text) |
| Modified | Relative date |
| Chevron | Navigate into directory |

### Touch Interactions

| Gesture | Action |
|---------|--------|
| Tap row | Select directory (highlight) |
| Tap chevron [>] | Navigate into directory |
| Double-tap row | Open directory immediately |
| Swipe right | Add to bookmarks |
| Swipe left | Remove from recent/bookmarks |
| Long-press | Context menu (bookmark, copy path) |
| Pull down | Refresh listing |

### Path Input (Optional)

For power users, a collapsible path input:

```
+------------------------------------------------------------------+
|  [v] Enter path manually                                         |
+------------------------------------------------------------------+
|  [ /Users/taco/projects/aynd_________________ ] [Go]             |
+------------------------------------------------------------------+
```

### Recent Directories Panel

```
+------------------------------------------------------------------+
|  Recent Directories                                    [Clear All]|
+------------------------------------------------------------------+
|  [git] aynd                                       2 hours ago    |
|        /Users/taco/projects/aynd                                 |
+------------------------------------------------------------------+
|  [git] other-repo                                 Yesterday      |
|        /Users/taco/projects/other-repo                           |
+------------------------------------------------------------------+
|  [git] archived-project                           2 weeks ago    |
|        /Users/taco/old/archived-project                          |
+------------------------------------------------------------------+
```

### Bookmarks Panel

```
+------------------------------------------------------------------+
|  Bookmarks                                          [Edit] [Add] |
+------------------------------------------------------------------+
|  [*] Main Project                                                |
|      /Users/taco/projects/aynd                                   |
+------------------------------------------------------------------+
|  [*] Work Repo                                                   |
|      /Users/taco/work/main-app                                   |
+------------------------------------------------------------------+
```

## Tab Management

### Tab Limit

Default maximum: 10 tabs

When limit reached:
1. Show warning toast
2. Offer to close oldest inactive tab
3. Or cancel new tab creation

### Tab Persistence

Workspace state persisted to:
- `~/.aynd/workspace.json` (server-side)
- `localStorage` (client-side, for quick restore)

### Tab State Isolation

Each tab maintains isolated state:

| State | Isolated Per Tab |
|-------|------------------|
| File tree | Yes |
| Selected file | Yes |
| Diff content | Yes |
| Commit log | Yes |
| Branch selection | Yes |
| Search results | Yes |
| Scroll positions | Yes |
| Expanded folders | Yes |

### Tab Switching Behavior

When switching tabs:
1. Save current tab's scroll positions
2. Switch context ID for API calls
3. Restore new tab's state from store
4. Update URL to reflect active tab

## Client Store

### Workspace Store

```typescript
// client/stores/workspace.ts

interface WorkspaceState {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: ContextId | null;
  readonly isPickerOpen: boolean;
  readonly recentDirectories: readonly RecentDirectory[];
  readonly bookmarks: readonly DirectoryBookmark[];
  readonly loading: boolean;
  readonly error: string | null;
}

interface WorkspaceActions {
  // Tab management
  openDirectory(path: string): Promise<void>;
  closeTab(id: ContextId): void;
  activateTab(id: ContextId): void;
  reorderTabs(fromIndex: number, toIndex: number): void;

  // Directory picker
  openPicker(): void;
  closePicker(): void;

  // Recent/Bookmarks
  addBookmark(path: string, name?: string): void;
  removeBookmark(id: string): void;
  clearRecent(): void;

  // Persistence
  saveWorkspace(): Promise<void>;
  restoreWorkspace(): Promise<void>;
}
```

### Directory Browser Store

```typescript
// client/stores/directory-browser.ts

interface DirectoryBrowserState {
  readonly currentPath: string;
  readonly entries: readonly DirectoryEntry[];
  readonly selectedPath: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly showHidden: boolean;
  readonly history: readonly string[];  // For back navigation
  readonly historyIndex: number;
}

interface DirectoryBrowserActions {
  navigateTo(path: string): Promise<void>;
  goUp(): Promise<void>;
  goBack(): void;
  goForward(): void;
  goHome(): Promise<void>;
  selectEntry(path: string): void;
  toggleHidden(): void;
  refresh(): Promise<void>;
}
```

## Component Hierarchy

```
App.svelte
+-- TabBar.svelte
|   +-- NewTabButton.svelte
|   +-- TabItem.svelte (repeated)
|   |   +-- TabIcon.svelte
|   |   +-- TabLabel.svelte
|   |   +-- TabCloseButton.svelte
|   +-- TabOverflowMenu.svelte (when many tabs)
|
+-- DirectoryPicker.svelte (modal)
|   +-- QuickAccessBar.svelte
|   +-- PathBreadcrumb.svelte
|   +-- DirectoryList.svelte
|   |   +-- DirectoryEntry.svelte (repeated)
|   +-- PathInput.svelte (collapsible)
|   +-- RecentPanel.svelte
|   +-- BookmarksPanel.svelte
|   +-- OpenButton.svelte
|
+-- MainContent.svelte (existing, now context-aware)
    +-- FileTree.svelte
    +-- DiffView.svelte
    +-- CommitLog.svelte
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + T` | Open new tab (directory picker) |
| `Cmd/Ctrl + W` | Close current tab |
| `Cmd/Ctrl + Tab` | Next tab |
| `Cmd/Ctrl + Shift + Tab` | Previous tab |
| `Cmd/Ctrl + 1-9` | Switch to tab N |
| `Cmd/Ctrl + Shift + T` | Reopen last closed tab |

## URL Structure

Tabs reflected in URL for shareability:

```
http://localhost:3000/ctx/550e8400-e29b-41d4-a716-446655440000
                          ^-- Active context ID
```

Or with path encoding:

```
http://localhost:3000/?dir=/Users/taco/projects/aynd
```

## Implementation Phases

### Phase 1: Core Infrastructure

| Task | Description |
|------|-------------|
| MD-001 | Create workspace types in `src/types/workspace.ts` |
| MD-002 | Create directory browser types |
| MD-003 | Implement context manager |
| MD-004 | Add context-scoped route middleware |
| MD-005 | Migrate existing routes to context-scoped |

### Phase 2: Directory Browser API

| Task | Description |
|------|-------------|
| MD-006 | Implement `/api/browse` endpoint |
| MD-007 | Implement `/api/browse/validate` |
| MD-008 | Implement workspace endpoints |
| MD-009 | Add recent directories persistence |

### Phase 3: Client Stores

| Task | Description |
|------|-------------|
| MD-010 | Create workspace store |
| MD-011 | Create directory browser store |
| MD-012 | Modify existing stores for multi-context |
| MD-013 | Add context switching logic |

### Phase 4: Tab UI

| Task | Description |
|------|-------------|
| MD-014 | Create TabBar component |
| MD-015 | Create TabItem component |
| MD-016 | Implement tab drag-and-drop reordering |
| MD-017 | Add tab overflow menu |

### Phase 5: Directory Picker UI

| Task | Description |
|------|-------------|
| MD-018 | Create DirectoryPicker modal |
| MD-019 | Create DirectoryList component |
| MD-020 | Create QuickAccessBar |
| MD-021 | Create RecentPanel and BookmarksPanel |
| MD-022 | Implement touch gestures |

### Phase 6: Integration

| Task | Description |
|------|-------------|
| MD-023 | Integrate tab bar into main layout |
| MD-024 | Add keyboard shortcuts |
| MD-025 | Implement workspace persistence |
| MD-026 | Add URL routing for contexts |

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Path traversal | Validate paths, resolve symlinks |
| Access outside allowed dirs | Optional: whitelist base directories |
| Sensitive directory exposure | Respect file permissions, hide system dirs |
| Large directory listings | Pagination, max entries limit |

## Performance Considerations

| Consideration | Solution |
|---------------|----------|
| Many open tabs | Lazy load tab content on activation |
| Large directories | Virtual scrolling in directory picker |
| State memory usage | Unload inactive tab states after timeout |
| Concurrent file watchers | Share watcher, filter by context |

## Error Handling

| Scenario | Handling |
|----------|----------|
| Directory not found | Show error, remove from recent |
| Not a git repository | Allow open with warning |
| Permission denied | Show error, suggest alternatives |
| Network disconnection | Preserve local state, show reconnect |
| Tab limit reached | Prompt to close inactive tabs |

## Future Enhancements

| Enhancement | Description |
|-------------|-------------|
| Split view | View two tabs side-by-side |
| Tab groups | Group related tabs together |
| Workspace files | Save/load named workspace configurations |
| Remote directories | SSH/remote filesystem support |
| Directory templates | Quick setup for common project types |

## Accessibility

| Feature | Implementation |
|---------|----------------|
| Screen reader | ARIA labels for tabs and directories |
| Keyboard navigation | Full keyboard support for picker |
| Focus management | Proper focus trap in modal |
| High contrast | Support system high contrast mode |

## References

See `design-docs/references/README.md` for:
- File picker UI patterns
- Tab management best practices
- Touch gesture libraries
