# Search Functionality Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#search-functionality
**Phase**: 3
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Regex-based search with three scopes: current file, changed files, and entire repository. Search UI with results navigation.

### Scope
**Included**: Search API, search UI, result navigation, keyboard shortcuts
**Excluded**: File tree filtering (file tree plan), AI context search

---

## Modules

### 1. Search Types

#### src/types/search.ts

**Status**: NOT_STARTED

```typescript
// Search scopes
type SearchScope = 'file' | 'changed' | 'all';

// Search request
interface SearchRequest {
  pattern: string;
  scope: SearchScope;
  filePath?: string;  // Required for 'file' scope
  contextLines?: number;
}

// Search result
interface SearchResult {
  filePath: string;
  lineNumber: number;
  content: string;
  matchStart: number;
  matchEnd: number;
  context?: {
    before: string[];
    after: string[];
  };
}

interface SearchResponse {
  results: SearchResult[];
  totalMatches: number;
  filesSearched: number;
  pattern: string;
  scope: SearchScope;
}
```

**Checklist**:
- [ ] Define SearchScope type
- [ ] Define SearchRequest interface
- [ ] Define SearchResult interface
- [ ] Define SearchResponse interface
- [ ] Export all types

### 2. Search Service (Server)

#### src/server/search/index.ts

**Status**: NOT_STARTED

```typescript
// Search within file content
function searchInFile(
  content: string,
  pattern: string,
  contextLines?: number
): SearchResult[];

// Search across multiple files
function searchInFiles(
  files: string[],
  pattern: string,
  cwd: string,
  contextLines?: number
): Promise<SearchResult[]>;

// Get files to search based on scope
function getFilesForScope(
  scope: SearchScope,
  diffTarget: DiffTarget,
  cwd: string
): Promise<string[]>;

// Validate regex pattern
function validatePattern(pattern: string): { valid: boolean; error?: string };
```

**Checklist**:
- [ ] Implement searchInFile()
- [ ] Implement searchInFiles()
- [ ] Implement getFilesForScope()
- [ ] Implement validatePattern()
- [ ] Handle large files (chunk processing)
- [ ] Unit tests

### 3. Search API Route

#### src/server/routes/search.ts

**Status**: NOT_STARTED

```typescript
// GET /api/search
// Query params: pattern, scope, file, context

function createSearchRoutes(context: ServerContext): Hono;
```

**Checklist**:
- [ ] Implement GET /api/search
- [ ] Handle pattern validation
- [ ] Handle scope selection
- [ ] Return proper errors
- [ ] Unit tests

### 4. Search Store (Client)

#### client/stores/search.ts

**Status**: NOT_STARTED

```typescript
// Search state
interface SearchStore {
  query: string;
  scope: SearchScope;
  results: SearchResult[];
  currentIndex: number;
  loading: boolean;
  error: string | null;
  isOpen: boolean;
}

interface SearchActions {
  setQuery(query: string): void;
  setScope(scope: SearchScope): void;
  search(): Promise<void>;
  nextResult(): void;
  prevResult(): void;
  jumpToResult(index: number): void;
  clear(): void;
  open(): void;
  close(): void;
}

function createSearchStore(): SearchStore & SearchActions;
```

**Checklist**:
- [ ] Implement search store
- [ ] Add all actions
- [ ] Connect to API
- [ ] Handle debounce for typing
- [ ] Unit tests

### 5. Search Input

#### client/components/SearchInput.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let query: string;
  export let scope: SearchScope;
  export let onQueryChange: (query: string) => void;
  export let onScopeChange: (scope: SearchScope) => void;
  export let onSubmit: () => void;
  export let onClose: () => void;

  // Input field with scope toggle
  // Keyboard navigation
</script>
```

**Checklist**:
- [ ] Implement search input
- [ ] Add scope selector
- [ ] Handle Enter to search
- [ ] Handle Escape to close
- [ ] Show regex indicator
- [ ] Unit tests

### 6. Search Results Panel

#### client/components/SearchResults.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let results: SearchResult[];
  export let currentIndex: number;
  export let onSelect: (index: number) => void;

  // List of results with context
  // Highlight current result
  // Click to navigate
</script>
```

**Checklist**:
- [ ] Display results list
- [ ] Show file path and line
- [ ] Highlight match in content
- [ ] Highlight current selection
- [ ] Handle click to navigate
- [ ] Virtual scroll for many results
- [ ] Unit tests

### 7. Search Highlight

#### client/components/SearchHighlight.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let text: string;
  export let matchStart: number;
  export let matchEnd: number;

  // Highlight matched portion
</script>
```

**Checklist**:
- [ ] Split text into parts
- [ ] Apply highlight style to match
- [ ] Handle multiple matches per line
- [ ] Unit tests

### 8. In-File Search Navigation

#### client/lib/search-navigation.ts

**Status**: NOT_STARTED

```typescript
// Navigate to search result in viewer
function navigateToResult(result: SearchResult): void;

// Highlight search matches in current view
function highlightSearchMatches(
  content: string,
  pattern: string
): { start: number; end: number }[];

// Scroll result into view
function scrollResultIntoView(lineNumber: number): void;
```

**Checklist**:
- [ ] Implement navigateToResult()
- [ ] Implement highlightSearchMatches()
- [ ] Implement scrollResultIntoView()
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Search Types | `src/types/search.ts` | COMPLETED | - |
| Search Service | `src/server/search/index.ts` | COMPLETED | - |
| Search Route | `src/server/routes/search.ts` | COMPLETED | - |
| Search Store | `client/src/stores/search.ts` | COMPLETED | - |
| Search Input | `client/components/SearchInput.svelte` | COMPLETED | - |
| Search Results | `client/components/SearchResults.svelte` | COMPLETED | - |
| Search Highlight | `client/components/SearchHighlight.svelte` | COMPLETED | 15 tests |
| Search Navigation | `client/src/lib/search-navigation.ts` | COMPLETED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Search | Server Core | Phase 1 |
| Search | Client Core | Phase 2 |
| Search | Git Operations | Phase 1 |

## Completion Criteria

- [x] Search in current file works
- [x] Search in changed files works
- [x] Search in entire repo works
- [x] Regex patterns supported
- [x] Results display with context
- [x] Result navigation works via UI
- [x] Type checking passes
- [x] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-04
**Tasks Completed**: All tasks (TASK-001 through TASK-008)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented complete search functionality:
- Search Types with validation functions (already existed)
- Search Service with file/changed/all scope support
- Search Route with GET /api/search and /api/search/validate endpoints
- Search Store with state management and navigation
- SearchInput component with scope selector and regex validation
- SearchResults component with grouped results and keyboard navigation
- SearchHighlight component for match highlighting (already existed)
- Search Navigation utilities for result scrolling and viewport detection
- All 459 tests passing, type checking passes

## Related Plans

- **Previous**: 13-session-queue.md
- **Depends On**: 02-server-core.md, 07-client-core.md
