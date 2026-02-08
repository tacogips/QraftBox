# Unified Sessions Screen Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-unified-sessions.md
**Created**: 2026-02-08
**Last Updated**: 2026-02-08

---

## Design Document Reference

**Source**: design-docs/specs/design-unified-sessions.md

### Summary
Merge the separate "Queue" and "Sessions" header tabs into a single unified "Sessions" tab. QraftBox-created AI sessions (running, queued, completed) and Claude CLI sessions are presented in one cohesive interface with internal Active/History sub-navigation.

### Scope
**Included**:
- Single "Sessions" header tab (remove "Queue" from ScreenType)
- Internal sub-navigation: Active / History
- Active section: running + queued sessions with real-time status
- History section: completed QraftBox + Claude CLI sessions, merged chronologically
- Source badges ("qraftbox" / "claude-cli") on session cards
- Date grouping for History (Today, Yesterday, Older)
- Filter/search for History section

**Excluded**:
- Server-side changes (existing API endpoints are sufficient)
- Store refactoring (compose existing stores)
- Pagination improvements beyond existing functionality

---

## Modules

### 1. Unified Session Types

#### client/src/types/unified-session.ts

**Status**: NOT_STARTED

```typescript
import type { AISession } from "../../../src/types/ai";
import type { ExtendedSessionEntry } from "../../../src/types/claude-session";

type UnifiedSessionItem =
  | { kind: "qraftbox"; session: AISession }
  | { kind: "claude-cli"; session: ExtendedSessionEntry };

type SessionsSubView = "active" | "history";
```

**Checklist**:
- [ ] Define UnifiedSessionItem discriminated union
- [ ] Define SessionsSubView type
- [ ] Export types

### 2. SubTabNav Component

#### client/components/sessions/SubTabNav.svelte

**Status**: NOT_STARTED

Props: `activeTab`, `onTabChange`, `runningCount`, `queuedCount`, `historyCount`

**Checklist**:
- [ ] Active/History toggle with segmented control styling
- [ ] Badge counts (running, queued for Active; total for History)
- [ ] Idle state label when no active sessions

### 3. ActiveSessionsPanel Component

#### client/components/sessions/ActiveSessionsPanel.svelte

**Status**: NOT_STARTED

Props: `running: AISession[]`, `queued: AISession[]`, queue action callbacks

**Checklist**:
- [ ] Running sessions section using existing RunningSession component
- [ ] Queued sessions section using existing session/SessionCard component
- [ ] Section headers with counts
- [ ] Empty state message when no active sessions

### 4. UnifiedSessionCard Wrapper

#### client/components/sessions/UnifiedSessionCard.svelte

**Status**: NOT_STARTED

Props: `item: UnifiedSessionItem`, action callbacks

**Checklist**:
- [ ] Source badge rendering ([QRAFTBOX] / [CLI])
- [ ] Delegates to session/SessionCard or claude-sessions/SessionCard based on kind
- [ ] Passes through action callbacks

### 5. HistorySessionsPanel Component

#### client/components/sessions/HistorySessionsPanel.svelte

**Status**: NOT_STARTED

Props: completed QraftBox sessions, Claude CLI sessions store, action callbacks

**Checklist**:
- [ ] Merge completed QraftBox + Claude CLI sessions chronologically
- [ ] Date grouping (Today, Yesterday, Older)
- [ ] SearchInput and FilterPanel reuse from claude-sessions
- [ ] UnifiedSessionCard for rendering each item
- [ ] Loading and error states

### 6. UnifiedSessionsScreen Component

#### client/components/sessions/UnifiedSessionsScreen.svelte

**Status**: NOT_STARTED

**Checklist**:
- [ ] Composes SubTabNav, ActiveSessionsPanel, HistorySessionsPanel
- [ ] Sub-tab state management (default Active if sessions exist, else History)
- [ ] Uses both queue store and claude-sessions store
- [ ] Passes action callbacks through to child components

### 7. App.svelte Integration

#### client/src/App.svelte

**Status**: NOT_STARTED

**Checklist**:
- [ ] Remove "queue" from ScreenType
- [ ] Remove Queue header nav button
- [ ] Replace separate sessions/queue rendering with UnifiedSessionsScreen
- [ ] Update imports

---

## Tasks

### TASK-001: Create SubTabNav component

**Status**: Not Started
**Parallelizable**: Yes
**Deliverables**: `client/components/sessions/SubTabNav.svelte`
**Dependencies**: None

**Description**:
Create a simple Active/History toggle component with badge counts. Shows running/queued counts on Active tab and total session count on History tab. Uses segmented control styling consistent with existing UI patterns.

**Completion Criteria**:
- [ ] Component renders Active/History tabs
- [ ] Badge counts display correctly
- [ ] Tab switching emits callback
- [ ] Idle state shown when no active sessions
- [ ] Type checking passes

### TASK-002: Create ActiveSessionsPanel component

**Status**: Not Started
**Parallelizable**: Yes
**Deliverables**: `client/components/sessions/ActiveSessionsPanel.svelte`
**Dependencies**: None

**Description**:
Extract running + queued session display from SessionQueueScreen. Reuse existing RunningSession and session/SessionCard components. Accept queue store data as props.

**Completion Criteria**:
- [ ] Running sessions section with RunningSession components
- [ ] Queued sessions section with SessionCard components
- [ ] Section headers with counts
- [ ] Empty state message
- [ ] All queue action callbacks wired through
- [ ] Type checking passes

### TASK-003: Create UnifiedSessionCard wrapper

**Status**: Not Started
**Parallelizable**: Yes
**Deliverables**: `client/components/sessions/UnifiedSessionCard.svelte`, `client/src/types/unified-session.ts`
**Dependencies**: None

