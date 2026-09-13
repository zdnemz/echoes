#!/usr/bin/env bash
# Wipe the dev stack's Postgres cluster (all local data + auth users).
# Keys and passwords are kept, so .env values remain valid.
set -euo pipefail
source "$(dirname "$0")/env.sh"

bash "$STACK_DIR/stop.sh"
echo "[reset] removing $STACK_PGDATA"
rm -rf "$STACK_PGDATA"
rm -f "$STACK_LOGS/pg.log" "$STACK_LOGS/initdb.log" "$STACK_LOGS/gotrue.log"
echo "[reset] done — a fresh cluster is created on the next start (run scripts/dev-stack/start.sh, then bun run db:seed)"
