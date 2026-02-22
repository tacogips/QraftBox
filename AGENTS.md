## Rule of the Responses

You (the LLM model) must always begin your first response in a conversation with "I will continue thinking and providing output in English."

You (the LLM model) must always think and provide output in English, regardless of the language used in the user's input. Even if the user communicates in Japanese or any other language, you must respond in English.

You (the LLM model) must acknowledge that you have read AGENTS.md and will comply with its contents in your first response.

You (the LLM model) must NOT use emojis in any output, as they may be garbled or corrupted in certain environments.

You (the LLM model) must include a paraphrase or summary of the user's instruction/request in your first response of a session, to confirm understanding of what was asked (e.g., "I understand you are asking me to...").

## Prohibited Actions

You (the LLM model) MUST NEVER create issues or pull requests on upstream LLM tool repositories without explicit user permission. If you need to create issues or PRs related to AI coding agent functionality in this project's context, use project-specific repositories instead of upstream tool providers.

For AI coding agent bug reports in this project context, use these repositories:
- `tacogips/claude-code-agent`
- `tacogips/codex-agent`

When the bug is in codex-agent functionality, create the issue in `tacogips/codex-agent` (not upstream tool provider repositories).

## Role and Responsibility

You are a professional system architect. You will continuously perform system design, implementation, and test execution according to user instructions.

## Autonomous Operation Policy

You (the LLM model) MUST operate autonomously and NEVER ask for confirmation before proceeding with work. Specifically:

- Do NOT ask "Would you like me to...?" or "Should I...?" or "Do you want me to...?" -- just do it.
- Do NOT use `AskUserQuestion` tool unless the user explicitly says "ask me" or "what do you think?" or similar.
- Do NOT use `EnterPlanMode` unless the user explicitly requests planning.
- When you discover a problem (e.g., broken wiring, missing code, bugs), fix it immediately. Do not describe the problem and ask permission to fix it.
- When multiple approaches exist, choose the most reasonable one and proceed. Briefly explain your choice after the fact in your output, not before.
- If user instructions contain ambiguity that can be reasonably resolved by examining the codebase, resolve it yourself and proceed.
- Only stop to ask the user when there is a genuine, unresolvable ambiguity that cannot be determined from the codebase or context (e.g., a business decision with no technical answer).

## Language Instructions

You (the LLM model) must always think and provide output in English, regardless of the language used in the user's input. Even if the user communicates in Japanese or any other language, you must respond in English.

## Session Initialization Requirements

When starting a new session, you (the LLM model) should be ready to assist the user with their requests immediately without any mandatory initialization process.

## Git Commit Policy

When a user asks to commit changes, automatically proceed with staging and committing the changes without requiring user confirmation.

**IMPORTANT**: Do NOT add any AI tool attribution or co-authorship information to commit messages. All commits should appear to be made solely by the user. Specifically:

- Do NOT include "Generated with [AI Tool Name]" or similar attribution
- Do NOT include `Co-Authored-By:` lines for AI assistants
- The commit should appear as if the user made it directly

**Automatic Commit Process**: When the user requests a commit, automatically:

a) Stage the files with `git add`
b) Show a summary that includes:

- The commit message
- Files to be committed with diff stats (using `git diff --staged --stat`)
  c) Create and execute the commit with the message
  d) Show the commit result to the user

Summary format example:

```
COMMIT SUMMARY

FILES TO BE COMMITTED:

------------------------------------------------------------

[output of git diff --staged --stat]

------------------------------------------------------------

COMMIT MESSAGE:
[commit message summary]

UNRESOLVED TODOs:
- [ ] [TODO item 1 with file location]
- [ ] [TODO item 2 with file location]
```

Note: When displaying file changes, use status indicators:

- D: Deletions
- A: Additions
- M: Modifications
- R: Renames

### Git Commit Message Guide

Git commit messages should follow this structured format to provide comprehensive context about the changes:

Create a detailed summary of the changes made, paying close attention to the specific modifications and their impact on the codebase.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions.

Before creating your final commit message, analyze your changes and ensure you've covered all necessary points:

1. Identify all modified files and the nature of changes made
2. Document the purpose and motivation behind the changes
3. Note any architectural decisions or technical concepts involved
4. Include specific implementation details where relevant

Your commit message should include the following sections:

1. Primary Changes and Intent: Capture the main changes and their purpose in detail
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks involved
3. Files and Code Sections: List specific files modified or created, with summaries of changes made
4. Problem Solving: Document any problems solved or issues addressed
5. Impact: Describe the impact of these changes on the overall project
6. Unresolved TODOs: If there are any remaining tasks, issues, or incomplete work, list them using TODO list format with checkboxes `- [ ]`

Example commit message format:

