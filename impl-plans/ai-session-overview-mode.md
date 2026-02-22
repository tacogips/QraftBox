# AI Session Overview Mode Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-claude-session-browser.md#session-listing-and-resume (extended for AI Session screen)
**Created**: 2026-02-22
**Last Updated**: 2026-02-22

## Design Document Reference

Add a dual-mode AI Session experience:

- `detail` mode keeps the existing split layout (file tree, current session panel, session history).
- `overview` mode shows many sessions as cards for multi-terminal operation monitoring.

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

### 1. AI Session Screen Mode Management

#### client/components/app/AiSessionScreen.svelte

**Status**: COMPLETED

```typescript
type AISessionViewMode = "detail" | "overview";

interface OverviewSessionCardData {
  readonly qraftAiSessionId: string;
  readonly title: string;
  readonly purpose: string;
  readonly latestResponse: string;
  readonly status: "running" | "queued" | "idle";
  readonly queuedPromptCount: number;
  readonly modifiedAt: string;
}
```

**Checklist**:

- [x] Add mode toggle UI with default `detail`
- [x] Keep existing detail mode rendering unchanged
- [x] Render new overview mode branch
- [x] Pass session runtime state + submit handlers into overview component

### 2. Overview Grid UI

#### client/components/sessions/AiSessionOverviewGrid.svelte

**Status**: COMPLETED

```typescript
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

| Module                | File Path                                                  | Status    | Tests    |
| --------------------- | ---------------------------------------------------------- | --------- | -------- |
| Mode toggle + routing | `client/components/app/AiSessionScreen.svelte`             | Completed | Verified |
| Overview grid         | `client/components/sessions/AiSessionOverviewGrid.svelte`  | Completed | Verified |
| Progress popup        | `client/components/sessions/AiSessionOverviewPopup.svelte` | Completed | Verified |

## Dependencies

| Feature                | Depends On                                           | Status |
| ---------------------- | ---------------------------------------------------- | ------ |
| Overview card status   | Existing `AISession` + prompt queue API data         | Ready  |
| Popup transcript       | Existing `SessionTranscriptInline.svelte`            | Ready  |
| Next prompt submission | Existing `AiSessionScreen` `onSubmitPrompt` callback | Ready  |

## Completion Criteria

- [x] AI Session screen supports `detail` and `overview` mode switching
- [x] Overview shows sessions in 5-column card grid by default
- [x] Each card shows purpose + latest response + status (running/queued/idle)
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

**Tasks Completed**: Implemented detail/overview mode toggle, overview card grid, session progress popup, and prompt submission from popup. Executed typecheck/tests and browser verification.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Overview cards merge Claude session history with runtime queue/session state so running/queued/idle status and latest activity are visible in one screen.
