# Claude Session Browser Design Specification

## Overview

This document describes the design for browsing, filtering, and resuming all Claude Code sessions from aynd, not just sessions created through aynd.

## Problem Statement

Currently, aynd's session management only tracks sessions created within aynd itself (in-memory SessionManager). Users cannot:
1. View sessions created directly via Claude CLI
2. Resume existing Claude sessions from aynd
3. Filter sessions by working directory
4. Distinguish between aynd-spawned and external sessions

## Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | List all Claude sessions across all projects | Must |
| R2 | Filter sessions by working directory prefix | Must |
| R3 | Display session metadata (summary, date, branch, message count) | Must |
| R4 | Distinguish aynd-spawned vs external sessions | Must |
| R5 | Resume/continue existing sessions | Must |
| R6 | Search sessions by prompt content or summary | Should |
| R7 | Pagination for large session lists | Should |

## Architecture

### Claude Session Storage Structure

Claude Code stores sessions in `~/.claude/projects/`:

```
~/.claude/
  projects/
    -g-gits-tacogips-aynd/                   # Path encoded (/ -> -)
      sessions-index.json                     # Session index
      {sessionId}.jsonl                       # Session content (JSONL)
    -g-gits-tacogips-other-project/
      sessions-index.json
      {sessionId}.jsonl
```

### Session Index Format

Each project has a `sessions-index.json`:

```typescript
interface ClaudeSessionIndex {
  version: number;
  entries: ClaudeSessionEntry[];
  originalPath: string;  // Original working directory path
}

interface ClaudeSessionEntry {
  sessionId: string;                // UUID
  fullPath: string;                 // Full path to .jsonl file
  fileMtime: number;                // File modification time (Unix ms)
  firstPrompt: string;              // First user message
  summary: string;                  // AI-generated summary
  messageCount: number;             // Number of messages in session
  created: string;                  // ISO timestamp
  modified: string;                 // ISO timestamp
  gitBranch: string;                // Branch at session time
  projectPath: string;              // Working directory
  isSidechain: boolean;             // Whether this is a sidechain session
}
```

### Project Path Encoding

Claude encodes project paths by replacing `/` with `-`:

| Original Path | Encoded Directory |
|---------------|-------------------|
| `/g/gits/tacogips/aynd` | `-g-gits-tacogips-aynd` |
| `/home/user/project` | `-home-user-project` |
| `/d/work/repo` | `-d-work-repo` |

## Data Model

### Extended Session Types

```typescript
// Source of the session
type SessionSource = 'aynd' | 'claude-cli' | 'unknown';

// Extended session entry with source tracking
interface ExtendedSessionEntry extends ClaudeSessionEntry {
  source: SessionSource;           // How session was created
  projectEncoded: string;          // Encoded project directory name
}

// Session list response
interface SessionListResponse {
  sessions: ExtendedSessionEntry[];
  total: number;
  offset: number;
  limit: number;
  filters: SessionFilters;
}

// Filter options
interface SessionFilters {
  workingDirectoryPrefix?: string;  // Filter by path prefix (e.g., "/g/gits/tacogips")
  source?: SessionSource;           // Filter by source (aynd, claude-cli, all)
  branch?: string;                  // Filter by git branch
  searchQuery?: string;             // Search in prompt/summary
  dateRange?: {
    from?: string;                  // ISO date
    to?: string;                    // ISO date
  };
}

// Pagination options
interface PaginationOptions {
  offset: number;                   // Starting index
  limit: number;                    // Max items (default: 50)
  sortBy: 'modified' | 'created';   // Sort field
  sortOrder: 'asc' | 'desc';        // Sort direction
}
```

## Session Source Detection

To distinguish aynd-spawned sessions from external ones:

### Detection Strategy 1: Prompt Pattern Matching

Aynd-created sessions have distinctive prompt patterns:

