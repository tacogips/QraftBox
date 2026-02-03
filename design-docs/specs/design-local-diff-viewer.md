# aynd - Local Diff Viewer Design Specification

**aynd** = "All You Need Is Diff"

A high-performance local diff viewer with git-xnotes integration, built with Svelte 5.

## Overview

This document describes the design of a local diff viewer inspired by difit but with:
- High-performance architecture using Svelte 5 and virtualization
- Novel "Current State View" that shows the latest file state with diff annotations
- Integration with git-xnotes for persistent commit comments
- Flexible file tree with diff-only and all-files modes

## Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Local branch/commit diff viewing (no GitHub required) | Must |
| R2 | git-xnotes integration for commit comments | Must |
| R3 | GitHub-style side-by-side diff view | Must |
| R4 | Current State View (single-pane with diff annotations) | Must |
| R5 | File tree with diff-only / all-files toggle | Must |
| R6 | High performance for large file sets | Must |
| R7 | File watching with auto-refresh (non-gitignored files) | Must |
| R8 | AI Agent Integration via claude-code-agent | Must |
| R9 | Branch switching (base/current) with search | Must |
| R10 | LSP integration for caller linking | Future |

## Architecture Overview

```
+------------------+     +------------------+     +------------------+
|     CLI Layer    | --> |   Server Layer   | --> |   Client Layer   |
|  (Bun + Commander)|     |  (Bun + Hono)    |     |  (Svelte 5)      |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +------------------+     +------------------+
|   Git Commands   |     |   git-xnotes     |     | Virtual List +   |
|   (native spawn) |     |   (library)      |     | Shiki Highlighter|
+------------------+     +------------------+     +------------------+
```

### Layer Responsibilities

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| CLI | Bun + Commander | Argument parsing, server lifecycle |
| Server | Bun + Hono | REST API, diff generation, git-xnotes bridge |
| Client | Svelte 5 | UI rendering, view modes, user interaction |

## Technology Stack

### Rationale: Why NOT difit's Stack

| difit Uses | We Use Instead | Reason |
|------------|----------------|--------|
| React 19 | Svelte 5 | Better performance, smaller bundle, less boilerplate |
| simple-git | Native git spawn | Fewer dependencies, more control |
| diff (npm) | parse-diff or custom | Lighter weight, focused functionality |
| Prism.js | Shiki | VS Code-quality highlighting, better themes |
| Express 5 | Hono | Faster, smaller, better TypeScript support |

### Core Dependencies

| Category | Library | Purpose |
|----------|---------|---------|
| Runtime | Bun | Fast JS/TS runtime, built-in bundler |
| Framework | Svelte 5 | Reactive UI with minimal overhead |
| Server | Hono | Lightweight HTTP server |
| CLI | Commander | Argument parsing |
| Highlighting | Shiki | VS Code-quality syntax highlighting |
| Virtualization | svelte-tiny-virtual-list | Efficient rendering of large lists |
| Comments | git-xnotes (library) | Commit comment storage and retrieval |
| AI Integration | claude-code-agent (library) | Claude Code session orchestration |

**Note**: git-xnotes and claude-code-agent are used as **TypeScript libraries** (imported as npm packages), NOT as CLI commands. aynd calls their APIs programmatically from the server layer.

### Library Dependency Policy

git-xnotes and claude-code-agent are maintained by us and can be modified as needed.

| Library | Repository | Maintainer |
|---------|------------|------------|
| git-xnotes | https://github.com/tacogips/git-xnotes | tacogips |
| claude-code-agent | https://github.com/tacogips/claude-code-agent | tacogips |

**When library modifications are needed:**

1. Create an issue in the respective library repository
2. Document the required feature/fix in the issue
3. If the modification blocks aynd implementation, note the blocker in:
   - The implementation plan's Progress Log
   - PROGRESS.json task status (mark as "Blocked")
4. Link the library issue in the implementation plan

**Issue Template:**

```
Title: [aynd] Feature request: <description>

## Context
Required by aynd for: <feature description>

## Requested Change
<specific API or behavior change needed>

## Impact
If not addressed: <what is blocked in aynd>
```

### Build Tools

| Tool | Purpose |
|------|---------|
| Vite + @sveltejs/vite-plugin-svelte | Development server and bundling |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling |

## UI/UX Design Principles

### Tablet-First Design

**Primary Target**: iPad and tablet devices (landscape orientation)

| Priority | Device | Screen Size |
|----------|--------|-------------|
| 1st | Tablet (iPad) | 768px - 1366px |
| 2nd | Desktop | 1366px+ |
| 3rd | Mobile | < 768px (limited support) |

### Design Guidelines

| Principle | Implementation |
|-----------|----------------|
| **Touch-first** | All interactive elements minimum 44x44px tap target |
| **Gesture support** | Swipe, pinch-zoom, long-press throughout |
| **Large text** | Base font 16px+, code 14px+ for readability |
| **Thumb-friendly** | Primary actions in bottom/sides reach zones |
| **No hover states** | All interactions work without hover |
| **Keyboard optional** | Vim shortcuts available but not required |

### Touch Zones (Tablet Landscape)

```
┌─────────────────────────────────────────────────────────────────┐
│                      HARD TO REACH                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                     CONTENT AREA                          │  │
│ E│                                                           │ E│
│ A│                   (scrollable)                            │ A│
│ S│                                                           │ S│
│ Y│                                                           │ Y│
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                      EASY TO REACH (THUMBS)                     │
│  [File Tree Toggle]              [Actions] [Session] [Settings] │
└─────────────────────────────────────────────────────────────────┘
```

### Touch Gestures

| Gesture | Action |
|---------|--------|
| Tap | Select item, toggle, activate button |
| Double-tap | Zoom to fit / reset zoom |
| Long-press | Context menu (comment, AI prompt) |
| Swipe left/right | Navigate files, carousel cards |
| Swipe down | Pull to refresh diff |
| Pinch | Zoom in/out on code |
| Two-finger scroll | Scroll content |

### Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 768px | Single column, bottom sheet panels |
| 768px - 1024px | Collapsible sidebar, full content |
| 1024px+ | Persistent sidebar, split view capable |

### Component Sizing

| Element | Minimum Size | Touch Target |
|---------|--------------|--------------|
| Buttons | 44x44px | 48x48px recommended |
| List items | 48px height | Full width tap |
| Icons | 24x24px | 44x44px tap area |
| Input fields | 48px height | - |
| Line numbers | 44px width | Tap to select line |

## UI Design

### Layout Structure (Tablet-Optimized)

**Landscape Tablet Layout (Primary):**

