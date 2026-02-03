# Diff View Components Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#github-style-diff-view-default
**Phase**: 2
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
GitHub-style side-by-side diff view with virtual scrolling for large files, syntax highlighting, and touch-friendly interactions.

### Scope
**Included**: DiffView component, line rendering, virtual list, side-by-side and inline modes
**Excluded**: Current State View (separate plan), comment display (comment UI plan)

---

## Modules

### 1. Diff View Container

#### client/components/DiffView.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let file: DiffFile;
  export let mode: 'side-by-side' | 'inline';

  // Virtual list integration
  // Syntax highlighting integration
  // Scroll synchronization (side-by-side)
</script>

<!-- Props interface -->
interface DiffViewProps {
  file: DiffFile;
  mode: 'side-by-side' | 'inline';
  onLineSelect?: (line: number) => void;
  highlightedLines?: number[];
}
```

**Checklist**:
- [ ] Implement DiffView container
- [ ] Handle mode switching
- [ ] Integrate virtual list
- [ ] Add line selection handling
- [ ] Add touch gesture support
- [ ] Unit tests

### 2. Side-by-Side View

#### client/components/diff/SideBySideDiff.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let chunks: DiffChunk[];
  export let oldContent: string[];
  export let newContent: string[];

  // Synchronized scrolling between panes
  // Line number columns
  // Change highlighting
</script>

<!-- Two-pane layout with synced scroll -->
```

**Checklist**:
- [ ] Implement two-pane layout
- [ ] Add synchronized scrolling
- [ ] Render old/new content side by side
- [ ] Highlight added/deleted lines
- [ ] Add line number columns
- [ ] Unit tests

### 3. Inline Diff View

#### client/components/diff/InlineDiff.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let chunks: DiffChunk[];

  // Single column with +/- indicators
  // Change type background colors
</script>
```

**Checklist**:
- [ ] Implement single-column layout
- [ ] Show +/- indicators
- [ ] Color-code added/deleted lines
- [ ] Handle context lines
- [ ] Unit tests

### 4. Diff Line Component

#### client/components/diff/DiffLine.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let change: DiffChange;
  export let lineNumber: number;
  export let highlighted: string;  // HTML from Shiki

  // Touch target (44px minimum)
  // Line selection on tap
  // Long-press for context menu
</script>

<!-- Line rendering with proper touch targets -->
```

**Checklist**:
- [ ] Implement line component
- [ ] Add touch-friendly tap targets (44px)
- [ ] Handle line selection
- [ ] Add long-press gesture
- [ ] Show syntax highlighted content
- [ ] Unit tests

### 5. Virtual List Integration

#### client/components/diff/VirtualDiffList.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  import VirtualList from 'svelte-tiny-virtual-list';

  export let items: DiffChange[];
  export let itemHeight: number;

  // Render only visible items
  // Handle scroll position restoration
</script>
```

**Checklist**:
- [ ] Integrate svelte-tiny-virtual-list
- [ ] Calculate item heights
- [ ] Handle scroll position
- [ ] Optimize for large files (500+ lines)
- [ ] Unit tests

### 6. Diff Header

#### client/components/diff/DiffHeader.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let file: DiffFile;
  export let viewMode: ViewMode;

  // File path display
  // Stats (+N -M)
  // View mode toggle
</script>

<!-- File header with stats and controls -->
```

**Checklist**:
- [ ] Display file path
- [ ] Show addition/deletion counts
- [ ] Add view mode toggle button
- [ ] Handle file status badge
- [ ] Unit tests

### 7. Chunk Separator

#### client/components/diff/ChunkSeparator.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let chunk: DiffChunk;

  // @@ -a,b +c,d @@ display
  // Expand collapsed context button
</script>
```

**Checklist**:
- [ ] Display chunk header
- [ ] Add expand context button
- [ ] Show line range info
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| DiffView | `client/components/DiffView.svelte` | NOT_STARTED | - |
| SideBySide | `client/components/diff/SideBySideDiff.svelte` | NOT_STARTED | - |
| InlineDiff | `client/components/diff/InlineDiff.svelte` | NOT_STARTED | - |
| DiffLine | `client/components/diff/DiffLine.svelte` | NOT_STARTED | - |
| VirtualList | `client/components/diff/VirtualDiffList.svelte` | NOT_STARTED | - |
| DiffHeader | `client/components/diff/DiffHeader.svelte` | NOT_STARTED | - |
| ChunkSeparator | `client/components/diff/ChunkSeparator.svelte` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| DiffView | Client Core | Phase 2 |
| DiffView | svelte-tiny-virtual-list | To install |
| DiffView | Shiki highlighter | Phase 2 |

## Completion Criteria

- [ ] Side-by-side view renders correctly
- [ ] Inline view renders correctly
- [ ] Virtual scrolling works for large files
- [ ] Syntax highlighting displays
- [ ] Lines are selectable via touch/click
- [ ] View mode can be toggled
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 07-client-core.md
- **Next**: 09-current-state-view.md
- **Depends On**: 07-client-core.md (stores, highlighter)
