# Session Queue System Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#session-queue-screen
**Phase**: 4
**Created**: 2026-02-03
**Last Updated**: 2026-02-04

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Dedicated screen for managing AI sessions with queue display, session detail view, conversation history in chat/carousel modes, and queue operations.

### Scope
**Included**: Session queue screen, session card, conversation views (chat/carousel), queue management
**Excluded**: AI prompt submission (AI integration plan), backend queue logic (AI integration plan)

---

## Modules

### 1. Queue Store

#### client/src/stores/queue.ts

**Status**: COMPLETED

```typescript
// Queue state management
interface QueueStore {
  running: AISession[];
  queued: AISession[];
  completed: AISession[];
  selectedSessionId: string | null;
  viewMode: ConversationViewMode;
  loading: boolean;
}

interface QueueActions {
  loadQueue(): Promise<void>;
  selectSession(id: string): void;
  cancelSession(id: string): Promise<void>;
  runNow(id: string): Promise<void>;
  removeFromQueue(id: string): Promise<void>;
  reorderQueue(id: string, newPosition: number): Promise<void>;
  clearCompleted(): Promise<void>;
  setViewMode(mode: ConversationViewMode): void;
}

function createQueueStore(): QueueStore & QueueActions;
```

**Checklist**:
- [x] Implement queue store
- [x] Add all actions
- [x] Connect to API (stubbed)
- [x] Handle SSE updates
- [x] Unit tests

### 2. Session Queue Screen

#### client/components/session/SessionQueueScreen.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  // Load queue on mount
  // Handle navigation back to diff
</script>

<!-- Session Queue Screen layout -->
<!-- Running, Queued, Completed sections -->
```

**Checklist**:
- [x] Implement queue screen layout
- [x] Add running section
- [x] Add queued section
- [x] Add completed section
- [x] Add back navigation
- [x] Add clear completed button
- [x] Unit tests

### 3. Session Card

#### client/components/session/SessionCard.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let session: AISession;
  export let variant: 'running' | 'queued' | 'completed';
  export let onSelect: () => void;
  export let onCancel?: () => void;
  export let onRunNow?: () => void;
  export let onRemove?: () => void;

  // Card with session summary
  // Actions based on variant
  // Tap to expand/select
</script>
```

**Checklist**:
- [x] Display session info
- [x] Show status indicator
- [x] Show context (file, lines)
- [x] Add variant-specific actions
- [x] Handle tap/click
- [x] Swipe for actions on mobile
- [x] Unit tests

### 4. Running Session Display

#### client/components/session/RunningSession.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let session: AISession;
  export let onCancel: () => void;

  // Live progress indicator
  // Current tool call display
  // Cancel button
</script>
```

**Checklist**:
- [x] Show running animation
- [x] Display current activity
- [x] Show elapsed time
- [x] Add cancel button
- [x] Connect to SSE stream
- [x] Unit tests

### 5. Session Detail View

#### client/components/session/SessionDetailView.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  // Load session by ID
  // Conversation history display
  // View mode toggle (chat/carousel)
</script>
```

**Checklist**:
- [x] Load session detail
- [x] Show conversation history
- [x] Add view mode toggle
- [x] Handle navigation
- [x] Unit tests

### 6. Conversation Chat View

#### client/components/session/ConversationChatView.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let turns: ConversationTurn[];

  // Vertical scrolling chat layout
  // User messages with blue border
  // Assistant messages with green border
  // Tool calls displayed inline
</script>
```

**Checklist**:
- [x] Implement vertical layout
- [x] Style user/assistant messages
- [x] Display tool calls
- [x] Virtual scroll for long conversations
- [x] Unit tests

### 7. Conversation Carousel View

#### client/components/session/ConversationCarousel.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let turns: ConversationTurn[];
  export let currentIndex: number;
  export let onIndexChange: (index: number) => void;

  // Horizontal card carousel
  // Swipe/arrow navigation
  // Pagination dots
</script>
```

**Checklist**:
- [x] Implement horizontal carousel
- [x] Add swipe navigation
- [x] Add arrow buttons
- [x] Add pagination dots
- [x] Handle keyboard (left/right)
- [x] Unit tests

### 8. Message Card

#### client/components/session/MessageCard.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let turn: ConversationTurn;

  // Role header (USER/ASSISTANT)
  // Content with markdown rendering
  // Tool calls section (collapsed by default)
</script>
```

**Checklist**:
- [x] Display role header
- [x] Render markdown content
- [x] Show tool calls
- [x] Expand/collapse tool details
- [x] Unit tests

### 9. Tool Call Display

#### client/components/session/ToolCallDisplay.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let toolCall: ToolCall;

  // Tool name and status
  // Collapsed by default
  // Expand to see input/output
</script>
```

**Checklist**:
- [x] Display tool name
- [x] Show status icon
- [x] Collapse by default
- [x] Expand to show details
- [x] Truncate long output
- [x] Unit tests

### 10. Session Stats Footer

#### client/components/session/SessionStats.svelte

**Status**: COMPLETED

```svelte
<script lang="ts">
  export let session: AISession;

  // Duration, Cost, Token counts
</script>
```

**Checklist**:
- [x] Display duration
- [x] Display cost (if available)
- [x] Display token counts
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Queue Store | `client/src/stores/queue.ts` | COMPLETED | - |
| Queue Screen | `client/components/session/SessionQueueScreen.svelte` | COMPLETED | - |
| Session Card | `client/components/session/SessionCard.svelte` | COMPLETED | - |
| Running Session | `client/components/session/RunningSession.svelte` | COMPLETED | - |
| Session Detail | `client/components/session/SessionDetailView.svelte` | COMPLETED | - |
| Chat View | `client/components/session/ConversationChatView.svelte` | COMPLETED | - |
| Carousel View | `client/components/session/ConversationCarousel.svelte` | COMPLETED | - |
| Message Card | `client/components/session/MessageCard.svelte` | COMPLETED | - |
| Tool Display | `client/components/session/ToolCallDisplay.svelte` | COMPLETED | - |
| Session Stats | `client/components/session/SessionStats.svelte` | COMPLETED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Session Queue | AI Integration | Completed |
| Session Queue | Client Core | Completed |
| Session Queue | Routing | Completed |

## Completion Criteria

- [x] Queue screen shows all session states
- [x] Session cards display correctly
- [x] Running sessions show live progress
- [x] Queue operations (cancel, run now, remove) work
- [x] Session detail shows conversation
- [x] Chat and carousel views work
- [x] Tool calls display correctly
- [x] Type checking passes
- [x] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

### Session: 2026-02-04
**Tasks Completed**: All tasks (TASK-001 through TASK-010)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented complete session queue system:
- Queue Store with running/queued/completed lists, SSE event handling
- SessionQueueScreen with sections for each session state
- SessionCard with variant-specific actions (cancel, run now, remove)
- RunningSession with live progress, elapsed time counter
- SessionDetailView with view mode toggle (chat/carousel)
- ConversationChatView with vertical scrolling, auto-scroll
- ConversationCarousel with swipe/keyboard navigation, pagination dots
- MessageCard with role headers, tool calls section (collapsible)
- ToolCallDisplay with status icons, expandable input/output
- SessionStats with duration, cost, token counts
- All 459 tests passing, type checking passes

## Related Plans

- **Previous**: 12-ai-integration.md
- **Next**: 14-search.md
- **Depends On**: 12-ai-integration.md (AI types, API)
