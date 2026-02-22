# AI Session Overview Mode Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-claude-session-browser.md#session-listing-and-resume (extended for AI Session screen)
**Created**: 2026-02-22
**Last Updated**: 2026-02-22

## Design Document Reference

Add an overview-first AI Session experience:

- Remove legacy detail mode UI (current session panel + inline prompt + history side panel).
- Keep a single `overview` mode showing many sessions as cards for multi-terminal operation monitoring.

The overview cards must expose:

- Current session objective (latest purpose)
- Latest execution response/activity
- Execution state: running / queued / idle
- Queue waiting visibility
- Quick drill-in popup with transcript progress and next prompt submission

**Out of Scope**:

- New backend LLM summarization pipeline for objectives
- Replacing existing detail mode behavior
- Changes to non-AI screens

## Modules

### 1. AI Session Screen Consolidation

#### client/components/app/AiSessionScreen.svelte

**Status**: COMPLETED

```typescript
interface OverviewPromptSubmission {
  readonly sessionId: string;
  readonly message: string;
  readonly immediate: boolean;
}
```

**Checklist**:

- [x] Remove detail-mode rendering branch
- [x] Keep AI Session screen as overview-only container
- [x] Pass session runtime state + submit handlers into overview component

### 2. Overview Search & History

#### client/components/sessions/AiSessionOverviewGrid.svelte

**Status**: COMPLETED

```typescript
interface OverviewSearchState {
  readonly query: string;
  readonly includeTranscript: boolean;
}

interface AiSessionOverviewGridProps {
  readonly contextId: string | null;
  readonly projectPath: string;
  readonly runningSessions: readonly AISession[];
  readonly queuedSessions: readonly AISession[];
  readonly pendingPrompts: readonly PromptQueueItem[];
  readonly onResumeSession: (sessionId: string) => void;
  readonly onSubmitPrompt: (
    sessionId: string,
    message: string,
    immediate: boolean,
  ) => Promise<void>;
}
```

**Checklist**:

- [x] Fetch unified session list scoped to current project
- [x] Build card view model merging runtime active session state
- [x] Render 5-column default grid (responsive fallback)
- [x] Status badges for running/queued/idle
- [x] Show session purpose + latest response/activity
- [x] Add metadata search (purpose/summary/latest response)
- [x] Add transcript text search option (internal chat content)

### 3. Session Progress Popup

#### client/components/sessions/AiSessionOverviewPopup.svelte

**Status**: COMPLETED

```typescript
interface AiSessionOverviewPopupProps {
  readonly open: boolean;
  readonly contextId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly status: "running" | "queued" | "idle";
  readonly purpose: string;
  readonly latestResponse: string;
  readonly queuedPromptCount: number;
  readonly onClose: () => void;
  readonly onResumeSession: (sessionId: string) => void;
  readonly onSubmitPrompt: (
    message: string,
    immediate: boolean,
  ) => Promise<void>;
}
```

**Checklist**:

- [x] Show session status + metadata
- [x] Embed transcript progress view
- [x] Provide prompt input
- [x] Support run-now / queue submission
- [x] Close on overlay click and Escape

## Module Status

| Module                    | File Path                                                   | Status    | Tests    |
| ------------------------- | ----------------------------------------------------------- | --------- | -------- |
| Screen consolidation      | `client/components/app/AiSessionScreen.svelte`              | Completed | Verified |
| Overview grid + search    | `client/components/sessions/AiSessionOverviewGrid.svelte`   | Completed | Verified |
| Progress popup            | `client/components/sessions/AiSessionOverviewPopup.svelte`  | Completed | Verified |
| Legacy component removals | `client/components/{AIPromptPanel,CurrentSessionPanel,...}` | Completed | Verified |

## Dependencies

| Feature                | Depends On                                           | Status |
| ---------------------- | ---------------------------------------------------- | ------ |
| Overview card status   | Existing `AISession` + prompt queue API data         | Ready  |
| Popup transcript       | Existing `SessionTranscriptInline.svelte`            | Ready  |
| Next prompt submission | Existing `AiSessionScreen` `onSubmitPrompt` callback | Ready  |

## Completion Criteria

- [x] AI Session screen is overview-only (detail mode removed)
- [x] Overview shows sessions in 5-column card grid by default
- [x] Each card shows purpose + latest response + status (running/queued/idle)
- [x] Overview can search by session metadata (purpose/summary/latest response)
- [x] Overview can search internal chat content (transcript text)
- [x] Card popup displays current progress transcript
- [x] Popup can submit next prompt (run now or queue)
- [x] Typecheck passes
- [x] Tests pass
- [x] Browser verification performed

## Progress Log

### Session: 2026-02-22

**Tasks Completed**: Created implementation plan and confirmed integration points in AI session UI and APIs.
**Tasks In Progress**: Implementing mode toggle + overview grid + popup.
**Blockers**: None.
**Notes**: Reusing existing transcript viewer and prompt submission flow to keep behavior consistent with current detail mode.

### Session: 2026-02-22 (Completion)

**Tasks Completed**: Converted AI Session to overview-only, implemented overview card grid, session progress popup, prompt submission from popup, transcript-aware search, and deleted legacy detail/history components. Executed typecheck/tests and browser verification.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Overview cards merge Claude session history with runtime queue/session state so running/queued/idle status and latest activity are visible in one screen. Search supports metadata-only or metadata+chat transcript matching.
