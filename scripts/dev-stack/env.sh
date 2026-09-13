#!/usr/bin/env bash
# Shared configuration for the Echoes local dev stack.
# Sourced by every stack script. Not meant to be run directly.
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$STACK_DIR/../.." && pwd)"

# --- directories ---------------------------------------------------------------
export STACK_TMP="$STACK_DIR/tmp"
export STACK_LOGS="$STACK_DIR/logs"
export STACK_BIN="$STACK_DIR/bin"
export STACK_PGDATA="$STACK_DIR/pgdata"
mkdir -p "$STACK_TMP" "$STACK_LOGS"

# --- ports ---------------------------------------------------------------------
export PG_PORT=5440          # postgres (5432-5434 taken on this machine)
export GOTRUE_PORT=5999      # auth API (behind the gateway)
export POSTGREST_PORT=5998   # data API (behind the gateway)
export GATEWAY_PORT=54321    # single-origin supabase-compatible URL

# --- key material (generated once by mint-keys.ts; stable across restarts) ------
if [ ! -f "$STACK_DIR/.keys.json" ]; then
  (cd "$STACK_DIR" && bun scripts/mint-keys.ts >/dev/null)
fi
STACK_JWT_SECRET="$(python3 -c "import json; print(json.load(open('$STACK_DIR/.keys.json'))['secret'])")"
STACK_ANON_KEY="$(python3 -c "import json; print(json.load(open('$STACK_DIR/.keys.json'))['anon_key'])")"
STACK_SERVICE_KEY="$(python3 -c "import json; print(json.load(open('$STACK_DIR/.keys.json'))['service_role_key'])")"
export STACK_JWT_SECRET STACK_ANON_KEY STACK_SERVICE_KEY

# --- postgres credentials (generated once, stable across restarts) -------------
if [ ! -f "$STACK_TMP/.pgpw" ]; then
  openssl rand -hex 12 > "$STACK_TMP/.pgpw"
fi
STACK_PG_PW="$(tr -d '\n' < "$STACK_TMP/.pgpw")"
export STACK_PG_PW
export STACK_PG_BIN="$STACK_DIR/node_modules/@embedded-postgres/linux-x64/native/bin"
export STACK_PG_LIB="$STACK_DIR/node_modules/@embedded-postgres/linux-x64/native/lib"
export PGDATABASE=postgres
export PGUSER=postgres
export PGHOST=127.0.0.1
export PGPORT="$PG_PORT"
export STACK_PG_URI="postgresql://postgres:${STACK_PG_PW}@127.0.0.1:${PG_PORT}/postgres?sslmode=disable"

# --- app-facing values (what goes into .env) ------------------------------------
export STACK_SUPABASE_URL="http://127.0.0.1:${GATEWAY_PORT}"

# The app URL must match the one the Next.js app uses (APP_URL in .env).
export STACK_APP_URL="http://localhost:3000"

# PID of whichever process listens on a local TCP port ("" when nobody does).
port_pid() {
  { ss -tlnpH 2>/dev/null | rg ":$1 " | rg -o 'pid=[0-9]+' | head -1 | cut -d= -f2; } || true
}

port_listening() {
  [ -n "$(port_pid "$1")" ]
}
