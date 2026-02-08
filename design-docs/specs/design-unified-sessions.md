# Unified Sessions Screen Design Specification

## Overview

This document describes the design for merging the separate "Queue" and "Sessions" header tabs into a single unified "Sessions" tab. QraftBox-created AI sessions (running, queued, completed) and Claude CLI sessions (from `~/.claude/projects/`) are presented in one cohesive interface with internal sub-navigation.

## Problem Statement

The current UI has two separate screens for session-related content:

1. **Sessions tab** (`ClaudeSessionsScreen`): Browses historical Claude Code sessions stored in `~/.claude/projects/`. Read-only with resume capability.
2. **Queue tab** (`SessionQueueScreen`): Manages QraftBox-spawned AI sessions (running, queued, completed). Full lifecycle control.

This separation creates confusion because:
- Users must switch tabs to see all their sessions
- Completed QraftBox sessions and Claude CLI sessions are logically the same thing (past work)
- The "Queue" naming obscures that these are also sessions
- Running/queued sessions have no visibility from the Sessions tab

## Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Single "Sessions" header tab (remove "Queue") | Must |
| R2 | Internal sub-navigation: Active / History | Must |
| R3 | Active section: running + queued sessions with real-time status | Must |
| R4 | History section: completed QraftBox + Claude CLI sessions, merged chronologically | Must |
| R5 | Source badges ("qraftbox" / "claude-cli") on all session cards | Must |
| R6 | Retain all existing controls per session type | Must |
| R7 | Keep filter/search for History section | Must |
| R8 | Date grouping for History (Today, Yesterday, Older) | Must |
| R9 | Pagination for History section | Should |
| R10 | Active section inline status counts (running, queued) | Should |

## Architecture

### Navigation Changes

**Before:**
```
ScreenType = "diff" | "commits" | "sessions" | "queue" | "worktree" | "tools"
```

**After:**
```
ScreenType = "diff" | "commits" | "sessions" | "worktree" | "tools"
```

Remove the `"queue"` screen type entirely. The unified Sessions screen subsumes both.

### Internal Sub-Navigation

The unified Sessions screen uses an internal sub-tab to switch between two views:

```
SessionsSubView = "active" | "history"
```

- **Active**: Displays running sessions (with live status, elapsed time, cancel) and queued sessions (with run-now, cancel, reorder, remove). This replaces `SessionQueueScreen`.
- **History**: Displays completed/failed/cancelled QraftBox sessions merged with all Claude CLI sessions in chronological order. This replaces `ClaudeSessionsScreen`.

## Data Model

### Unified Session Item

Both session types are rendered in the same list but retain their distinct data shapes. A discriminated union is used:

```typescript
// Discriminated union for unified display
type UnifiedSessionItem =
  | { kind: "qraftbox"; session: AISession }
  | { kind: "claude-cli"; session: ExtendedSessionEntry };
```

The `kind` field drives source badge rendering and available actions.

### Active Section Data

The Active section draws from the existing queue store (`QueueStoreState`):
- `running: AISession[]` -- sessions with `state === "running"`
- `queued: AISession[]` -- sessions with `state === "queued"`

No data model changes needed; the queue store is reused directly.

### History Section Data

The History section merges two sources:

