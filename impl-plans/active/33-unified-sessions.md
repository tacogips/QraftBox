# Unified Sessions Screen Implementation Plan

**Status**: In Progress
**Design Reference**: design-docs/specs/design-unified-sessions.md
**Created**: 2026-02-08
**Last Updated**: 2026-02-09

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

**Status**: COMPLETED

```typescript
import type { AISession } from "../../../src/types/ai";
import type { ExtendedSessionEntry } from "../../../src/types/claude-session";

type UnifiedSessionItem =
  | { kind: "qraftbox"; session: AISession }
  | { kind: "claude-cli"; session: ExtendedSessionEntry };

type SessionsSubView = "active" | "history";
```

**Checklist**:
- [x] Define UnifiedSessionItem discriminated union
- [x] Define SessionsSubView type
- [x] Export types

### 2. SubTabNav Component

#### client/components/sessions/SubTabNav.svelte

**Status**: COMPLETED

Props: `activeTab`, `onTabChange`, `runningCount`, `queuedCount`, `historyCount`

**Checklist**:
- [x] Active/History toggle with segmented control styling
- [x] Badge counts (running, queued for Active; total for History)
- [x] Idle state label when no active sessions

### 3. ActiveSessionsPanel Component

#### client/components/sessions/ActiveSessionsPanel.svelte

**Status**: COMPLETED

Props: `running: AISession[]`, `queued: AISession[]`, queue action callbacks

**Checklist**:
- [x] Running sessions section using existing RunningSession component
- [x] Queued sessions section using existing session/SessionCard component
- [x] Section headers with counts
- [x] Empty state message when no active sessions

### 4. UnifiedSessionCard Wrapper

#### client/components/sessions/UnifiedSessionCard.svelte

**Status**: COMPLETED

Props: `item: UnifiedSessionItem`, action callbacks

**Checklist**:
- [x] Source badge rendering ([QRAFTBOX] / [CLI])
- [x] Delegates to session/SessionCard or claude-sessions/SessionCard based on kind
- [x] Passes through action callbacks

### 5. HistorySessionsPanel Component

#### client/components/sessions/HistorySessionsPanel.svelte

**Status**: IN_PROGRESS

Props: completed QraftBox sessions, Claude CLI sessions store, action callbacks

**Checklist**:
- [x] Merge completed QraftBox + Claude CLI sessions chronologically
- [x] Date grouping (Today, Yesterday, Older)
- [ ] SearchInput and FilterPanel reuse from claude-sessions
- [ ] UnifiedSessionCard for rendering each item
- [x] Loading and error states

### 6. UnifiedSessionsScreen Component

#### client/components/sessions/UnifiedSessionsScreen.svelte

**Status**: IN_PROGRESS

**Checklist**:
- [ ] Composes SubTabNav, ActiveSessionsPanel, HistorySessionsPanel
- [ ] Sub-tab state management (default Active if sessions exist, else History)
- [x] Uses both queue store and claude-sessions store
- [x] Passes action callbacks through to child components

### 7. App.svelte Integration

#### client/src/App.svelte

**Status**: IN_PROGRESS

**Checklist**:
- [x] Remove "queue" from ScreenType
- [x] Remove Queue header nav button
- [x] Replace separate sessions/queue rendering with UnifiedSessionsScreen
- [x] Update imports

---

## Tasks

### TASK-001: Create SubTabNav component

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `client/components/sessions/SubTabNav.svelte`
**Dependencies**: None

**Description**:
Create a simple Active/History toggle component with badge counts. Shows running/queued counts on Active tab and total session count on History tab. Uses segmented control styling consistent with existing UI patterns.

**Completion Criteria**:
- [x] Component renders Active/History tabs
- [x] Badge counts display correctly
- [x] Tab switching emits callback
- [x] Idle state shown when no active sessions
- [x] Type checking passes

### TASK-002: Create ActiveSessionsPanel component

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `client/components/sessions/ActiveSessionsPanel.svelte`
**Dependencies**: None

**Description**:
Extract running + queued session display from SessionQueueScreen. Reuse existing RunningSession and session/SessionCard components. Accept queue store data as props.

**Completion Criteria**:
- [x] Running sessions section with RunningSession components
- [x] Queued sessions section with SessionCard components
- [x] Section headers with counts
- [x] Empty state message
- [x] All queue action callbacks wired through
- [x] Type checking passes

### TASK-003: Create UnifiedSessionCard wrapper

**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: `client/components/sessions/UnifiedSessionCard.svelte`, `client/src/types/unified-session.ts`
**Dependencies**: None

**Description**:
Create a wrapper component with source badge ([QRAFTBOX] / [CLI]) that renders either session/SessionCard or claude-sessions/SessionCard based on the UnifiedSessionItem kind. Define the UnifiedSessionItem discriminated union type.

**Completion Criteria**:
- [x] UnifiedSessionItem type defined and exported
- [x] Source badge renders correctly for each kind
- [x] Delegates to correct underlying SessionCard component
- [x] Action callbacks passed through
- [x] Type checking passes

