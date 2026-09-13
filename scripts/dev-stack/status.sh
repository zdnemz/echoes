#!/usr/bin/env bash
# Report dev-stack component status.
set -euo pipefail
source "$(dirname "$0")/env.sh"

report() {
  local name="$1" port="$2" pid state
  pid="$(port_pid "$port")"
  if [ -n "$pid" ]; then state="up (pid $pid)"; else state="down"; fi
  printf '  %-10s %-14s port %-6s\n' "$name" "$state" "$port"
}

echo "── Echoes dev stack status ──────────────────────────────────────"
report gateway   "$GATEWAY_PORT"
report postgrest "$POSTGREST_PORT"
report gotrue    "$GOTRUE_PORT"
report postgres  "$PG_PORT"

if curl -sf --max-time 2 "http://127.0.0.1:${GATEWAY_PORT}/_stack/health" > /dev/null 2>&1; then
  echo "  gateway health: $(curl -sf --max-time 2 "http://127.0.0.1:${GATEWAY_PORT}/_stack/health")"
fi
if [ -f "$ROOT_DIR/.env" ] && rg -q '^SUPABASE_URL=' "$ROOT_DIR/.env"; then
  echo "  app .env:      wired ($(rg -o '^SUPABASE_URL=.*' "$ROOT_DIR/.env" | head -1))"
else
  echo "  app .env:      NOT wired (run scripts/dev-stack/start.sh)"
fi
