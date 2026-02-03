# Search Functionality Implementation Plan

**Status**: Ready
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

### 9. Search Keyboard Shortcuts

#### client/lib/search-shortcuts.ts

**Status**: NOT_STARTED

```typescript
// Search-related keyboard shortcuts
const SEARCH_SHORTCUTS = {
  '/': 'Search in current file',
  '<Space>/': 'Search in changed files',
  '<Space><Space>/': 'Search in entire repo',
  'n': 'Next search result',
  'N': 'Previous search result',
  '*': 'Search word under cursor',
  'Ctrl+p': 'File fuzzy finder (future)',
};

function registerSearchShortcuts(handlers: SearchHandlers): void;
```

**Checklist**:
- [ ] Implement shortcut registration
- [ ] Handle scope shortcuts
- [ ] Handle navigation shortcuts
- [ ] Handle word under cursor
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Search Types | `src/types/search.ts` | NOT_STARTED | - |
| Search Service | `src/server/search/index.ts` | NOT_STARTED | - |
| Search Route | `src/server/routes/search.ts` | NOT_STARTED | - |
| Search Store | `client/stores/search.ts` | NOT_STARTED | - |
| Search Input | `client/components/SearchInput.svelte` | NOT_STARTED | - |
| Search Results | `client/components/SearchResults.svelte` | NOT_STARTED | - |
| Search Highlight | `client/components/SearchHighlight.svelte` | NOT_STARTED | - |
| Search Navigation | `client/lib/search-navigation.ts` | NOT_STARTED | - |
| Search Shortcuts | `client/lib/search-shortcuts.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Search | Server Core | Phase 1 |
| Search | Client Core | Phase 2 |
| Search | Git Operations | Phase 1 |

## Completion Criteria

- [ ] Search in current file works
- [ ] Search in changed files works
- [ ] Search in entire repo works
- [ ] Regex patterns supported
- [ ] Results display with context
- [ ] Navigation (n/N) works
- [ ] Keyboard shortcuts work
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 13-session-queue.md
- **Depends On**: 02-server-core.md, 07-client-core.md