### TASK-004: Create HistorySessionsPanel component

**Status**: In Progress
**Parallelizable**: No
**Deliverables**: `client/components/sessions/HistorySessionsPanel.svelte`
**Dependencies**: TASK-003

**Description**:
Create the History panel that merges completed QraftBox sessions with Claude CLI sessions chronologically. Implement date grouping (Today, Yesterday, Older). Reuse SearchInput and FilterPanel from claude-sessions. Use UnifiedSessionCard for rendering.

**Completion Criteria**:
- [x] Merges two session sources chronologically
- [x] Date grouping works correctly
- [ ] Search and filter integration
- [ ] Uses UnifiedSessionCard for rendering
- [x] Loading and error states
- [x] Type checking passes

### TASK-005: Create UnifiedSessionsScreen component

**Status**: In Progress
**Parallelizable**: No
**Deliverables**: `client/components/sessions/UnifiedSessionsScreen.svelte`
**Dependencies**: TASK-001, TASK-002, TASK-004

**Description**:
Create the top-level unified screen that composes SubTabNav, ActiveSessionsPanel, and HistorySessionsPanel. Manages sub-tab state (default to "active" if sessions exist, else "history"). Uses both queue store and claude-sessions store.

**Completion Criteria**:
- [ ] Composes all sub-components
- [ ] Sub-tab state defaults correctly
- [x] Both stores integrated
- [x] All callbacks wired through
- [x] Type checking passes

### TASK-006: Update App.svelte

**Status**: In Progress
**Parallelizable**: No
**Deliverables**: `client/src/App.svelte`
**Dependencies**: TASK-005

**Description**:
Remove "queue" from ScreenType. Remove Queue header nav button. Replace separate sessions/queue rendering blocks with UnifiedSessionsScreen. Update imports.

**Completion Criteria**:
- [x] "queue" removed from ScreenType
- [x] Queue header button removed
- [x] UnifiedSessionsScreen renders in sessions block
- [x] Old imports removed
- [x] Type checking passes

### TASK-007: Cleanup removed components

**Status**: Completed
**Parallelizable**: No
**Deliverables**: Remove `SessionQueueScreen.svelte`, `ClaudeSessionsScreen.svelte`
**Dependencies**: TASK-006

**Description**:
Remove SessionQueueScreen.svelte and ClaudeSessionsScreen.svelte. Verify no remaining references to removed components.

**Completion Criteria**:
- [x] SessionQueueScreen.svelte removed
- [x] ClaudeSessionsScreen.svelte removed
- [x] No broken references
- [x] Type checking passes

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
| Unified Types | `client/src/types/unified-session.ts` | COMPLETED | - |
| SubTabNav | `client/components/sessions/SubTabNav.svelte` | COMPLETED (not wired in screen) | - |
| ActiveSessionsPanel | `client/components/sessions/ActiveSessionsPanel.svelte` | COMPLETED | - |
| UnifiedSessionCard | `client/components/sessions/UnifiedSessionCard.svelte` | COMPLETED (not wired in history panel) | - |
| HistorySessionsPanel | `client/components/sessions/HistorySessionsPanel.svelte` | IN_PROGRESS | - |
| UnifiedSessionsScreen | `client/components/sessions/UnifiedSessionsScreen.svelte` | IN_PROGRESS | - |
| App.svelte Update | `client/src/App.svelte` | IN_PROGRESS | - |

## Dependencies

| Task | Depends On | Status |
|------|------------|--------|
| TASK-001: SubTabNav | None | Completed |
| TASK-002: ActiveSessionsPanel | None | Completed |
| TASK-003: UnifiedSessionCard | None | Completed |
| TASK-004: HistorySessionsPanel | TASK-003 | In Progress |
| TASK-005: UnifiedSessionsScreen | TASK-001, TASK-002, TASK-004 | In Progress |
| TASK-006: App.svelte | TASK-005 | In Progress |
| TASK-007: Cleanup | TASK-006 | Completed |
| TASK-008: Build & Verify | TASK-007 | Not Started |

## Completion Criteria

- [ ] All components implemented
- [x] Type checking passes
- [ ] Client build succeeds
- [x] "Queue" removed from navigation
- [ ] Unified Sessions screen renders both Active and History views
- [ ] Source badges display on session cards
- [x] Date grouping works in History view
- [x] No broken references to removed components

## Progress Log

### Session: 2026-02-08
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implementation plan created from design-unified-sessions.md

### Session: 2026-02-09
**Tasks Completed**: TASK-001, TASK-002, TASK-003, TASK-007 (code present and wired/removed as specified)
**Tasks In Progress**: TASK-004, TASK-005, TASK-006 (screen is unified but currently single-flow layout; sub-tab model and UnifiedSessionCard usage remain)
**Blockers**: None
**Notes**: History panel currently uses custom accordion rows and SearchInput only. FilterPanel integration and UnifiedSessionCard usage are pending.

## Related Plans

- **Depends On**: `24-claude-session-browser.md` (Phase 10), `13-session-queue.md` (Phase 4)
- **Phase**: 13 (Unified Sessions)
