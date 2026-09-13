#!/usr/bin/env bash
# Start PostgREST on 127.0.0.1:$POSTGREST_PORT (behind the gateway).
# Idempotent. The roles it switches between are created by apply-schema.mjs.
set -euo pipefail
source "$(dirname "$0")/../env.sh"

if port_listening "$POSTGREST_PORT"; then
  echo "[postgrest] already running (pid $(port_pid "$POSTGREST_PORT"))"
  exit 0
fi

echo "[postgrest] starting on 127.0.0.1:$POSTGREST_PORT"
cd "$STACK_BIN"
setsid --fork env \
  PGRST_DB_URI="postgresql://authenticator:${STACK_PG_PW}@127.0.0.1:${PG_PORT}/postgres" \
  PGRST_DB_SCHEMAS=public \
  PGRST_DB_ANON_ROLE=anon \
  PGRST_DB_USE_LEGACY_GUCS=true \
  PGRST_JWT_SECRET="$STACK_JWT_SECRET" \
  PGRST_JWT_SECRET_IS_BASE64=false \
  PGRST_SERVER_HOST=127.0.0.1 \
  PGRST_SERVER_PORT="$POSTGREST_PORT" \
  PGRST_OPENAPI_SERVER_PROXY_URI="${STACK_SUPABASE_URL}/rest/v1" \
  PGRST_DB_POOL=20 \
  ./postgrest >> "$STACK_LOGS/postgrest.log" 2>&1 < /dev/null

# --- wait for readiness ----------------------------------------------------------
for _ in $(seq 1 30); do
  # Any HTTP answer (even 401/403) proves the listener is up.
  code="$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${POSTGREST_PORT}/" -H "Authorization: Bearer $STACK_ANON_KEY" || echo 000)"
  if [ "$code" != "000" ]; then
    echo "[postgrest] ready (pid $(port_pid "$POSTGREST_PORT"))"
    exit 0
  fi
  sleep 1
done
echo "[postgrest] FAILED to become ready — see $STACK_LOGS/postgrest.log" >&2
exit 1
