# Session Queue System Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#session-queue-screen
**Phase**: 4
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

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

#### client/stores/queue.ts

**Status**: NOT_STARTED

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
- [ ] Implement queue store
- [ ] Add all actions
- [ ] Connect to API
- [ ] Handle SSE updates
- [ ] Unit tests

### 2. Session Queue Screen

#### client/routes/sessions/+page.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  // Load queue on mount
  // Handle navigation back to diff
</script>

<!-- Session Queue Screen layout -->
<!-- Running, Queued, Completed sections -->
```

**Checklist**:
- [ ] Implement queue screen layout
- [ ] Add running section
- [ ] Add queued section
- [ ] Add completed section
- [ ] Add back navigation
- [ ] Add clear completed button
- [ ] Unit tests

### 3. Session Card

#### client/components/session/SessionCard.svelte

**Status**: NOT_STARTED

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
- [ ] Display session info
- [ ] Show status indicator
- [ ] Show context (file, lines)
- [ ] Add variant-specific actions
- [ ] Handle tap/click
- [ ] Swipe for actions on mobile
- [ ] Unit tests

### 4. Running Session Display

#### client/components/session/RunningSession.svelte

**Status**: NOT_STARTED

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
- [ ] Show running animation
- [ ] Display current activity
- [ ] Show elapsed time
- [ ] Add cancel button
- [ ] Connect to SSE stream
- [ ] Unit tests

### 5. Session Detail View

#### client/routes/sessions/[id]/+page.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  // Load session by ID
  // Conversation history display
  // View mode toggle (chat/carousel)
</script>
```

**Checklist**:
- [ ] Load session detail
- [ ] Show conversation history
- [ ] Add view mode toggle
- [ ] Handle navigation
- [ ] Unit tests

### 6. Conversation Chat View

#### client/components/session/ConversationChatView.svelte

**Status**: NOT_STARTED

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
- [ ] Implement vertical layout
- [ ] Style user/assistant messages
- [ ] Display tool calls
- [ ] Virtual scroll for long conversations
- [ ] Unit tests

### 7. Conversation Carousel View

#### client/components/session/ConversationCarousel.svelte

**Status**: NOT_STARTED

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
- [ ] Implement horizontal carousel
- [ ] Add swipe navigation
- [ ] Add arrow buttons
- [ ] Add pagination dots
- [ ] Handle keyboard (left/right)
- [ ] Unit tests

### 8. Message Card

#### client/components/session/MessageCard.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let turn: ConversationTurn;

  // Role header (USER/ASSISTANT)
  // Content with markdown rendering
  // Tool calls section (collapsed by default)
</script>
```

**Checklist**:
- [ ] Display role header
- [ ] Render markdown content
- [ ] Show tool calls
- [ ] Expand/collapse tool details
- [ ] Unit tests

### 9. Tool Call Display

#### client/components/session/ToolCallDisplay.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let toolCall: ToolCall;

  // Tool name and status
  // Collapsed by default
  // Expand to see input/output
</script>
```

**Checklist**:
- [ ] Display tool name
- [ ] Show status icon
- [ ] Collapse by default
- [ ] Expand to show details
- [ ] Truncate long output
- [ ] Unit tests

### 10. Session Stats Footer

#### client/components/session/SessionStats.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let session: AISession;

  // Duration, Cost, Token counts
</script>
```

**Checklist**:
- [ ] Display duration
- [ ] Display cost (if available)
- [ ] Display token counts
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Queue Store | `client/stores/queue.ts` | NOT_STARTED | - |
| Queue Screen | `client/routes/sessions/+page.svelte` | NOT_STARTED | - |
| Session Card | `client/components/session/SessionCard.svelte` | NOT_STARTED | - |
| Running Session | `client/components/session/RunningSession.svelte` | NOT_STARTED | - |
| Session Detail | `client/routes/sessions/[id]/+page.svelte` | NOT_STARTED | - |
| Chat View | `client/components/session/ConversationChatView.svelte` | NOT_STARTED | - |
| Carousel View | `client/components/session/ConversationCarousel.svelte` | NOT_STARTED | - |
| Message Card | `client/components/session/MessageCard.svelte` | NOT_STARTED | - |
| Tool Display | `client/components/session/ToolCallDisplay.svelte` | NOT_STARTED | - |
| Session Stats | `client/components/session/SessionStats.svelte` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Session Queue | AI Integration | Phase 4 |
| Session Queue | Client Core | Phase 2 |
| Session Queue | Routing | Phase 2 |

## Completion Criteria

- [ ] Queue screen shows all session states
- [ ] Session cards display correctly
- [ ] Running sessions show live progress
- [ ] Queue operations (cancel, run now, remove) work
- [ ] Session detail shows conversation
- [ ] Chat and carousel views work
- [ ] Tool calls display correctly
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 12-ai-integration.md
- **Next**: 14-search.md
- **Depends On**: 12-ai-integration.md (AI types, API)
