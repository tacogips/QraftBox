# Command Interface

This document describes the current CLI interface as implemented in `src/cli/index.ts` and `src/cli/config.ts`.

## Usage

`qraftbox [options] [projectPath]`

- `projectPath` defaults to the current working directory.
- Multiple project directories can be opened at startup via `--project-dir`.

## Options

| Flag | Description | Default |
| --- | --- | --- |
| `-p, --port <number>` | Server port | `7144` |
| `-h, --host <string>` | Server host | `localhost` |
| `--open` | Open browser on start | `false` |
| `--watch` / `--no-watch` | Enable/disable file watching | `true` |
| `-s, --sync-mode <mode>` | Git sync mode: `manual`, `auto-push`, `auto-pull`, `auto` | `manual` |
| `--ai` / `--no-ai` | Enable/disable AI features | `true` |
| `--assistant-additional-args <args>` | Comma-separated args passed to AI assistant | `--dangerously-skip-permissions` |
| `-d, --project-dir <paths...>` | One or more project directories to open at startup | none |
| `-V, --version` | Print version | from `package.json` |
| `--help` | Show help | n/a |

## Environment Variables

| Name | Purpose |
| --- | --- |
| `QRAFTBOX_CLIENT_DIR` | Override client build directory for static assets |
| `QRAFTBOX_LOG_LEVEL` / `LOG_LEVEL` | Server log level |
| `GITHUB_TOKEN` | GitHub API auth (highest priority) |
| `GH_TOKEN` | GitHub API auth (fallback) |
| `QRAFTBOX_TEST_CONFIG_DIR` | Test-only override for prompt config directory |
| `QRAFTBOX_TEST_TOOLS_DIR` | Test-only override for tools plugin directory |
| `SHELL` | Shell used by terminal sessions (default: `bash`) |

## Exit Codes

- `0`: Normal shutdown (SIGINT/SIGTERM) or successful completion.
- `1`: Invalid config or fatal startup/runtime error.
