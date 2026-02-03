# File Tree Component Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#file-tree
**Phase**: 2
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Collapsible file tree with diff-only/all-files toggle, status badges ([M], [+], [-]), and touch-friendly navigation.

### Scope
**Included**: FileTree component, directory nodes, file nodes, status badges, mode toggle
**Excluded**: Search functionality (search plan), comment indicators

---

## Modules

### 1. File Tree Container

#### client/components/FileTree.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let tree: FileNode;
  export let mode: 'diff' | 'all';
  export let selectedPath: string | null;
  export let onFileSelect: (path: string) => void;
  export let onModeChange: (mode: 'diff' | 'all') => void;

  // Virtual list for large trees (100+ files)
  // Touch gestures: tap to select, swipe for quick actions
</script>
```

**Checklist**:
- [ ] Implement container component
- [ ] Add mode toggle header
- [ ] Integrate virtual list for large trees
- [ ] Handle file selection
- [ ] Unit tests

### 2. Directory Node

#### client/components/file-tree/DirectoryNode.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let node: FileNode;
  export let depth: number;
  export let expanded: boolean;
  export let onToggle: () => void;
  export let hasChangedChildren: boolean;

  // Expand/collapse on tap
  // Indicator for containing changed files
</script>
```

**Checklist**:
- [ ] Render directory with expand/collapse
- [ ] Show change indicator if children modified
- [ ] Handle touch tap
- [ ] Add proper indentation
- [ ] Animate expand/collapse
- [ ] Unit tests

### 3. File Node

#### client/components/file-tree/FileNode.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let node: FileNode;
  export let depth: number;
  export let selected: boolean;
  export let onSelect: () => void;

  // Status badge ([M], [+], [-])
  // Touch target (48px height)
  // Swipe for quick actions
</script>
```

**Checklist**:
- [ ] Render file with status badge
- [ ] Handle touch tap selection
- [ ] Show selected state
- [ ] Add proper indentation
- [ ] Touch target 48px minimum
- [ ] Unit tests

### 4. Status Badge

#### client/components/file-tree/StatusBadge.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let status: 'added' | 'modified' | 'deleted' | undefined;

  // [M] Modified - Yellow/Orange
  // [+] Added - Green
  // [-] Deleted - Red
</script>
```

**Checklist**:
- [ ] Render appropriate badge
- [ ] Apply correct colors
- [ ] Handle undefined (no badge)
- [ ] Unit tests

### 5. Mode Toggle

#### client/components/file-tree/ModeToggle.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let mode: 'diff' | 'all';
  export let changedCount: number;
  export let totalCount: number;
  export let onChange: (mode: 'diff' | 'all') => void;
</script>

<!-- Toggle between "Diff Only" and "All Files" -->
```

**Checklist**:
- [ ] Render toggle buttons
- [ ] Show file counts
- [ ] Handle mode change
- [ ] Touch-friendly buttons (44px)
- [ ] Unit tests

### 6. File Tree Quick Actions

#### client/components/file-tree/QuickActions.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let path: string;
  export let onCopyPath: () => void;
  export let onOpenInNew: () => void;
</script>

<!-- Context menu / swipe actions -->
```

**Checklist**:
- [ ] Implement quick actions menu
- [ ] Copy path action
- [ ] Open in new tab action (future)
- [ ] Long-press trigger on mobile
- [ ] Unit tests

### 7. Tree Navigation

#### client/lib/tree-navigation.ts

**Status**: NOT_STARTED

```typescript
// Flatten tree for virtual list
function flattenTree(tree: FileNode, expandedPaths: Set<string>): FlatTreeNode[];

// Get next/previous file with changes
function getNextChangedFile(tree: FileNode, currentPath: string): string | null;
function getPrevChangedFile(tree: FileNode, currentPath: string): string | null;

// Filter tree by mode
function filterTreeByMode(tree: FileNode, mode: 'diff' | 'all'): FileNode;
```

**Checklist**:
- [ ] Implement flattenTree()
- [ ] Implement getNextChangedFile()
- [ ] Implement getPrevChangedFile()
- [ ] Implement filterTreeByMode()
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| FileTree | `client/components/FileTree.svelte` | NOT_STARTED | - |
| DirectoryNode | `client/components/file-tree/DirectoryNode.svelte` | NOT_STARTED | - |
| FileNode | `client/components/file-tree/FileNode.svelte` | NOT_STARTED | - |
| StatusBadge | `client/components/file-tree/StatusBadge.svelte` | NOT_STARTED | - |
| ModeToggle | `client/components/file-tree/ModeToggle.svelte` | NOT_STARTED | - |
| QuickActions | `client/components/file-tree/QuickActions.svelte` | NOT_STARTED | - |
| TreeNavigation | `client/lib/tree-navigation.ts` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| FileTree | Client Core | Phase 2 |
| FileTree | Files Store | Phase 2 |
| FileTree | Virtual list | Phase 2 |

## Completion Criteria

- [ ] File tree displays correctly
- [ ] Directories expand/collapse
- [ ] Status badges show correctly
- [ ] Mode toggle switches between diff/all
- [ ] File selection works
- [ ] Virtual list for 100+ files
- [ ] Touch gestures work
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 09-current-state-view.md
- **Next**: 11-comment-ui.md
- **Depends On**: 07-client-core.md (stores)
