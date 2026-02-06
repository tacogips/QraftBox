# Audit Report: Design / Implementation Plan / Source Code

**Generated**: 2026-02-07
**Scope**: `design-docs/specs/` vs `impl-plans/active/` vs `src/`

---

## Table of Contents

- [Section 1: Design Documents vs Implementation Plans](#section-1-design-documents-vs-implementation-plans)
- [Section 2: Implementation Plans vs Actual Source Code](#section-2-implementation-plans-vs-actual-source-code)
- [Section 3: Specification Issues and Concerns](#section-3-specification-issues-and-concerns)

---

## Section 1: Design Documents vs Implementation Plans

### 1.1 Missing Implementation Plan

- `design-claude-session-browser.md` has NO corresponding implementation plan (plan 24 does not exist in `impl-plans/active/`). The entire feature (types, reader, registry, routes, stores, UI components) has no plan.

### 1.2 Missing Features (in design but not in any impl plan)

**From design-local-diff-viewer.md:**
- Binary file handling (image preview, video player, `[IMG]`/`[BIN]` badges)
- Large file handling (1MB threshold, partial content, "Load Full File" button)
- Operation Queue for git concurrency (serial FIFO queue)
- Offline mode degradation
- Pinch-to-zoom, pull-to-refresh, long-press context menu gestures
- Untracked file handling ("always include untracked files")
- Port conflict auto-increment (range 7144-7244)
- `git check-ignore --stdin` filter (plan 06 uses custom parser instead)
- `/api/notes/push` and `/api/notes/pull` endpoints
- `/api/files/autocomplete` endpoint
- `AIPromptInline.svelte` component
- `@` file reference autocomplete with fuzzy search
- `ConversationCarousel.svelte`, `MessageCard.svelte`, `ToolCallDisplay.svelte`
- Theme/appearance settings

**From design-ai-commit.md:**
- `push-with-pr.md` template
- `pr-update.md` template
- `CommitState.isOpen`, `CommitState.promptPreview`, `CommitState.availableTemplates` fields
- `CommitActions.open()`, `close()`, `setVariable()`, `previewPrompt()` actions

**From design-multi-directory-workspace.md:**
- `DirectoryBookmark` type and bookmark endpoints (`GET/POST/DELETE /api/workspace/bookmarks`)
- `BookmarksPanel.svelte`, `TabOverflowMenu.svelte`, `PathBreadcrumb.svelte`, `PathInput.svelte`, `RecentPanel.svelte`, `OpenButton.svelte`, `NewTabButton.svelte`
- Keyboard shortcuts (`Cmd+T`, `Cmd+W`, `Cmd+Tab`)
- URL routing for contexts (`http://localhost:3000/ctx/{id}`)
- `DirectoryBrowserState` and `DirectoryBrowserStore` with history/back/forward
- Workspace persistence to `~/.aynd/workspace.json`

### 1.3 Type/Interface Mismatches

| Location | Design | Impl Plan | Issue |
|----------|--------|-----------|-------|
| DiffFile.status | `'added'\|'modified'\|'deleted'\|'renamed'` | `'A'\|'M'\|'D'\|'R'\|'C'` (plan 03) | Format (words vs letters), 'C' (copy) missing from design |
| Branch interface | `Branch` with `aheadBehind` | `BranchInfo` with `tracking`, extra `remoteRef` (plan 15) | Name and field differences |
| BranchListResponse | `{ default: string }` | `{ defaultBranch: string }` (plan 15) | Field name |
| BranchCheckoutResponse.stashCreated | `string` (stash ref) | `boolean` (plan 15) | Type difference |
| WorkingTreeStatus | `string[]` arrays, `conflicts` | `FileStatus[]` arrays, `conflicted` (plan 09) | Type and field name |
| AISession | `sequenceNumber`, `cost`, `tokens`, `progress`, `response` | `sessionNumber`, `totalCost`, `tokenUsage`, `progressEvents`, `fullResponse` (plan 12) | All field names differ |
| AIProgressEvent.type | `'tool_start'\|'tool_end'\|'message'\|'error'` | `'tool_use'\|'tool_result'\|'text'\|'error'` (plan 12) | Enum values differ |
| QueueStatus | `totalCompleted` | `completed` + extra `total` (plan 13) | Field names |
| ConversationTurn | `index`, `content`, `toolCalls`, `timestamp` | `turnIndex`, `text`, `tools`, `createdAt` (plan 13) | All field names differ |
| ToolCall | `id`, `name`, `input`, `output`, `duration`, `status` | `toolId`, `toolName`, `arguments`, `result`, `executionTime`, `state` (plan 13) | All field names differ |
| CommitPromptContext | `diffSummary`, `recentCommits: string[]`, `customVariables` | `stagedDiff`, `recentCommits: CommitInfo[]`, `repositoryRoot` (plan 19) | Multiple differences |
| CommitResult | `commitMessage`, `sessionId` | `message`, no `sessionId` (plan 19) | Missing field, name change |
| BranchPRStatus | 5 fields | 8 fields (plan 22 adds `availableBaseBranches`, `repoOwner`, `repoName`) | Plan extends design |

### 1.4 API Endpoint Discrepancies

**Context-scoping inconsistency (systematic):**
- `design-local-diff-viewer.md` uses `/api/diff`, `/api/files`, `/api/branches`, `/api/ai/*` etc.
- All plans correctly use `/api/ctx/:id/...` prefix
- The design document was never updated after multi-directory-workspace was designed

**Other endpoint differences:**
- PR update: Design = `PATCH /api/ctx/:id/pr` (prNumber in body), Plan 22 = `PUT /api/ctx/:id/pr/:prNumber` (different method, prNumber in URL)
- Plan 22 adds extra endpoints not in design: `POST .../pr/:prNumber/labels`, `POST .../pr/:prNumber/reviewers`, `GET .../pr/branches`
- Prompt loader: Design has no `category` parameter; Plan 18 adds `category` to all methods

### 1.5 Component Name Mismatches

| Design | Plan | Area |
|--------|------|------|
| `ConversationChatView.svelte` | `SessionConversation.svelte` (plan 13) | Session Queue |
| `ConversationCarousel.svelte` | `SessionCarousel.svelte` (plan 13) | Session Queue |
| `MessageCard.svelte` | `TurnCard.svelte` (plan 13) | Session Queue |
| `ToolCallDisplay.svelte` | `ToolCallBadge.svelte` (plan 13) | Session Queue |
| `AIPromptInline.svelte` + `FileAutocomplete.svelte` | Not in any plan | AI Prompt |

### 1.6 Behavioral Differences

- **File watching**: Design uses `git check-ignore --stdin` (spawns git); Plan 06 implements custom gitignore parser
- **Push execution**: Design routes push through AI session queue; Plan 20 executor directly runs `git push`
- **Commit execution**: Plan 19 notes AI session manager integration is "pending"

---

## Section 2: Implementation Plans vs Actual Source Code

### 2.1 CRITICAL: Plans Marked COMPLETED But Files Missing

28 source files across plans 01-06 and 15 are marked COMPLETED but **do not exist** in the source tree. Plans claim 400+ passing tests for these missing files.

| Plan | Missing Directory/Files | Claimed Tests |
|------|------------------------|---------------|
| 01 (CLI Layer) | `src/cli/` entirely missing (`index.ts`, `config.ts`), `src/types/index.ts` | 37 |
| 02 (Server Core) | `src/server/index.ts`, `src/server/static.ts`, `src/server/websocket/` entirely, `src/server/errors.ts` | 69 |
| 03 (Git Operations) | `src/types/git.ts`, `src/server/git/executor.ts`, `src/server/git/diff.ts`, `src/server/git/parser.ts`, `src/server/git/files.ts` | 46 |
| 04 (API Routes) | `src/server/routes/diff.ts`, `src/server/routes/files.ts`, `src/server/routes/status.ts`, `src/server/routes/index.ts` | 4 |
| 05 (git-xnotes) | `src/types/comments.ts`, `src/server/comments/` entirely (`bridge.ts`, `sync.ts`), `src/server/routes/comments.ts` | 77 |
| 06 (File Watcher) | `src/types/watcher.ts`, `src/server/watcher/` entirely (`gitignore.ts`, `debounce.ts`, `index.ts`, `broadcast.ts`) | 109 |
| 15 (Branch Switching) | `src/types/branch.ts`, `src/server/git/branch.ts`, `src/server/routes/branches.ts` | 66 |

### 2.2 Plans Marked NOT_STARTED But Code Exists

| Plan | Module | Plan Status | Actual Status |
|------|--------|-------------|---------------|
| 18 (Prompt System) | `src/server/prompts/loader.ts` | NOT_STARTED | Fully implemented |
| 18 (Prompt System) | `src/server/prompts/builder.ts` | NOT_STARTED | Fully implemented |
| 18 (Prompt System) | `src/server/routes/prompts.ts` | NOT_STARTED | Fully implemented |
| 22 (AI PR) | `src/server/github/pr-service.ts` | NOT_STARTED | Fully implemented |

### 2.3 Source Code Without Implementation Plan

| File | Description |
|------|-------------|
| `src/types/claude-session.ts` | Claude session browsing types |
| `src/server/claude/session-reader.ts` | Reads Claude sessions from `~/.claude/projects/` |
| `src/server/claude/session-registry.ts` | Tracks aynd-created sessions |
| `src/server/routes/claude-sessions.ts` | REST API for session browsing |
| `src/server/prompts/templates.ts` | Built-in prompt templates |

### 2.4 Interface/API Mismatches Between Plans and Code

| Plan | Issue |
|------|-------|
| 12 (AI) | `AIPromptRequest.options` is inline object in plan; uses separate `AIPromptOptions` interface in code |
| 14 (Search) | `SearchResponse` has extra `truncated: boolean` in code; `SearchRequest` has extra `caseSensitive`, `maxResults` |
| 18 (Prompt) | Plan specifies `createPromptLoader()` factory; code uses standalone exported functions |
| 18 (Prompt) | Plan specifies `createPromptBuilder()` factory; code uses standalone functions |
| 18 (Prompt) | Plan specifies `watchPrompts(onChange)` function; not implemented |
| 19 (Commit) | Plan specifies `createCommitExecutor()` factory; code uses standalone functions with different signatures |
| 22 (PR) | Plan: `getPR(owner, repo, branch)`; Code: `getPR(owner, repo, prNumber)` + separate `getPRForBranch` |
| 22 (PR) | Plan: `createPRExecutor(promptLoader, promptBuilder, sessionManager, prService)`; Code: `createPRExecutor(prService)` |

---

## Section 3: Specification Issues and Concerns

### 3.1 CRITICAL

**C1. No Authentication or Authorization on HTTP Server**
All design docs expose powerful REST APIs (file browsing, git checkout, AI execution, worktree deletion) with zero authentication. Even on localhost, any local process or browser tab can perform destructive operations via CSRF.

**C2. Directory Browser Exposes Entire Filesystem**
`/api/browse` accepts any path with no restrictions. The design mentions "Optional: whitelist base directories" but the implementation has no path restrictions. Combined with C1, any process can list `/etc/`, `~/.ssh/`, `~/.claude/`.

**C3. Worktree Removal Has No Safety Guards**
No check prevents removing the currently active worktree (the one aynd serves from), a worktree with an open tab, or one being modified by an AI session.

**C4. AI Session Manager Is Completely Stubbed**
`src/server/ai/session-manager.ts` `executeSession` contains only stub code with `TODO: Integrate with actual claude-code-agent`. All AI features depend on this.

### 3.2 HIGH

**H1. Two Incompatible Session Management Systems**
aynd SessionManager (in-memory queue, shown at `/sessions`) and Claude Session Browser (reads `~/.claude/projects/`, shown at `/claude-sessions`) are not reconciled. No specification for how aynd sessions map to Claude sessions on disk, or what happens after restart.

**H2. Concurrent AI Sessions Can Cause Git Conflicts**
Design allows `maxConcurrent > 1`, but multiple Claude Code sessions can modify the same files simultaneously. The git operation queue only serializes git commands, not file modifications by Claude Code.

**H3. Force Push Safety Is Prompt-Only**
Force push protection relies on Handlebars template text (`{{#if (eq confirm "FORCE")}}`). The AI can still execute `git push --force` regardless. No server-side enforcement.

**H4. Prompt Template Injection Risk**
Custom variables and `diffSummary` (arbitrary file content) are interpolated into prompts. Malicious branch names or file content could inject instructions into AI prompts.

**H5. Claude Session Browser Reads Sensitive Data Without Access Controls**
Combined with C1, any process can read all Claude conversation history via HTTP API.

**H6. No Graceful Shutdown or State Persistence**
No specification for crash recovery, cleanup of running AI sessions, or when workspace state is persisted.

**H7. Path Encoding Collision in Worktrees**
`/` to `__` encoding creates ambiguity: `/home/user__projects/app` and `/home/user/projects/app` produce similar encodings.

### 3.3 MEDIUM

**M1. Port Inconsistency**: `design-local-diff-viewer.md` = 7144, `design-multi-directory-workspace.md` URL example = 3000

**M2. Commit Log Search**: Uses `--grep` and `--author` with same query (AND logic), likely should be OR

**M3. WebSocket + SSE Used Simultaneously**: File watching uses WebSocket, AI streaming uses SSE. Two real-time mechanisms adds complexity without justification.

**M4. File Watcher Gaps**: No spec for recursive depth, symlink handling, circular symlink protection, or dynamically added directories

**M5. Multi-Workspace Resource Limits**: 10 tabs = 10 file watchers + 10 git processes. No memory limits, no unload timeout specified.

**M6. `executeNow` Bypasses Queue**: Immediate execution starts even when at capacity, contradicting maxConcurrent limit.

**M7. Keyboard Shortcuts Conflict with Browser**: `Cmd+T`, `Cmd+W`, `Cmd+Tab` are browser defaults. They will be intercepted by the browser.

**M8. Keyboard Shortcuts Contradiction**: `design-commit-log-viewer.md` defines shortcuts while `design-local-diff-viewer.md` explicitly defers them ("Touch-only UI").

**M9. Duplicate PR Creation Paths**: `push-with-pr.md` template runs `gh pr create`, while PR button uses Octokit. Two paths with different auth mechanisms.

**M10. Session Resume Cross-Project**: No spec for what happens when resuming a session from a different project (directory missing, branch changed, etc.)

### 3.4 LOW

**L1.** `DiffFile.status` uses words (`'added'`), `CommitFileChange.status` uses letters (`'A'`). Copy status (`'C'`) missing from diff viewer types.

**L2.** `architecture.md` and `command.md` are placeholder documents with no value.

**L3.** Session storage uses three different directories (`~/.local/aynd/`, `~/.aynd/`, `~/.config/aynd/`) without following XDG consistently.

**L4.** No file tree badge for `[R]` (renamed) status.

**L5.** Empty repository and orphan branch edge cases not fully specified.

**L6.** Binary file diff handling unclear (modified images, SVG XSS, size limits).

**L7.** Debounce inconsistency: file watcher 100ms vs search input 300ms.

**L8.** No maximum response size limits on any API endpoint.

**L9.** Worktree name validation rejects `/` but branch names like `feature/auth` contain `/`. Default worktree name from branch will fail validation.

**L10.** Handlebars template engine not in dependency list despite being used in prompt templates.

### 3.5 Cross-Document Consistency

**X1.** Context-scoped API routes (`/api/ctx/:contextId/*`) from multi-directory-workspace not reflected in older design docs.

**X2.** `isGitRepository` duplicated with different implementations: `context-manager.ts` handles worktrees correctly, `browse.ts` does not.

**X3.** Svelte store patterns: `design-claude-session-browser.md` uses Svelte 4 `writable`/`derived`; all plans use Svelte 5 `$state()`/`$derived()`.