```
┌─────────────────────────────────────────────────────────────────┐
│  [=] Branch v │ main...feature │ [View Mode] [Session: 2] [...]│
├───────────────┼─────────────────────────────────────────────────┤
│               │                                                 │
│  File Tree    │  Main Content Area                              │
│  (collapsible)│  (Diff View or Current State View)              │
│               │                                                 │
│  [tap to      │  ┌─────────────────────────────────────────┐    │
│   collapse]   │  │  (pinch to zoom, swipe to scroll)      │    │
│               │  │                                         │    │
│  src/         │  │  Code content with touch-friendly      │    │
│  ├─ main.ts[M]│  │  line selection                        │    │
│  ├─ lib.ts    │  │                                         │    │
│  └─ ...       │  └─────────────────────────────────────────┘    │
│               │                                                 │
├───────────────┴─────────────────────────────────────────────────┤
│  [File Tree] [Comments: 3] [AI Prompt]    [Sync] [Refresh] [Q]  │
└─────────────────────────────────────────────────────────────────┘
        ↑ Bottom toolbar: primary actions in thumb reach zone
```

**Portrait Tablet / Large Phone:**

```
┌─────────────────────────────────────┐
│  [=] main...feature  [Actions ...]  │
├─────────────────────────────────────┤
│                                     │
│  Main Content Area                  │
│  (full width, swipe to navigate)    │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  [Files] [Comments] [AI] [Queue]    │
└─────────────────────────────────────┘
        ↑ File tree as bottom sheet
```

**Key Layout Features:**

| Feature | Implementation |
|---------|----------------|
| Collapsible sidebar | Swipe or tap to toggle file tree |
| Bottom toolbar | Primary actions always in thumb reach |
| Pull to refresh | Swipe down to refresh diff |
| Bottom sheets | Modals slide up from bottom |
| Safe areas | Respect notch/home indicator on tablets |

### View Modes

#### 1. GitHub-Style Diff View (Default)

Traditional side-by-side or inline diff view:

```
┌─────────────────────────────────────────────────────────────────┐
│ src/main.ts                                        [+10 -5]     │
├────────────────────────────┬────────────────────────────────────┤
│ OLD (left)                 │ NEW (right)                        │
│ 10: const foo = 1;         │ 10: const foo = 1;                 │
│ 11: const bar = 2;    [-]  │                                    │
│                            │ 11: const baz = 3;            [+]  │
│ 12: return foo + bar;      │ 12: return foo + baz;              │
└────────────────────────────┴────────────────────────────────────┘
```

#### 2. Current State View (Novel Feature)

Shows only the latest file state with visual diff annotations:

```
┌─────────────────────────────────────────────────────────────────┐
│ src/main.ts                               [Current State View]  │
├─────────────────────────────────────────────────────────────────┤
│ 10: const foo = 1;                                              │
│ ──────────────── (thin red line: deleted content) [expand]      │
│ 11: const baz = 3;                           [green background] │
│ 12: return foo + baz;                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Indicators:**

| Element | Visual Treatment |
|---------|------------------|
| Added lines | Green background (#22863a15 or similar) |
| Deleted location | Thin red horizontal line (1-2px, #cb2431) |
| Expand deleted | Click line to show deleted content inline |
| Modified lines | Green background (shows new content only) |

**Expand/Collapse Behavior:**

| Setting | Value |
|---------|-------|
| Expand method | Inline expansion (pushes content down) |
| Default state | All collapsed |
| Multiple deletions | Expand individually + "Expand All" button |

**Interaction (Touch-first):**

| Gesture | Action |
|---------|--------|
| Tap thin red line | Expand deleted content inline |
| Long-press red line | Preview deleted in popup |
| Tap expanded block | Collapse back |
| Pinch on code | Zoom in/out |
| Two-finger tap | Expand/collapse all |

**Expanded State Example:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 10: const foo = 1;                                              │
│ ┌─ DELETED ─────────────────────────────────────────────────┐   │
│ │ 11: const bar = 2;                          [red bg]      │   │
│ │ 12: const qux = 3;                          [red bg]      │   │
│ └───────────────────────────────────────────── [collapse] ──┘   │
│ 11: const baz = 3;                           [green background] │
└─────────────────────────────────────────────────────────────────┘
```

### File Tree

#### Two Display Modes

| Mode | Behavior |
|------|----------|
| Diff Only (default) | Shows only files with changes |
| All Files | Shows entire repository structure |

#### Visual Indicators

```
src/
├── main.ts          [M] (modified badge)
├── lib.ts           [+] (added badge)
├── old.ts           [-] (deleted badge)
├── utils/
│   ├── helper.ts    [M]
│   └── constants.ts     (no badge = unchanged)
```

| Badge | Meaning | Color |
|-------|---------|-------|
| [M] | Modified | Yellow/Orange |
| [+] | Added | Green |
| [-] | Deleted | Red |
| (none) | Unchanged | Gray text |

**File Tree Touch Interactions:**

| Gesture | Action |
|---------|--------|
| Tap file | Open file in viewer |
| Tap folder | Expand/collapse |
| Long-press | Context menu (open in new tab, copy path) |
| Swipe right on file | Quick actions (comment, AI prompt) |
| Pull down | Refresh file list |

### Comment System (git-xnotes Integration)

#### Configuration

| Setting | Value |
|---------|-------|
| Threading depth | One level (parent + replies, no deep nesting) |
| Sync behavior | Configurable (manual by default, optional auto-sync) |
| Author identification | Default: git config user.email, customizable in settings |

#### Adding Comments (Touch-first)

| Step | Touch Gesture |
|------|---------------|
| 1. Select line(s) | Tap line number, or long-press and drag |
| 2. Open comment | Tap [+] button or long-press |
| 3. Write comment | On-screen keyboard |
| 4. Submit | Tap [Send] button |

- Comment form slides up as bottom sheet on tablet
- Author pre-filled from git config (editable)
- Large touch-friendly text input area

#### Comment Display

```
┌─────────────────────────────────────────────────────────────────┐
│ 15: function processData(input: string) {                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [user@example.com] 2025-01-15 10:30                         │ │
│ │ Consider adding input validation here                       │ │
│ │                                              [Reply] [Edit] │ │
│ │                                                             │ │
│ │   └─ [dev@example.com] 2025-01-15 11:00                     │ │
│ │      Fixed in latest commit                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ 16:   return input.trim();                                      │
└─────────────────────────────────────────────────────────────────┘
```

#### git-xnotes Sync Configuration

| Mode | Behavior |
|------|----------|
| Manual (default) | User explicitly pushes/pulls via UI buttons |
| Auto-push | Automatically push after adding/editing comments |
| Auto-pull | Automatically pull on startup |
| Full auto | Both auto-push and auto-pull |

Configuration via CLI flag or settings:
```bash
aynd --sync=manual    # Default
aynd --sync=auto      # Full auto-sync
```

#### git-xnotes Library Usage

**Important**: git-xnotes is used as a **TypeScript library** (npm package), not as a CLI command. aynd imports and calls its API directly from the server layer.

