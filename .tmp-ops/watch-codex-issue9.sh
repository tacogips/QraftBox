#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/g/gits/tacogips/QraftBox"
ISSUE_REPO="tacogips/codex-agent"
ISSUE_NO="9"
LOG_FILE="$REPO_DIR/.tmp-ops/watch-codex-issue9.log"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG_FILE"
}

check_state() {
  gh issue view "$ISSUE_NO" --repo "$ISSUE_REPO" --json state --jq .state
}

run_smoke() {
  bun -e 'import { runAgent } from "codex-agent"; const events=[]; for await (const ev of runAgent({prompt:"say hello",cwd:"/g/gits/tacogips/QraftBox"},{codexBinary:"codex"})) { events.push(ev.type); } console.log(events.join(",")); if (!events.includes("session.message")) process.exit(2);'
}

create_issue_if_needed() {
  local title="$1"
  local body="$2"
  local exists
  exists=$(gh issue list --repo "$ISSUE_REPO" --state open --search "$title in:title" --json number --jq 'length')
  if [[ "$exists" == "0" ]]; then
    gh issue create --repo "$ISSUE_REPO" --title "$title" --body "$body" >/dev/null
    log "Created new codex-agent issue: $title"
  else
    log "Open issue with same title already exists, skipping create: $title"
  fi
}

log "Watcher started (interval: 10 minutes), tracking issue #$ISSUE_NO"

while true; do
  state=$(check_state || echo "ERROR")
  log "Issue #$ISSUE_NO state: $state"

  if [[ "$state" == "CLOSED" ]]; then
    log "Issue closed. Updating codex-agent and running verification..."
    cd "$REPO_DIR"

    latest_sha=$(git ls-remote https://github.com/tacogips/codex-agent.git HEAD | awk '{print $1}')
    log "Latest codex-agent HEAD: $latest_sha"

    if bun add "codex-agent@github:tacogips/codex-agent#$latest_sha" >>"$LOG_FILE" 2>&1 && \
       bun run typecheck >>"$LOG_FILE" 2>&1 && \
       bun run test src/server/ai/agent-runner.test.ts >>"$LOG_FILE" 2>&1; then
      log "Dependency update + tests passed. Running streaming smoke check..."
      if run_smoke >>"$LOG_FILE" 2>&1; then
        log "Smoke passed (session.message observed). Watcher exiting successfully."
        exit 0
      else
        log "Smoke failed after issue closure: session.message still missing."
        create_issue_if_needed \
          "runAgent still misses session.message after #9 closure" \
          "Automated watcher in QraftBox detected missing session.message after updating to latest codex-agent HEAD.\n\nContext:\n- Trigger: issue #9 was closed\n- Check: runAgent({prompt: \"say hello\"}) events must include session.message\n- Actual: only session.started/session.completed\n\nPlease investigate regression or incomplete fix."
      fi
    else
      log "Update/test pipeline failed after issue closure."
      create_issue_if_needed \
        "Post-#9 integration failure in QraftBox update pipeline" \
        "Automated watcher failed while integrating latest codex-agent after #9 closure.\n\nPlease check compatibility or breaking changes."
    fi
  fi

  sleep 600
 done