```typescript
function detectSessionSource(entry: ClaudeSessionEntry): SessionSource {
  // Check for aynd-specific markers in firstPrompt
  const prompt = entry.firstPrompt;

  // Aynd sessions include context markers
  if (prompt.includes('[aynd-context]') ||
      prompt.includes('Context from aynd:')) {
    return 'aynd';
  }

  // Future: Read session file header for metadata
  return 'claude-cli';
}
```

### Detection Strategy 2: Session Metadata Storage

Store aynd session IDs in local storage:

```typescript
// ~/.local/aynd/sessions.json
interface AyndSessionRegistry {
  sessions: Array<{
    sessionId: string;
    createdAt: string;
    projectPath: string;
  }>;
}
```

When aynd creates a session via claude-code-agent, register it here. Cross-reference during listing.

### Recommended Approach

Use **both strategies**:
1. Primary: Check aynd's local registry for known session IDs
2. Fallback: Pattern matching for migration from older versions

## API Design

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/claude/sessions` | List all Claude sessions |
| GET | `/api/claude/sessions/:id` | Get session details |
| GET | `/api/claude/projects` | List all Claude projects |
| POST | `/api/claude/sessions/:id/resume` | Resume existing session |

### List Sessions Endpoint

```typescript
// GET /api/claude/sessions
interface ListSessionsRequest {
  // Query parameters
  workingDirectoryPrefix?: string;  // e.g., "/g/gits/tacogips"
  source?: SessionSource;
  branch?: string;
  search?: string;
  offset?: number;
  limit?: number;
  sortBy?: 'modified' | 'created';
  sortOrder?: 'asc' | 'desc';
}

// Response
interface ListSessionsResponse {
  sessions: ExtendedSessionEntry[];
  total: number;
  offset: number;
  limit: number;
}
```

### List Projects Endpoint

```typescript
// GET /api/claude/projects
interface ListProjectsResponse {
  projects: Array<{
    path: string;              // Original path (e.g., "/g/gits/tacogips/aynd")
    encoded: string;           // Encoded name (e.g., "-g-gits-tacogips-aynd")
    sessionCount: number;      // Number of sessions
    lastModified: string;      // Most recent session modified time
  }>;
}
```

### Resume Session Endpoint

```typescript
// POST /api/claude/sessions/:id/resume
interface ResumeSessionRequest {
  prompt?: string;             // Optional follow-up prompt
}

