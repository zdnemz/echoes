#!/usr/bin/env bash
# Start (and initialise on first run) the embedded Postgres cluster.
# Idempotent: safe to call repeatedly.
set -euo pipefail
source "$(dirname "$0")/../env.sh"

_PIDFILE="$STACK_TMP/postgres.pid"

# Binaries need their bundled libraries (libicu, libssl 1.1, …).
export LD_LIBRARY_PATH="$STACK_PG_LIB"

if [ -f "$_PIDFILE" ] && kill -0 "$(cat "$_PIDFILE" 2>/dev/null)" 2>/dev/null; then
  echo "[pg] already running (pid $(cat "$_PIDFILE"))"
  exit 0
fi

# Adopt an already-listening local postgres (e.g. started outside this script).
if [ -f "$STACK_PGDATA/postmaster.pid" ]; then
  ADOPT_PID="$(head -1 "$STACK_PGDATA/postmaster.pid" | tr -d '[:space:]')"
  if [ -n "$ADOPT_PID" ] && kill -0 "$ADOPT_PID" 2>/dev/null; then
    echo "$ADOPT_PID" > "$_PIDFILE"
    echo "[pg] adopted running server (pid $ADOPT_PID)"
    exit 0
  fi
fi

# --- first run: initdb ----------------------------------------------------------
if [ ! -f "$STACK_PGDATA/PG_VERSION" ]; then
  echo "[pg] initialising cluster in $STACK_PGDATA"
  rm -rf "$STACK_PGDATA"
  "$STACK_PG_BIN/initdb" -D "$STACK_PGDATA" \
    --auth-host=scram-sha-256 --auth-local=trust \
    --username=postgres --pwfile="$STACK_TMP/.pgpw" \
    -E UTF8 --locale=C > "$STACK_LOGS/initdb.log" 2>&1
  cat >> "$STACK_PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $PG_PORT
unix_socket_directories = '$STACK_TMP'
max_connections = 100
EOF
fi

# --- start ----------------------------------------------------------------------
echo "[pg] starting postgres on 127.0.0.1:$PG_PORT"
"$STACK_PG_BIN/pg_ctl" -D "$STACK_PGDATA" -l "$STACK_LOGS/pg.log" -w -t 60 start > /dev/null
PGPID="$(cat "$STACK_PGDATA/postmaster.pid" | head -1)"
echo "$PGPID" > "$_PIDFILE"

# --- wait for readiness ----------------------------------------------------------
for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$PG_PORT") 2>/dev/null; then
    exec 3>&- 3<&- || true
    echo "[pg] ready (pid $PGPID)"
    exit 0
  fi
  sleep 1
done
echo "[pg] FAILED to become ready — see $STACK_LOGS/pg.log" >&2
exit 1
