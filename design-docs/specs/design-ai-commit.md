# AI-Powered Git Operations Design Specification

## Overview

This document describes the design of AI-powered git operations (Commit and Push) for qraftbox. When users press the "Commit" or "Push" button, a new Claude Code agent session is started with a customizable prompt. The agent executes the requested git operation.

## Requirements Summary

### Commit Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| AC1 | Commit button in UI | Must |
| AC2 | Start Claude Code agent session on click | Must |
| AC3 | Pass git commit prompt to agent | Must |
| AC4 | Customizable prompts via config directory | Must |
| AC5 | Default prompt included out-of-box | Must |
| AC6 | Preview commit before execution | Should |
| AC7 | Multiple prompt templates selectable | Should |
| AC8 | Prompt variables/placeholders | Should |
| AC9 | Commit history integration | Should |
| AC10 | Abort/cancel commit session | Must |

### Push Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| AP1 | Push button in UI | Must |
| AP2 | Start Claude Code agent session on click | Must |
| AP3 | Pass git push prompt to agent | Must |
| AP4 | Customizable push prompts | Must |
| AP5 | Show commits to be pushed | Must |
| AP6 | Remote branch selection | Should |
| AP7 | Force push with confirmation | Should |
| AP8 | Push tags option | Should |
| AP9 | Upstream tracking setup | Should |
| AP10 | Abort/cancel push session | Must |

### Pull Request Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| PR1 | Create PR button in UI | Must |
| PR2 | GitHub CLI (gh) integration | Must |
| PR3 | Customizable PR prompts | Must |
| PR4 | Show existing PR status if present | Must |
| PR5 | Base branch selection | Must |
| PR6 | GITHUB_TOKEN authentication | Must |
| PR7 | gh auth token fallback | Must |
| PR8 | PR title/body generation via AI | Must |
| PR9 | Draft PR option | Should |
| PR10 | Reviewer/assignee selection | Should |
| PR11 | Label selection | Should |
| PR12 | Update existing PR | Should |

## Architecture

### Flow Diagram

```
+----------------+     +----------------+     +------------------+
|  Commit Button | --> | Prompt Loader  | --> | Claude Code      |
|  (UI)          |     | (Config)       |     | Agent Session    |
+----------------+     +----------------+     +------------------+
        |                      |                      |
        v                      v                      v
+----------------+     +----------------+     +------------------+
| Staged Changes | --> | Prompt Builder | --> | Git Commit       |
| Detection      |     | (Template)     |     | Execution        |
+----------------+     +----------------+     +------------------+
        |                                             |
        v                                             v
+----------------+                           +------------------+
| Session Queue  |                           | Commit Result    |
| UI (existing)  |                           | Notification     |
+----------------+                           +------------------+
```

### Integration with Existing AI System

The commit feature uses the existing AI agent integration:

```
Existing:
  AIPromptPanel --> SessionManager --> claude-code-agent --> Session Queue

New:
  CommitButton --> PromptLoader --> AIPromptPanel (programmatic) --> ...
```

## Configuration Directory Structure

```
~/.config/qraftbox/
+-- default-prompts/
|   +-- commit.md              # Default commit prompt
|   +-- commit-conventional.md # Conventional commits style
|   +-- commit-detailed.md     # Detailed commit message
|   +-- commit-minimal.md      # Minimal commit message
|   +-- push.md                # Default push prompt
|   +-- push-with-pr.md        # Push and create PR prompt
|   +-- push-force.md          # Force push prompt (with safety checks)
|   +-- pr.md                  # Default PR creation prompt
|   +-- pr-detailed.md         # Detailed PR with full description
|   +-- pr-update.md           # Update existing PR prompt
|   +-- README.md              # Prompt authoring guide
|
+-- settings.json              # General settings including default prompts
```

### Default Prompt Location Priority

1. `~/.config/qraftbox/default-prompts/<operation>.md` (user override)
2. Built-in default (embedded in application)

### Prompt Categories

| Category | Files | Purpose |
|----------|-------|---------|
| Commit | `commit*.md` | Commit message generation and execution |
| Push | `push*.md` | Push operations and remote management |
| PR | `pr*.md` | Pull request creation and updates |

## GitHub Integration

### Library Choice: Octokit

qraftbox uses **@octokit/rest** for GitHub API operations:

| Library | Purpose |
|---------|---------|
| @octokit/rest | GitHub REST API client |
| @octokit/auth-token | Token-based authentication |

### Dependencies

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.0",
    "@octokit/auth-token": "^4.0.0"
  }
}
```

### Authentication Priority

qraftbox uses the following authentication methods in order:

| Priority | Method | Source |
|----------|--------|--------|
| 1 | GITHUB_TOKEN | Environment variable |
| 2 | GH_TOKEN | Environment variable (GitHub CLI compatible) |
| 3 | gh auth | `gh auth token` command output |
| 4 | None | Unauthenticated (limited functionality) |

### Authentication Detection

```typescript
// src/server/github/auth.ts

import { Octokit } from '@octokit/rest';

interface GitHubAuth {
  // Get authentication token
  getToken(): Promise<string | null>;

  // Check if authenticated
  isAuthenticated(): Promise<boolean>;

  // Get auth method used
  getAuthMethod(): Promise<'env' | 'gh-cli' | 'none'>;

  // Get Octokit client (authenticated or not)
  getClient(): Promise<Octokit>;

  // Get authenticated user info
  getUser(): Promise<GitHubUser | null>;
}

interface GitHubUser {
  readonly login: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string;
}
```

### Token Resolution Flow

```
1. Check GITHUB_TOKEN env var
   |
   +-- Found --> Use token with Octokit
   |
   +-- Not found --> Check GH_TOKEN env var
                     |
                     +-- Found --> Use token with Octokit
                     |
                     +-- Not found --> Check gh CLI
                                       |
                                       +-- gh installed --> Run `gh auth token`
                                       |                    |
                                       |                    +-- Success --> Use token
                                       |                    |
                                       |                    +-- Fail --> Unauthenticated
                                       |
                                       +-- Not installed --> Unauthenticated
```

### Octokit Client Factory

```typescript
// src/server/github/client.ts

import { Octokit } from '@octokit/rest';

async function createOctokitClient(): Promise<Octokit> {
  const token = await getToken();

  if (token) {
    return new Octokit({ auth: token });
  }

  // Unauthenticated client (rate limited)
  return new Octokit();
}
```

## Type Definitions

### Prompt Types

```typescript
// src/types/prompt-config.ts

/**
 * Prompt template metadata
 */
interface PromptTemplate {
  readonly id: string;              // Filename without extension
  readonly name: string;            // Display name (from frontmatter)
  readonly description: string;     // Template description
  readonly path: string;            // Full file path
  readonly isBuiltin: boolean;      // Built-in vs user-defined
  readonly isDefault: boolean;      // Currently selected as default
}

/**
 * Prompt template content
 */
interface PromptContent {
  readonly template: string;        // Raw template with placeholders
  readonly frontmatter: PromptFrontmatter;
}

/**
 * Frontmatter metadata in prompt files
 */
interface PromptFrontmatter {
  readonly name: string;
  readonly description?: string;
  readonly author?: string;
  readonly version?: string;
  readonly variables?: readonly PromptVariable[];
}

/**
 * Variable definition for prompts
 */
interface PromptVariable {
  readonly name: string;            // e.g., "scope"
  readonly description: string;     // User-facing description
  readonly required: boolean;
  readonly default?: string;
}