interface ResumeSessionResponse {
  sessionId: string;           // May be same or new session ID
  status: 'resumed' | 'created';
}
```

## Server Implementation

### Session Reader Module

```typescript
// src/server/claude/session-reader.ts

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export class ClaudeSessionReader {

  // List all projects
  async listProjects(): Promise<ProjectInfo[]> {
    const entries = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const indexPath = join(CLAUDE_PROJECTS_DIR, entry.name, 'sessions-index.json');
        try {
          const index = await this.readSessionIndex(indexPath);
          projects.push({
            path: index.originalPath,
            encoded: entry.name,
            sessionCount: index.entries.length,
            lastModified: this.getLatestModified(index.entries),
          });
        } catch {
          // Skip projects without valid index
        }
      }
    }

    return projects;
  }

  // List sessions with filtering
  async listSessions(options: ListSessionsOptions): Promise<SessionListResponse> {
    const allSessions: ExtendedSessionEntry[] = [];
    const projects = await this.listProjects();

    // Filter projects by working directory prefix if specified
    const filteredProjects = options.workingDirectoryPrefix
      ? projects.filter(p => p.path.startsWith(options.workingDirectoryPrefix!))
      : projects;

    // Read sessions from filtered projects
    for (const project of filteredProjects) {
      const indexPath = join(CLAUDE_PROJECTS_DIR, project.encoded, 'sessions-index.json');
      const index = await this.readSessionIndex(indexPath);

      for (const entry of index.entries) {
        const extended: ExtendedSessionEntry = {
          ...entry,
          source: await this.detectSource(entry),
          projectEncoded: project.encoded,
        };

        // Apply additional filters
        if (this.matchesFilters(extended, options)) {
          allSessions.push(extended);
        }
      }
    }

    // Sort
    allSessions.sort((a, b) => {
      const field = options.sortBy || 'modified';
      const order = options.sortOrder === 'asc' ? 1 : -1;
      return order * (new Date(a[field]).getTime() - new Date(b[field]).getTime());
    });

    // Paginate
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const paginated = allSessions.slice(offset, offset + limit);

    return {
      sessions: paginated,
      total: allSessions.length,
      offset,
      limit,
    };
  }

  private async readSessionIndex(path: string): Promise<ClaudeSessionIndex> {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  }

  private async detectSource(entry: ClaudeSessionEntry): Promise<SessionSource> {
    // Check aynd registry first
    const registry = await this.loadAyndRegistry();
    if (registry.sessions.some(s => s.sessionId === entry.sessionId)) {
      return 'aynd';
    }

    // Fallback to prompt pattern matching
    if (entry.firstPrompt.includes('[aynd-context]')) {
      return 'aynd';
    }

    return 'claude-cli';
  }

  private matchesFilters(session: ExtendedSessionEntry, options: ListSessionsOptions): boolean {
    // Source filter
    if (options.source && session.source !== options.source) {
      return false;
    }

    // Branch filter
    if (options.branch && session.gitBranch !== options.branch) {
      return false;
    }

    // Search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      const matchesPrompt = session.firstPrompt.toLowerCase().includes(searchLower);
      const matchesSummary = session.summary.toLowerCase().includes(searchLower);
      if (!matchesPrompt && !matchesSummary) {
        return false;
      }
    }

    // Date range filter
    if (options.dateRange) {
      const modified = new Date(session.modified);
      if (options.dateRange.from && modified < new Date(options.dateRange.from)) {
        return false;
      }
      if (options.dateRange.to && modified > new Date(options.dateRange.to)) {
        return false;
      }
    }

    return true;
  }
}
```

### API Routes

```typescript
// src/server/routes/claude-sessions.ts

import { Hono } from 'hono';
import { ClaudeSessionReader } from '../claude/session-reader';

const app = new Hono();
const reader = new ClaudeSessionReader();

// List projects
app.get('/projects', async (c) => {
  const projects = await reader.listProjects();
  return c.json({ projects });
});

// List sessions
app.get('/sessions', async (c) => {
  const options: ListSessionsOptions = {
    workingDirectoryPrefix: c.req.query('workingDirectoryPrefix'),
    source: c.req.query('source') as SessionSource | undefined,
    branch: c.req.query('branch'),
    search: c.req.query('search'),
    offset: parseInt(c.req.query('offset') || '0'),
    limit: parseInt(c.req.query('limit') || '50'),
    sortBy: c.req.query('sortBy') as 'modified' | 'created' || 'modified',
    sortOrder: c.req.query('sortOrder') as 'asc' | 'desc' || 'desc',
  };

  const result = await reader.listSessions(options);
  return c.json(result);
});

// Get session details
app.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const session = await reader.getSession(sessionId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.json(session);
});

// Resume session
app.post('/sessions/:id/resume', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json();

  // Use claude-code-agent to resume
  // This will continue the conversation in the existing session
  const result = await resumeSession(sessionId, body.prompt);
  return c.json(result);
});

