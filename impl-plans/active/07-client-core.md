# Client Core Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#ui-design
**Phase**: 2
**CRITICAL**: This plan MUST be completed before 08-diff-view, 10-file-tree, and client tasks in 15-branch-switching can start.
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary

Svelte 5 client application setup with Vite, Tailwind CSS v4, routing, and core stores. Foundation for all UI components.

### Scope

**Included**: Project setup, routing, stores, API client, WebSocket client, syntax highlighting setup
**Excluded**: Specific UI components (separate plans)

---

## Modules

### 1. Project Setup

#### client/vite.config.ts

**Status**: NOT_STARTED

```typescript
// Vite configuration with Svelte 5 plugin
// - @sveltejs/vite-plugin-svelte
// - Tailwind CSS v4
// - Build output to dist/client
```

**Checklist**:

- [ ] Configure Vite with Svelte 5
- [ ] Setup Tailwind CSS v4
- [ ] Configure build output path
- [ ] Setup dev server proxy to backend

#### client/tailwind.config.ts

**Status**: COMPLETED

```typescript
// Tailwind v4 configuration
// - Light theme colors from design doc
// - Touch-friendly spacing
// - Custom component classes
```

**Checklist**:

- [x] Configure light theme colors
- [x] Add custom utility classes
- [x] Configure content paths

### 2. App Shell

#### client/App.svelte

**Status**: COMPLETED

```svelte
<!-- Root component with layout structure -->
<script lang="ts">
  // Initialize stores
  // Setup WebSocket connection
  // Handle keyboard shortcuts
</script>

<!-- Layout: Header, Sidebar, Main, Footer -->
```

**Checklist**:

- [x] Implement root layout
- [x] Setup store initialization
- [x] Add global keyboard handler
- [x] Add WebSocket connection lifecycle
- [x] Add responsive breakpoint handling

#### client/routes/+page.svelte

**Status**: NOT_STARTED

```svelte
<!-- Main diff viewer page -->
<script lang="ts">
  // Load initial diff data
  // Handle view mode switching
</script>
```

**Checklist**:

- [ ] Implement main page layout
- [ ] Add data loading
- [ ] Add view mode toggle
- [ ] Handle URL parameters

### 3. Core Stores

#### client/stores/diff.ts

**Status**: COMPLETED

```typescript
import { writable, derived } from 'svelte/store';

// Diff data store
interface DiffStore {
  files: DiffFile[];
  selectedFile: string | null;
  viewMode: ViewMode;
  loading: boolean;
  error: string | null;
}

// Create diff store with actions
function createDiffStore();

// Derived stores
const selectedFileDiff = derived(...);
const fileSummary = derived(...);
```

**Checklist**:

- [x] Implement diff store
- [x] Add derived stores
- [x] Add actions (loadDiff, selectFile, setViewMode)
- [x] Unit tests

#### client/stores/files.ts

**Status**: NOT_STARTED

```typescript
// File tree store
interface FilesStore {
  tree: FileNode | null;
  mode: "diff" | "all";
  expandedPaths: Set<string>;
  loading: boolean;
}

function createFilesStore();
```

**Checklist**:

- [ ] Implement files store
- [ ] Add expand/collapse actions
- [ ] Add mode toggle action
- [ ] Unit tests

#### client/stores/ui.ts

**Status**: NOT_STARTED

```typescript
// UI state store
interface UIStore {
  sidebarCollapsed: boolean;
  currentMode: "NORMAL" | "VISUAL" | "SEARCH" | "COMMENT";
  searchQuery: string;
  searchScope: "file" | "changed" | "all";
}

function createUIStore();
```

**Checklist**:

- [ ] Implement UI store
- [ ] Add mode switching
- [ ] Add sidebar toggle
- [ ] Unit tests

### 4. API Client

#### client/lib/api.ts

**Status**: NOT_STARTED

```typescript
// API client for backend communication
interface APIClient {
  getDiff(params?: DiffQueryParams): Promise<DiffResponse>;
  getFiles(mode?: "diff" | "all"): Promise<FilesResponse>;
  getFileContent(path: string): Promise<FileContentResponse>;
  getStatus(): Promise<StatusResponse>;
}

function createAPIClient(baseUrl: string): APIClient;

// Error handling
class APIError extends Error {
  constructor(message: string, status: number);
}
```

**Checklist**:

- [ ] Implement createAPIClient()
- [ ] Add all endpoint methods
- [ ] Add error handling
- [ ] Add request/response typing
- [ ] Unit tests

### 5. WebSocket Client

#### client/lib/websocket.ts

**Status**: COMPLETED

```typescript
// WebSocket client for real-time updates
interface WSClient {
  connect(): void;
  disconnect(): void;
  on(event: WSEventType, handler: (payload: unknown) => void): void;
  off(event: WSEventType, handler: (payload: unknown) => void): void;
  isConnected(): boolean;
  getReadyState(): number;
}

function createWSClient(url: string): WSClient;

// Reconnection logic with exponential backoff
function setupReconnection(client: WSClient): void;
```

**Checklist**:

- [x] Implement createWSClient()
- [x] Add connection management
- [x] Add event handling (on/off)
- [x] Add reconnection logic with exponential backoff
- [x] Unit tests

### 6. Syntax Highlighter

#### client/lib/highlighter.ts

**Status**: COMPLETED

```typescript
import { createHighlighter, type Highlighter } from "shiki";

// Initialize Shiki highlighter
async function initHighlighter(): Promise<Highlighter>;

// Highlight code with caching
interface HighlightCache {
  highlight(code: string, lang: string): Promise<string>;
  preload(lang: string): Promise<void>;
  clear(): void;
}

function createHighlightCache(highlighter: Highlighter): HighlightCache;

// Language detection from file extension
function detectLanguage(filename: string): string;
```