```typescript
// Server-side bridge using git-xnotes library
import { readComments, appendComment, pushAllNotes } from 'git-xnotes';  // Library import

interface CommentBridge {
  // Read comments for current diff range
  getComments(commit: string): Promise<Comment[]>;

  // Add new comment
  addComment(commit: string, comment: NewComment): Promise<Comment>;

  // Reply to existing comment (one level only)
  replyToComment(commit: string, parentId: string, reply: NewComment): Promise<Comment>;

  // Sync status
  getSyncStatus(): Promise<{ local: number; remote: number; syncMode: SyncMode }>;

  // Push/pull notes
  pushNotes(): Promise<void>;
  pullNotes(): Promise<void>;

  // Get author info
  getDefaultAuthor(): Promise<{ name: string; email: string }>;
}

type SyncMode = 'manual' | 'auto-push' | 'auto-pull' | 'auto';
```

### AI Agent Integration (claude-code-agent)

Execute Claude Code prompts directly from the diff/file viewer to make code modifications.

#### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   aynd Client   │ --> │   aynd Server   │ --> │ claude-code-    │
│   (Svelte)      │     │   (Hono)        │     │ agent SDK       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ^                       |                       |
        |                       v                       v
        |               ┌─────────────────┐     ┌─────────────────┐
        +---------------|   SSE Events    | <-- │  Claude Code    │
                        │   (progress)    │     │  (subprocess)   │
                        └─────────────────┘     └─────────────────┘
```

#### Two Entry Points

| Entry Point | Location | Use Case |
|-------------|----------|----------|
| Line-based prompt | Inline (like comments) | Context-specific modifications |
| Global prompt area | Bottom panel | General prompts with optional file refs |

#### 1. Line-Based AI Prompt

Select lines and send context-aware prompts to Claude Code.

**Interaction Flow (Touch-first):**

| Step | Touch Gesture |
|------|---------------|
| 1. Select lines | Tap line, or long-press + drag |
| 2. Open AI prompt | Tap [AI] button in selection toolbar |
| 3. Add file refs | Tap [@] button, search and tap to add |
| 4. Write prompt | On-screen keyboard |
| 5. Choose mode | Tap "Immediate" or "Queue" toggle |
| 6. Submit | Tap [Send] button |

AI prompt opens as **bottom sheet** on tablet for comfortable typing.

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 15: function processData(input: string) {                       │
│ 16:   return input.trim();                         [selected]   │
│ 17: }                                              [selected]   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [AI] src/main.ts:L15-L17                                    │ │
│ │                                                             │ │
│ │ Add input validation and error handling.                    │ │
│ │ Reference @src/types/errors.ts for error types.             │ │
│ │                                                             │ │
│ │ [@] Add file reference    [Cancel] [Send to Claude Code]    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ 18: export function helper() {                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. Global AI Prompt Area

Collapsible prompt input panel at the bottom of the screen.
**Note**: This is for prompt INPUT only. Session progress/results are shown in Session Queue screen.

**UI Mockup (collapsed):**

```
┌─────────────────────────────────────────────────────────────────┐
│  [AI Prompt]  Click to expand or press 'A'    [Queue: 2] [Q]    │
└─────────────────────────────────────────────────────────────────┘
```

**UI Mockup (expanded):**

```
┌─────────────────────────────────────────────────────────────────┐
│  [AI Prompt]                                   [Queue: 2] [Q]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Refactor the authentication module to use async/await.         │
│  See @src/auth/login.ts and @src/auth/session.ts                │
│                                                                 │
│  Execution: (*) Immediate  ( ) Add to Queue                     │
│                                                                 │
│  [@] Add file    [Clear]               [Cancel] [Send]          │
└─────────────────────────────────────────────────────────────────┘
```

- `[Queue: N]` shows count of running/queued sessions
- `[Q]` button navigates to Session Queue screen

#### @ File Reference (Autocomplete)

Type `@` to trigger file reference autocomplete.

**Behavior:**

| Input | Action |
|-------|--------|
| `@` | Show recent/related files |
| `@src/` | Filter files starting with "src/" |
| `@auth` | Fuzzy search for files containing "auth" |
| `@src/main.ts:L10-L20` | Reference specific line range |

**Autocomplete UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Add validation. See @auth|                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ src/auth/login.ts               [M] (modified in this diff) │ │
│ │ src/auth/session.ts             [M]                         │ │
│ │ src/auth/types.ts                                           │ │
│ │ tests/auth.test.ts                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Fuzzy search on filename and path
- Changed files (in current diff) shown with badge and prioritized
- Line range support: `@file.ts:L10` or `@file.ts:L10-L20`

**Touch Interaction:**
- Tap [@] button to open file picker
- Search with on-screen keyboard
- Tap file in list to insert reference
- Large touch targets (48px+ height) for easy selection

#### Prompt Context Construction

When sending a prompt, aynd constructs context for Claude Code:

```typescript
interface AIPromptRequest {
  prompt: string;                    // User's prompt text
  context: {
    // For line-based prompts
    primaryFile?: {
      path: string;
      startLine: number;
      endLine: number;
      content: string;               // Selected lines content
    };
    // Referenced files via @mentions
    references: Array<{
      path: string;
      startLine?: number;
      endLine?: number;
      content?: string;              // Included if line range specified
    }>;
    // Current diff context
    diffSummary?: {
      baseBranch: string;
      targetBranch: string;
      changedFiles: string[];
    };
  };
  options: {
    projectPath: string;
    sessionMode: 'continue' | 'new';  // Continue existing or start new
  };
}
```

#### Execution Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Immediate** | Execute prompt right away | Quick single task |
| **Queued** | Add to queue, execute sequentially | Multiple related tasks |

**UI for mode selection:**

```
┌─────────────────────────────────────────────────────────────────┐
│ [AI] src/main.ts:L15-L17                                        │
│                                                                 │
│ Add input validation and error handling.                        │
│                                                                 │
│ Execution: ( ) Immediate  (*) Add to Queue                      │
│                                                                 │
│ [@] Add file reference    [Cancel] [Send]                       │
└─────────────────────────────────────────────────────────────────┘
```

#### Session Display in Viewer (Minimal)

**IMPORTANT**: The diff/file viewer does NOT show full session progress or responses.
Only a minimal **Session Button** indicates running/queued sessions.

**Session Button (in header or footer):**

```
┌─────────────────────────────────────────────────────────────────┐
│ src/main.ts  [M]        [Session: 2 running, 3 queued]  [Queue] │
└─────────────────────────────────────────────────────────────────┘
```

| State | Display |
|-------|---------|
| No sessions | Button hidden or grayed |
| Sessions running | `[Session: N running]` with spinner |
| Sessions queued | `[Session: N queued]` |
| Mixed | `[Session: N running, M queued]` |

Clicking the Session Button navigates to the **Session Queue Screen**.

#### Session Queue Screen

Dedicated screen for managing AI sessions. Accessed via:
- Session Button in viewer
- URL: `/sessions`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Session Queue                           [Back to Diff] [Clear] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RUNNING (1)                                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ #3  Add validation to login.ts                            │  │
│  │     src/auth/login.ts:L15-L20                             │  │
│  │     Status: Running... (12s)           [Cancel]           │  │
│  │     > Writing src/auth/login.ts                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  QUEUED (2)                                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ #4  Refactor session handling                             │  │
│  │     src/auth/session.ts:L30-L45                           │  │
│  │     Status: Queued (position 1)    [Run Now] [Remove]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ #5  Add unit tests                                        │  │
│  │     No file context                                       │  │
│  │     Status: Queued (position 2)    [Run Now] [Remove]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  COMPLETED (5)                                      [Show All]  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ #2  Fix type errors                        $0.05  [View]  │  │
│  │ #1  Initial setup                          $0.02  [View]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Session Queue Features:**

| Feature | Description |
|---------|-------------|
| Running section | Shows current executing session with live progress |
| Queued section | Pending sessions with reorder/remove options |
| Completed section | History of finished sessions |
| [Run Now] | Execute queued item immediately (skip queue) |
| [View] | Expand to see full prompt/response details |
| [Cancel] | Cancel running session |
| [Remove] | Remove from queue |
| [Clear] | Clear completed sessions |

**Touch Interactions (Session Queue):**

| Gesture | Action |
|---------|--------|
| Tap session card | Expand/collapse details |
| Long-press card | Show action menu |
| Swipe left on queued | Reveal [Run Now] [Remove] |
| Swipe left on completed | Reveal [Delete] |
| Drag handle | Reorder queued sessions |
| Pull down | Refresh queue status |

**Session Detail View (expanded):**

Two display modes for conversation history:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Chat View** | Traditional vertical scrolling | Reading full context |
| **Carousel View** | Horizontal card carousel | Quick navigation between turns |

Toggle with `[Chat]` / `[Carousel]` buttons.

**Chat View (vertical, default):**

```
┌───────────────────────────────────────────────────────────────┐
│ #2  Fix type errors                 [Chat] [Carousel] [Close] │
├───────────────────────────────────────────────────────────────┤
│ ┌─ USER ────────────────────────────────────────────────────┐ │
│ │ Fix the type errors in the authentication module.         │ │
│ │ Reference @src/types/auth.ts                              │ │
│ │                                                           │ │
│ │ Context: src/auth/login.ts:L15-L20                        │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─ ASSISTANT ───────────────────────────────────────────────┐ │
│ │ I'll fix the type errors in the authentication module.    │ │
│ │                                                           │ │
│ │ First, let me read the current implementation...          │ │
│ │                                                           │ │
│ │ [Tool: Read src/auth/login.ts]                            │ │
│ │                                                           │ │
│ │ I've identified the issues:                               │ │
│ │ 1. Missing return type on login()                         │ │
│ │ 2. AuthResult interface needs updating                    │ │
│ │                                                           │ │
│ │ [Tool: Write src/auth/login.ts]                           │ │
│ │                                                           │ │
│ │ Done! The type errors have been fixed.                    │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─ USER ────────────────────────────────────────────────────┐ │
│ │ Also update the tests                                     │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─ ASSISTANT ───────────────────────────────────────────────┐ │
│ │ I'll update the tests to match the new types...           │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Duration: 15.3s | Cost: $0.05 | Tokens: 2,345 in / 1,234 out  │
└───────────────────────────────────────────────────────────────┘
```

**Carousel View (horizontal cards):**

```
┌───────────────────────────────────────────────────────────────┐
│ #2  Fix type errors                 [Chat] [Carousel] [Close] │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  [<]  Card 2 of 4                                       [>]   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  ASSISTANT  (Turn 1)                                   │   │
│  │                                                        │   │
│  │  I'll fix the type errors in the authentication       │   │
│  │  module.                                               │   │
│  │                                                        │   │
│  │  First, let me read the current implementation...      │   │
│  │                                                        │   │
│  │  [Tool: Read src/auth/login.ts]                        │   │
│  │                                                        │   │
│  │  I've identified the issues:                           │   │
│  │  1. Missing return type on login()                     │   │
│  │  2. AuthResult interface needs updating                │   │
│  │                                                        │   │
│  │  [Tool: Write src/auth/login.ts]                       │   │
│  │                                                        │   │
│  │  Done! The type errors have been fixed.                │   │
│  │                                                        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ○ ● ○ ○   (pagination dots)                                  │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Duration: 15.3s | Cost: $0.05 | Tokens: 2,345 in / 1,234 out  │
└───────────────────────────────────────────────────────────────┘
```

**Carousel Navigation:**

| Input | Action |
|-------|--------|
| `ArrowLeft` / `ArrowRight` | Previous/Next card |
| Swipe (touch) | Navigate cards |
| Click dots | Jump to card |
| Click `[<]` / `[>]` buttons | Previous/Next card |

**Card Types:**

| Card Type | Content | Color |
|-----------|---------|-------|
| USER | User prompt with context | Blue border |
| ASSISTANT | Claude response with tool calls | Green border |
| ERROR | Error message | Red border |

**Tool Call Display (in cards):**

```
┌─ Tool: Read ────────────────────────────┐
│ src/auth/login.ts                       │
│ [Expand to see content]                 │
└─────────────────────────────────────────┘

