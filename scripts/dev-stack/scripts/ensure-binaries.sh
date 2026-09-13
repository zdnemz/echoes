#!/usr/bin/env bash
# Ensure the downloaded GoTrue + PostgREST binaries exist in bin/.
# Idempotent: skips everything when both binaries already run.
# (bin/ is gitignored; fresh clones fetch ~55 MB once.)
set -euo pipefail
source "$(dirname "$0")/../env.sh"

GOTRUE_VERSION="v2.171.0"
POSTGREST_VERSION="v12.2.12"
PG_LIB="$STACK_DIR/node_modules/@embedded-postgres/linux-x64/native/lib"

mkdir -p "$STACK_BIN"

if [ ! -x "$STACK_BIN/auth" ]; then
  echo "[bin] downloading GoTrue $GOTRUE_VERSION"
  curl -sfL --max-time 300 -o "$STACK_BIN/auth.tgz" \
    "https://github.com/supabase/auth/releases/download/${GOTRUE_VERSION}/auth-${GOTRUE_VERSION}-x86.tar.gz"
  tar xzf "$STACK_BIN/auth.tgz" -C "$STACK_BIN"
  rm "$STACK_BIN/auth.tgz"
fi

if [ ! -x "$STACK_BIN/postgrest" ]; then
  echo "[bin] downloading PostgREST $POSTGREST_VERSION"
  curl -sfL --max-time 300 -o "$STACK_BIN/postgrest.tgz" \
    "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz"
  tar xf "$STACK_BIN/postgrest.tgz" -C "$STACK_BIN"
  rm "$STACK_BIN/postgrest.tgz"
fi

# The embedded-postgres npm package sometimes ships versioned .so files
# without their soname symlinks (loader then fails with "libpq.so.5:
# cannot open shared object file"). Recreate the known-good set.
if [ -d "$PG_LIB" ]; then
  [ -f "$PG_LIB/libpq.so.5.17" ] && ln -sf libpq.so.5.17 "$PG_LIB/libpq.so.5"
  [ -f "$PG_LIB/libicudata.so.60.2" ] && ln -sf libicudata.so.60.2 "$PG_LIB/libicudata.so.60"
  [ -f "$PG_LIB/libicui18n.so.60.2" ] && ln -sf libicui18n.so.60.2 "$PG_LIB/libicui18n.so.60"
  [ -f "$PG_LIB/libicuuc.so.60.2" ] && ln -sf libicuuc.so.60.2 "$PG_LIB/libicuuc.so.60"
fi

echo "[bin] GoTrue + PostgREST ready"