/**
 * Prompt context for template rendering
 */
interface CommitPromptContext {
  readonly stagedFiles: readonly StagedFile[];
  readonly diffSummary: string;
  readonly branchName: string;
  readonly recentCommits: readonly string[];  // Recent commit messages
  readonly customVariables: Record<string, string>;
}

/**
 * Staged file information
 */
interface StagedFile {
  readonly path: string;
  readonly status: 'A' | 'M' | 'D' | 'R';
  readonly additions: number;
  readonly deletions: number;
}

/**
 * Commit execution request
 */
interface CommitRequest {
  readonly promptTemplateId: string;
  readonly customVariables?: Record<string, string>;
  readonly dryRun?: boolean;        // Preview only, don't commit
}

/**
 * Commit execution result
 */
interface CommitResult {
  readonly success: boolean;
  readonly commitHash?: string;
  readonly commitMessage?: string;
  readonly error?: string;
  readonly sessionId: string;       // AI session ID for tracking
}

/**
 * Push context for template rendering
 */
interface PushPromptContext {
  readonly branchName: string;
  readonly remoteName: string;           // e.g., "origin"
  readonly remoteBranch: string;         // Remote branch name
  readonly unpushedCommits: readonly UnpushedCommit[];
  readonly hasUpstream: boolean;         // Whether branch tracks remote
  readonly aheadCount: number;           // Commits ahead of remote
  readonly behindCount: number;          // Commits behind remote
  readonly customVariables: Record<string, string>;
}

/**
 * Unpushed commit information
 */
interface UnpushedCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly author: string;
  readonly date: number;
}

/**
 * Push execution request
 */
interface PushRequest {
  readonly promptTemplateId: string;
  readonly remote?: string;              // Default: "origin"
  readonly branch?: string;              // Default: current branch
  readonly force?: boolean;              // Force push
  readonly setUpstream?: boolean;        // -u flag
  readonly pushTags?: boolean;           // --tags flag
  readonly customVariables?: Record<string, string>;
  readonly dryRun?: boolean;
}

/**
 * Push execution result
 */
interface PushResult {
  readonly success: boolean;
  readonly remote: string;
  readonly branch: string;
  readonly pushedCommits: number;
  readonly error?: string;
  readonly sessionId: string;
}

/**
 * Pull request context for template rendering
 */
interface PRPromptContext {
  readonly branchName: string;
  readonly baseBranch: string;
  readonly remoteName: string;
  readonly commits: readonly UnpushedCommit[];
  readonly existingPR: ExistingPR | null;
  readonly diffSummary: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly customVariables: Record<string, string>;
}

/**
 * Existing PR information
 */
