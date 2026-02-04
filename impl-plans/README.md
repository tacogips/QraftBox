# Implementation Plans

This directory contains implementation plans that translate design documents into actionable implementation specifications.

## Purpose

Implementation plans bridge design documents (what to build) and actual code (how to build). They provide:
- Clear deliverables without code
- Interface and function specifications
- Dependency mapping for concurrent execution
- Progress tracking across sessions

## Directory Structure

```
impl-plans/
├── README.md              # This file
├── PROGRESS.json          # Task status index (CRITICAL for impl-exec-auto)
├── active/                # Currently active implementation plans
│   └── <feature>.md       # One file per feature being implemented
├── completed/             # Completed implementation plans (archive)
│   └── <feature>.md       # Completed plans for reference
└── templates/             # Plan templates
    └── plan-template.md   # Standard plan template
```

## PROGRESS.json (Task Status Index)

**CRITICAL**: `PROGRESS.json` is the central task status index used by `impl-exec-auto`.

Reading all plan files at once causes context overflow (>200K tokens). Instead:
1. `impl-exec-auto` reads only `PROGRESS.json` (~2K tokens)
2. Identifies executable tasks from this index
3. Reads specific plan files only when executing tasks
4. Updates BOTH the plan file AND `PROGRESS.json` after each task

### Structure

```json
{
  "lastUpdated": "2026-01-06T16:00:00Z",
  "phases": {
    "1": { "status": "COMPLETED" },
    "2": { "status": "READY" }
  },
  "plans": {
    "plan-name": {
      "phase": 2,
      "status": "Ready",
      "tasks": {
        "TASK-001": { "status": "Not Started", "parallelizable": true, "deps": [] },
        "TASK-002": { "status": "Completed", "parallelizable": true, "deps": [] }
      }
    }
  }
}
```

### Keeping PROGRESS.json in Sync

After ANY task status change:
1. Edit the task status in `PROGRESS.json`
2. Update `lastUpdated` timestamp
3. Edit the task status in the plan file

## File Size Limits

**IMPORTANT**: Implementation plan files must stay under 400 lines to prevent OOM errors.

| Metric | Limit |
|--------|-------|
| Line count | MAX 400 lines |
| Modules per plan | MAX 8 modules |
| Tasks per plan | MAX 10 tasks |

Large features are split into multiple related plans with cross-references.

## Active Plans

| Plan | Phase | Status | Design Reference | Last Updated |
|------|-------|--------|------------------|--------------|
| 05-git-xnotes | 2 | Ready | design-local-diff-viewer.md#comment-system | 2026-02-03 |
| 06-file-watcher | 2 | Ready | design-local-diff-viewer.md#file-watching | 2026-02-03 |
| 07-client-core | 2 | Ready | design-local-diff-viewer.md#ui-design | 2026-02-03 |
| 08-diff-view | 2b | Ready | design-local-diff-viewer.md#github-style-diff-view | 2026-02-03 |
| 09-current-state-view | 3 | Ready | design-local-diff-viewer.md#current-state-view | 2026-02-03 |
| 10-file-tree | 2b | Ready | design-local-diff-viewer.md#file-tree | 2026-02-03 |
| 11-comment-ui | 3 | Ready | design-local-diff-viewer.md#comment-system | 2026-02-03 |
| 12-ai-integration | 4 | Ready | design-local-diff-viewer.md#ai-agent-integration | 2026-02-03 |
| 13-session-queue | 4 | Ready | design-local-diff-viewer.md#session-queue-screen | 2026-02-03 |
| 14-search | 3 | Ready | design-local-diff-viewer.md#search-functionality | 2026-02-03 |
| 15-branch-switching | 2 | Ready | design-local-diff-viewer.md#branch-switching | 2026-02-03 |

**Note**: 15-branch-switching has mixed phases - server tasks (1-3) are Phase 2, client tasks (4-7) require 07-client-core and should wait for Phase 2b.

## Completed Plans

