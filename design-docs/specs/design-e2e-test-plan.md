# QraftBox E2E Test Plan - Visual Verification & Screenshot Capture

## Overview

This document defines a comprehensive E2E test plan for QraftBox that launches the app in dev mode, navigates all screens, captures screenshots, and verifies core functionality via browser automation using Playwright.

## Test Environment

| Item | Value |
|------|-------|
| Runtime | Bun + Nix flakes |
| Dev server | `bun run dev` (port 7144) |
| Browser automation | Playwright (Chromium) |
| Browsers path | `$PLAYWRIGHT_BROWSERS_PATH` (from Nix) |
| Screenshot output | `e2e-screenshots/` |
| Base URL | `http://localhost:7144` |
| Target project | QraftBox repository itself (`.`) |

## Test Architecture

```
Playwright Test Runner
    |
    +-- Start dev server (bun run src/main.ts --port 7155)
    |
    +-- Launch browser (Chromium headless)
    |
    +-- Execute test suites per screen
    |       |
    |       +-- Navigate to screen
    |       +-- Wait for data load
    |       +-- Take full-page screenshot
    |       +-- Verify key elements present
    |       +-- Interact with UI controls
    |       +-- Take post-interaction screenshots
    |       +-- Assert expected state
    |
    +-- Collect screenshots in e2e-screenshots/
    |
    +-- Stop dev server
```

## Screen Inventory & Test Suites

### TS-E2E-01: App Startup & Health Check

**Precondition**: Dev server started
**URL**: `http://localhost:7155`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-01-01 | Health endpoint responds | - | GET `/api/health` returns 200 |
| E2E-01-02 | Initial page loads | `01-app-initial-load.png` | Page title contains "qraftbox" or "aynd", `#app` div rendered |
| E2E-01-03 | Static assets loaded | - | JS and CSS bundles loaded without 404 |

---

### TS-E2E-02: File Tree Navigation

**Component**: `FileTree.svelte`, `DirectoryNode.svelte`, `FileNode.svelte`, `StatusBadge.svelte`, `ModeToggle.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-02-01 | File tree renders | `02-file-tree-initial.png` | File tree visible with project files |
| E2E-02-02 | Directory expand/collapse | `02-file-tree-expanded.png` | Click directory node, children visible |
| E2E-02-03 | File status badges | `02-file-tree-status.png` | Modified/added/deleted files show correct badges |
| E2E-02-04 | Mode toggle (diff-only) | `02-file-tree-diff-only.png` | Toggle to diff-only mode, only changed files visible |
| E2E-02-05 | Mode toggle (all files) | `02-file-tree-all-files.png` | Toggle back to all files, complete tree visible |
| E2E-02-06 | File selection | `02-file-tree-selected.png` | Click a file, diff view updates |
| E2E-02-07 | Quick actions menu | `02-file-tree-quick-actions.png` | Right-click or long-press shows QuickActions |

---

### TS-E2E-03: Diff View - Side by Side

**Component**: `DiffView.svelte`, `SideBySideDiff.svelte`, `DiffHeader.svelte`, `DiffLine.svelte`, `ChunkSeparator.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-03-01 | Side-by-side diff renders | `03-diff-sbs-initial.png` | Two-column diff layout visible |
| E2E-03-02 | Diff header shows file info | `03-diff-sbs-header.png` | File name, status, line counts displayed |
| E2E-03-03 | Added lines highlighted | `03-diff-sbs-additions.png` | Green highlighting on added lines |
| E2E-03-04 | Deleted lines highlighted | `03-diff-sbs-deletions.png` | Red highlighting on deleted lines |
| E2E-03-05 | Chunk separators visible | `03-diff-sbs-chunks.png` | Chunk boundaries with context info |
| E2E-03-06 | Virtual scroll works | `03-diff-sbs-scroll.png` | Scroll large diff, content loads smoothly |
| E2E-03-07 | Syntax highlighting | `03-diff-sbs-syntax.png` | Shiki syntax highlighting applied to code |

---

### TS-E2E-04: Diff View - Inline

