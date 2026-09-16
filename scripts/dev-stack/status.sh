#!/usr/bin/env bash
# Report dev-stack component status.
set -euo pipefail
source "$(dirname "$0")/env.sh"

COMPOSE=(docker compose -f "$STACK_DIR/docker-compose.yml" --project-directory "$STACK_DIR")

echo "── Echoes dev stack status (docker) ─────────────────────────────"

# Gateway runs on the host, so a pid report works for it.
gw_pid="$(port_pid "$GATEWAY_PORT" || true)"
if [ -n "$gw_pid" ]; then gw_state="up (pid $gw_pid)"; else gw_state="down"; fi
printf '  %-10s %-14s port %-6s\n' gateway "$gw_state" "$GATEWAY_PORT"

# Container ports are owned by docker-proxy (no visible pid), so liveness
# comes from compose state plus a real HTTP probe per service.
http_probe() {
  curl -sf --max-time 2 "$1" > /dev/null 2>&1 && echo "up" || echo "down"
}
db_probe() {
  "${COMPOSE[@]}" exec -T db pg_isready -U postgres > /dev/null 2>&1 && echo "up" || echo "down"
}
printf '  %-10s %-14s port %-6s\n' postgres "$(db_probe)" "$PG_PORT"
printf '  %-10s %-14s port %-6s\n' gotrue "$(http_probe "http://127.0.0.1:${GOTRUE_PORT}/health")" "$GOTRUE_PORT"
printf '  %-10s %-14s port %-6s\n' postgrest "$(http_probe "http://127.0.0.1:${POSTGREST_PORT}/")" "$POSTGREST_PORT"

echo "  containers:"
"${COMPOSE[@]}" ps --format '  {{.Name}}  {{.Status}}' 2>/dev/null || echo "  (compose project not running)"

if curl -sf --max-time 2 "http://127.0.0.1:${GATEWAY_PORT}/_stack/health" > /dev/null 2>&1; then
  echo "  gateway health: $(curl -sf --max-time 2 "http://127.0.0.1:${GATEWAY_PORT}/_stack/health")"
fi
if [ -f "$ROOT_DIR/.env" ] && rg -q '^SUPABASE_URL=' "$ROOT_DIR/.env"; then
  echo "  app .env:      wired ($(rg -o '^SUPABASE_URL=.*' "$ROOT_DIR/.env" | head -1))"
else
  echo "  app .env:      NOT wired (run scripts/dev-stack/start.sh)"
fi
