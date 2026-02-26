#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/g/gits/tacogips/QraftBox"
ISSUE_REPO="tacogips/codex-agent"
ISSUE_NO="10"
LOG_FILE="$REPO_DIR/.tmp-ops/watch-codex-issue10.log"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG_FILE"
}

issue_state() {
  gh issue view "$ISSUE_NO" --repo "$ISSUE_REPO" --json state --jq .state
}

smoke_streaming() {
  bun -e 'import { runAgent } from "codex-agent"; const events=[]; for await (const ev of runAgent({prompt:"say hello",cwd:"/g/gits/tacogips/QraftBox"},{codexBinary:"codex"})) events.push(ev.type); if(!events.includes("session.message")) process.exit(2); console.log(events.join(","));'
}

create_bug_issue() {
  local title="$1"
  local body="$2"
  local existing
  existing=$(gh issue list --repo "$ISSUE_REPO" --state open --search "$title in:title" --json number --jq 'length')
  if [[ "$existing" == "0" ]]; then
    url=$(gh issue create --repo "$ISSUE_REPO" --title "$title" --body "$body")
    log "Created issue: $url"
  else
    log "Matching open issue already exists: $title"
  fi
}

log "Watcher started (10-minute interval) for issue #$ISSUE_NO"
while true; do
  state=$(issue_state || echo ERROR)
  log "Issue #$ISSUE_NO state: $state"

  if [[ "$state" == "CLOSED" ]]; then
    log "Issue #$ISSUE_NO closed. Integrating latest codex-agent..."
    cd "$REPO_DIR"
    latest_sha=$(git ls-remote https://github.com/tacogips/codex-agent.git HEAD | awk '{print $1}')
    log "Latest codex-agent HEAD: $latest_sha"

    if bun add "codex-agent@github:tacogips/codex-agent#$latest_sha" >>"$LOG_FILE" 2>&1 \
      && bun run typecheck >>"$LOG_FILE" 2>&1 \
      && bun run test src/server/ai/agent-runner.test.ts >>"$LOG_FILE" 2>&1; then
      log "Typecheck/tests passed after integration. Running streaming smoke..."
      if smoke_streaming >>"$LOG_FILE" 2>&1; then
        log "Smoke passed. Integration complete. Watcher exiting."
        exit 0
      else
        log "Smoke failed after #$ISSUE_NO closure."
        create_bug_issue \
          "Streaming regression after codex-agent issue #$ISSUE_NO closure" \
          "Automated QraftBox integration watcher detected a streaming regression after issue #$ISSUE_NO was closed.\n\nExpected: runAgent emits session.message.\nActual: session.message missing in smoke test."
      fi
    else
      log "Integration pipeline failed after #$ISSUE_NO closure."
      create_bug_issue \
        "Integration failure after codex-agent issue #$ISSUE_NO closure" \
        "Automated QraftBox integration watcher failed while updating to latest codex-agent after issue #$ISSUE_NO closure.\n\nPlease check for breaking changes."
    fi
  fi

  sleep 600
done
