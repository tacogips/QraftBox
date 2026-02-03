# AI Agent Integration Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#ai-agent-integration-claude-code-agent
**Phase**: 4
**Created**: 2026-02-03
**Last Updated**: 2026-02-03

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Integration with claude-code-agent TypeScript library for executing AI prompts from the diff viewer. Includes line-based prompts, global prompt area, and file reference autocomplete.

### Scope
**Included**: AI routes, prompt builder, session manager, client-side prompt UI, file autocomplete
**Excluded**: Session queue screen (separate plan), conversation display (session queue plan)

---

## Modules

### 1. AI Types

#### src/types/ai.ts

**Status**: NOT_STARTED

```typescript
// AI prompt types
interface AIPromptRequest {
  prompt: string;
  context: AIPromptContext;
  options: {
    projectPath: string;
    sessionMode: 'continue' | 'new';
    immediate: boolean;
  };
}

interface AIPromptContext {
  primaryFile?: {
    path: string;
    startLine: number;
    endLine: number;
    content: string;
  };
  references: FileReference[];
  diffSummary?: {
    baseBranch: string;
    targetBranch: string;
    changedFiles: string[];
  };
}

interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
  content?: string;
}

// Session types (subset for prompt submission)
interface AISessionSubmitResult {
  sessionId: string;
  queuePosition?: number;
}
```

**Checklist**:
- [ ] Define AIPromptRequest interface
- [ ] Define AIPromptContext interface
- [ ] Define FileReference interface
- [ ] Export all types

### 2. Prompt Builder

#### src/server/ai/prompt-builder.ts

**Status**: NOT_STARTED

```typescript
// Build prompt with context for claude-code-agent
function buildPromptWithContext(request: AIPromptRequest): string;

// Resolve file references (fetch content if needed)
async function resolveFileReferences(
  refs: FileReference[],
  cwd: string
): Promise<FileReference[]>;

// Format context for prompt
function formatContext(context: AIPromptContext): string;

// Parse @ mentions from prompt text
function parseFileMentions(prompt: string): string[];
```

**Checklist**:
- [ ] Implement buildPromptWithContext()
- [ ] Implement resolveFileReferences()
- [ ] Implement formatContext()
- [ ] Implement parseFileMentions()
- [ ] Unit tests

### 3. Session Manager

#### src/server/ai/session-manager.ts

**Status**: NOT_STARTED

```typescript
import { ClaudeCodeAgent } from 'claude-code-agent';

interface SessionManager {
  // Submit prompt (immediate or queued)
  submit(request: AIPromptRequest): Promise<AISessionSubmitResult>;

  // Cancel session
  cancel(sessionId: string): Promise<void>;

  // Get queue status for Session Button
  getQueueStatus(): QueueStatus;

  // SSE stream for session progress
  streamSession(sessionId: string): ReadableStream<AIProgressEvent>;
}

function createSessionManager(
  agent: ClaudeCodeAgent,
  config: AIConfig
): SessionManager;
```

**Checklist**:
- [ ] Implement createSessionManager()
- [ ] Implement submit() with queue logic
- [ ] Implement cancel()
- [ ] Implement getQueueStatus()
- [ ] Implement streamSession()
- [ ] Unit tests

### 4. AI API Routes

#### src/server/routes/ai.ts

**Status**: NOT_STARTED

```typescript
// POST /api/ai/prompt - Submit prompt
// GET /api/ai/queue/status - Get minimal status for button
// GET /api/ai/session/:id/stream - SSE stream
// POST /api/ai/session/:id/cancel - Cancel session

function createAIRoutes(context: ServerContext): Hono;
```

**Checklist**:
- [ ] Implement POST /api/ai/prompt
- [ ] Implement GET /api/ai/queue/status
- [ ] Implement GET /api/ai/session/:id/stream
- [ ] Implement POST /api/ai/session/:id/cancel
- [ ] Add proper SSE headers
- [ ] Unit tests

### 5. AI Prompt Store (Client)

#### client/stores/ai.ts

**Status**: NOT_STARTED