**Checklist**:

- [x] Initialize Shiki with GitHub Light theme
- [x] Implement caching layer
- [x] Add language detection
- [x] Handle large files (skip >1MB)
- [x] Unit tests

---

## Module Status

| Module          | File Path                    | Status      | Tests |
| --------------- | ---------------------------- | ----------- | ----- |
| Vite Config     | `client/vite.config.ts`      | COMPLETED   | -     |
| Tailwind Config | `client/tailwind.config.ts`  | COMPLETED   | -     |
| App Shell       | `client/App.svelte`          | COMPLETED   | -     |
| Main Page       | `client/routes/+page.svelte` | NOT_STARTED | -     |
| Diff Store      | `client/stores/diff.ts`      | COMPLETED   | Pass  |
| Files Store     | `client/stores/files.ts`     | COMPLETED   | Pass  |
| UI Store        | `client/stores/ui.ts`        | COMPLETED   | Pass  |
| API Client      | `client/lib/api.ts`          | COMPLETED   | Pass  |
| WS Client       | `client/lib/websocket.ts`    | COMPLETED   | Pass  |
| Highlighter     | `client/lib/highlighter.ts`  | COMPLETED   | Pass  |

## Dependencies

| Feature     | Depends On      | Status     |
| ----------- | --------------- | ---------- |
| Client      | Svelte 5        | To install |
| Client      | Vite            | To install |
| Client      | Tailwind CSS v4 | To install |
| Highlighter | Shiki           | To install |
| API Client  | Server API      | Phase 1    |

## Completion Criteria

- [ ] Client builds successfully
- [ ] Routing works
- [ ] Stores initialize properly
- [ ] API client connects to backend
- [ ] WebSocket connects and receives events
- [ ] Syntax highlighting works
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03 (23:39)

**Tasks Completed**: TASK-003: App Shell (App.svelte + main.ts + index.html)
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Created `client/index.html` as Vite entry point
- Implemented `client/src/App.svelte` as root Svelte 5 component with:
  - Root layout structure (header, sidebar, main, footer)
  - Store initialization on mount (diffStore, filesStore, uiStore)
  - WebSocket connection lifecycle (connect on mount, disconnect on destroy)
  - Global keyboard shortcut handler:
    - 'b' to toggle sidebar in NORMAL mode
    - '/' to enter SEARCH mode
    - 'Escape' to return to NORMAL mode
  - Responsive breakpoint handling (collapse sidebar on mobile <768px)
  - Event handlers properly cleaned up on destroy
- Created `client/src/main.ts` as application entry point
- Updated `client/vite.config.ts` to add path aliases for $lib, $stores, $components
- Installed `prettier-plugin-svelte` for Svelte formatting support
- All code follows TypeScript strict guidelines and Svelte 5 patterns
- Build passes successfully (vite build)
- Type checking passes (svelte-check)
- All existing tests continue passing (182 tests)
- Placeholder comments added for future components (file tree, diff view)

### Session: 2026-02-03 (22:00)

**Tasks Completed**: TASK-009: WebSocket Client
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Implemented `client/src/lib/websocket.ts` with full WebSocket client functionality
- Created `createWSClient()` factory function with configurable URL
- Implemented connection management (connect/disconnect)
- Event handling system with on/off methods supporting multiple handlers per event
- Automatic reconnection with exponential backoff (1000ms initial, 30000ms max, 2x multiplier)
- Type-safe event types: "file-change", "comment-added", "diff-updated"
- Message validation and parsing with error handling
- Status methods: isConnected() and getReadyState()
- Singleton instance `ws` for application-wide use
- Comprehensive unit tests with 18 passing test cases including:
  - Connection lifecycle management
  - Event handler registration and removal
  - Message handling and validation
  - Reconnection logic with exponential backoff
  - Error handling and edge cases
- All tests passing, type checking passes, code follows TypeScript strict guidelines

### Session: 2026-02-03 (21:30)

**Tasks Completed**: TASK-010: Syntax Highlighter
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Implemented `client/src/lib/highlighter.ts` with Shiki integration
- Created `initHighlighter()` with GitHub Light theme
- Implemented `createHighlightCache()` with Map-based caching
- Created `detectLanguage()` with 50+ language mappings
- Added `MAX_HIGHLIGHT_SIZE` constant (1MB) for performance
- HTML escaping fallback for large files and unsupported languages
- Comprehensive unit tests with 35 passing test cases
- Type-safe implementation with BundledLanguage type casting
- All tests passing, code follows TypeScript strict guidelines

### Session: 2026-02-03 (21:25)

**Tasks Completed**: TASK-002: Tailwind Config
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Created `client/tailwind.config.ts` with Tailwind CSS v4 configuration
- Created `client/src/app.css` with light theme colors from design doc
- Theme includes all required color variables (bg, text, border, diff, accent)
- Touch-friendly spacing variables added (44px and 48px)
- Files formatted with prettier
- Tailwind CSS v4 uses new CSS-first configuration with `@theme` directive

### Session: 2026-02-03 (14:26)

**Tasks Completed**: TASK-005: Diff Store implementation
**Tasks In Progress**: None
**Blockers**: None
**Notes**:

- Implemented `createDiffStore()` with all required actions (loadDiff, selectFile, setViewMode, reset)
- Created derived stores (selectedFileDiff, fileSummary) with helper function
- Comprehensive unit tests with 17 passing test cases
- Type definitions created in `src/types/diff.ts`
- All tests passing, code follows TypeScript strict guidelines

### Session: 2026-02-03 (Initial)

**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 06-file-watcher.md
- **Next**: 08-diff-view.md
- **Depends On**: 04-api-routes.md (API endpoints)
