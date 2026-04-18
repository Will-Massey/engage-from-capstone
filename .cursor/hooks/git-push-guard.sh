#!/usr/bin/env bash
# Cursor hook: optional reminder before `git push` to run a full verify + deploy checklist.
# Skip: SKIP_DEPLOY_GUARD=1 in the environment (or when stdin is not JSON / has no command).
set -euo pipefail

input="$(cat || true)"
if ! command -v python3 >/dev/null 2>&1; then
  echo '{"permission":"allow"}'
  exit 0
fi

cmd="$(printf '%s' "$input" | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get('command') or d.get('shellCommand') or '')
except Exception:
  print('')
" 2>/dev/null || true)"

if [[ -z "$cmd" ]]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# Only guard actual git push (not git push --help, etc. — keep matcher in hooks.json tight).
if [[ ! "$cmd" =~ ^git[[:space:]]+push ]]; then
  echo '{"permission":"allow"}'
  exit 0
fi

if [[ "${SKIP_DEPLOY_GUARD:-}" == "1" ]]; then
  echo '{"permission":"allow"}'
  exit 0
fi

echo '{
  "permission": "ask",
  "user_message": "You are about to push. Recommended: run `npm run verify` (lint + typecheck + backend tests + production build). For Render: ensure `deploy-render.yml` secrets (`RENDER_API_KEY`, `RENDER_BACKEND_SERVICE_ID`, `RENDER_FRONTEND_SERVICE_ID`) or use `scripts/deploy.sh`. To skip this reminder: `SKIP_DEPLOY_GUARD=1`.",
  "agent_message": "Git push guard: suggest verify + deploy checklist before pushing."
}'
exit 0
