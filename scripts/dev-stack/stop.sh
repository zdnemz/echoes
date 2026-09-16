#!/usr/bin/env bash
# Stop the dev stack (gateway, PostgREST, GoTrue, Postgres). Keeps data
# (the pgdata docker volume survives `down` — only reset.sh removes it).
set -euo pipefail
source "$(dirname "$0")/env.sh"

COMPOSE=(docker compose -f "$STACK_DIR/docker-compose.yml" --project-directory "$STACK_DIR")

# Gateway runs on the host (bun), so it is stopped by port like before.
gateway_pid="$(port_pid "$GATEWAY_PORT" || true)"
if [ -n "$gateway_pid" ]; then
  echo "[gateway] stopping (pid $gateway_pid)"
  kill "$gateway_pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 "$gateway_pid" 2>/dev/null || break
    sleep 0.5
  done
  kill -9 "$gateway_pid" 2>/dev/null || true
else
  echo "[gateway] not running"
fi

"${COMPOSE[@]}" down 2>/dev/null || echo "[compose] nothing running"

echo "Stack stopped (data kept in the pgdata volume)."