┌─ Tool: Write ───────────────────────────┐
│ src/auth/login.ts (+15 -8)              │
│ [Expand to see diff]                    │
└─────────────────────────────────────────┘
```

#### Queue Management

```typescript
interface SessionQueue {
  // Add to queue
  enqueue(request: AIPromptRequest): string;  // Returns session ID

  // Execute immediately (bypass queue)
  executeNow(request: AIPromptRequest): string;

  // Queue operations
  remove(sessionId: string): void;
  reorder(sessionId: string, newPosition: number): void;
  runNow(sessionId: string): void;  // Move from queue to running

  // Status
  getRunning(): AISession[];
  getQueued(): AISession[];
  getCompleted(): AISession[];
}
```

**Queue Behavior:**

| Setting | Default | Description |
|---------|---------|-------------|
| Max concurrent | 1 | Sessions running simultaneously |
| Auto-advance | true | Start next queued when current completes |
| Keep history | 50 | Number of completed sessions to retain |

#### Server-Side Integration

```typescript
// aynd server routes for AI integration
interface AIRoutes {
  // Send prompt (immediate or queued)
  POST: '/api/ai/prompt' => {
    body: AIPromptRequest & { immediate: boolean };
    response: { sessionId: string; queuePosition?: number };
  };

  // Get queue status for Session Button
  GET: '/api/ai/queue/status' => QueueStatus;

  // Get full queue state
  GET: '/api/ai/queue' => {
    running: AISession[];
    queued: AISession[];
    completed: AISession[];
  };

  // Stream session progress (SSE)
  GET: '/api/ai/session/:id/stream' => SSE<SessionEvent>;

