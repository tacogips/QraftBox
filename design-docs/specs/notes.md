# Notes

This file captures as-built constraints, operational considerations, and known gaps.

## Local-Only Security Model

- The server has no authentication or authorization.
- Intended for localhost-only usage; exposing the port publicly is unsafe.

## Persistence Locations

- `~/.local/QraftBox/recent.db` (recent directories, SQLite)
- `~/.local/QraftBox/open-tabs.db` (open tabs, SQLite)
- `~/.local/QraftBox/ai-sessions.db` (AI sessions, SQLite)
- `~/.local/QraftBox/session-mappings.db` (AI session mapping, SQLite)
- `~/.local/QraftBox/model-config.db` (model profiles/bindings, SQLite)
- `~/.local/QraftBox/prompts/` (prompt queue, JSON files)
- `~/.config/qraftbox/tools/` (plugin tools, JSON definitions)

## Terminal Behavior

- Terminal sessions spawn a local interactive shell (`$SHELL` or `bash`).
- Output is buffered when the WebSocket is disconnected and flushed on reconnect.

## AI Integration

- AI execution is delegated by `AgentRunner` to local AI CLIs (Claude/Codex).
- Prompt queue and session mapping are persisted to allow recovery after restarts.

## Known Gaps (As-Built)

- GitHub/PR routes are implemented but not mounted in `mountAllRoutes`. The context routes currently use stub Hono apps.
- Comment routes are implemented in `src/server/routes/comments.ts` but are not mounted in the active API registry.
- The CLI uses `-h` for host, so help is only available as `--help`.

## Document Coverage Notes

- Terminal API includes `/connect`, `/status`, and `/disconnect` under `/api/ctx/:contextId/terminal`.

## Testing/Dev Overrides

- `QRAFTBOX_TEST_CONFIG_DIR` and `QRAFTBOX_TEST_TOOLS_DIR` are used in tests to isolate filesystem state.

## Planned Frontend Migration Notes

- The Svelte frontend remains the baseline reference implementation until Solid parity is achieved.
- Migration validation should compare both frontends against the same backend and repository state.
- Shared frontend logic should move into framework-neutral TypeScript modules before complex screens are ported.
- Workspace API DTO normalization belongs in the shared migration layer, not in framework-local API adapters.
- Hash-driven navigation parity is part of the migration foundation; the Solid shell must react to later `hashchange` events, not just the initial URL.
- Browser verification should be run for both frontends after each significant migrated UI milestone.
- Current blocker state as of 2026-03-09:
  `client-solid/node_modules` is missing, `bun install --cwd client-solid` fails in this workspace with `bun is unable to write files to tempdir: AccessDenied`, and `dist/client-solid/index.html` is still unbuilt. `agent-browser` is present on `PATH`, but the verification loop still cannot proceed until the Solid dependencies and build output exist.
- The recorded full Solid migration check status is now stored in the ignored workspace-local marker `tmp-solid-migration-check.json`, which is cleared before each `bun run check:frontend:migration` run and rewritten only after the full command succeeds.