export default app;
```

## UI Design

### Claude Sessions Screen

New route: `/claude-sessions`

**Layout:**

```
+---------------------------------------------------------------------+
| Claude Sessions                           [Filter] [Search] [Back]   |
+---------------------------------------------------------------------+
| Working Directory: [/g/gits/tacogips         v]  [All Projects]      |
| Source: [All v]  [aynd] [External]                                   |
+---------------------------------------------------------------------+
| Showing 45 sessions (filtered from 234 total)                        |
+---------------------------------------------------------------------+
|                                                                      |
| TODAY                                                                |
| +----------------------------------------------------------------+  |
| | [AYND] Phase 7 Implementation: Fix Tests           2 hours ago |  |
| |        /g/gits/tacogips/aynd  |  main  |  20 msgs             |  |
| |                                         [Resume] [View]        |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [CLI]  Update README documentation                 3 hours ago |  |
| |        /g/gits/tacogips/aynd  |  main  |  5 msgs              |  |
| |                                         [Resume] [View]        |  |
| +----------------------------------------------------------------+  |
|                                                                      |
| YESTERDAY                                                            |
| +----------------------------------------------------------------+  |
| | [CLI]  Fix authentication bug                     1 day ago    |  |
| |        /g/gits/tacogips/other  |  feature/auth  |  12 msgs    |  |
| |                                         [Resume] [View]        |  |
| +----------------------------------------------------------------+  |
|                                                                      |
| OLDER                                                                |
| +----------------------------------------------------------------+  |
| | [AYND] Initial project setup                      3 days ago   |  |
| |        /g/gits/tacogips/aynd  |  main  |  8 msgs              |  |
| |                                         [Resume] [View]        |  |
| +----------------------------------------------------------------+  |
|                                                                      |
| [Load More]                                                          |
+---------------------------------------------------------------------+
```

### Session Card Component

```
+---------------------------------------------------------------------+
| [AYND]  Phase 7 Implementation: Fix Tests              2 hours ago  |
|----------------------------------------------------------------------
| First prompt: "impl progressを確認し次の実装をつづけよ"               |
|                                                                      |
| Project: /g/gits/tacogips/aynd                                       |
| Branch:  main                                                        |
| Messages: 20                                                         |
|                                                       [Resume] [View]|
+---------------------------------------------------------------------+
```

### Filter Panel

```
+---------------------------------------------------------------------+
| FILTERS                                                    [Clear]   |
+---------------------------------------------------------------------+
| Working Directory                                                    |
| +----------------------------------------------------------------+  |
| | [Search directory prefix...]                                   |  |
| +----------------------------------------------------------------+  |
| | [ ] /g/gits/tacogips           (45 sessions)                   |  |
| | [ ] /d/work/fraim              (89 sessions)                   |  |
| | [ ] /home/taco                 (12 sessions)                   |  |
| +----------------------------------------------------------------+  |
|                                                                      |
| Source                                                               |
| (*) All   ( ) aynd only   ( ) External only                         |
|                                                                      |
| Branch                                                               |
| [Search branch...]                                                   |
|                                                                      |
| Date Range                                                           |
| From: [         ]  To: [         ]                                  |
+---------------------------------------------------------------------+
```

### Search Interface

```
+---------------------------------------------------------------------+
| [Search sessions by prompt or summary...]                    [x]     |
+---------------------------------------------------------------------+
| Results for "authentication":                                        |
|                                                                      |
| +----------------------------------------------------------------+  |
| | [CLI]  Fix authentication bug                     1 day ago    |  |
| |        ...implement **authentication** using JWT...            |  |
| +----------------------------------------------------------------+  |
| +----------------------------------------------------------------+  |
| | [AYND] Add **authentication** middleware          3 days ago   |  |
| |        ...setup **authentication** for API routes...           |  |
| +----------------------------------------------------------------+  |
+---------------------------------------------------------------------+
```

## Client Implementation

### Store

```typescript
// client/src/stores/claude-sessions.ts

import { writable, derived } from 'svelte/store';

interface ClaudeSessionsState {
  sessions: ExtendedSessionEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  filters: SessionFilters;
  pagination: {
    offset: number;
    limit: number;
  };
  projects: ProjectInfo[];
}

const initialState: ClaudeSessionsState = {
  sessions: [],
  total: 0,
  loading: false,
  error: null,
  filters: {},
  pagination: {
    offset: 0,
    limit: 50,
  },
  projects: [],
};