1. **Completed QraftBox sessions**: `AISession[]` where `state` is `"completed" | "failed" | "cancelled"` (from queue store's `completed` list)
2. **Claude CLI sessions**: `ExtendedSessionEntry[]` (from claude-sessions store)

These are merged into a single chronologically sorted list using a common sort key:
- QraftBox sessions: `completedAt ?? createdAt`
- Claude CLI sessions: `modified`

## Component Architecture

### New Components

```
client/components/sessions/
  UnifiedSessionsScreen.svelte    # Top-level unified screen
  ActiveSessionsPanel.svelte      # Running + Queued sections
  HistorySessionsPanel.svelte     # Merged completed + CLI sessions
  UnifiedSessionCard.svelte       # Renders either session type with source badge
  SubTabNav.svelte                # Active/History sub-tab selector
```

### Reused Components

The following existing components are reused without modification:

| Component | Used In | Purpose |
|-----------|---------|---------|
| `session/RunningSession.svelte` | ActiveSessionsPanel | Live running session display |
| `session/SessionCard.svelte` | ActiveSessionsPanel | Queue session card (queued/completed variants) |
| `claude-sessions/SessionCard.svelte` | HistorySessionsPanel | Claude CLI session card |
| `claude-sessions/SearchInput.svelte` | HistorySessionsPanel | Search box |
| `claude-sessions/FilterPanel.svelte` | HistorySessionsPanel | Filter panel |

### Removed Components

| Component | Reason |
|-----------|--------|
| `session/SessionQueueScreen.svelte` | Replaced by UnifiedSessionsScreen + ActiveSessionsPanel |
| `claude-sessions/ClaudeSessionsScreen.svelte` | Replaced by UnifiedSessionsScreen + HistorySessionsPanel |

These files can be removed after the unified screen is complete and wired up.

## UI Design

### Unified Sessions Screen Layout

```
+---------------------------------------------------------------------+
| [<- Back]  Sessions                                                 |
+---------------------------------------------------------------------+
| [  Active (2 running, 3 queued)  ] [  History  ]                    |
+---------------------------------------------------------------------+
|                                                                     |
|  (Content based on selected sub-tab)                                |
|                                                                     |
+---------------------------------------------------------------------+
```

### Active Sub-Tab

```
+---------------------------------------------------------------------+
| [  Active (2 running, 3 queued)  ] [  History  ]                    |
+---------------------------------------------------------------------+
|                                                                     |
| RUNNING (2)                                                         |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Fix auth bug                           01:23 elapsed|  |
| |   Thinking...                                    [Cancel]      |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Update tests                           00:45 elapsed|  |
| |   Using Edit tool...                             [Cancel]      |  |
| +----------------------------------------------------------------+  |
|                                                                     |
| QUEUED (3)                                                          |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Refactor parser      #1        [Run Now] [Remove]   |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Add docs             #2        [Run Now] [Remove]   |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Fix lint errors       #3        [Run Now] [Remove]   |  |
| +----------------------------------------------------------------+  |
|                                                                     |
+---------------------------------------------------------------------+
```

When there are no running or queued sessions:

```
+---------------------------------------------------------------------+
| [  Active (idle)  ] [  History  ]                                   |
+---------------------------------------------------------------------+
|                                                                     |
|   No active sessions.                                               |
|   Submit a prompt from the Diff view to start one.                  |
|                                                                     |
+---------------------------------------------------------------------+
```

### History Sub-Tab

```
+---------------------------------------------------------------------+
| [  Active  ] [  History (234 sessions)  ]                           |
+---------------------------------------------------------------------+
| [Search sessions...]                    [Filters v]                 |
+---------------------------------------------------------------------+
|                                                                     |
| TODAY                                                               |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Fix auth bug                  completed    2h ago   |  |
| |   /g/gits/tacogips/qraftbox  |  main  |  12 msgs              |  |
| |                                              [View]            |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [CLI] Update README docs                              3h ago   |  |
| |   /g/gits/tacogips/qraftbox  |  main  |  5 msgs               |  |
| |                                       [Resume] [View]          |  |
| +----------------------------------------------------------------+  |
|                                                                     |
| YESTERDAY                                                           |
| +----------------------------------------------------------------+  |
| | [QRAFTBOX] Refactor parser               failed      1d ago   |  |
| |   /g/gits/tacogips/qraftbox  |  feature  |  8 msgs            |  |
| |                                              [View]            |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [CLI] Fix auth in other project                       1d ago   |  |
| |   /g/gits/tacogips/other  |  main  |  20 msgs                 |  |
| |                                       [Resume] [View]          |  |
| +----------------------------------------------------------------+  |
|                                                                     |
| OLDER                                                               |
| ...                                                                 |
|                                                                     |
| [Load More]                                                         |
+---------------------------------------------------------------------+
```

### Source Badges

Each session card displays a source badge:

| Source | Badge | Style |
|--------|-------|-------|
| QraftBox | `[QRAFTBOX]` | Accent color background |
| Claude CLI | `[CLI]` | Muted/secondary background |

### Session Card Actions by Type

| Action | QraftBox Running | QraftBox Queued | QraftBox Completed | Claude CLI |
|--------|-----------------|-----------------|-------------------|------------|
| Cancel | Yes | - | - | - |
| Run Now | - | Yes | - | - |
| Remove | - | Yes | - | - |
| Reorder | - | Yes | - | - |
| View | - | - | Yes | Yes |
| Resume | - | - | - | Yes |
| Clear All | - | - | Yes (bulk) | - |

## Store Architecture

### Option A: Composition of Existing Stores (Recommended)

Keep both existing stores (`createQueueStore` and `createClaudeSessionsStore`) and compose them in the unified screen component. No store refactoring needed.

```typescript
// In UnifiedSessionsScreen.svelte
const queueStore = createQueueStore();
// claudeSessionsStore is a singleton, imported directly

// Active tab reads from queueStore
// History tab merges queueStore.completed + claudeSessionsStore.sessions
```

**Rationale**: Minimizes changes, avoids breaking existing functionality, and each store already handles its own API calls, caching, and state management.

### History Merge Logic

The History panel merges completed QraftBox sessions with Claude CLI sessions:

```typescript
// Pseudocode for merged history
function mergeHistory(
  completedQraftBox: AISession[],
  claudeSessions: ExtendedSessionEntry[]
): UnifiedSessionItem[] {
  const items: UnifiedSessionItem[] = [];

  for (const s of completedQraftBox) {
    items.push({ kind: "qraftbox", session: s });
  }
  for (const s of claudeSessions) {
    items.push({ kind: "claude-cli", session: s });
  }

  // Sort by most recent first
  items.sort((a, b) => {
    const dateA = a.kind === "qraftbox"
      ? (a.session.completedAt ?? a.session.createdAt)
      : a.session.modified;
    const dateB = b.kind === "qraftbox"
      ? (b.session.completedAt ?? b.session.createdAt)
      : b.session.modified;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return items;
}
```

### Date Grouping

The existing `getDateGroup()` logic from `ClaudeSessionsScreen` is reused for the merged list:

```typescript
function getDateGroup(dateStr: string): "today" | "yesterday" | "older" {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  if (date >= today) return "today";
  if (date >= yesterday) return "yesterday";
  return "older";
}
```

## Server Changes

No server-side changes are required. The existing API endpoints are sufficient:

| Endpoint | Used By | Purpose |
|----------|---------|---------|
| `/api/ai/sessions` | Queue store | List QraftBox sessions |
| `/api/ai/sessions/:id/cancel` | Queue store | Cancel running/queued session |
| `/api/ai/queue/status` | Header badges | Queue counts |
| `/api/claude/sessions` | Claude sessions store | List Claude CLI sessions |
| `/api/claude/sessions/:id` | Claude sessions store | Session details |
| `/api/claude/sessions/:id/resume` | Claude sessions store | Resume CLI session |
| `/api/claude/projects` | Claude sessions store | List projects for filtering |

## App.svelte Changes

### ScreenType Update

Remove `"queue"` from `ScreenType`:

```typescript
type ScreenType = "diff" | "commits" | "sessions" | "worktree" | "tools";
```

### Header Navigation Update

Remove the "Queue" button from the header nav. The "Sessions" button remains and navigates to the unified screen.

### Screen Rendering Update

Replace the separate `{:else if currentScreen === "sessions"}` and `{:else if currentScreen === "queue"}` blocks with a single block rendering `UnifiedSessionsScreen`.

### Import Update

Remove imports of `ClaudeSessionsScreen` and `SessionQueueScreen`. Add import of `UnifiedSessionsScreen`.

## Sub-Tab State Management

The active sub-tab is local state within `UnifiedSessionsScreen`. Default sub-tab is `"active"` when there are running or queued sessions, otherwise `"history"`.

```typescript
// Default to Active if there are active sessions, otherwise History
let activeSubTab = $state<"active" | "history">(
  queueStore.running.length > 0 || queueStore.queued.length > 0
    ? "active"
    : "history"
);
```

## Sub-Tab Badge Counts

The sub-tab labels show inline counts:

- **Active**: Shows `(N running, M queued)` or `(idle)` when both are 0
- **History**: Shows total session count `(N sessions)`

## Migration Path

### Phase 1: Create Unified Components

1. Create `UnifiedSessionsScreen.svelte` with sub-tab navigation
2. Create `ActiveSessionsPanel.svelte` extracting content from `SessionQueueScreen`
3. Create `HistorySessionsPanel.svelte` extracting content from `ClaudeSessionsScreen` and adding QraftBox completed session merge
4. Create `UnifiedSessionCard.svelte` wrapper with source badge

### Phase 2: Wire Up in App.svelte

1. Remove `"queue"` from `ScreenType`
2. Remove Queue button from header nav
3. Replace screen rendering blocks with `UnifiedSessionsScreen`
4. Update imports

### Phase 3: Cleanup

1. Remove `SessionQueueScreen.svelte`
2. Remove `ClaudeSessionsScreen.svelte`
3. Verify no remaining references to removed components

## Error Handling

| Scenario | Handling |
|----------|----------|
| Queue store load fails | Show error in Active tab, History tab unaffected |
| Claude sessions load fails | Show error in History tab, Active tab unaffected |
| Both fail | Each tab shows its own error independently |
| No sessions at all | Show empty state message per tab |

## Performance Considerations

- Active tab: Queue store is lightweight (in-memory, small dataset). No performance concern.
- History tab: Pagination already implemented in claude-sessions store. QraftBox completed sessions are typically few (< 50 per session). Merge happens client-side.
- Sub-tab switching does not re-fetch data unless explicitly refreshed.
- SSE streaming for running sessions continues to work through the existing queue store event handler.

## File Structure

### New Files

```
client/components/sessions/
  UnifiedSessionsScreen.svelte      # Top-level unified screen
  ActiveSessionsPanel.svelte        # Running + Queued display
  HistorySessionsPanel.svelte       # Merged completed + CLI sessions
  UnifiedSessionCard.svelte         # Source badge wrapper
  SubTabNav.svelte                  # Active/History toggle
```

### Modified Files

```
client/src/App.svelte               # Remove "queue" screen, update imports, render unified screen
```

### Removed Files (after migration complete)

```
client/components/session/SessionQueueScreen.svelte
client/components/claude-sessions/ClaudeSessionsScreen.svelte
```

### Retained Files (no changes)

```
client/components/session/SessionCard.svelte
client/components/session/RunningSession.svelte
client/components/session/SessionDetailView.svelte
client/components/session/ConversationChatView.svelte
client/components/claude-sessions/SessionCard.svelte
client/components/claude-sessions/SearchInput.svelte
client/components/claude-sessions/FilterPanel.svelte
client/src/stores/queue.ts
client/src/stores/claude-sessions.ts
```

## References

- Existing Claude session browser design: `design-docs/specs/design-claude-session-browser.md`
- AI types: `src/types/ai.ts`
- Claude session types: `src/types/claude-session.ts`
- Queue store: `client/src/stores/queue.ts`
- Claude sessions store: `client/src/stores/claude-sessions.ts`