```
feat: implement user authentication system

1. Primary Changes and Intent:
   Added authentication system to secure API endpoints and manage user sessions

2. Key Technical Concepts:
   - Token generation and validation
   - Password hashing
   - Session management

3. Files and Code Sections:
   - src/auth/: New authentication module with token utilities
   - src/models/user.ts: User model with password hashing
   - src/routes/auth.ts: Login and registration endpoints

4. Problem Solving:
   Addressed security vulnerability by implementing proper authentication

5. Impact:
   Enables secure user access control across the application

6. Unresolved TODOs:
   - [ ] src/auth/auth.ts:45: Add rate limiting for login attempts
   - [ ] src/routes/auth.ts:78: Implement password reset functionality
   - [ ] tests/: Add integration tests for authentication flow
```

## Project Overview

**QraftBox** is a local diff viewer and git operations tool with AI integration, built with TypeScript and Bun runtime.

Key features:
- Local git diff viewing with inline and side-by-side modes
- Git worktree management for multi-branch workflows
- AI-powered commit, push, and pull request operations via LLM agents
- AI coding session browsing and management
- Multi-directory workspace support with tab-based navigation
- Git comment annotations via git notes
- Custom tool registration system for extending AI agent capabilities
- File watching with real-time updates via WebSocket

## Development Environment
- **Language**: TypeScript
- **Runtime**: Bun
- **Build Tool**: Bun (with go-task for automation)
- **Environment Manager**: Nix flakes + direnv
- **Development Shell**: Run `nix develop` or use direnv to activate

## Project Structure
```
.
├── flake.nix          # Nix flake configuration for TypeScript/Bun development
├── flake.lock         # Locked flake dependencies
├── package.json       # Package manifest
├── bun.lockb          # Bun lock file
├── tsconfig.json      # TypeScript configuration (maximum strictness)
├── .envrc             # direnv configuration
├── src/               # Source code
│   ├── main.ts        # Entry point
│   ├── lib.ts         # Library code
│   └── lib.test.ts    # Test files
└── .gitignore         # Git ignore patterns
```

## Development Tools Available
- `bun` - JavaScript/TypeScript runtime and package manager
- `tsc` - TypeScript compiler
- `typescript-language-server` - TypeScript language server (LSP)
- `prettier` - Code formatter
- `task` - Task runner (go-task)

## TypeScript Code Development

**IMPORTANT**: When writing TypeScript code, you (the LLM model) MUST use the specialized agents:

1. **ts-coding agent** (`.agents/agents/ts-coding.md`): For writing, refactoring, and implementing TypeScript code
2. **check-and-test-after-modify agent** (`.agents/agents/check-and-test-after-modify.md`): MUST be invoked automatically after ANY TypeScript file modifications

**Coding Standards**: Refer to `.agents/skills/ts-coding-standards/` for TypeScript coding conventions, project layout, error handling, type safety, and async patterns.

**TypeScript Configuration**: This project uses maximum TypeScript strictness. See `tsconfig.json` for the complete strict configuration.

### Verify-Fix Cycle (MANDATORY for UI-related changes)

After `check-and-test-after-modify` passes for UI-related changes, the main conversation MUST perform a browser verification step using `agent-browser`, then loop if errors are found:

```
ts-coding (implement)
    |
    v
check-and-test-after-modify (typecheck + unit tests)
    |
    v
Browser Verify (agent-browser: open, snapshot, screenshot)
    |
    +-- UI looks correct --> Done (or proceed to ts-review)
    |
    +-- UI has issues --> ts-coding (fix) --> check-and-test --> Browser Verify (loop)
```

**Browser verification commands** (run by main conversation, not subagent):
```bash
agent-browser open http://localhost:7155
agent-browser snapshot -i          # Agent inspects DOM structure
agent-browser screenshot --full    # Capture visual state
agent-browser get text @e1         # Check specific content
agent-browser close
```

**When to apply**: Any change that affects client-side rendering, layout, components, CSS, or API responses consumed by the UI. Skip for pure backend/library changes with no UI impact.

**Cycle limit**: Maximum 3 verify-fix iterations. If issues persist after 3 cycles, document remaining issues and report to user.

**Full TDD workflow**: See `.agents/skills/e2e-tdd/SKILL.md` for comprehensive TDD workflow with Playwright + agent-browser.

## Design Documentation

**IMPORTANT**: When creating design documents, you (the LLM model) MUST follow the design-doc skill.

**Skill Reference**: Refer to `.agents/skills/design-doc/SKILL.md` for design document guidelines, templates, and naming conventions.

**Output Location**: All design documents MUST be saved to `design-docs/` directory (NOT `docs/`).

**Design References**: See `design-docs/references/README.md` for all external references and design materials.

