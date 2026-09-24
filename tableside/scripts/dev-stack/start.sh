#!/usr/bin/env bash
# Dev/CI only: a local stand-in for a Supabase project.
#   Postgres :54322 · PostgREST :3001 · GoTrue :9999 · gateway :54321
# Downloads pinned PostgREST and GoTrue release binaries (sha256-checked) into
# .dev-stack/bin, initialises a Postgres cluster if none is listening, applies
# bootstrap.sql, GoTrue's migrations, then ours, and writes .dev-stack/env.
# Idempotent: re-running restarts the API processes and leaves data in place.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; S="$ROOT/.dev-stack"; mkdir -p "$S/bin" "$S/logs"

PG_PORT="${DEV_PG_PORT:-54322}"
POSTGREST_VERSION=v12.2.3
POSTGREST_SHA=9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c
GOTRUE_VERSION=v2.180.0
GOTRUE_SHA=3fe064281f5cf7bda94251a3bd9e87a690d081381d9ea93b1491163735209e2e

fetch() { # url sha out
  local tmp; tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "$1"
  echo "$2  $tmp" | sha256sum -c --quiet - || { echo "checksum mismatch for $1" >&2; exit 1; }
  mv "$tmp" "$3"
}
if [ ! -x "$S/bin/postgrest" ]; then
  fetch "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" "$POSTGREST_SHA" "$S/postgrest.tar.xz"
  tar xJf "$S/postgrest.tar.xz" -C "$S/bin" && rm "$S/postgrest.tar.xz"
fi
if [ ! -x "$S/bin/gotrue/auth" ]; then
  fetch "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" "$GOTRUE_SHA" "$S/gotrue.tgz"
  mkdir -p "$S/bin/gotrue" && tar xzf "$S/gotrue.tgz" -C "$S/bin/gotrue" && rm "$S/gotrue.tgz"
fi

# --- Postgres -------------------------------------------------------------
if ! pg_isready -q -h 127.0.0.1 -p "$PG_PORT"; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$PGBIN" ] || PGBIN="$(pg_config --bindir)"
  run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
  if [ ! -f "$S/pg/PG_VERSION" ]; then
    mkdir -p "$S/pg"; [ "$(id -u)" = 0 ] && chown postgres "$S/pg" && chmod 700 "$S/pg"
    run "$PGBIN/initdb -D '$S/pg' -U postgres --auth=trust >/dev/null"
  fi
  run "$PGBIN/pg_ctl -D '$S/pg' -l '$S/pg/log' -o '-p $PG_PORT -k /tmp' -w start >/dev/null"
fi
PSQL="psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $PG_PORT -U postgres -d postgres"
$PSQL -f scripts/dev-stack/bootstrap.sql

node scripts/dev-stack/keys.js >/dev/null
set -a; . "$S/env"; set +a

stop() { [ -f "$S/$1.pid" ] && kill "$(cat "$S/$1.pid")" 2>/dev/null || true; rm -f "$S/$1.pid"; }
stop gateway; stop postgrest; stop gotrue

# --- GoTrue ---------------------------------------------------------------
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="postgres://postgres@127.0.0.1:$PG_PORT/postgres?search_path=auth&sslmode=disable"
export GOTRUE_DB_MIGRATIONS_PATH="$S/bin/gotrue/migrations"
export GOTRUE_DB_NAMESPACE=auth
export API_EXTERNAL_URL="http://localhost:54321/auth/v1"
export GOTRUE_SITE_URL="http://localhost:3000"
export GOTRUE_URI_ALLOW_LIST="http://*.localhost:3000/**"
export GOTRUE_API_HOST=127.0.0.1 PORT=9999
export GOTRUE_JWT_SECRET="$TS_JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_DISABLE_SIGNUP=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true
export GOTRUE_LOG_LEVEL=warn
"$S/bin/gotrue/auth" migrate >"$S/logs/gotrue-migrate.log" 2>&1 || { cat "$S/logs/gotrue-migrate.log"; exit 1; }
nohup "$S/bin/gotrue/auth" serve >"$S/logs/gotrue.log" 2>&1 & echo $! >"$S/gotrue.pid"

# --- our migrations -------------------------------------------------------
node scripts/migrate.js

# --- PostgREST ------------------------------------------------------------
cat >"$S/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:dev-authenticator@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public,platform"
db-anon-role = "anon"
db-pool = 5
jwt-secret = "$TS_JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3001
log-level = "warn"
CONF
nohup "$S/bin/postgrest" "$S/postgrest.conf" >"$S/logs/postgrest.log" 2>&1 & echo $! >"$S/postgrest.pid"

# --- gateway --------------------------------------------------------------
DEV_JWT_SECRET="$TS_JWT_SECRET" nohup node scripts/dev-stack/gateway.js >"$S/logs/gateway.log" 2>&1 & echo $! >"$S/gateway.pid"

for i in $(seq 1 50); do
  if curl -fs localhost:54321/__health >/dev/null && curl -fs localhost:54321/auth/v1/health >/dev/null && curl -fs -o /dev/null localhost:3001/; then
    echo "dev stack up · env in .dev-stack/env"; exit 0
  fi
  sleep 0.3
done
echo "dev stack did not come up; logs in $S/logs" >&2; tail -n 20 "$S"/logs/*.log >&2; exit 1
