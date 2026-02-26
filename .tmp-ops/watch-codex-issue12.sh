#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/g/gits/tacogips/QraftBox"
ISSUE_REPO="tacogips/codex-agent"
ISSUE_NO="12"
LOG_FILE="$REPO_DIR/.tmp-ops/watch-codex-issue12.log"
PID_FILE="$REPO_DIR/.tmp-ops/watch-codex-issue12.pid"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG_FILE"
}

issue_state() {
  curl -fsSL "https://api.github.com/repos/${ISSUE_REPO}/issues/${ISSUE_NO}" | jq -r '.state // "unknown"' | tr '[:lower:]' '[:upper:]'
}

latest_codex_sha() {
  curl -fsSL "https://api.github.com/repos/${ISSUE_REPO}/commits?per_page=1" | jq -r '.[0].sha'
}

current_codex_sha() {
  jq -r '.dependencies["codex-agent"] // ""' "$REPO_DIR/package.json" | sed -n 's/.*#\([0-9a-f]\{7,40\}\)$/\1/p'
}

smoke_streaming() {
  bun -e 'import { runAgent } from "codex-agent"; let saw=false; for await (const ev of runAgent({prompt:"say hello",cwd:"/g/gits/tacogips/QraftBox"},{codexBinary:"codex"})) { if (ev.type === "session.message") { saw=true; break; } } if (!saw) process.exit(2); console.log("ok");'
}

cd "$REPO_DIR"
echo $$ > "$PID_FILE"
log "Watcher started (3-minute interval) for issue #$ISSUE_NO"

while true; do
  state=$(issue_state || echo ERROR)
  log "Issue #$ISSUE_NO state: $state"

  if [[ "$state" == "CLOSED" ]]; then
    log "Issue #$ISSUE_NO closed. Integrating latest codex-agent..."
    latest_sha=$(latest_codex_sha || true)
    current_sha=$(current_codex_sha || true)
    log "Current codex-agent SHA: ${current_sha:-unknown}"
    log "Latest codex-agent SHA: ${latest_sha:-unknown}"

    if [[ -n "${latest_sha:-}" && "${latest_sha}" == "${current_sha}" ]]; then
      log "Already on latest codex-agent SHA. Exiting watcher."
      exit 0
    fi

    if bun add "codex-agent@github:tacogips/codex-agent#${latest_sha}" >>"$LOG_FILE" 2>&1 \
      && bun run typecheck >>"$LOG_FILE" 2>&1 \
      && bun run test src/server/ai/agent-runner.test.ts >>"$LOG_FILE" 2>&1 \
      && smoke_streaming >>"$LOG_FILE" 2>&1; then
      log "Integration/validation passed. Watcher exiting."
      exit 0
    fi

    log "Integration or validation failed after issue closure. Keeping watcher alive for retry in next cycle."
  fi

  sleep 180
done
