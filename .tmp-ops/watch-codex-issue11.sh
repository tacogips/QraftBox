#!/usr/bin/env bash
set -euo pipefail
mkdir -p .tmp-ops
log=.tmp-ops/watch-codex-issue11.log
echo "[$(date -Iseconds)] watcher started (3-min) for issue #11" >> "$log"
while true; do
  state=$(gh issue view 11 --repo tacogips/codex-agent --json state --jq .state || echo ERROR)
  echo "[$(date -Iseconds)] issue11 state=$state" >> "$log"
  if [ "$state" = "CLOSED" ]; then
    sha=$(git ls-remote https://github.com/tacogips/codex-agent.git HEAD | awk '{print $1}')
    echo "[$(date -Iseconds)] integrating codex-agent#$sha" >> "$log"
    if bun add "codex-agent@github:tacogips/codex-agent#$sha" >> "$log" 2>&1 \
      && bun run typecheck >> "$log" 2>&1 \
      && bun run test src/server/ai/agent-runner.test.ts >> "$log" 2>&1; then
      echo "[$(date -Iseconds)] dependency/tests ok; running findSession repro" >> "$log"
      if bun -e 'import { findSession } from "codex-agent"; const id = "019c9081-6c26-7671-9c57-8a91e009d29e"; const r = await findSession(id); console.log(r === null ? "null" : "ok");' >> "$log" 2>&1; then
        echo "[$(date -Iseconds)] findSession repro passed; watcher exiting" >> "$log"
        break
      else
        echo "[$(date -Iseconds)] findSession repro still failing after closure" >> "$log"
      fi
    else
      echo "[$(date -Iseconds)] update or tests failed after closure" >> "$log"
    fi
  fi
  sleep 180
done
