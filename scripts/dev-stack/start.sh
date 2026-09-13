#!/usr/bin/env bash
# Start the full Echoes local dev stack:
#   Postgres (embedded, 5440) -> GoTrue auth (5999) -> schema bootstrap
#   -> PostgREST (5998) -> gateway (54321, the SUPABASE_URL)
# and wire the stack into the app's .env (managed block, idempotent).
set -euo pipefail
source "$(dirname "$0")/env.sh"

echo "── Echoes dev stack ─────────────────────────────────────────────"
bash "$STACK_DIR/scripts/start-pg.sh"
bash "$STACK_DIR/scripts/ensure-binaries.sh"
bash "$STACK_DIR/scripts/start-gotrue.sh"
node "$STACK_DIR/scripts/apply-schema.mjs"
bash "$STACK_DIR/scripts/start-postgrest.sh"

# --- gateway (bun) ---------------------------------------------------------------
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
