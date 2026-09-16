#!/usr/bin/env bash
# Wipe the dev stack's Postgres data (all local data + auth users) by
# removing the pgdata docker volume. Keys and passwords are kept, so .env
# values remain valid.
set -euo pipefail
source "$(dirname "$0")/env.sh"

COMPOSE=(docker compose -f "$STACK_DIR/docker-compose.yml" --project-directory "$STACK_DIR")

bash "$STACK_DIR/stop.sh"
echo "[reset] removing the pgdata volume"
"${COMPOSE[@]}" down -v 2>/dev/null || true
rm -f "$STACK_LOGS/pg.log" "$STACK_LOGS/initdb.log" "$STACK_LOGS/gotrue.log"
echo "[reset] done — a fresh database is created on the next start (run scripts/dev-stack/start.sh, then bun run db:seed)"
