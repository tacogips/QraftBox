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
