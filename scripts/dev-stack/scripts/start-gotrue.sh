#!/usr/bin/env bash
# Start GoTrue (Supabase Auth) on 127.0.0.1:$GOTRUE_PORT.
# Idempotent. Applies GoTrue's own migrations first (creates the auth schema).
#
# NOTE on env var prefixes: this GoTrue build reads a mix of prefixed and
# unprefixed names (its config loader changed across versions), so every
# variable is set in BOTH forms — harmless and robust.
#
# Spawning: `setsid --fork` detaches the daemon into its own session with an
# instantly-exiting parent, so the calling script never waits on it.
set -euo pipefail
source "$(dirname "$0")/../env.sh"

if port_listening "$GOTRUE_PORT"; then
  echo "[gotrue] already running (pid $(port_pid "$GOTRUE_PORT"))"
  exit 0
fi

# GoTrue resolves ./migrations relative to its working directory.
cd "$STACK_BIN"

ALLOW_LIST="${STACK_APP_URL},${STACK_APP_URL}/auth/callback"

# GoTrue's SQL (migrations + runtime) uses unqualified names in places —
# Supabase runs it with search_path=auth, so we do the same through the
# connection URL's options parameter. This is what keeps its enums and
# bookkeeping tables inside the auth schema.
PG_URI_AUTH="${STACK_PG_URI}&options=-csearch_path%3Dauth"

GOTRUE_ENV=(
  API_HOST=127.0.0.1
  GOTRUE_API_HOST=127.0.0.1
  API_PORT="$GOTRUE_PORT"
  GOTRUE_API_PORT="$GOTRUE_PORT"
  API_EXTERNAL_URL="$STACK_SUPABASE_URL"
  GOTRUE_API_EXTERNAL_URL="$STACK_SUPABASE_URL"
  DB_DRIVER=postgres
  GOTRUE_DB_DRIVER=postgres
  DATABASE_URL="$PG_URI_AUTH"
  GOTRUE_DB_DATABASE_URL="$PG_URI_AUTH"
  DB_NAMESPACE=auth
  GOTRUE_DB_NAMESPACE=auth
  JWT_SECRET="$STACK_JWT_SECRET"
  GOTRUE_JWT_SECRET="$STACK_JWT_SECRET"
  JWT_EXP=3600
  GOTRUE_JWT_EXP=3600
  JWT_ADMIN_GROUP_NAME=service_role
  GOTRUE_JWT_ADMIN_GROUP_NAME=service_role
  JWT_DEFAULT_GROUP_NAME=authenticated
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
  SITE_URL="$STACK_APP_URL"
  GOTRUE_SITE_URL="$STACK_APP_URL"
  URI_ALLOW_LIST="$ALLOW_LIST"
  GOTRUE_URI_ALLOW_LIST="$ALLOW_LIST"
  MAILER_AUTOCONFIRM=true
  GOTRUE_MAILER_AUTOCONFIRM=true
  MAILER_URL_PATHS_INVITE=/auth/v1/verify
  GOTRUE_MAILER_URL_PATHS_INVITE=/auth/v1/verify
  MAILER_URL_PATHS_CONFIRMATION=/auth/v1/verify
  GOTRUE_MAILER_URL_PATHS_CONFIRMATION=/auth/v1/verify
  MAILER_URL_PATHS_RECOVERY=/auth/v1/verify
  GOTRUE_MAILER_URL_PATHS_RECOVERY=/auth/v1/verify
  MAILER_URL_PATHS_EMAIL_CHANGE=/auth/v1/verify
  GOTRUE_MAILER_URL_PATHS_EMAIL_CHANGE=/auth/v1/verify
  LOG_LEVEL=info
  GOTRUE_LOG_LEVEL=info
  PASSWORD_MIN_LENGTH=8
  GOTRUE_PASSWORD_MIN_LENGTH=8
)

echo "[gotrue] applying auth schema migrations"
node "$STACK_DIR/scripts/ensure-auth-namespace.mjs"
env "${GOTRUE_ENV[@]}" ./auth migrate >> "$STACK_LOGS/gotrue.log" 2>&1 || {
  echo "[gotrue] migration step FAILED — see $STACK_LOGS/gotrue.log" >&2
  exit 1
}

echo "[gotrue] starting on 127.0.0.1:$GOTRUE_PORT"
setsid --fork env "${GOTRUE_ENV[@]}" ./auth serve >> "$STACK_LOGS/gotrue.log" 2>&1 < /dev/null

# --- wait for readiness ----------------------------------------------------------
for _ in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:${GOTRUE_PORT}/health" > /dev/null 2>&1; then
    echo "[gotrue] ready (pid $(port_pid "$GOTRUE_PORT"))"
    exit 0
  fi
  sleep 1
done
echo "[gotrue] FAILED to become ready — see $STACK_LOGS/gotrue.log" >&2
exit 1