**Component**: `InlineDiff.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-04-01 | Inline diff renders | `04-diff-inline-initial.png` | Single-column unified diff visible |
| E2E-04-02 | Mode switch (SBS to inline) | `04-diff-inline-switch.png` | Toggle from side-by-side to inline |
| E2E-04-03 | Added/deleted interleaved | `04-diff-inline-changes.png` | Added and deleted lines properly interleaved |

---

### TS-E2E-05: Current State View

**Component**: `CurrentStateView.svelte`, `CurrentStateLine.svelte`, `DeletedMarker.svelte`, `ExpandControls.svelte`, `ExpandedDeletedBlock.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-05-01 | Current state view renders | `05-current-state-initial.png` | Full file content with diff annotations |
| E2E-05-02 | Delete markers visible | `05-current-state-markers.png` | Deleted line indicators shown |
| E2E-05-03 | Expand deleted section | `05-current-state-expanded.png` | Click expand, deleted lines shown |
| E2E-05-04 | Collapse deleted section | `05-current-state-collapsed.png` | Click collapse, deleted lines hidden |

---

### TS-E2E-06: Commit Log Panel

**Component**: `CommitLogPanel.svelte`, `CommitListItem.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-06-01 | Commit log panel renders | `06-commit-log-initial.png` | Commit list with messages, authors, dates |
| E2E-06-02 | Select a commit | `06-commit-log-selected.png` | Click commit, diff view updates to commit diff |
| E2E-06-03 | Pagination (load more) | `06-commit-log-more.png` | Scroll to bottom, more commits loaded |
| E2E-06-04 | Search by message/author | `06-commit-log-search.png` | Filter commits by search query |

---

### TS-E2E-07: Comments Panel (git-xnotes)

**Component**: `CommentsPanel.svelte`, `CommentThread.svelte`, `CommentDisplay.svelte`, `CommentForm.svelte`, `LineCommentIndicator.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-07-01 | Comments panel renders | `07-comments-panel.png` | Panel visible (may be empty) |
| E2E-07-02 | Line comment indicators | `07-comments-indicators.png` | Comment icons on lines with notes |
| E2E-07-03 | Comment form opens | `07-comments-form.png` | Click to add comment, form visible |
| E2E-07-04 | Comment thread display | `07-comments-thread.png` | Threaded comment display |

---

### TS-E2E-08: Search

**Component**: `SearchInput.svelte`, `SearchResults.svelte`, `SearchHighlight.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-08-01 | Search input renders | `08-search-input.png` | Search input field visible |
| E2E-08-02 | Search produces results | `08-search-results.png` | Type query, results displayed |
| E2E-08-03 | Search highlight in results | `08-search-highlight.png` | Matched text highlighted |
| E2E-08-04 | Navigate to search result | `08-search-navigate.png` | Click result, diff view updates |

---

### TS-E2E-09: Tab Bar (Multi-Workspace)

**Component**: `TabBar.svelte`, `workspace/TabItem.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-09-01 | Tab bar renders | `09-tabs-initial.png` | At least one tab visible (project directory) |
| E2E-09-02 | Add new tab | `09-tabs-add.png` | Click add button, directory picker opens |
| E2E-09-03 | Switch between tabs | `09-tabs-switch.png` | Click another tab, context changes |
| E2E-09-04 | Close tab | `09-tabs-close.png` | Close a tab, removed from bar |

---

### TS-E2E-10: Directory Picker

**Component**: `DirectoryPicker.svelte`, `DirectoryEntry.svelte`, `QuickAccessBar.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-10-01 | Picker opens as modal | `10-picker-open.png` | Full-screen directory picker overlay |
| E2E-10-02 | Quick access bar | `10-picker-quickaccess.png` | Home and recent directories shown |
| E2E-10-03 | Navigate directories | `10-picker-navigate.png` | Click directory, browse into it |
| E2E-10-04 | Select directory | `10-picker-select.png` | Select directory, picker closes, new tab created |

---

### TS-E2E-11: Branch Management

**API**: `/api/ctx/:contextId/status`, Branch UI elements

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-11-01 | Current branch displayed | `11-branch-current.png` | Branch name shown in UI |
| E2E-11-02 | Branch list opens | `11-branch-list.png` | Click branch, list of branches shown |
| E2E-11-03 | Branch search | `11-branch-search.png` | Filter branches by name |

---

### TS-E2E-12: AI Commit Flow

**Component**: `CommitButton.svelte`, `CommitPanel.svelte`, `StagedFilesList.svelte`, `PromptSelector.svelte`, `commit/CommitProgress.svelte`, `commit/CommitSuccess.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-12-01 | Commit button visible | `12-commit-button.png` | AI Commit button in toolbar |
| E2E-12-02 | Commit panel opens | `12-commit-panel.png` | Bottom sheet with staged files list |
| E2E-12-03 | Staged files listed | `12-commit-staged.png` | Modified files shown with status |
| E2E-12-04 | Prompt selector | `12-commit-prompt.png` | Template prompt selection dropdown |
| E2E-12-05 | Commit panel closes | `12-commit-closed.png` | Escape or close button dismisses panel |