**Description**:
Create a wrapper component with source badge ([QRAFTBOX] / [CLI]) that renders either session/SessionCard or claude-sessions/SessionCard based on the UnifiedSessionItem kind. Define the UnifiedSessionItem discriminated union type.

**Completion Criteria**:
- [ ] UnifiedSessionItem type defined and exported
- [ ] Source badge renders correctly for each kind
- [ ] Delegates to correct underlying SessionCard component
- [ ] Action callbacks passed through
- [ ] Type checking passes

### TASK-004: Create HistorySessionsPanel component

**Status**: Not Started
**Parallelizable**: No
**Deliverables**: `client/components/sessions/HistorySessionsPanel.svelte`
**Dependencies**: TASK-003

**Description**:
Create the History panel that merges completed QraftBox sessions with Claude CLI sessions chronologically. Implement date grouping (Today, Yesterday, Older). Reuse SearchInput and FilterPanel from claude-sessions. Use UnifiedSessionCard for rendering.

**Completion Criteria**:
- [ ] Merges two session sources chronologically
- [ ] Date grouping works correctly
- [ ] Search and filter integration
- [ ] Uses UnifiedSessionCard for rendering
- [ ] Loading and error states
- [ ] Type checking passes

### TASK-005: Create UnifiedSessionsScreen component

**Status**: Not Started
**Parallelizable**: No
**Deliverables**: `client/components/sessions/UnifiedSessionsScreen.svelte`
**Dependencies**: TASK-001, TASK-002, TASK-004

**Description**:
Create the top-level unified screen that composes SubTabNav, ActiveSessionsPanel, and HistorySessionsPanel. Manages sub-tab state (default to "active" if sessions exist, else "history"). Uses both queue store and claude-sessions store.

**Completion Criteria**:
- [ ] Composes all sub-components
- [ ] Sub-tab state defaults correctly
- [ ] Both stores integrated
- [ ] All callbacks wired through
- [ ] Type checking passes

### TASK-006: Update App.svelte

**Status**: Not Started
**Parallelizable**: No
**Deliverables**: `client/src/App.svelte`
**Dependencies**: TASK-005

**Description**:
Remove "queue" from ScreenType. Remove Queue header nav button. Replace separate sessions/queue rendering blocks with UnifiedSessionsScreen. Update imports.

**Completion Criteria**:
- [ ] "queue" removed from ScreenType
- [ ] Queue header button removed
- [ ] UnifiedSessionsScreen renders in sessions block
- [ ] Old imports removed
- [ ] Type checking passes

### TASK-007: Cleanup removed components

**Status**: Not Started
**Parallelizable**: No
**Deliverables**: Remove `SessionQueueScreen.svelte`, `ClaudeSessionsScreen.svelte`
**Dependencies**: TASK-006

**Description**:
Remove SessionQueueScreen.svelte and ClaudeSessionsScreen.svelte. Verify no remaining references to removed components.

**Completion Criteria**:
- [ ] SessionQueueScreen.svelte removed
- [ ] ClaudeSessionsScreen.svelte removed
- [ ] No broken references
- [ ] Type checking passes

### TASK-008: Build and verify

**Status**: Not Started
**Parallelizable**: No
**Deliverables**: Successful client build
**Dependencies**: TASK-007

**Description**:
Run client build (`cd client && bun run build`). Verify no TypeScript errors. Confirm the unified sessions screen works end-to-end.

**Completion Criteria**:
- [ ] `bun run build` succeeds without errors
- [ ] No TypeScript errors
- [ ] Application loads correctly

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Unified Types | `client/src/types/unified-session.ts` | NOT_STARTED | - |
| SubTabNav | `client/components/sessions/SubTabNav.svelte` | NOT_STARTED | - |
| ActiveSessionsPanel | `client/components/sessions/ActiveSessionsPanel.svelte` | NOT_STARTED | - |
| UnifiedSessionCard | `client/components/sessions/UnifiedSessionCard.svelte` | NOT_STARTED | - |
| HistorySessionsPanel | `client/components/sessions/HistorySessionsPanel.svelte` | NOT_STARTED | - |
| UnifiedSessionsScreen | `client/components/sessions/UnifiedSessionsScreen.svelte` | NOT_STARTED | - |
| App.svelte Update | `client/src/App.svelte` | NOT_STARTED | - |

## Dependencies

| Task | Depends On | Status |
|------|------------|--------|
| TASK-001: SubTabNav | None | Ready |
| TASK-002: ActiveSessionsPanel | None | Ready |
| TASK-003: UnifiedSessionCard | None | Ready |
| TASK-004: HistorySessionsPanel | TASK-003 | Blocked |
| TASK-005: UnifiedSessionsScreen | TASK-001, TASK-002, TASK-004 | Blocked |
| TASK-006: App.svelte | TASK-005 | Blocked |
| TASK-007: Cleanup | TASK-006 | Blocked |
| TASK-008: Build & Verify | TASK-007 | Blocked |

## Completion Criteria

- [ ] All components implemented
- [ ] Type checking passes
- [ ] Client build succeeds
- [ ] "Queue" removed from navigation
- [ ] Unified Sessions screen renders both Active and History views
- [ ] Source badges display on session cards
- [ ] Date grouping works in History view
- [ ] No broken references to removed components

## Progress Log

### Session: 2026-02-08
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implementation plan created from design-unified-sessions.md

## Related Plans

- **Depends On**: `24-claude-session-browser.md` (Phase 10), `13-session-queue.md` (Phase 4)
- **Phase**: 13 (Unified Sessions)
