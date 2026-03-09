# Architecture

This document describes the current as-built architecture of QraftBox based on the repository state as of 2026-03-09.

## Overview

QraftBox is a local-first diff viewer and git operations tool. It runs a Bun-based HTTP server with WebSocket support, serves a selectable frontend bundle (Svelte by default, Solid during migration validation), and executes git/AI/terminal operations on the local machine. The system is intentionally single-user and assumes localhost-only access.

## Runtime Topology

- CLI entrypoint: `src/main.ts` -> `src/cli/index.ts`
- HTTP server: Hono app in `src/server/index.ts`
- WebSocket endpoints:
  - `ws://<host>:<port>/ws` for realtime events
  - `ws://<host>:<port>/ws/terminal/<sessionId>` for terminal sessions
- Frontend bundle: built from `client/` or `client-solid/` and selected at startup via `QRAFTBOX_FRONTEND` / `--frontend`

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
- AI execution runs through local AI CLIs via `AgentRunner` (Claude Code and Codex are actively integrated).

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

- Baseline frontend: Svelte 5 SPA built with Vite and Tailwind in `client/`.
- Migration frontend: Solid SPA scaffold in `client-solid/`, currently covering shared routing and live workspace shell flows.
- Shared migration contracts: framework-neutral routing, workspace DTOs, API normalization, and parity fixtures in `client-shared/`.
- `client/src/App.svelte` remains the primary Svelte screen router and state hub using `$state` and `$derived`.
- Feature controllers live in `client/src/lib/` (workspace, file view, AI runtime, realtime).
- Stores live in `client/src/stores/` (diff, workspace, AI, queue, search, commits, etc.).
- Screens: files/diff, commits, AI sessions, terminal, tools, system info, model config, project selection, worktree, GitHub ops.

## Planned Frontend Migration

QraftBox’s production baseline remains the Svelte frontend, but the approved migration direction is to add a Solid frontend in parallel rather than replacing Svelte in place. The target coexistence model is:

- `client/` remains the Svelte baseline during migration.
- A new `client-solid/` app is added for the Solid implementation.
- Shared contracts and parity fixtures are extracted into framework-neutral modules.
- Server startup/static asset resolution selects which frontend bundle to serve for local validation.

Migration foundation status as of 2026-03-09:

- CLI/runtime frontend selection is now modeled explicitly as `svelte | solid`, with `--frontend` overriding `QRAFTBOX_FRONTEND`.
- Frontend asset resolution is centralized in `src/config/frontend.ts`.
- The server now resolves static assets from the selected frontend target instead of assuming Svelte-only output, and startup fails fast when the selected bundle is missing.
- Shared frontend routing contracts and initial parity helpers now live in `client-shared/` and are consumed by both the legacy Svelte router and the Solid scaffold.
- Shared workspace snapshot/bootstrap contracts and shared workspace API normalization now also live in `client-shared/`, and both frontends consume that layer for workspace bootstrapping.
- A minimal `client-solid/` Vite/Solid scaffold exists and now renders a live workspace shell, a usable `files` screen slice with diff-tree/full-tree switching, screen-owned file selection, full-file preview, watcher-driven refresh, and focus/visibility git-state refresh, plus live Solid ports for `ai-session` (still in progress), `commits`, `terminal`, `system-info`, `notifications`, `model-profiles`, and `action-defaults`; browser-verified parity and nested Solid build verification are still pending.
- Migration verification is intentionally split into an offline/root gate (`bun run check:frontend:migration:offline`) and a full Solid gate (`bun run check:frontend:migration`) because nested `client-solid/` dependencies are not guaranteed to exist in every workspace checkout.
- The full Solid migration gate now records its last successful pass in the ignored workspace-local marker `tmp-solid-migration-check.json`; `/api/frontend-status` reads that marker so the Solid readiness UI can distinguish a real recorded full-gate pass from missing dependencies/build output.
- The browser-verification gate now also has a repo-owned command, `bun run verify:frontend:migration:browser`, which drives `agent-browser` through the Svelte and Solid `project` and `files` routes and records `tmp-solid-browser-verification.json` only after that smoke loop succeeds.
- In this workspace as of 2026-03-09, `bun run check:frontend:migration:offline` passes, while the full gate is still blocked because `client-solid/node_modules` is absent and `bun install --cwd client-solid` fails with `bun is unable to write files to tempdir: AccessDenied`.

Design details are tracked in `design-docs/specs/design-solid-frontend-migration.md`.

## API Surface (Summary)

Non-context routes (no workspace context required):

- `GET /api/health`
- `GET /api/workspace` (tabs, active context, recent projects)
- `GET /api/browse` (directory listing)
- `POST/GET/PUT /api/ai/*` (AI submit, queue, sessions, hidden state, cancel/stream)
- `GET/POST/PATCH/DELETE /api/prompts/*` (local prompt CRUD + dispatch/summarize)
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
- Frontends:
  - Svelte 5 + Tailwind + Vite in `client/`
  - Solid + Vite in `client-solid/`
- Server build output: `dist/` from `bun build src/main.ts`.
- Frontend build outputs:
  - `dist/client/` for Svelte, overridable via `QRAFTBOX_CLIENT_DIR`
  - `dist/client-solid/` for Solid, overridable via `QRAFTBOX_CLIENT_SOLID_DIR`
- Startup now fails fast when the selected frontend bundle is missing `index.html`.

### Dual-Frontend Build Direction

The build/runtime model now supports separate Svelte and Solid frontend bundles while preserving one backend/runtime. Until cutover, Svelte remains the default served frontend.

## Security Model

- No authentication is implemented.
- Intended for localhost-only use; network exposure is unsafe.

## Known Limitations (As-Built)

- GitHub and PR routes are implemented but not currently mounted in `mountAllRoutes` (context routes are stubbed).
- Comment routes exist in `src/server/routes/comments.ts` but are not mounted in the active route registry.
