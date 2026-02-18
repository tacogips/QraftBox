# Architecture

This document describes the current as-built architecture of QraftBox based on the repository state as of 2026-02-17.

## Overview

QraftBox is a local-first diff viewer and git operations tool. It runs a Bun-based HTTP server with WebSocket support, serves a Svelte 5 SPA, and executes git/AI/terminal operations on the local machine. The system is intentionally single-user and assumes localhost-only access.

## Runtime Topology

- CLI entrypoint: `src/main.ts` -> `src/cli/index.ts`
- HTTP server: Hono app in `src/server/index.ts`
- WebSocket endpoints:
  - `ws://<host>:<port>/ws` for realtime events
  - `ws://<host>:<port>/ws/terminal/<sessionId>` for terminal sessions
- Client SPA: built from `client/` and served via static middleware

## Server Architecture

### Core Server

- Hono app created by `createServer` with error handling and request logging.
- Static middleware serves client assets; SPA fallback handles client routing.
- Context-scoped routes are mounted under `/api/ctx/:contextId/*` via `contextMiddleware`.

### Workspace & Contexts

- `ContextManager` creates and manages workspace contexts (tabs) and validates directories.
- Recent directories are persisted via SQLite in `~/.local/QraftBox/recent.db`.
- Open tabs state is persisted via SQLite in `~/.local/QraftBox/open-tabs.db`.

### Git Operations

- Diff, file tree, status, branch, worktree, commit log, push, staged file operations live in `src/server/git/`.
- Comment system uses git notes via `src/server/comments/` (git-xnotes style).
- Binary/large-file detection is handled in `src/server/git/binary.ts` and reflected in file APIs.

### AI & Prompting

- AI sessions are orchestrated by `SessionManager` (`src/server/ai/`).
- Session metadata is persisted in SQLite (`~/.local/QraftBox/ai-sessions.db`).
- Session mappings (qraft_ai_session_id <-> claude_session_id) are persisted in SQLite (`~/.local/QraftBox/session-mappings.db`).
- Prompt queue is persisted in JSON files under `~/.local/QraftBox/prompts/`.
- AI execution integrates with `claude-code-agent` via `AgentRunner`.

### Tools System

- Tool registry (`src/server/tools/registry.ts`) aggregates built-in and plugin tools.
- Built-in tools live under `src/server/tools/builtin/`.
- Plugin tools are loaded from JSON definitions in `~/.config/qraftbox/tools/`.

### Terminal

- Terminal sessions are managed by `TerminalSessionManager` (`src/server/terminal/`).
- Each session spawns a local shell (`$SHELL` or `bash`) and streams output over WebSocket.

### File Watching & Realtime

- Project file watching is managed by `ProjectWatcherManager`.
- Gitignore-aware watcher and debounced broadcast send events over WebSocket.

### Model Config

- Model profiles and operation bindings are stored in SQLite (`~/.local/QraftBox/model-config.db`).

## Client Architecture

- Svelte 5 SPA built with Vite and Tailwind (`client/`).
- `client/src/App.svelte` is the screen router and state hub using `$state` and `$derived`.
- Feature controllers live in `client/src/lib/` (workspace, file view, AI runtime, realtime).
- Stores live in `client/src/stores/` (diff, workspace, AI, queue, search, commits, etc.).
- Screens: files/diff, commits, sessions, terminal, tools, system info, model config, project selection.

## API Surface (Summary)

Non-context routes (no workspace context required):
- `GET /api/health`
- `GET /api/workspace` (tabs, active context, recent projects)
- `GET /api/browse` (directory listing)
- `POST /api/ai/*` (AI prompt operations)
- `GET /api/prompts` (local prompt queue)
- `GET /api/tools` (tool registry)
- `POST /api/git-actions` (git action prompts)
- `GET/POST/PATCH /api/model-config`
- `GET /api/system-info`

Context routes (require `contextId`):
- `GET /api/ctx/:contextId/diff`
- `GET /api/ctx/:contextId/files`
- `GET /api/ctx/:contextId/status`
- `GET /api/ctx/:contextId/commits`
- `GET /api/ctx/:contextId/search`
- `POST /api/ctx/:contextId/commit`
- `POST /api/ctx/:contextId/push`
- `GET /api/ctx/:contextId/worktree`
- `GET /api/ctx/:contextId/branches`
- `GET /api/ctx/:contextId/claude-sessions`
- `GET /api/ctx/:contextId/prompts`
- `POST /api/ctx/:contextId/terminal/connect`
- `GET /api/ctx/:contextId/terminal/status`
- `POST /api/ctx/:contextId/terminal/disconnect`

## Realtime & Events

- WebSocket `/ws` broadcasts file watcher events and AI queue/session updates.
- WebSocket `/ws/terminal/:sessionId` streams terminal input/output.

## Build & Runtime

- Runtime: Bun + Hono.
- Client: Svelte 5 + Tailwind + Vite.
- Server build output: `dist/` from `bun build src/main.ts`.
- Client build output: `client/dist/` served by the server (resolved via `QRAFTBOX_CLIENT_DIR` or fallback search).

## Security Model

- No authentication is implemented.
- Intended for localhost-only use; network exposure is unsafe.

## Known Limitations (As-Built)

- GitHub and PR routes are implemented but not currently mounted in `mountAllRoutes` (context routes are stubbed).