```typescript
// AI state on client
interface AIStore {
  queueStatus: QueueStatus | null;
  currentPrompt: string;
  selectedLines: { path: string; start: number; end: number } | null;
  fileReferences: FileReference[];
  executionMode: 'immediate' | 'queue';
}

interface AIActions {
  setPrompt(prompt: string): void;
  selectLines(path: string, start: number, end: number): void;
  addFileReference(ref: FileReference): void;
  removeFileReference(path: string): void;
  setExecutionMode(mode: 'immediate' | 'queue'): void;
  submit(): Promise<AISessionSubmitResult>;
  refreshQueueStatus(): Promise<void>;
}

function createAIStore(): AIStore & AIActions;
```

**Checklist**:
- [ ] Implement AI store
- [ ] Add all actions
- [ ] Connect to API
- [ ] Unit tests

### 6. AI Prompt Inline

#### client/components/AIPromptInline.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let lineStart: number;
  export let lineEnd: number;
  export let filePath: string;
  export let onSubmit: (request: AIPromptRequest) => void;
  export let onCancel: () => void;

  // Appears inline after line selection
  // @ file reference autocomplete
  // Immediate/Queue toggle
</script>
```

**Checklist**:
- [ ] Implement inline prompt component
- [ ] Add file reference autocomplete
- [ ] Add execution mode toggle
- [ ] Handle submit/cancel
- [ ] Touch-friendly (bottom sheet on tablet)
- [ ] Unit tests

### 7. AI Prompt Panel (Global)

#### client/components/AIPromptPanel.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let collapsed: boolean;
  export let queueStatus: QueueStatus;
  export let onSubmit: (request: AIPromptRequest) => void;

  // Collapsible panel at bottom
  // File reference autocomplete
  // Queue status indicator
</script>
```

**Checklist**:
- [ ] Implement collapsible panel
- [ ] Add prompt input area
- [ ] Add file reference UI
- [ ] Show queue status
- [ ] Handle submit
- [ ] Keyboard shortcut 'A' to expand
- [ ] Unit tests

### 8. File Autocomplete

#### client/components/FileAutocomplete.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let query: string;
  export let changedFiles: string[];
  export let onSelect: (path: string, lineRange?: { start: number; end: number }) => void;

  // Fuzzy search on file paths
  // Prioritize changed files
  // Support @file.ts:L10-L20 syntax
</script>
```

**Checklist**:
- [ ] Implement autocomplete dropdown
- [ ] Fuzzy search files
- [ ] Prioritize changed files
- [ ] Parse line range syntax
- [ ] Touch-friendly (48px items)
- [ ] Unit tests

### 9. Session Button

#### client/components/SessionButton.svelte

**Status**: NOT_STARTED

```svelte
<script lang="ts">
  export let status: QueueStatus;
  export let onClick: () => void;

  // Minimal indicator in header/footer
  // Shows running/queued counts
  // Click navigates to Session Queue
</script>
```

**Checklist**:
- [ ] Display running/queued counts
- [ ] Show spinner when running
- [ ] Navigate to queue on click
- [ ] Hide when no sessions
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| AI Types | `src/types/ai.ts` | NOT_STARTED | - |
| Prompt Builder | `src/server/ai/prompt-builder.ts` | NOT_STARTED | - |
| Session Manager | `src/server/ai/session-manager.ts` | NOT_STARTED | - |
| AI Routes | `src/server/routes/ai.ts` | NOT_STARTED | - |
| AI Store | `client/stores/ai.ts` | NOT_STARTED | - |
| AI Inline | `client/components/AIPromptInline.svelte` | NOT_STARTED | - |
| AI Panel | `client/components/AIPromptPanel.svelte` | NOT_STARTED | - |
| File Autocomplete | `client/components/FileAutocomplete.svelte` | NOT_STARTED | - |
| Session Button | `client/components/SessionButton.svelte` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| AI Integration | claude-code-agent | To install |
| AI Integration | Server Core | Phase 1 |
| AI Integration | Client Core | Phase 2 |

## Completion Criteria

- [ ] Can submit prompts from line selection
- [ ] Can submit prompts from global panel
- [ ] File autocomplete works with @
- [ ] Immediate/queue modes work
- [ ] Session button shows status
- [ ] SSE streaming works
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-03
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation

## Related Plans

- **Previous**: 11-comment-ui.md
- **Next**: 13-session-queue.md
- **Depends On**: 02-server-core.md, 07-client-core.md
