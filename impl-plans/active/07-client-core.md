# Client Core Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#ui-design
**Phase**: 2
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

**Status**: NOT_STARTED

```typescript
// Tailwind v4 configuration
// - Light theme colors from design doc
// - Touch-friendly spacing
// - Custom component classes
```

**Checklist**:
- [ ] Configure light theme colors
- [ ] Add custom utility classes
- [ ] Configure content paths

### 2. App Shell

#### client/App.svelte

**Status**: NOT_STARTED

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
- [ ] Implement root layout
- [ ] Setup store initialization
- [ ] Add global keyboard handler
- [ ] Add WebSocket connection lifecycle
- [ ] Add responsive breakpoint handling

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

**Status**: NOT_STARTED

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
- [ ] Implement diff store
- [ ] Add derived stores
- [ ] Add actions (loadDiff, selectFile, setViewMode)
- [ ] Unit tests

#### client/stores/files.ts

**Status**: NOT_STARTED

```typescript
// File tree store
interface FilesStore {
  tree: FileNode | null;
  mode: 'diff' | 'all';
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
  currentMode: 'NORMAL' | 'VISUAL' | 'SEARCH' | 'COMMENT';
  searchQuery: string;
  searchScope: 'file' | 'changed' | 'all';
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
  getFiles(mode?: 'diff' | 'all'): Promise<FilesResponse>;
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

**Status**: NOT_STARTED

```typescript
// WebSocket client for real-time updates
interface WSClient {
  connect(): void;
  disconnect(): void;
  on(event: WSEventType, handler: (payload: unknown) => void): void;
  off(event: WSEventType, handler: (payload: unknown) => void): void;
  isConnected(): boolean;
}

function createWSClient(url: string): WSClient;

// Reconnection logic with exponential backoff
function setupReconnection(client: WSClient): void;
```

**Checklist**:
- [ ] Implement createWSClient()
- [ ] Add connection management
- [ ] Add event handling
- [ ] Add reconnection logic
- [ ] Unit tests

### 6. Syntax Highlighter

#### client/lib/highlighter.ts

**Status**: NOT_STARTED

```typescript
import { createHighlighter, type Highlighter } from 'shiki';

// Initialize Shiki highlighter
async function initHighlighter(): Promise<Highlighter>;

// Highlight code with caching
interface HighlightCache {
  highlight(code: string, lang: string): Promise<string>;
  preload(lang: string): Promise<void>;
}

function createHighlightCache(highlighter: Highlighter): HighlightCache;

// Language detection from file extension
function detectLanguage(filename: string): string;
```

**Checklist**:
- [ ] Initialize Shiki with GitHub Light theme
- [ ] Implement caching layer
- [ ] Add language detection
- [ ] Handle large files (skip >1MB)
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Vite Config | `client/vite.config.ts` | NOT_STARTED | - |
| Tailwind Config | `client/tailwind.config.ts` | NOT_STARTED | - |
| App Shell | `client/App.svelte` | NOT_STARTED | - |
| Main Page | `client/routes/+page.svelte` | NOT_STARTED | - |
| Diff Store | `client/stores/diff.ts` | NOT_STARTED | - |
| Files Store | `client/stores/files.ts` | NOT_STARTED | - |
| UI Store | `client/stores/ui.ts` | NOT_STARTED | - |
| API Client | `client/lib/api.ts` | NOT_STARTED | - |
| WS Client | `client/lib/websocket.ts` | NOT_STARTED | - |
| Highlighter | `client/lib/highlighter.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Client | Svelte 5 | To install |
| Client | Vite | To install |
| Client | Tailwind CSS v4 | To install |
| Highlighter | Shiki | To install |
| API Client | Server API | Phase 1 |

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

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 06-file-watcher.md
- **Next**: 08-diff-view.md
- **Depends On**: 04-api-routes.md (API endpoints)
