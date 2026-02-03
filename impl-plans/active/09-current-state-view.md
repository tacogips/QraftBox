# Current State View Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#current-state-view-novel-feature
**Phase**: 3
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Novel "Current State View" showing only the latest file state with visual diff annotations. Deleted content shown as thin red lines that expand on tap.

### Scope
**Included**: CurrentStateView component, deleted block markers, expand/collapse logic
**Excluded**: Comments display (comment UI plan), AI prompt integration

---

## Modules

### 1. Current State View Types

#### client/types/current-state.ts

**Status**: NOT_STARTED

```typescript
// Current State View data structures
interface CurrentStateLine {
  lineNumber: number;
  content: string;
  changeType: 'added' | 'modified' | 'unchanged';
  deletedBefore?: DeletedBlock;
}

interface DeletedBlock {
  id: string;
  lines: string[];
  originalStart: number;
  originalEnd: number;
  expanded: boolean;
}

// Transform diff data to current state format
function transformToCurrentState(file: DiffFile): CurrentStateLine[];
```

**Checklist**:
- [ ] Define CurrentStateLine interface
- [ ] Define DeletedBlock interface
- [ ] Implement transformToCurrentState()
- [ ] Unit tests for transformation

### 2. Current State View Container

#### client/components/CurrentStateView.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let file: DiffFile;

  // Transform to current state format
  // Manage expand/collapse state
  // Virtual list for performance
</script>

interface CurrentStateViewProps {
  file: DiffFile;
  onLineSelect?: (line: number) => void;
}
```

**Checklist**:
- [ ] Implement container component
- [ ] Manage deleted block states
- [ ] Integrate virtual list
- [ ] Handle expand all/collapse all
- [ ] Unit tests

### 3. Current State Line

#### client/components/current-state/CurrentStateLine.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let line: CurrentStateLine;
  export let highlighted: string;

  // Green background for added/modified
  // Normal background for unchanged
</script>
```

**Checklist**:
- [ ] Render line with proper background
- [ ] Handle added/modified highlighting
- [ ] Touch-friendly tap target
- [ ] Unit tests

### 4. Deleted Block Marker

#### client/components/current-state/DeletedMarker.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let block: DeletedBlock;
  export let onExpand: () => void;
  export let onCollapse: () => void;

  // Thin red line (1-2px) when collapsed
  // Tap to expand
  // Long-press for preview popup
</script>

<!-- Collapsed: thin red line -->
<!-- Expanded: red background deleted content -->
```

**Checklist**:
- [ ] Render thin red line when collapsed
- [ ] Handle tap to expand
- [ ] Handle long-press for preview
- [ ] Show expand hint on hover/focus
- [ ] Unit tests

### 5. Expanded Deleted Block

#### client/components/current-state/ExpandedDeletedBlock.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let block: DeletedBlock;
  export let onCollapse: () => void;

  // Red background
  // Show deleted lines
  // Collapse button
</script>
```

**Checklist**:
- [ ] Render deleted content with red background
- [ ] Show line numbers (original)
- [ ] Add collapse button
- [ ] Animate expand/collapse
- [ ] Unit tests

### 6. Expand/Collapse Controls

#### client/components/current-state/ExpandControls.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let hasDeletedBlocks: boolean;
  export let allExpanded: boolean;
  export let onExpandAll: () => void;
  export let onCollapseAll: () => void;
</script>

<!-- Expand All / Collapse All buttons -->
```

**Checklist**:
- [ ] Implement expand/collapse all buttons
- [ ] Show state (all expanded, all collapsed, mixed)
- [ ] Keyboard shortcuts (zR, zM)
- [ ] Unit tests

### 7. Current State Store

#### client/stores/current-state.ts

**Status**: NOT_STARTED

```typescript
// Store for managing expanded/collapsed state
interface CurrentStateStore {
  expandedBlocks: Set<string>;
  toggleBlock(blockId: string): void;
  expandAll(): void;
  collapseAll(): void;
  isExpanded(blockId: string): boolean;
}

function createCurrentStateStore(): CurrentStateStore;
```

**Checklist**:
- [ ] Implement store
- [ ] Add toggle/expand/collapse actions
- [ ] Persist state per file
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| CS Types | `client/types/current-state.ts` | NOT_STARTED | - |
| CSView Container | `client/components/CurrentStateView.svelte` | NOT_STARTED | - |
| CS Line | `client/components/current-state/CurrentStateLine.svelte` | NOT_STARTED | - |
| Deleted Marker | `client/components/current-state/DeletedMarker.svelte` | NOT_STARTED | - |
| Expanded Block | `client/components/current-state/ExpandedDeletedBlock.svelte` | NOT_STARTED | - |
| Expand Controls | `client/components/current-state/ExpandControls.svelte` | NOT_STARTED | - |
| CS Store | `client/stores/current-state.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| CS View | Client Core | Phase 2 |
| CS View | Diff View (shared) | Phase 2 |
| CS View | Virtual list | Phase 2 |

## Completion Criteria

- [ ] Current state view shows latest file content
- [ ] Added/modified lines highlighted green
- [ ] Deleted content shown as thin red lines
- [ ] Tap on red line expands deleted content
- [ ] Expand all/collapse all works
- [ ] Virtual scrolling works for large files
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 08-diff-view.md
- **Next**: 10-file-tree.md
- **Depends On**: 07-client-core.md, 08-diff-view.md (shared components)