| Plan | Completed | Design Reference |
|------|-----------|------------------|
| 01-cli-layer | 2026-02-03 | design-local-diff-viewer.md#cli-interface |
| 02-server-core | 2026-02-03 | design-local-diff-viewer.md#architecture-overview |
| 03-git-operations | 2026-02-03 | design-local-diff-viewer.md#data-models |
| 04-api-routes | 2026-02-03 | design-local-diff-viewer.md#api-design |

## Phase Dependencies (for impl-exec-auto)

**IMPORTANT**: This section is used by impl-exec-auto to determine which plans to load.
Only plans from eligible phases should be read to minimize context loading.

### Phase Status

| Phase | Status | Description | Depends On |
|-------|--------|-------------|------------|
| 1 | COMPLETED | Foundation - CLI, Server, Git Operations, API Routes | - |
| 2 | READY | Server-side (git-xnotes, file-watcher, branch server) + Client Core Setup | Phase 1 |
| 2b | BLOCKED | Client UI - Diff View, File Tree, Branch UI (requires 07-client-core) | Phase 2 |
| 3 | BLOCKED | Advanced Features - Current State View, Comments UI, Search | Phase 2b |
| 4 | BLOCKED | AI Integration - AI Agent, Session Queue | Phase 3 |

### Phase to Plans Mapping

```
PHASE_TO_PLANS = {
  1: [
    "01-cli-layer.md",        # COMPLETED
    "02-server-core.md",      # COMPLETED
    "03-git-operations.md",   # COMPLETED
    "04-api-routes.md"        # COMPLETED
  ],
  2: [
    "05-git-xnotes.md",       # Server-side comment integration
    "06-file-watcher.md",     # Server-side file watching
    "07-client-core.md",      # CRITICAL: Client infrastructure
    "15-branch-switching.md"  # Tasks 1-3 only (server-side)
  ],
  "2b": [
    "08-diff-view.md",        # Requires 07-client-core
    "10-file-tree.md",        # Requires 07-client-core
    "15-branch-switching.md"  # Tasks 4-7 only (client-side)
  ],
  3: [
    "09-current-state-view.md",
    "11-comment-ui.md",
    "14-search.md"
  ],
  4: [
    "12-ai-integration.md",
    "13-session-queue.md"
  ]
}
```

### Cross-Plan Dependencies (NEW)

Plans can have `planDeps` field in PROGRESS.json indicating which other plans must be completed before starting:

```json
{
  "08-diff-view": {
    "planDeps": ["07-client-core"],  // Cannot start until 07-client-core is Completed
    ...
  }
}
```

Tasks can also have `crossPlanDeps` to indicate specific task-level cross-plan dependencies:

```json
{
  "TASK-004": {
    "crossPlanDeps": ["07-client-core"],  // This task needs 07-client-core
    ...
  }
}
```

## Workflow

### Creating a New Plan

1. Use the `/impl-plan` command with a design document reference
2. Or manually create a plan using `templates/plan-template.md`
3. Save to `active/<feature-name>.md`
4. Update this README with the new plan entry
5. **IMPORTANT**: Update `PROGRESS.json` with the new plan and its tasks
6. **IMPORTANT**: If plan exceeds 400 lines, split into multiple files

### Working on a Plan

1. Read `PROGRESS.json` to check task status
2. Read the active plan for task details
3. Select a subtask to work on (consider dependencies)
4. Implement following the deliverable specifications
5. Update task status in BOTH the plan file AND `PROGRESS.json`
6. Mark completion criteria as done

### Completing a Plan

1. Verify all completion criteria are met
2. Update status to "Completed" in both plan and PROGRESS.json
3. Move file from `active/` to `completed/`
4. Update this README
5. Update PROGRESS.json (remove or mark plan as completed)

## Guidelines

- Plans contain NO implementation code
- Plans specify interfaces, functions, and file structures
- Subtasks should be as independent as possible for parallel execution
- Always update progress log after each session
- **Keep each plan file under 400 lines** - split if necessary
- **Always keep PROGRESS.json in sync** with plan file statuses
