#!/usr/bin/env bash
# Stop the dev stack (gateway, PostgREST, GoTrue, Postgres). Keeps data.
set -euo pipefail
source "$(dirname "$0")/env.sh"

kill_port_owner() {
  local port="$1" name="$2" pid
  pid="$(port_pid "$port")"
  if [ -n "$pid" ]; then
    echo "[$name] stopping (pid $pid)"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "[$name] not running"
  fi
}

kill_port_owner "$GATEWAY_PORT" gateway
kill_port_owner "$POSTGREST_PORT" postgrest
kill_port_owner "$GOTRUE_PORT" gotrue

# Postgres shuts down through pg_ctl so buffers flush cleanly.
export LD_LIBRARY_PATH="$STACK_PG_LIB"
if [ -f "$STACK_PGDATA/postmaster.pid" ] && pgrep -x postgres > /dev/null 2>&1; then
  echo "[pg] stopping"
  "$STACK_PG_BIN/pg_ctl" -D "$STACK_PGDATA" -m fast stop > /dev/null 2>&1 || true
  rm -f "$STACK_TMP/postgres.pid"
else
  echo "[pg] not running"
fi

echo "Stack stopped (data kept in $STACK_PGDATA)."