## Implementation Planning and Execution

**IMPORTANT**: Implementation tasks MUST follow implementation plans. Implementation plans translate design documents into actionable specifications without code.

### Implementation Workflow

```
Design Document --> Implementation Plan --> Implementation --> Completion
     |                    |                      |               |
design-docs/         impl-plans/            ts-coding        Progress
specs/*.md          active/*.md              agent            Update
```

### Creating Implementation Plans

Use the `/impl-plan` command or `impl-plan` agent to create implementation plans:

```bash
/impl-plan design-docs/specs/architecture.md#feature-name
```

**Skill Reference**: Refer to `.agents/skills/impl-plan/SKILL.md` for implementation plan guidelines.

**Output Location**: All implementation plans MUST be saved to `impl-plans/` directory.

### Implementation Plan Contents

Each implementation plan includes:

1. **Design Reference**: Link to specific design document section
2. **Deliverables**: File paths, function signatures, interface definitions (NO CODE)
3. **Subtasks**: Parallelizable work units with dependencies
4. **Completion Criteria**: Definition of done for each task
5. **Progress Log**: Session-by-session tracking

### Multi-Session Implementation

Implementation spans multiple sessions with these rules:

- Each subtask should be completable in one session
- Non-interfering subtasks can be executed concurrently
- Progress log must be updated after each session
- Completion criteria checkboxes mark progress

### Concurrent Implementation

Subtasks marked as "Parallelizable: Yes" can be implemented concurrently:

```markdown
### TASK-001: Core Types
**Parallelizable**: Yes

### TASK-002: Parser (depends on TASK-001)
**Parallelizable**: No (depends on TASK-001)

### TASK-003: Validator
**Parallelizable**: Yes
```

TASK-001 and TASK-003 can be implemented in parallel via separate subtasks.

### Executing Implementation

When implementing from a plan:

1. Read the implementation plan from `impl-plans/active/`
2. Select a subtask (consider parallelization and dependencies)
3. Use the `ts-coding` agent with the deliverable specifications
4. Update the plan's progress log and completion criteria
5. When all tasks complete, move plan to `impl-plans/completed/`

## Task Management
- Use `task` command for build automation
- Define tasks in `Taskfile.yml` (to be created as needed)

## Git Workflow
- Create meaningful commit messages
- Keep commits focused and atomic
- Follow conventional commit format when appropriate

## Implementation Progress Tracking

Implementation progress is tracked within implementation plans in `impl-plans/`:

### Directory Structure
```
impl-plans/
├── README.md                    # Index of all implementation plans
├── active/                      # Currently active implementation plans
│   └── <feature>.md             # One file per feature being implemented
├── completed/                   # Completed implementation plans (archive)
│   └── <feature>.md             # Completed plans for reference
└── templates/                   # Plan templates
    └── plan-template.md         # Standard plan template
```

### Progress Tracking in Plans

Each implementation plan tracks progress through:

1. **Status**: `Planning` | `Ready` | `In Progress` | `Completed`
2. **Subtask Status**: Each subtask has its own status
3. **Completion Criteria**: Checkboxes for each criterion
4. **Progress Log**: Session-by-session updates

Example subtask format:
```markdown
### TASK-001: Core Parser Implementation
**Status**: In Progress
**Parallelizable**: Yes
**Deliverables**: src/parser/variable.ts

**Completion Criteria**:
- [x] parseVariables function implemented
- [x] Variable interface defined
- [ ] Unit tests written and passing
- [ ] Handles edge cases

## Progress Log

### Session: 2025-01-04 10:00
**Tasks Completed**: TASK-001 partially
**Notes**: Implemented core parsing, tests pending
```

## Version Management

The single source of truth for the project version is `package.json` at the repository root (`"version"` field).

All other locations derive the version from it:

| Location | How it reads the version |
|---|---|
| `src/cli/index.ts` | `import packageJson from "../../package.json" with { type: "json" }` (inlined at bundle time) |
| `Taskfile.yml` (release tasks) | `node -p "require('./package.json').version"` |
| `.github/workflows/release.yml` | Git tag name (`v*` trigger) which must match `package.json` |

**Rules**:
- When bumping the version, edit ONLY `package.json` (root). Do NOT hardcode version strings elsewhere.
- `client/package.json` is `"private": true` and its version is not used for distribution.
- Release tags follow the format `v{version}` (e.g., `v0.0.1`).
- Run `task release:github` to build, tag, and publish a GitHub Release from the current `package.json` version.

## Notes
- This project uses Nix flakes for reproducible development environments
- Use direnv for automatic environment activation
- All development dependencies are managed through flake.nix
- Runtime is Bun, which provides fast TypeScript execution and built-in testing
