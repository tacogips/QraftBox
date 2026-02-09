# Design Notes

This document contains research findings, investigations, and miscellaneous design notes.

## Overview

Notable items that do not fit into architecture or client categories.

---

## Sections

### Commit Log Viewer (Phase 5)

A new feature to browse git commit history and view diffs for individual commits.

**Design Document**: See `design-commit-log-viewer.md` for full specification.

**Key Features**:
- Commit log list displayed below file tree
- Click commit to view changed files and diff
- Search commits by message/author
- Pagination for large repositories
- Integration with existing file tree and diff view components

**Status**: Implemented (plan 16 completed, code merged).

### Multi-Directory Workspace (Phase 6)

A feature to work on multiple git repositories simultaneously with tab-based UI.

**Design Document**: See `design-multi-directory-workspace.md` for full specification.

**Key Features**:
- Tab-based interface for multiple directories
- Dynamic directory switching (not fixed at startup)
- iPad-friendly directory picker with touch gestures
- Recent directories and bookmarks
- Isolated state per tab (file tree, diff, commits)
- Context-scoped API routes

**Status**: Implemented (plan 17 completed, code merged).

### AI-Powered Git Operations (Phase 7-11)

Execute git operations (Commit, Push, PR) using Claude Code agent with customizable prompts.

**Design Document**: See `design-ai-commit.md` for full specification.

**Key Features**:

**Commit**:
- Commit button in UI toolbar
- Customizable commit prompts (standard, conventional, detailed, minimal)

**Push**:
- Push button showing unpushed commit count
- Remote/branch selection
- Force push with confirmation

**Pull Request**:
- Create PR via GitHub CLI (gh)
- Show existing PR status (number, state, base branch)
- Update existing PR
- GitHub authentication via GITHUB_TOKEN or `gh auth`

**Prompt Location**: `~/.config/qraftbox/default-prompts/`
- `commit.md`, `commit-*.md` - Commit prompts
- `push.md`, `push-*.md` - Push prompts
- `pr.md`, `pr-*.md` - PR prompts

**Status**: Implemented (plans 18-23 completed, code merged).

---