function createClaudeSessionsStore() {
  const { subscribe, set, update } = writable<ClaudeSessionsState>(initialState);

  return {
    subscribe,

    async loadProjects() {
      update(s => ({ ...s, loading: true }));
      try {
        const res = await fetch('/api/claude/projects');
        const data = await res.json();
        update(s => ({ ...s, projects: data.projects, loading: false }));
      } catch (error) {
        update(s => ({ ...s, error: error.message, loading: false }));
      }
    },

    async loadSessions() {
      update(s => ({ ...s, loading: true }));
      try {
        const state = get({ subscribe });
        const params = new URLSearchParams();

        if (state.filters.workingDirectoryPrefix) {
          params.set('workingDirectoryPrefix', state.filters.workingDirectoryPrefix);
        }
        if (state.filters.source) {
          params.set('source', state.filters.source);
        }
        if (state.filters.searchQuery) {
          params.set('search', state.filters.searchQuery);
        }
        params.set('offset', String(state.pagination.offset));
        params.set('limit', String(state.pagination.limit));

        const res = await fetch(`/api/claude/sessions?${params}`);
        const data = await res.json();

        update(s => ({
          ...s,
          sessions: data.sessions,
          total: data.total,
          loading: false,
        }));
      } catch (error) {
        update(s => ({ ...s, error: error.message, loading: false }));
      }
    },

    setFilter(key: keyof SessionFilters, value: string | undefined) {
      update(s => ({
        ...s,
        filters: { ...s.filters, [key]: value },
        pagination: { ...s.pagination, offset: 0 }, // Reset to first page
      }));
      this.loadSessions();
    },

    clearFilters() {
      update(s => ({
        ...s,
        filters: {},
        pagination: { ...s.pagination, offset: 0 },
      }));
      this.loadSessions();
    },

    loadMore() {
      update(s => ({
        ...s,
        pagination: {
          ...s.pagination,
          offset: s.pagination.offset + s.pagination.limit,
        },
      }));
      this.loadSessions();
    },

    async resumeSession(sessionId: string, prompt?: string) {
      const res = await fetch(`/api/claude/sessions/${sessionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      return res.json();
    },
  };
}

export const claudeSessionsStore = createClaudeSessionsStore();

// Derived store for grouped sessions
export const groupedSessions = derived(
  claudeSessionsStore,
  ($store) => {
    const groups: { [key: string]: ExtendedSessionEntry[] } = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const session of $store.sessions) {
      const modified = new Date(session.modified);
      if (modified >= today) {
        groups.today.push(session);
      } else if (modified >= yesterday) {
        groups.yesterday.push(session);
      } else if (modified >= weekAgo) {
        groups.thisWeek.push(session);
      } else {
        groups.older.push(session);
      }
    }

    return groups;
  }
);
```

### Components

```
client/components/claude-sessions/
  ClaudeSessionsScreen.svelte    # Main screen
  SessionCard.svelte             # Individual session card
  FilterPanel.svelte             # Filter sidebar/dropdown
  ProjectSelector.svelte         # Working directory filter
  SearchInput.svelte             # Search box
  SessionDetailModal.svelte      # Full session view modal
```

## Navigation Integration

### Entry Points

1. **New Navigation Item**: Add "Claude Sessions" to main navigation
2. **Session Queue Integration**: Link from existing Session Queue screen

### URL Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/claude-sessions` | ClaudeSessionsScreen | Main session browser |
| `/claude-sessions/:id` | SessionDetailModal | Session detail view |

### Header Update

Add link in main header:

```
+---------------------------------------------------------------------+
| [=] Branch  |  main...feature  |  [Sessions: 2] [Claude] [Settings] |
+---------------------------------------------------------------------+
                                            ↑
                                    New "Claude" button
```

## Session Resume Integration

When resuming a session:

1. User clicks [Resume] on a session card
2. System checks if session belongs to current project
3. If same project: Continue session directly
4. If different project: Show warning, offer to switch context
5. Create follow-up in the claude-code-agent

```typescript
async function handleResumeSession(sessionId: string) {
  const session = await getSession(sessionId);

  // Check if session belongs to current aynd project
  const currentProject = getCurrentProjectPath();
  if (session.projectPath !== currentProject) {
    const confirmed = await showConfirmation(
      `This session belongs to ${session.projectPath}. ` +
      `Resume in that context?`
    );
    if (!confirmed) return;
  }

  // Navigate to session queue and start resume
  await resumeSession(sessionId);
  goto('/sessions');
}
```

## Aynd Session Marking

When aynd creates a new session, mark it for later identification:

### Option A: Context Prefix

Include marker in the prompt sent to Claude:

```typescript
function buildAyndPrompt(userPrompt: string, context: AIPromptContext): string {
  return `[aynd-context]
Project: ${context.projectPath}
${context.primaryFile ? `File: ${context.primaryFile.path}:${context.primaryFile.startLine}-${context.primaryFile.endLine}` : ''}

${userPrompt}`;
}
```

### Option B: Local Registry

Store aynd session IDs:

```typescript
// ~/.local/aynd/session-registry.json
interface SessionRegistry {
  sessions: Array<{
    sessionId: string;
    createdAt: string;
    projectPath: string;
  }>;
}

async function registerAyndSession(sessionId: string, projectPath: string) {
  const registry = await loadRegistry();
  registry.sessions.push({
    sessionId,
    createdAt: new Date().toISOString(),
    projectPath,
  });
  await saveRegistry(registry);
}
```

### Recommended: Use Both

1. Add `[aynd-context]` prefix to all aynd prompts (visible in firstPrompt)
2. Store session IDs in local registry for reliable lookup
3. Detection uses registry first, falls back to prompt pattern

## Performance Considerations

### Caching

- Cache session index files (invalidate on file modification time change)
- Cache project list (5 minute TTL)
- Use incremental loading (pagination)

### Large Project Handling

For projects with many sessions (100+):

1. Only load sessions-index.json (not .jsonl files)
2. Load full session content only when viewing details
3. Implement virtual scrolling in UI

### File System Access

- Read session indices in parallel
- Use streaming JSON parser for large indices
- Implement file watching for real-time updates

## Error Handling

| Error | Handling |
|-------|----------|
| ~/.claude not found | Show message: "Claude Code sessions not found" |
| Corrupted index | Skip project, log warning |
| Session file missing | Show entry with "File missing" status |
| Permission denied | Skip with warning |

## Security Considerations

- Only read files from ~/.claude directory
- Validate session IDs before file access
- Sanitize file paths to prevent directory traversal
- Session content may contain sensitive data - keep local only

## Future Enhancements

1. **Session Tagging**: Allow users to tag/categorize sessions
2. **Session Export**: Export session as markdown or JSON
3. **Session Archive**: Archive old sessions to reduce clutter
4. **Cross-Device Sync**: Sync session metadata (not content) across devices
5. **Session Templates**: Create new sessions from templates

## File Structure

```
src/
  server/
    claude/
      session-reader.ts           # Read Claude session files
      session-registry.ts         # Aynd session registry management
    routes/
      claude-sessions.ts          # API routes for session browser

client/
  components/
    claude-sessions/
      ClaudeSessionsScreen.svelte
      SessionCard.svelte
      FilterPanel.svelte
      ProjectSelector.svelte
      SearchInput.svelte
      SessionDetailModal.svelte
  stores/
    claude-sessions.ts            # Session browser state
  routes/
    claude-sessions/
      +page.svelte               # /claude-sessions route

types/
  claude-session.ts              # Claude session types
```

## References

- Claude Code session storage: `~/.claude/projects/`
- Session index format: `sessions-index.json`
- Existing aynd session design: `design-docs/specs/design-local-diff-viewer.md#session-queue-screen`