  // Session operations
  POST: '/api/ai/session/:id/cancel' => { success: boolean };
  POST: '/api/ai/session/:id/run-now' => { success: boolean };
  DELETE: '/api/ai/session/:id' => { success: boolean };
}
```

#### claude-code-agent Library Usage

**Important**: claude-code-agent is used as a **TypeScript library** (npm package), not as a CLI command. aynd imports and calls its API directly.

```typescript
import { ClaudeCodeAgent } from 'claude-code-agent';  // Library import

const agent = new ClaudeCodeAgent({
  configDir: '~/.config/claude-code-agent',
  dataDir: '~/.local/claude-code-agent',
});

// Session queue manager
class AISessionQueue {
  private running: AISession | null = null;
  private queue: AISession[] = [];
  private completed: AISession[] = [];

  async enqueue(request: AIPromptRequest): Promise<string> {
    const session = createSession(request);
    this.queue.push(session);
    this.processQueue();  // Start if nothing running
    return session.id;
  }

  async executeNow(request: AIPromptRequest): Promise<string> {
    const session = createSession(request);
    await this.runSession(session);
    return session.id;
  }

  private async runSession(session: AISession) {
    this.running = session;
    session.status = 'running';
    session.startedAt = Date.now();

    await agent.runSession({
      projectPath: session.context.projectPath,
      prompt: buildPromptWithContext(session),
      onProgress: (event) => {
        session.progress.push(event);
        this.emitUpdate(session);
      },
    });

    session.status = 'completed';
    session.completedAt = Date.now();
    this.completed.unshift(session);
    this.running = null;
    this.processQueue();  // Start next
  }
}
```

#### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| AI enabled | true | Enable AI integration |
| Default execution | immediate | Default: immediate or queued |
| Max concurrent | 1 | Max sessions running simultaneously |
| Auto-refresh | true | Refresh diff after AI completes |
| History limit | 50 | Completed sessions to retain |

CLI flags:
```bash
aynd --no-ai                    # Disable AI integration
aynd --ai-queue                 # Default to queued execution
aynd --ai-concurrent=2          # Allow 2 concurrent sessions
```

#### AI Authentication

Authentication is handled entirely by claude-code-agent library. aynd does not manage API credentials.

| Responsibility | Handler |
|----------------|---------|
| API key storage | claude-code-agent |
| Authentication flow | claude-code-agent |
| Token refresh | claude-code-agent |

#### AI Session Persistence

aynd stores only session IDs locally. Full session content is retrieved via claude-code-agent.

**Storage Location:** `~/.local/aynd/sessions/`

**Stored Data:**

```typescript
// ~/.local/aynd/sessions/sessions.json
interface StoredSessions {
  sessions: Array<{
    id: string;                    // Session ID from claude-code-agent
    createdAt: number;             // Unix timestamp
    prompt: string;                // Original prompt (for display)
    context: {
      primaryFile?: string;        // File path if line-based
      references: string[];        // Referenced file paths
    };
  }>;
}
```

**Session Content Retrieval:**

```typescript
// Session content is fetched from claude-code-agent on demand
const session = await agent.getSession(sessionId);
```

### Search Functionality

#### Search Scope

Search supports three scopes, switchable via UI dropdown:

| Scope | Description |
|-------|-------------|
| Current file | Search within active file only |
| Changed files | Search across all files with changes |
| Entire repo | Search entire repository |

#### Search Type

- **Regex only**: All searches use regular expressions
- Literal strings work as-is (no special escaping needed for simple text)
- Full regex syntax available for advanced patterns

#### Search UI

```
┌─────────────────────────────────────────────────────────────────┐
│ /pattern                          [Scope: Changed Files] [Regex]│
├─────────────────────────────────────────────────────────────────┤
│ Results: 15 matches in 5 files                                  │
│                                                                 │
│ src/main.ts:42  - const pattern = /regex/;                      │
│ src/lib.ts:15   - export function pattern() {                   │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Branch Switching

Switch between branches for both the diff base and current (target) branch directly from the UI.

#### Branch Switching UI

**Header Branch Display:**

```
+---------------------------------------------------------------------+
| aynd                                                                 |
|                                                                      |
| Base: [main         v]  -->  Current: [feature/auth   v]  [Refresh] |
|                                                                      |
+---------------------------------------------------------------------+
```

**Branch Selector Component:**

```
+---------------------------------------------------------------------+
| Select Branch                                         [x] Close     |
+---------------------------------------------------------------------+
| [Search branches...]                                                |
+---------------------------------------------------------------------+
| RECENT                                                              |
|   feature/auth                               (current)              |
|   main                                       (default)              |
|   develop                                                           |
+---------------------------------------------------------------------+
| ALL BRANCHES (15)                                                   |
|   bugfix/login-error                                                |
|   feature/auth                               (current)              |
|   feature/dashboard                                                 |
|   feature/search                                                    |
|   hotfix/security-patch                                             |
|   main                                       (default)              |
|   release/v1.0                                                      |
|   ...                                                               |
+---------------------------------------------------------------------+
```

#### Branch Search/Filter

| Feature | Description |
|---------|-------------|
| Partial match | Filter branches by typing partial name |
| Case insensitive | Search is case-insensitive |
| Fuzzy matching | Optional fuzzy match for typos |
| Recent branches | Show recently used branches at top |

**Search Behavior:**

| Input | Result |
|-------|--------|
| `feat` | Shows `feature/auth`, `feature/dashboard`, etc. |
| `auth` | Shows `feature/auth`, `bugfix/auth-error`, etc. |
| `main` | Shows `main` branch |
| (empty) | Shows all branches with recent at top |

#### Three Branch Operations

| Operation | Description | UI Element |
|-----------|-------------|------------|
| Switch current branch | Checkout to different branch (changes working directory) | "Current" dropdown |
| Change diff base | Change the base branch for comparison | "Base" dropdown |
| Change diff target | Change the target branch for comparison | "Current" dropdown (when not on working tree) |

**Working Tree vs Branch Comparison:**

| Mode | Base | Target | Description |
|------|------|--------|-------------|
| Working tree | Branch (e.g., main) | Working tree (uncommitted) | Compare branch to current changes |
| Branch diff | Branch (e.g., main) | Branch (e.g., feature/auth) | Compare two branches |
| Commit range | Commit (e.g., HEAD~3) | Commit (e.g., HEAD) | Compare commit range |

#### Branch Checkout Behavior

When switching the current branch (actual checkout):

| Step | Action |
|------|--------|
| 1. Check status | Verify no uncommitted changes that would conflict |
| 2. Show warning | If uncommitted changes exist, prompt user |
| 3. Checkout | Execute `git checkout <branch>` |
| 4. Refresh | Refresh entire diff view with new branch |

**Uncommitted Changes Warning:**

```
+---------------------------------------------------------------------+
| Warning: Uncommitted Changes                                        |
+---------------------------------------------------------------------+
| You have uncommitted changes that may be lost or conflict.          |
|                                                                      |
| Modified files:                                                      |
|   src/main.ts                                                       |
|   src/lib.ts                                                        |
|                                                                      |
|              [Cancel]  [Stash & Switch]  [Force Switch]             |
+---------------------------------------------------------------------+
```

| Option | Behavior |
|--------|----------|
| Cancel | Abort branch switch |
| Stash & Switch | Run `git stash`, checkout, optionally `git stash pop` |
| Force Switch | Discard changes and checkout |

#### Touch Interactions (Branch Switching)

| Gesture | Action |
|---------|--------|
| Tap branch dropdown | Open branch selector |
| Tap branch in list | Select that branch |
| Swipe down on selector | Close selector |
| Long-press branch | Show branch info (last commit, author) |

#### API Endpoints (Branch)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/branches` | List all branches with metadata |
| GET | `/api/branches/current` | Get current branch name |
| POST | `/api/branches/checkout` | Checkout to specified branch |
| GET | `/api/branches/search?q=` | Search branches by partial name |
| GET | `/api/status` | Get working tree status (for checkout warning) |

### Theme and Appearance

#### Theme Mode

| Setting | Value |
|---------|-------|
| Initial theme | Light only |
| Future plan | Dark mode toggle (system preference) |

Light theme is the primary focus for initial release. Dark mode support will be added in future versions.

#### Syntax Highlighting Theme

| Setting | Value |
|---------|-------|
| Engine | Shiki |
| Theme | GitHub Light (matches GitHub's code appearance) |
| Future plan | User-selectable themes |

#### Color Scheme (Light Theme)

| Element | Color |
|---------|-------|
| Background | #ffffff |
| Added line bg | #e6ffec |
| Deleted line bg | #ffebe9 |
| Deleted marker (thin line) | #cf222e |
| Modified highlight | #fff8c5 |
| Comment bg | #f6f8fa |
| Border | #d0d7de |

### Error Handling

All errors are displayed as toast notifications in the browser UI.

#### Error Toast Display

```
+---------------------------------------------------------------------+
|                                                      [x] Close      |
|  [!] Error: Failed to checkout branch                               |
|      Uncommitted changes would be overwritten                       |
|                                                                      |
+---------------------------------------------------------------------+
```

#### Error Categories

| Category | Display | Duration | Action |
|----------|---------|----------|--------|
| Transient (network, timeout) | Toast | 5 seconds | Auto-dismiss |
| Validation (invalid input) | Toast | Until dismissed | Manual close |
| Critical (git failure) | Toast + Details | Until dismissed | Show error details |
| Offline (feature unavailable) | Toast | 3 seconds | Auto-dismiss |

#### Error Toast Types

| Type | Color | Icon | Use Case |
|------|-------|------|----------|
| Error | Red (#cf222e) | ! | Operation failed |
| Warning | Yellow (#9a6700) | ! | Partial success or degraded |
| Info | Blue (#0969da) | i | Informational message |
| Success | Green (#1a7f37) | check | Operation completed |

### Binary and Large File Handling

#### Binary File Display

| File Type | Display Behavior |
|-----------|------------------|
| Images (png, jpg, gif, svg, webp) | Display in browser with preview |
| Videos (mp4, webm, mov) | Display with video player |
| Other binary files | Show "Binary file not shown" message (like GitHub) |

**Binary File Indicator in File Tree:**

```
src/
├── main.ts          [M]
├── logo.png         [M] [IMG]    (image badge)
├── data.bin         [M] [BIN]    (binary badge)
```

#### Large File Handling

| Setting | Value |
|---------|-------|
| Threshold | 1MB |
| Default behavior | Show warning with partial content |
| Partial content | First 10KB of file |

**Large File Warning UI:**

```
+---------------------------------------------------------------------+
| src/generated/large-data.ts                          [Large File]   |
+---------------------------------------------------------------------+
| This file is 2.5MB which may affect performance.                    |
|                                                                      |
| Showing first 10KB:                                                  |
| ------------------------------------------------------------------- |
| 1: // Auto-generated file                                            |
| 2: export const data = {                                             |
| 3:   items: [                                                        |
| ...                                                                  |
| ------------------------------------------------------------------- |
|                                                                      |
|                    [Load Full File]  [Skip This File]                |
+---------------------------------------------------------------------+
```

### Operation Queue (Git Concurrency)

Git operations and git-xnotes sync operations are queued and executed serially to prevent conflicts.

#### Queue Architecture

```
+------------------+     +------------------+     +------------------+
|   User Actions   | --> | Operation Queue  | --> |  Git Executor    |
|   (concurrent)   |     | (serial FIFO)    |     |  (one at a time) |
+------------------+     +------------------+     +------------------+
```

#### Queued Operations

| Operation Type | Examples |
|----------------|----------|
| Git read | diff, status, branch list, file content |
| Git write | checkout, stash |
| git-xnotes | read comments, write comments, push, pull |

#### Queue Behavior

| Setting | Value |
|---------|-------|
| Max concurrent | 1 (serial execution) |
| Queue timeout | 30 seconds per operation |
| Conflict resolution | Later operation waits |

**Queue Status Indicator:**

```
+---------------------------------------------------------------------+
| [Git: Busy]  Checking out branch...                 [2 pending]     |
+---------------------------------------------------------------------+
```

### URL Routing / Deep Linking

File path and line numbers are reflected in the URL for direct linking and browser navigation.

#### URL Structure

| URL Pattern | Description |
|-------------|-------------|
| `/` | Main diff view (first file selected) |
| `/file/:path` | Specific file view |
| `/file/:path#L10` | File at specific line |
| `/file/:path#L10-L20` | File with line range selected |
| `/sessions` | Session queue screen |
| `/sessions/:id` | Session detail view |

**Examples:**

```
http://localhost:7144/
http://localhost:7144/file/src/main.ts
http://localhost:7144/file/src/main.ts#L42
http://localhost:7144/file/src/main.ts#L10-L25
http://localhost:7144/sessions
http://localhost:7144/sessions/abc123
```

#### Navigation Behavior

| Action | Behavior |
|--------|----------|
| Browser back | Navigate to previous URL state |
| Browser forward | Navigate to next URL state |
| File selection | Update URL without page reload |
| Line selection | Update URL hash fragment |

### Offline Mode

aynd works fully offline for local diff viewing. Network-dependent features degrade gracefully.

#### Feature Availability

| Feature | Offline | Online |
|---------|---------|--------|
| Local diff viewing | Yes | Yes |
| File tree navigation | Yes | Yes |
| Current State View | Yes | Yes |
| Branch switching (local) | Yes | Yes |
| Comment viewing (cached) | Yes | Yes |
| Comment sync (push/pull) | No (error shown) | Yes |
| AI features | No (error shown) | Yes |
| Remote branch fetch | No (error shown) | Yes |

#### Offline Status Display

No explicit offline indicator. Errors are shown when attempting network-dependent operations:

```
+---------------------------------------------------------------------+
| [!] Cannot sync comments: Network unavailable                       |
|     Comments saved locally. Sync when online.                       |
+---------------------------------------------------------------------+
```

## API Design

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/diff` | Get diff data for specified range |
| GET | `/api/files` | Get file tree (all or diff-only) |
| GET | `/api/file/:path` | Get file content with line numbers |
| GET | `/api/comments/:commit` | Get comments for commit |
| POST | `/api/comments/:commit` | Add comment to commit |
| GET | `/api/notes/status` | Get git-xnotes sync status |
| POST | `/api/notes/push` | Push notes to remote |
| POST | `/api/notes/pull` | Pull notes from remote |
| GET | `/api/branches` | List all branches with metadata |
| GET | `/api/branches/current` | Get current branch name |
| POST | `/api/branches/checkout` | Checkout to specified branch |
| GET | `/api/branches/search` | Search branches by partial name |
| GET | `/api/status` | Get working tree status |
| POST | `/api/ai/prompt` | Send prompt (immediate or queued) |
| GET | `/api/ai/queue` | Get queue status (running, queued, completed) |
| GET | `/api/ai/queue/status` | Get minimal status for Session Button |
| GET | `/api/ai/session/:id` | Get session details |
| GET | `/api/ai/session/:id/stream` | SSE stream of session events |
| POST | `/api/ai/session/:id/cancel` | Cancel running session |
| POST | `/api/ai/session/:id/run-now` | Move queued session to immediate |
| DELETE | `/api/ai/session/:id` | Remove from queue |
| POST | `/api/ai/queue/reorder` | Reorder queue |
| DELETE | `/api/ai/queue/completed` | Clear completed sessions |
| GET | `/api/files/autocomplete` | File search for @ mentions |

### WebSocket Events (Real-time Updates)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `file-change` | Server->Client | Notify file system changes, trigger diff refresh |
| `comment-added` | Server->Client | New comment notification |
| `diff-updated` | Server->Client | Send updated diff data after file change |

### File Watching

Monitor local files (excluding gitignored) and refresh diff on changes.

#### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   File System   │ --> │   File Watcher  │ --> │   WebSocket     │
│   (non-ignored) │     │   (Server)      │     │   (Client)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               v
                        ┌─────────────────┐
                        │ git check-ignore│
                        │ (filter)        │
                        └─────────────────┘
```

#### Implementation

| Component | Technology | Purpose |
|-----------|------------|---------|
| Watcher | Bun native `fs.watch` | Detect file changes |
| Filter | `git check-ignore --stdin` | Exclude gitignored files |
| Debounce | 100ms | Avoid rapid consecutive updates |
| Notification | WebSocket | Push updates to client |

#### Behavior

| Scenario | Action |
|----------|--------|
| File modified | Refresh diff for that file |
| File created | Add to diff if not gitignored |
| File deleted | Update diff to reflect deletion |
| Multiple rapid changes | Debounce, single refresh after 100ms |

#### CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--watch` | true | Enable file watching |
| `--no-watch` | - | Disable file watching |

#### Client UI

```
┌─────────────────────────────────────────────────────────────────┐
│ [Auto-refresh: ON]  Last updated: 10:30:15   [Manual Refresh]   │
└─────────────────────────────────────────────────────────────────┘
```

- Visual indicator when files change
- Option to pause auto-refresh
- Manual refresh button

## Data Models

### DiffFile

```typescript
interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;  // For renames
  additions: number;
  deletions: number;
  chunks: DiffChunk[];
}
```

### DiffChunk

```typescript
interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}
```

### DiffChange

```typescript
interface DiffChange {
  type: 'add' | 'del' | 'normal';
  oldLine?: number;
  newLine?: number;
  content: string;
}
```

### CurrentStateView Data

```typescript
interface CurrentStateLine {
  lineNumber: number;
  content: string;
  changeType: 'added' | 'modified' | 'unchanged';
  deletedBefore?: DeletedBlock;  // Collapsed deleted content
}

interface DeletedBlock {
  lines: string[];
  originalStart: number;
  originalEnd: number;
}
```

### File Watcher Events

```typescript
interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete';
  path: string;
  timestamp: number;
}

interface WatcherStatus {
  enabled: boolean;
  watchedPaths: number;
  lastUpdate: number | null;
}
```

### Branch Types

```typescript
interface Branch {
  name: string;                    // Branch name (e.g., "feature/auth")
  isCurrent: boolean;              // Is this the currently checked out branch
  isDefault: boolean;              // Is this the default branch (main/master)
  isRemote: boolean;               // Is this a remote tracking branch
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: number;                  // Unix timestamp
  };
  aheadBehind?: {
    ahead: number;                 // Commits ahead of upstream
    behind: number;                // Commits behind upstream
  };
}

interface BranchListResponse {
  branches: Branch[];
  current: string;                 // Current branch name
  default: string;                 // Default branch name (main/master)
}

interface BranchSearchRequest {
  query: string;                   // Partial match search query
  limit?: number;                  // Max results (default 20)
  includeRemote?: boolean;         // Include remote branches (default false)
}

interface BranchCheckoutRequest {
  branch: string;                  // Branch name to checkout
  force?: boolean;                 // Force checkout (discard changes)
  stash?: boolean;                 // Stash changes before checkout
}

interface BranchCheckoutResponse {
  success: boolean;
  previousBranch: string;
  currentBranch: string;
  stashCreated?: string;           // Stash reference if stashed
  error?: string;
}

interface WorkingTreeStatus {
  clean: boolean;                  // No uncommitted changes
  staged: string[];                // Staged file paths
  modified: string[];              // Modified but unstaged file paths
  untracked: string[];             // Untracked file paths
  conflicts: string[];             // Files with merge conflicts
}

// Diff target type (extended to support branch switching)
interface DiffTarget {
  type: 'working' | 'branch' | 'commit';
  base: string;                    // Base reference (branch/commit)
  target: string;                  // Target reference (branch/commit or 'working')
}
```

### AI Session Types

```typescript
interface AISession {
  id: string;
  sequenceNumber: number;              // #1, #2, #3 for display
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  context: AIPromptContext;
  queuePosition?: number;              // Position in queue (if queued)
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;                   // In seconds
  cost?: number;
  tokens?: { input: number; output: number };
  response?: string;                   // Claude's response (for completed)
  error?: string;
  progress: AIProgressEvent[];         // Live progress events
}

interface AIPromptContext {
  primaryFile?: {
    path: string;
    startLine: number;
    endLine: number;
  };
  references: FileReference[];
}

interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
  content?: string;                    // Resolved content
}

interface AIProgressEvent {
  type: 'tool_start' | 'tool_end' | 'message' | 'error';
  toolName?: string;
  message?: string;
  timestamp: number;
}

// Queue status for Session Button display
interface QueueStatus {
  running: number;
  queued: number;
  totalCompleted: number;
}

// Conversation display types
interface ConversationTurn {
  id: string;
  index: number;                       // Turn number (0, 1, 2...)
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

interface ToolCall {
  id: string;
  name: string;                        // Read, Write, Bash, etc.
  input: Record<string, unknown>;      // Tool parameters
  output?: string;                     // Tool result (truncated for display)
  duration?: number;                   // Execution time in ms
  status: 'pending' | 'running' | 'completed' | 'error';
}

type ConversationViewMode = 'chat' | 'carousel';
```

## Performance Considerations

### Performance Thresholds

| Setting | Threshold | Behavior |
|---------|-----------|----------|
| Virtual list | 100+ files | Enable virtualization for file tree |
| Max file size to highlight | 1MB | Skip syntax highlighting for larger files |
| Diff chunk lazy load | 500+ lines | Lazy load diff chunks for large files |

### Virtualization Strategy

| Component | Strategy |
|-----------|----------|
| File Tree | Virtual list for 100+ files |
| Diff Lines | Virtual scroll for 500+ line diffs |
| Search Results | Paginated with virtual scroll |

### Lazy Loading

| Resource | Strategy |
|----------|----------|
| File Content | Load on selection |
| Syntax Highlighting | Async, show plain text first; skip if >1MB |
| Comments | Load per-file on demand |

### Memory Management

- Unload off-screen file content
- Cache highlighted code with LRU eviction
- Debounce search input (300ms)

## Keyboard Shortcuts (Future Feature)

**Status**: Not implemented in initial release. Touch-only UI is the primary interface.

Vim-like keyboard shortcuts may be added in a future version when hardware keyboard support is prioritized. The initial release focuses exclusively on touch-first interaction for tablet devices.

**Future Scope:**
- Navigation shortcuts (j/k, gg, G)
- View mode shortcuts (v, s, za, zR, zM)
- Comment shortcuts (c, gc)
- Search shortcuts (/, n/N)
- Branch switching shortcuts (b, B)

## CLI Interface

### Basic Usage

```bash
aynd [target] [base]           # Compare target with base
aynd                           # HEAD vs HEAD^
aynd feature-branch            # feature-branch vs main
aynd HEAD~3 HEAD               # Last 3 commits
aynd .                         # All uncommitted changes
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 7144 | Server port |
| `--host` | 127.0.0.1 | Bind address |
| `--no-open` | false | Don't open browser |
| `--mode` | github | Initial view mode (github/current) |
| `--all-files` | false | Show all files initially |
| `--sync` | manual | git-xnotes sync mode (manual/auto) |

### Port Conflict Handling

| Behavior | Description |
|----------|-------------|
| Default port | 7144 |
| Auto-increment range | 7144 - 7244 |
| On conflict | Try next port in range |
| If all ports busy | Exit with error |

When the default port is in use, aynd automatically tries the next available port within the range (7144-7244). If no port is available, it exits with an error message.

### Working Directory

aynd uses the current working directory as the repository root. Multi-repository support may be added in a future version.

| Setting | Value |
|---------|-------|
| Repository root | Current working directory |
| Multi-repo | Not supported (future feature) |

### Untracked Files Handling

When viewing uncommitted changes (`.` or `working`):

| Behavior | Description |
|----------|-------------|
| **Always include** | Untracked files are automatically included in the diff |

Unlike difit which prompts for untracked file inclusion, aynd always includes untracked files when viewing uncommitted changes. This provides a complete view of all pending changes without user interaction.

## Future Considerations (Out of Scope)

### LSP Integration (R7)

Future integration with Language Server Protocol for:
- Jump to definition from diff view
- Find all callers of changed functions
- Show type information on hover

This requires:
- Running LSP servers for relevant languages
- Mapping diff positions to LSP document positions
- Caching symbol information

## File Structure

```
src/
├── cli/
│   └── index.ts              # CLI entry point
├── server/
│   ├── index.ts              # Server setup
│   ├── routes/
│   │   ├── diff.ts           # Diff API
│   │   ├── files.ts          # File tree API
│   │   ├── comments.ts       # git-xnotes bridge
│   │   └── branches.ts       # Branch API routes
│   ├── watcher/
│   │   ├── index.ts          # File watcher setup
│   │   ├── gitignore.ts      # Gitignore filter using git check-ignore
│   │   └── debounce.ts       # Debounce utility
│   ├── websocket/
│   │   └── index.ts          # WebSocket server for real-time updates
│   ├── ai/
│   │   ├── index.ts          # AI integration routes
│   │   ├── prompt-builder.ts # Context construction for prompts
│   │   └── session-manager.ts # claude-code-agent wrapper
│   └── git/
│       ├── diff.ts           # Git diff operations
│       ├── parser.ts         # Diff parsing
│       └── branch.ts         # Branch operations (list, checkout, search)
├── client/
│   ├── App.svelte            # Root component
│   ├── components/
│   │   ├── FileTree.svelte
│   │   ├── DiffView.svelte
│   │   ├── CurrentStateView.svelte
│   │   ├── CommentForm.svelte
│   │   ├── AIPromptInline.svelte    # Line-based AI prompt input
│   │   ├── AIPromptPanel.svelte     # Global AI prompt input (collapsible)
│   │   ├── SessionButton.svelte     # Minimal session indicator
│   │   ├── FileAutocomplete.svelte  # @ mention autocomplete
│   │   ├── BranchSelector.svelte    # Branch dropdown/search component
│   │   ├── BranchHeader.svelte      # Header with base/current branch display
│   │   └── CheckoutWarning.svelte   # Uncommitted changes warning modal
│   ├── routes/
│   │   ├── +page.svelte             # Main diff viewer
│   │   └── sessions/
│   │       ├── +page.svelte         # Session Queue screen
│   │       └── [id]/
│   │           └── +page.svelte     # Session detail (full screen)
│   ├── components/session/
│   │   ├── SessionQueue.svelte      # Queue list component
│   │   ├── SessionCard.svelte       # Individual session in queue
│   │   ├── ConversationChatView.svelte    # Vertical chat layout
│   │   ├── ConversationCarousel.svelte    # Horizontal card carousel
│   │   ├── MessageCard.svelte       # Single user/assistant card
│   │   └── ToolCallDisplay.svelte   # Tool execution display
│   ├── stores/
│   │   ├── diff.ts           # Diff state
│   │   ├── files.ts          # File tree state
│   │   ├── comments.ts       # Comments state
│   │   ├── ai.ts             # AI session state and history
│   │   └── branches.ts       # Branch state (list, current, search)
│   └── lib/
│       ├── highlighter.ts    # Shiki wrapper
│       └── virtualList.ts    # Virtual list helpers
└── types/
    └── index.ts              # Shared types
```

## References

See `design-docs/references/README.md` for:
- difit source analysis
- git-xnotes API documentation
- Svelte 5 virtualization libraries
- Shiki syntax highlighting