interface ExistingPR {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly url: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly isDraft: boolean;
  readonly labels: readonly string[];
  readonly reviewers: readonly string[];
  readonly assignees: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * PR creation request
 */
interface PRRequest {
  readonly promptTemplateId: string;
  readonly baseBranch: string;
  readonly title?: string;              // Override AI-generated title
  readonly body?: string;               // Override AI-generated body
  readonly draft?: boolean;
  readonly labels?: readonly string[];
  readonly reviewers?: readonly string[];
  readonly assignees?: readonly string[];
  readonly customVariables?: Record<string, string>;
}

/**
 * PR creation result
 */
interface PRResult {
  readonly success: boolean;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly title?: string;
  readonly error?: string;
  readonly sessionId: string;
}

/**
 * Branch PR status
 */
interface BranchPRStatus {
  readonly hasPR: boolean;
  readonly pr: ExistingPR | null;
  readonly baseBranch: string;
  readonly canCreatePR: boolean;
  readonly reason?: string;             // Why can't create PR
}
```

## Default Prompt Templates

### commit.md (Default)

```markdown
---
name: Standard Commit
description: Generate a clear, concise commit message for staged changes
---

Analyze the staged changes and create a git commit.

## Staged Changes

{{#each stagedFiles}}
- {{status}} {{path}} (+{{additions}} -{{deletions}})
{{/each}}

## Diff Summary

{{diffSummary}}

## Instructions

1. Analyze the changes carefully
2. Write a clear commit message following this format:
   - First line: type(scope): brief description (max 72 chars)
   - Blank line
   - Body: detailed explanation if needed
3. Use conventional commit types: feat, fix, docs, style, refactor, test, chore
4. Execute the commit with `git commit`

Current branch: {{branchName}}
```

### commit-conventional.md

```markdown
---
name: Conventional Commits
description: Strict conventional commits format with scope
variables:
  - name: scope
    description: Component or module scope (e.g., api, ui, auth)
    required: false
---

Create a commit following the Conventional Commits specification.

## Staged Changes

{{#each stagedFiles}}
- {{status}} {{path}}
{{/each}}

## Diff Summary

{{diffSummary}}

## Format Requirements

The commit message MUST follow this exact format:

```
<type>({{#if scope}}{{scope}}{{else}}<scope>{{/if}}): <description>

[optional body]

[optional footer(s)]
```

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore

Execute: `git commit -m "<message>"`
```

### commit-detailed.md

```markdown
---
name: Detailed Commit
description: Comprehensive commit message with full context
---

Create a detailed commit message explaining all changes.

## Changes to Commit

{{#each stagedFiles}}
### {{path}}
- Status: {{status}}
- Changes: +{{additions}} -{{deletions}}
{{/each}}

## Full Diff

{{diffSummary}}

## Recent Commits (for context)

{{#each recentCommits}}
- {{this}}
{{/each}}

## Instructions

Write a comprehensive commit message that:
1. Summarizes the overall change in the first line
2. Explains WHY the change was made
3. Describes any notable implementation details
4. Lists any breaking changes or side effects

Branch: {{branchName}}
```

### commit-minimal.md

```markdown
---
name: Minimal Commit
description: Quick, minimal commit message
---

Create a brief commit message for these changes:

Files: {{#each stagedFiles}}{{path}}{{#unless @last}}, {{/unless}}{{/each}}

Keep the message under 50 characters. Just describe what changed.

Execute: `git commit -m "<message>"`
```

## Push Prompt Templates

### push.md (Default)

```markdown
---
name: Standard Push
description: Push commits to remote repository
---

Push local commits to remote repository.

## Current State

- Branch: {{branchName}}
- Remote: {{remoteName}}/{{remoteBranch}}
- Tracking: {{#if hasUpstream}}Yes{{else}}No (will set upstream){{/if}}
- Ahead: {{aheadCount}} commits
- Behind: {{behindCount}} commits

## Commits to Push

{{#each unpushedCommits}}
- {{shortHash}} {{message}} ({{author}})
{{/each}}

## Instructions

1. Review the commits to be pushed
2. {{#if behindCount}}WARNING: Remote has {{behindCount}} new commits. Consider pulling first.{{/if}}
3. Execute: `git push {{#unless hasUpstream}}-u {{/unless}}{{remoteName}} {{branchName}}`

{{#if behindCount}}
If you need to push anyway, consider:
- `git pull --rebase` first, or
- Discuss with team before force pushing
{{/if}}
```

### push-with-pr.md

```markdown
---
name: Push and Create PR
description: Push commits and create a pull request
variables:
  - name: prTitle
    description: Pull request title (optional, will be auto-generated if empty)
    required: false
  - name: baseBranch
    description: Base branch for PR (default: main)
    required: false
    default: main
---

Push commits and create a pull request.

## Commits to Push

{{#each unpushedCommits}}
- {{shortHash}} {{message}}
{{/each}}

## Instructions

1. Push commits: `git push {{#unless hasUpstream}}-u {{/unless}}{{remoteName}} {{branchName}}`
2. Create PR: `gh pr create --base {{#if baseBranch}}{{baseBranch}}{{else}}main{{/if}}{{#if prTitle}} --title "{{prTitle}}"{{/if}}`

Generate an appropriate PR description based on the commits being pushed.
```

### push-force.md

```markdown
---
name: Force Push (Careful!)
description: Force push with safety checks - use with caution
variables:
  - name: confirm
    description: Type "FORCE" to confirm force push
    required: true
---

Force push to remote (DANGEROUS - rewrites history).

## Current State

- Branch: {{branchName}}
- Remote: {{remoteName}}/{{remoteBranch}}
- Behind: {{behindCount}} commits (will be overwritten!)

## Safety Checks

{{#if confirm}}
Confirmation received: {{confirm}}
{{/if}}

## Instructions

ONLY proceed if:
1. You understand force push rewrites remote history
2. No one else is working on this branch
3. This is not a protected branch (main/master)

{{#if (eq confirm "FORCE")}}
Execute: `git push --force-with-lease {{remoteName}} {{branchName}}`

Note: Using --force-with-lease for safety (fails if remote has unexpected commits)
{{else}}
ERROR: Confirmation required. Set confirm="FORCE" to proceed.
{{/if}}
```

## PR Prompt Templates

### pr.md (Default)

```markdown
---
name: Standard PR
description: Create a pull request with auto-generated title and description
variables:
  - name: baseBranch
    description: Base branch for the PR
    required: false
    default: main
---

Create a pull request for branch {{branchName}}.

## Branch Information

- Source: {{branchName}}
- Target: {{baseBranch}}
- Repository: {{repoOwner}}/{{repoName}}

## Commits in this PR

{{#each commits}}
- {{shortHash}} {{message}} ({{author}})
{{/each}}

## Changes Summary

{{diffSummary}}

## Instructions

1. Generate a clear, concise PR title (max 72 chars)
2. Write a description that:
   - Summarizes what this PR does
   - Lists key changes
   - Notes any breaking changes
3. Create PR: `gh pr create --base {{baseBranch}} --title "<title>" --body "<body>"`

{{#if existingPR}}
NOTE: A PR already exists (#{{existingPR.number}}). Consider updating it instead.
{{/if}}
```

### pr-detailed.md

```markdown
---
name: Detailed PR
description: Create a comprehensive pull request with full context
variables:
  - name: baseBranch
    description: Base branch for the PR
    required: false
    default: main
  - name: ticketId
    description: Related ticket/issue ID (e.g., JIRA-123)
    required: false
---

Create a detailed pull request.

## Context

- Branch: {{branchName}} -> {{baseBranch}}
- Repository: {{repoOwner}}/{{repoName}}
{{#if ticketId}}- Related: {{ticketId}}{{/if}}

## Commits

{{#each commits}}
### {{shortHash}} - {{message}}
Author: {{author}} | Date: {{date}}
{{/each}}

## Full Diff Summary

{{diffSummary}}

## PR Template

Generate a PR with:

### Title
Format: `[type]: brief description`
Types: feat, fix, refactor, docs, test, chore

### Body Structure
```
## Summary
<What does this PR do?>

## Changes
- <List key changes>

## Testing
<How was this tested?>

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

Create: `gh pr create --base {{baseBranch}} --title "<title>" --body "<body>"`
```

### pr-update.md

```markdown
---
name: Update Existing PR
description: Update an existing pull request
---

Update the existing pull request.

## Current PR

- PR: #{{existingPR.number}}
- Title: {{existingPR.title}}
- State: {{existingPR.state}}
- URL: {{existingPR.url}}

## New Commits Since PR Creation

{{#each commits}}
- {{shortHash}} {{message}}
{{/each}}

## Instructions

1. Review the new commits
2. Update PR description if needed
3. Execute: `gh pr edit {{existingPR.number}} --body "<updated body>"`

Keep the existing title unless the scope has significantly changed.
```

## API Design

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/prompts` | GET | List available prompt templates |
| `/api/prompts/:id` | GET | Get prompt template content |
| `/api/prompts/default/:category` | GET/PUT | Get/set default prompt by category |
| `/api/ctx/:id/commit` | POST | Execute commit with AI |
| `/api/ctx/:id/commit/preview` | POST | Preview commit (dry run) |
| `/api/ctx/:id/staged` | GET | Get staged files info |
| `/api/ctx/:id/push` | POST | Execute push with AI |
| `/api/ctx/:id/push/preview` | POST | Preview push (dry run) |
| `/api/ctx/:id/push/status` | GET | Get push status (unpushed commits) |
| `/api/ctx/:id/remotes` | GET | List remotes and tracking info |
| `/api/ctx/:id/pr` | POST | Create PR with AI |
| `/api/ctx/:id/pr` | PATCH | Update existing PR |
| `/api/ctx/:id/pr/status` | GET | Get PR status for current branch |
| `/api/github/auth` | GET | Get GitHub auth status |
| `/api/github/user` | GET | Get authenticated user info |

### GET /api/prompts

**Response:**

```json
{
  "prompts": [
    {
      "id": "commit",
      "name": "Standard Commit",
      "description": "Generate a clear, concise commit message",
      "path": "~/.config/qraftbox/default-prompts/commit.md",
      "isBuiltin": false,
      "isDefault": true
    },
    {
      "id": "commit-conventional",
      "name": "Conventional Commits",
      "description": "Strict conventional commits format",
      "path": "~/.config/qraftbox/default-prompts/commit-conventional.md",
      "isBuiltin": true,
      "isDefault": false
    }
  ],
  "defaultId": "commit"
}
```

### POST /api/ctx/:id/commit

**Request:**

```json
{
  "promptTemplateId": "commit-conventional",
  "customVariables": {
    "scope": "api"
  },
  "dryRun": false
}
```

**Response:**

```json
{
  "sessionId": "sess_abc123",
  "status": "queued"
}
```

The actual commit result comes through the existing SSE/WebSocket session events.

### GET /api/ctx/:id/staged

**Response:**

```json
{
  "hasStagedChanges": true,
  "files": [
    {
      "path": "src/main.ts",
      "status": "M",
      "additions": 15,
      "deletions": 3
    },
    {
      "path": "src/utils/helper.ts",
      "status": "A",
      "additions": 45,
      "deletions": 0
    }
  ],
  "summary": {
    "filesChanged": 2,
    "additions": 60,
    "deletions": 3
  }
}
```

### GET /api/ctx/:id/push/status

**Response:**

```json
{
  "canPush": true,
  "branchName": "feature/auth",
  "remote": {
    "name": "origin",
    "url": "git@github.com:user/repo.git",
    "branch": "feature/auth"
  },
  "hasUpstream": true,
  "aheadCount": 3,
  "behindCount": 0,
  "unpushedCommits": [
    {
      "hash": "abc1234567890",
      "shortHash": "abc1234",
      "message": "feat: add user authentication",
      "author": "taco",
      "date": 1738656000
    },
    {
      "hash": "def5678901234",
      "shortHash": "def5678",
      "message": "fix: token expiry handling",
      "author": "taco",
      "date": 1738655000
    }
  ]
}
```

### POST /api/ctx/:id/push

**Request:**

```json
{
  "promptTemplateId": "push",
  "remote": "origin",
  "branch": "feature/auth",
  "force": false,
  "setUpstream": false,
  "pushTags": false,
  "dryRun": false
}
```

**Response:**

```json
{
  "sessionId": "sess_xyz789",
  "status": "queued"
}
```

### GET /api/ctx/:id/remotes

**Response:**

```json
{
  "remotes": [
    {
      "name": "origin",
      "fetchUrl": "git@github.com:user/repo.git",
      "pushUrl": "git@github.com:user/repo.git"
    },
    {
      "name": "upstream",
      "fetchUrl": "git@github.com:original/repo.git",
      "pushUrl": "git@github.com:original/repo.git"
    }
  ],
  "currentTracking": {
    "remote": "origin",
    "branch": "feature/auth"
  }
}
```

### GET /api/ctx/:id/pr/status

**Response (No existing PR):**

```json
{
  "hasPR": false,
  "pr": null,
  "baseBranch": "main",
  "canCreatePR": true,
  "availableBaseBranches": ["main", "develop", "staging"],
  "repoOwner": "user",
  "repoName": "repo"
}
```

**Response (Existing PR):**

```json
{
  "hasPR": true,
  "pr": {
    "number": 123,
    "title": "feat: add user authentication",
    "body": "This PR adds...",
    "state": "open",
    "url": "https://github.com/user/repo/pull/123",
    "baseBranch": "main",
    "headBranch": "feature/auth",
    "isDraft": false,
    "labels": ["enhancement"],
    "reviewers": ["reviewer1"],
    "assignees": ["user"],
    "createdAt": 1738600000,
    "updatedAt": 1738650000
  },
  "baseBranch": "main",
  "canCreatePR": false,
  "reason": "PR already exists"
}
```

### POST /api/ctx/:id/pr

**Request:**

```json
{
  "promptTemplateId": "pr",
  "baseBranch": "main",
  "draft": false,
  "labels": ["enhancement"],
  "reviewers": ["teammate"],
  "customVariables": {
    "ticketId": "JIRA-456"
  }
}
```

**Response:**

```json
{
  "sessionId": "sess_pr123",
  "status": "queued"
}
```

### PATCH /api/ctx/:id/pr

**Request:**

```json
{
  "promptTemplateId": "pr-update",
  "prNumber": 123
}
```

**Response:**

```json
{
  "sessionId": "sess_pr456",
  "status": "queued"
}
```

### GET /api/github/auth

**Response:**

```json
{
  "authenticated": true,
  "method": "gh-cli",
  "user": {
    "login": "username",
    "name": "User Name",
    "email": "user@example.com"
  },
  "ghCliAvailable": true
}
```

## Server Components

### Prompt Loader

```typescript
// src/server/prompts/loader.ts

interface PromptLoader {
  // Load all available prompts
  loadPrompts(): Promise<PromptTemplate[]>;

  // Load specific prompt content
  loadPromptContent(id: string): Promise<PromptContent>;

  // Get default prompt ID
  getDefaultPromptId(): Promise<string>;

  // Set default prompt
  setDefaultPromptId(id: string): Promise<void>;

  // Watch for prompt file changes
  watchPrompts(onChange: () => void): () => void;
}
```

### Prompt Builder

```typescript
// src/server/prompts/builder.ts

interface PromptBuilder {
  // Build prompt from template and context
  buildPrompt(
    template: PromptContent,
    context: CommitPromptContext
  ): string;

  // Extract variables from template
  extractVariables(template: string): PromptVariable[];

  // Validate required variables
  validateVariables(
    template: PromptContent,
    variables: Record<string, string>
  ): ValidationResult;
}
```

### Commit Executor

```typescript
// src/server/commit/executor.ts

interface CommitExecutor {
  // Get staged files info
  getStagedFiles(cwd: string): Promise<StagedFile[]>;

  // Build commit context
  buildContext(cwd: string): Promise<CommitPromptContext>;

  // Execute commit via AI session
  executeCommit(
    contextId: ContextId,
    request: CommitRequest
  ): Promise<{ sessionId: string }>;

  // Preview commit (returns generated message without committing)
  previewCommit(
    contextId: ContextId,
    request: CommitRequest
  ): Promise<{ sessionId: string }>;
}
```

### Push Executor

```typescript
// src/server/push/executor.ts

interface PushExecutor {
  // Get push status (unpushed commits, tracking info)
  getPushStatus(cwd: string): Promise<PushStatus>;

  // Get list of remotes
  getRemotes(cwd: string): Promise<Remote[]>;

  // Build push context for prompt
  buildContext(cwd: string, options?: PushOptions): Promise<PushPromptContext>;

  // Execute push via AI session
  executePush(
    contextId: ContextId,
    request: PushRequest
  ): Promise<{ sessionId: string }>;

  // Preview push (dry run)
  previewPush(
    contextId: ContextId,
    request: PushRequest
  ): Promise<{ sessionId: string }>;
}

interface PushStatus {
  readonly canPush: boolean;
  readonly branchName: string;
  readonly remote: RemoteTracking | null;
  readonly hasUpstream: boolean;
  readonly aheadCount: number;
  readonly behindCount: number;
  readonly unpushedCommits: readonly UnpushedCommit[];
  readonly error?: string;  // e.g., "No remote configured"
}

interface Remote {
  readonly name: string;
  readonly fetchUrl: string;
  readonly pushUrl: string;
}

interface RemoteTracking {
  readonly name: string;
  readonly url: string;
  readonly branch: string;
}
```

### PR Executor

```typescript
// src/server/pr/executor.ts

interface PRExecutor {
  // Get PR status for current branch
  getPRStatus(cwd: string): Promise<BranchPRStatus>;

  // Get available base branches
  getBaseBranches(cwd: string): Promise<string[]>;

  // Build PR context for prompt
  buildContext(cwd: string, baseBranch: string): Promise<PRPromptContext>;

  // Create PR via AI session
  createPR(
    contextId: ContextId,
    request: PRRequest
  ): Promise<{ sessionId: string }>;

  // Update existing PR
  updatePR(
    contextId: ContextId,
    prNumber: number,
    request: PRRequest
  ): Promise<{ sessionId: string }>;

  // Get repo info from remote URL
  getRepoInfo(cwd: string): Promise<{ owner: string; name: string } | null>;
}
```

### GitHub Service

```typescript
// src/server/github/service.ts

import { Octokit } from '@octokit/rest';

interface GitHubService {
  // Get Octokit client
  getClient(): Promise<Octokit>;

  // Authentication
  isAuthenticated(): Promise<boolean>;
  getAuthMethod(): Promise<'env' | 'gh-cli' | 'none'>;
  getUser(): Promise<GitHubUser | null>;

  // PR operations (via Octokit)
  getPR(owner: string, repo: string, branch: string): Promise<ExistingPR | null>;
  listPRs(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<ExistingPR[]>;
  createPR(owner: string, repo: string, params: CreatePRParams): Promise<ExistingPR>;
  updatePR(owner: string, repo: string, prNumber: number, params: UpdatePRParams): Promise<ExistingPR>;

  // Repository info
  getRepo(owner: string, repo: string): Promise<RepoInfo>;
  getDefaultBranch(owner: string, repo: string): Promise<string>;
  getBranches(owner: string, repo: string): Promise<string[]>;
  getLabels(owner: string, repo: string): Promise<Label[]>;
  getCollaborators(owner: string, repo: string): Promise<Collaborator[]>;

  // Comparison
  compareBranches(owner: string, repo: string, base: string, head: string): Promise<BranchComparison>;
}

interface CreatePRParams {
  readonly title: string;
  readonly body: string;
  readonly head: string;           // Source branch
  readonly base: string;           // Target branch
  readonly draft?: boolean;
  readonly maintainerCanModify?: boolean;
}

interface UpdatePRParams {
  readonly title?: string;
  readonly body?: string;
  readonly state?: 'open' | 'closed';
  readonly base?: string;
  readonly maintainerCanModify?: boolean;
}

interface RepoInfo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly htmlUrl: string;
}

interface Label {
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

interface Collaborator {
  readonly login: string;
  readonly avatarUrl: string;
  readonly permissions: {
    readonly admin: boolean;
    readonly push: boolean;
    readonly pull: boolean;
  };
}

interface BranchComparison {
  readonly aheadBy: number;
  readonly behindBy: number;
  readonly status: 'ahead' | 'behind' | 'diverged' | 'identical';
  readonly commits: readonly CommitInfo[];
}
```

### Octokit Usage Examples

```typescript
// Create PR
const octokit = await githubService.getClient();

const { data: pr } = await octokit.pulls.create({
  owner: 'user',
  repo: 'repo',
  title: 'feat: add new feature',
  body: 'Description...',
  head: 'feature-branch',
  base: 'main',
  draft: false,
});

// Get PR for branch
const { data: prs } = await octokit.pulls.list({
  owner: 'user',
  repo: 'repo',
  head: 'user:feature-branch',
  state: 'open',
});

// Update PR
await octokit.pulls.update({
  owner: 'user',
  repo: 'repo',
  pull_number: 123,
  body: 'Updated description',
});

// Add labels
await octokit.issues.addLabels({
  owner: 'user',
  repo: 'repo',
  issue_number: 123,  // PR number
  labels: ['enhancement'],
});

// Request reviewers
await octokit.pulls.requestReviewers({
  owner: 'user',
  repo: 'repo',
  pull_number: 123,
  reviewers: ['teammate'],
});
```

## UI Design

### Commit Button Location

The commit button appears in the header/toolbar area:

```
+--------------------------------------------------------------------------+
| [+] | [qraftbox] [x] | [repo2] [x] |    | [Commit] [Push] | [Session: 2]    |
+--------------------------------------------------------------------------+
```

### Commit Button States

| State | Appearance | Action |
|-------|------------|--------|
| No staged changes | Disabled, gray | Show tooltip "No staged changes" |
| Has staged changes | Enabled, primary color | Opens commit panel |
| Commit in progress | Loading spinner | Disabled |
| Commit success | Checkmark briefly | Returns to normal |

### Commit Panel (Bottom Sheet)

When commit button is pressed:

```
+------------------------------------------------------------------+
|  Commit Changes                                          [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  Staged Files (3)                                    [Stage All] |
|  +------------------------------------------------------------+  |
|  | [M] src/main.ts                              +15 -3        |  |
|  | [A] src/utils/helper.ts                      +45 -0        |  |
|  | [D] src/old-file.ts                          +0  -20       |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  Prompt Template: [Standard Commit        v]    [Customize]      |
|                                                                  |
|  +------------------------------------------------------------+  |
|  | Preview of prompt that will be sent to Claude Code...      |  |
|  | (collapsible, shows first 3 lines)                         |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  [                    Commit with AI                          ]  |
|                                                                  |
+------------------------------------------------------------------+
```

### Prompt Template Selector

Dropdown showing available templates:

```
+----------------------------------+
| Standard Commit            [*]   |  <-- Default marker
+----------------------------------+
| Conventional Commits             |
+----------------------------------+
| Detailed Commit                  |
+----------------------------------+
| Minimal Commit                   |
+----------------------------------+
| + Create Custom Template...      |
+----------------------------------+
```

### Variable Input (for templates with variables)

When selecting a template with variables:

```
+------------------------------------------------------------------+
|  Template Variables                                              |
|  +------------------------------------------------------------+  |
|  | Scope (optional)                                           |  |
|  | [ api                                                    ] |  |
|  | Component or module scope (e.g., api, ui, auth)           |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### Commit Progress

After pressing "Commit with AI":

```
+------------------------------------------------------------------+
|  Committing...                                           [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  [====================>                    ] 45%                 |
|                                                                  |
|  Claude is analyzing changes and generating commit message...    |
|                                                                  |
|  > Analyzing 3 staged files                                      |
|  > Generating commit message                                     |
|  > Executing git commit                                          |
|                                                                  |
+------------------------------------------------------------------+
```

### Commit Success

```
+------------------------------------------------------------------+
|  Commit Successful!                                      [Close] |
+------------------------------------------------------------------+
|                                                                  |
|  [checkmark icon]                                                |
|                                                                  |
|  Commit: abc1234                                                 |
|                                                                  |
|  feat(api): add user authentication endpoint                     |
|                                                                  |
|  Added new /api/auth/login endpoint with JWT token generation.   |
|  Includes input validation and rate limiting.                    |
|                                                                  |
|  [View in Commit Log]              [Push to Remote]              |
|                                                                  |
+------------------------------------------------------------------+
```

## Push UI Design

### Push Button Location

The push button appears next to the commit button:

```
+--------------------------------------------------------------------------+
| [+] | [qraftbox] [x] | [repo2] [x] |    | [Commit] [Push 3] | [Session: 2]  |
+--------------------------------------------------------------------------+
                                              ^-- Badge shows unpushed count
```

### Push Button States

| State | Appearance | Action |
|-------|------------|--------|
| No unpushed commits | Disabled, gray | Show tooltip "Nothing to push" |
| Has unpushed commits | Enabled, shows count badge | Opens push panel |
| Behind remote | Warning color (orange) | Shows "Pull first" hint |
| Push in progress | Loading spinner | Disabled |
| Push success | Checkmark briefly | Returns to normal |
| No remote | Disabled | Show tooltip "No remote configured" |

### Push Panel (Bottom Sheet)

When push button is pressed:

```
+------------------------------------------------------------------+
|  Push to Remote                                          [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  Remote: [origin                     v]  Branch: feature/auth    |
|                                                                  |
|  Status:  3 commits ahead  |  0 behind                           |
|                                                                  |
|  Commits to Push (3)                                             |
|  +------------------------------------------------------------+  |
|  | abc1234  feat: add user authentication          2 hrs ago  |  |
|  | def5678  fix: token expiry handling             1 hr ago   |  |
|  | ghi9012  test: add auth tests                   30 min ago |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  Prompt Template: [Standard Push          v]                     |
|                                                                  |
|  Options:                                                        |
|  [ ] Set upstream (-u)                                           |
|  [ ] Push tags                                                   |
|  [ ] Force push (dangerous)                                      |
|                                                                  |
|  [                      Push with AI                           ] |
|                                                                  |
+------------------------------------------------------------------+
```

### Push Behind Warning

When local branch is behind remote:

```
+------------------------------------------------------------------+
|  Push to Remote                                          [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  [!] WARNING: Remote has 2 new commits                           |
|                                                                  |
|  Status:  3 commits ahead  |  2 behind                           |
|                                                                  |
|  Recommended Actions:                                            |
|  +------------------------------------------------------------+  |
|  | [Pull & Rebase]  Fetch and rebase your commits on top       |  |
|  | [Pull & Merge]   Fetch and create a merge commit            |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  Or force push (not recommended):                                |
|  [ ] I understand this will overwrite remote history             |
|                                                                  |
+------------------------------------------------------------------+
```

### Push Progress

After pressing "Push with AI":

```
+------------------------------------------------------------------+
|  Pushing...                                              [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  [====================>                    ] 60%                 |
|                                                                  |
|  Pushing 3 commits to origin/feature/auth...                     |
|                                                                  |
|  > Checking remote status                                        |
|  > Pushing commits                                               |
|  > Updating remote tracking                                      |
|                                                                  |
+------------------------------------------------------------------+
```

### Push Success

```
+------------------------------------------------------------------+
|  Push Successful!                                        [Close] |
+------------------------------------------------------------------+
|                                                                  |
|  [checkmark icon]                                                |
|                                                                  |
|  Pushed 3 commits to origin/feature/auth                         |
|                                                                  |
|  abc1234  feat: add user authentication                          |
|  def5678  fix: token expiry handling                             |
|  ghi9012  test: add auth tests                                   |
|                                                                  |
|  [View on GitHub]                 [Create Pull Request]          |
|                                                                  |
+------------------------------------------------------------------+
```

### No Upstream Setup

When pushing a new branch:

```
+------------------------------------------------------------------+
|  Push New Branch                                         [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  This branch has no upstream tracking.                           |
|                                                                  |
|  Remote: [origin                     v]                          |
|                                                                  |
|  Remote branch name:                                             |
|  [ feature/auth                                               ]  |
|                                                                  |
|  [x] Set as upstream (recommended)                               |
|                                                                  |
|  [                   Push New Branch                           ] |
|                                                                  |
+------------------------------------------------------------------+
```

## PR UI Design

### PR Button Location

The PR button appears in the toolbar, showing PR status:

```
+--------------------------------------------------------------------------+
| [+] | [qraftbox] [x] |    | [Commit] [Push 3] [PR #123] | [Session: 2]      |
+--------------------------------------------------------------------------+
                                       ^-- Shows PR number if exists
```

Or when no PR exists:

```
+--------------------------------------------------------------------------+
| [+] | [qraftbox] [x] |    | [Commit] [Push 3] [Create PR] | [Session: 2]    |
+--------------------------------------------------------------------------+
```

### PR Button States

| State | Appearance | Action |
|-------|------------|--------|
| No auth | Disabled | Show "GitHub auth required" tooltip |
| No remote | Disabled | Show "Push first" tooltip |
| Can create PR | Enabled, "Create PR" | Opens PR creation panel |
| PR exists (open) | Shows "#123", blue | Opens PR status panel |
| PR exists (merged) | Shows "#123", purple | Opens PR status panel |
| PR exists (closed) | Shows "#123", red | Opens PR status panel |
| Creating PR | Loading spinner | Disabled |

### PR Creation Panel (No Existing PR)

```
+------------------------------------------------------------------+
|  Create Pull Request                                     [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  [GitHub icon] Authenticated as: @username                       |
|                                                                  |
|  Branch: feature/auth  -->  [main            v]                  |
|                                                                  |
|  Commits (3)                                                     |
|  +------------------------------------------------------------+  |
|  | abc1234  feat: add user authentication          2 hrs ago  |  |
|  | def5678  fix: token expiry handling             1 hr ago   |  |
|  | ghi9012  test: add auth tests                   30 min ago |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  Prompt Template: [Standard PR           v]                      |
|                                                                  |
|  Options:                                                        |
|  [ ] Create as draft                                             |
|  Labels: [enhancement v] [+ Add]                                 |
|  Reviewers: [@teammate v] [+ Add]                                |
|                                                                  |
|  [                    Create PR with AI                        ] |
|                                                                  |
+------------------------------------------------------------------+
```

### PR Status Panel (Existing PR)

```
+------------------------------------------------------------------+
|  Pull Request #123                                       [Close] |
+------------------------------------------------------------------+
|                                                                  |
|  [Open] feat: add user authentication                            |
|                                                                  |
|  feature/auth --> main                                           |
|                                                                  |
|  +------------------------------------------------------------+  |
|  | Created: 2 days ago                                        |  |
|  | Updated: 1 hour ago                                        |  |
|  | Labels: enhancement, needs-review                          |  |
|  | Reviewers: @teammate (pending)                             |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  New commits since PR creation: 2                                |
|  +------------------------------------------------------------+  |
|  | def5678  fix: address review comments           1 hr ago   |  |
|  | ghi9012  test: add more tests                   30 min ago |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  [View on GitHub]  [Update PR]  [Push New Commits]               |
|                                                                  |
+------------------------------------------------------------------+
```

### PR Progress

```
+------------------------------------------------------------------+
|  Creating Pull Request...                                [Cancel] |
+------------------------------------------------------------------+
|                                                                  |
|  [====================>                    ] 50%                 |
|                                                                  |
|  Claude is generating PR title and description...                |
|                                                                  |
|  > Analyzing commits                                             |
|  > Generating PR title                                           |
|  > Writing PR description                                        |
|  > Creating PR via gh CLI                                        |
|                                                                  |
+------------------------------------------------------------------+
```

### PR Success

```
+------------------------------------------------------------------+
|  Pull Request Created!                                   [Close] |
+------------------------------------------------------------------+
|                                                                  |
|  [checkmark icon]                                                |
|                                                                  |
|  PR #124: feat: add user authentication                          |
|                                                                  |
|  https://github.com/user/repo/pull/124                           |
|                                                                  |
|  [Open in GitHub]              [Copy URL]                        |
|                                                                  |
+------------------------------------------------------------------+
```

### GitHub Auth Required

When not authenticated:

```
+------------------------------------------------------------------+
|  GitHub Authentication Required                          [Close] |
+------------------------------------------------------------------+
|                                                                  |
|  To create pull requests, please authenticate with GitHub.       |
|                                                                  |
|  Option 1: Set GITHUB_TOKEN environment variable                 |
|  +------------------------------------------------------------+  |
|  | export GITHUB_TOKEN=ghp_xxxx                               |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  Option 2: Authenticate with GitHub CLI                          |
|  +------------------------------------------------------------+  |
|  | gh auth login                                              |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  [Check Authentication Status]                                   |
|                                                                  |
+------------------------------------------------------------------+
```

## Touch Interactions

### Commit Interactions

| Gesture | Action |
|---------|--------|
| Tap Commit button | Open commit panel |
| Tap staged file | Toggle staging |
| Swipe down on panel | Collapse/dismiss |
| Long-press template | Preview template content |
| Tap "Commit with AI" | Start commit session |

### Push Interactions

| Gesture | Action |
|---------|--------|
| Tap Push button | Open push panel |
| Tap commit in list | View commit details |
| Swipe down on panel | Collapse/dismiss |
| Long-press remote | Show remote details |
| Tap "Push with AI" | Start push session |
| Swipe left on commit | Exclude from push (future) |

### PR Interactions

| Gesture | Action |
|---------|--------|
| Tap PR button | Open PR panel (create or status) |
| Tap commit in list | View commit details |
| Tap label | Remove label |
| Tap "+ Add" | Open selector (labels/reviewers) |
| Tap "View on GitHub" | Open PR in browser |
| Long-press PR URL | Copy URL to clipboard |
| Swipe down on panel | Collapse/dismiss |

## Client Store

### Commit Store

```typescript
// client/stores/commit.ts

interface CommitState {
  readonly isOpen: boolean;
  readonly stagedFiles: readonly StagedFile[];
  readonly selectedTemplateId: string;
  readonly customVariables: Record<string, string>;
  readonly availableTemplates: readonly PromptTemplate[];
  readonly promptPreview: string;
  readonly status: 'idle' | 'loading' | 'committing' | 'success' | 'error';
  readonly sessionId: string | null;
  readonly result: CommitResult | null;
  readonly error: string | null;
}

interface CommitActions {
  open(): Promise<void>;
  close(): void;
  refreshStaged(): Promise<void>;
  selectTemplate(id: string): void;
  setVariable(name: string, value: string): void;
  previewPrompt(): Promise<void>;
  commit(): Promise<void>;
  cancel(): void;
}
```

### Push Store

```typescript
// client/stores/push.ts

interface PushState {
  readonly isOpen: boolean;
  readonly pushStatus: PushStatus | null;
  readonly selectedTemplateId: string;
  readonly selectedRemote: string;
  readonly customVariables: Record<string, string>;
  readonly availableTemplates: readonly PromptTemplate[];
  readonly options: PushOptions;
  readonly status: 'idle' | 'loading' | 'pushing' | 'success' | 'error';
  readonly sessionId: string | null;
  readonly result: PushResult | null;
  readonly error: string | null;
}

interface PushOptions {
  readonly setUpstream: boolean;
  readonly pushTags: boolean;
  readonly force: boolean;
}

interface PushActions {
  open(): Promise<void>;
  close(): void;
  refreshStatus(): Promise<void>;
  selectTemplate(id: string): void;
  selectRemote(name: string): void;
  setOption(key: keyof PushOptions, value: boolean): void;
  setVariable(name: string, value: string): void;
  push(): Promise<void>;
  cancel(): void;
}
```

### PR Store

```typescript
// client/stores/pr.ts

interface PRState {
  readonly isOpen: boolean;
  readonly prStatus: BranchPRStatus | null;
  readonly selectedTemplateId: string;
  readonly baseBranch: string;
  readonly availableBaseBranches: readonly string[];
  readonly customVariables: Record<string, string>;
  readonly availableTemplates: readonly PromptTemplate[];
  readonly options: PROptions;
  readonly status: 'idle' | 'loading' | 'creating' | 'success' | 'error';
  readonly sessionId: string | null;
  readonly result: PRResult | null;
  readonly error: string | null;
  readonly authStatus: GitHubAuthStatus | null;
}

interface PROptions {
  readonly draft: boolean;
  readonly labels: readonly string[];
  readonly reviewers: readonly string[];
  readonly assignees: readonly string[];
}

interface GitHubAuthStatus {
  readonly authenticated: boolean;
  readonly method: 'env' | 'gh-cli' | 'none';
  readonly user: GitHubUser | null;
  readonly ghCliAvailable: boolean;
}

interface PRActions {
  open(): Promise<void>;
  close(): void;
  refreshStatus(): Promise<void>;
  checkAuth(): Promise<void>;
  selectTemplate(id: string): void;
  setBaseBranch(branch: string): void;
  setOption<K extends keyof PROptions>(key: K, value: PROptions[K]): void;
  addLabel(label: string): void;
  removeLabel(label: string): void;
  addReviewer(reviewer: string): void;
  removeReviewer(reviewer: string): void;
  setVariable(name: string, value: string): void;
  createPR(): Promise<void>;
  updatePR(): Promise<void>;
  cancel(): void;
  openInGitHub(): void;
}
```

## Component Hierarchy

### Commit Components

```
CommitButton.svelte
+-- CommitBadge.svelte (shows staged count)

CommitPanel.svelte (bottom sheet)
+-- CommitHeader.svelte
+-- StagedFilesList.svelte
|   +-- StagedFileItem.svelte (repeated)
+-- PromptTemplateSelector.svelte
|   +-- TemplateOption.svelte (repeated)
+-- VariableInputs.svelte
|   +-- VariableField.svelte (repeated)
+-- PromptPreview.svelte (collapsible)
+-- CommitActions.svelte
    +-- CommitButton.svelte
    +-- CancelButton.svelte

CommitProgress.svelte
+-- ProgressBar.svelte
+-- StatusMessages.svelte

CommitSuccess.svelte
+-- CommitDetails.svelte
+-- PostCommitActions.svelte
```

### Push Components

```
PushButton.svelte
+-- PushBadge.svelte (shows unpushed count)
+-- PushWarningIndicator.svelte (when behind remote)

PushPanel.svelte (bottom sheet)
+-- PushHeader.svelte
+-- RemoteSelector.svelte
+-- PushStatusDisplay.svelte
|   +-- AheadBehindIndicator.svelte
+-- UnpushedCommitsList.svelte
|   +-- UnpushedCommitItem.svelte (repeated)
+-- PromptTemplateSelector.svelte (shared)
+-- PushOptions.svelte
|   +-- OptionCheckbox.svelte (repeated)
+-- PushActions.svelte
    +-- PushButton.svelte
    +-- CancelButton.svelte

PushBehindWarning.svelte
+-- WarningMessage.svelte
+-- PullOptions.svelte

PushProgress.svelte
+-- ProgressBar.svelte
+-- StatusMessages.svelte

PushSuccess.svelte
+-- PushedCommitsList.svelte
+-- PostPushActions.svelte
    +-- ViewOnGitHubButton.svelte
    +-- CreatePRButton.svelte
```

### PR Components

```
PRButton.svelte
+-- PRBadge.svelte (shows PR number or "Create PR")
+-- PRStateIndicator.svelte (open/closed/merged color)

PRCreatePanel.svelte (bottom sheet)
+-- PRHeader.svelte
+-- GitHubAuthStatus.svelte
+-- BaseBranchSelector.svelte
+-- CommitsList.svelte
|   +-- CommitItem.svelte (repeated)
+-- PromptTemplateSelector.svelte (shared)
+-- PROptions.svelte
|   +-- DraftToggle.svelte
|   +-- LabelSelector.svelte
|   +-- ReviewerSelector.svelte
+-- PRActions.svelte
    +-- CreatePRButton.svelte
    +-- CancelButton.svelte

PRStatusPanel.svelte (bottom sheet, for existing PR)
+-- PRHeader.svelte
+-- PRInfo.svelte
|   +-- PRStateLabel.svelte
|   +-- PRMetadata.svelte
+-- NewCommitsList.svelte
+-- PRStatusActions.svelte
    +-- ViewOnGitHubButton.svelte
    +-- UpdatePRButton.svelte
    +-- PushButton.svelte

PRProgress.svelte
+-- ProgressBar.svelte
+-- StatusMessages.svelte

PRSuccess.svelte
+-- PRDetails.svelte
+-- PRLink.svelte
+-- PostPRActions.svelte

GitHubAuthRequired.svelte
+-- AuthInstructions.svelte
+-- CheckAuthButton.svelte
```

## Keyboard Shortcuts

### Commit Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Execute commit (when panel open) |
| `Escape` | Cancel/close panel |
| `Cmd/Ctrl + Shift + C` | Open commit panel |

### Push Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Execute push (when panel open) |
| `Escape` | Cancel/close panel |
| `Cmd/Ctrl + Shift + P` | Open push panel |

### PR Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Create/update PR (when panel open) |
| `Escape` | Cancel/close panel |
| `Cmd/Ctrl + Shift + R` | Open PR panel |
| `Cmd/Ctrl + Shift + G` | Open PR in GitHub (if exists) |

## Implementation Phases

### Phase 1: Prompt System

| Task | Description |
|------|-------------|
| AC-001 | Create prompt types in `src/types/prompt-config.ts` |
| AC-002 | Implement prompt loader |
| AC-003 | Create default prompt templates |
| AC-004 | Implement prompt builder with templating |

### Phase 2: Commit Backend

| Task | Description |
|------|-------------|
| AC-005 | Implement staged files detection |
| AC-006 | Create commit context builder |
| AC-007 | Implement commit executor with AI session |
| AC-008 | Add prompt API routes |
| AC-009 | Add commit API routes |

### Phase 3: Client Integration

| Task | Description |
|------|-------------|
| AC-010 | Create commit store |
| AC-011 | Add commit API client |
| AC-012 | Integrate with session queue |

### Phase 4: UI Components

| Task | Description |
|------|-------------|
| AC-013 | Create CommitButton component |
| AC-014 | Create CommitPanel bottom sheet |
| AC-015 | Create StagedFilesList |
| AC-016 | Create PromptTemplateSelector |
| AC-017 | Create VariableInputs |
| AC-018 | Create CommitProgress view |
| AC-019 | Create CommitSuccess view |

### Phase 5: Push Backend

| Task | Description |
|------|-------------|
| AP-001 | Implement push status detection |
| AP-002 | Implement remote listing |
| AP-003 | Create push context builder |
| AP-004 | Implement push executor with AI session |
| AP-005 | Add push API routes |
| AP-006 | Create default push prompt templates |

### Phase 6: Push Client Integration

| Task | Description |
|------|-------------|
| AP-007 | Create push store |
| AP-008 | Add push API client |
| AP-009 | Integrate with session queue |

### Phase 7: Push UI Components

| Task | Description |
|------|-------------|
| AP-010 | Create PushButton component |
| AP-011 | Create PushPanel bottom sheet |
| AP-012 | Create UnpushedCommitsList |
| AP-013 | Create RemoteSelector |
| AP-014 | Create PushOptions |
| AP-015 | Create PushBehindWarning |
| AP-016 | Create PushProgress view |
| AP-017 | Create PushSuccess view |

### Phase 8: GitHub Auth & PR Backend

| Task | Description |
|------|-------------|
| PR-001 | Add @octokit/rest and @octokit/auth-token dependencies |
| PR-002 | Implement GitHub auth detection (env + gh CLI fallback) |
| PR-003 | Create Octokit client factory |
| PR-004 | Create GitHub service with Octokit |
| PR-005 | Implement PR status detection |
| PR-006 | Create PR context builder |
| PR-007 | Implement PR executor with AI session |
| PR-008 | Add PR API routes |
| PR-009 | Create default PR prompt templates |

### Phase 9: PR Client Integration

| Task | Description |
|------|-------------|
| PR-010 | Create PR store |
| PR-011 | Add PR API client |
| PR-012 | Integrate with session queue |

### Phase 10: PR UI Components

| Task | Description |
|------|-------------|
| PR-013 | Create PRButton component |
| PR-014 | Create PRCreatePanel |
| PR-015 | Create PRStatusPanel |
| PR-016 | Create BaseBranchSelector |
| PR-017 | Create LabelSelector and ReviewerSelector |
| PR-018 | Create GitHubAuthRequired view |
| PR-019 | Create PRProgress view |
| PR-020 | Create PRSuccess view |

### Phase 11: Polish

| Task | Description |
|------|-------------|
| AC-020 | Add keyboard shortcuts (commit, push, PR) |
| AC-021 | Add touch gestures |
| AC-022 | Implement prompt file watching |
| AC-023 | Add template customization UI |
| PR-021 | Add "View on GitHub" integration |
| PR-022 | Add deep link handling |

## Error Handling

### Commit Errors

| Scenario | Handling |
|----------|----------|
| No staged changes | Disable button, show tooltip |
| Template not found | Fall back to default |
| Template parse error | Show error, use raw template |
| AI session failure | Show error, allow retry |
| Git commit failure | Show error from git |
| Network error | Queue for retry, show offline state |

### Push Errors

| Scenario | Handling |
|----------|----------|
| No unpushed commits | Disable button, show tooltip |
| No remote configured | Show setup remote dialog |
| Behind remote | Show warning, suggest pull first |
| Push rejected | Show rejection reason, suggest force or pull |
| Authentication failure | Show auth error, guide to fix |
| Network error | Queue for retry, show offline state |
| Force push to protected | Block with clear message |

### PR Errors

| Scenario | Handling |
|----------|----------|
| Not authenticated | Show auth required dialog |
| gh CLI not available | Show installation instructions |
| PR already exists | Show existing PR, offer update |
| Branch not pushed | Prompt to push first |
| No commits to PR | Show "nothing to compare" |
| Rate limit exceeded | Show wait message, retry later |
| Repository not found | Check remote URL, show error |
| Permission denied | Show permission error, guide to fix |

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Prompt injection | Sanitize template variables |
| Config file tampering | Validate frontmatter schema |
| Sensitive data in prompts | Warn about including secrets |

## Future Enhancements

### Commit Enhancements

| Enhancement | Description |
|-------------|-------------|
| Commit amend | Support for `git commit --amend` |
| Interactive staging | Stage/unstage individual hunks |
| Commit signing | GPG signing support |
| Pre-commit hooks | Show hook status and output |
| Commit templates history | Remember recent custom prompts |

### Push Enhancements

| Enhancement | Description |
|-------------|-------------|
| Multi-remote push | Push to multiple remotes at once |
| Selective commit push | Choose which commits to push |
| Auto-PR creation | Automatically create PR after push |
| Push hooks | Pre-push validation and checks |
| Push scheduling | Schedule push for later |
| CI status integration | Show CI status before push |

### PR Enhancements

| Enhancement | Description |
|-------------|-------------|
| PR templates | Use repo's PR template |
| CI status display | Show CI checks in PR panel |
| Review status | Show review approval status |
| Merge PR | Merge from qraftbox UI |
| PR comments | View/reply to PR comments |
| Multi-repo PRs | Create PRs across repos |
| PR chaining | Create dependent PRs |
| Auto-merge | Enable auto-merge on CI pass |

## References

See `design-docs/references/README.md` for:
- Conventional Commits specification
- Handlebars templating syntax
- Claude Code agent API

### Octokit Documentation

| Resource | URL |
|----------|-----|
| @octokit/rest | https://github.com/octokit/rest.js |
| API Reference | https://octokit.github.io/rest.js |
| Authentication | https://github.com/octokit/auth-token.js |
| GitHub REST API | https://docs.github.com/en/rest |

### Key Octokit Endpoints Used

| Operation | Octokit Method |
|-----------|----------------|
| Create PR | `octokit.pulls.create()` |
| Update PR | `octokit.pulls.update()` |
| List PRs | `octokit.pulls.list()` |
| Get PR | `octokit.pulls.get()` |
| Add labels | `octokit.issues.addLabels()` |
| Request reviewers | `octokit.pulls.requestReviewers()` |
| Get repo | `octokit.repos.get()` |
| List branches | `octokit.repos.listBranches()` |
| Compare branches | `octokit.repos.compareCommits()` |
| Get user | `octokit.users.getAuthenticated()` |
