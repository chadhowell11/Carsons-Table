#!/usr/bin/env bash
# Stops the API processes started by start.sh. Postgres is left running
# (stop it with pg_ctl -D .dev-stack/pg stop if start.sh initialised it).
cd "$(dirname "$0")/../.."
for p in gateway postgrest gotrue; do
  f=".dev-stack/$p.pid"; [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; rm -f "$f"
done
echo "stopped"