**Note**: Actual commit execution is NOT tested in E2E (destructive). Only UI rendering and interaction.

---

### TS-E2E-13: AI Push Flow

**Component**: `push/PushButton.svelte`, `push/PushPanel.svelte`, `push/UnpushedCommitsList.svelte`, `push/RemoteSelector.svelte`, `push/PushBehindWarning.svelte`, `push/PushProgress.svelte`, `push/PushSuccess.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-13-01 | Push button visible | `13-push-button.png` | Push button in toolbar |
| E2E-13-02 | Push panel opens | `13-push-panel.png` | Panel with unpushed commits |
| E2E-13-03 | Remote selector | `13-push-remote.png` | Remote branch selection UI |
| E2E-13-04 | Behind warning | `13-push-behind.png` | Warning if branch is behind remote |

**Note**: Actual push execution is NOT tested in E2E (destructive).

---

### TS-E2E-14: AI Pull Request Flow

**Component**: `pr/PRButton.svelte`, `pr/PRCreatePanel.svelte`, `pr/BaseBranchSelector.svelte`, `pr/ReviewerSelector.svelte`, `pr/LabelSelector.svelte`, `pr/GitHubAuthRequired.svelte`, `pr/PRStatusPanel.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-14-01 | PR button visible | `14-pr-button.png` | Create PR button in toolbar |
| E2E-14-02 | PR panel opens | `14-pr-panel.png` | PR creation form |
| E2E-14-03 | Base branch selector | `14-pr-base-branch.png` | Target branch dropdown |
| E2E-14-04 | GitHub auth status | `14-pr-auth.png` | Auth status shown (required/authenticated) |

**Note**: Actual PR creation is NOT tested in E2E (external side effects).

---

### TS-E2E-15: Claude Sessions Browser

**Component**: `claude-sessions/ClaudeSessionsScreen.svelte`, `claude-sessions/SessionCard.svelte`, `claude-sessions/SearchInput.svelte`, `claude-sessions/FilterPanel.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-15-01 | Sessions screen renders | `15-claude-sessions.png` | Session list with project names |
| E2E-15-02 | Session card details | `15-claude-session-card.png` | Session card shows date, branch, summary |
| E2E-15-03 | Search sessions | `15-claude-sessions-search.png` | Filter sessions by search query |
| E2E-15-04 | Filter panel | `15-claude-sessions-filter.png` | Filter by project/date/status |

---

### TS-E2E-16: Session Queue & Detail

**Component**: `SessionButton.svelte`, `session/SessionQueueScreen.svelte`, `session/SessionCard.svelte`, `session/RunningSession.svelte`, `session/SessionDetailView.svelte`, `session/ConversationCarousel.svelte`, `session/ConversationChatView.svelte`, `session/MessageCard.svelte`, `session/ToolCallDisplay.svelte`, `session/SessionStats.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-16-01 | Session button visible | `16-session-button.png` | Session queue button in UI |
| E2E-16-02 | Session queue screen | `16-session-queue.png` | Queue list (may be empty) |
| E2E-16-03 | Session detail view | `16-session-detail.png` | Detailed session info if sessions exist |

---

### TS-E2E-17: AI Prompt Interface

**Component**: `AIPromptInline.svelte`, `AIPromptPanel.svelte`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-17-01 | AI prompt inline | `17-ai-prompt-inline.png` | Inline AI prompt input visible |
| E2E-17-02 | AI prompt panel | `17-ai-prompt-panel.png` | Full AI prompt panel with options |

