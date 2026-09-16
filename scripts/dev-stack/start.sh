#!/usr/bin/env bash
# Start the full Echoes local dev stack in Docker:
#   Postgres 17 -> GoTrue auth -> schema bootstrap -> PostgREST
#   -> gateway (54321, the SUPABASE_URL)
# and wire the stack into the app's .env (managed block, idempotent).
set -euo pipefail
source "$(dirname "$0")/env.sh"

COMPOSE=(docker compose -f "$STACK_DIR/docker-compose.yml" --project-directory "$STACK_DIR")

echo "── Echoes dev stack (docker) ────────────────────────────────────"

# --- postgres ------------------------------------------------------------------
"${COMPOSE[@]}" up -d db
echo "[db] waiting for postgres to accept connections"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T db pg_isready -U postgres > /dev/null 2>&1; then
    echo "[db] ready"
    break
  fi
  sleep 1
  if [ "$_" = 30 ]; then
    echo "[db] FAILED to become ready" >&2
    exit 1
  fi
done

# --- gotrue --------------------------------------------------------------------
echo "[gotrue] applying auth schema migrations"
node "$STACK_DIR/scripts/ensure-auth-namespace.mjs"
"${COMPOSE[@]}" run --rm auth auth migrate >> "$STACK_LOGS/gotrue.log" 2>&1 || {
  echo "[gotrue] migration step FAILED — see $STACK_LOGS/gotrue.log" >&2
  exit 1
}

echo "[gotrue] starting"
"${COMPOSE[@]}" up -d auth
for _ in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:${GOTRUE_PORT}/health" > /dev/null 2>&1; then
    echo "[gotrue] ready"
    break
  fi
  sleep 1
  if [ "$_" = 30 ]; then
    echo "[gotrue] FAILED to become ready — see $STACK_LOGS/gotrue.log" >&2
    "${COMPOSE[@]}" logs --tail=30 auth >&2 || true
    exit 1
  fi
done

# --- app schema ----------------------------------------------------------------
node "$STACK_DIR/scripts/apply-schema.mjs"

# --- postgrest -------------------------------------------------------------------
echo "[postgrest] starting"
"${COMPOSE[@]}" up -d rest
for _ in $(seq 1 30); do
  code="$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${POSTGREST_PORT}/" -H "Authorization: Bearer $STACK_ANON_KEY" || echo 000)"
  if [ "$code" != "000" ]; then
    echo "[postgrest] ready"
    break
  fi
  sleep 1
  if [ "$_" = 30 ]; then
    echo "[postgrest] FAILED to become ready" >&2
    "${COMPOSE[@]}" logs --tail=30 rest >&2 || true
    exit 1
  fi
done

# --- gateway (bun, on the host) --------------------------------------------------
if port_listening "$GATEWAY_PORT"; then
  echo "[gateway] already running (pid $(port_pid "$GATEWAY_PORT"))"
else
  echo "[gateway] starting on 127.0.0.1:$GATEWAY_PORT"
  (cd "$STACK_DIR" && setsid --fork bun scripts/gateway.ts >> "$STACK_LOGS/gateway.log" 2>&1 < /dev/null)
fi

# --- verify through the gateway ---------------------------------------------------
for _ in $(seq 1 20); do
  if curl -sf --max-time 2 "http://127.0.0.1:${GATEWAY_PORT}/_stack/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -sf --max-time 3 "http://127.0.0.1:${GATEWAY_PORT}/_stack/health" > /dev/null || {
  echo "[gateway] FAILED — see $STACK_LOGS/gateway.log" >&2
  exit 1
}
echo "[gateway] ready (http://127.0.0.1:$GATEWAY_PORT)"

# --- wire the stack into the app's .env -------------------------------------------
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  # Remove any existing (managed or ad-hoc) Supabase lines, then append the
  # managed block. Everything else in .env is preserved untouched.
  python3 - "$ENV_FILE" "$STACK_SUPABASE_URL" "$STACK_ANON_KEY" "$STACK_SERVICE_KEY" <<'PYEOF'
import sys, re
path, url, anon, service = sys.argv[1:5]
managed_tag = '# --- dev-stack (managed by scripts/dev-stack) ---'
text = open(path).read()
# strip previous managed block
text = re.sub(r'\n?' + re.escape(managed_tag) + r'.*?(?=\n#|\Z)', '', text, flags=re.S)
# strip ad-hoc supabase assignments (commented or active)
text = re.sub(r'^\s*#+\s*SUPABASE_[A-Z_]+\s*=.*$\n?', '', text, flags=re.M)
text = re.sub(r'^\s*SUPABASE_[A-Z_]+\s*=.*$\n?', '', text, flags=re.M)
block = (f"\n{managed_tag}\n"
         f"SUPABASE_URL={url}\n"
         f"SUPABASE_ANON_KEY={anon}\n"
         f"SUPABASE_SERVICE_ROLE_KEY={service}\n")
if not text.endswith('\n'):
    text += '\n'
open(path, 'w').write(text + block)
PYEOF
  echo "[env] .env wired to the local stack (SUPABASE_URL=$STACK_SUPABASE_URL)"
else
  echo "[env] no .env found — add these lines yourself:"
  echo "  SUPABASE_URL=$STACK_SUPABASE_URL"
  echo "  SUPABASE_ANON_KEY=$STACK_ANON_KEY"
  echo "  SUPABASE_SERVICE_ROLE_KEY=$STACK_SERVICE_KEY"
fi

echo
echo "Stack is live.  SUPABASE_URL = $STACK_SUPABASE_URL"
echo "Next.js dev picks up .env changes automatically; if it doesn't, restart it."
echo "Seed demo data:   bun run db:seed"
echo "Stop everything:  bun run stack:stop"