---

### TS-E2E-18: Worktree Management

**API**: `/api/ctx/:contextId/worktree`

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-18-01 | Worktree list | `18-worktree-list.png` | List of worktrees (if any) |
| E2E-18-02 | Worktree info | `18-worktree-info.png` | Current repo type displayed |

---

### TS-E2E-19: Responsive & Touch

| Test ID | Test Case | Screenshot | Verification |
|---------|-----------|------------|--------------|
| E2E-19-01 | Tablet viewport (1024x768) | `19-responsive-tablet.png` | Layout adapts to tablet size |
| E2E-19-02 | Desktop viewport (1920x1080) | `19-responsive-desktop.png` | Full desktop layout |
| E2E-19-03 | Touch target sizes | - | All interactive elements >= 44x44px |

---

### TS-E2E-20: API Endpoint Smoke Tests

These tests verify API endpoints respond correctly without browser UI.

| Test ID | Test Case | Verification |
|---------|-----------|--------------|
| E2E-20-01 | `GET /api/health` | 200 OK |
| E2E-20-02 | `GET /api/workspace` | 200 with workspace data |
| E2E-20-03 | `GET /api/browse?path=/` | 200 with directory listing |
| E2E-20-04 | `GET /api/ctx/:id/diff` | 200 with diff data |
| E2E-20-05 | `GET /api/ctx/:id/files` | 200 with file tree |
| E2E-20-06 | `GET /api/ctx/:id/status` | 200 with git status |
| E2E-20-07 | `GET /api/ctx/:id/commits` | 200 with commit history |
| E2E-20-08 | `GET /api/ctx/:id/claude-sessions` | 200 with session list |
| E2E-20-09 | `GET /api/ctx/:id/prompts` | 200 with prompt templates |
| E2E-20-10 | `GET /api/ctx/:id/worktree` | 200 with worktree info |

---

## Screenshot Naming Convention

```
e2e-screenshots/
  {suite-number}-{screen-name}-{detail}.png
```

Example:
```
e2e-screenshots/
  01-app-initial-load.png
  02-file-tree-initial.png
  02-file-tree-expanded.png
  03-diff-sbs-initial.png
  ...
```

## Test Execution Order

Tests should execute in this order (dependency chain):

1. **TS-E2E-20**: API smoke tests (no browser needed)
2. **TS-E2E-01**: App startup & health
3. **TS-E2E-02**: File tree (foundation for navigation)
4. **TS-E2E-03**: Diff view side-by-side
5. **TS-E2E-04**: Diff view inline
6. **TS-E2E-05**: Current state view
7. **TS-E2E-06**: Commit log
8. **TS-E2E-07**: Comments panel
9. **TS-E2E-08**: Search
10. **TS-E2E-09**: Tab bar (multi-workspace)
11. **TS-E2E-10**: Directory picker
12. **TS-E2E-11**: Branch management
13. **TS-E2E-12**: AI commit flow (UI only)
14. **TS-E2E-13**: AI push flow (UI only)
15. **TS-E2E-14**: AI PR flow (UI only)
16. **TS-E2E-15**: Claude sessions browser
17. **TS-E2E-16**: Session queue & detail
18. **TS-E2E-17**: AI prompt interface
19. **TS-E2E-18**: Worktree management
20. **TS-E2E-19**: Responsive & touch

## Non-Destructive Testing Policy

The following actions MUST NOT be executed during E2E tests:
- `git commit` - No actual commits
- `git push` - No actual pushes
- `git checkout` - No branch switches on the real repo
- PR creation - No GitHub API calls
- File modifications - No file writes

All UI panels for these actions should be opened and visually verified, but their submit/execute buttons must NOT be clicked.

## Dev Server Management

```
Start: bun run src/main.ts --port 7155 --no-open
Wait:  Poll GET http://localhost:7155/api/health until 200
Stop:  Send SIGTERM to dev server process
```

Port 7155 is used (not default 7144) to avoid conflicts with any running dev instance.

## Error Handling

- If a screen fails to render, capture a screenshot of the error state
- If an API endpoint returns an error, log the error response body
- Continue with remaining tests even if individual tests fail
- Generate a summary report at the end with pass/fail counts
